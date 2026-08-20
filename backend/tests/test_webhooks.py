"""
Tests for Stripe webhook handlers.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import stripe
from fastapi import HTTPException


@pytest.fixture
def mock_db():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def mock_stripe_settings():
    """Mock Stripe settings."""
    settings = MagicMock()
    settings.stripe_webhook_secret = "whsec_test_secret"
    settings.stripe_price_id_reconcile_annual = "price_reconcile_annual"
    settings.stripe_price_id_control_annual = "price_control_annual"
    settings.stripe_price_id_defend_annual = "price_defend_annual"
    settings.stripe_price_id_growth_base_annual = "price_growth_base_annual"
    settings.stripe_price_id_unit_overage_annual = "price_unit_overage_annual"
    settings.stripe_price_id_growth_v2_annual = "price_legacy_growth_annual"
    settings.stripe_price_id_portfolio_annual = "price_legacy_portfolio_annual"
    return settings


def test_trial_charge_fallback_uses_generated_launch_offer_price() -> None:
    from app.api.routes.webhooks import _format_trial_charge_amount
    from app.services.billing.generated_plan_tiers import get_launch_offer_annual_cents

    fallback_cents = get_launch_offer_annual_cents("reconcile")
    assert fallback_cents is not None
    assert _format_trial_charge_amount({"metadata": {}, "items": {"data": []}}) == (
        f"${fallback_cents / 100:,.2f}/year"
    )


class TestWebhookSignatureVerification:
    """Test webhook signature verification."""

    def test_webhook_rejects_missing_signature(self, mock_db):
        """Verify webhook rejects requests without signature header."""
        from app.api.routes.webhooks import handle_stripe_webhook

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"type": "test"}')
        request.headers.get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            import asyncio

            asyncio.run(handle_stripe_webhook(request, mock_db))

        assert exc_info.value.status_code == 400
        assert "Missing stripe-signature" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_webhook_rejects_invalid_signature(
        self, mock_db, mock_stripe_settings
    ):
        """Verify webhook rejects invalid signatures."""
        from app.api.routes.webhooks import handle_stripe_webhook

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"type": "test"}')
        request.headers.get.return_value = "invalid_signature"

        with patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=mock_stripe_settings,
        ):
            with patch.object(
                stripe.Webhook,
                "construct_event",
                side_effect=stripe.error.SignatureVerificationError(
                    "Invalid signature", "sig_header"
                ),
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await handle_stripe_webhook(request, mock_db)

                assert exc_info.value.status_code == 400
                assert "Invalid signature" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_webhook_rejects_invalid_payload(self, mock_db, mock_stripe_settings):
        """Verify webhook rejects invalid JSON payloads."""
        from app.api.routes.webhooks import handle_stripe_webhook

        request = MagicMock()
        request.body = AsyncMock(return_value=b"invalid json")
        request.headers.get.return_value = "valid_signature"

        with patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=mock_stripe_settings,
        ):
            with patch.object(
                stripe.Webhook,
                "construct_event",
                side_effect=ValueError("Invalid payload"),
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await handle_stripe_webhook(request, mock_db)

                assert exc_info.value.status_code == 400
                assert "Invalid payload" in exc_info.value.detail


class TestSubscriptionCreatedHandler:
    """Test subscription.created webhook handler."""

    @pytest.mark.asyncio
    async def test_subscription_created_with_metadata(
        self, mock_db, mock_stripe_settings
    ):
        """Verify subscription.created creates a hybrid per-unit database record."""
        from app.api.routes.webhooks import handle_subscription_created

        org_id = str(uuid4())
        subscription = {
            "id": "sub_test123",
            "customer": "cus_test123",
            "metadata": {
                "organization_id": org_id,
                "plan_id": "growth",
                "pricing_model": "per_unit",
                "unit_count": "120",
                "included_units": "50",
                "unit_overage_count": "70",
                "building_count": "12",
            },
            "status": "active",
            "cancel_at_period_end": False,
            "current_period_start": int(datetime.now(UTC).timestamp()),
            "current_period_end": int(datetime.now(UTC).timestamp() + 2592000),
            "items": {
                "data": [
                    {
                        "price": {"id": "price_growth_base_annual"},
                        "quantity": 1,
                    }
                ]
            },
        }

        mock_result = MagicMock()
        mock_result.data = [{"id": "some-db-id"}]
        mock_db.table.return_value.upsert.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=mock_stripe_settings,
        ):
            await handle_subscription_created(subscription, mock_db)

            mock_db.table.assert_any_call("subscriptions")
            assert mock_db.table.return_value.upsert.called

            call_args = mock_db.table.return_value.upsert.call_args[0][0]
            assert call_args["organization_id"] == org_id
            assert call_args["stripe_subscription_id"] == "sub_test123"
            assert call_args["plan"] == "growth_v2"
            assert call_args["pricing_model"] == "per_unit"
            assert call_args["building_count"] == 12
            assert call_args["unit_count"] == 120
            assert call_args["included_units"] == 50
            assert call_args["unit_overage_count"] == 70

    @pytest.mark.asyncio
    async def test_subscription_created_without_org_returns_early(
        self, mock_db, mock_stripe_settings
    ):
        """Verify handler returns early when org cannot be found."""
        from app.api.routes.webhooks import handle_subscription_created

        # Use dict structure instead of MagicMock
        subscription = {
            "id": "sub_test123",
            "customer": "cus_test123",
            "metadata": {},  # No org_id
        }

        # Mock database returning no org
        mock_result = MagicMock()
        mock_result.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            mock_result
        )

        with patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=mock_stripe_settings,
        ):
            await handle_subscription_created(subscription, mock_db)

            # Verify upsert was NOT called (returned early)
            assert not mock_db.table.return_value.upsert.called

    @pytest.mark.asyncio
    async def test_trialing_subscription_sends_trial_started_email(
        self, mock_db, mock_stripe_settings
    ):
        """Verify trialing subscriptions trigger the trial-started email once."""
        from app.api.routes.webhooks import handle_subscription_created

        org_id = str(uuid4())
        subscription = {
            "id": "sub_trial_123",
            "customer": "cus_trial_123",
            "metadata": {
                "organization_id": org_id,
                "plan_id": "growth",
                "pricing_model": "per_unit",
                "unit_count": "25",
                "building_count": "1",
            },
            "status": "trialing",
            "trial_start": int(datetime.now(UTC).timestamp()),
            "trial_end": int(datetime.now(UTC).timestamp() + 2592000),
            "cancel_at_period_end": False,
            "items": {"data": []},
            "__event_id": "evt_trial_started_1",
        }

        upsert_result = MagicMock(data=[{"id": "sub-row"}])
        claim_result = MagicMock(data=[{"id": "claim-row"}])
        user_result = MagicMock(data=[{"email": "owner@example.com"}])
        org_result = MagicMock(data={"name": "Acme Properties", "billing_email": None})

        def table_side_effect(name: str):
            table = MagicMock()
            if name == "subscriptions":
                table.upsert.return_value.execute.return_value = upsert_result
            elif name == "subscription_email_events":
                table.upsert.return_value.execute.return_value = claim_result
                table.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    None
                )
            elif name == "users":
                table.select.return_value.eq.return_value.eq.return_value.limit.return_value.single.return_value.execute.return_value = MagicMock(
                    data={"email": "admin@example.com", "full_name": "Admin User"}
                )
                table.select.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = (
                    user_result
                )
            elif name == "organizations":
                table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    org_result
                )
            return table

        mock_db.table.side_effect = table_side_effect

        with (
            patch(
                "app.api.routes.webhooks.get_stripe_settings",
                return_value=mock_stripe_settings,
            ),
            patch("app.api.routes.webhooks.get_settings") as mock_settings,
            patch("app.api.routes.webhooks.build_email_service") as mock_email_factory,
            patch(
                "app.api.routes.webhooks.AdminNotificationService.notify_subscription_started",
                new_callable=AsyncMock,
            ),
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = (
                "CapVeri <noreply@capveri.com>"
            )
            mock_settings.return_value.admin_notification_email = "alerts@example.com"
            mock_email_service = MagicMock()
            mock_email_service.send_trial_started_email = AsyncMock(
                return_value={"status": "sent", "id": "email_trial_started"}
            )
            mock_email_factory.return_value = mock_email_service

            await handle_subscription_created(subscription, mock_db)

        mock_email_service.send_trial_started_email.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_trialing_subscription_uses_customer_lookup_for_trial_email(
        self, mock_db, mock_stripe_settings
    ):
        """Verify trial email still sends when org metadata is missing but customer lookup succeeds."""
        from app.api.routes.webhooks import handle_subscription_created

        org_id = str(uuid4())
        subscription = {
            "id": "sub_trial_lookup",
            "customer": "cus_trial_lookup",
            "metadata": {},
            "status": "trialing",
            "trial_start": int(datetime.now(UTC).timestamp()),
            "trial_end": int(datetime.now(UTC).timestamp() + 2592000),
            "cancel_at_period_end": False,
            "items": {
                "data": [
                    {
                        "price": {
                            "id": "price_growth_base_annual",
                            "unit_amount": 349500,
                            "recurring": {"interval": "year"},
                        },
                        "quantity": 1,
                    }
                ]
            },
            "__event_id": "evt_trial_lookup_1",
        }

        subscription_lookup_result = MagicMock(data=[{"organization_id": org_id}])
        upsert_result = MagicMock(data=[{"id": "sub-row"}])
        claim_result = MagicMock(data=[{"id": "claim-row"}])
        org_result = MagicMock(
            data={"name": "Acme Properties", "billing_email": "billing@example.com"}
        )

        subscriptions_table = MagicMock()
        subscriptions_table.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            subscription_lookup_result
        )
        subscriptions_table.upsert.return_value.execute.return_value = upsert_result

        subscription_email_events_table = MagicMock()
        subscription_email_events_table.upsert.return_value.execute.return_value = (
            claim_result
        )
        subscription_email_events_table.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            None
        )

        users_table = MagicMock()
        users_table.select.return_value.eq.return_value.eq.return_value.limit.return_value.single.return_value.execute.return_value = MagicMock(
            data={"email": "admin@example.com", "full_name": "Admin User"}
        )

        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            org_result
        )

        def table_side_effect(name: str):
            if name == "subscriptions":
                return subscriptions_table
            if name == "subscription_email_events":
                return subscription_email_events_table
            if name == "users":
                return users_table
            if name == "organizations":
                return organizations_table
            return MagicMock()

        mock_db.table.side_effect = table_side_effect

        with (
            patch(
                "app.api.routes.webhooks.get_stripe_settings",
                return_value=mock_stripe_settings,
            ),
            patch("app.api.routes.webhooks.get_settings") as mock_settings,
            patch("app.api.routes.webhooks.build_email_service") as mock_email_factory,
            patch(
                "app.api.routes.webhooks.AdminNotificationService.notify_subscription_started",
                new_callable=AsyncMock,
            ),
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = (
                "CapVeri <noreply@capveri.com>"
            )
            mock_settings.return_value.admin_notification_email = "alerts@example.com"
            mock_email_service = MagicMock()
            mock_email_service.send_trial_started_email = AsyncMock(
                return_value={"status": "sent", "id": "email_trial_started_lookup"}
            )
            mock_email_factory.return_value = mock_email_service

            await handle_subscription_created(subscription, mock_db)

        mock_email_service.send_trial_started_email.assert_awaited_once()


class TestSubscriptionTrialWillEndHandler:
    """Test the trial_will_end reminder handler."""

    @pytest.mark.asyncio
    async def test_trial_will_end_sends_reminder_email_once(self, mock_db):
        """Verify the 3-day reminder email is sent and logged."""
        from app.api.routes.webhooks import handle_subscription_trial_will_end

        org_id = str(uuid4())
        subscription = {
            "id": "sub_trial_ending",
            "metadata": {
                "organization_id": org_id,
                "plan_id": "growth",
                "pricing_model": "per_unit",
                "unit_count": "50",
                "building_count": "2",
            },
            "trial_start": int(datetime.now(UTC).timestamp()),
            "trial_end": int(datetime.now(UTC).timestamp() + 259200),
            "__event_id": "evt_trial_will_end_1",
        }

        claim_result = MagicMock(data=[{"id": "claim-row"}])
        org_result = MagicMock(
            data={"name": "Acme Properties", "billing_email": "billing@example.com"}
        )

        def table_side_effect(name: str):
            table = MagicMock()
            if name == "subscription_email_events":
                table.upsert.return_value.execute.return_value = claim_result
                table.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
                    None
                )
            elif name == "organizations":
                table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                    org_result
                )
            elif name == "users":
                table.select.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[]
                )
            return table

        mock_db.table.side_effect = table_side_effect

        with (
            patch("app.api.routes.webhooks.get_settings") as mock_settings,
            patch("app.api.routes.webhooks.build_email_service") as mock_email_factory,
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = (
                "CapVeri <noreply@capveri.com>"
            )
            mock_email_service = MagicMock()
            mock_email_service.send_trial_ending_soon_email = AsyncMock(
                return_value={"status": "sent", "id": "email_trial_reminder"}
            )
            mock_email_factory.return_value = mock_email_service

            await handle_subscription_trial_will_end(subscription, mock_db)

        mock_email_service.send_trial_ending_soon_email.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_paused_subscription_sends_trial_paused_email_once(self, mock_db):
        """Verify a paused trial sends the access-paused email."""
        from app.api.routes.webhooks import handle_subscription_updated

        org_id = str(uuid4())
        subscription = {
            "id": "sub_trial_paused",
            "customer": "cus_trial_paused",
            "metadata": {
                "organization_id": org_id,
                "plan_id": "growth",
                "pricing_model": "per_unit",
                "unit_count": "50",
                "building_count": "2",
            },
            "status": "paused",
            "trial_start": int(datetime.now(UTC).timestamp() - 2592000),
            "trial_end": int(datetime.now(UTC).timestamp()),
            "items": {
                "data": [
                    {
                        "price": {
                            "id": "price_growth_base_annual",
                            "unit_amount": 349500,
                            "recurring": {"interval": "year"},
                        },
                        "quantity": 1,
                    }
                ]
            },
            "__event_id": "evt_trial_paused_1",
        }

        subscriptions_table = MagicMock()
        subscriptions_table.update.return_value.eq.return_value.execute.return_value = (
            None
        )

        subscription_email_events_table = MagicMock()
        subscription_email_events_table.upsert.return_value.execute.return_value = (
            MagicMock(data=[{"id": "claim-row"}])
        )
        subscription_email_events_table.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
            None
        )

        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"name": "Acme Properties", "billing_email": "billing@example.com"}
        )

        users_table = MagicMock()
        users_table.select.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        def table_side_effect(name: str):
            if name == "subscriptions":
                return subscriptions_table
            if name == "subscription_email_events":
                return subscription_email_events_table
            if name == "organizations":
                return organizations_table
            if name == "users":
                return users_table
            return MagicMock()

        mock_db.table.side_effect = table_side_effect

        with (
            patch("app.api.routes.webhooks.get_settings") as mock_settings,
            patch("app.api.routes.webhooks.build_email_service") as mock_email_factory,
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = (
                "CapVeri <noreply@capveri.com>"
            )
            mock_email_service = MagicMock()
            mock_email_service.send_trial_paused_email = AsyncMock(
                return_value={"status": "sent", "id": "email_trial_paused"}
            )
            mock_email_factory.return_value = mock_email_service

            await handle_subscription_updated(subscription, mock_db)

        mock_email_service.send_trial_paused_email.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_trial_will_end_raises_when_no_recipient(self, mock_db):
        """Verify missing billing recipient releases claim and raises for retry."""
        from app.api.routes.webhooks import handle_subscription_trial_will_end

        org_id = str(uuid4())
        subscription = {
            "id": "sub_trial_missing_recipient",
            "metadata": {
                "organization_id": org_id,
                "plan_id": "growth",
                "pricing_model": "per_unit",
                "unit_count": "50",
            },
            "trial_start": int(datetime.now(UTC).timestamp()),
            "trial_end": int(datetime.now(UTC).timestamp() + 259200),
            "__event_id": "evt_trial_missing_recipient_1",
        }

        claim_result = MagicMock(data=[{"id": "claim-row"}])
        org_result = MagicMock(data={"name": "Acme Properties", "billing_email": None})

        subscription_email_events_table = MagicMock()
        subscription_email_events_table.upsert.return_value.execute.return_value = (
            claim_result
        )
        subscription_email_events_table.delete.return_value.eq.return_value.eq.return_value.execute.return_value = (
            None
        )

        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            org_result
        )

        users_table = MagicMock()
        users_table.select.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        def table_side_effect(name: str):
            if name == "subscription_email_events":
                return subscription_email_events_table
            if name == "organizations":
                return organizations_table
            if name == "users":
                return users_table
            return MagicMock()

        mock_db.table.side_effect = table_side_effect

        with pytest.raises(RuntimeError, match="No billing contact found"):
            await handle_subscription_trial_will_end(subscription, mock_db)

        assert subscription_email_events_table.delete.called

    @pytest.mark.asyncio
    async def test_trial_will_end_keeps_claim_if_finalize_fails(self, mock_db):
        """Verify finalize failures do not release claim and risk duplicate sends."""
        from app.api.routes.webhooks import handle_subscription_trial_will_end

        org_id = str(uuid4())
        subscription = {
            "id": "sub_trial_finalize_fail",
            "metadata": {
                "organization_id": org_id,
                "plan_id": "growth",
                "pricing_model": "per_unit",
                "unit_count": "50",
            },
            "trial_start": int(datetime.now(UTC).timestamp()),
            "trial_end": int(datetime.now(UTC).timestamp() + 259200),
            "__event_id": "evt_trial_finalize_fail_1",
        }

        claim_result = MagicMock(data=[{"id": "claim-row"}])
        org_result = MagicMock(
            data={"name": "Acme Properties", "billing_email": "billing@example.com"}
        )

        subscription_email_events_table = MagicMock()
        subscription_email_events_table.upsert.return_value.execute.return_value = (
            claim_result
        )
        subscription_email_events_table.update.return_value.eq.return_value.eq.return_value.execute.side_effect = RuntimeError(
            "db finalize failed"
        )
        subscription_email_events_table.delete.return_value.eq.return_value.eq.return_value.execute.return_value = (
            None
        )

        organizations_table = MagicMock()
        organizations_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            org_result
        )

        users_table = MagicMock()
        users_table.select.return_value.eq.return_value.in_.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[]
        )

        def table_side_effect(name: str):
            if name == "subscription_email_events":
                return subscription_email_events_table
            if name == "organizations":
                return organizations_table
            if name == "users":
                return users_table
            return MagicMock()

        mock_db.table.side_effect = table_side_effect

        with (
            patch("app.api.routes.webhooks.get_settings") as mock_settings,
            patch("app.api.routes.webhooks.build_email_service") as mock_email_factory,
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = (
                "CapVeri <noreply@capveri.com>"
            )
            mock_email_service = MagicMock()
            mock_email_service.send_trial_ending_soon_email = AsyncMock(
                return_value={"status": "sent", "id": "email_trial_reminder"}
            )
            mock_email_factory.return_value = mock_email_service

            with pytest.raises(RuntimeError, match="db finalize failed"):
                await handle_subscription_trial_will_end(subscription, mock_db)

        mock_email_service.send_trial_ending_soon_email.assert_awaited_once()
        assert not subscription_email_events_table.delete.called


class TestSubscriptionUpdatedHandler:
    """Test subscription.updated webhook handler."""

    @pytest.mark.asyncio
    async def test_subscription_updated_changes_plan(
        self, mock_db, mock_stripe_settings
    ):
        """Verify subscription.updated refreshes hybrid pricing metadata."""
        from app.api.routes.webhooks import handle_subscription_updated

        subscription = {
            "id": "sub_test123",
            "status": "active",
            "cancel_at_period_end": True,
            "current_period_start": int(datetime.now(UTC).timestamp()),
            "current_period_end": int(datetime.now(UTC).timestamp() + 2592000),
            "metadata": {
                "plan_id": "portfolio",
                "pricing_model": "per_unit",
                "unit_count": "90",
                "included_units": "50",
                "unit_overage_count": "40",
                "building_count": "8",
            },
            "items": {
                "data": [
                    {
                        "price": {"id": "price_growth_base_annual"},
                        "quantity": 1,
                    }
                ]
            },
        }

        mock_update = mock_db.table.return_value.update.return_value
        mock_update.eq.return_value.execute.return_value = None

        with patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=mock_stripe_settings,
        ):
            await handle_subscription_updated(subscription, mock_db)

            mock_db.table.assert_called_with("subscriptions")
            assert mock_db.table.return_value.update.called

            call_args = mock_db.table.return_value.update.call_args[0][0]
            assert call_args["plan"] == "growth_v2"
            assert call_args["pricing_model"] == "per_unit"
            assert call_args["building_count"] == 8
            assert call_args["unit_count"] == 90
            assert call_args["included_units"] == 50
            assert call_args["unit_overage_count"] == 40
            assert call_args["cancel_at_period_end"] is True


class TestSubscriptionDeletedHandler:
    """Test subscription.deleted webhook handler."""

    @pytest.mark.asyncio
    async def test_subscription_deleted_sets_status_canceled(self, mock_db):
        """Verify subscription.deleted sets status to canceled."""
        from app.api.routes.webhooks import handle_subscription_deleted

        subscription = MagicMock()
        subscription.id = "sub_test123"

        mock_update = mock_db.table.return_value.update.return_value
        mock_update.eq.return_value.execute.return_value = None

        await handle_subscription_deleted(subscription, mock_db)

        # Verify database update was called
        mock_db.table.assert_called_with("subscriptions")

        # Verify status set to canceled
        call_args = mock_db.table.return_value.update.call_args[0][0]
        assert call_args["status"] == "canceled"


class TestInvoiceCreatedHandler:
    """Test invoice.created webhook handler."""

    @pytest.mark.asyncio
    async def test_invoice_created_inserts_invoice(self, mock_db):
        """Verify invoice.created inserts invoice record."""
        from app.api.routes.webhooks import handle_invoice_created

        org_id = str(uuid4())
        sub_id = str(uuid4())

        # Use dict structure instead of MagicMock for dict-like access
        period_start = int(datetime.now(UTC).timestamp())
        period_end = int(datetime.now(UTC).timestamp() + 2592000)
        invoice = {
            "id": "in_test123",
            "customer": "cus_test123",
            "subscription": "sub_test123",
            "amount_due": 99800,  # $998.00 in cents
            "amount_paid": 0,
            "currency": "usd",
            "status": "open",
            "period_start": period_start,
            "period_end": period_end,
            "due_date": int(datetime.now(UTC).timestamp() + 604800),
            "invoice_pdf": "https://stripe.com/invoice.pdf",
            "lines": {"data": []},
        }

        # Mock org lookup
        org_result = MagicMock()
        org_result.data = [{"organization_id": org_id}]

        # Mock subscription lookup
        sub_result = MagicMock()
        sub_result.data = [{"id": sub_id}]

        # Mock existing invoice lookup (not found)
        existing_result = MagicMock()
        existing_result.data = []

        def mock_table_chain(table_name):
            chain = MagicMock()
            if table_name == "subscriptions":
                mock_sub_chain = chain.select.return_value.eq.return_value
                mock_sub_chain.limit.return_value.execute.side_effect = [
                    org_result,
                    sub_result,
                ]
            elif table_name == "invoices":
                chain.select.return_value.eq.return_value.execute.return_value = (
                    existing_result
                )
                chain.insert.return_value.execute.return_value = None
            return chain

        mock_db.table.side_effect = mock_table_chain

        await handle_invoice_created(invoice, mock_db)

        # Verify invoices table was accessed
        assert any(
            call[0][0] == "invoices" for call in mock_db.table.call_args_list
        ), "invoices table should be accessed"


class TestInvoicePaidHandler:
    """Test invoice.paid webhook handler."""

    @pytest.mark.asyncio
    async def test_invoice_paid_updates_status(self, mock_db):
        """Verify invoice.paid updates invoice status to paid."""
        from app.api.routes.webhooks import handle_invoice_paid

        # Use dict structure instead of MagicMock
        invoice = {
            "id": "in_test123",
            "amount_paid": 99800,  # $998.00 in cents
            "invoice_pdf": "https://stripe.com/invoice.pdf",
        }

        mock_update = mock_db.table.return_value.update.return_value
        mock_update.eq.return_value.execute.return_value = None

        await handle_invoice_paid(invoice, mock_db)

        # Verify update was called
        call_args = mock_db.table.return_value.update.call_args[0][0]
        assert call_args["status"] == "paid"
        assert call_args["amount_paid"] == 998.00  # Converted from cents
        assert "paid_at" in call_args


class TestInvoicePaymentFailedHandler:
    """Test invoice.payment_failed webhook handler."""

    @pytest.mark.asyncio
    async def test_invoice_payment_failed_marks_past_due(self, mock_db):
        """Verify invoice.payment_failed marks subscription as past_due."""
        from app.api.routes.webhooks import handle_invoice_payment_failed

        invoice = {"id": "in_test123", "subscription": "sub_test123"}

        existing = MagicMock()
        existing.data = [{"id": "inv-row"}]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            existing
        )
        mock_update = mock_db.table.return_value.update.return_value
        mock_update.eq.return_value.execute.return_value = None

        await handle_invoice_payment_failed(invoice, mock_db)

        # Existing invoice lookup + invoice update + subscription update
        calls = [call[0][0] for call in mock_db.table.call_args_list]
        assert calls.count("invoices") == 2
        assert "subscriptions" in calls


class TestHelperFunctions:
    """Test helper mapping functions."""

    def test_map_price_to_plan(self):
        """Verify price ID mapping to plan names."""
        from app.api.routes.webhooks import _map_price_to_plan

        with patch("app.api.routes.webhooks.get_stripe_settings") as mock_settings:
            mock_settings.return_value.stripe_price_id_reconcile_annual = (
                "price_reconcile_annual_test"
            )
            mock_settings.return_value.stripe_price_id_control_annual = (
                "price_control_annual_test"
            )
            mock_settings.return_value.stripe_price_id_defend_annual = (
                "price_defend_annual_test"
            )
            mock_settings.return_value.stripe_price_id_growth_base_annual = (
                "price_growth_base_annual_test"
            )
            mock_settings.return_value.stripe_price_id_unit_overage_annual = (
                "price_unit_overage_annual_test"
            )
            mock_settings.return_value.stripe_price_id_growth_v2_annual = (
                "price_growth_v2_annual_test"
            )
            mock_settings.return_value.stripe_price_id_growth_annual = (
                "price_growth_annual_test"
            )
            assert _map_price_to_plan("price_reconcile_annual_test") == "growth_v2"
            assert _map_price_to_plan("price_control_annual_test") == "growth_v2"
            assert _map_price_to_plan("price_defend_annual_test") == "growth_v2"
            assert _map_price_to_plan("price_growth_base_annual_test") == "growth_v2"
            assert _map_price_to_plan("price_unit_overage_annual_test") == "growth_v2"
            # Legacy subscription tier mappings
            assert _map_price_to_plan("price_growth_v2_annual_test") == "growth_v2"
            # Legacy growth alias
            assert _map_price_to_plan("price_growth_annual_test") == "professional"
            assert _map_price_to_plan("price_deprecated_nonannual") == "growth_v2"
            assert _map_price_to_plan("unknown_price") == "growth_v2"  # Default

    def test_map_subscription_status(self):
        """Verify Stripe status mapping to our statuses."""
        from app.api.routes.webhooks import _map_subscription_status

        assert _map_subscription_status("active") == "active"
        assert _map_subscription_status("past_due") == "past_due"
        assert _map_subscription_status("canceled") == "canceled"
        assert _map_subscription_status("trialing") == "trialing"
        assert _map_subscription_status("unpaid") == "past_due"  # Maps to past_due
        assert _map_subscription_status("unknown") == "active"  # Default


class TestIdempotency:
    """Test webhook handler idempotency."""

    @pytest.mark.asyncio
    async def test_subscription_created_is_idempotent(self, mock_db):
        """Verify processing same subscription.created event twice is safe."""
        from app.api.routes.webhooks import handle_subscription_created

        org_id = str(uuid4())
        # Use dict structure instead of MagicMock
        subscription = {
            "id": "sub_test123",
            "customer": "cus_test123",
            "metadata": {"organization_id": org_id},
            "status": "active",
            "cancel_at_period_end": False,
            "current_period_start": int(datetime.now(UTC).timestamp()),
            "current_period_end": int(datetime.now(UTC).timestamp() + 2592000),
            "items": {
                "data": [
                    {
                        "price": {"id": "price_growth_annual"},
                        "quantity": 1,
                    }
                ]
            },
        }

        mock_result = MagicMock()
        mock_result.data = [{"id": "some-db-id"}]
        mock_db.table.return_value.upsert.return_value.execute.return_value = (
            mock_result
        )

        with patch("app.api.routes.webhooks.get_stripe_settings") as mock_settings:
            mock_settings.return_value.stripe_price_id_growth_annual = (
                "price_growth_annual"
            )

            # Process same event twice
            await handle_subscription_created(subscription, mock_db)
            await handle_subscription_created(subscription, mock_db)

            # Both should succeed (upsert handles duplicates)
            assert mock_db.table.return_value.upsert.call_count == 2


class TestUnknownEventType:
    """Test handling of unknown webhook event types."""

    @pytest.mark.asyncio
    async def test_unknown_event_type_returns_success(
        self, mock_db, mock_stripe_settings
    ):
        """Verify unknown event types are ignored gracefully (line 62)."""
        from app.api.routes.webhooks import handle_stripe_webhook

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"type": "unknown.event"}')
        request.headers.get.return_value = "valid_signature"

        # Mock successful signature verification
        mock_event = MagicMock()
        mock_event.type = "unknown.event.type"
        mock_event.data.object = {}

        with patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=mock_stripe_settings,
        ):
            with patch.object(
                stripe.Webhook, "construct_event", return_value=mock_event
            ):
                result = await handle_stripe_webhook(request, mock_db)

                # Should return success even for unknown events
                assert result == {"received": True}
                # Deduplication ops fire (claim + complete) but no domain handler runs
                mock_db.table.assert_called_with("stripe_webhook_events")


class TestStripeObjectConversion:
    """Test that StripeObject event data is converted to dict before dispatch."""

    @pytest.mark.asyncio
    async def test_stripe_object_converted_via_to_dict_recursive(
        self, mock_db, mock_stripe_settings
    ):
        """Verify StripeObject with to_dict_recursive() is converted to plain dict."""
        from app.api.routes.webhooks import handle_stripe_webhook

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"type": "checkout.session.completed"}')
        request.headers.get.return_value = "valid_signature"

        # Simulate a StripeObject: NOT a dict, but has to_dict_recursive()
        stripe_obj = MagicMock(spec=[])  # empty spec = no dict methods
        stripe_obj.to_dict_recursive = MagicMock(
            return_value={
                "id": "cs_test_123",
                "mode": "payment",
                "metadata": {"organization_id": "org_1", "quantity": "5"},
                "payment_intent": "pi_test",
                "amount_total": 500,
            }
        )

        mock_event = MagicMock()
        mock_event.type = "checkout.session.completed"
        mock_event.id = "evt_test_to_dict_recursive"
        mock_event.data.object = stripe_obj

        # Dedup claim returns data so handler proceeds
        claim_result = MagicMock()
        claim_result.data = [{"stripe_event_id": "evt_test_to_dict_recursive"}]
        mock_db.table.return_value.upsert.return_value.execute.return_value = (
            claim_result
        )

        with (
            patch(
                "app.api.routes.webhooks.get_stripe_settings",
                return_value=mock_stripe_settings,
            ),
            patch.object(stripe.Webhook, "construct_event", return_value=mock_event),
            patch(
                "app.api.routes.webhooks.handle_checkout_session_completed",
                new_callable=AsyncMock,
            ) as mock_handler,
        ):
            result = await handle_stripe_webhook(request, mock_db)

        assert result == {"received": True}
        # to_dict_recursive() was called to convert the StripeObject
        stripe_obj.to_dict_recursive.assert_called_once()
        # Handler received a plain dict, not the StripeObject
        mock_handler.assert_called_once()
        handler_arg = mock_handler.call_args[0][0]
        assert isinstance(handler_arg, dict)
        assert handler_arg["mode"] == "payment"


class TestInvoiceEdgeCases:
    """Test invoice handler edge cases."""

    @pytest.mark.asyncio
    async def test_invoice_created_without_org_returns_early(self, mock_db):
        """Verify invoice_created returns early when org not found (line 131-132)."""
        from app.api.routes.webhooks import handle_invoice_created

        invoice = MagicMock()
        invoice.id = "in_test123"
        invoice.customer = "cus_unknown"

        # Mock org lookup returning no results
        org_result = MagicMock()
        org_result.data = []

        mock_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            org_result
        )

        await handle_invoice_created(invoice, mock_db)

        # Should return early without inserting invoice
        # Only 1 table call for org lookup, no upsert
        assert mock_db.table.call_count == 1
        assert not mock_db.table.return_value.upsert.called

    @pytest.mark.asyncio
    async def test_invoice_created_without_subscription(self, mock_db):
        """Verify invoice_created handles None subscription (line 135)."""
        from app.api.routes.webhooks import handle_invoice_created

        org_id = str(uuid4())

        # Use dict structure instead of MagicMock for dict-like access
        period_start = int(datetime.now(UTC).timestamp())
        period_end = int(datetime.now(UTC).timestamp() + 2592000)
        invoice = {
            "id": "in_test123",
            "customer": "cus_test123",
            "subscription": None,  # No subscription
            "amount_due": 5000,
            "amount_paid": 0,
            "currency": "usd",
            "status": "open",
            "period_start": period_start,
            "period_end": period_end,
            "due_date": int(datetime.now(UTC).timestamp() + 604800),
            "invoice_pdf": "https://stripe.com/invoice.pdf",
            "lines": {"data": []},
        }

        # Mock org lookup
        org_result = MagicMock()
        org_result.data = [{"organization_id": org_id}]

        # Mock existing invoice lookup (not found)
        existing_result = MagicMock()
        existing_result.data = []

        def mock_table_chain(table_name):
            chain = MagicMock()
            if table_name == "subscriptions":
                chain.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
                    org_result
                )
            elif table_name == "invoices":
                chain.select.return_value.eq.return_value.execute.return_value = (
                    existing_result
                )
                chain.insert.return_value.execute.return_value = None
            return chain

        mock_db.table.side_effect = mock_table_chain

        await handle_invoice_created(invoice, mock_db)

        # Verify invoices table was accessed with None subscription_id
        assert any(
            call[0][0] == "invoices" for call in mock_db.table.call_args_list
        ), "invoices table should be accessed"

    @pytest.mark.asyncio
    async def test_invoice_created_with_none_timestamps(self, mock_db):
        """Verify invoice_created handles None timestamps by returning early."""
        from app.api.routes.webhooks import handle_invoice_created

        org_id = str(uuid4())

        # Use dict structure instead of MagicMock for dict-like access
        invoice = {
            "id": "in_test123",
            "customer": "cus_test123",
            "subscription": None,
            "amount_due": 0,
            "amount_paid": 0,
            "currency": "usd",
            "status": "draft",
            "period_start": None,  # No period start
            "period_end": None,  # No period end
            "due_date": None,  # No due date
            "invoice_pdf": None,
            "lines": {"data": []},
        }

        # Mock org lookup
        org_result = MagicMock()
        org_result.data = [{"organization_id": org_id}]

        def mock_table_chain(table_name):
            chain = MagicMock()
            if table_name == "subscriptions":
                chain.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
                    org_result
                )
            elif table_name == "invoices":
                chain.insert.return_value.execute.return_value = None
            return chain

        mock_db.table.side_effect = mock_table_chain

        # Should complete without error - handler returns early for invalid periods
        await handle_invoice_created(invoice, mock_db)

        # With None timestamps, handler should return early (line 246-248)
        # Only subscriptions table accessed for org lookup, no invoice insert
        table_calls = [call[0][0] for call in mock_db.table.call_args_list]
        assert "subscriptions" in table_calls

    @pytest.mark.asyncio
    async def test_invoice_payment_failed_without_subscription(self, mock_db):
        """Verify payment_failed handles invoice without subscription (line 194)."""
        from app.api.routes.webhooks import handle_invoice_payment_failed

        # Use dict structure instead of MagicMock
        invoice = {
            "id": "in_test123",
            "subscription": None,  # No subscription
        }

        existing = MagicMock()
        existing.data = [{"id": "inv-row"}]
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            existing
        )
        mock_update = mock_db.table.return_value.update.return_value
        mock_update.eq.return_value.execute.return_value = None

        await handle_invoice_payment_failed(invoice, mock_db)

        # Existing invoice lookup + invoice update, no subscription update
        calls = [call[0][0] for call in mock_db.table.call_args_list]
        assert calls == ["invoices", "invoices"]

    @pytest.mark.asyncio
    async def test_invoice_payment_failed_creates_missing_invoice(self, mock_db):
        """Verify payment_failed backfills the invoice when it does not exist yet."""
        from app.api.routes import webhooks

        invoice = {"id": "in_missing", "subscription": None}

        existing = MagicMock()
        existing.data = []
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
            existing
        )
        mock_update = mock_db.table.return_value.update.return_value
        mock_update.eq.return_value.execute.return_value = None

        with patch.object(
            webhooks, "handle_invoice_created", new=AsyncMock()
        ) as mock_created:
            await webhooks.handle_invoice_payment_failed(invoice, mock_db)

        mock_created.assert_awaited_once_with(invoice, mock_db)


class TestResendWebhook:
    """Tests for Resend inbound email webhook."""

    @pytest.mark.asyncio
    async def test_resend_webhook_missing_signature(self, mock_db):
        """Reject webhook with missing signature."""
        from app.api.routes.webhooks import handle_resend_webhook

        request = MagicMock()
        request.body = AsyncMock(return_value=b'{"type": "email.received"}')
        request.headers.get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await handle_resend_webhook(request, mock_db)

        assert exc_info.value.status_code == 400
        assert "Missing svix-signature" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_resend_webhook_invalid_signature(self, mock_db):
        """Reject webhook with invalid signature."""
        from app.api.routes.webhooks import handle_resend_webhook

        request = MagicMock()
        payload = b'{"type": "email.received"}'
        request.body = AsyncMock(return_value=payload)
        request.headers.get.return_value = "t=123 v1=invalid"

        mock_settings = MagicMock()
        mock_settings.resend_webhook_secret = "whsec_TEST_PLACEHOLDER_NOT_A_REAL_SECRET"

        with patch("app.config.get_settings", return_value=mock_settings):
            with pytest.raises(HTTPException) as exc_info:
                await handle_resend_webhook(request, mock_db)

            assert exc_info.value.status_code == 400
            assert "Invalid webhook signature" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_resend_webhook_forwards_email(self, mock_db):
        """Successfully forward inbound email."""
        import hashlib
        import hmac
        import json

        from app.api.routes.webhooks import handle_resend_webhook

        # Create test payload
        timestamp = "1234567890"
        payload_dict = {
            "type": "email.received",
            "data": {
                "from": "customer@example.com",
                "to": "support@capveri.com",
                "subject": "Help needed",
                "html": "<p>I need help</p>",
                "text": "I need help",
            },
        }
        payload = json.dumps(payload_dict).encode()

        # Create valid signature
        signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
        signature = hmac.new(
            b"whsec_TEST_PLACEHOLDER_NOT_A_REAL_SECRET",
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        # Mock request
        request = MagicMock()
        request.body = AsyncMock(return_value=payload)
        request.headers.get.return_value = f"t={timestamp} v1={signature}"

        # Mock settings
        mock_settings = MagicMock()
        mock_settings.resend_webhook_secret = "whsec_TEST_PLACEHOLDER_NOT_A_REAL_SECRET"
        mock_settings.resend_api_key = "re_test_key"
        mock_settings.resend_from_address = "CapVeri <noreply@capveri.com>"

        # Mock shared EmailService factory
        with patch("app.config.get_settings", return_value=mock_settings):
            with patch("app.services.email.build_email_service") as mock_build:
                mock_email_service = MagicMock()
                mock_email_service.forward_inbound_email = AsyncMock(
                    return_value={"status": "sent", "id": "email_123"}
                )
                mock_build.return_value = mock_email_service

                result = await handle_resend_webhook(request, mock_db)

                assert result == {"received": True}

                # Verify the normalized shared factory is used.
                mock_build.assert_called_once_with()

                # Verify email was forwarded with correct parameters
                mock_email_service.forward_inbound_email.assert_called_once_with(
                    to_email="angel.campa@capveri.com",
                    original_from="customer@example.com",
                    original_to="support@capveri.com",
                    subject="Help needed",
                    html="<p>I need help</p>",
                    text="I need help",
                )

    @pytest.mark.asyncio
    async def test_resend_webhook_ignores_non_capveri_domain(self, mock_db):
        """Ignore emails to non-CapVeri domains (geoleap, gathergrove, skilledger)."""
        import hashlib
        import hmac
        import json

        from app.api.routes.webhooks import handle_resend_webhook

        # Create test payload for GeoLeap domain
        timestamp = "1234567890"
        payload_dict = {
            "type": "email.received",
            "data": {
                "from": "someone@outlook.com",
                "to": "support@geoleap.app",
                "subject": "GeoLeap support request",
                "html": "<p>Help with GeoLeap</p>",
                "text": "Help with GeoLeap",
            },
        }
        payload = json.dumps(payload_dict).encode()

        # Create valid signature
        signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
        signature = hmac.new(
            b"whsec_TEST_PLACEHOLDER_NOT_A_REAL_SECRET",
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        # Mock request
        request = MagicMock()
        request.body = AsyncMock(return_value=payload)
        request.headers.get.return_value = f"t={timestamp} v1={signature}"

        # Mock settings
        mock_settings = MagicMock()
        mock_settings.resend_webhook_secret = "whsec_TEST_PLACEHOLDER_NOT_A_REAL_SECRET"
        mock_settings.resend_api_key = "re_test_key"
        mock_settings.resend_from_address = "CapVeri <noreply@capveri.com>"

        # Mock EmailService
        with patch("app.config.get_settings", return_value=mock_settings):
            with patch(
                "app.services.email.resend_service.EmailService"
            ) as mock_email_service_class:
                mock_email_service = MagicMock()
                mock_email_service.forward_inbound_email = AsyncMock()
                mock_email_service_class.return_value = mock_email_service

                result = await handle_resend_webhook(request, mock_db)

                # Should return success (to prevent Resend retries)
                assert result == {"received": True}

                # But email should NOT be forwarded
                mock_email_service.forward_inbound_email.assert_not_called()

    def test_is_capveri_recipient_with_capveri_domain(self):
        """Accept emails to capveri.com domain."""
        from app.api.routes.webhooks import _is_capveri_recipient

        assert _is_capveri_recipient("support@capveri.com") is True
        assert _is_capveri_recipient("info@capveri.com") is True
        assert _is_capveri_recipient("test@CAPVERI.COM") is True  # Case insensitive

    def test_is_capveri_recipient_with_other_domain(self):
        """Reject emails to other domains."""
        from app.api.routes.webhooks import _is_capveri_recipient

        assert _is_capveri_recipient("support@geoleap.app") is False
        assert _is_capveri_recipient("info@gathergrove.club") is False
        assert _is_capveri_recipient("help@skilledger.app") is False
        assert _is_capveri_recipient("user@example.com") is False

    def test_is_capveri_recipient_with_list(self):
        """Handle list of recipients."""
        from app.api.routes.webhooks import _is_capveri_recipient

        # List with CapVeri email
        assert _is_capveri_recipient(["user@capveri.com"]) is True
        assert _is_capveri_recipient(["user@other.com", "support@capveri.com"]) is True

        # List without CapVeri email
        assert _is_capveri_recipient(["user@geoleap.app"]) is False
        assert _is_capveri_recipient(["user@geoleap.app", "info@other.com"]) is False

    def test_is_capveri_recipient_with_none(self):
        """Handle None and invalid inputs."""
        from app.api.routes.webhooks import _is_capveri_recipient

        assert _is_capveri_recipient(None) is False
        assert _is_capveri_recipient("") is False
        assert _is_capveri_recipient([]) is False
        assert _is_capveri_recipient("invalid_email") is False
