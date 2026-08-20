"""Tests for handle_subscription_created admin notification wiring."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.routes.webhooks import handle_subscription_created


def _make_sub(org_id: str = "org-123", price_id: str | None = None) -> dict:
    """Build a minimal Stripe subscription object."""
    items_data = []
    if price_id:
        items_data = [{"quantity": 3, "price": {"id": price_id}}]
    return {
        "id": "sub_abc",
        "customer": "cus_abc",
        "status": "active",
        "metadata": {"organization_id": org_id},
        "items": {"data": items_data},
        "current_period_start": 1700000000,
        "current_period_end": 1702678400,
        "cancel_at_period_end": False,
    }


def _make_db(user_email: str = "manager@acme.com") -> MagicMock:
    """Return a mock DB that returns a user and org on lookup."""
    db = MagicMock()
    tables: dict[str, MagicMock] = {}

    user_result = MagicMock()
    user_result.data = {"email": user_email, "full_name": "Manager"}
    org_result = MagicMock()
    org_result.data = {
        "name": "Acme Properties",
        "settings": {
            "billing_activation": {
                "plan_id": "growth",
                "billing_period": "annual",
                "unit_count": 25,
                "building_count": 1,
                "checkout_required": True,
            }
        },
    }
    sub_result = MagicMock(data=[{"id": "row-1"}])

    def table_side_effect(name: str):
        tbl = tables.setdefault(name, MagicMock())
        if name == "users":
            tbl.select.return_value.eq.return_value.eq.return_value.limit.return_value.single.return_value.execute.return_value = (
                user_result
            )
        elif name == "organizations":
            tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                org_result
            )
        else:
            tbl.upsert.return_value.execute.return_value = sub_result
        return tbl

    db.table.side_effect = table_side_effect
    db._tables = tables
    return db


class TestHandleSubscriptionCreatedAdminNotification:
    @pytest.mark.asyncio
    async def test_admin_notified_for_real_user_subscription(self):
        """Admin notification is fired when a real user subscribes."""
        db = _make_db(user_email="manager@acme.com")

        with (
            patch(
                "app.api.routes.webhooks.AdminNotificationService.notify_subscription_started",
                new_callable=AsyncMock,
            ) as mock_notify,
            patch("app.config.get_settings") as mock_settings,
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = "noreply@capveri.com"
            await handle_subscription_created(_make_sub(), db)

        mock_notify.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_admin_notification_failure_does_not_raise(self):
        """If admin notification fails, handle_subscription_created still completes."""
        db = _make_db()

        with (
            patch(
                "app.api.routes.webhooks.AdminNotificationService.notify_subscription_started",
                new_callable=AsyncMock,
                side_effect=Exception("Email service down"),
            ),
            patch("app.config.get_settings") as mock_settings,
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = "noreply@capveri.com"
            # Should not raise — failure is swallowed and logged
            await handle_subscription_created(_make_sub(), db)

    @pytest.mark.asyncio
    async def test_checkout_gate_marked_complete_after_subscription_created(self):
        """Subscription activation clears the pending checkout gate in org settings."""
        db = _make_db()

        with (
            patch("app.config.get_settings") as mock_settings,
            patch(
                "app.api.routes.webhooks.AdminNotificationService.notify_subscription_started",
                new_callable=AsyncMock,
            ),
        ):
            mock_settings.return_value.resend_api_key = "re_test"
            mock_settings.return_value.resend_from_address = "noreply@capveri.com"
            await handle_subscription_created(_make_sub(), db)

        organizations_table = db._tables["organizations"]
        assert organizations_table.update.called
        saved_settings = organizations_table.update.call_args.args[0]["settings"]
        assert saved_settings["billing_activation"]["checkout_required"] is False
