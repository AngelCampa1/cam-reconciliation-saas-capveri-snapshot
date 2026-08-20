"""Penny-exact oracle for the orchestrator's gross-up-factor flow into tenant shares.

``run_property_reconciliation`` (calculation/orchestrator.py) computes a single
property-wide ``gross_up_factor`` from occupancy, scales the *variable*
(``is_gross_up_applicable=True``) pools by it, adds the *fixed* pools untouched,
and feeds that grossed-up recoverable base into every tenant's
``calculate_tenant_share``. The factor math is oracle-tested in isolation
(``test_gross_up_orchestrator_stress.py``) and the aggregation seam is pinned with
ALL-FIXED pools so ``gross_up_factor == 1`` (``test_orchestrator_total_recovery_oracle_stress.py``).
But **no test drives the orchestrator with a factor strictly > 1 flowing through a
mix of variable and fixed pools into each tenant's ``tenant_share_before_cap`` and
re-derives the result penny-exact.** ``test_admin_fee_assembly_stress.py`` uses
mixed flags but only checks the admin-fee identity, never recomputing the
grossed-up base. So the factor-into-share path has no value oracle.

This drives the real async orchestrator on the cleanest isolating path that still
forces ``factor > 1`` — one anchor tenant carries all the occupied sqft (a fraction
strictly below the 95% target, so the factor always grosses up), every other
tenant has ``tenant_sqft=None`` (in the share list but excluded from occupancy),
all leases span the whole period (weight 1), ``cap_type=NONE``, no base year, no
exclusions, ``proration_factor=1`` — and checks against an independent oracle that
reproduces the exact quantize chain:

    occ      = round(occupied_sqft / total_rentable, 4)            # occupancy 4dp
    factor   = round(target / occ, 4)  (floored at 1)              # factor 4dp
    grossed  = round(variable_total * factor, 2)                   # grossed 2dp
      # safety valve: if occ > 0.0001 and grossed > round(variable_total/occ, 6),
      #               grossed = round(variable_total / occ, 6)
    base     = grossed + fixed_total                               # recoverable base
    before   = round(base * pro_rata, 2)        # per tenant
    admin    = round(before * admin_pct, 2)
    total    = before + admin
    property_total = Σ tenant total                                # exact, no band

Run standalone:
    pytest tests/stress/test_orchestrator_gross_up_factor_oracle_stress.py -q
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

_TARGET = Decimal("0.95")
_TOTAL_RENTABLE = Decimal("100000")
# Full-period lease bounds: span beyond the 2024 reconciliation period (weight 1).
_PERIOD_START = date(2024, 1, 1)
_PERIOD_END = date(2024, 12, 31)
_LEASE_START = date(2023, 1, 1)
_LEASE_END = date(2025, 12, 31)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_amount = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
# Occupied sqft chosen so the 4dp occupancy lands clear above the safety-valve
# floor (0.0001, at/below which the valve early-returns the UNgrossed amount) and
# below the 0.95 target: 100/100000 = 0.0010 .. 90000/100000 = 0.9, so the factor
# is always > 1 and genuinely grosses up -- the frontier under test.
_occ_sqft = st.integers(min_value=100, max_value=90000)
_lease = st.fixed_dictionaries({"pro_rata": _ratio, "admin_pct": _fee_pct})


def _run(input_data, leases, pools):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


def _oracle_factor(occupied_sqft: Decimal) -> Decimal:
    occ = (occupied_sqft / _TOTAL_RENTABLE).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )
    occ = min(occ, Decimal("1"))
    if occ <= 0 or occ >= _TARGET:
        return Decimal("1.0"), occ
    factor = max(
        (_TARGET / occ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        Decimal("1.0"),
    )
    return factor, occ


def _oracle_base(variable_total, fixed_total, factor, occ):
    grossed = (variable_total * factor).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    # Safety valve: never exceed the 100%-occupancy equivalent.
    if occ > Decimal("0.0001"):
        max_full = (variable_total / occ).quantize(
            Decimal("0.000001"), rounding=ROUND_HALF_UP
        )
        if grossed > max_full:
            grossed = max_full
    return grossed + fixed_total


@STRESS
@given(
    var_amounts=st.lists(_amount, min_size=1, max_size=3),
    fixed_amounts=st.lists(_amount, min_size=1, max_size=3),
    occ_sqft=_occ_sqft,
    leases=st.lists(_lease, min_size=1, max_size=4),
)
def test_orchestrator_gross_up_factor_flows_into_shares_exactly(
    var_amounts, fixed_amounts, occ_sqft, leases
):
    pool_summaries = {}
    for i, amt in enumerate(var_amounts):
        pid = uuid4()
        pool_summaries[pid] = ExpensePoolSummary(
            pool_id=pid,
            pool_name=f"var{i}",
            pool_type="operating",
            total_amount=amt,
            is_gross_up_applicable=True,
        )
    for i, amt in enumerate(fixed_amounts):
        pid = uuid4()
        pool_summaries[pid] = ExpensePoolSummary(
            pool_id=pid,
            pool_name=f"fix{i}",
            pool_type="tax",
            total_amount=amt,
            is_gross_up_applicable=False,
        )

    variable_total = sum((Decimal(a) for a in var_amounts), Decimal("0"))
    fixed_total = sum((Decimal(a) for a in fixed_amounts), Decimal("0"))
    occupied = Decimal(occ_sqft)

    # First lease is the anchor that carries the occupied sqft; the rest are in the
    # share list but excluded from occupancy (tenant_sqft=None).
    lease_terms = [
        LeaseTerms(
            lease_id=uuid4(),
            tenant_name=f"T{i}",
            pro_rata_share=ln["pro_rata"],
            admin_fee_percentage=ln["admin_pct"],
            proration_factor=Decimal("1"),
            cap_type=CapType.NONE,
            tenant_sqft=occupied if i == 0 else None,
            start_date=_LEASE_START,
            end_date=_LEASE_END,
        )
        for i, ln in enumerate(leases)
    ]

    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=_TOTAL_RENTABLE,
        target_occupancy=_TARGET,
    )
    result = _run(input_data, lease_terms, pool_summaries)

    factor, occ = _oracle_factor(occupied)
    assert factor > Decimal("1.0")  # the frontier under test
    base = _oracle_base(variable_total, fixed_total, factor, occ)

    assert result.gross_up_factor == factor
    assert result.total_grossed_up_expenses == base

    expected_property_total = Decimal("0")
    by_lease = {t.lease_id: t for t in result.tenant_reconciliations}
    assert len(by_lease) == len(lease_terms)

    for terms in lease_terms:
        tr = by_lease[terms.lease_id]
        before = _q(base * terms.pro_rata_share)
        admin = _q(before * terms.admin_fee_percentage)
        total = before + admin

        assert tr.grossed_up_expenses == base
        assert tr.tenant_share_before_cap == before
        assert tr.tenant_share_after_cap == before
        assert tr.admin_fee == admin
        assert tr.total_recovery == total
        expected_property_total += total

    assert result.total_recovery == expected_property_total


def test_half_occupancy_doubles_variable_pool():
    """At 47.5% occupancy the 0.95 target grosses a variable pool by exactly 2x."""
    # occupied 47500 / 100000 = 0.4750; factor = 0.95 / 0.475 = 2.0000.
    # variable 50000 -> grossed 100000; fixed 20000; base 120000.
    pools = {
        (pv := uuid4()): ExpensePoolSummary(
            pool_id=pv,
            pool_name="var",
            pool_type="operating",
            total_amount=Decimal("50000.00"),
            is_gross_up_applicable=True,
        ),
        (pf := uuid4()): ExpensePoolSummary(
            pool_id=pf,
            pool_name="fix",
            pool_type="tax",
            total_amount=Decimal("20000.00"),
            is_gross_up_applicable=False,
        ),
    }
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0"),
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
        tenant_sqft=Decimal("47500"),
        start_date=_LEASE_START,
        end_date=_LEASE_END,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=_TOTAL_RENTABLE,
        target_occupancy=_TARGET,
    )
    result = _run(input_data, [terms], pools)

    assert result.gross_up_factor == Decimal("2.0000")
    assert result.total_grossed_up_expenses == Decimal("120000.00")
    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_before_cap == Decimal("120000.00")
    assert tr.total_recovery == Decimal("120000.00")
    assert result.total_recovery == Decimal("120000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
