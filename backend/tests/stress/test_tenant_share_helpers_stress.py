"""Property-based stress for tenant-share reduction + management-fee-cap helpers.

These two private helpers in ``calculation/tenant_share.py`` sit *upstream* of the
whole recovery calculation, so a defect here silently corrupts every downstream
number:

  * ``_reduce_pools_to_cap`` scales a set of pools down so they sum to exactly a
    cap, distributing the reduction pro-rata. It must conserve the cap to the cent
    AND never drive a pool negative — a naive "last pool absorbs the remainder"
    split drove the last pool to -$0.01 when earlier pro-rata roundings
    accumulated past the cap (Cycle 51, product bug #16; fixed via largest-
    remainder cent allocation).
  * ``_apply_management_fee_cap`` caps the recoverable management-fee pool at
    ``rate * operating_base_excluding_the_fee`` (fee-on-fee circularity guard) and
    returns the non-recoverable excess. It must never mutate its inputs and must
    skip safely when pool classification is unavailable.

Invariants:
  * reduce: matched pools sum to exactly the cap; every pool ≥ 0; pools outside
    the set untouched; no-op when matched total ≤ cap or ≤ 0;
  * mgmt-cap: excess == max(0, booked_fee - max(0, round(rate*base_excl_fee,2)));
    inputs not mutated; rate 0 / None, missing pool_types, or no fee pool ⇒
    (unchanged, 0); when reduced, the fee pool(s) sum to the cap.

Run standalone:
    pytest tests/stress/test_tenant_share_helpers_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.models import CalculationTrace
from app.services.calculation.tenant_share import (
    _apply_management_fee_cap,
    _reduce_pools_to_cap,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1000000"), places=2, allow_nan=False
)
rates = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2"), places=4, allow_nan=False
)


def _trace() -> CalculationTrace:
    return CalculationTrace(
        calculation_type="tenant_share",
        property_id=UUID(int=0),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
    )


@st.composite
def _pool_map(draw, min_size=1, max_size=8):
    names = draw(
        st.lists(
            st.text(
                alphabet=st.characters(min_codepoint=97, max_codepoint=122),
                min_size=1,
                max_size=6,
            ),
            min_size=min_size,
            max_size=max_size,
            unique=True,
        )
    )
    return {n: draw(money) for n in names}


@STRESS
@given(breakdown=_pool_map(), cap=money, frac=st.floats(0, 1))
def test_reduce_conserves_cap_and_stays_non_negative(breakdown, cap, frac):
    names = list(breakdown.keys())
    # Choose a sub-set of the pools to reduce (the rest must be untouched).
    cut = int(frac * len(names))
    target = set(names[: max(1, cut)]) if names else set()

    before = dict(breakdown)
    present = [n for n in sorted(target) if n in breakdown]
    matched_total = sum((breakdown[n] for n in present), Decimal("0"))

    _reduce_pools_to_cap(breakdown, target, cap)

    # Pools outside the target set are never touched.
    for n in names:
        if n not in target:
            assert breakdown[n] == before[n]

    if not present or matched_total <= cap or matched_total <= 0:
        # No-op: matched pools unchanged.
        for n in present:
            assert breakdown[n] == before[n]
    else:
        # Conservation to the cent + non-negativity (product bug #16 fix).
        assert sum((breakdown[n] for n in present), Decimal("0")) == cap
        for n in present:
            assert breakdown[n] >= 0


@STRESS
@given(
    operating=money,
    fee=money,
    other=money,
    rate=rates,
    use_types=st.booleans(),
    name_fee=st.booleans(),
)
def test_management_fee_cap_excess_and_no_mutation(
    operating, fee, other, rate, use_types, name_fee
):
    fee_name = "Management Fee" if name_fee else "office costs"
    breakdown = {
        fee_name: fee,
        "cam operating": operating,
        "real estate taxes": other,
    }
    pool_types = (
        {
            fee_name: "operating",
            "cam operating": "operating",
            "real estate taxes": "tax",
        }
        if use_types
        else None
    )
    snapshot = dict(breakdown)

    adjusted, adjusted_orig, excess = _apply_management_fee_cap(
        pool_breakdown=breakdown,
        original_pool_breakdown=None,
        pool_types=pool_types,
        management_fee_percentage=rate,
        trace=_trace(),
    )

    # Inputs are never mutated in place.
    assert breakdown == snapshot
    assert excess >= 0

    if rate == 0 or not use_types or not name_fee:
        # Skip paths: no classification, no fee pool by name, or zero rate.
        assert excess == Decimal("0")
        assert adjusted == breakdown
        assert adjusted_orig is None
        return

    # Cap base = operating pools EXCLUDING the fee pool itself.
    base = operating  # only "cam operating" is operating & not the fee pool
    cap = max(Decimal("0"), (rate * base).quantize(Decimal("0.01"), ROUND_HALF_UP))
    expected_excess = max(Decimal("0"), fee - cap)
    assert excess == expected_excess

    if expected_excess > 0:
        # Fee pool reduced to exactly the cap; other pools untouched.
        assert adjusted[fee_name] == cap
        assert adjusted["cam operating"] == operating
        assert adjusted["real estate taxes"] == other
    else:
        assert adjusted == breakdown


def test_reduce_single_pool_sets_cap():
    b = {"management fee": Decimal("5000.00"), "cam": Decimal("100.00")}
    _reduce_pools_to_cap(b, {"management fee"}, Decimal("1200.00"))
    assert b["management fee"] == Decimal("1200.00")
    assert b["cam"] == Decimal("100.00")


def test_reduce_two_pools_no_negative_regression():
    # Direct regression for product bug #16: two fee pools, a cap whose pro-rata
    # split would round the leading pool past the cap under the old "last pool
    # absorbs remainder" logic. Both pools must stay >= 0 and sum to the cap.
    b = {"a": Decimal("879.48"), "b": Decimal("0.03")}
    cap = Decimal("692.84")
    _reduce_pools_to_cap(b, {"a", "b"}, cap)
    assert b["a"] >= 0 and b["b"] >= 0
    assert b["a"] + b["b"] == cap


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
