"""Property-based stress for the non-cumulative CAM cap.

``calculate_non_cumulative_cap`` (calculation/caps.py) limits a tenant's current
recoverable expense to a prior-year baseline plus a permitted increase — either a
percentage of prior (``prior * cap_rate``) or a fixed dollar step. Unused headroom
is *lost* each year (non-cumulative). It directly bounds the tenant's bill, so an
inverted comparison, a wrong baseline, or a dropped guard would over-bill.

Invariants:
  * year-1 (prior None) and zero-prior-year are pass-through: capped == current,
    not applied, savings 0, headroom 0 (FIX CAP-4 — a $0 prior can't anchor a
    percentage cap);
  * fixed-amount mode takes precedence over rate mode; max_allowed ==
    round(prior + increase, 2);
  * under/at cap: capped == current, savings 0, headroom == max_allowed - current;
  * over cap: capped == max_allowed, savings == current - max_allowed, headroom 0;
  * cap_applied iff current > max_allowed; savings and headroom never negative;
  * guards: negative cap_rate / cap_fixed_amount, cap_rate > 1.0, and "neither
    provided" all raise ValueError.

Run standalone:
    pytest tests/stress/test_non_cumulative_cap_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import calculate_non_cumulative_cap

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("5000000"), places=2, allow_nan=False
)
rates = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
fixed_amounts = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1000000"), places=2, allow_nan=False
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@STRESS
@given(current=money)
def test_year_one_and_zero_prior_pass_through(current):
    for prior in (None, Decimal("0")):
        result = calculate_non_cumulative_cap(current, prior, cap_rate=Decimal("0.05"))
        assert result.capped_amount == current
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == Decimal("0")


@STRESS
@given(
    current=money,
    prior=money.filter(lambda d: d > 0),
    cap_rate=rates,
    cap_fixed=st.one_of(st.none(), fixed_amounts),
)
def test_cap_identity(current, prior, cap_rate, cap_fixed):
    result = calculate_non_cumulative_cap(
        current, prior, cap_rate=cap_rate, cap_fixed_amount=cap_fixed
    )

    # Fixed mode takes precedence when both are supplied.
    if cap_fixed is not None:
        max_increase = cap_fixed
    else:
        max_increase = prior * cap_rate
    max_allowed = _q(prior + max_increase)

    if current <= max_allowed:
        assert result.capped_amount == current
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == _q(max_allowed - current)
    else:
        assert result.capped_amount == max_allowed
        assert result.cap_applied is True
        assert result.savings_from_cap == _q(current - max_allowed)
        assert result.cap_headroom == Decimal("0")

    assert result.cap_applied == (current > max_allowed)
    assert result.savings_from_cap >= 0
    assert result.cap_headroom >= 0
    assert result.original_amount == current


def test_guards_raise():
    # Neither cap_rate nor cap_fixed_amount.
    with pytest.raises(ValueError):
        calculate_non_cumulative_cap(Decimal("100"), Decimal("90"))
    # Negative fixed amount.
    with pytest.raises(ValueError):
        calculate_non_cumulative_cap(
            Decimal("100"), Decimal("90"), cap_fixed_amount=Decimal("-1")
        )
    # Negative cap rate.
    with pytest.raises(ValueError):
        calculate_non_cumulative_cap(
            Decimal("100"), Decimal("90"), cap_rate=Decimal("-0.01")
        )
    # Cap rate above 100% (likely 5 instead of 0.05).
    with pytest.raises(ValueError):
        calculate_non_cumulative_cap(
            Decimal("100"), Decimal("90"), cap_rate=Decimal("5")
        )


def test_known_percentage_cap_example():
    # Prior $100k, 5% cap → max $105k; current $108k → capped $105k, $3k savings.
    result = calculate_non_cumulative_cap(
        Decimal("108000.00"), Decimal("100000.00"), cap_rate=Decimal("0.05")
    )
    assert result.capped_amount == Decimal("105000.00")
    assert result.savings_from_cap == Decimal("3000.00")
    assert result.cap_applied is True


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
