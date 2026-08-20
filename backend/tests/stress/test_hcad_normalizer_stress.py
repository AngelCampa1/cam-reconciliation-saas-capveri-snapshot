"""Property-based stress for the HCAD tax base-year normalizer.

``calculate_hcad_tax_normalization`` composes ``calculate_base_year_increase``
twice (original vs. retroactively-adjusted base) and optionally layers a
non-cumulative lease cap on top. The example-based suite in
``tests/test_hcad_tax_normalizer.py`` covers the named paths; this harness
fuzzes the whole valid input space and asserts the structural invariants that
must hold for *every* HCAD protest, so a future refactor of either composed
calculator cannot silently break the recovery math.

Closed form (see module docstring):
    adjusted_base = original_base - retro_adjustment            (exact, no round)
    passthrough   = max(0, current_tax - base) * pro_rata       (cent-quantized)
    recovery      = corrected_passthrough - original_passthrough (>= 0)

Because ``tenant_share`` is ``quantize(0.01, ROUND_HALF_UP)`` and ROUND_HALF_UP
is monotonic non-decreasing, the *rounded* corrected passthrough can never dip
below the rounded original, so ``recovery_delta >= 0`` holds exactly. The
closed-form upper bound ``pro_rata * retro_adjustment`` is compared with a
one-cent tolerance to absorb the two independent cent-roundings.

Run standalone:
    pytest tests/stress/test_hcad_normalizer_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.hcad_tax_normalizer import (
    HcadInput,
    calculate_hcad_tax_normalization,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

CENT = Decimal("0.01")


def _money(min_value="0", max_value="100000000"):
    return st.decimals(
        min_value=Decimal(min_value),
        max_value=Decimal(max_value),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


pro_rata = st.decimals(
    min_value=Decimal("0.0001"),
    max_value=Decimal("1"),
    places=4,
    allow_nan=False,
    allow_infinity=False,
)

cap_rate = st.one_of(
    st.none(),
    st.decimals(
        min_value=Decimal("0.0001"),
        max_value=Decimal("0.9999"),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    ),
)


@st.composite
def hcad_input(draw):
    original_base = draw(_money())
    # retro_adjustment is constrained to [0, original_base] by the validator.
    retro = draw(
        st.decimals(
            min_value=Decimal("0"),
            max_value=original_base,
            places=2,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    current_tax = draw(_money(min_value="0.01"))
    return HcadInput(
        original_base_year_assessment=original_base,
        retroactive_adjustment=retro,
        current_year_tax=current_tax,
        pro_rata_pct=draw(pro_rata),
        cap_rate=draw(cap_rate),
    )


@STRESS
@given(inp=hcad_input())
def test_core_recovery_invariants(inp):
    r = calculate_hcad_tax_normalization(inp)

    # adjusted base is an exact subtraction, never rounded.
    assert r.adjusted_base_year == (
        inp.original_base_year_assessment - inp.retroactive_adjustment
    )

    # passthroughs are cent-quantized money, never negative.
    assert r.original_passthrough >= 0
    assert r.corrected_passthrough >= 0
    assert r.original_passthrough % CENT == 0
    assert r.corrected_passthrough % CENT == 0

    # A lower (or equal) base can only raise the passthrough → recovery >= 0,
    # and recovery is exactly the difference of two cent-quantized values.
    assert r.corrected_passthrough >= r.original_passthrough
    assert r.recovery_delta == r.corrected_passthrough - r.original_passthrough
    assert r.recovery_delta >= 0
    assert r.recovery_delta % CENT == 0

    # The recovery can never exceed the prorated share of the base reduction
    # (it equals it when current_tax >= original_base). One cent of slack for
    # the two independent ROUND_HALF_UP quantizations.
    upper = inp.pro_rata_pct * inp.retroactive_adjustment
    assert r.recovery_delta <= upper + CENT


@STRESS
@given(inp=hcad_input())
def test_zero_retro_means_zero_recovery(inp):
    """With no retroactive adjustment the corrected base equals the original."""
    base = inp.original_base_year_assessment
    no_retro = HcadInput(
        original_base_year_assessment=base,
        retroactive_adjustment=Decimal("0"),
        current_year_tax=inp.current_year_tax,
        pro_rata_pct=inp.pro_rata_pct,
        cap_rate=inp.cap_rate,
    )
    r = calculate_hcad_tax_normalization(no_retro)
    assert r.adjusted_base_year == base
    assert r.corrected_passthrough == r.original_passthrough
    assert r.recovery_delta == Decimal("0")


@STRESS
@given(inp=hcad_input())
def test_cap_never_increases_recovery(inp):
    """When a cap is supplied it can only reduce (never grow) the recovery."""
    if inp.cap_rate is None:
        return
    r = calculate_hcad_tax_normalization(inp)
    assert r.capped_corrected_passthrough is not None
    assert r.capped_recovery is not None
    assert r.cap_was_applied is not None

    # Cap floors at the original passthrough and ceilings at the uncapped one.
    assert r.original_passthrough <= r.capped_corrected_passthrough
    assert r.capped_corrected_passthrough <= r.corrected_passthrough
    assert Decimal("0") <= r.capped_recovery <= r.recovery_delta
    # The applied flag is true exactly when the cap bit.
    assert r.cap_was_applied == (
        r.capped_corrected_passthrough < r.corrected_passthrough
    )


@STRESS
@given(
    original_base=_money(min_value="1"),
    current_tax=_money(min_value="0.01"),
    pr=pro_rata,
    retro_a=_money(),
    retro_b=_money(),
)
def test_recovery_monotonic_in_retro_adjustment(
    original_base, current_tax, pr, retro_a, retro_b
):
    """A larger retroactive base reduction can only grow the recovery."""
    lo, hi = sorted([min(retro_a, original_base), min(retro_b, original_base)])

    def recovery(retro):
        return calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=original_base,
                retroactive_adjustment=retro,
                current_year_tax=current_tax,
                pro_rata_pct=pr,
            )
        ).recovery_delta

    assert recovery(lo) <= recovery(hi)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
