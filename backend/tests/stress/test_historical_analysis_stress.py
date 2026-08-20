"""Property-based stress test for year-over-year historical analysis
(`HistoricalAnalysisService.get_year_over_year`) and the shared
`calculate_variance_level` classifier.

The year-over-year comparison drives the variance figures a landlord shows to
justify expense growth across reconciliation years. The math must be exact and
must never blow up on a $0 base year (division by zero) or on renamed pools
(fuzzy matching). Only the three DB-bound coroutines are patched out; the entire
variance + total-reconciliation + fuzzy-matching pipeline runs for real.

Invariants asserted for ANY generated multi-year pool dataset:
  * the call never raises;
  * base_year == min(years); years come back sorted ascending;
  * per pool, when base is present and non-zero and latest is present:
      variance_amount == latest - base (exact)
      variance_percent == variance_amount / base * 100 (exact, NOT quantized)
  * FIX AS-5: when base == 0 and latest != 0, variance_amount == latest and
    variance_percent == 100;
  * when base is absent/None, no variance is computed;
  * variance_level always equals calculate_variance_level(variance_percent);
  * total_amounts[year] == sum of that year's pool amounts (exact);
  * total_variance is exact when the base total is non-zero;
  * fuzzy matching is deterministic (same input -> identical result).

Run standalone:
    pytest tests/stress/test_historical_analysis_stress.py -q
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.historical_analysis import VarianceLevel
from app.services.analysis.historical_analysis import (
    HistoricalAnalysisService,
    calculate_variance_level,
)

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_ORG_ID = uuid4()
_POOL_NAMES = ["CAM", "Taxes", "Insurance", "Capital", "Utilities", "Janitorial"]


def money() -> st.SearchStrategy[Decimal]:
    return st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("10000000"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


@st.composite
def _pool_data_by_year(draw):
    """A {year: {pool_name: amount}} map for 2-4 consecutive years. Each year
    independently includes a random subset of pools, so pools may be missing in
    some years (exercises the None-variance and fuzzy-match paths)."""
    n_years = draw(st.integers(min_value=2, max_value=4))
    start = draw(st.integers(min_value=2018, max_value=2030))
    years = list(range(start, start + n_years))
    data: dict[int, dict[str, Decimal]] = {}
    for year in years:
        pools = draw(
            st.lists(st.sampled_from(_POOL_NAMES), min_size=0, max_size=6, unique=True)
        )
        data[year] = {p: draw(money()) for p in pools}
    return years, data


def _run(years, data, *, fuzzy, property_id=None):
    svc = HistoricalAnalysisService()
    property_id = property_id or uuid4()

    async def _snap(*_a, **_k):
        return {}

    async def _name(*_a, **_k):
        return "Test Property"

    async def _pools(*_a, **_k):
        return data

    async def _go():
        with (
            patch.object(HistoricalAnalysisService, "_get_snapshots_by_years", _snap),
            patch.object(HistoricalAnalysisService, "_get_property_name", _name),
            patch.object(HistoricalAnalysisService, "_extract_pool_data", _pools),
        ):
            return await svc.get_year_over_year(
                property_id=property_id,
                years=years,
                organization_id=_ORG_ID,
                use_fuzzy_matching=fuzzy,
            )

    return asyncio.run(_go())


@STRESS
@given(payload=_pool_data_by_year(), fuzzy=st.booleans())
def test_year_over_year_variance_invariants(payload, fuzzy):
    years, data = payload
    result = _run(years, data, fuzzy=fuzzy)

    base_year = min(years)
    latest_year = max(years)
    assert result.base_year == base_year
    assert result.years == sorted(years)

    for pc in result.pool_comparisons:
        base = pc.base_year_amount
        latest = pc.amounts.get(latest_year)

        if base is not None and base != Decimal("0") and latest is not None:
            assert pc.variance_amount == latest - base
            assert pc.variance_percent == (latest - base) / base * Decimal("100")
        elif (
            base is not None
            and base == Decimal("0")
            and latest is not None
            and latest != Decimal("0")
        ):
            # FIX AS-5: new category that emerged after the base year.
            assert pc.variance_amount == latest
            assert pc.variance_percent == Decimal("100")
        elif base is None:
            assert pc.variance_amount is None
            assert pc.variance_percent is None

        # The classifier is the single source of truth for the level.
        assert pc.variance_level == calculate_variance_level(pc.variance_percent)

    # Per-year totals reconcile exactly to the sum of that year's pools.
    for year in years:
        expected = sum(data.get(year, {}).values(), Decimal("0"))
        assert result.total_amounts[year] == expected

    base_total = result.total_amounts[base_year]
    latest_total = result.total_amounts[latest_year]
    if base_total != Decimal("0"):
        assert result.total_variance_amount == latest_total - base_total
        assert result.total_variance_percent == (
            latest_total - base_total
        ) / base_total * Decimal("100")


@STRESS
@given(payload=_pool_data_by_year())
def test_year_over_year_fuzzy_matching_is_deterministic(payload):
    """Fuzzy pool matching must be deterministic: identical input yields an
    identical comparison (no dict-ordering / matcher nondeterminism)."""
    years, data = payload
    pid = uuid4()
    first = _run(years, data, fuzzy=True, property_id=pid)
    second = _run(years, data, fuzzy=True, property_id=pid)
    assert first.model_dump() == second.model_dump()


@given(
    pct=st.one_of(
        st.none(),
        st.decimals(
            min_value=Decimal("-1000000"),
            max_value=Decimal("1000000"),
            places=4,
            allow_nan=False,
            allow_infinity=False,
        ),
    )
)
@settings(max_examples=300, deadline=None)
def test_variance_level_thresholds(pct):
    """calculate_variance_level depends only on |variance|, with breakpoints at
    5 and 15, and treats None as NORMAL."""
    level = calculate_variance_level(pct)
    if pct is None:
        assert level == VarianceLevel.NORMAL
        return
    mag = abs(pct)
    if mag < Decimal("5"):
        assert level == VarianceLevel.NORMAL
    elif mag < Decimal("15"):
        assert level == VarianceLevel.WARNING
    else:
        assert level == VarianceLevel.CRITICAL
    # Sign never changes the level.
    assert calculate_variance_level(-pct) == level


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
