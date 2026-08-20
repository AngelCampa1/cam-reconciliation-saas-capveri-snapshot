"""Tests for server-side PostHog billing lifecycle events."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_capture_billing_event_sends_org_scoped_posthog_payload():
    """Billing events use organization identity and first-party revenue fields."""
    from app.services.analytics.posthog import capture_billing_event

    settings = MagicMock()
    settings.posthog_project_api_key = "phc_test"
    settings.posthog_host = "https://us.i.posthog.com"

    response = MagicMock()
    response.raise_for_status.return_value = None
    client = MagicMock()
    client.post = AsyncMock(return_value=response)
    client_cm = MagicMock()
    client_cm.__aenter__ = AsyncMock(return_value=client)
    client_cm.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("app.services.analytics.posthog.get_settings", return_value=settings),
        patch(
            "app.services.analytics.posthog.httpx.AsyncClient", return_value=client_cm
        ),
    ):
        await capture_billing_event(
            "invoice_paid",
            organization_id="org-123",
            properties={
                "amount_paid_cents": 349500,
                "currency": "usd",
                "stripe_invoice_id": "in_123",
                "customer_email": "owner@example.com",
            },
        )

    client.post.assert_awaited_once()
    url = client.post.call_args.args[0]
    payload = client.post.call_args.kwargs["json"]
    assert url == "https://us.i.posthog.com/capture/"
    assert payload["api_key"] == "phc_test"
    assert payload["event"] == "invoice_paid"
    assert payload["distinct_id"] == "org:org-123"
    assert payload["properties"]["source_app"] == "backend"
    assert payload["properties"]["organization_id"] == "org-123"
    assert payload["properties"]["amount_paid_cents"] == 349500
    assert payload["properties"]["$groups"] == {"organization": "org-123"}
    assert "customer_email" not in payload["properties"]


@pytest.mark.asyncio
async def test_capture_backend_event_scrubs_nested_pii_from_payload():
    """Backend analytics scrub sensitive fields before sending to PostHog."""
    from app.services.analytics.posthog import capture_backend_event

    settings = MagicMock()
    settings.posthog_project_api_key = "phc_test"
    settings.posthog_host = "https://us.i.posthog.com"

    response = MagicMock()
    response.raise_for_status.return_value = None
    client = MagicMock()
    client.post = AsyncMock(return_value=response)
    client_cm = MagicMock()
    client_cm.__aenter__ = AsyncMock(return_value=client)
    client_cm.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("app.services.analytics.posthog.get_settings", return_value=settings),
        patch(
            "app.services.analytics.posthog.httpx.AsyncClient", return_value=client_cm
        ),
    ):
        await capture_backend_event(
            "gl_import_failed",
            organization_id="org-123",
            user_id="user-123",
            properties={
                "email_address": "owner@example.com",
                "file_size_bucket": "1m_5m",
                "filename": "tenant-ledger.pdf",
                "document_url": "https://storage.example.com/tenant-ledger.pdf",
                "storage_key": "org-123/docs/tenant-ledger.pdf",
                "property_name": "Sunset Plaza",
                "tenant_name": "Acme Shops",
                "notes": "Raw internal dispute note",
                "source_text": "Lease paragraph text",
                "lead_email_domain": "example.com",
                "failure": {
                    "reason_code": "invalid_columns",
                    "contactEmail": "ops@example.com",
                    "userEmail": "redacted-token",
                    "contactName": "Jane Doe",
                    "phone_number": "+1 (555) 111-2222",
                    "storageKey": "org-123/docs/nested.pdf",
                    "sourceText": "Nested extracted source text",
                },
                "errors": [
                    {"row": 4, "message": "missing amount"},
                    {"row": 5, "value": "tenant@example.com"},
                    {"row": 6, "value": "https://storage.example.com/file.pdf"},
                ],
            },
        )

    payload = client.post.call_args.kwargs["json"]
    properties = payload["properties"]
    assert payload["event"] == "gl_import_failed"
    assert payload["distinct_id"] == "user:user-123"
    assert properties["source_app"] == "backend"
    assert properties["organization_id"] == "org-123"
    assert properties["user_id"] == "user-123"
    assert properties["file_size_bucket"] == "1m_5m"
    assert properties["lead_email_domain"] == "example.com"
    assert properties["failure"] == {"reason_code": "invalid_columns"}
    assert properties["errors"] == [{"row": 4}, {"row": 5}, {"row": 6}]
    assert "email_address" not in properties
    assert "filename" not in properties
    assert "document_url" not in properties
    assert "storage_key" not in properties
    assert "property_name" not in properties
    assert "tenant_name" not in properties
    assert "notes" not in properties
    assert "source_text" not in properties


def test_capture_backend_event_sync_is_noop_without_project_key():
    """Sync capture short-circuits before any network call without a key."""
    from app.services.analytics.posthog import capture_backend_event_sync

    settings = MagicMock()
    settings.posthog_project_api_key = ""
    settings.posthog_host = "https://us.i.posthog.com"

    with (
        patch("app.services.analytics.posthog.get_settings", return_value=settings),
        patch("app.services.analytics.posthog.httpx.Client") as sync_client,
    ):
        capture_backend_event_sync(
            "lease_extraction_job_started",
            organization_id="org-123",
            properties={"document_id": "doc-1"},
        )

    sync_client.assert_not_called()


def test_capture_backend_event_sync_sends_sanitized_payload():
    """Sync capture posts the same sanitized, org-scoped payload shape."""
    from app.services.analytics.posthog import capture_backend_event_sync

    settings = MagicMock()
    settings.posthog_project_api_key = "phc_test"
    settings.posthog_host = "https://us.i.posthog.com"

    response = MagicMock()
    response.raise_for_status.return_value = None
    client = MagicMock()
    client.post.return_value = response
    client_cm = MagicMock()
    client_cm.__enter__.return_value = client
    client_cm.__exit__.return_value = None

    with (
        patch("app.services.analytics.posthog.get_settings", return_value=settings),
        patch("app.services.analytics.posthog.httpx.Client", return_value=client_cm),
    ):
        capture_backend_event_sync(
            "lease_extraction_job_failed",
            organization_id="org-123",
            distinct_id="org:org-123",
            properties={
                "document_id": "doc-1",
                "error_type": "APITimeoutError",
                "retry_count": 3,
                "email_address": "owner@example.com",
                "phone_number": "+1 (555) 111-2222",
                "filename": "tenant-ledger.pdf",
                "document_url": "https://storage.example.com/x.pdf",
                "leaked_email_value": "tenant@example.com",
            },
        )

    client.post.assert_called_once()
    url = client.post.call_args.args[0]
    payload = client.post.call_args.kwargs["json"]
    properties = payload["properties"]
    assert url == "https://us.i.posthog.com/capture/"
    assert payload["api_key"] == "phc_test"
    assert payload["event"] == "lease_extraction_job_failed"
    assert payload["distinct_id"] == "org:org-123"
    assert properties["source_app"] == "backend"
    assert properties["organization_id"] == "org-123"
    assert properties["document_id"] == "doc-1"
    assert properties["error_type"] == "APITimeoutError"
    assert properties["retry_count"] == 3
    assert "email_address" not in properties
    assert "phone_number" not in properties
    assert "filename" not in properties
    assert "document_url" not in properties
    assert "leaked_email_value" not in properties


def test_capture_backend_event_sync_never_raises_on_transport_error():
    """A failing HTTP transport is logged and swallowed, never re-raised."""
    from app.services.analytics.posthog import capture_backend_event_sync

    settings = MagicMock()
    settings.posthog_project_api_key = "phc_test"
    settings.posthog_host = "https://us.i.posthog.com"

    with (
        patch("app.services.analytics.posthog.get_settings", return_value=settings),
        patch(
            "app.services.analytics.posthog.httpx.Client",
            side_effect=RuntimeError("boom"),
        ),
    ):
        capture_backend_event_sync(
            "lease_extraction_job_started",
            organization_id="org-123",
            properties={"document_id": "doc-1"},
        )


@pytest.mark.asyncio
async def test_capture_billing_event_is_noop_without_project_key():
    """Webhook tests and local dev should not send network calls without a key."""
    from app.services.analytics.posthog import capture_billing_event

    settings = MagicMock()
    settings.posthog_project_api_key = ""
    settings.posthog_host = "https://us.i.posthog.com"

    with (
        patch("app.services.analytics.posthog.get_settings", return_value=settings),
        patch("app.services.analytics.posthog.httpx.AsyncClient") as async_client,
    ):
        await capture_billing_event(
            "subscription_started",
            organization_id="org-123",
            properties={"plan": "growth_v2"},
        )

    async_client.assert_not_called()


@pytest.mark.asyncio
async def test_subscription_created_captures_subscription_started_event():
    """Stripe subscription.created emits server-truth subscription_started."""
    from app.api.routes.webhooks import handle_subscription_created

    db = MagicMock()
    sub_result = MagicMock(data=[{"id": "sub-row"}])
    user_result = MagicMock(data={"email": "admin@example.com", "full_name": "Admin"})
    org_result = MagicMock(data={"name": "Acme Properties", "settings": {}})

    def table_side_effect(name: str):
        table = MagicMock()
        if name == "subscriptions":
            table.upsert.return_value.execute.return_value = sub_result
        elif name == "users":
            table.select.return_value.eq.return_value.eq.return_value.limit.return_value.single.return_value.execute.return_value = (
                user_result
            )
        elif name == "organizations":
            table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
                org_result
            )
        return table

    db.table.side_effect = table_side_effect
    subscription = {
        "id": "sub_123",
        "customer": "cus_123",
        "metadata": {
            "organization_id": "org-123",
            "plan_id": "control",
            "pricing_model": "per_unit",
            "unit_count": "120",
            "building_count": "4",
        },
        "status": "active",
        "cancel_at_period_end": False,
        "current_period_start": 1700000000,
        "current_period_end": 1702678400,
        "items": {"data": [{"quantity": 1, "price": {"id": "price_123"}}]},
    }

    with (
        patch(
            "app.api.routes.webhooks.AdminNotificationService.notify_subscription_started",
            new_callable=AsyncMock,
        ),
        patch(
            "app.api.routes.webhooks.capture_billing_event",
            new_callable=AsyncMock,
        ) as capture,
    ):
        await handle_subscription_created(subscription, db)

    capture.assert_awaited_once()
    assert capture.call_args.args[0] == "subscription_started"
    assert capture.call_args.kwargs["organization_id"] == "org-123"
    properties = capture.call_args.kwargs["properties"]
    assert properties["stripe_subscription_id"] == "sub_123"
    assert properties["stripe_customer_id"] == "cus_123"
    assert properties["plan"] == "growth_v2"
    assert properties["tier"] == "control"
    assert properties["unit_count"] == 120
    assert properties["building_count"] == 4


@pytest.mark.asyncio
async def test_invoice_paid_captures_invoice_paid_event():
    """Stripe invoice.paid emits server-truth invoice_paid with cents only."""
    from app.api.routes.webhooks import handle_invoice_paid

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[{"id": "invoice-row"}])
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        None
    )
    invoice = {
        "id": "in_123",
        "customer": "cus_123",
        "subscription": "sub_123",
        "amount_paid": 349500,
        "currency": "usd",
        "invoice_pdf": "https://stripe.test/invoice.pdf",
    }

    with (
        patch(
            "app.api.routes.webhooks._get_org_by_customer",
            new_callable=AsyncMock,
            return_value="org-123",
        ),
        patch(
            "app.api.routes.webhooks.capture_billing_event",
            new_callable=AsyncMock,
        ) as capture,
    ):
        await handle_invoice_paid(invoice, db)

    capture.assert_awaited_once_with(
        "invoice_paid",
        organization_id="org-123",
        properties={
            "stripe_invoice_id": "in_123",
            "stripe_subscription_id": "sub_123",
            "stripe_customer_id": "cus_123",
            "amount_paid_cents": 349500,
            "currency": "usd",
        },
    )


@pytest.mark.asyncio
async def test_subscription_updated_captures_cancel_scheduled_event():
    """cancel_at_period_end false-to-true emits subscription_cancel_scheduled."""
    from app.api.routes.webhooks import handle_subscription_updated

    db = MagicMock()
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        None
    )
    subscription = {
        "id": "sub_123",
        "customer": "cus_123",
        "metadata": {"organization_id": "org-123", "plan_id": "defend"},
        "status": "active",
        "cancel_at_period_end": True,
        "__previous_attributes": {"cancel_at_period_end": False},
        "items": {"data": [{"quantity": 2, "price": {"id": "price_123"}}]},
    }

    with patch(
        "app.api.routes.webhooks.capture_billing_event",
        new_callable=AsyncMock,
    ) as capture:
        await handle_subscription_updated(subscription, db)

    capture.assert_awaited_once()
    assert capture.call_args.args[0] == "subscription_cancel_scheduled"
    assert capture.call_args.kwargs["organization_id"] == "org-123"
    assert capture.call_args.kwargs["properties"]["cancel_at_period_end"] is True


@pytest.mark.asyncio
async def test_subscription_updated_captures_reactivated_event():
    """cancel_at_period_end true-to-false emits subscription_reactivated."""
    from app.api.routes.webhooks import handle_subscription_updated

    db = MagicMock()
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        None
    )
    subscription = {
        "id": "sub_123",
        "customer": "cus_123",
        "metadata": {"organization_id": "org-123", "plan_id": "reconcile"},
        "status": "active",
        "cancel_at_period_end": False,
        "__previous_attributes": {"cancel_at_period_end": True},
        "items": {"data": [{"quantity": 1, "price": {"id": "price_123"}}]},
    }

    with patch(
        "app.api.routes.webhooks.capture_billing_event",
        new_callable=AsyncMock,
    ) as capture:
        await handle_subscription_updated(subscription, db)

    capture.assert_awaited_once()
    assert capture.call_args.args[0] == "subscription_reactivated"
    assert capture.call_args.kwargs["organization_id"] == "org-123"
    assert capture.call_args.kwargs["properties"]["cancel_at_period_end"] is False


@pytest.mark.asyncio
async def test_subscription_deleted_captures_cancelled_event():
    """Stripe subscription.deleted emits subscription_cancelled."""
    from app.api.routes.webhooks import handle_subscription_deleted

    db = MagicMock()
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        None
    )
    subscription = {
        "id": "sub_123",
        "customer": "cus_123",
        "metadata": {"organization_id": "org-123"},
        "cancel_at_period_end": False,
    }

    with patch(
        "app.api.routes.webhooks.capture_billing_event",
        new_callable=AsyncMock,
    ) as capture:
        await handle_subscription_deleted(subscription, db)

    capture.assert_awaited_once_with(
        "subscription_cancelled",
        organization_id="org-123",
        properties={
            "stripe_subscription_id": "sub_123",
            "stripe_customer_id": "cus_123",
            "subscription_status": "canceled",
            "cancel_at_period_end": False,
        },
    )


@pytest.mark.asyncio
async def test_invoice_payment_failed_captures_failed_payment_event():
    """Stripe invoice.payment_failed emits invoice_payment_failed."""
    from app.api.routes.webhooks import handle_invoice_payment_failed

    db = MagicMock()
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        None
    )
    invoice = {
        "id": "in_123",
        "customer": "cus_123",
        "subscription": "sub_123",
        "amount_due": 349500,
        "currency": "usd",
    }

    with (
        patch(
            "app.api.routes.webhooks._get_org_by_customer",
            new_callable=AsyncMock,
            return_value="org-123",
        ),
        patch(
            "app.api.routes.webhooks.capture_billing_event",
            new_callable=AsyncMock,
        ) as capture,
    ):
        await handle_invoice_payment_failed(invoice, db)

    capture.assert_awaited_once_with(
        "invoice_payment_failed",
        organization_id="org-123",
        properties={
            "stripe_invoice_id": "in_123",
            "stripe_subscription_id": "sub_123",
            "stripe_customer_id": "cus_123",
            "amount_due_cents": 349500,
            "currency": "usd",
        },
    )
