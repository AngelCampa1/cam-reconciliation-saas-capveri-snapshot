"""Property-based stress for base-year expense-stop recovery.

``calculate_base_year_increase`` (calculation/base_year.py) is the most common CAM
recovery model: the tenant pays its pro-rata share of the *increase* of current
expenses over an adjusted base year, and nothing when expenses fall below base
(the landlord absorbs savings — no negative credit). ``normalize_base_year``
optionally grosses the base year up to a target occupancy. Both are deterministic
Decimal math feeding tenant bills, so an inverted ``max(0, …)``, a dropped
adjustment, or a wrong rounding mode would mis-bill directly.

Invariants (calculate_base_year_increase):
  * total_adjustments == Σ imputed_amount; adjusted_base == raw_base + Σadj;
  * increase_over_base == current - adjusted_base (may be negative);
  * is_under_base iff increase < 0;
  * tenant_share == round(max(0, increase) * pro_rata, 2, HALF_UP) and always ≥ 0;
  * raw_base_year_amount echoes the input base.

Invariants (normalize_base_year):
  * should_normalize False → returns raw base unchanged;
  * base_occupancy ≥ target → returns raw base unchanged;
  * 0.01 < base_occupancy < target → returns round(raw * gross_up_factor, 2),
    which never shrinks the base;
  * base_occupancy ≤ 0.01 with normalization on → raises ValueError.

Run standalone:
    pytest tests/stress/test_base_year_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.base_year import (
    BaseYearInput,
    BaseYearNormalizationInput,
    calculate_base_year_increase,
    normalize_base_year,
)
from app.services.calculation.gross_up import GrossUpConfig, calculate_gross_up_factor

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("5000000"), places=2, allow_nan=False
)
ratios = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
adjustment_amounts = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("500000"), places=2, allow_nan=False
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@st.composite
def _adjustments(draw):
    n = draw(st.integers(0, 4))
    return [
        BaseYearAdjustmentItem(
            service_name=f"svc-{i}",
            imputed_amount=draw(adjustment_amounts),
            justification="introduced after base year",
        )
        for i in range(n)
    ]


@STRESS
@given(current=money, base=money, pro_rata=ratios, adjustments=_adjustments())
def test_base_year_increase_identity(current, base, pro_rata, adjustments):
    result = calculate_base_year_increase(
        BaseYearInput(
            current_year_expenses=current,
            base_year_amount=base,
            pro_rata_share=pro_rata,
            base_year_adjustments=adjustments,
        )
    )

    total_adj = sum((a.imputed_amount for a in adjustments), Decimal("0"))
    adjusted_base = base + total_adj
    increase = current - adjusted_base
    expected_share = _q(max(increase, Decimal("0")) * pro_rata)

    assert result.raw_base_year_amount == base
    assert result.total_adjustments == total_adj
    assert result.adjusted_base_year_amount == adjusted_base
    assert result.increase_over_base == increase
    assert result.is_under_base == (increase < 0)
    assert result.tenant_share == expected_share
    assert result.tenant_share >= 0
    # Below the adjusted base, the tenant is billed exactly $0.
    if increase < 0:
        assert result.tenant_share == Decimal("0")


@STRESS
@given(raw_base=money, base_occ=ratios, target=ratios, normalize=st.booleans())
def test_normalize_base_year_branches(raw_base, base_occ, target, normalize):
    inp = BaseYearNormalizationInput(
        raw_base_year_amount=raw_base,
        base_year_occupancy=base_occ,
        target_occupancy=target,
        should_normalize=normalize,
    )

    if not normalize:
        assert normalize_base_year(inp) == raw_base
        return

    if base_occ <= Decimal("0.01"):
        with pytest.raises(ValueError):
            normalize_base_year(inp)
        return

    if base_occ >= target:
        assert normalize_base_year(inp) == raw_base
        return

    factor = calculate_gross_up_factor(
        base_occ, GrossUpConfig(target_occupancy=target, min_factor=Decimal("1.0"))
    )
    expected = _q(raw_base * factor)
    out = normalize_base_year(inp)
    assert out == expected
    # Grossing up to a higher occupancy never reduces the base.
    assert out >= raw_base


def test_known_base_year_example():
    result = calculate_base_year_increase(
        BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )
    )
    assert result.tenant_share == Decimal("1000.00")
    assert result.is_under_base is False


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
