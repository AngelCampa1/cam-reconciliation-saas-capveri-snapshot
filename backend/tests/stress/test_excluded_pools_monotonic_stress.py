"""Metamorphic excluded-pools monotonicity for the reconciliation orchestrator.

A lease's ``excluded_pools`` removes named pools from the recoverable base
(orchestrator → tenant_share: ``net_recoverable = total - excluded_amount``).
Therefore, for non-negative pools, excluding ANY subset must never *raise* a
tenant's recovery versus excluding nothing — exclusions only ever carve expense
out, they cannot add it back.

This drives the exclusion seam through the WHOLE pipeline (gross-up → exclusion →
tenant share → admin fee) and pins the monotone relation between two runs that
differ only in the lease's ``excluded_pools`` set. A break would mean a tenant
who excludes a pool gets billed MORE — a clear mis-billing (e.g. a sign slip or a
grossed-vs-original mismatch double-counting the carve-out).

Pools are kept non-negative so the relation is unconditional (excluding a
net-credit pool legitimately *raises* the base, which is correct, not a bug).

Run standalone:
    pytest tests/stress/test_excluded_pools_monotonic_stress.py -q
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
    sqft=money("1", "1000000"),
    amounts=st.lists(money("0", "5000000"), min_size=1, max_size=4),
    types=st.lists(st.sampled_from(_POOL_TYPES), min_size=4, max_size=4),
    grossed=st.lists(st.booleans(), min_size=4, max_size=4),
    excl_mask=st.lists(st.booleans(), min_size=4, max_size=4),
    pro_rata=ratio("0", "0.9"),
    admin=ratio("0", "0.4"),
    data=st.data(),
)
def test_excluding_pools_never_raises_recovery(
    sqft, amounts, types, grossed, excl_mask, pro_rata, admin, data
):
    # Distinct pool names so exclusion-by-name and the name-keyed breakdown line up.
    names = [f"P{i}" for i in range(len(amounts))]
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=names[i],
            pool_type=types[i],
            total_amount=amounts[i],
            is_gross_up_applicable=grossed[i],
            gross_up_target=None,
        )
        for i in range(len(amounts))
    ]
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(sqft)

    excluded = [names[i] for i in range(len(amounts)) if excl_mask[i]]
    # At least one real exclusion, else the two runs are identical (still valid,
    # just not informative).
    if not excluded:
        excluded = [data.draw(st.sampled_from(names))]

    base = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
    )
    excl = LeaseTerms.model_validate(
        base.model_dump(mode="python") | {"excluded_pools": excluded}
    )

    t_base = _run(recon, [base], pool_map).tenant_reconciliations[0]
    t_excl = _run(recon, [excl], pool_map).tenant_reconciliations[0]

    # Excluding non-negative pools only ever carves expense out.
    assert t_excl.tenant_share_before_cap <= t_base.tenant_share_before_cap + _CENT
    assert t_excl.tenant_share_after_cap <= t_base.tenant_share_after_cap + _CENT
    assert t_excl.admin_fee <= t_base.admin_fee + _CENT
    assert t_excl.total_recovery <= t_base.total_recovery + _CENT
    # And recoveries stay non-negative.
    assert t_excl.total_recovery >= Decimal("0") - _CENT


def test_exclude_all_pools_yields_zero_recovery():
    """Excluding every (non-negative) pool drives the recoverable base to zero,
    so the tenant recovers nothing — a concrete anchor for the monotone end."""
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=name,
            pool_type="operating",
            total_amount=Decimal("100000.00"),
            is_gross_up_applicable=False,
            gross_up_target=None,
        )
        for name in ("P0", "P1")
    ]
    lease = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=Decimal("0.5"),
        admin_fee_percentage=Decimal("0.1"),
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
        excluded_pools=["P0", "P1"],
    )
    t = _run(
        _recon_input(Decimal("100000")), [lease], {p.pool_id: p for p in pools}
    ).tenant_reconciliations[0]
    assert t.tenant_share_before_cap == Decimal("0")
    assert t.total_recovery == Decimal("0")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
