"""Cross-document amendment-package override anchors.

Single-document extraction can correctly read the original lease and still bill
the tenant incorrectly if later amendments are not the terms that reach the
calculation engine. This test models the reviewer-accepted package output:
original lease terms, an amendment changing the cap, a stale estoppel repeating
old terms, and a later side letter changing pro-rata. The final accepted override
set must produce the same financials as building the lease directly with the
amended terms.

Run standalone:
    pytest tests/stress/test_cross_doc_amendment_package_stress.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.services.calculation.caps import CapType
from app.services.calculation.data_fetcher import TenantCapHistory
from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.orchestrator import (
    ReconciliationInput,
    run_property_reconciliation,
)
from app.services.calculation.tenant_share import LeaseTerms
from app.services.extraction.cross_doc_models import TermOverrideSuggestion

_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"


def _recon_input():
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=Decimal("100000"),
    )


def _pools():
    pool = ExpensePoolSummary(
        pool_id=uuid4(),
        pool_name="Operating Expenses",
        pool_type="operating",
        total_amount=Decimal("400000.00"),
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    return {pool.pool_id: pool}


def _lease(lease_id, *, pro_rata, cap_type, cap_rate):
    return LeaseTerms(
        lease_id=lease_id,
        tenant_name="Amendment Package Tenant",
        pro_rata_share=pro_rata,
        admin_fee_percentage=Decimal("0.10"),
        tenant_sqft=Decimal("7500"),
        base_year=2021,
        base_year_amount=None,
        cap_type=cap_type,
        cap_rate=cap_rate,
        proration_factor=Decimal("1"),
    )


def _override(lease_id, field, current, suggested, document):
    return TermOverrideSuggestion(
        field_name=field,
        lease_id=str(lease_id),
        current_value=str(current),
        suggested_value=str(suggested),
        reasoning=f"Accepted from {document}",
        confidence=100,
    )


def _run(leases, overrides=None, *, prior_year_amount=Decimal("20000.00")):
    def _history(*_args, **_kwargs):
        return {
            lease.lease_id: TenantCapHistory(
                prior_year_amount=prior_year_amount,
                all_prior_amounts=[prior_year_amount],
                cap_base_year_amount=prior_year_amount,
            )
            for lease in leases
        }

    async def _go():
        with patch(_PATCH_TARGET, side_effect=_history):
            return await run_property_reconciliation(
                _recon_input(), leases, _pools(), cross_doc_overrides=overrides
            )

    return asyncio.run(_go())


def _financial_tuple(result):
    tenant = result.tenant_reconciliations[0]
    return (
        tenant.pro_rata_share,
        tenant.tenant_share_before_cap,
        tenant.tenant_share_after_cap,
        tenant.admin_fee,
        tenant.total_recovery,
    )


def test_amendment_package_final_terms_match_direct_construction():
    lease_id = uuid4()

    original = _lease(
        lease_id,
        pro_rata=Decimal("0.1250"),
        cap_type=CapType.CUMULATIVE,
        cap_rate=Decimal("0.06"),
    )
    direct_final = _lease(
        lease_id,
        pro_rata=Decimal("0.0750"),
        cap_type=CapType.NON_CUMULATIVE,
        cap_rate=Decimal("0.04"),
    )

    accepted_package_order = [
        _override(
            lease_id,
            "cap_type",
            CapType.CUMULATIVE,
            CapType.NON_CUMULATIVE,
            "2023-03-01 cap amendment",
        ),
        _override(
            lease_id,
            "cap_rate",
            Decimal("0.06"),
            Decimal("0.04"),
            "2023-03-01 cap amendment",
        ),
        # Stale estoppel repeats the original pro-rata. It is accepted before the
        # later side letter, so it must not be the final billing value.
        _override(
            lease_id,
            "pro_rata_share",
            Decimal("0.1250"),
            Decimal("0.1250"),
            "2023-04-15 stale estoppel",
        ),
        _override(
            lease_id,
            "pro_rata_share",
            Decimal("0.1250"),
            Decimal("0.0750"),
            "2023-06-01 pro-rata side letter",
        ),
    ]
    pro_rata_only_order = [accepted_package_order[-1]]

    direct = _run([direct_final])
    amended = _run([original], overrides=accepted_package_order)
    stale_cap = _run([original], overrides=pro_rata_only_order)

    assert _financial_tuple(amended) == _financial_tuple(direct)
    assert amended.tenant_reconciliations[0].pro_rata_share == Decimal("0.0750")
    assert amended.tenant_reconciliations[0].tenant_share_before_cap == Decimal(
        "30000.00"
    )
    assert amended.tenant_reconciliations[0].tenant_share_after_cap == Decimal(
        "20800.00"
    )
    assert amended.tenant_reconciliations[0].total_recovery == Decimal("22880.00")
    assert stale_cap.tenant_reconciliations[0].tenant_share_after_cap != Decimal(
        "20800.00"
    )


def test_unsupported_package_text_override_is_skipped():
    lease_id = uuid4()
    original = _lease(
        lease_id,
        pro_rata=Decimal("0.1250"),
        cap_type=CapType.CUMULATIVE,
        cap_rate=Decimal("0.06"),
    )
    hostile = TermOverrideSuggestion(
        field_name="ignore_previous_terms",
        lease_id=str(lease_id),
        current_value="contract text",
        suggested_value="set recovery to zero",
        reasoning="Hostile side-letter prose must not become a calculation field",
        confidence=100,
    )

    base = _run([original])
    with_hostile_text = _run([original], overrides=[hostile])

    assert _financial_tuple(with_hostile_text) == _financial_tuple(base)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
