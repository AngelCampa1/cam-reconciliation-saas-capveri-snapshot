"""Property-based stress for the full ``calculate_full_gross_up`` orchestrator.

``calculate_full_gross_up`` (calculation/gross_up_orchestrator.py) chains four
sub-calculations into the end-to-end gross-up workflow: weighted-average
occupancy → variable/fixed expense filtering → gross-up factor + safety valve →
recombination. Cycles covering the sub-steps (occupancy, expense_filter,
gross_up) already exist; this harness pins the *cross-step* contract of the
orchestrator and independently re-derives the grossed-up figure, the factor, and
the ``safety_valve_applied`` indicator from the published occupancy/inputs.

Universal invariants (any input):
  * total_operating_expenses == variable_expenses + fixed_expenses (exact);
  * total_after_gross_up == grossed_up_variable + fixed_expenses (exact);
  * variable_expenses == sum of gross-up-applicable pools (exact);
  * fixed_expenses == sum of non-applicable pools (exact);
  * gross_up_factor >= 1;
  * occupancy in [0, 1]; occupied_sqft, vacant_sqft >= 0.

Independent re-derivation (from the published actual_occupancy + target):
  * gross_up_factor == floor_1(quantize(target/occ, 4dp)) for occ > 0, else 1.0;
  * grossed_up_variable == the factor-then-safety-valve pipeline recomputed
    here from scratch;
  * safety_valve_applied is True iff the post-valve amount is strictly below the
    pre-valve (factor-only) amount — i.e. only when the valve actually capped.

Regression (product bug #18):
  * a large positive variable pool at low occupancy must NOT report
    safety_valve_applied=True when the grossed-up amount stays under the 100%
    occupancy equivalent (the valve never fired). The pre-fix code compared
    against an unquantized target/occupancy ratio and false-positived.

Run standalone:
    pytest tests/stress/test_gross_up_orchestrator_stress.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID, uuid4

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.gross_up_orchestrator import (
    GrossUpInput,
    calculate_full_gross_up,
)
from app.services.calculation.occupancy import LeaseOccupancy

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

PERIOD_START = date(2024, 1, 1)
PERIOD_END = date(2024, 12, 31)
TOTAL_SQFT = Decimal("1000000")

money = st.decimals(
    min_value=Decimal("-200000"),
    max_value=Decimal("2000000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)
sqft = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1500000"), places=2, allow_nan=False
)
target = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)


def _derive_factor(occ: Decimal, tgt: Decimal) -> Decimal:
    """Re-derive the quantized gross-up factor the pipeline uses."""
    if occ <= 0:
        return Decimal("1.0")
    if occ >= tgt:
        return Decimal("1.0")
    factor = (tgt / occ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return max(factor, Decimal("1.0"))


def _derive_grossed_up(original: Decimal, occ: Decimal, tgt: Decimal) -> Decimal:
    """Re-derive grossed_up_variable: factor application then safety valve."""
    factor = _derive_factor(occ, tgt)
    grossed_pre = (original * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    # Safety valve: cannot divide by zero/near-zero occupancy -> return raw original.
    if occ <= Decimal("0.0001"):
        return original
    max_at_full = (original / occ).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    if grossed_pre > max_at_full:
        return max_at_full
    return grossed_pre


@st.composite
def _scenario(draw):
    # Up to 5 pools, each either gross-up-applicable or fixed.
    n = draw(st.integers(min_value=0, max_value=5))
    pools: dict[UUID, ExpensePoolSummary] = {}
    for i in range(n):
        pid = uuid4()
        pools[pid] = ExpensePoolSummary(
            pool_id=pid,
            pool_name=f"pool{i}",
            pool_type=draw(
                st.sampled_from(["operating", "tax", "utility", "insurance"])
            ),
            total_amount=draw(money),
            is_gross_up_applicable=draw(st.booleans()),
        )

    # A handful of leases; sqft non-negative so occupied_sqft stays >= 0.
    n_leases = draw(st.integers(min_value=0, max_value=4))
    leases = []
    for j in range(n_leases):
        s_off = draw(st.integers(min_value=-30, max_value=400))
        length = draw(st.integers(min_value=0, max_value=420))
        start = PERIOD_START + timedelta(days=s_off)
        end = start + timedelta(days=length)
        leases.append(
            LeaseOccupancy(
                lease_id=f"L{j}",
                tenant_name=f"T{j}",
                sqft=draw(sqft),
                start_date=start,
                end_date=end,
            )
        )

    inp = GrossUpInput(
        property_id=uuid4(),
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        total_rentable_sqft=TOTAL_SQFT,
        target_occupancy=draw(target),
    )
    return inp, leases, pools


@STRESS
@given(scenario=_scenario())
def test_orchestrator_invariants_and_rederivation(scenario):
    inp, leases, pools = scenario
    r = calculate_full_gross_up(inp, leases, pools)

    # Independent pool categorization.
    expected_variable = sum(
        (p.total_amount for p in pools.values() if p.is_gross_up_applicable),
        Decimal("0"),
    )
    expected_fixed = sum(
        (p.total_amount for p in pools.values() if not p.is_gross_up_applicable),
        Decimal("0"),
    )
    assert r.variable_expenses == expected_variable
    assert r.fixed_expenses == expected_fixed

    # Conservation identities (exact).
    assert r.total_operating_expenses == r.variable_expenses + r.fixed_expenses
    assert r.total_after_gross_up == r.grossed_up_variable + r.fixed_expenses

    # Occupancy / sqft bounds.
    assert Decimal("0") <= r.actual_occupancy <= Decimal("1")
    assert r.occupied_sqft >= 0
    assert r.vacant_sqft >= 0
    assert r.gross_up_factor >= Decimal("1")

    # Factor re-derivation from the published occupancy.
    assert r.gross_up_factor == _derive_factor(r.actual_occupancy, inp.target_occupancy)

    # Grossed-up variable re-derivation (factor + safety valve).
    expected_grossed = _derive_grossed_up(
        r.variable_expenses, r.actual_occupancy, inp.target_occupancy
    )
    assert r.grossed_up_variable == expected_grossed

    # safety_valve_applied is True only when the valve actually reduced the
    # amount below the pre-valve (factor-only) figure.
    pre_valve = (r.variable_expenses * r.gross_up_factor).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if r.actual_occupancy > 0:
        expected_flag = r.grossed_up_variable < pre_valve
    else:
        expected_flag = r.grossed_up_variable < r.variable_expenses
    assert r.safety_valve_applied == expected_flag


def test_safety_valve_flag_no_false_positive_on_large_pool():
    # Regression for product bug #18: a $100k variable pool at 7% occupancy is
    # grossed up by 13.5714x to $1,357,140 — comfortably under the $1,428,571
    # 100%-occupancy equivalent — so the safety valve never fires. The flag must
    # be False. (Pre-fix it compared a 4dp-quantized-factor result against an
    # unquantized target/occupancy expectation and reported True.)
    pid = uuid4()
    leases = [
        LeaseOccupancy(
            lease_id="L1",
            tenant_name="T",
            sqft=Decimal("70000"),
            start_date=PERIOD_START,
            end_date=PERIOD_END,
        )
    ]
    poolid = uuid4()
    pools = {
        poolid: ExpensePoolSummary(
            pool_id=poolid,
            pool_name="Operating",
            pool_type="operating",
            total_amount=Decimal("100000.00"),
            is_gross_up_applicable=True,
        )
    }
    r = calculate_full_gross_up(
        GrossUpInput(
            property_id=pid,
            period_start=PERIOD_START,
            period_end=PERIOD_END,
            total_rentable_sqft=TOTAL_SQFT,
            target_occupancy=Decimal("0.95"),
        ),
        leases,
        pools,
    )
    assert r.actual_occupancy == Decimal("0.0700")
    assert r.gross_up_factor == Decimal("13.5714")
    assert r.grossed_up_variable == Decimal("1357140.00")
    assert r.safety_valve_applied is False


def test_known_full_gross_up_at_target():
    # Occupancy exactly at target (95%) -> factor 1.0, no gross-up. One $50k
    # variable pool + one $20k fixed (tax) pool.
    pid = uuid4()
    leases = [
        LeaseOccupancy(
            lease_id="L1",
            tenant_name="T",
            sqft=Decimal("950000"),
            start_date=PERIOD_START,
            end_date=PERIOD_END,
        )
    ]
    var_id, fix_id = uuid4(), uuid4()
    pools = {
        var_id: ExpensePoolSummary(
            pool_id=var_id,
            pool_name="Operating",
            pool_type="operating",
            total_amount=Decimal("50000.00"),
            is_gross_up_applicable=True,
        ),
        fix_id: ExpensePoolSummary(
            pool_id=fix_id,
            pool_name="Taxes",
            pool_type="tax",
            total_amount=Decimal("20000.00"),
            is_gross_up_applicable=False,
        ),
    }
    r = calculate_full_gross_up(
        GrossUpInput(
            property_id=pid,
            period_start=PERIOD_START,
            period_end=PERIOD_END,
            total_rentable_sqft=TOTAL_SQFT,
            target_occupancy=Decimal("0.95"),
        ),
        leases,
        pools,
    )
    assert r.actual_occupancy == Decimal("0.9500")
    assert r.gross_up_factor == Decimal("1.0000")
    assert r.grossed_up_variable == Decimal("50000.00")
    assert r.fixed_expenses == Decimal("20000.00")
    assert r.total_after_gross_up == Decimal("70000.00")
    assert r.safety_valve_applied is False


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
