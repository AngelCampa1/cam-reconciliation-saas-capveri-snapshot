"""Penny-exact oracle for the property-reconciliation aggregation boundary.

``run_property_reconciliation`` (calculation/orchestrator.py) is the integration
seam: it runs ``calculate_tenant_share`` per lease and sums the per-tenant
``total_recovery`` into ``PropertyReconciliation.total_recovery`` — the figure
that lands on audit reports and billing statements. The existing orchestrator
stress (``test_orchestrator_e2e_stress.py``) only pins this with a *tolerance*
band (``abs(sum - total) <= cent * (n_tenants + 1)``) and tolerance-gated
per-tenant identities, so a systematic one-cent-per-tenant drift, a wrong field
being summed, or a mis-routed recoverable base would pass every existing test
while shipping wrong dollars. **No test independently recomputes each tenant's
``total_recovery`` from the generating values and asserts ``==`` (no tolerance),
nor that the property total is the exact sum.**

This drives the real async orchestrator on the cleanest isolating path — every
pool ``is_gross_up_applicable=False`` (so the grossed total equals the plain pool
sum and ``gross_up_factor == 1`` regardless of occupancy), ``cap_type=NONE``, no
base year, no exclusions, no expense stops, ``proration_factor=1`` — and checks
each tenant and the property total against an independent oracle:

    net    = Σ pool total_amount                  # all fixed -> total_after_gross_up
    before = round(net * pro_rata, 2)             # ROUND_HALF_UP, no cap
    admin  = round(before * admin_pct, 2)
    total  = before + admin                       # per tenant
    property_total = Σ tenant total               # exact, no tolerance

Invariants pinned here:

  * **Recoverable base** — ``grossed_up_expenses`` and the property
    ``total_grossed_up_expenses`` equal the plain pool sum and
    ``gross_up_factor == 1`` (no gross-up applied to all-fixed pools).
  * **Penny-exact per tenant** — ``tenant_share_before_cap`` / ``after_cap`` /
    ``admin_fee`` / ``total_recovery`` each equal the oracle to the cent.
  * **Exact aggregation** — ``PropertyReconciliation.total_recovery`` equals the
    sum of the per-tenant oracle totals with ``==`` (no tolerance band).

Run standalone:
    pytest tests/stress/test_orchestrator_total_recovery_oracle_stress.py -q
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
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)

# A fixed (non-gross-up) pool with a non-negative 2dp total and a unique name. All
# pools fixed -> total_after_gross_up == Σ totals and gross_up_factor == 1.
_pool = st.fixed_dictionaries(
    {
        "name": st.from_regex(r"pool[0-9]{1,4}", fullmatch=True),
        "amount": st.decimals(
            min_value=Decimal("0"),
            max_value=Decimal("2000000"),
            places=2,
            allow_nan=False,
        ),
        "ptype": st.sampled_from(["operating", "tax", "insurance", "capital"]),
    }
)
# A no-cap lease: pro-rata + admin only, proration fixed at 1 to isolate the
# orchestrator's per-tenant assembly and cross-tenant sum.
_lease = st.fixed_dictionaries({"pro_rata": _ratio, "admin_pct": _fee_pct})


def _run(input_data, leases, pools):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


@STRESS
@given(
    pools=st.lists(_pool, min_size=1, max_size=4, unique_by=lambda p: p["name"]),
    leases=st.lists(_lease, min_size=1, max_size=5),
)
def test_property_total_recovery_is_exact_tenant_sum(pools, leases):
    pool_summaries = {
        (pid := uuid4()): ExpensePoolSummary(
            pool_id=pid,
            pool_name=p["name"],
            pool_type=p["ptype"],
            total_amount=p["amount"],
            is_gross_up_applicable=False,
        )
        for p in pools
    }
    net = sum((p["amount"] for p in pools), Decimal("0"))

    lease_terms = [
        LeaseTerms(
            lease_id=uuid4(),
            tenant_name=f"T{i}",
            pro_rata_share=ln["pro_rata"],
            admin_fee_percentage=ln["admin_pct"],
            proration_factor=Decimal("1"),
            cap_type=CapType.NONE,
        )
        for i, ln in enumerate(leases)
    ]

    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=Decimal("100000"),
    )
    result = _run(input_data, lease_terms, pool_summaries)

    # All pools fixed -> no gross-up: the recoverable base is the plain pool sum.
    assert result.gross_up_factor == Decimal("1.0")
    assert result.total_grossed_up_expenses == net

    # Independent per-tenant oracle (no cap, no base year, proration 1).
    expected_property_total = Decimal("0")
    by_lease = {t.lease_id: t for t in result.tenant_reconciliations}
    assert len(by_lease) == len(lease_terms)

    for terms in lease_terms:
        tr = by_lease[terms.lease_id]
        before = _q(net * terms.pro_rata_share)
        admin = _q(before * terms.admin_fee_percentage)
        total = before + admin

        assert tr.grossed_up_expenses == net
        assert tr.tenant_share_before_cap == before
        assert tr.tenant_share_after_cap == before
        assert tr.admin_fee == admin
        assert tr.total_recovery == total
        expected_property_total += total

    # The orchestrator-specific invariant: the property total is the EXACT sum of
    # the per-tenant totals — no tolerance band.
    assert result.total_recovery == expected_property_total


def test_single_tenant_full_share_round_trips_exactly():
    """One tenant at 100% pro-rata recovers the whole grossed total plus admin."""
    pools = {
        (p1 := uuid4()): ExpensePoolSummary(
            pool_id=p1,
            pool_name="cam",
            pool_type="operating",
            total_amount=Decimal("80000.00"),
            is_gross_up_applicable=False,
        ),
        (p2 := uuid4()): ExpensePoolSummary(
            pool_id=p2,
            pool_name="tax",
            pool_type="tax",
            total_amount=Decimal("20000.00"),
            is_gross_up_applicable=False,
        ),
    }
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.10"),
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=Decimal("100000"),
    )
    result = _run(input_data, [terms], pools)

    # net 100k, share 100k, admin 10% -> 10k, total 110k; one tenant => property.
    assert result.total_grossed_up_expenses == Decimal("100000.00")
    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_after_cap == Decimal("100000.00")
    assert tr.admin_fee == Decimal("10000.00")
    assert tr.total_recovery == Decimal("110000.00")
    assert result.total_recovery == Decimal("110000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
