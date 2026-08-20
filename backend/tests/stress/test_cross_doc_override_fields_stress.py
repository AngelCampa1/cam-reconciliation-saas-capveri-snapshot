"""Metamorphic cross-document override equivalence across field types.

An accepted reviewer override is applied by ``_apply_cross_doc_overrides``
(orchestrator.py): the suggested value is run through ``_parse_override_value``
(``json.loads`` with a raw-string fallback) and then merged onto the lease via
``LeaseTerms.model_validate(lease.model_dump() | updates)``. Because the override
arrives as a *string* and is parsed with ``json.loads``, a numeric field such as
``pro_rata_share="0.3333"`` becomes a Python ``float`` before Pydantic coerces it
back to ``Decimal``. That float round-trip is a classic money-contamination site:
if it ever diverged from the value a reviewer actually intended, every tenant on
that lease would be silently over- or under-billed.

The metamorphic relation pins it shut. For each supported numeric field, running
the reconciliation with the value supplied *as an override on top of a different
placeholder lease* must produce financials byte-identical to running it with the
value *constructed directly on the lease*. The override pipeline is required to be
a faithful no-op relative to direct construction — only the delivery path differs.

Cycle 61 covered only ``pro_rata_share``; this extends the guarantee to
``admin_fee_percentage``, ``proration_factor``, and ``tenant_sqft`` (the latter via
an expense stop so it reaches the financials), driving each through the full
``run_property_reconciliation``. A break — the override path coercing a value the
direct path would not — is a direct mis-bill that no single-document test can see.

Run standalone:
    pytest tests/stress/test_cross_doc_override_fields_stress.py -q
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
from app.services.extraction.cross_doc_models import TermOverrideSuggestion

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PATCH_TARGET = "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories"

# field_name -> (placeholder value baked into the lease, strategy for the
# override/direct value). The placeholder differs from the generated value so the
# override is genuinely exercised (it must actually change the lease).
_FIELD_STRATEGIES = {
    "pro_rata_share": (
        Decimal("0.1"),
        st.decimals(
            min_value=Decimal("0.0001"),
            max_value=Decimal("0.9"),
            places=4,
            allow_nan=False,
            allow_infinity=False,
        ),
    ),
    "admin_fee_percentage": (
        Decimal("0.02"),
        st.decimals(
            min_value=Decimal("0"),
            max_value=Decimal("0.5"),
            places=4,
            allow_nan=False,
            allow_infinity=False,
        ),
    ),
    "proration_factor": (
        Decimal("1"),
        st.decimals(
            min_value=Decimal("0.0001"),
            max_value=Decimal("1"),
            places=4,
            allow_nan=False,
            allow_infinity=False,
        ),
    ),
    "tenant_sqft": (
        Decimal("10000"),
        st.decimals(
            min_value=Decimal("1000"),
            max_value=Decimal("500000.99"),
            places=2,
            allow_nan=False,
            allow_infinity=False,
        ),
    ),
}


def _base_kwargs(lease_id):
    """Common lease config; an expense stop is set so ``tenant_sqft`` (which scales
    the absorbed threshold) actually reaches the financials."""
    return {
        "lease_id": lease_id,
        "tenant_name": "T",
        "pro_rata_share": Decimal("0.5"),
        "admin_fee_percentage": Decimal("0.1"),
        "tenant_sqft": Decimal("10000"),
        "cap_type": CapType.NONE,
        "cap_rate": None,
        "proration_factor": Decimal("1"),
        "expense_stops": {"OP": Decimal("1")},
    }


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
        pool_name="OP",
        pool_type="operating",
        total_amount=Decimal("300000.00"),
        is_gross_up_applicable=False,
        gross_up_target=None,
    )
    return {pool.pool_id: pool}


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


@STRESS
@given(field=st.sampled_from(sorted(_FIELD_STRATEGIES)), data=st.data())
def test_override_matches_direct_construction(field, data):
    """Applying a numeric field via an accepted cross-doc override yields financials
    identical to constructing the lease with that value directly. The string ->
    json.loads -> Decimal override path must not diverge from direct construction."""
    placeholder, strategy = _FIELD_STRATEGIES[field]
    value = data.draw(strategy)

    lease_id = uuid4()
    pools = _pools()

    direct_lease = LeaseTerms(**(_base_kwargs(lease_id) | {field: value}))
    direct = _run([direct_lease], pools).tenant_reconciliations[0]

    placeholder_lease = LeaseTerms(**(_base_kwargs(lease_id) | {field: placeholder}))
    override = TermOverrideSuggestion(
        field_name=field,
        lease_id=str(lease_id),
        current_value=str(placeholder),
        suggested_value=str(value),
        reasoning="stress",
        confidence=100,
    )
    overridden = _run(
        [placeholder_lease], pools, overrides=[override]
    ).tenant_reconciliations[0]

    assert _result_tuple(overridden) == _result_tuple(direct)


def test_override_equivalence_anchor():
    """Concrete anchor: overriding pro_rata_share from a 0.1 placeholder to 0.5
    reproduces the financials of a lease built with 0.5 directly (150k share)."""
    lease_id = uuid4()
    pools = _pools()

    direct_lease = LeaseTerms(
        **(_base_kwargs(lease_id) | {"pro_rata_share": Decimal("0.5")})
    )
    direct = _run([direct_lease], pools).tenant_reconciliations[0]

    placeholder_lease = LeaseTerms(
        **(_base_kwargs(lease_id) | {"pro_rata_share": Decimal("0.1")})
    )
    override = TermOverrideSuggestion(
        field_name="pro_rata_share",
        lease_id=str(lease_id),
        current_value="0.1",
        suggested_value="0.5",
        reasoning="stress",
        confidence=100,
    )
    overridden = _run(
        [placeholder_lease], pools, overrides=[override]
    ).tenant_reconciliations[0]

    # 300k pool * 0.5 share = 150k, minus a 1/sqft * 10000 = 10k expense stop.
    assert direct.tenant_share_before_cap == Decimal("140000.00")
    assert _result_tuple(overridden) == _result_tuple(direct)
    assert overridden.pro_rata_share == Decimal("0.5")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
