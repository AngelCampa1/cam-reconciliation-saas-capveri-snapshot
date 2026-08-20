"""Metamorphic scaling (positive-homogeneity) invariance for the reconciliation
orchestrator.

A CAM reconciliation with no cap ratchet and no expense stops is positively
homogeneous of degree 1 in the expense amounts: if every pool's ``total_amount``
is multiplied by a constant ``k > 0``, then every tenant's recovery, pre-cap
share, and admin fee must scale by exactly ``k`` — while the gross-up FACTOR
(building-occupancy based, independent of dollar amounts) stays INVARIANT.

This drives the whole per-tenant pipeline (gross-up -> basis routing -> exclusions
-> tenant share -> admin fee) and pins linearity end-to-end. A break would expose a
hidden additive term, a non-proportional clamp, or a dropped/duplicated factor
somewhere in the chain — none of which a single-run test would catch.

Why these guardrails:
  * **Cap-free** (``CapType.NONE``) — a ratchet ceiling is a fixed dollar clamp,
    which is NOT homogeneous (scaling expenses past the cap stops scaling
    recovery).
  * **No expense stops** — a stop is a fixed $/sqft threshold, an additive
    (affine) term that breaks pure scaling.
  * **Integer ``k`` in [2, 10]** — scaling commutes with cent-quantization only up
    to rounding; a small integer keeps the per-tenant rounding gap to < k cents so
    the invariant stays crisp with a tight tolerance.

Run standalone:
    pytest tests/stress/test_scaling_invariance_stress.py -q
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


def _tenant_vec(result):
    return [
        (t.tenant_share_before_cap, t.admin_fee, t.total_recovery)
        for t in result.tenant_reconciliations
    ]


@STRESS
@given(
    sqft=money("1000", "1000000"),
    amounts=st.lists(money("0", "2000000"), min_size=1, max_size=4),
    types=st.lists(st.sampled_from(_POOL_TYPES), min_size=4, max_size=4),
    grossed=st.lists(st.booleans(), min_size=4, max_size=4),
    shares=st.lists(ratio("0", "0.45"), min_size=1, max_size=3),
    admins=st.lists(ratio("0", "0.4"), min_size=1, max_size=3),
    k=st.integers(min_value=2, max_value=10),
)
def test_scaling_pool_amounts_scales_recovery(
    sqft, amounts, types, grossed, shares, admins, k
):
    """Multiplying every pool amount by integer k scales every tenant's pre-cap
    share, admin fee, and total recovery by k; the gross-up factor is invariant."""
    n_pools = len(amounts)
    n_tenants = min(len(shares), len(admins))
    kd = Decimal(k)

    base_pools = [
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
    scaled_pools = [
        ExpensePoolSummary(
            pool_id=p.pool_id,
            pool_name=p.pool_name,
            pool_type=p.pool_type,
            total_amount=p.total_amount * kd,
            is_gross_up_applicable=p.is_gross_up_applicable,
            gross_up_target=None,
        )
        for p in base_pools
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

    base = _run(recon, leases, {p.pool_id: p for p in base_pools})
    scaled = _run(recon, leases, {p.pool_id: p for p in scaled_pools})

    # Gross-up factor is occupancy-based — dollar-amount independent.
    assert scaled.gross_up_factor == base.gross_up_factor

    # Scaling commutes with cent-quantization up to a < k-cent rounding gap per
    # quantized term; tenant total_recovery sums two such terms.
    share_tol = (k + 1) * Decimal("0.01")
    recovery_tol = (2 * k + 2) * Decimal("0.01")
    for (b_share, b_admin, b_total), (s_share, s_admin, s_total) in zip(
        _tenant_vec(base), _tenant_vec(scaled)
    ):
        assert abs(s_share - kd * b_share) <= share_tol
        assert abs(s_admin - kd * b_admin) <= share_tol
        assert abs(s_total - kd * b_total) <= recovery_tol


def test_scaling_anchor_exact_doubling():
    """Concrete anchor: doubling a single flat pool exactly doubles a 0.25-share
    tenant's recovery (no gross-up, no admin, no cap, no rounding ambiguity)."""
    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="P",
        pool_type="operating",
        total_amount=Decimal("100000.00"),
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    pool2x = ExpensePoolSummary(
        pool_id=pool.pool_id,
        pool_name="P",
        pool_type="operating",
        total_amount=Decimal("200000.00"),
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    lease = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=Decimal("0.25"),
        admin_fee_percentage=Decimal("0"),
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
    )
    recon = _recon_input(Decimal("100000"))
    base = _run(recon, [lease], {pool.pool_id: pool}).tenant_reconciliations[0]
    scaled = _run(recon, [lease], {pool2x.pool_id: pool2x}).tenant_reconciliations[0]
    assert base.tenant_share_before_cap == Decimal("25000.00")
    assert scaled.tenant_share_before_cap == Decimal("50000.00")
    assert scaled.total_recovery == base.total_recovery * 2


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
