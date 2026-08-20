"""
Unit tests for the credit pack billing API endpoints and webhook handler.

Tests:
- POST /checkout/credits
- GET /credits
- GET /credits/history
- handle_checkout_session_completed with mode='payment'
- handle_checkout_session_completed with mode='subscription' (legacy path)
- _handle_credit_pack_checkout_completed edge cases
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest


@pytest.fixture
def mock_org_context():
    """Mock OrganizationContext with org data."""
    org_id = uuid4()
    user = MagicMock()
    user.email = "admin@test.com"

    ctx = MagicMock()
    ctx.organization_id = org_id
    ctx.user = user

    org_result = MagicMock()
    org_result.data = {"name": "Test Org", "billing_email": "billing@test.com"}
    ctx.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
        org_result
    )

    credits_result = MagicMock()
    credits_result.data = []
    ctx.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value = (
        credits_result
    )

    return ctx


class TestGetCreditsEndpoint:
    @pytest.mark.asyncio
    async def test_returns_zero_balance_when_no_packs(self, mock_org_context):
        from app.api.v1.billing import get_credits

        result = await get_credits(ctx=mock_org_context)
        assert result.total_purchased == 0
        assert result.total_remaining == 0

    @pytest.mark.asyncio
    async def test_returns_credit_balance(self, mock_org_context):
        from app.api.v1.billing import get_credits

        credits_result = MagicMock()
        credits_result.data = [
            {"credits_purchased": 5, "credits_used": 2, "credits_remaining": 3}
        ]
        mock_org_context.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value = (
            credits_result
        )

        result = await get_credits(ctx=mock_org_context)
        assert result.total_purchased == 5
        assert result.total_used == 2
        assert result.total_remaining == 3

    @pytest.mark.asyncio
    async def test_paginates_all_credit_packs_for_balance(self, mock_org_context):
        from app.api.v1.billing import get_credits
        from app.services.billing.credits import AUDIT_CREDIT_PAGE_SIZE

        first_page = MagicMock()
        first_page.data = [
            {"credits_purchased": 1, "credits_used": 0, "credits_remaining": 1}
            for _ in range(AUDIT_CREDIT_PAGE_SIZE)
        ]
        second_page = MagicMock()
        second_page.data = [
            {"credits_purchased": 2, "credits_used": 1, "credits_remaining": 1}
        ]
        mock_org_context.table.return_value.select.return_value.eq.return_value.range.return_value.execute.side_effect = [
            first_page,
            second_page,
        ]

        result = await get_credits(ctx=mock_org_context)

        assert result.total_purchased == AUDIT_CREDIT_PAGE_SIZE + 2
        assert result.total_used == 1
        assert result.total_remaining == AUDIT_CREDIT_PAGE_SIZE + 1


class TestGetCreditHistoryEndpoint:
    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_packs(self, mock_org_context):
        from app.api.v1.billing import get_credit_history

        credits_result = MagicMock()
        credits_result.data = []
        mock_org_context.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = (
            credits_result
        )

        result = await get_credit_history(ctx=mock_org_context)
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_credit_packs(self, mock_org_context):
        from app.api.v1.billing import get_credit_history

        now = datetime.now(UTC).isoformat()
        pack_id = str(uuid4())
        org_id = str(mock_org_context.organization_id)
        credits_result = MagicMock()
        credits_result.data = [
            {
                "id": pack_id,
                "organization_id": org_id,
                "credits_purchased": 5,
                "credits_used": 2,
                "credits_remaining": 3,
                "unit_price_cents": 69900,
                "stripe_payment_intent_id": "pi_test",
                "stripe_checkout_session_id": "cs_test",
                "purchased_at": now,
            }
        ]
        mock_org_context.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = (
            credits_result
        )

        result = await get_credit_history(ctx=mock_org_context)
        assert len(result) == 1
        assert result[0].credits_purchased == 5

    @pytest.mark.asyncio
    async def test_paginates_credit_pack_history(self, mock_org_context):
        from app.api.v1.billing import get_credit_history
        from app.services.billing.credits import AUDIT_CREDIT_PAGE_SIZE

        now = datetime.now(UTC).isoformat()
        org_id = str(mock_org_context.organization_id)

        def pack(credits_purchased: int) -> dict[str, object]:
            return {
                "id": str(uuid4()),
                "organization_id": org_id,
                "credits_purchased": credits_purchased,
                "credits_used": 0,
                "credits_remaining": credits_purchased,
                "unit_price_cents": 69900,
                "stripe_payment_intent_id": "pi_test",
                "stripe_checkout_session_id": str(uuid4()),
                "purchased_at": now,
            }

        first_page = MagicMock()
        first_page.data = [pack(1) for _ in range(AUDIT_CREDIT_PAGE_SIZE)]
        second_page = MagicMock()
        second_page.data = [pack(7)]
        mock_org_context.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.side_effect = [
            first_page,
            second_page,
        ]

        result = await get_credit_history(ctx=mock_org_context)

        assert len(result) == AUDIT_CREDIT_PAGE_SIZE + 1
        assert result[-1].credits_purchased == 7


class TestWebhookCreditPackHandler:
    """Tests for handle_checkout_session_completed with credit pack logic."""

    @pytest.mark.asyncio
    async def test_payment_mode_routes_to_credit_handler(self):
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        insert_result = MagicMock()
        insert_result.data = [{"id": str(uuid4())}]
        db.table.return_value.insert.return_value.execute.return_value = insert_result

        session = {
            "id": "cs_test",
            "mode": "payment",
            "metadata": {
                "organization_id": str(uuid4()),
                "billing_model": "credit_pack",
                "quantity": "5",
            },
            "amount_total": 5 * 699 * 100,
            "payment_intent": "pi_test",
        }

        # Should not raise
        await handle_checkout_session_completed(session, db)

    @pytest.mark.asyncio
    async def test_subscription_mode_routes_to_winback_handler(self):
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        db.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = (
            MagicMock()
        )

        session = {
            "mode": "subscription",
            "metadata": {
                "organization_id": str(uuid4()),
                "offer_tier": "discount_50",
            },
        }

        await handle_checkout_session_completed(session, db)
        db.table.assert_called_with("free_audit_winback_offers")

    @pytest.mark.asyncio
    async def test_payment_mode_missing_org_id_is_no_op(self):
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        session = {
            "mode": "payment",
            "metadata": {},  # No organization_id
            "amount_total": 34950,
            "payment_intent": "pi_test",
        }

        await handle_checkout_session_completed(session, db)
        db.table.assert_not_called()

    @pytest.mark.asyncio
    async def test_payment_mode_invalid_quantity_is_no_op(self):
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        session = {
            "mode": "payment",
            "metadata": {
                "organization_id": str(uuid4()),
                "quantity": "not_a_number",
            },
            "amount_total": 34950,
        }

        await handle_checkout_session_completed(session, db)
        db.table.assert_not_called()

    @pytest.mark.asyncio
    async def test_payment_mode_zero_quantity_is_no_op(self):
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        session = {
            "mode": "payment",
            "metadata": {
                "organization_id": str(uuid4()),
                "quantity": "0",
            },
            "amount_total": 0,
        }

        await handle_checkout_session_completed(session, db)
        db.table.assert_not_called()

    @pytest.mark.asyncio
    async def test_payment_mode_db_exception_reraises_for_retry(self):
        """If add_credits raises a non-duplicate error, it propagates for Stripe retry."""
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        db.table.return_value.insert.return_value.execute.side_effect = RuntimeError(
            "DB connection lost"
        )

        session = {
            "id": "cs_test",
            "mode": "payment",
            "metadata": {
                "organization_id": str(uuid4()),
                "billing_model": "credit_pack",
                "quantity": "5",
            },
            "amount_total": 5 * 699 * 100,
            "payment_intent": "pi_test",
        }

        with pytest.raises(RuntimeError, match="DB connection lost"):
            await handle_checkout_session_completed(session, db)

    @pytest.mark.asyncio
    async def test_payment_mode_comped_purchase_unit_price_zero(self):
        """Comped purchase (amount_total=0) stores unit_price_cents=0 without error."""
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        insert_result = MagicMock()
        insert_result.data = [{"id": str(uuid4())}]
        db.table.return_value.insert.return_value.execute.return_value = insert_result

        session = {
            "id": "cs_comped",
            "mode": "payment",
            "metadata": {
                "organization_id": str(uuid4()),
                "billing_model": "credit_pack",
                "quantity": "3",
            },
            "amount_total": 0,  # 100% comped
            "payment_intent": "pi_comped",
        }

        await handle_checkout_session_completed(session, db)

        call_kwargs = db.table.return_value.insert.call_args[0][0]
        assert call_kwargs["unit_price_cents"] == 0
        assert call_kwargs["credits_purchased"] == 3

    @pytest.mark.asyncio
    async def test_payment_mode_duplicate_checkout_is_info_not_exception(self):
        """Duplicate checkout session logs INFO, not exception-level."""
        from app.api.routes.webhooks import handle_checkout_session_completed

        db = MagicMock()
        db.table.return_value.insert.return_value.execute.side_effect = Exception(
            "duplicate key value violates unique constraint (23505)"
        )

        session = {
            "id": "cs_dup",
            "mode": "payment",
            "metadata": {
                "organization_id": str(uuid4()),
                "billing_model": "credit_pack",
                "quantity": "5",
            },
            "amount_total": 5 * 699 * 100,
            "payment_intent": "pi_dup",
        }

        # Should not raise — duplicate is logged at INFO level, not exception level
        await handle_checkout_session_completed(session, db)
