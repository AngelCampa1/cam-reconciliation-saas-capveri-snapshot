"""Penny-exact oracle for the HCAD tax base-year normalizer.

``calculate_hcad_tax_normalization`` (hcad_tax_normalizer.py:98-161) models the
recovery a landlord unlocks when a Texas ARB protest retroactively lowers the
base-year tax assessment. It runs ``calculate_base_year_increase`` twice (original
vs adjusted base) and optionally applies a non-cumulative percentage cap:

    adjusted_base         = original_base - retroactive_adjustment           # exact
    original_passthrough  = round(max(0, current_tax - original_base) * pro_rata, 2)
    corrected_passthrough = round(max(0, current_tax - adjusted_base) * pro_rata, 2)
    recovery_delta        = corrected_passthrough - original_passthrough      # exact diff, no re-round
    # cap branch (cap_rate is not None):
    #   max_allowed       = round(original_passthrough * (1 + cap_rate), 2)
    #   capped_corrected  = min(corrected_passthrough, max_allowed)
    #   capped_recovery   = capped_corrected - original_passthrough
    #   (BUT: when original_passthrough == 0 the helper has NO baseline and
    #    returns capped == corrected, cap_applied=False — the zero-prior guard.)

``test_hcad_normalizer_stress.py`` asserts only RELATIONAL facts — the exact
``adjusted_base`` subtraction, non-negativity, cent-divisibility, the
``recovery_delta == corrected - original`` identity, and a TOLERANCE band
(``recovery_delta <= pro_rata*retro + cent``). **No test independently recomputes
``original_passthrough`` / ``corrected_passthrough`` as
``round(max(0, tax-base)*pro_rata, 2)`` with ``==``, nor the capped values against
``min(corrected, round(original*(1+cap_rate), 2))``** (including the zero-prior
guard).

This drives the real function and re-derives every money field from the four (or
five) scalars with ``==`` (no tolerance), covering both the no-cap and cap branches.

Run standalone:
    pytest tests/stress/test_hcad_tax_normalizer_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.hcad_tax_normalizer import (
    HcadInput,
    calculate_hcad_tax_normalization,
)

STRESS = settings(max_examples=300, deadline=None)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("50000000"), places=2, allow_nan=False
)
_current = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("50000000"), places=2, allow_nan=False
)
_pro_rata = st.decimals(
    min_value=Decimal("0.0001"), max_value=Decimal("1"), places=4, allow_nan=False
)
_cap = st.decimals(
    min_value=Decimal("0.0001"), max_value=Decimal("0.9999"), places=4, allow_nan=False
)


def _oracle(inp: HcadInput) -> tuple[Decimal, Decimal, Decimal]:
    adj_base = inp.original_base_year_assessment - inp.retroactive_adjustment
    orig = _q(
        max(Decimal("0"), inp.current_year_tax - inp.original_base_year_assessment)
        * inp.pro_rata_pct
    )
    corr = _q(max(Decimal("0"), inp.current_year_tax - adj_base) * inp.pro_rata_pct)
    return adj_base, orig, corr


@STRESS
@given(
    original_base=_money,
    retro=_money,
    current_tax=_current,
    pro_rata=_pro_rata,
)
def test_hcad_no_cap_round_trips_exactly(original_base, retro, current_tax, pro_rata):
    # Validator: retro <= original_base.
    assume(retro <= original_base)
    inp = HcadInput(
        original_base_year_assessment=original_base,
        retroactive_adjustment=retro,
        current_year_tax=current_tax,
        pro_rata_pct=pro_rata,
        cap_rate=None,
    )
    result = calculate_hcad_tax_normalization(inp)
    adj_base, orig, corr = _oracle(inp)

    assert result.adjusted_base_year == adj_base
    assert result.original_passthrough == orig
    assert result.corrected_passthrough == corr
    assert result.recovery_delta == corr - orig
    assert result.capped_corrected_passthrough is None
    assert result.capped_recovery is None


@STRESS
@given(
    original_base=_money,
    retro=_money,
    current_tax=_current,
    pro_rata=_pro_rata,
    cap_rate=_cap,
)
def test_hcad_cap_branch_round_trips_exactly(
    original_base, retro, current_tax, pro_rata, cap_rate
):
    assume(retro <= original_base)
    inp = HcadInput(
        original_base_year_assessment=original_base,
        retroactive_adjustment=retro,
        current_year_tax=current_tax,
        pro_rata_pct=pro_rata,
        cap_rate=cap_rate,
    )
    result = calculate_hcad_tax_normalization(inp)
    _, orig, corr = _oracle(inp)

    # Zero-prior guard: with no original passthrough the helper has no baseline.
    if orig == Decimal("0"):
        expected_capped = corr
        expected_applied = False
    else:
        max_allowed = _q(orig + orig * cap_rate)
        if corr <= max_allowed:
            expected_capped = corr
            expected_applied = False
        else:
            expected_capped = max_allowed
            expected_applied = True

    assert result.original_passthrough == orig
    assert result.corrected_passthrough == corr
    assert result.capped_corrected_passthrough == expected_capped
    assert result.capped_recovery == expected_capped - orig
    assert result.cap_was_applied is expected_applied


def test_hcad_anchor_retroactive_reduction_unlocks_recovery():
    """A $20k base cut lets $20k more tax pass through at the tenant's share."""
    # current 500000, original base 300000, retro 20000 -> adjusted base 280000.
    # original passthrough = (500000-300000)*0.10 = 20000.
    # corrected passthrough = (500000-280000)*0.10 = 22000. delta 2000.
    inp = HcadInput(
        original_base_year_assessment=Decimal("300000.00"),
        retroactive_adjustment=Decimal("20000.00"),
        current_year_tax=Decimal("500000.00"),
        pro_rata_pct=Decimal("0.10"),
        cap_rate=None,
    )
    result = calculate_hcad_tax_normalization(inp)
    assert result.adjusted_base_year == Decimal("280000.00")
    assert result.original_passthrough == Decimal("20000.00")
    assert result.corrected_passthrough == Decimal("22000.00")
    assert result.recovery_delta == Decimal("2000.00")


def test_hcad_anchor_cap_limits_corrected_passthrough():
    """A 5% cap clamps the corrected passthrough to 5% over the original."""
    # original passthrough 20000; cap 5% -> max_allowed 21000.
    # corrected 22000 > 21000 -> capped 21000, capped_recovery 1000, applied True.
    inp = HcadInput(
        original_base_year_assessment=Decimal("300000.00"),
        retroactive_adjustment=Decimal("20000.00"),
        current_year_tax=Decimal("500000.00"),
        pro_rata_pct=Decimal("0.10"),
        cap_rate=Decimal("0.05"),
    )
    result = calculate_hcad_tax_normalization(inp)
    assert result.capped_corrected_passthrough == Decimal("21000.00")
    assert result.capped_recovery == Decimal("1000.00")
    assert result.cap_was_applied is True


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
