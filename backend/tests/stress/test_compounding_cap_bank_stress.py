"""Property-based stress for the compounding (exponential) CAM cap + its bank.

``calculate_cumulative_compounding_cap`` grows the ceiling exponentially —
``base * (1 + rate)**N`` — and adds banked headroom computed as

    bank = sum_{y=1..N-1} base*(1+rate)**y  -  sum(prior_actuals)   (clamped >= 0)

This is a *different* bank model from the linear ``calculate_cumulative_cap``
(which threads a running balance year-by-year): here it is the sum of each prior
year's standalone theoretical max minus the sum of prior actuals. The existing
``test_compounding_cap_stress.py`` / calc-invariants only assert CapResult shape
and the year-1 anchor; the multi-year bank arithmetic is never re-derived. Bugs
#17/#18 both lived in exactly this multi-year cap-simulation surface, so this
harness re-derives the effective ceiling and every CapResult field from scratch.

Run standalone:
    pytest tests/stress/test_compounding_cap_bank_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import calculate_cumulative_compounding_cap

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

CENTS = Decimal("0.01")
MAX_YEARS = 50  # mirrors the SUT's FC-2 overflow clamp


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


def money(lo: str, hi: str) -> st.SearchStrategy[Decimal]:
    return st.decimals(
        min_value=Decimal(lo),
        max_value=Decimal(hi),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def _derive_effective_max(
    base: Decimal,
    priors: list[Decimal],
    years: int,
    *,
    rate: Decimal | None = None,
    fixed: Decimal | None = None,
) -> Decimal:
    """Mirror the SUT's compounded ceiling + bank exactly."""
    years = min(years, MAX_YEARS)
    if fixed is not None:
        max_allowed = base + (fixed * years)
        cumulative_max_prior = Decimal(sum(base + (fixed * y) for y in range(1, years)))
    else:
        assert rate is not None
        max_allowed = base * ((Decimal("1") + rate) ** years)
        cumulative_max_prior = Decimal(
            sum(base * ((Decimal("1") + rate) ** y) for y in range(1, years))
        )
    max_allowed = _q(max_allowed)
    cumulative_actual_prior = Decimal(sum(priors))
    bank = _q(max(cumulative_max_prior - cumulative_actual_prior, Decimal("0")))
    return _q(max_allowed + bank)


def _assert_capping(res, current: Decimal, effective_max: Decimal) -> None:
    assert res.original_amount == current
    if current <= effective_max:
        assert res.cap_applied is False
        assert res.capped_amount == _q(current)
        assert res.savings_from_cap == Decimal("0.00")
        assert res.cap_headroom == _q(effective_max - current)
    else:
        assert res.cap_applied is True
        assert res.capped_amount == effective_max
        assert res.savings_from_cap == _q(current - effective_max)
        assert res.cap_headroom == Decimal("0.00")
    assert res.capped_amount <= _q(current)
    assert res.savings_from_cap >= 0
    assert res.cap_headroom >= 0


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "1000000"),
    rate=st.decimals(
        min_value=Decimal("0"), max_value=Decimal("0.25"), places=4, allow_nan=False
    ),
    priors=st.lists(money("0", "5000000"), min_size=0, max_size=8),
)
def test_compounding_cap_rate_rederivation(current, base, rate, priors):
    years = len(priors) + 1
    res = calculate_cumulative_compounding_cap(
        current,
        base,
        cap_rate=rate,
        years_since_base=years,
        prior_year_amounts=priors,
    )
    effective_max = _derive_effective_max(base, priors, years, rate=rate)
    _assert_capping(res, current, effective_max)


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "1000000"),
    fixed=money("0", "100000"),
    priors=st.lists(money("0", "5000000"), min_size=0, max_size=8),
)
def test_compounding_cap_fixed_rederivation(current, base, fixed, priors):
    years = len(priors) + 1
    res = calculate_cumulative_compounding_cap(
        current,
        base,
        cap_fixed_amount=fixed,
        years_since_base=years,
        prior_year_amounts=priors,
    )
    effective_max = _derive_effective_max(base, priors, years, fixed=fixed)
    _assert_capping(res, current, effective_max)


def test_compounding_cap_year3_exponential_anchor():
    # Docstring: 5% cap, $100k base, no priors used for the ceiling itself.
    #   Y3 max = 100000 * 1.05^3 = 115762.50 (vs linear 115000).
    res = calculate_cumulative_compounding_cap(
        Decimal("200000.00"),
        Decimal("100000.00"),
        cap_rate=Decimal("0.05"),
        years_since_base=3,
        prior_year_amounts=[Decimal("100000.00"), Decimal("100000.00")],
    )
    # bank = (100000*1.05 + 100000*1.05^2) - (100000+100000)
    #      = (105000 + 110250) - 200000 = 15250
    # effective_max = 115762.50 + 15250 = 131012.50
    assert res.cap_applied is True
    assert res.capped_amount == Decimal("131012.50")
    assert res.savings_from_cap == Decimal("68987.50")


def test_compounding_cap_year1_anchors_to_base():
    res = calculate_cumulative_compounding_cap(
        Decimal("106000.00"),
        Decimal("100000.00"),
        cap_rate=Decimal("0.05"),
        years_since_base=1,
        prior_year_amounts=[],
    )
    # Y1 max = 100000 * 1.05 = 105000; no priors -> no bank; current over -> capped.
    assert res.cap_applied is True
    assert res.capped_amount == Decimal("105000.00")


def test_compounding_cap_year_clamp_prevents_overflow():
    # FC-2: years beyond 50 are clamped to 50, so a 100-year and a 50-year request
    # (same other inputs) produce identical results rather than astronomical ones.
    kwargs = dict(
        cap_rate=Decimal("0.05"),
        prior_year_amounts=[Decimal("100000.00")],
    )
    at_100 = calculate_cumulative_compounding_cap(
        Decimal("1"), Decimal("100000.00"), years_since_base=100, **kwargs
    )
    at_50 = calculate_cumulative_compounding_cap(
        Decimal("1"), Decimal("100000.00"), years_since_base=50, **kwargs
    )
    assert at_100.capped_amount == at_50.capped_amount
    assert at_100.cap_headroom == at_50.cap_headroom


def test_compounding_cap_validation_guards():
    with pytest.raises(ValueError, match="cap_rate must be non-negative"):
        calculate_cumulative_compounding_cap(
            Decimal("1"), Decimal("100"), cap_rate=Decimal("-0.01")
        )
    with pytest.raises(ValueError, match="exceeds maximum"):
        calculate_cumulative_compounding_cap(
            Decimal("1"), Decimal("100"), cap_rate=Decimal("5")
        )
    with pytest.raises(ValueError, match="Either cap_rate or cap_fixed_amount"):
        calculate_cumulative_compounding_cap(Decimal("1"), Decimal("100"))


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
