"""Regression tests for maybe_single() → None guard fixes (BUG-15).

In postgrest/supabase 2.x, `.maybe_single().execute()` returns Python ``None``
(not a response object) when zero rows match.  Each test below configures the
mock so that ``maybe_single().execute()`` returns ``None`` directly — exactly
what the real client does — and asserts that the endpoint/service returns a
clean error rather than crashing with AttributeError.

One test per distinct guard shape as instructed by CLAUDE.md.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
    get_current_user,
    get_org_scoped_context,
)
from app.models.enums import UserRole
from app.models.user import User
from tests.conftest import create_test_app

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _user(org_id=None):
    oid = org_id or uuid4()
    return User(
        id=uuid4(),
        email="test@example.com",
        organization_id=oid,
        role=UserRole.ADMIN,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _make_client(user, mock_supabase) -> TestClient:
    """Return a TestClient (using the test app factory) with dependency overrides."""
    test_app = create_test_app()

    async def _get_user():
        return user

    async def _get_org():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=user.organization_id,
            user=user,
        )

    test_app.dependency_overrides[get_current_user] = _get_user
    test_app.dependency_overrides[get_org_scoped_context] = _get_org

    tc = TestClient(test_app, raise_server_exceptions=False)
    tc.mock_supabase = mock_supabase
    return tc


def _chain_returning(data):
    """Fluent mock chain whose execute() returns SimpleNamespace(data=data)."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.update.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = SimpleNamespace(data=data)
    return chain


def _chain_returning_none():
    """Fluent mock chain whose execute() returns None — simulating real
    supabase 2.x behaviour when maybe_single() finds zero rows."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.update.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.maybe_single.return_value = chain
    # Real client returns None, not SimpleNamespace(data=None)
    chain.execute.return_value = None
    return chain


# ===========================================================================
# 1. reconciliation.py ~599  — calculate: non-existent property → 404 not 500
# ===========================================================================


class TestReconciliationCalculateMaybeSingleNone:
    def test_nonexistent_property_returns_404_not_500(self):
        """POST /api/v1/reconciliation/calculate with unknown property_id must
        return 404 (NotFoundError), not AttributeError / 500."""
        user = _user()
        mock_sb = MagicMock()
        # maybe_single().execute() returns None for the property lookup
        mock_sb.table.return_value = _chain_returning_none()

        tc = _make_client(user, mock_sb)
        resp = tc.post(
            "/api/v1/reconciliation/calculate",
            json={
                "property_id": str(uuid4()),
                "period_start": "2024-01-01",
                "period_end": "2024-12-31",
            },
        )
        assert resp.status_code == 404, resp.text


# ===========================================================================
# 2. properties.py ~292  — get imports: non-existent property → 404 not 500
# ===========================================================================


class TestPropertiesImportsMaybeSingleNone:
    def test_nonexistent_property_returns_404_not_500(self):
        """GET /api/v1/properties/{id}/imports with unknown property_id must
        return 404, not AttributeError / 500."""
        user = _user()
        mock_sb = MagicMock()
        mock_sb.table.return_value = _chain_returning_none()

        tc = _make_client(user, mock_sb)
        resp = tc.get(f"/api/v1/properties/{uuid4()}/imports")
        assert resp.status_code == 404, resp.text


# ===========================================================================
# 3. exports.py ~643  — anchor = X.data if X else None → NotFoundError
# ===========================================================================


class TestExportsBatchPdfAnchorNone:
    def test_missing_anchor_snapshot_returns_404_not_500(self):
        """GET .../export/batch-pdf when maybe_single() returns None must
        return 404, not 500."""
        user = _user()
        mock_sb = MagicMock()
        # maybe_single().execute() returns None → anchor_result is None
        mock_sb.table.return_value = _chain_returning_none()

        tc = _make_client(user, mock_sb)
        resp = tc.get(
            f"/api/v1/exports/reconciliation/snapshots/{uuid4()}/export/batch-pdf"
        )
        assert resp.status_code == 404, resp.text


# ===========================================================================
# 4. cross_doc_analysis.py ~233  — row = X.data if X else None → 404
# ===========================================================================


class TestCrossDocUpdateFindingNone:
    def test_missing_analysis_returns_404_not_500(self):
        """PATCH /api/v1/cross-doc-analysis/{id}/findings/{fid} when
        maybe_single() returns None must return 404, not AttributeError / 500."""
        user = _user()
        mock_sb = MagicMock()
        mock_sb.table.return_value = _chain_returning_none()

        tc = _make_client(user, mock_sb)
        resp = tc.patch(
            f"/api/v1/cross-doc-analysis/{uuid4()}/findings/{uuid4()}",
            json={"decision": "accepted", "reason": "ok"},
        )
        assert resp.status_code == 404, resp.text


# ===========================================================================
# 5. services/billing/guarantee.py ~102 and ~205
#    check_eligibility: None subscription row → returns eligible (not claimed)
#    claim_refund:      None subscription row → stripe_sub_id is None, no crash
# ===========================================================================


class TestGuaranteeMaybeSingleNone:
    @pytest.mark.asyncio
    async def test_check_eligibility_none_sub_row_treated_as_not_claimed(self):
        """When maybe_single returns None for the subscriptions row,
        check_eligibility must NOT raise AttributeError; it should treat the
        subscription as not-yet-claimed and continue normally."""
        from app.services.billing.guarantee import GuaranteeService

        org_id = uuid4()
        mock_db = MagicMock()

        paid_at = datetime.now(UTC) - timedelta(days=5)
        invoice_row = {
            "id": str(uuid4()),
            "stripe_invoice_id": "in_test",
            "amount_paid": 100.0,
            "currency": "usd",
            "paid_at": paid_at.isoformat(),
            "status": "paid",
        }

        # First table call (invoices) → returns a real row
        invoice_chain = _chain_returning([invoice_row])
        # Second table call (subscriptions) → maybe_single returns None
        sub_chain = _chain_returning_none()

        mock_db.table.side_effect = [invoice_chain, sub_chain]

        svc = GuaranteeService(stripe_service=MagicMock(), db=mock_db)
        result = await svc.check_eligibility(org_id)

        # None sub row → not claimed → still eligible within window
        assert result.eligible is True

    @pytest.mark.asyncio
    async def test_claim_refund_none_sub_row_skips_stripe_cancel(self):
        """When maybe_single returns None for subscriptions during claim_refund,
        stripe_sub_id must be None (no AttributeError) and cancel must be skipped."""
        from decimal import Decimal
        from unittest.mock import patch

        import stripe as stripe_lib

        from app.services.billing.guarantee import (
            GuaranteeEligibility,
            GuaranteeService,
        )

        org_id = uuid4()
        mock_db = MagicMock()

        paid_at = datetime.now(UTC) - timedelta(days=5)
        invoice_row = {
            "id": str(uuid4()),
            "stripe_invoice_id": "in_test",
            "amount_paid": 100.0,
            "currency": "usd",
            "paid_at": paid_at.isoformat(),
            "status": "paid",
        }

        # claim_refund fetches the invoice (limit-1 chain, not maybe_single)
        invoice_chain = MagicMock()
        invoice_chain.select.return_value = invoice_chain
        invoice_chain.eq.return_value = invoice_chain
        invoice_chain.order.return_value = invoice_chain
        invoice_chain.limit.return_value = invoice_chain
        invoice_chain.execute.return_value = SimpleNamespace(data=[invoice_row])

        # Subscription update chain (UPDATE SET claimed_at)
        update_chain = MagicMock()
        update_chain.update.return_value = update_chain
        update_chain.eq.return_value = update_chain
        update_chain.execute.return_value = SimpleNamespace(data=[{}])

        # Subscription stripe_sub_id lookup: maybe_single() returns None
        sub_chain = _chain_returning_none()

        # table() side_effect: invoices → update (subscriptions) → select (subscriptions)
        mock_db.table.side_effect = [invoice_chain, update_chain, sub_chain]

        mock_stripe_invoice = MagicMock()
        mock_stripe_invoice.get.return_value = "pi_test"

        mock_refund = MagicMock(spec=stripe_lib.Refund)
        mock_refund.id = "re_test"
        mock_refund.amount = 10000
        mock_refund.currency = "usd"

        mock_stripe = MagicMock()
        mock_stripe.retrieve_invoice = AsyncMock(return_value=mock_stripe_invoice)
        mock_stripe.create_refund = AsyncMock(return_value=mock_refund)
        mock_stripe.cancel_subscription_now = AsyncMock()

        eligible = GuaranteeEligibility(
            eligible=True,
            days_remaining=25,
            first_invoice_amount=Decimal("100.0"),
            first_invoice_currency="usd",
        )

        svc = GuaranteeService(stripe_service=mock_stripe, db=mock_db)
        with patch.object(svc, "check_eligibility", AsyncMock(return_value=eligible)):
            # Must not raise; stripe cancellation is skipped (no sub ID)
            await svc.claim_refund(org_id)

        mock_stripe.cancel_subscription_now.assert_not_called()


# ===========================================================================
# 6. services/extraction/cross_doc_assembler.py
#    _fetch_property_name: None → falls back to str(property_id)
#    _fetch_auditor_context: None prop → prop_data={}, None org → org_data={}
# ===========================================================================


class TestCrossDocAssemblerMaybeSingleNone:
    @pytest.mark.asyncio
    async def test_fetch_property_name_none_result_returns_id_string(self):
        """When maybe_single returns None for properties, _fetch_property_name
        must return str(property_id) without raising AttributeError."""
        from app.services.extraction.cross_doc_assembler import CrossDocAssembler

        prop_id = uuid4()
        db = MagicMock()
        db.table.return_value = _chain_returning_none()

        assembler = CrossDocAssembler(db=db)
        name = await assembler._fetch_property_name(prop_id)

        assert name == str(prop_id)

    @pytest.mark.asyncio
    async def test_fetch_auditor_context_none_prop_returns_defaults(self):
        """When maybe_single returns None for the property row,
        _fetch_auditor_context must return default AuditorContext and empty
        overrides without raising AttributeError."""
        from app.services.extraction.cross_doc_assembler import CrossDocAssembler
        from app.services.extraction.cross_doc_models import (
            AuditorContext,
            PropertyAuditorOverrides,
        )

        prop_id = uuid4()
        db = MagicMock()
        # Both property and org lookups return None
        db.table.return_value = _chain_returning_none()

        assembler = CrossDocAssembler(db=db)
        auditor_ctx, overrides = await assembler._fetch_auditor_context(prop_id)

        assert isinstance(auditor_ctx, AuditorContext)
        assert isinstance(overrides, PropertyAuditorOverrides)
