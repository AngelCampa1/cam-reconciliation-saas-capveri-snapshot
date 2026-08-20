"""Metamorphic cap-rate monotonicity for the reconciliation orchestrator.

A non-cumulative cap limits a tenant's recovery to ``prior_year * (1 + cap_rate)``.
Holding everything else fixed — same pools, same lease, same injected prior-year
history — a HIGHER ``cap_rate`` raises the ceiling, so the tenant's post-cap share
and total recovery can only stay the same or INCREASE; they can never decrease. A
looser cap never costs the landlord recovery.

This drives the cap/ratchet seam through the full ``run_property_reconciliation``
(orchestrator builds ``TenantShareInput`` with the fetched ``prior_year_amount`` and
``apply_cap`` clamps to ``prior * (1 + rate)``). A break — recovery falling as the
cap loosens — would be a sign slip or an inverted comparison in the ceiling, a real
mis-billing that under-recovers the landlord.

Guardrails: all pools ``operating`` (controllable, so the whole share is cappable —
tax/insurance/capital are cap-exempt and would dilute the relation); a fixed
non-zero injected ``prior_year_amount`` so the cap has a meaningful baseline (a zero
prior disables the cap per FIX CAP-4); cap rates in [0, 1] (the validated range).

Run standalone:
    pytest tests/stress/test_cap_rate_monotonic_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import CapType
from app.services.calculation.data_fetcher import TenantCapHistory
from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.orchestrator import (
    ReconciliationInput,
    run_property_reconciliation,
)
from app.services.calculation.tenant_share import LeaseTerms

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_CENT = Decimal("0.01")
_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"


def money(min_v: str, max_v: str):
    return st.decimals(
        min_value=Decimal(min_v),
        max_value=Decimal(max_v),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def ratio(min_v: str = "0", max_v: str = "1"):
    return st.decimals(
        min_value=Decimal(min_v),
        max_value=Decimal(max_v),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    )


def _recon_input(sqft):
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=sqft,
    )


def _run(input_data, leases, pools, prior):
    """Run with a fixed prior-year cap history injected for every lease."""

    def _history(*_args, **_kwargs):
        return {
            lease.lease_id: TenantCapHistory(
                prior_year_amount=prior,
                all_prior_amounts=[prior],
                cap_base_year_amount=prior,
            )
            for lease in leases
        }

    async def _go():
        with patch(_PATCH_TARGET, side_effect=_history):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


def _lease(cap_rate):
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=Decimal("0.5"),
        admin_fee_percentage=Decimal("0.1"),
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NON_CUMULATIVE,
        cap_rate=cap_rate,
        proration_factor=Decimal("1"),
    )


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amount=money("0", "3000000"),
    prior=money("1000", "2000000"),
    rate_lo=ratio("0", "0.5"),
    delta=ratio("0", "0.5"),
)
def test_higher_cap_rate_never_lowers_recovery(sqft, amount, prior, rate_lo, delta):
    """Raising cap_rate (looser ceiling) never decreases the tenant's post-cap
    share or total recovery."""
    rate_hi = rate_lo + delta
    assume(rate_hi <= Decimal("1"))

    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="OP",
        pool_type="operating",
        total_amount=amount,
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    pool_map = {pool.pool_id: pool}
    recon = _recon_input(sqft)

    lo = _run(recon, [_lease(rate_lo)], pool_map, prior).tenant_reconciliations[0]
    hi = _run(recon, [_lease(rate_hi)], pool_map, prior).tenant_reconciliations[0]

    assert hi.tenant_share_after_cap >= lo.tenant_share_after_cap - _CENT
    assert hi.total_recovery >= lo.total_recovery - _CENT


def test_cap_binds_then_loosens_anchor():
    """Concrete anchor: with prior=100k and a 0.5 share on a 300k pool, the pre-cap
    share is 150k. A 5% cap clamps to 105k; a 60% cap (ceiling 160k) lets the full
    150k through. Looser cap recovers strictly more."""
    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="OP",
        pool_type="operating",
        total_amount=Decimal("300000.00"),
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    pool_map = {pool.pool_id: pool}
    recon = _recon_input(Decimal("100000"))
    prior = Decimal("100000.00")

    tight = _run(
        recon, [_lease(Decimal("0.05"))], pool_map, prior
    ).tenant_reconciliations[0]
    loose = _run(
        recon, [_lease(Decimal("0.60"))], pool_map, prior
    ).tenant_reconciliations[0]

    assert tight.tenant_share_before_cap == Decimal("150000.00")
    assert tight.tenant_share_after_cap == Decimal("105000.00")  # 100k * 1.05
    assert loose.tenant_share_after_cap == Decimal("150000.00")  # ceiling 160k > 150k
    assert loose.total_recovery > tight.total_recovery


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
