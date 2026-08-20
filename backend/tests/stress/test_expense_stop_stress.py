"""Property-based stress for expense-stop (per-sqft threshold) math.

``calculate_expense_stop`` (calculation/expense_stop.py) computes the slice of a
tenant's pool share that sits **above** a per-square-foot expense stop — the
amount the tenant actually pays once the landlord-absorbed base is subtracted.
``apply_expense_stops`` runs it across a pool breakdown and folds the recoverable
slice back to a pool-level amount. Both are deterministic Decimal math on the
recovery path, so a rounding mode slip or an inverted ``max(0, …)`` would over- or
under-bill every stopped tenant.

Invariants (calculate_expense_stop):
  * threshold == round(stop_per_sqft * tenant_sqft, 2, HALF_UP);
  * tenant_share_before_stop == round(pool_amount * pro_rata_share, 2, HALF_UP);
  * above_stop == max(0, tenant_share - threshold), rounded, never negative;
  * stop_applied iff tenant_share > threshold, and above_stop > 0 iff stop_applied;
  * pool_amount echoed back unchanged.

Invariants (apply_expense_stops):
  * key set is exactly the input breakdown's keys (stops never add/remove pools);
  * a pool with no configured stop is returned byte-for-byte unchanged;
  * a stopped pool with pro_rata > 0 == above_stop / pro_rata; with pro_rata == 0
    it collapses to 0;
  * a stop keyed to a pool absent from the breakdown is ignored;
  * total: never raises.

Run standalone:
    pytest tests/stress/test_expense_stop_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.expense_stop import (
    ExpenseStopInput,
    apply_expense_stops,
    calculate_expense_stop,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

pool_amounts = st.decimals(
    min_value=Decimal("-1000000"),
    max_value=Decimal("1000000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)
stop_rates = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("100"), places=2, allow_nan=False
)
sqfts = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("500000"), places=2, allow_nan=False
)
ratios = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@STRESS
@given(
    pool_amount=pool_amounts,
    stop_per_sqft=stop_rates,
    tenant_sqft=sqfts,
    pro_rata=ratios,
)
def test_expense_stop_identity(pool_amount, stop_per_sqft, tenant_sqft, pro_rata):
    result = calculate_expense_stop(
        ExpenseStopInput(
            pool_amount=pool_amount,
            stop_per_sqft=stop_per_sqft,
            tenant_sqft=tenant_sqft,
            pro_rata_share=pro_rata,
        )
    )

    exp_threshold = _q(stop_per_sqft * tenant_sqft)
    exp_share = _q(pool_amount * pro_rata)
    exp_above = _q(max(Decimal("0"), exp_share - exp_threshold))

    assert result.threshold == exp_threshold
    assert result.tenant_share_before_stop == exp_share
    assert result.above_stop == exp_above
    assert result.above_stop >= 0
    assert result.pool_amount == pool_amount
    assert result.stop_applied == (exp_share > exp_threshold)
    # above_stop is positive exactly when the stop bites.
    assert (result.above_stop > 0) == result.stop_applied


@st.composite
def _breakdown_and_stops(draw):
    names = draw(
        st.lists(st.text(min_size=1, max_size=6), min_size=0, max_size=5, unique=True)
    )
    breakdown = {n: draw(pool_amounts) for n in names}
    # Stops: a subset of real pools plus possibly a phantom pool not in breakdown.
    stop_names = draw(
        st.lists(st.sampled_from(names) if names else st.just("phantom"), max_size=4)
    )
    if draw(st.booleans()):
        stop_names.append("phantom_not_in_breakdown")
    stops = {n: draw(stop_rates) for n in set(stop_names)}
    return breakdown, stops


@STRESS
@given(
    data=_breakdown_and_stops(),
    tenant_sqft=sqfts,
    pro_rata=ratios,
)
def test_apply_expense_stops(data, tenant_sqft, pro_rata):
    breakdown, stops = data
    out = apply_expense_stops(dict(breakdown), stops, tenant_sqft, pro_rata)

    # Stops never add or drop pools.
    assert set(out) == set(breakdown)

    for name, original in breakdown.items():
        if name in stops:
            sr = calculate_expense_stop(
                ExpenseStopInput(
                    pool_amount=original,
                    stop_per_sqft=stops[name],
                    tenant_sqft=tenant_sqft,
                    pro_rata_share=pro_rata,
                )
            )
            expected = sr.above_stop / pro_rata if pro_rata > 0 else Decimal("0")
            assert out[name] == expected
        else:
            # Untouched pool is byte-for-byte identical.
            assert out[name] == original


def test_known_expense_stop_example():
    # Doc example: 10,000 sqft @ $5/sqft stop, share $60k -> pays $10k.
    result = calculate_expense_stop(
        ExpenseStopInput(
            pool_amount=Decimal("600000.00"),
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )
    )
    assert result.threshold == Decimal("50000.00")
    assert result.tenant_share_before_stop == Decimal("60000.00")
    assert result.above_stop == Decimal("10000.00")
    assert result.stop_applied is True

    # Under the stop -> pays $0.
    under = calculate_expense_stop(
        ExpenseStopInput(
            pool_amount=Decimal("450000.00"),
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )
    )
    assert under.above_stop == Decimal("0.00")
    assert under.stop_applied is False


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
