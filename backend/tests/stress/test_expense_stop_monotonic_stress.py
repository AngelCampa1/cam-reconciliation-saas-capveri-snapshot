"""Metamorphic expense-stop monotonicity for the reconciliation orchestrator.

An expense stop makes a tenant absorb the first ``stop_per_sqft * tenant_sqft`` of a
pool before any recovery: ``above_stop = max(0, tenant_share - threshold)``
(expense_stop.py). Holding pools, pro-rata, and sqft fixed, a HIGHER stop raises the
threshold, so the tenant's recoverable amount and total recovery can only stay the
same or DECREASE — never increase. A bigger base the tenant absorbs never recovers
the landlord more.

This drives the expense-stop seam through the full ``run_property_reconciliation``
— the same branch the Cycle 31 mixed-basis fix recomputes
``total_recoverable_for_tenant`` from. A break — recovery rising as the stop grows —
would be an inverted threshold subtraction or a sign slip that over-bills a tenant
who should absorb more. Cap-free so the relation is unconditional.

Run standalone:
    pytest tests/stress/test_expense_stop_monotonic_stress.py -q
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


def _lease(stop, *, pro_rata=Decimal("0.5"), admin=Decimal("0.1")):
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin,
        tenant_sqft=Decimal("10000"),
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=Decimal("1"),
        expense_stops={"OP": stop},
    )


@STRESS
@given(
    sqft=money("10000", "1000000"),
    amount=money("0", "3000000"),
    pro_rata=ratio("0.01", "0.9"),
    admin=ratio("0", "0.4"),
    stop_lo=money("0", "50"),
    stop_delta=money("0", "50"),
)
def test_higher_expense_stop_never_raises_recovery(
    sqft, amount, pro_rata, admin, stop_lo, stop_delta
):
    """A larger expense stop (more the tenant absorbs) never increases the tenant's
    recoverable amount or total recovery."""
    stop_hi = stop_lo + stop_delta
    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="OP",
        pool_type="operating",
        total_amount=amount,
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    pool_map = {pool.pool_id: pool}
    recon = _recon_input(sqft)

    lo = _run(
        recon, [_lease(stop_lo, pro_rata=pro_rata, admin=admin)], pool_map
    ).tenant_reconciliations[0]
    hi = _run(
        recon, [_lease(stop_hi, pro_rata=pro_rata, admin=admin)], pool_map
    ).tenant_reconciliations[0]

    assert hi.tenant_share_before_cap <= lo.tenant_share_before_cap + _CENT
    assert hi.total_recovery <= lo.total_recovery + _CENT


def test_huge_stop_zeroes_recovery_anchor():
    """Concrete anchor: a stop so large the tenant's whole share falls under the
    threshold drives recovery to zero, while a zero stop recovers the full share."""
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

    # tenant_share = 300k * 0.5 = 150k; threshold = stop * 10000 sqft.
    no_stop = _run(
        recon, [_lease(Decimal("0"), admin=Decimal("0"))], pool_map
    ).tenant_reconciliations[0]
    # stop_per_sqft 20 -> threshold 200k > 150k share -> nothing above stop.
    big_stop = _run(
        recon, [_lease(Decimal("20"), admin=Decimal("0"))], pool_map
    ).tenant_reconciliations[0]

    assert no_stop.tenant_share_before_cap == Decimal("150000.00")
    assert big_stop.tenant_share_before_cap == Decimal("0")
    assert big_stop.total_recovery == Decimal("0")
    assert no_stop.total_recovery > big_stop.total_recovery


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
