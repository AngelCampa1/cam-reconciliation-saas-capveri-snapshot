"""Metamorphic accounting-basis routing for the reconciliation orchestrator.

When ``pool_summaries_by_basis`` is supplied, each lease's tenant-share step uses
the pool set matching that lease's ``accounting_basis`` (cash vs accrual);
mixed-basis properties rely on this so a cash tenant is billed off the cash GL and
an accrual tenant off the accrual GL. This routing seam (orchestrator.py:414-418)
has no dedicated harness.

Two invariants:

  * **No cross-basis leak** — for a lease of basis B, supplying
    ``by_basis = {B: P, other: DECOY}`` (with the same top-level ``pool_summaries
    = P`` driving gross-up) is financially identical to supplying no per-basis map
    at all. The *other* basis's pools must never influence this tenant.
  * **Routing actually switches** — two otherwise-identical leases differing only
    in basis, routed to pool sets with different totals, get different shares.

A break is a mixed-basis mis-billing: a tenant charged off the wrong GL basis.

Run standalone:
    pytest tests/stress/test_basis_routing_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.enums import AccountingBasis
from app.services.calculation.caps import CapType
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
_POOL_TYPES = ["operating", "tax", "insurance", "capital", "other"]


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


def _pool(name, amount, ptype="operating", grossed=False):
    return ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name=name,
        pool_type=ptype,
        total_amount=amount,
        is_gross_up_applicable=grossed,
        gross_up_target=None,
    )


def _lease(basis, *, pro_rata=Decimal("0.5"), admin=Decimal("0.1")):
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
        accounting_basis=basis,
    )


def _recon_input(sqft):
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=sqft,
    )


def _run(input_data, leases, pools, by_basis=None):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(
                input_data, leases, pools, pool_summaries_by_basis=by_basis
            )

    return asyncio.run(_go())


def _financials(result):
    return (
        result.total_recovery,
        result.gross_up_factor,
        result.total_grossed_up_expenses,
        [
            (t.tenant_share_before_cap, t.tenant_share_after_cap, t.total_recovery)
            for t in result.tenant_reconciliations
        ],
    )


@STRESS
@given(
    sqft=money("1", "1000000"),
    basis=st.sampled_from([AccountingBasis.CASH, AccountingBasis.ACCRUAL]),
    primary_amt=money("0", "5000000"),
    decoy_amt=money("0", "5000000"),
    pro_rata=ratio("0", "0.9"),
    admin=ratio("0", "0.4"),
)
def test_other_basis_pools_never_leak(
    sqft, basis, primary_amt, decoy_amt, pro_rata, admin
):
    """For a lease of basis B, by_basis={B: P, other: DECOY} (top-level=P) is
    identical to by_basis=None. The non-matching basis must not influence it."""
    primary = [_pool("PRIMARY", primary_amt)]
    decoy = [_pool("DECOY", decoy_amt)]
    other = "accrual" if basis == AccountingBasis.CASH else "cash"
    primary_map = {p.pool_id: p for p in primary}
    by_basis = {
        basis.value: {p.pool_id: p for p in primary},
        other: {p.pool_id: p for p in decoy},
    }
    lease = _lease(basis, pro_rata=pro_rata, admin=admin)
    recon = _recon_input(sqft)

    without = _run(recon, [lease], primary_map)
    with_map = _run(recon, [lease], primary_map, by_basis=by_basis)
    assert _financials(without) == _financials(with_map)


def test_mixed_basis_tenant_recovers_off_its_own_basis_total():
    """Regression for BUG #19 (FIX MB-1): in a mixed cash/accrual property the API
    builds the top-level gross-up off the CASH basis only, then routes each lease to
    its basis pools. Each tenant must recover off ITS OWN basis grossed total — not
    the cash total. Here cash=100k, accrual=400k, flat gross-up, 0.5 share => the
    cash tenant recovers 50k and the accrual tenant 200k.

    Before the fix both recovered off the top-level total (the accrual tenant was
    billed off cash totals when it had no expense stops)."""
    cash_pools = {p.pool_id: p for p in [_pool("CASH", Decimal("100000.00"))]}
    accr_pools = {p.pool_id: p for p in [_pool("ACCR", Decimal("400000.00"))]}
    by_basis = {"cash": cash_pools, "accrual": accr_pools}
    cash_lease = _lease(AccountingBasis.CASH)
    accr_lease = _lease(AccountingBasis.ACCRUAL)
    result = _run(
        _recon_input(Decimal("100000")),
        [cash_lease, accr_lease],
        cash_pools,  # top-level = cash, mirroring reconciliation.py
        by_basis=by_basis,
    )
    cash_t, accr_t = result.tenant_reconciliations
    assert cash_t.tenant_share_before_cap == Decimal("50000.00")
    assert accr_t.tenant_share_before_cap == Decimal("200000.00")


def test_single_basis_unaffected_by_fix():
    """The single-basis fast path (by_basis=None) is byte-identical: routing never
    fires, so the recoverable base is still the top-level gross-up total."""
    pools = {p.pool_id: p for p in [_pool("P", Decimal("100000.00"))]}
    lease = _lease(AccountingBasis.CASH)
    t = _run(_recon_input(Decimal("100000")), [lease], pools).tenant_reconciliations[0]
    assert t.tenant_share_before_cap == Decimal("50000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
