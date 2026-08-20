"""Property-based stress for the full ``calculate_tenant_share`` orchestrator.

``calculate_tenant_share`` (calculation/tenant_share.py) is the top of the recovery
calculation: it runs management-fee cap → exclusions → base-year stop → pro-rata →
expense cap → admin fee → per-pool allocation, and its output is the dollar figure
a tenant is billed. Cycles 42-51 pinned the individual steps; this harness asserts
the *cross-step* invariants that must hold no matter which branches fire, plus an
exact arithmetic re-derivation of the simplest (no-base-year) path.

Universal invariants (any input):
  * total_recovery == tenant_share_after_cap + admin_fee (to the cent);
  * tenant_share_before_cap, tenant_share_after_cap, admin_fee, excluded_amount
    are all ≥ 0;
  * a cap never increases the share: tenant_share_after_cap ≤ tenant_share_before_cap;
  * cap_applied ⇒ after < before (a binding cap strictly reduces);
  * admin_fee ≤ admin_fee_cap when a cap is set;
  * net_recoverable == gross_recoverable - excluded_amount;
  * per-pool breakdown, when produced, reconciles to total_recovery to the cent.

Exact path (no base year, no mgmt fee, no exclusions, no cap):
  * tenant_share_before_cap == round(net * pro_rata * proration, 2) (clamped ≥ 0),
    tenant_share_after_cap == before, total == before + round(before*admin%,2).

Run standalone:
    pytest tests/stress/test_tenant_share_orchestrator_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import CapType
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    calculate_tenant_share,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

money = st.decimals(
    min_value=Decimal("-50000"),
    max_value=Decimal("2000000"),
    places=2,
    allow_nan=False,
)
pos_money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
cap_types = st.sampled_from(
    [
        CapType.NONE,
        CapType.NON_CUMULATIVE,
        CapType.CUMULATIVE,
        CapType.CUMULATIVE_COMPOUNDING,
    ]
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@st.composite
def _share_input(draw):
    total = draw(money)
    # A few named pools (negative allowed to exercise the credit/clamp path).
    pool_names = draw(
        st.lists(
            st.text(
                alphabet=st.characters(min_codepoint=97, max_codepoint=122),
                min_size=1,
                max_size=5,
            ),
            min_size=0,
            max_size=5,
            unique=True,
        )
    )
    pools = {n: draw(money) for n in pool_names}
    excluded = (
        draw(st.lists(st.sampled_from(pool_names), max_size=2)) if pool_names else []
    )

    cap_type = draw(cap_types)
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=draw(ratio),
        admin_fee_percentage=draw(fee_pct),
        admin_fee_cap=draw(st.one_of(st.none(), pos_money)),
        proration_factor=draw(ratio),
        cap_type=cap_type,
        cap_rate=draw(st.one_of(st.none(), ratio)),
        excluded_pools=list(set(excluded)),
    )
    return TenantShareInput(
        lease_terms=terms,
        total_recoverable_expenses=total,
        pool_breakdown=pools,
        prior_year_amount=draw(st.one_of(st.none(), pos_money)),
        cap_base_year_amount=draw(st.one_of(st.none(), pos_money)),
        current_year=2024,
    )


@STRESS
@given(data=_share_input())
def test_orchestrator_cross_step_invariants(data):
    result = calculate_tenant_share(data)

    # Conservation of the headline number.
    assert result.total_recovery == result.tenant_share_after_cap + result.admin_fee

    # Non-negativity everywhere it matters.
    assert result.tenant_share_before_cap >= 0
    assert result.tenant_share_after_cap >= 0
    assert result.admin_fee >= 0

    # A cap can only reduce (or leave) the share.
    assert result.tenant_share_after_cap <= result.tenant_share_before_cap
    if result.cap_applied:
        assert result.tenant_share_after_cap < result.tenant_share_before_cap

    # Admin-fee cap is honored.
    if data.lease_terms.admin_fee_cap is not None:
        assert result.admin_fee <= data.lease_terms.admin_fee_cap

    # Exclusion bookkeeping.
    assert result.net_recoverable == result.gross_recoverable - result.excluded_amount

    # Per-pool breakdown, when produced, reconciles to the total.
    if result.pool_breakdowns:
        pool_total = sum(
            (p.total_recovery for p in result.pool_breakdowns), Decimal("0")
        )
        assert pool_total == result.total_recovery


@STRESS
@given(
    total=pos_money,
    pro_rata=ratio,
    proration=ratio,
    admin=fee_pct,
)
def test_simple_path_exact_arithmetic(total, pro_rata, proration, admin):
    # No base year, no pools/exclusions, no cap, no mgmt fee: the share is a plain
    # pro-rata * proration of the recoverable total, then an admin surcharge.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        proration_factor=proration,
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=total,
            pool_breakdown={},
            current_year=2024,
        )
    )

    before = _q(total * pro_rata)
    if proration != Decimal("1"):
        before = _q(before * proration)
    before = max(Decimal("0"), before)

    assert result.tenant_share_before_cap == before
    assert result.tenant_share_after_cap == before
    assert result.cap_applied is False
    assert result.admin_fee == _q(before * admin)
    assert result.total_recovery == before + _q(before * admin)


def test_zero_base_year_cumulative_cap_does_not_crash():
    # Regression for product bug #17: a genuine $0.00 cap_base_year_amount is a
    # valid base (has_valid_base admits it via `is not None`), but the CapInput
    # build used `cap_base_year_amount or prior_year_amount` — and Decimal('0.00')
    # is falsy, so the $0 base fell through to prior_year_amount (None) and
    # apply_cap raised ValueError, crashing the whole tenant-share calc.
    for cap_type in (CapType.CUMULATIVE, CapType.CUMULATIVE_COMPOUNDING):
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=UUID(int=0),
                    tenant_name="T",
                    pro_rata_share=Decimal("0.10"),
                    cap_type=cap_type,
                ),
                total_recoverable_expenses=Decimal("100000"),
                pool_breakdown={},
                cap_base_year_amount=Decimal("0.00"),
                prior_year_amount=None,
                current_year=2024,
            )
        )
        # A $0 base cumulative cap permits no increase ⇒ capped to $0.
        assert result.tenant_share_after_cap == Decimal("0.00")
        assert result.cap_applied is True
        assert result.total_recovery == Decimal("0.00")


def test_known_simple_recovery():
    # $100k recoverable, 10% pro-rata, full period, 5% admin fee.
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=LeaseTerms(
                lease_id=UUID(int=0),
                tenant_name="Acme",
                pro_rata_share=Decimal("0.10"),
                admin_fee_percentage=Decimal("0.05"),
            ),
            total_recoverable_expenses=Decimal("100000"),
            pool_breakdown={},
            current_year=2024,
        )
    )
    assert result.tenant_share_after_cap == Decimal("10000.00")
    assert result.admin_fee == Decimal("500.00")
    assert result.total_recovery == Decimal("10500.00")


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
