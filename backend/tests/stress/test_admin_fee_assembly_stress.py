"""Property-based admin-fee / total-recovery assembly invariants for the
reconciliation orchestrator.

The final per-tenant assembly (tenant_share.py) is exact and must always hold,
whatever the upstream share works out to:

  * **Total identity** — ``total_recovery == tenant_share_after_cap + admin_fee``,
    exactly, for ANY configuration (caps, stops, exclusions, admin cap). The total
    is the share plus its surcharge, nothing else.
  * **Admin-fee formula (plain path)** — with no admin-excluded pools and no admin
    cap, ``admin_fee == round_half_up(tenant_share_after_cap * admin_pct, cents)``.
    Admin is a surcharge on the post-cap share, not a fresh draw on raw expenses.
  * **Admin-cap clamp** — when an ``admin_fee_cap`` is set, the realized admin fee
    never exceeds it.

These pin the assembly seam end-to-end through ``run_property_reconciliation``. A
break — a total that double-counts, an admin fee drawn off the pre-cap share, or a
cap that fails to clamp — is a direct over/under-bill a single-run test can miss.

Run standalone:
    pytest tests/stress/test_admin_fee_assembly_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
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


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amounts=st.lists(money("0", "2000000"), min_size=1, max_size=4),
    types=st.lists(st.sampled_from(_POOL_TYPES), min_size=4, max_size=4),
    grossed=st.lists(st.booleans(), min_size=4, max_size=4),
    pro_rata=ratio("0", "0.9"),
    admin=ratio("0", "0.5"),
)
def test_plain_admin_fee_and_total_identity(
    sqft, amounts, types, grossed, pro_rata, admin
):
    """No admin exclusions, no admin cap: admin_fee is exactly the rounded surcharge
    on the post-cap share, and total = share + admin exactly."""
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=f"P{i}",
            pool_type=types[i],
            total_amount=amounts[i],
            is_gross_up_applicable=grossed[i],
            gross_up_target=None,
        )
        for i in range(len(amounts))
    ]
    lease = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
    )
    t = _run(
        _recon_input(sqft), [lease], {p.pool_id: p for p in pools}
    ).tenant_reconciliations[0]

    expected_admin = (t.tenant_share_after_cap * admin).quantize(
        _CENT, rounding=ROUND_HALF_UP
    )
    assert t.admin_fee == expected_admin
    assert t.total_recovery == t.tenant_share_after_cap + t.admin_fee


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amount=money("0", "3000000"),
    pro_rata=ratio("0", "0.9"),
    admin=ratio("0", "0.5"),
    cap_amt=money("0", "1000"),
)
def test_admin_fee_cap_clamps(sqft, amount, pro_rata, admin, cap_amt):
    """A configured admin_fee_cap is never exceeded by the realized admin fee, and
    the total identity still holds."""
    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="OP",
        pool_type="operating",
        total_amount=amount,
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    lease = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        admin_fee_cap=cap_amt,
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
    )
    t = _run(_recon_input(sqft), [lease], {pool.pool_id: pool}).tenant_reconciliations[
        0
    ]

    assert t.admin_fee <= cap_amt + _CENT
    assert t.total_recovery == t.tenant_share_after_cap + t.admin_fee


def test_admin_fee_anchor():
    """Concrete anchor: 0.5 share on a flat 300k pool gives a 150k post-cap share;
    a 10% admin fee is exactly 15k and total recovery is 165k."""
    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="OP",
        pool_type="operating",
        total_amount=Decimal("300000.00"),
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    lease = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=Decimal("0.5"),
        admin_fee_percentage=Decimal("0.1"),
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
    )
    t = _run(
        _recon_input(Decimal("100000")), [lease], {pool.pool_id: pool}
    ).tenant_reconciliations[0]
    assert t.tenant_share_after_cap == Decimal("150000.00")
    assert t.admin_fee == Decimal("15000.00")
    assert t.total_recovery == Decimal("165000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
