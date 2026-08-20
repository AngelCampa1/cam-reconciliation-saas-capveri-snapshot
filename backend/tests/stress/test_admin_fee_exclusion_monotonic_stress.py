"""Metamorphic admin-fee pool-exclusion monotonicity for the orchestrator.

A lease can carve pools out of the *admin-fee base* (distinct from carving them out
of recovery): ``admin_fee_excluded_pools`` drops named pools from the base the admin
surcharge is drawn on. The engine does this by ratio (tenant_share.py): it forms
``inclusion_ratio = included_pools / total_pools`` and bills admin on
``tenant_share_after_cap * inclusion_ratio``. Excluding MORE pools shrinks the
inclusion ratio, so the admin base — and therefore the admin fee — can only stay the
same or fall. The recoverable share itself is untouched (admin exclusion is a
surcharge-base concern only), so it must be identical across the two runs, and the
total identity ``total_recovery == tenant_share_after_cap + admin_fee`` must hold in
both.

This drives the ratio-based admin-exclusion branch through the full
``run_property_reconciliation`` — a branch Cycle 70's plain-admin assembly test does
not exercise. A break — admin rising as more pools are excluded, the share shifting
when only the admin base should, or the total drifting off the identity — is a direct
over-bill of the admin surcharge. Cap-free and stop-free so the relation is
unconditional.

Run standalone:
    pytest tests/stress/test_admin_fee_exclusion_monotonic_stress.py -q
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

_CENT = Decimal("0.01")
_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"
_POOL_TYPES = ["operating", "tax", "insurance", "capital"]


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


def _lease(admin_excluded, *, pro_rata, admin):
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        admin_fee_excluded_pools=list(admin_excluded),
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
    )


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amounts=st.lists(money("0", "2000000"), min_size=4, max_size=4),
    types=st.lists(st.sampled_from(_POOL_TYPES), min_size=4, max_size=4),
    pro_rata=ratio("0.01", "0.9"),
    admin=ratio("0.0001", "0.5"),
    subset=st.sets(st.integers(min_value=0, max_value=3)),
    extra=st.integers(min_value=0, max_value=3),
)
def test_more_admin_exclusions_never_raise_admin_fee(
    sqft, amounts, types, pro_rata, admin, subset, extra
):
    """A superset of admin-excluded pools never increases the admin fee, leaves the
    recoverable share unchanged, and preserves the total identity in both runs."""
    names = [f"P{i}" for i in range(4)]
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=names[i],
            pool_type=types[i],
            total_amount=amounts[i],
            is_gross_up_applicable=False,
            gross_up_target=None,
        )
        for i in range(4)
    ]
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(sqft)

    sub_names = {names[i] for i in subset}
    sup_names = sub_names | {names[extra]}

    sub = _run(
        recon, [_lease(sub_names, pro_rata=pro_rata, admin=admin)], pool_map
    ).tenant_reconciliations[0]
    sup = _run(
        recon, [_lease(sup_names, pro_rata=pro_rata, admin=admin)], pool_map
    ).tenant_reconciliations[0]

    # Admin-base exclusion never touches the recoverable share.
    assert sup.tenant_share_after_cap == sub.tenant_share_after_cap
    # Excluding more pools from the admin base never raises the admin fee.
    assert sup.admin_fee <= sub.admin_fee + _CENT
    # Total identity holds in both runs.
    assert sub.total_recovery == sub.tenant_share_after_cap + sub.admin_fee
    assert sup.total_recovery == sup.tenant_share_after_cap + sup.admin_fee


def test_admin_exclusion_halves_fee_anchor():
    """Concrete anchor: two equal pools, one excluded from the admin base, gives a
    0.5 inclusion ratio — so the admin fee is exactly half the no-exclusion fee while
    the recoverable share is unchanged."""
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=name,
            pool_type="operating",
            total_amount=Decimal("150000.00"),
            is_gross_up_applicable=False,
            gross_up_target=None,
        )
        for name in ("P0", "P1")
    ]
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(Decimal("100000"))

    full = _run(
        recon, [_lease(set(), pro_rata=Decimal("0.5"), admin=Decimal("0.1"))], pool_map
    ).tenant_reconciliations[0]
    half = _run(
        recon,
        [_lease({"P1"}, pro_rata=Decimal("0.5"), admin=Decimal("0.1"))],
        pool_map,
    ).tenant_reconciliations[0]

    # 300k total * 0.5 share = 150k; full admin = 15k; excluding one of two equal
    # pools halves the admin base -> 7.5k. Share is untouched.
    assert full.tenant_share_after_cap == Decimal("150000.00")
    assert full.admin_fee == Decimal("15000.00")
    assert half.tenant_share_after_cap == Decimal("150000.00")
    assert half.admin_fee == Decimal("7500.00")
    assert half.total_recovery == Decimal("157500.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
