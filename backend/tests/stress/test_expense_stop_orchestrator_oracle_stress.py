"""Penny-exact oracle for the expense-stop flow through the property orchestrator.

When a lease carries ``expense_stops`` and ``tenant_sqft``,
``run_property_reconciliation`` (calculation/orchestrator.py:458-469) rewrites the
tenant's ``pool_breakdown`` via ``apply_expense_stops`` and then recomputes the
recoverable base as ``sum(pool_breakdown.values())`` before handing it to
``calculate_tenant_share``. ``apply_expense_stops`` replaces each stopped pool's
value with ``above_stop / pro_rata_share`` (an UNQUANTIZED Decimal division,
expense_stop.py:156-160), which the orchestrator then sums and ``calculate_tenant_share``
multiplies back by ``pro_rata_share`` and quantizes — a divide-then-multiply seam
that can drift a cent if reproduced in the wrong order or rounding mode.

The stop math is oracle-tested in isolation (``test_expense_stop_stress.py``) and
the orchestrator integration is pinned only with a MONOTONIC band
(``test_expense_stop_monotonic_stress.py`` asserts ``hi.recovery <= lo.recovery + cent``).
**No test independently recomputes ``tenant_share_before_cap`` through the
orchestrator's stop → divide → sum → multiply chain and asserts ``==`` (no
tolerance).** So the penny-exact value of a stopped tenant's share is unpinned at
the orchestrator level.

This drives the real async orchestrator on the cleanest isolating path — all pools
``is_gross_up_applicable=False`` (gross-up never scales the breakdown),
``cap_type=NONE``, no base year, ``proration_factor=1``, single basis, at least one
stopped pool — and checks against an independent oracle that reproduces the exact
sequence:

    # per stopped pool (pro_rata > 0):
    threshold    = round(stop_per_sqft * tenant_sqft, 2)
    tenant_share = round(pool_amount * pro_rata, 2)
    above_stop   = round(max(0, tenant_share - threshold), 2)
    adjusted     = above_stop / pro_rata               # UNQUANTIZED division
    # unstopped pools keep pool_amount
    base   = Σ adjusted/unstopped                      # orchestrator line 469
    before = round(base * pro_rata, 2)                 # tenant_share.py
    admin  = round(before * admin_pct, 2)
    total  = before + admin

Run standalone:
    pytest tests/stress/test_expense_stop_orchestrator_oracle_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
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
    max_examples=250,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"

_PERIOD_START = date(2024, 1, 1)
_PERIOD_END = date(2024, 12, 31)
_LEASE_START = date(2023, 1, 1)
_LEASE_END = date(2025, 12, 31)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_amount = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
# pro_rata strictly positive: a zero share zeroes every stopped pool (the
# divide-by-zero guard returns 0) and collapses the seam under test.
_ratio = st.decimals(
    min_value=Decimal("0.0001"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
_stop_per_sqft = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("100"), places=2, allow_nan=False
)
_sqft = st.integers(min_value=1, max_value=200000)
_pool = st.fixed_dictionaries(
    {"amount": _amount, "stop": _stop_per_sqft, "has_stop": st.booleans()}
)


def _run(input_data, leases, pools):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


@STRESS
@given(
    pools=st.lists(_pool, min_size=1, max_size=3),
    pro_rata=_ratio,
    admin_pct=_fee_pct,
    tenant_sqft=_sqft,
)
def test_expense_stop_through_orchestrator_round_trips_exactly(
    pools, pro_rata, admin_pct, tenant_sqft
):
    # At least one stopped pool, so the expense-stop branch actually fires.
    assume(any(p["has_stop"] for p in pools))

    pool_summaries = {}
    expense_stops: dict[str, Decimal] = {}
    for i, p in enumerate(pools):
        pid = uuid4()
        name = f"p{i}"
        pool_summaries[pid] = ExpensePoolSummary(
            pool_id=pid,
            pool_name=name,
            pool_type="operating",
            total_amount=p["amount"],
            is_gross_up_applicable=False,
        )
        if p["has_stop"]:
            expense_stops[name] = p["stop"]

    sqft = Decimal(tenant_sqft)
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
        tenant_sqft=sqft,
        expense_stops=expense_stops,
        start_date=_LEASE_START,
        end_date=_LEASE_END,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=Decimal("1000000"),
    )
    result = _run(input_data, [terms], pool_summaries)

    # Independent oracle: reproduce the stop -> divide -> sum -> multiply chain.
    base = Decimal("0")
    for i, p in enumerate(pools):
        amount = Decimal(p["amount"])
        if p["has_stop"]:
            threshold = _q(Decimal(p["stop"]) * sqft)
            tenant_share = _q(amount * pro_rata)
            above_stop = _q(max(Decimal("0"), tenant_share - threshold))
            base += above_stop / pro_rata  # unquantized division, matches prod
        else:
            base += amount
    before = _q(base * pro_rata)
    admin = _q(before * admin_pct)
    total = before + admin

    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_before_cap == before
    assert tr.tenant_share_after_cap == before
    assert tr.admin_fee == admin
    assert tr.total_recovery == total
    assert result.total_recovery == total


def test_stop_above_threshold_recovers_only_the_excess():
    """A pool whose share clears the per-sqft stop recovers exactly the excess."""
    # pool 100000, pro_rata 1.0 -> tenant_share 100000. stop 2/sqft * 10000 sqft
    # = 20000 threshold -> above_stop 80000; /1.0 = 80000; *1.0 -> 80000.
    pid = uuid4()
    pools = {
        pid: ExpensePoolSummary(
            pool_id=pid,
            pool_name="cam",
            pool_type="operating",
            total_amount=Decimal("100000.00"),
            is_gross_up_applicable=False,
        )
    }
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0"),
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
        tenant_sqft=Decimal("10000"),
        expense_stops={"cam": Decimal("2.00")},
        start_date=_LEASE_START,
        end_date=_LEASE_END,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=Decimal("1000000"),
    )
    result = _run(input_data, [terms], pools)
    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_before_cap == Decimal("80000.00")
    assert tr.total_recovery == Decimal("80000.00")


def test_stop_above_full_share_yields_zero_recovery():
    """A stop larger than the tenant's whole share clamps recovery to zero."""
    # share 5000; stop 1/sqft * 10000 = 10000 threshold > share -> above_stop 0.
    pid = uuid4()
    pools = {
        pid: ExpensePoolSummary(
            pool_id=pid,
            pool_name="cam",
            pool_type="operating",
            total_amount=Decimal("10000.00"),
            is_gross_up_applicable=False,
        )
    }
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="Solo",
        pro_rata_share=Decimal("0.5"),
        admin_fee_percentage=Decimal("0.10"),
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
        tenant_sqft=Decimal("10000"),
        expense_stops={"cam": Decimal("1.00")},
        start_date=_LEASE_START,
        end_date=_LEASE_END,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=Decimal("1000000"),
    )
    result = _run(input_data, [terms], pools)
    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_before_cap == Decimal("0.00")
    assert tr.admin_fee == Decimal("0.00")
    assert tr.total_recovery == Decimal("0.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
