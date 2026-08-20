"""Tests for webhook app filtering — ignore events from other apps."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestWebhookAppFilter:
    """Webhook handler skips events that belong to a different app."""

    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture(autouse=True)
    def mock_stripe_settings(self):
        with patch("app.api.routes.webhooks.get_stripe_settings") as mock:
            mock.return_value = MagicMock(stripe_webhook_secret="whsec_test")
            yield mock

    def _make_event(self, event_type, event_id, data_dict):
        mock_obj = MagicMock()
        mock_obj.to_dict_recursive.return_value = data_dict
        mock_event = MagicMock()
        mock_event.type = event_type
        mock_event.id = event_id
        mock_event.data.object = mock_obj
        return mock_event

    @pytest.mark.asyncio
    async def test_skips_event_from_other_app(self, mock_db):
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_event = self._make_event(
            "checkout.session.completed",
            "evt_other",
            {
                "id": "cs_other",
                "mode": "payment",
                "metadata": {"app": "camaudit", "organization_id": "org-other"},
            },
        )

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks._claim_webhook_event",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                "app.api.routes.webhooks._complete_webhook_event",
                new_callable=AsyncMock,
            ) as mock_complete,
            patch(
                "app.api.routes.webhooks.handle_checkout_session_completed",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b"{}")
            request.headers = {"stripe-signature": "t=123,v1=abc"}
            result = await handle_stripe_webhook(request, mock_db)
            assert result == {"received": True}
            mock_handler.assert_not_called()
            mock_complete.assert_called_once()

    @pytest.mark.asyncio
    async def test_processes_event_from_own_app(self, mock_db):
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_event = self._make_event(
            "checkout.session.completed",
            "evt_own",
            {
                "id": "cs_ours",
                "mode": "subscription",
                "metadata": {"app": "capveri", "organization_id": "org-ours"},
            },
        )

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks._claim_webhook_event",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                "app.api.routes.webhooks._complete_webhook_event",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.routes.webhooks.handle_checkout_session_completed",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b"{}")
            request.headers = {"stripe-signature": "t=123,v1=abc"}
            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_processes_legacy_event_without_app_metadata(self, mock_db):
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_event = self._make_event(
            "customer.subscription.created",
            "evt_legacy",
            {
                "id": "sub_legacy",
                "metadata": {"organization_id": "org-legacy"},
                "customer": "cus_legacy",
                "status": "active",
                "items": {"data": []},
            },
        )

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks._claim_webhook_event",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                "app.api.routes.webhooks._complete_webhook_event",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.routes.webhooks.handle_subscription_created",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b"{}")
            request.headers = {"stripe-signature": "t=123,v1=abc"}
            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_invoice_events_always_processed(self, mock_db):
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_event = self._make_event(
            "invoice.paid",
            "evt_invoice",
            {
                "id": "in_other",
                "metadata": {},
                "subscription": "sub_other",
                "customer": "cus_other",
                "status": "paid",
                "amount_paid": 9900,
            },
        )

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks._claim_webhook_event",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                "app.api.routes.webhooks._complete_webhook_event",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.routes.webhooks.handle_invoice_paid",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b"{}")
            request.headers = {"stripe-signature": "t=123,v1=abc"}
            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_non_filterable_event_with_other_app_metadata_still_processed(
        self, mock_db
    ):
        """Invoice events bypass filter even when they carry another app's metadata."""
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_event = self._make_event(
            "invoice.payment_failed",
            "evt_invoice_other_app",
            {
                "id": "in_cross",
                "metadata": {"app": "geoleap"},
                "subscription": "sub_cross",
                "customer": "cus_cross",
                "status": "open",
                "amount_due": 4900,
            },
        )

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks._claim_webhook_event",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                "app.api.routes.webhooks._complete_webhook_event",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.routes.webhooks.handle_invoice_payment_failed",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b"{}")
            request.headers = {"stripe-signature": "t=123,v1=abc"}
            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_handles_metadata_null_without_crash(self, mock_db):
        from app.api.routes.webhooks import handle_stripe_webhook

        mock_event = self._make_event(
            "checkout.session.completed",
            "evt_null",
            {
                "id": "cs_null",
                "mode": "subscription",
                "metadata": None,
            },
        )

        with (
            patch("stripe.Webhook.construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks._claim_webhook_event",
                new_callable=AsyncMock,
                return_value=True,
            ),
            patch(
                "app.api.routes.webhooks._complete_webhook_event",
                new_callable=AsyncMock,
            ),
            patch(
                "app.api.routes.webhooks.handle_checkout_session_completed",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            request = MagicMock()
            request.body = AsyncMock(return_value=b"{}")
            request.headers = {"stripe-signature": "t=123,v1=abc"}
            await handle_stripe_webhook(request, mock_db)
            mock_handler.assert_called_once()
