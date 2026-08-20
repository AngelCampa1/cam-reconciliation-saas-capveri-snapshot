"""Metamorphic property-based stress for the reconciliation orchestrator.

The existing ``test_orchestrator_e2e_stress.py`` pins the *single-run* invariants
(after_cap <= before_cap, recovery identity, per-tenant sum == property total).
This harness adds the *cross-run* (metamorphic) invariants — relations that must
hold between two reconciliations whose inputs differ in one controlled way:

  * **Override equivalence** — applying a ``cross_doc_overrides`` term override is
    financially identical to constructing the lease with that value directly.
    The override seam (``_apply_cross_doc_overrides``, orchestrator.py:255) has
    only ever been unit-tested in isolation; this drives it through the WHOLE
    pipeline and proves it changes nothing but the targeted term.
  * **Pro-rata monotonicity** — with no cap, raising a tenant's ``pro_rata_share``
    never lowers its recovery.
  * **Admin-fee monotonicity** — raising ``admin_fee_percentage`` never lowers a
    tenant's admin fee or total recovery.
  * **Zero expenses ⇒ zero recovery** — if every pool totals zero, every tenant
    recovers exactly zero (no rounding cents invented from nothing).

A break here is a real mis-billing: an override that silently perturbs an
untouched term, or a non-monotonic share that over/under-charges a tenant.

Run standalone:
    pytest tests/stress/test_reconciliation_metamorphic_stress.py -q
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
    TermOverrideSuggestion,
    _parse_override_value,
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


@st.composite
def pool_summary(draw, *, force_amount: Decimal | None = None):
    is_grossed = draw(st.booleans())
    if force_amount is not None:
        amount = force_amount
    else:
        amount = draw(money("0", "5000000"))
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


def _lease(
    *,
    pro_rata: Decimal,
    admin_pct: Decimal = Decimal("0"),
    sqft: Decimal = Decimal("10000"),
    proration: Decimal = Decimal("1"),
) -> LeaseTerms:
    """A simple, cap-free, stop-free lease — keeps recovery a monotone function
    of pro_rata_share and admin_fee_percentage so the metamorphic relations are
    exact (no cap ratchet or expense-stop nonlinearity in the way)."""
    return LeaseTerms(
        lease_id=uuid4(),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        tenant_sqft=sqft,
        cap_type=CapType.NONE,
        cap_rate=None,
        proration_factor=proration,
    )


def _recon_input(sqft):
    return ReconciliationInput(
        property_id=uuid4(),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=sqft,
    )


def _run(input_data, leases, pools, overrides=None):
    async def _go():
        with patch(_PATCH_TARGET, return_value={}):
            return await run_property_reconciliation(
                input_data, leases, pools, cross_doc_overrides=overrides
            )

    return asyncio.run(_go())


def _financials(result):
    """The billing-relevant projection of a reconciliation, ignoring the trace
    (the override path legitimately adds a trace step, so traces differ)."""
    return (
        result.total_recovery,
        result.gross_up_factor,
        result.total_grossed_up_expenses,
        [
            (
                t.tenant_share_before_cap,
                t.tenant_share_after_cap,
                t.admin_fee,
                t.total_recovery,
            )
            for t in result.tenant_reconciliations
        ],
    )


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=3),
    base_share=ratio("0", "0.4"),
    new_share=ratio("0", "0.9"),
    admin=ratio("0", "0.3"),
)
def test_override_equivalent_to_direct_construction(
    sqft, pools, base_share, new_share, admin
):
    """Running with a pro_rata_share override == running with a lease built with
    that value directly. The override must touch ONLY the targeted term."""
    lease = _lease(pro_rata=base_share, admin_pct=admin)
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(sqft)

    suggested = str(new_share)
    override = TermOverrideSuggestion(
        field_name="pro_rata_share",
        lease_id=str(lease.lease_id),
        current_value=str(base_share),
        suggested_value=suggested,
        reasoning="metamorphic-test",
        confidence=90,
    )
    via_override = _run(recon, [lease], pool_map, overrides=[override])

    # Direct lease built through the SAME parse path the SUT uses, so any
    # divergence is the orchestrator failing to apply (or over-applying) the
    # override — not a float/parse artifact.
    direct_terms = LeaseTerms.model_validate(
        lease.model_dump(mode="python")
        | {"pro_rata_share": _parse_override_value(suggested)}
    )
    via_direct = _run(recon, [direct_terms], pool_map)

    assert _financials(via_override) == _financials(via_direct)


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=3),
    low=ratio("0", "0.4"),
    bump=ratio("0", "0.5"),
    admin=ratio("0", "0.3"),
)
def test_pro_rata_share_monotonic_no_cap(sqft, pools, low, bump, admin):
    """Cap-free: a larger pro_rata_share never yields a smaller recovery."""
    high = min(low + bump, Decimal("1"))
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(sqft)
    # Same lease_id/sqft/proration so gross-up is identical across runs.
    base = _lease(pro_rata=low, admin_pct=admin)
    hi = LeaseTerms.model_validate(
        base.model_dump(mode="python") | {"pro_rata_share": high}
    )

    r_low = _run(recon, [base], pool_map)
    r_high = _run(recon, [hi], pool_map)

    t_low = r_low.tenant_reconciliations[0]
    t_high = r_high.tenant_reconciliations[0]
    assert t_high.tenant_share_before_cap >= t_low.tenant_share_before_cap - _CENT
    assert t_high.total_recovery >= t_low.total_recovery - _CENT


@STRESS
@given(
    sqft=money("1", "1000000"),
    pools=st.lists(pool_summary(), min_size=1, max_size=3),
    share=ratio("0", "0.6"),
    low_admin=ratio("0", "0.2"),
    bump=ratio("0", "0.3"),
)
def test_admin_fee_monotonic(sqft, pools, share, low_admin, bump):
    """A larger admin_fee_percentage never lowers the admin fee or recovery."""
    high_admin = min(low_admin + bump, Decimal("1"))
    pool_map = {p.pool_id: p for p in pools}
    recon = _recon_input(sqft)
    base = _lease(pro_rata=share, admin_pct=low_admin)
    hi = LeaseTerms.model_validate(
        base.model_dump(mode="python") | {"admin_fee_percentage": high_admin}
    )

    t_low = _run(recon, [base], pool_map).tenant_reconciliations[0]
    t_high = _run(recon, [hi], pool_map).tenant_reconciliations[0]
    # The share itself is unaffected by admin fee.
    assert abs(t_high.tenant_share_after_cap - t_low.tenant_share_after_cap) <= _CENT
    assert t_high.admin_fee >= t_low.admin_fee - _CENT
    assert t_high.total_recovery >= t_low.total_recovery - _CENT


@STRESS
@given(
    sqft=money("1", "1000000"),
    n_pools=st.integers(min_value=1, max_value=4),
    leases=st.lists(
        st.builds(_lease, pro_rata=ratio("0", "0.9"), admin_pct=ratio("0", "0.4")),
        min_size=1,
        max_size=4,
    ),
    data=st.data(),
)
def test_zero_expenses_yield_zero_recovery(sqft, n_pools, leases, data):
    """Every pool totals exactly zero ⇒ every tenant recovers exactly zero.
    No cents may be invented out of an empty expense base."""
    pools = [
        data.draw(pool_summary(force_amount=Decimal("0.00"))) for _ in range(n_pools)
    ]
    pool_map = {p.pool_id: p for p in pools}
    result = _run(_recon_input(sqft), leases, pool_map)

    assert result.total_recovery == Decimal("0")
    for t in result.tenant_reconciliations:
        assert t.tenant_share_before_cap == Decimal("0")
        assert t.tenant_share_after_cap == Decimal("0")
        assert t.admin_fee == Decimal("0")
        assert t.total_recovery == Decimal("0")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
