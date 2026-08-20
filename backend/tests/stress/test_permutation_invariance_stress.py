"""Metamorphic permutation invariance for the reconciliation orchestrator.

A property reconciliation must not depend on the ORDER in which leases or expense
pools are presented: each tenant's result is a pure function of its own lease and
the (unordered) set of pools, with no cross-tenant coupling. So permuting the lease
list and/or the pool set must leave every tenant's result byte-identical (keyed by
tenant identity) and the property totals unchanged — EXACTLY, no tolerance.

This is a strong coupling/aliasing probe: an order-dependent result would betray
hidden shared mutable state in the per-tenant loop (a pool_breakdown dict reused
across tenants, an accumulator not reset, an in-place sort, or the basis-routing
identity check keying off iteration order). Exact equality makes any such leak a
hard failure.

Run standalone:
    pytest tests/stress/test_permutation_invariance_stress.py -q
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


def _recon_input(sqft):
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=sqft,
    )


def _run(input_data, leases, pools):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


def _by_tenant(result):
    """Map each tenant's identity to its full financial fingerprint, so we compare
    by identity rather than by output position."""
    return {
        t.lease_id: (
            t.tenant_share_before_cap,
            t.tenant_share_after_cap,
            t.admin_fee,
            t.total_recovery,
        )
        for t in result.tenant_reconciliations
    }


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amounts=st.lists(money("0", "3000000"), min_size=2, max_size=4),
    types=st.lists(st.sampled_from(_POOL_TYPES), min_size=4, max_size=4),
    grossed=st.lists(st.booleans(), min_size=4, max_size=4),
    shares=st.lists(ratio("0", "0.3"), min_size=2, max_size=4),
    admins=st.lists(ratio("0", "0.4"), min_size=2, max_size=4),
    data=st.data(),
)
def test_reorder_leases_and_pools_is_invariant(
    sqft, amounts, types, grossed, shares, admins, data
):
    n_pools = len(amounts)
    n_tenants = min(len(shares), len(admins))

    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=f"P{i}",
            pool_type=types[i],
            total_amount=amounts[i],
            is_gross_up_applicable=grossed[i],
            gross_up_target=None,
        )
        for i in range(n_pools)
    ]
    leases = [
        LeaseTerms(
            lease_id=uuid4(),
            tenant_name=f"T{j}",
            pro_rata_share=shares[j],
            admin_fee_percentage=admins[j],
            tenant_sqft=Decimal("10000"),
            cap_type=CapType.NONE,
            cap_rate=None,
            proration_factor=Decimal("1"),
        )
        for j in range(n_tenants)
    ]
    recon = _recon_input(sqft)

    lease_perm = data.draw(st.permutations(leases))
    pool_perm = data.draw(st.permutations(pools))

    base = _run(recon, list(leases), {p.pool_id: p for p in pools})
    permuted = _run(recon, list(lease_perm), {p.pool_id: p for p in pool_perm})

    # Property-level totals are order-independent.
    assert permuted.gross_up_factor == base.gross_up_factor
    assert permuted.total_grossed_up_expenses == base.total_grossed_up_expenses
    assert permuted.total_recovery == base.total_recovery
    # Each tenant (by identity) is byte-identical — no cross-tenant coupling.
    assert _by_tenant(permuted) == _by_tenant(base)


def test_reverse_order_anchor():
    """Concrete anchor: reversing two distinct-share tenants and their pools leaves
    each tenant's recovery exactly unchanged."""
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=name,
            pool_type="operating",
            total_amount=amt,
            is_gross_up_applicable=False,
            gross_up_target=None,
        )
        for name, amt in (("A", Decimal("100000.00")), ("B", Decimal("250000.00")))
    ]
    leases = [
        LeaseTerms(
            lease_id=uuid4(),
            tenant_name=name,
            pro_rata_share=share,
            admin_fee_percentage=Decimal("0.1"),
            tenant_sqft=Decimal("10000"),
            cap_type=CapType.NONE,
            cap_rate=None,
            proration_factor=Decimal("1"),
        )
        for name, share in (("T1", Decimal("0.3")), ("T2", Decimal("0.45")))
    ]
    recon = _recon_input(Decimal("100000"))
    base = _run(recon, leases, {p.pool_id: p for p in pools})
    rev = _run(recon, list(reversed(leases)), {p.pool_id: p for p in reversed(pools)})
    assert _by_tenant(rev) == _by_tenant(base)
    assert rev.total_recovery == base.total_recovery


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
