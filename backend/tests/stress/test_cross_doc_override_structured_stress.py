"""Metamorphic cross-document override equivalence for STRUCTURED field types.

Cycle 71 pinned the override path (orchestrator ``_apply_cross_doc_overrides`` ->
``_parse_override_value`` -> ``LeaseTerms.model_validate``) for scalar numeric
fields. This extends the guarantee to the *structured* supported fields whose
``json.loads`` round-trip produces a container rather than a scalar:

  * ``expense_stops`` — a ``dict[str, Decimal]``; the override arrives as a JSON
    object whose values are strings (``{"OP": "5.00"}``) and must coerce, per
    entry, to the same Decimals a directly-constructed lease carries.
  * ``excluded_pools`` — a ``list[str]``; the override arrives as a JSON array and
    must reproduce the same exclusion set.

For each, running the reconciliation with the value delivered *as an override on top
of a different placeholder lease* must produce financials byte-identical to running
it with the value *constructed directly on the lease*. The override container path
must be a faithful no-op relative to direct construction — only delivery differs.

A break — a dict value coerced to a different Decimal, a list element dropped or
reordered into a non-match, or the raw-string fallback corrupting a container — is a
silent mis-bill that no single-document test can see. Drives the full
``run_property_reconciliation``.

Run standalone:
    pytest tests/stress/test_cross_doc_override_structured_stress.py -q
"""

from __future__ import annotations

import asyncio
import json
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
from app.services.extraction.cross_doc_models import TermOverrideSuggestion

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"
_POOL_NAMES = ["P0", "P1", "P2"]


def money(min_v: str, max_v: str):
    return st.decimals(
        min_value=Decimal(min_v),
        max_value=Decimal(max_v),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    )


def _base_kwargs(lease_id):
    return {
        "lease_id": lease_id,
        "tenant_name": "T",
        "pro_rata_share": Decimal("0.5"),
        "admin_fee_percentage": Decimal("0.1"),
        "tenant_sqft": Decimal("10000"),
        "cap_type": CapType.NONE,
        "cap_rate": None,
        "proration_factor": Decimal("1"),
    }


def _recon_input():
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=Decimal("100000"),
    )


def _pools(amounts):
    pools = [
        ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name=_POOL_NAMES[i],
            pool_type="operating",
            total_amount=amounts[i],
            is_gross_up_applicable=False,
            gross_up_target=None,
        )
        for i in range(len(amounts))
    ]
    return {p.pool_id: p for p in pools}


def _run(leases, pools, overrides=None):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(
                _recon_input(), leases, pools, cross_doc_overrides=overrides
            )

    return asyncio.run(_go())


def _result_tuple(t):
    return (
        t.tenant_share_before_cap,
        t.tenant_share_after_cap,
        t.admin_fee,
        t.total_recovery,
    )


def _equivalence(field, direct_value, override_json, *, placeholder, amounts):
    """Run direct vs override-delivered and assert identical financials."""
    lease_id = uuid4()
    pools = _pools(amounts)

    direct_lease = LeaseTerms(**(_base_kwargs(lease_id) | {field: direct_value}))
    direct = _run([direct_lease], pools).tenant_reconciliations[0]

    placeholder_lease = LeaseTerms(**(_base_kwargs(lease_id) | {field: placeholder}))
    override = TermOverrideSuggestion(
        field_name=field,
        lease_id=str(lease_id),
        current_value="placeholder",
        suggested_value=override_json,
        reasoning="stress",
        confidence=100,
    )
    overridden = _run(
        [placeholder_lease], pools, overrides=[override]
    ).tenant_reconciliations[0]

    assert _result_tuple(overridden) == _result_tuple(direct)


@STRESS
@given(
    amounts=st.lists(money("0", "1000000"), min_size=3, max_size=3),
    stop=money("0", "40"),
)
def test_expense_stops_override_matches_direct(amounts, stop):
    """A dict expense_stops override delivered as a JSON object (string values)
    reproduces a directly-constructed dict[str, Decimal] expense stop."""
    _equivalence(
        "expense_stops",
        {"P0": stop},
        json.dumps({"P0": str(stop)}),
        placeholder=None,
        amounts=amounts,
    )


@STRESS
@given(
    amounts=st.lists(money("0", "1000000"), min_size=3, max_size=3),
    excl=st.sets(st.sampled_from(_POOL_NAMES)),
)
def test_excluded_pools_override_matches_direct(amounts, excl):
    """A list excluded_pools override delivered as a JSON array reproduces a
    directly-constructed list[str] exclusion set."""
    excl_list = sorted(excl)
    _equivalence(
        "excluded_pools",
        excl_list,
        json.dumps(excl_list),
        placeholder=[],
        amounts=amounts,
    )


def test_structured_override_anchor():
    """Concrete anchors: a {"P0": "30"} expense-stop override and a ["P1"] exclusion
    override each reproduce the directly-built lease's financials exactly."""
    amounts = [Decimal("300000.00"), Decimal("150000.00"), Decimal("0.00")]

    _equivalence(
        "expense_stops",
        {"P0": Decimal("30")},
        '{"P0": "30"}',
        placeholder=None,
        amounts=amounts,
    )
    _equivalence(
        "excluded_pools",
        ["P1"],
        '["P1"]',
        placeholder=[],
        amounts=amounts,
    )


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
