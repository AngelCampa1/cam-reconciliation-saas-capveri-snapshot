"""Property-based stress tests for the deterministic CAM calculation engine.

Generates a large, adversarial input space with Hypothesis and asserts the
mathematical invariants that must ALWAYS hold for the pure calculation
functions (gross-up, caps, base year, expense stop, occupancy, BOMA, NOI,
and per-pool allocation). A failing case here is a real correctness bug.

Run standalone:
    pytest tests/stress/test_calc_invariants_stress.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.base_year import (
    BaseYearAdjustmentItem,
    BaseYearInput,
    calculate_base_year_increase,
)
from app.services.calculation.boma_2024 import (
    BomaCalculationInput,
    calculate_boma_2024,
)
from app.services.calculation.caps import (
    CapInput,
    CapType,
    apply_cap,
    calculate_cumulative_cap,
    calculate_cumulative_compounding_cap,
    calculate_non_cumulative_cap,
)
from app.services.calculation.expense_stop import (
    ExpenseStopInput,
    calculate_expense_stop,
)
from app.services.calculation.gross_up import (
    GrossUpConfig,
    apply_safety_valve,
    calculate_gross_up_factor,
    calculate_grossed_up_expenses,
)
from app.services.calculation.models import OccupancyInput
from app.services.calculation.noi_impact import NOIImpactInput, calculate_noi_impact
from app.services.calculation.occupancy import LeaseOccupancy, calculate_occupancy
from app.services.calculation.pool_allocation import allocate_pool_recoveries

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_CENT = Decimal("0.01")


def q(x: Decimal) -> Decimal:
    """Quantize to cents the SAME way the engine does (ROUND_HALF_UP)."""
    return x.quantize(_CENT, rounding=ROUND_HALF_UP)


def money(min_value="0", max_value="100000000"):
    return st.decimals(
        min_value=Decimal(min_value),
        max_value=Decimal(max_value),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def ratio(min_value="0", max_value="1"):
    return st.decimals(
        min_value=Decimal(min_value),
        max_value=Decimal(max_value),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    )


def cap_rate_strategy():
    # Valid commercial cap rates: 0..1.0 inclusive (engine rejects > 1.0).
    return st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("1"),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    )


# ---------------------------------------------------------------------------
# Gross-up
# ---------------------------------------------------------------------------


@STRESS
@given(actual=ratio(), target=ratio("0.0001", "1"))
def test_gross_up_factor_never_below_one(actual, target):
    cfg = GrossUpConfig(target_occupancy=target)
    factor = calculate_gross_up_factor(actual, cfg)
    assert factor >= Decimal("1.0")
    if actual >= target or actual <= 0:
        assert factor == cfg.min_factor


@STRESS
@given(amount=money("0", "10000000"), actual=ratio(), target=ratio("0.0001", "1"))
def test_grossed_up_never_below_original_and_safety_capped(amount, actual, target):
    grossed = calculate_grossed_up_expenses(amount, actual, target, apply_safety=True)
    # Never grosses DOWN.
    assert grossed >= amount - _CENT  # tolerance for 2dp rounding of a *1.0 factor
    # Safety valve: never exceeds the 100%-occupancy equivalent.
    if actual > Decimal("0.0001"):
        max_at_full = amount / actual
        assert grossed <= max_at_full + _CENT


@STRESS
@given(amount=money("0", "10000000"), actual=ratio(), target=ratio("0.0001", "1"))
def test_safety_valve_idempotent(amount, actual, target):
    grossed = calculate_grossed_up_expenses(amount, actual, target, apply_safety=True)
    again = apply_safety_valve(amount, grossed, actual, target)
    assert again == grossed


# ---------------------------------------------------------------------------
# Caps
# ---------------------------------------------------------------------------


def _assert_cap_result(res, current):
    assert res.original_amount == current
    assert res.capped_amount <= current + _CENT
    assert res.savings_from_cap >= 0
    assert res.cap_headroom >= 0
    # savings == original - capped (within rounding)
    assert (
        abs(res.savings_from_cap - (res.original_amount - res.capped_amount)) <= _CENT
    )
    # cap_applied iff capped < original
    assert res.cap_applied == (res.capped_amount < res.original_amount)
    if res.cap_applied:
        assert res.cap_headroom == 0


@STRESS
@given(
    current=money("0", "10000000"),
    prior=st.one_of(st.none(), money("0", "10000000")),
    rate=cap_rate_strategy(),
)
def test_non_cumulative_cap_invariants(current, prior, rate):
    res = calculate_non_cumulative_cap(current, prior, cap_rate=rate)
    _assert_cap_result(res, current)
    # Year 1 / zero prior => no cap.
    if prior is None or prior == 0:
        assert not res.cap_applied
        assert res.capped_amount == current


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "10000000"),
    rate=cap_rate_strategy(),
    priors=st.lists(money("0", "10000000"), min_size=0, max_size=8),
)
def test_cumulative_cap_invariants(current, base, rate, priors):
    res = calculate_cumulative_cap(
        current,
        base,
        cap_rate=rate,
        years_since_base=len(priors) + 1,
        prior_year_amounts=priors,
    )
    _assert_cap_result(res, current)


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "10000000"),
    rate=cap_rate_strategy(),
    priors=st.lists(money("0", "10000000"), min_size=0, max_size=8),
)
def test_cumulative_compounding_cap_invariants(current, base, rate, priors):
    res = calculate_cumulative_compounding_cap(
        current,
        base,
        cap_rate=rate,
        years_since_base=len(priors) + 1,
        prior_year_amounts=priors,
    )
    _assert_cap_result(res, current)


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "10000000"),
    rate=cap_rate_strategy(),
)
def test_compounding_cap_year1_anchors_to_base(current, base, rate):
    """Year 1 (no priors) compounding cap ceiling == base*(1+rate)^1, no bank.

    NOTE: a cross-type "compounding >= linear" invariant does NOT hold: the
    linear ``calculate_cumulative_cap`` anchors its ceiling to the *prior actual*
    (max = prior_actual + annual_increase + bank) while the compounding variant
    anchors to *base* (base*(1+r)^N). With high prior actuals the linear ceiling
    can exceed the compounding one — they are different cap models, not
    comparable. See LEDGER OBS-S01.
    """
    assume(rate > 0)
    comp = calculate_cumulative_compounding_cap(
        current, base, cap_rate=rate, years_since_base=1, prior_year_amounts=[]
    )
    expected_max = q(base * (Decimal("1") + rate))
    # Capped to ceiling when over, else passes through.
    if current > expected_max:
        assert comp.cap_applied
        assert comp.capped_amount == expected_max
    else:
        assert not comp.cap_applied
        assert comp.capped_amount == q(current)


@STRESS
@given(
    cap_type=st.sampled_from(
        [
            CapType.NONE,
            CapType.NON_CUMULATIVE,
            CapType.CUMULATIVE,
            CapType.CUMULATIVE_COMPOUNDING,
        ]
    ),
    current=money("0", "10000000"),
    prior=st.one_of(st.none(), money("0", "10000000")),
    base=money("0.01", "10000000"),
    rate=cap_rate_strategy(),
    priors=st.lists(money("0", "10000000"), min_size=0, max_size=6),
)
def test_apply_cap_router_invariants(cap_type, current, prior, base, rate, priors):
    res = apply_cap(
        CapInput(
            cap_type=cap_type,
            current_year_amount=current,
            prior_year_amount=prior,
            base_year_amount=base,
            cap_rate=rate,
            all_prior_amounts=priors,
        )
    )
    _assert_cap_result(res, current)
    if cap_type == CapType.NONE:
        assert res.capped_amount == current
        assert not res.cap_applied


# ---------------------------------------------------------------------------
# Base year
# ---------------------------------------------------------------------------


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0", "10000000"),
    share=ratio(),
    adjustments=st.lists(money("0", "1000000"), min_size=0, max_size=5),
)
def test_base_year_invariants(current, base, share, adjustments):
    items = [
        BaseYearAdjustmentItem(
            service_name=f"svc-{i}",
            imputed_amount=a,
            justification="introduced after base",
        )
        for i, a in enumerate(adjustments)
    ]
    res = calculate_base_year_increase(
        BaseYearInput(
            current_year_expenses=current,
            base_year_amount=base,
            pro_rata_share=share,
            base_year_adjustments=items,
        )
    )
    expected_adj_base = base + sum(adjustments, Decimal("0"))
    assert res.adjusted_base_year_amount == expected_adj_base
    assert res.tenant_share >= 0  # never a credit to the tenant
    assert res.is_under_base == (current < expected_adj_base)
    expected_increase = current - expected_adj_base
    expected_share = q(max(Decimal("0"), expected_increase) * share)
    assert res.tenant_share == expected_share


# ---------------------------------------------------------------------------
# Expense stop
# ---------------------------------------------------------------------------


@STRESS
@given(
    pool=money("0", "10000000"),
    stop=money("0", "1000"),
    sqft=money("0", "1000000"),
    share=ratio(),
)
def test_expense_stop_invariants(pool, stop, sqft, share):
    res = calculate_expense_stop(
        ExpenseStopInput(
            pool_amount=pool, stop_per_sqft=stop, tenant_sqft=sqft, pro_rata_share=share
        )
    )
    assert res.threshold == q(stop * sqft)
    assert res.tenant_share_before_stop == q(pool * share)
    assert res.above_stop >= 0
    expected_above = max(Decimal("0"), res.tenant_share_before_stop - res.threshold)
    assert res.above_stop == q(expected_above)
    assert res.above_stop <= res.tenant_share_before_stop + _CENT


# ---------------------------------------------------------------------------
# Occupancy
# ---------------------------------------------------------------------------

_BASE = date(2024, 1, 1)


@st.composite
def lease_strategy(draw):
    start_off = draw(st.integers(min_value=-400, max_value=400))
    length = draw(st.integers(min_value=0, max_value=500))
    sqft = draw(money("0", "100000"))
    return LeaseOccupancy(
        lease_id="L",
        tenant_name="T",
        sqft=sqft,
        start_date=_BASE + timedelta(days=start_off),
        end_date=_BASE + timedelta(days=start_off + length),
    )


@STRESS
@given(
    leases=st.lists(lease_strategy(), min_size=0, max_size=12),
    total=money("1", "5000000"),
    period_len=st.integers(min_value=0, max_value=365),
)
def test_occupancy_bounds(leases, total, period_len):
    res = calculate_occupancy(
        OccupancyInput(
            property_id="00000000-0000-0000-0000-000000000001",
            period_start=_BASE,
            period_end=_BASE + timedelta(days=period_len),
            total_rentable_sqft=total,
        ),
        leases,
    )
    assert Decimal("0") <= res.occupancy_rate <= Decimal("1.0")
    assert res.vacancy_sqft >= 0


# ---------------------------------------------------------------------------
# BOMA 2024
# ---------------------------------------------------------------------------


@STRESS
@given(
    usable=money("100", "1000000"),
    extra_rentable=money("0", "500000"),
    balcony=money("0", "100000"),
    terrace=money("0", "100000"),
    amenity=money("0", "100000"),
    rent=money("1", "500"),
    cap=st.decimals(
        min_value=Decimal("0.01"),
        max_value=Decimal("1"),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_boma_invariants(usable, extra_rentable, balcony, terrace, amenity, rent, cap):
    # rentable must be >= usable for a valid load factor (>= 1.0).
    rentable = usable + extra_rentable
    res = calculate_boma_2024(
        BomaCalculationInput(
            usable_sf=usable,
            rentable_sf=rentable,
            balcony_sf=balcony,
            terrace_sf=terrace,
            outdoor_amenity_sf=amenity,
            annual_rent_per_sf=rent,
            cap_rate=cap,
        )
    )
    assert res.load_factor >= Decimal("1.0")
    assert res.hidden_sf >= 0
    # new_rentable_sf = new_usable_sf * load_factor, where load_factor is
    # quantized to 4dp. With no outdoor additions it should reproduce rentable,
    # but the 4dp load-factor rounding loses up to (new_usable_sf * 5e-5) SF.
    # The engine errs conservatively (under-reports, never over-bills), so we
    # only require new_rentable_sf within that rounding band of rentable.
    lf_tolerance = (res.new_usable_sf * Decimal("0.00005")).quantize(_CENT) + _CENT
    assert res.new_rentable_sf >= rentable - lf_tolerance
    assert res.revenue_lift >= 0
    assert res.asset_value_lift >= 0


# ---------------------------------------------------------------------------
# NOI impact
# ---------------------------------------------------------------------------


@STRESS
@given(
    recovery=money("0", "50000000"),
    cap=st.decimals(
        min_value=Decimal("0.01"),
        max_value=Decimal("0.25"),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_noi_invariants(recovery, cap):
    res = calculate_noi_impact(NOIImpactInput(recovery_amount=recovery, cap_rate=cap))
    assert res.noi_lift == q(recovery)
    expected = q(recovery / cap)
    assert res.asset_value_lift == expected
    # Lower cap rate => higher value lift (monotonic), checked indirectly:
    assert res.asset_value_lift >= res.noi_lift - _CENT


# ---------------------------------------------------------------------------
# Pool allocation — the sum invariants (must reconcile to the cent)
# ---------------------------------------------------------------------------


@st.composite
def pool_alloc_inputs(draw):
    n = draw(st.integers(min_value=1, max_value=8))
    names = [f"pool_{i}" for i in range(n)]
    amounts = {name: draw(money("0", "5000000")) for name in names}
    before = draw(money("0", "5000000"))
    # after <= before (cap only reduces)
    after = draw(
        st.decimals(
            min_value=Decimal("0"),
            max_value=before,
            places=2,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    admin = draw(money("0", "1000000"))
    cap_exempt = set(
        draw(st.lists(st.sampled_from(names), min_size=0, max_size=n, unique=True))
    )
    fee_excluded = set(
        draw(st.lists(st.sampled_from(names), min_size=0, max_size=n, unique=True))
    )
    return amounts, cap_exempt, fee_excluded, before, after, admin


@STRESS
@given(data=pool_alloc_inputs())
def test_pool_allocation_sum_invariants(data):
    amounts, cap_exempt, fee_excluded, before, after, admin = data
    pools = allocate_pool_recoveries(
        recoverable_by_pool=amounts,
        cap_exempt_pools=cap_exempt,
        admin_fee_excluded_pools=fee_excluded,
        tenant_share_before_cap=before,
        tenant_share_after_cap=after,
        admin_fee=admin,
    )
    if not pools:
        # Degenerate: every pool contributes zero.
        assert sum(amounts.values(), Decimal("0")) == 0
        return
    sum_before = sum((p.share_before_cap for p in pools), Decimal("0"))
    sum_after = sum((p.share_after_cap for p in pools), Decimal("0"))
    sum_admin = sum((p.admin_fee for p in pools), Decimal("0"))
    sum_total = sum((p.total_recovery for p in pools), Decimal("0"))
    assert sum_before == before.quantize(_CENT)
    assert sum_after == after.quantize(_CENT)
    assert sum_admin == admin.quantize(_CENT)
    assert sum_total == (after + admin).quantize(_CENT)
    for p in pools:
        assert p.cap_adjustment <= _CENT  # <= 0 (tolerance)
        assert p.total_recovery == (p.share_after_cap + p.admin_fee).quantize(_CENT)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
