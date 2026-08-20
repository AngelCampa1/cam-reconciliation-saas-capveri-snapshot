"""Property-based stress test for the deterministic anomaly-detection core
(`AnomalyDetectionService` variance + category detectors and the dedup/rank
step).

These detectors flag expense spikes/drops and new/missing categories that a
landlord surfaces to a tenant during a CAM audit. The variance math divides by
a prior-year average, so a zero or net-credit baseline is the obvious blow-up
risk; the severity thresholds must not overlap; and the dedup/rank step must
produce a clean, stable ordering. The statistical detectors (Isolation Forest,
ARIMA) are intentionally out of scope here — they are non-deterministic and not
amenable to exact invariants.

All three methods are pure (dict in, list out), so no DB or patching is needed.

Invariants asserted for ANY generated {pool: {year: amount}} dataset:
  * detectors never raise (incl. zero / net-credit baselines);
  * variance anomalies: emitted only when prior years exist, avg != 0, and
    |variance| >= warning threshold; expected_value == prior mean; variance is
    exact; SPIKE iff variance > 0 else DROP; severity matches the thresholds and
    is never INFO;
  * category anomalies: NEW_CATEGORY (INFO, +100%) iff present-now / absent-prior,
    MISSING_CATEGORY (WARNING, -100%) iff absent-now / present-prior;
  * dedup/rank: output keys unique by (pool, type), severity rank
    non-decreasing, output is a subset of the input, and the op is idempotent.

Run standalone:
    pytest tests/stress/test_anomaly_detection_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.analysis.anomaly_detection import (
    AnomalyDetectionService,
    AnomalySeverity,
    AnomalyType,
    DetectedAnomaly,
)

SETTINGS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_SEVERITY_RANK = {
    AnomalySeverity.CRITICAL: 0,
    AnomalySeverity.WARNING: 1,
    AnomalySeverity.INFO: 2,
}

_POOLS = ["CAM", "Taxes", "Insurance", "Capital", "Utilities"]
_YEARS = [2020, 2021, 2022, 2023, 2024]


def money() -> st.SearchStrategy[Decimal]:
    # Includes net credits (negative) to stress the average / variance paths.
    return st.decimals(
        min_value=Decimal("-100000"),
        max_value=Decimal("5000000"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


@st.composite
def _expense_data(draw):
    """A {pool_name: {year: amount}} map plus a target year."""
    data: dict[str, dict[int, Decimal]] = {}
    pools = draw(st.lists(st.sampled_from(_POOLS), min_size=1, max_size=5, unique=True))
    for pool in pools:
        years = draw(
            st.lists(st.sampled_from(_YEARS), min_size=0, max_size=5, unique=True)
        )
        data[pool] = {y: draw(money()) for y in years}
    target_year = draw(st.sampled_from(_YEARS))
    return data, target_year


@SETTINGS
@given(payload=_expense_data())
def test_variance_anomaly_invariants(payload):
    data, target_year = payload
    svc = AnomalyDetectionService()
    anomalies = svc._detect_variance_anomalies(data, target_year)

    warn = svc.config.warning_threshold
    crit = svc.config.critical_threshold

    seen_pools = set()
    for a in anomalies:
        seen_pools.add(a.pool_name)
        year_data = data[a.pool_name]
        prior = [v for y, v in year_data.items() if y < target_year]
        avg = sum(prior) / Decimal(len(prior))

        assert a.current_value == year_data[target_year]
        assert a.expected_value == avg
        variance = (year_data[target_year] - avg) / avg
        assert a.variance_percent == variance * 100
        assert a.anomaly_type == (
            AnomalyType.SPIKE if variance > 0 else AnomalyType.DROP
        )
        # Only WARNING/CRITICAL come from variance; thresholds must not overlap.
        if abs(variance) >= crit:
            assert a.severity == AnomalySeverity.CRITICAL
        else:
            assert abs(variance) >= warn
            assert a.severity == AnomalySeverity.WARNING
        assert a.severity != AnomalySeverity.INFO

    # A pool with no prior data or a zero average must never produce an anomaly.
    for pool, year_data in data.items():
        if target_year not in year_data:
            continue
        prior = [v for y, v in year_data.items() if y < target_year]
        if not prior or sum(prior) / Decimal(len(prior)) == 0:
            assert pool not in seen_pools or all(a.pool_name != pool for a in anomalies)


@SETTINGS
@given(payload=_expense_data())
def test_category_change_invariants(payload):
    data, target_year = payload
    svc = AnomalyDetectionService()
    anomalies = svc._detect_category_changes(data, target_year)

    for a in anomalies:
        assert a.anomaly_type in (
            AnomalyType.NEW_CATEGORY,
            AnomalyType.MISSING_CATEGORY,
        )
        year_data = data[a.pool_name]
        prior_years = [y for y in year_data if y < target_year]
        has_target = target_year in year_data and year_data[target_year] > 0
        has_prior = any(year_data.get(y, Decimal("0")) > 0 for y in prior_years)

        if a.anomaly_type == AnomalyType.NEW_CATEGORY:
            assert has_target and not has_prior
            assert a.severity == AnomalySeverity.INFO
            assert a.variance_percent == Decimal("100")
            assert a.current_value == year_data[target_year]
        else:  # MISSING_CATEGORY
            assert has_prior and not has_target
            assert a.severity == AnomalySeverity.WARNING
            assert a.variance_percent == Decimal("-100")
            assert a.current_value == Decimal("0")
            expected = sum(
                year_data.get(y, Decimal("0")) for y in prior_years
            ) / Decimal(len(prior_years))
            assert a.expected_value == expected


def _anomaly(
    pool: str, atype: AnomalyType, severity: AnomalySeverity
) -> DetectedAnomaly:
    return DetectedAnomaly(
        pool_name=pool,
        anomaly_type=atype,
        severity=severity,
        current_value=Decimal("1"),
        expected_value=Decimal("1"),
        variance_percent=Decimal("0"),
        explanation="x",
        years_affected=[2024],
    )


@SETTINGS
@given(
    items=st.lists(
        st.tuples(
            st.sampled_from(_POOLS),
            st.sampled_from(list(AnomalyType)),
            st.sampled_from(list(AnomalySeverity)),
        ),
        max_size=20,
    )
)
def test_deduplicate_and_rank_invariants(items):
    svc = AnomalyDetectionService()
    anomalies = [_anomaly(p, t, s) for p, t, s in items]
    ranked = svc._deduplicate_and_rank(anomalies)

    # Keys are unique by (pool, type).
    keys = [(a.pool_name, a.anomaly_type) for a in ranked]
    assert len(keys) == len(set(keys))

    # Severity rank is non-decreasing (critical first).
    ranks = [_SEVERITY_RANK[a.severity] for a in ranked]
    assert ranks == sorted(ranks)

    # Output is drawn from the input (no fabricated anomalies) and never grows.
    assert len(ranked) <= len(anomalies)
    assert all(a in anomalies for a in ranked)

    # Idempotent.
    again = svc._deduplicate_and_rank(ranked)
    assert [(a.pool_name, a.anomaly_type, a.severity) for a in again] == [
        (a.pool_name, a.anomaly_type, a.severity) for a in ranked
    ]


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
