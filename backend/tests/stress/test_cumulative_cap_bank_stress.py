"""Property-based stress for the cumulative (banked) CAM cap simulation.

``calculate_cumulative_cap`` is the linear, carry-forward cap model: each year a
tenant's recoverable increase is limited to ``base * cap_rate`` (or a fixed dollar
step), but **unused** headroom is banked as a running balance and can be drawn
down in a later over-spend year. The ceiling this year is

    max_allowed = prior_actual + annual_increase_limit + bank

where ``bank`` is the running balance simulated year-by-year across all prior
actuals. A bug in that simulation loop (an off-by-one, a dropped/extra
quantization, a mis-clamped negative balance) silently mis-bills the tenant: too
low a ceiling over-charges, too high under-recovers for the landlord.

The existing ``test_calc_invariants_stress.py`` only asserts generic CapResult
shape for this function. This harness independently re-derives the bank running
balance and the resulting capped amount / savings / headroom from scratch and
pins them exactly, plus the input-validation guards.

Run standalone:
    pytest tests/stress/test_cumulative_cap_bank_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import calculate_cumulative_cap

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

CENTS = Decimal("0.01")


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


def _derive_max_allowed(
    base: Decimal,
    annual_limit: Decimal,
    priors: list[Decimal],
) -> Decimal:
    """Mirror the SUT's bank simulation exactly to re-derive the ceiling.

    annual_limit is pre-quantized (as the SUT does before the loop); the running
    balance accumulates raw and is clamped/quantized only at the end.
    """
    if len(priors) == 0:
        bank = Decimal("0")
    else:
        running_reference = base
        running_bank = Decimal("0")
        for actual in priors:
            year_max = running_reference + annual_limit + running_bank
            running_bank = year_max - actual
            running_reference = actual
        bank = _q(max(running_bank, Decimal("0")))
    reference = priors[-1] if priors else base
    return _q(reference + annual_limit + bank)


def _assert_capping(res, current: Decimal, max_allowed: Decimal) -> None:
    assert res.original_amount == current
    if current <= max_allowed:
        assert res.cap_applied is False
        assert res.capped_amount == current
        assert res.savings_from_cap == Decimal("0.00")
        assert res.cap_headroom == _q(max_allowed - current)
    else:
        assert res.cap_applied is True
        assert res.capped_amount == max_allowed
        assert res.savings_from_cap == _q(current - max_allowed)
        assert res.cap_headroom == Decimal("0.00")
    # Universal: a cap never raises the amount, and outputs stay non-negative.
    assert res.capped_amount <= current
    assert res.savings_from_cap >= 0
    assert res.cap_headroom >= 0


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "10000000"),
    rate=st.decimals(
        min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
    ),
    priors=st.lists(money("0", "10000000"), min_size=0, max_size=8),
)
def test_cumulative_cap_rate_rederivation(current, base, rate, priors):
    res = calculate_cumulative_cap(
        current,
        base,
        cap_rate=rate,
        years_since_base=len(priors) + 1,
        prior_year_amounts=priors,
    )
    annual_limit = _q(base * rate)
    max_allowed = _derive_max_allowed(base, annual_limit, priors)
    _assert_capping(res, current, max_allowed)


@STRESS
@given(
    current=money("0", "10000000"),
    base=money("0.01", "10000000"),
    fixed=money("0", "500000"),
    priors=st.lists(money("0", "10000000"), min_size=0, max_size=8),
)
def test_cumulative_cap_fixed_rederivation(current, base, fixed, priors):
    res = calculate_cumulative_cap(
        current,
        base,
        cap_fixed_amount=fixed,
        years_since_base=len(priors) + 1,
        prior_year_amounts=priors,
    )
    annual_limit = _q(fixed)
    max_allowed = _derive_max_allowed(base, annual_limit, priors)
    _assert_capping(res, current, max_allowed)


def test_cumulative_cap_known_three_year_bank():
    # Docstring example: 5% cap, $100k base.
    #   Y1 actual 102k -> bank 3k; Y2 actual 108k -> bank 2k;
    #   Y3 ceiling = 108k + 5k + 2k = 115k.
    res = calculate_cumulative_cap(
        Decimal("120000.00"),
        Decimal("100000.00"),
        cap_rate=Decimal("0.05"),
        years_since_base=3,
        prior_year_amounts=[Decimal("102000.00"), Decimal("108000.00")],
    )
    assert res.cap_applied is True
    assert res.capped_amount == Decimal("115000.00")
    assert res.savings_from_cap == Decimal("5000.00")
    assert res.cap_headroom == Decimal("0.00")


def test_cumulative_cap_year1_has_no_bank():
    # No prior years -> ceiling is exactly base + annual_increase, no carry-forward.
    res = calculate_cumulative_cap(
        Decimal("104000.00"),
        Decimal("100000.00"),
        cap_rate=Decimal("0.05"),
        years_since_base=1,
        prior_year_amounts=[],
    )
    # max_allowed = 100000 + 5000 = 105000; current under it -> passes through.
    assert res.cap_applied is False
    assert res.capped_amount == Decimal("104000.00")
    assert res.cap_headroom == Decimal("1000.00")


def test_cumulative_cap_overspend_then_clamped_bank():
    # An over-spend year drives the running bank negative; it must clamp at 0 and
    # not lend phantom headroom to the next year.
    # 10% cap, $100k base. Y1 actual 130k (overspends 20k -> running bank -15k).
    #   Y2 ceiling = prior_actual(130k) + 10k + bank(0) = 140k.
    res = calculate_cumulative_cap(
        Decimal("150000.00"),
        Decimal("100000.00"),
        cap_rate=Decimal("0.10"),
        years_since_base=2,
        prior_year_amounts=[Decimal("130000.00")],
    )
    assert res.cap_applied is True
    assert res.capped_amount == Decimal("140000.00")


def test_cumulative_cap_validation_guards():
    with pytest.raises(ValueError, match="cap_rate must be non-negative"):
        calculate_cumulative_cap(
            Decimal("1"), Decimal("100"), cap_rate=Decimal("-0.01")
        )
    with pytest.raises(ValueError, match="cap_fixed_amount must be non-negative"):
        calculate_cumulative_cap(
            Decimal("1"), Decimal("100"), cap_fixed_amount=Decimal("-1")
        )
    with pytest.raises(ValueError, match="exceeds maximum"):
        calculate_cumulative_cap(Decimal("1"), Decimal("100"), cap_rate=Decimal("5"))
    with pytest.raises(ValueError, match="Either cap_rate or cap_fixed_amount"):
        calculate_cumulative_cap(Decimal("1"), Decimal("100"))


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
