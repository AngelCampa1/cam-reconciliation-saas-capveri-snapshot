"""Penny-exact oracle for the ``admin_fee_excludes_tax_insurance`` flag path.

When a lease sets ``admin_fee_excludes_tax_insurance=True`` and supplies NO explicit
``admin_fee_excluded_pools``, ``calculate_tenant_share`` (tenant_share.py:625-635)
populates the exclusion set from a hardcoded list of seven lowercase pool-name
strings (``taxes`` / ``insurance`` / ``real_estate_taxes`` / ``property_insurance`` /
``tax`` / ``property_tax`` / ``building_insurance``). It then prorates the admin-fee
base by the *included* fraction of pool dollars:

    inclusion_ratio = Decimal(str(included_pool_amount / total_pool_amount))
    admin_base      = max(0, round(tenant_share_after_cap * inclusion_ratio, 2))

The admin-fee-CAP clamp is oracle-pinned (``test_admin_fee_cap_oracle_stress.py``)
and the explicit-list exclusion has a monotonic band + one anchor
(``test_admin_fee_exclusion_monotonic_stress.py``) — but **the flag-triggered T&I
branch has no penny-exact ``==`` oracle at all** (no stress test even references
``admin_fee_excludes_tax_insurance``). The inclusion-ratio is a Decimal division
wrapped in ``Decimal(str(...))`` and then quantized into ``admin_base``, a seam
where a wrong rounding mode or a single-pass quantize would mis-bill the fee.

This drives the real async orchestrator on the cleanest isolating path — all pools
``is_gross_up_applicable=False`` (factor never scales the breakdown), no expense
stops (so the exclusion ratio runs over the raw pool breakdown), ``cap_type=NONE``,
no base year, no admin-fee cap, ``proration_factor=1`` — with pool names drawn from
both the hardcoded T&I set and non-T&I names, and checks against an independent
oracle:

    total          = Σ pool amounts
    tenant_share   = round(total * pro_rata, 2)           # before == after (no cap)
    excluded       = Σ amount where name.lower() in T&I set
    included       = max(0, total - excluded)
    inclusion      = Decimal(str(included / total))       # Decimal division, str round-trip
    admin_base     = max(0, round(tenant_share * inclusion, 2))
    admin_fee      = round(admin_base * admin_pct, 2)
    total_recovery = tenant_share + admin_fee

Run standalone:
    pytest tests/stress/test_admin_fee_ti_exclusion_oracle_stress.py -q
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

# The hardcoded default T&I exclusion set (tenant_share.py:627-635).
_TI_NAMES = {
    "taxes",
    "insurance",
    "real_estate_taxes",
    "property_insurance",
    "tax",
    "property_tax",
    "building_insurance",
}
_NON_TI_NAMES = ["operating", "maintenance", "utilities", "cam", "landscaping"]
_ALL_NAMES = sorted(_TI_NAMES) + _NON_TI_NAMES

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


def _run(input_data, leases, pools):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(input_data, leases, pools)

    return asyncio.run(_go())


@STRESS
@given(
    names=st.lists(st.sampled_from(_ALL_NAMES), min_size=1, max_size=5, unique=True),
    amounts=st.lists(_amount, min_size=1, max_size=5),
    pro_rata=_ratio,
    admin_pct=_fee_pct,
)
def test_ti_exclusion_flag_round_trips_exactly(names, amounts, pro_rata, admin_pct):
    # Pair each unique name with an amount (zip truncates to the shorter list).
    pairs = list(zip(names, amounts))
    assume(pairs)
    total = sum((Decimal(a) for _, a in pairs), Decimal("0"))
    assume(total > 0)  # the degenerate total==0 branch zeroes admin_base trivially

    pool_summaries = {}
    for name, amt in pairs:
        pid = uuid4()
        pool_summaries[pid] = ExpensePoolSummary(
            pool_id=pid,
            pool_name=name,
            pool_type="tax" if name in _TI_NAMES else "operating",
            total_amount=amt,
            is_gross_up_applicable=False,
        )

    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        admin_fee_excludes_tax_insurance=True,
        admin_fee_excluded_pools=[],
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=Decimal("1000000"),
    )
    result = _run(input_data, [terms], pool_summaries)

    # Independent oracle.
    tenant_share = _q(total * pro_rata)
    excluded = sum(
        (Decimal(a) for name, a in pairs if name.lower() in _TI_NAMES), Decimal("0")
    )
    included = max(Decimal("0"), total - excluded)
    inclusion = Decimal(str(included / total))
    admin_base = max(Decimal("0"), _q(tenant_share * inclusion))
    admin_fee = _q(admin_base * admin_pct)
    expected_total = tenant_share + admin_fee

    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_before_cap == tenant_share
    assert tr.tenant_share_after_cap == tenant_share
    assert tr.admin_fee == admin_fee
    assert tr.total_recovery == expected_total


def test_ti_flag_excludes_tax_pool_from_admin_base():
    """The flag prorates the admin base by the non-T&I share of pool dollars."""
    # taxes 40000 + operating 60000 = 100000; pro_rata 1.0 -> share 100000.
    # inclusion = 60000/100000 = 0.6 -> admin_base 60000; fee 10% -> 6000.
    pools = {
        (pt := uuid4()): ExpensePoolSummary(
            pool_id=pt,
            pool_name="taxes",
            pool_type="tax",
            total_amount=Decimal("40000.00"),
            is_gross_up_applicable=False,
        ),
        (po := uuid4()): ExpensePoolSummary(
            pool_id=po,
            pool_name="operating",
            pool_type="operating",
            total_amount=Decimal("60000.00"),
            is_gross_up_applicable=False,
        ),
    }
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.10"),
        admin_fee_excludes_tax_insurance=True,
        admin_fee_excluded_pools=[],
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=Decimal("1000000"),
    )
    result = _run(input_data, [terms], pools)
    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_after_cap == Decimal("100000.00")
    assert tr.admin_fee == Decimal("6000.00")
    assert tr.total_recovery == Decimal("106000.00")


def test_ti_flag_all_excluded_zeroes_admin_fee():
    """When every pool is T&I, the included fraction is zero and so is the fee."""
    pools = {
        (pt := uuid4()): ExpensePoolSummary(
            pool_id=pt,
            pool_name="taxes",
            pool_type="tax",
            total_amount=Decimal("50000.00"),
            is_gross_up_applicable=False,
        ),
        (pi := uuid4()): ExpensePoolSummary(
            pool_id=pi,
            pool_name="insurance",
            pool_type="insurance",
            total_amount=Decimal("30000.00"),
            is_gross_up_applicable=False,
        ),
    }
    terms = LeaseTerms(
        lease_id=uuid4(),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.10"),
        admin_fee_excludes_tax_insurance=True,
        admin_fee_excluded_pools=[],
        proration_factor=Decimal("1"),
        cap_type=CapType.NONE,
    )
    input_data = ReconciliationInput(
        property_id=uuid4(),
        period_start=_PERIOD_START,
        period_end=_PERIOD_END,
        total_rentable_sqft=Decimal("1000000"),
    )
    result = _run(input_data, [terms], pools)
    tr = result.tenant_reconciliations[0]
    assert tr.tenant_share_after_cap == Decimal("80000.00")
    assert tr.admin_fee == Decimal("0.00")
    assert tr.total_recovery == Decimal("80000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
