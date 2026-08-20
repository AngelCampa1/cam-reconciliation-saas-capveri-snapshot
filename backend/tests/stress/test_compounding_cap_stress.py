"""Property-based stress for the cumulative compounding CAM cap.

``calculate_cumulative_compounding_cap`` (calculation/caps.py) is the richest cap
model: the ceiling grows exponentially from a base year — ``base * (1+rate)^N`` —
and unused capacity from prior years is *banked* and added to this year's ceiling.
It bounds the tenant's bill, and the exponent + banking math is exactly where an
off-by-one on the year range, a wrong rounding sequence, or a dropped overflow
guard would silently mis-cap.

Invariants:
  * years_since_base is clamped to 50 (overflow guard);
  * fixed mode: max_allowed == round(base + fixed*years, 2); rate mode:
    max_allowed == round(base * (1+rate)^years, 2);
  * bank == round(max(0, Σ_{y=1..N-1} prior_year_max - Σ prior_actual), 2);
  * effective_max == round(max_allowed + bank, 2);
  * under/at effective_max → capped == current, savings 0, headroom ==
    effective_max - current; over → capped == effective_max, savings == current -
    effective_max, headroom 0;
  * cap_applied iff current > effective_max; savings/headroom never negative;
  * guards: negative cap_rate, cap_rate > 1.0, and neither-provided raise ValueError.

Run standalone:
    pytest tests/stress/test_compounding_cap_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import calculate_cumulative_compounding_cap

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
bases = st.decimals(
    min_value=Decimal("1"), max_value=Decimal("1000000"), places=2, allow_nan=False
)
rates = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
fixed_amounts = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("200000"), places=2, allow_nan=False
)
years = st.integers(min_value=1, max_value=60)  # spans the 50-year clamp


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@STRESS
@given(
    current=money,
    base=bases,
    cap_rate=rates,
    use_fixed=st.booleans(),
    cap_fixed=fixed_amounts,
    years_since=years,
    priors=st.lists(money, max_size=10),
)
def test_compounding_cap_identity(
    current, base, cap_rate, use_fixed, cap_fixed, years_since, priors
):
    result = calculate_cumulative_compounding_cap(
        current,
        base,
        cap_rate=None if use_fixed else cap_rate,
        cap_fixed_amount=cap_fixed if use_fixed else None,
        years_since_base=years_since,
        prior_year_amounts=list(priors),
    )

    n = min(years_since, 50)  # overflow clamp
    if use_fixed:
        max_allowed = _q(base + cap_fixed * n)
        cum_max_prior = Decimal(sum(base + cap_fixed * y for y in range(1, n)))
    else:
        factor = (Decimal("1") + cap_rate) ** n
        max_allowed = _q(base * factor)
        cum_max_prior = Decimal(
            sum(base * ((Decimal("1") + cap_rate) ** y) for y in range(1, n))
        )

    cum_actual_prior = Decimal(sum(priors))
    bank = _q(max(cum_max_prior - cum_actual_prior, Decimal("0")))
    effective_max = _q(max_allowed + bank)

    if current <= effective_max:
        assert result.capped_amount == _q(current)
        assert result.cap_applied is False
        assert result.savings_from_cap == Decimal("0")
        assert result.cap_headroom == _q(effective_max - current)
    else:
        assert result.capped_amount == effective_max
        assert result.cap_applied is True
        assert result.savings_from_cap == _q(current - effective_max)
        assert result.cap_headroom == Decimal("0")

    assert result.cap_applied == (current > effective_max)
    assert result.savings_from_cap >= 0
    assert result.cap_headroom >= 0
    assert result.original_amount == current


def test_guards_raise():
    with pytest.raises(ValueError):
        calculate_cumulative_compounding_cap(Decimal("100"), Decimal("90"))
    with pytest.raises(ValueError):
        calculate_cumulative_compounding_cap(
            Decimal("100"), Decimal("90"), cap_rate=Decimal("-0.01")
        )
    with pytest.raises(ValueError):
        calculate_cumulative_compounding_cap(
            Decimal("100"), Decimal("90"), cap_rate=Decimal("5")
        )


def test_known_compounding_example():
    # $100k base, 5% cap, year 1 (no prior years ⇒ no bank): effective max ==
    # $100k * 1.05 = $105k. Current $120k is capped to $105k, saving $15k.
    result = calculate_cumulative_compounding_cap(
        Decimal("120000.00"),
        Decimal("100000.00"),
        cap_rate=Decimal("0.05"),
        years_since_base=1,
        prior_year_amounts=[],
    )
    assert result.capped_amount == Decimal("105000.00")
    assert result.savings_from_cap == Decimal("15000.00")
    assert result.cap_applied is True


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
