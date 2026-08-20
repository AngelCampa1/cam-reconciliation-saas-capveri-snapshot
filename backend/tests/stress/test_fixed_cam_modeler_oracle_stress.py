"""Penny-exact oracle for the Fixed-CAM vs Traditional modeler.

``calculate_fixed_cam_model`` (fixed_cam_modeler.py:116-159) computes, per year ``i``
(0-indexed over the year-sorted inputs):

    expense_per_sf       = round(total_opex / rentable_sf, 2)
    traditional_recovery = round(total_opex * pro_rata/100, 2)
    escalated_rate       = round(rate * escalation**i, 2)            # rate-only, separate quantize
    fixed_cam_revenue    = round(rate * escalation**i * sqft, 2)     # ONE quantize, UNROUNDED escalation
    delta                = round(traditional_recovery - fixed_cam_revenue, 2)
    cumulative_delta    += delta
    total_delta          = round(Σ traditional - Σ fixed, 2)
    avg_annual_delta     = round(total_delta / year_count, 2)

with ``escalation = 1 + annual_escalation_pct/100``.

The subtle seam: ``fixed_cam_revenue`` multiplies by the UNROUNDED ``escalation**i``
(not the separately-rounded ``escalated_rate``), so ``fixed_cam_revenue`` can differ
from ``escalated_rate * sqft`` by a cent. The existing stress
(``test_fixed_cam_modeler_stress.py::test_fixed_cam_model_invariants``) asserts only
RELATIONAL identities — ``delta == traditional - fixed`` and cent-quantization and
monotonic ``escalated_rate`` — never the ABSOLUTE value of ``fixed_cam_revenue`` /
``traditional_recovery`` / the aggregates against an independent formula.

This drives the real ``calculate_fixed_cam_model`` and re-derives every money field
from the generating scalars with ``==`` (no tolerance), so the double-quantize
divergence and the aggregate rollup are pinned.

Run standalone:
    pytest tests/stress/test_fixed_cam_modeler_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.calculation.fixed_cam_modeler import (
    FixedCamModelerInput,
    FixedCamYearInput,
    calculate_fixed_cam_model,
)

STRESS = settings(max_examples=300, deadline=None)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_opex = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("50000000"), places=2, allow_nan=False
)
_sf = st.decimals(
    min_value=Decimal("1"), max_value=Decimal("5000000"), places=2, allow_nan=False
)
_rate = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("100"), places=2, allow_nan=False
)
_escal = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("15"), places=2, allow_nan=False
)
_tenant_sf = st.decimals(
    min_value=Decimal("1"), max_value=Decimal("500000"), places=2, allow_nan=False
)
_pro_rata = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("100"), places=2, allow_nan=False
)


@STRESS
@given(
    opexes=st.lists(_opex, min_size=3, max_size=5),
    rentables=st.lists(_sf, min_size=3, max_size=5),
    rate=_rate,
    escal_pct=_escal,
    tenant_sqft=_tenant_sf,
    pro_rata=_pro_rata,
)
def test_fixed_cam_model_round_trips_exactly(
    opexes, rentables, rate, escal_pct, tenant_sqft, pro_rata
):
    n = min(len(opexes), len(rentables))
    if n < 3:
        n = 3
        # pad by reusing the first element so we always have >= 3 valid years
        opexes = (opexes + [opexes[0]] * 3)[:n]
        rentables = (rentables + [rentables[0]] * 3)[:n]
    opexes, rentables = opexes[:n], rentables[:n]

    # Distinct ascending calendar years so sort order is deterministic.
    years = [
        FixedCamYearInput(
            year=2020 + j,
            total_operating_expenses=opexes[j],
            rentable_sf=rentables[j],
        )
        for j in range(n)
    ]
    result = calculate_fixed_cam_model(
        FixedCamModelerInput(
            years=years,
            fixed_cam_rate_per_sf=rate,
            annual_escalation_pct=escal_pct,
            tenant_sqft=tenant_sqft,
            pro_rata_share=pro_rata,
        )
    )

    # Independent oracle, year by year (inputs already ascending -> i == j).
    escalation = Decimal("1") + escal_pct / Decimal("100")
    pro_rata_factor = pro_rata / Decimal("100")
    total_trad = Decimal("0")
    total_fixed = Decimal("0")
    cum = Decimal("0")
    for i in range(n):
        exp_per_sf = _q(opexes[i] / rentables[i])
        traditional = _q(opexes[i] * pro_rata_factor)
        escalated_rate = _q(rate * escalation**i)
        fixed_rev = _q(rate * escalation**i * tenant_sqft)
        delta = _q(traditional - fixed_rev)
        cum += delta
        total_trad += traditional
        total_fixed += fixed_rev

        yr = result.years[i]
        assert yr.year == 2020 + i
        assert yr.expense_per_sf == exp_per_sf
        assert yr.traditional_recovery == traditional
        assert yr.escalated_rate_per_sf == escalated_rate
        assert yr.fixed_cam_revenue == fixed_rev
        assert yr.delta == delta
        assert yr.cumulative_delta == cum

    assert result.total_traditional_recovery == total_trad
    assert result.total_fixed_cam_revenue == total_fixed
    assert result.total_delta == _q(total_trad - total_fixed)
    assert result.avg_annual_delta == _q(_q(total_trad - total_fixed) / Decimal(str(n)))


def test_zero_escalation_holds_rate_flat():
    """With 0% escalation every year bills the same flat rate * sqft."""
    years = [
        FixedCamYearInput(
            year=2020 + j,
            total_operating_expenses=Decimal("100000.00"),
            rentable_sf=Decimal("50000.00"),
        )
        for j in range(3)
    ]
    result = calculate_fixed_cam_model(
        FixedCamModelerInput(
            years=years,
            fixed_cam_rate_per_sf=Decimal("8.50"),
            annual_escalation_pct=Decimal("0"),
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("20"),
        )
    )
    # rate 8.50 * 10000 sqft = 85000 every year; traditional 100000 * 20% = 20000.
    for yr in result.years:
        assert yr.fixed_cam_revenue == Decimal("85000.00")
        assert yr.traditional_recovery == Decimal("20000.00")
        assert yr.delta == Decimal("-65000.00")
    assert result.total_delta == Decimal("-195000.00")
    assert result.avg_annual_delta == Decimal("-65000.00")


def test_escalation_compounds_on_unrounded_rate():
    """Year-2 revenue compounds 1.10^2 on the raw rate, then quantizes once."""
    # rate 10.00, 10% escalation, 1000 sqft.
    # i=0: 10*1*1000 = 10000.00 ; i=1: 10*1.1*1000 = 11000.00 ;
    # i=2: 10*1.21*1000 = 12100.00.
    years = [
        FixedCamYearInput(
            year=2020 + j,
            total_operating_expenses=Decimal("0.00"),
            rentable_sf=Decimal("1000.00"),
        )
        for j in range(3)
    ]
    result = calculate_fixed_cam_model(
        FixedCamModelerInput(
            years=years,
            fixed_cam_rate_per_sf=Decimal("10.00"),
            annual_escalation_pct=Decimal("10"),
            tenant_sqft=Decimal("1000.00"),
            pro_rata_share=Decimal("0"),
        )
    )
    assert result.years[0].fixed_cam_revenue == Decimal("10000.00")
    assert result.years[1].fixed_cam_revenue == Decimal("11000.00")
    assert result.years[2].fixed_cam_revenue == Decimal("12100.00")
    assert result.years[2].escalated_rate_per_sf == Decimal("12.10")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
