"""Property-based stress for the Fixed CAM vs Traditional modeler.

``calculate_fixed_cam_model`` compares year-by-year recovery under traditional
CAM reconciliation vs. a flat $/SF Fixed CAM structure with an annual escalator.
It computes per-year deltas two ways (running ``cumulative_delta`` vs. an
aggregate ``total_delta``) and compounds the escalator with ``rate ** i``. The
example suite covers named scenarios; this harness fuzzes the full valid input
space and asserts the cross-checks that must agree for every model, so a
refactor of the escalation or aggregation cannot drift the two delta paths apart.

Invariants:
  * exactly one result per input year, emitted in ascending year order;
  * every money field is cent-quantized; recoveries/revenue are non-negative;
  * per-year ``delta == traditional_recovery - fixed_cam_revenue`` exactly;
  * ``cumulative_delta`` is the running sum of per-year deltas;
  * the escalated $/SF rate is non-decreasing across years (escalator >= 1);
  * **the two independent aggregate paths agree**: ``total_delta`` equals the
    final ``cumulative_delta``, and ``total_delta == total_traditional -
    total_fixed`` exactly;
  * ``avg_annual_delta == (total_delta / year_count)`` cent-rounded.

Run standalone:
    pytest tests/stress/test_fixed_cam_modeler_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.fixed_cam_modeler import (
    FixedCamModelerInput,
    FixedCamYearInput,
    calculate_fixed_cam_model,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

CENT = Decimal("0.01")


def _dec(min_value, max_value, places=2):
    return st.decimals(
        min_value=Decimal(min_value),
        max_value=Decimal(max_value),
        places=places,
        allow_nan=False,
        allow_infinity=False,
    )


@st.composite
def modeler_input(draw):
    year_count = draw(st.integers(min_value=3, max_value=5))
    # Distinct calendar years (order is shuffled; the modeler must sort them).
    start = draw(st.integers(min_value=2000, max_value=2050))
    base_years = list(range(start, start + year_count))
    years_order = draw(st.permutations(base_years))
    year_inputs = [
        FixedCamYearInput(
            year=y,
            total_operating_expenses=draw(_dec("0", "50000000")),
            rentable_sf=draw(_dec("1", "2000000")),
        )
        for y in years_order
    ]
    return FixedCamModelerInput(
        years=year_inputs,
        fixed_cam_rate_per_sf=draw(_dec("0.01", "100")),
        annual_escalation_pct=draw(_dec("0", "15")),
        tenant_sqft=draw(_dec("1", "500000")),
        pro_rata_share=draw(_dec("0", "100")),
    )


@STRESS
@given(inp=modeler_input())
def test_fixed_cam_model_invariants(inp):
    result = calculate_fixed_cam_model(inp)

    # One result per year, emitted in ascending year order.
    assert len(result.years) == len(inp.years)
    out_years = [y.year for y in result.years]
    assert out_years == sorted(out_years)

    running = Decimal("0")
    prev_rate = None
    for y in result.years:
        for field in (
            y.expense_per_sf,
            y.traditional_recovery,
            y.fixed_cam_revenue,
            y.delta,
            y.cumulative_delta,
            y.escalated_rate_per_sf,
        ):
            assert field % CENT == 0

        # Recoveries and revenue can never go negative for valid inputs.
        assert y.expense_per_sf >= 0
        assert y.traditional_recovery >= 0
        assert y.fixed_cam_revenue >= 0

        # Per-year delta definition holds exactly (both operands cent-quantized).
        assert y.delta == y.traditional_recovery - y.fixed_cam_revenue

        # cumulative_delta is the running sum of per-year deltas.
        running += y.delta
        assert y.cumulative_delta == running

        # The escalated rate compounds (escalator >= 1) → never decreases.
        if prev_rate is not None:
            assert y.escalated_rate_per_sf >= prev_rate
        prev_rate = y.escalated_rate_per_sf

    # The two independent aggregate paths must agree.
    assert result.total_delta == result.years[-1].cumulative_delta
    assert (
        result.total_delta
        == result.total_traditional_recovery - result.total_fixed_cam_revenue
    )

    # avg_annual_delta is the cent-rounded mean of the total delta.
    expected_avg = (result.total_delta / Decimal(len(result.years))).quantize(
        CENT, rounding=ROUND_HALF_UP
    )
    assert result.avg_annual_delta == expected_avg


@STRESS
@given(
    inp=modeler_input(),
    bad_count=st.sampled_from([0, 1, 2, 6, 7]),
)
def test_year_count_outside_3_to_5_rejected(inp, bad_count):
    """The modeler only accepts 3–5 years; anything else is a ValueError."""
    base = inp.years[0]
    years = [
        FixedCamYearInput(
            year=2000 + i,
            total_operating_expenses=base.total_operating_expenses,
            rentable_sf=base.rentable_sf,
        )
        for i in range(bad_count)
    ]
    bad = inp.model_copy(update={"years": years})
    with pytest.raises(ValueError):
        calculate_fixed_cam_model(bad)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
