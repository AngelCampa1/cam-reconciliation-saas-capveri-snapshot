"""Metamorphic proration-factor monotonicity for the reconciliation orchestrator.

A lease's ``proration_factor`` scales its pre-cap share for partial-period
occupancy: ``tenant_share_before_cap *= proration_factor`` (tenant_share.py). Holding
pools, pro-rata, and admin fixed, a LARGER proration factor (more of the period
occupied) can only raise — never lower — the tenant's pre-cap share, post-cap share,
and total recovery. Recovery is monotone non-decreasing in occupancy duration.

This drives the proration seam through the full ``run_property_reconciliation`` and
pins it as a separate multiplication site from pool/expense scaling. A break —
recovery falling as occupancy grows — would be an inverted factor or a misplaced
quantize that a single-run test cannot catch. Cap-free so the relation is
unconditional (a cap ceiling is a fixed clamp that would flatten the top end, still
monotone but less informative).

Run standalone:
    pytest tests/stress/test_proration_monotonic_stress.py -q
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


def _lease(proration, *, pro_rata=Decimal("0.5"), admin=Decimal("0.1")):
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=proration,
    )


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amounts=st.lists(money("0", "2000000"), min_size=1, max_size=4),
    types=st.lists(st.sampled_from(_POOL_TYPES), min_size=4, max_size=4),
    grossed=st.lists(st.booleans(), min_size=4, max_size=4),
    pro_rata=ratio("0", "0.9"),
    admin=ratio("0", "0.4"),
    pror_lo=ratio("0", "0.9"),
    delta=ratio("0", "0.9"),
)
def test_higher_proration_never_lowers_recovery(
    sqft, amounts, types, grossed, pro_rata, admin, pror_lo, delta
):
    """A larger proration_factor (more of the period occupied) never decreases the
    tenant's pre-cap share, post-cap share, or total recovery."""
    pror_hi = pror_lo + delta
    assume(pror_hi <= Decimal("1"))

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
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(sqft)

    lo = _run(
        recon, [_lease(pror_lo, pro_rata=pro_rata, admin=admin)], pool_map
    ).tenant_reconciliations[0]
    hi = _run(
        recon, [_lease(pror_hi, pro_rata=pro_rata, admin=admin)], pool_map
    ).tenant_reconciliations[0]

    assert hi.tenant_share_before_cap >= lo.tenant_share_before_cap - _CENT
    assert hi.tenant_share_after_cap >= lo.tenant_share_after_cap - _CENT
    assert hi.total_recovery >= lo.total_recovery - _CENT


def test_half_proration_halves_share_anchor():
    """Concrete anchor: a 0.5 proration factor exactly halves an otherwise-150k
    pre-cap share (0.5 share on a flat 300k pool, no gross-up, no cap)."""
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

    full = _run(
        recon, [_lease(Decimal("1"), admin=Decimal("0"))], pool_map
    ).tenant_reconciliations[0]
    half = _run(
        recon, [_lease(Decimal("0.5"), admin=Decimal("0"))], pool_map
    ).tenant_reconciliations[0]

    assert full.tenant_share_before_cap == Decimal("150000.00")
    assert half.tenant_share_before_cap == Decimal("75000.00")
    assert half.total_recovery * 2 == full.total_recovery


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
