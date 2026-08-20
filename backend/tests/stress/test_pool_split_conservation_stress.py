"""Metamorphic pool-split conservation for the reconciliation orchestrator.

A reconciliation must not care *how an expense total is bucketed* — only the
totals, types, and gross-up flags matter. Splitting one expense pool into two
pools (same ``pool_type`` and ``is_gross_up_applicable``, distinct names, amounts
summing exactly to the original) must leave every tenant's recovery unchanged.

This is the conservation twin of the metamorphic harness: the orchestrator e2e
harness checks per-pool breakdown reconciles *within* one run; here we check the
*aggregate* recovery is invariant *across* two runs that differ only in pool
granularity. A break would mean billing depends on how the GL happens to be
grouped — a real mis-billing (e.g. a per-pool rounding or cap-attribution path
that double-counts or drops cents when a pool is subdivided).

Kept cap-free so the invariant is crisp: with no cap ratchet, total recovery is a
pure function of the grossed expense total and lease terms, which subdivision
preserves exactly.

Run standalone:
    pytest tests/stress/test_pool_split_conservation_stress.py -q
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


def _pool(name: str, amount: Decimal, pool_type: str, grossed: bool):
    # gross_up_target pinned to None so the gross-up factor depends only on
    # occupancy, never on pool composition — which is what makes the split exact.
    return ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name=name,
        pool_type=pool_type,
        total_amount=amount,
        is_gross_up_applicable=grossed,
        gross_up_target=None,
    )


@st.composite
def lease_terms(draw):
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name=draw(st.text(min_size=1, max_size=10)),
        pro_rata_share=draw(ratio("0", "0.9")),
        admin_fee_percentage=draw(ratio("0", "0.4")),
        tenant_sqft=draw(money("0", "1000000")),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=draw(ratio("0.5", "1")),
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


def _totals(result):
    """Aggregate billing figures — invariant under pool subdivision. Per-pool
    breakdowns legitimately change granularity, so they are NOT compared."""
    return (
        result.total_recovery,
        result.gross_up_factor,
        result.total_grossed_up_expenses,
        result.total_operating_expenses,
        [
            (t.tenant_share_after_cap, t.admin_fee, t.total_recovery)
            for t in result.tenant_reconciliations
        ],
    )


@STRESS
@given(
    sqft=money("1", "1000000"),
    amount=money("0", "5000000"),
    pool_type=st.sampled_from(_POOL_TYPES),
    grossed=st.booleans(),
    frac=ratio("0.01", "0.99"),
    others=st.lists(
        st.builds(
            _pool,
            name=st.sampled_from(["A", "B", "C"]),
            amount=money("0", "5000000"),
            pool_type=st.sampled_from(_POOL_TYPES),
            grossed=st.booleans(),
        ),
        max_size=2,
    ),
    leases=st.lists(lease_terms(), min_size=1, max_size=4),
)
def test_pool_split_conserves_recovery(
    sqft, amount, pool_type, grossed, frac, others, leases
):
    # Split the target pool into two cent-exact halves summing to `amount`.
    part1 = (amount * frac).quantize(_CENT, rounding=ROUND_HALF_UP)
    part2 = amount - part1
    assert part1 + part2 == amount  # exact conservation by construction

    # Distinct names everywhere (pool_breakdown keys by name; collisions would
    # drop a pool and confound the comparison).
    others = [
        _pool(f"O{i}", p.total_amount, p.pool_type, p.is_gross_up_applicable)
        for i, p in enumerate(others)
    ]

    whole = [_pool("ORIG", amount, pool_type, grossed), *others]
    split = [
        _pool("ORIG_1", part1, pool_type, grossed),
        _pool("ORIG_2", part2, pool_type, grossed),
        *others,
    ]

    recon = _recon_input(sqft)
    r_whole = _run(recon, leases, {p.pool_id: p for p in whole})
    r_split = _run(recon, leases, {p.pool_id: p for p in split})

    # Totals must match to the cent (per-tenant largest-remainder allocation can
    # move at most a cent when the pool count changes).
    tw, ts = _totals(r_whole), _totals(r_split)
    assert abs(tw[0] - ts[0]) <= _CENT  # property total_recovery
    assert tw[1] == ts[1]  # gross_up_factor unchanged
    assert abs(tw[2] - ts[2]) <= _CENT  # grossed-up expenses
    assert abs(tw[3] - ts[3]) <= _CENT  # operating expenses
    for (w_share, w_admin, w_rec), (s_share, s_admin, s_rec) in zip(tw[4], ts[4]):
        assert abs(w_share - s_share) <= _CENT
        assert abs(w_admin - s_admin) <= _CENT
        assert abs(w_rec - s_rec) <= _CENT


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
