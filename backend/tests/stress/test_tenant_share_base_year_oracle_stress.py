"""Penny-exact oracle for the base-year-stop path of ``calculate_tenant_share``.

When a lease carries a base year, ``calculate_tenant_share``
(calculation/tenant_share.py) does NOT take the plain pro-rata step: it delegates
to ``calculate_base_year_increase`` (calculation/base_year.py), which subtracts the
(adjustment-raised) base from the net expenses, clamps at zero, applies pro-rata,
and quantizes once — then the caller applies the day-based ``proration_factor`` in
a SECOND quantize. The isolated base-year function has a penny-exact oracle
(``test_base_year_stress.py``), and the orchestrator stress pins the no-base-year
path — but **no test drives ``calculate_tenant_share`` through the base-year branch
and re-derives ``tenant_share_before_cap`` against the two-quantize oracle**. The
orchestrator strategy never even sets ``base_year``, so the whole branch (plus the
``base_year_amount`` / ``increase_over_base`` result fields and the admin fee on top
of the prorated base-year share) is unpinned end to end.

This synthesizes known ``(net, base, pro_rata, proration, admin_pct)`` tuples (no
exclusions, no cap, no adjustments), runs the real calculation through the
base-year branch, and checks against an independent oracle:

    increase     = net - base                                  # unquantized, signed
    by_share     = round(max(0, increase) * pro_rata, 2)       # base-year quantize
    before_cap   = round(by_share * proration, 2)              # proration quantize
    admin        = round(before_cap * admin_pct, 2)
    total        = before_cap + admin

Invariants pinned here:

  * **Branch fires** — a positive ``base_year_amount`` routes through the stop.
  * **Two-quantize share** — ``tenant_share_before_cap`` equals the oracle to the
    cent (base-year quantize then proration quantize).
  * **Result fields** — ``base_year_amount`` echoes the (adjusted) base and
    ``increase_over_base`` is the zero-clamped signed increase.
  * **No cap / admin on top** — ``after_cap == before_cap`` and
    ``total_recovery == before_cap + round(before_cap * admin_pct, 2)``.

Plus an anchor that base-year adjustments raise the base (lowering the increase).

Run standalone:
    pytest tests/stress/test_tenant_share_base_year_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.caps import CapType
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    calculate_tenant_share,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_pos_money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
# Base must be strictly positive: a zero base_year_amount is falsy and skips the
# base-year branch entirely (`if terms.base_year and terms.base_year_amount`).
_base_money = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)


@STRESS
@given(
    net=_pos_money,
    base=_base_money,
    pro_rata=_ratio,
    proration=_ratio,
    admin_pct=_fee_pct,
)
def test_base_year_path_round_trips_exactly(net, base, pro_rata, proration, admin_pct):
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        proration_factor=proration,
        base_year=2023,
        base_year_amount=base,
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=net,
            pool_breakdown={},
            current_year=2024,
        )
    )

    # Independent two-quantize oracle (no exclusions, no adjustments, no cap).
    increase = net - base
    recoverable_increase = max(Decimal("0"), increase)
    by_share = _q(recoverable_increase * pro_rata)
    expected_before = _q(by_share * proration)
    expected_admin = _q(expected_before * admin_pct)
    expected_total = expected_before + expected_admin

    assert result.base_year_amount == base
    assert result.increase_over_base == recoverable_increase
    assert result.tenant_share_before_cap == expected_before
    assert result.cap_applied is False
    assert result.tenant_share_after_cap == expected_before
    assert result.admin_fee == expected_admin
    assert result.total_recovery == expected_total


def test_base_year_adjustments_raise_the_base():
    """An imputed adjustment lifts the base, shrinking the recoverable increase."""
    # net 100k, raw base 60k, +10k imputed -> adjusted base 70k -> increase 30k.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=Decimal("0.10"),
        base_year=2023,
        base_year_amount=Decimal("60000.00"),
        base_year_adjustments=[
            BaseYearAdjustmentItem(
                service_name="Security",
                imputed_amount=Decimal("10000.00"),
                justification="Added after base year",
            )
        ],
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )
    )
    # adjusted base = 70000; increase = 30000; share = 30000 * 0.10 = 3000.00.
    assert result.base_year_amount == Decimal("70000.00")
    assert result.increase_over_base == Decimal("30000.00")
    assert result.tenant_share_before_cap == Decimal("3000.00")
    assert result.total_recovery == Decimal("3000.00")


def test_under_base_year_yields_zero_recovery():
    """Net expenses below the base produce no recoverable increase."""
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=Decimal("0.50"),
        base_year=2023,
        base_year_amount=Decimal("80000.00"),
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("50000.00"),
            pool_breakdown={},
            current_year=2024,
        )
    )
    assert result.increase_over_base == Decimal("0")
    assert result.tenant_share_before_cap == Decimal("0.00")
    assert result.total_recovery == Decimal("0.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
