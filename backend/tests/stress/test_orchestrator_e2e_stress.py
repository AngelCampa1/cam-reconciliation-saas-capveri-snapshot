"""End-to-end property-based stress test for the deterministic reconciliation
orchestrator (`run_property_reconciliation`).

This drives the FULL in-memory calculation pipeline — gross-up, pool
aggregation, tenant share, caps, admin fees, per-pool allocation — over a large
adversarial input space and asserts the cross-cutting invariants that must hold
for ANY valid reconciliation:

  * gross_up_factor >= 1
  * grossed-up expenses >= operating expenses
  * per-tenant: after_cap <= before_cap; total_recovery == after_cap + admin_fee
  * admin_fee >= 0
  * sum of per-tenant recoveries == property total_recovery
  * per-pool breakdown reconciles to the tenant aggregate; cap adjustments <= 0;
    recoverable amounts non-negative
  * with no cap configured, after_cap == before_cap

A violation here is a real financial-correctness bug (mis-billed recoveries).
The DB seam (`fetch_all_tenant_cap_histories`) is patched to empty so the run
is fully deterministic and in-memory.

Run standalone:
    pytest tests/stress/test_orchestrator_e2e_stress.py -q
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

_POOL_TYPES = ["operating", "tax", "insurance", "capital", "other"]


def money(min_v: str, max_v: str):
    return st.decimals(
        min_value=Decimal(min_v),
        max_value=Decimal(max_v),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def ratio():
    return st.decimals(
        min_value=Decimal("0"),
        max_value=Decimal("1"),
        places=4,
        allow_nan=False,
        allow_infinity=False,
    )


@st.composite
def pool_summary(draw):
    is_grossed = draw(st.booleans())
    # Gross-up-applicable pools are kept non-negative: multiplying a *negative*
    # variable pool by a factor >= 1 amplifies a credit, which breaks the
    # gross-up monotonicity invariant (mathematically consistent, but not a bug).
    # Fixed (non-gross-up) pools may still net negative (GL credits), which is
    # what exercises the net-credit crash paths this harness guards.
    amount = draw(money("0", "5000000") if is_grossed else money("-50000", "5000000"))
    return ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name=draw(
            st.sampled_from(["CAM", "Taxes", "Insurance", "Capital", "Misc"])
        ),
        pool_type=draw(st.sampled_from(_POOL_TYPES)),
        total_amount=amount,
        is_gross_up_applicable=is_grossed,
        gross_up_target=draw(st.one_of(st.none(), ratio())),
    )


@st.composite
def lease_terms(draw, *, with_cap: bool):
    cap_type = CapType.NONE
    cap_rate = None
    if with_cap:
        cap_type = draw(st.sampled_from([CapType.NONE, CapType.NON_CUMULATIVE]))
        if cap_type != CapType.NONE:
            cap_rate = draw(
                st.decimals(
                    min_value=Decimal("0.01"),
                    max_value=Decimal("0.5"),
                    places=4,
                    allow_nan=False,
                    allow_infinity=False,
                )
            )
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name=draw(st.text(min_size=1, max_size=12)),
        pro_rata_share=draw(ratio()),
        admin_fee_percentage=draw(
            st.decimals(
                min_value=Decimal("0"),
                max_value=Decimal("0.5"),
                places=4,
                allow_nan=False,
                allow_infinity=False,
            )
        ),
        tenant_sqft=draw(money("0", "1000000")),
        cap_type=cap_type,
        cap_rate=cap_rate,
        proration_factor=draw(
            st.decimals(
                min_value=Decimal("0.5"),
                max_value=Decimal("1"),
                places=4,
                allow_nan=False,
                allow_infinity=False,
            )
        ),
    )


@st.composite
def lease_terms_capped(draw):
    """A lease carrying any cap type (incl. cumulative variants), for the
    cap-history stress that exercises the ratchet/bank seam."""
    cap_type = draw(
        st.sampled_from(
            [
                CapType.NONE,
                CapType.NON_CUMULATIVE,
                CapType.CUMULATIVE,
                CapType.CUMULATIVE_COMPOUNDING,
            ]
        )
    )
    cap_rate = None
    if cap_type != CapType.NONE:
        cap_rate = draw(
            st.decimals(
                min_value=Decimal("0.01"),
                max_value=Decimal("0.5"),
                places=4,
                allow_nan=False,
                allow_infinity=False,
            )
        )
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name=draw(st.text(min_size=1, max_size=12)),
        pro_rata_share=draw(ratio()),
        admin_fee_percentage=draw(
            st.decimals(
                min_value=Decimal("0"),
                max_value=Decimal("0.5"),
                places=4,
                allow_nan=False,
                allow_infinity=False,
            )
        ),
        tenant_sqft=draw(money("0", "1000000")),
        cap_type=cap_type,
        cap_rate=cap_rate,
        proration_factor=draw(
            st.decimals(
                min_value=Decimal("0.5"),
                max_value=Decimal("1"),
                places=4,
                allow_nan=False,
                allow_infinity=False,
            )
        ),
    )


@st.composite
def cap_history(draw):
    """An adversarial multi-year cap history (prior tenant shares + base)."""
    n = draw(st.integers(min_value=0, max_value=5))
    priors = [draw(money("0", "5000000")) for _ in range(n)]
    base = draw(st.one_of(st.none(), money("0.01", "5000000")))
    prior_year = (
        priors[-1] if priors else draw(st.one_of(st.none(), money("0", "5000000")))
    )
    return TenantCapHistory(
        prior_year_amount=prior_year,
        all_prior_amounts=priors,
        cap_base_year_amount=base,
    )


def _run(input_data, leases, pools, histories=None):
    async def _go():
        with patch(_PATCH_TARGET, return_value=histories or {}):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


def _recon_input(sqft):
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=sqft,
    )


def _assert_common_invariants(result, *, cap_possible: bool):
    assert result.gross_up_factor >= Decimal("1")
    # Gross-up never shrinks NON-NEGATIVE expenses. (Net-credit pools are
    # negative; multiplying by a factor >= 1 makes a credit more negative, which
    # is mathematically consistent, so the monotonicity only holds when the
    # operating total is non-negative.)
    if result.total_operating_expenses >= 0:
        assert (
            result.total_grossed_up_expenses >= result.total_operating_expenses - _CENT
        )

    tenant_recovery_sum = Decimal("0")
    for t in result.tenant_reconciliations:
        # Cap only ever reduces the tenant share.
        assert t.tenant_share_after_cap <= t.tenant_share_before_cap + _CENT
        if not cap_possible:
            assert abs(t.tenant_share_after_cap - t.tenant_share_before_cap) <= _CENT
        # Admin fee never negative.
        assert t.admin_fee >= Decimal("0") - _CENT
        # Recovery identity.
        assert abs(t.total_recovery - (t.tenant_share_after_cap + t.admin_fee)) <= _CENT

        # Per-pool breakdown reconciles to the tenant aggregate.
        if t.pool_breakdowns:
            tol = _CENT * (len(t.pool_breakdowns) + 1)
            sum_before = sum(
                (pb.share_before_cap for pb in t.pool_breakdowns), Decimal("0")
            )
            sum_recovery = sum(
                (pb.share_after_cap + pb.admin_fee for pb in t.pool_breakdowns),
                Decimal("0"),
            )
            assert abs(sum_before - t.tenant_share_before_cap) <= tol
            assert abs(sum_recovery - t.total_recovery) <= tol
            for pb in t.pool_breakdowns:
                assert pb.cap_adjustment <= _CENT  # cap reduces, never adds
                assert pb.recoverable_amount >= Decimal("0") - _CENT

        tenant_recovery_sum += t.total_recovery

    # Property total equals the sum of per-tenant recoveries.
    tol = _CENT * (len(result.tenant_reconciliations) + 1)
    assert abs(tenant_recovery_sum - result.total_recovery) <= tol


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=4),
    leases=st.lists(lease_terms(with_cap=False), min_size=1, max_size=4),
)
def test_reconciliation_invariants_no_cap(sqft, pools, leases):
    pool_map = {p.pool_id: p for p in pools}
    result = _run(_recon_input(sqft), leases, pool_map)
    _assert_common_invariants(result, cap_possible=False)


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=4),
    leases=st.lists(lease_terms(with_cap=True), min_size=1, max_size=4),
)
def test_reconciliation_invariants_with_cap(sqft, pools, leases):
    # At least one lease must actually carry a cap for this variant to be useful;
    # otherwise it degenerates to the no-cap case (still valid, just redundant).
    assume(any(lt.cap_type != CapType.NONE for lt in leases))
    pool_map = {p.pool_id: p for p in pools}
    result = _run(_recon_input(sqft), leases, pool_map)
    _assert_common_invariants(result, cap_possible=True)


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=3),
    leases=st.lists(lease_terms_capped(), min_size=1, max_size=3),
    data=st.data(),
)
def test_reconciliation_with_multiyear_cap_history(sqft, pools, leases, data):
    """Drive the full pipeline with injected multi-year cap histories — the
    cap ratchet/bank seam (cumulative + compounding). The run must complete and
    every cross-cutting invariant (after_cap <= before_cap, recovery identity,
    sum reconciliation, non-negative recoveries) must hold for ANY history."""
    histories = {lt.lease_id: data.draw(cap_history()) for lt in leases}
    pool_map = {p.pool_id: p for p in pools}
    result = _run(_recon_input(sqft), leases, pool_map, histories)
    _assert_common_invariants(result, cap_possible=True)


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=4),
    leases=st.lists(lease_terms(with_cap=True), min_size=1, max_size=4),
)
def test_reconciliation_is_deterministic(sqft, pools, leases):
    """The reconciliation is pure: running the same input twice must yield a
    byte-identical result. Any divergence means hidden nondeterminism (dict
    ordering, float creep, mutated input) — a correctness hazard for audits."""
    recon = _recon_input(sqft)
    pool_map = {p.pool_id: p for p in pools}
    first = _run(recon, leases, pool_map)
    second = _run(recon, leases, pool_map)
    assert first.model_dump() == second.model_dump()


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=3),
    leases=st.lists(lease_terms(with_cap=True), min_size=5, max_size=25),
)
def test_reconciliation_many_tenants_reconciles(sqft, pools, leases):
    """With many tenants the largest-remainder allocation must still make the
    per-tenant recoveries sum exactly to the property total (no rounding cents
    lost or invented across a large split)."""
    pool_map = {p.pool_id: p for p in pools}
    result = _run(_recon_input(sqft), leases, pool_map)
    _assert_common_invariants(result, cap_possible=True)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
