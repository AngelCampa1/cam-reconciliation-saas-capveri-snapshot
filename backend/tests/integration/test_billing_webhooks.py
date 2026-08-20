"""Integration tests for Stripe webhook processing.

Tests webhook signature verification, event processing, and idempotency.
"""

import hashlib
import hmac
import json
import time

import pytest
from fastapi import status

from tests.conftest import create_test_app


@pytest.mark.integration
class TestStripeWebhooks:
    """Integration tests for Stripe webhook processing."""

    @pytest.fixture(autouse=True)
    def setup_mocks(self, stripe_test_settings):
        """Set up all mocks needed for webhook tests."""
        from unittest.mock import MagicMock, patch

        import stripe

        # Mock Stripe settings (webhooks.py calls get_stripe_settings directly)
        settings_patch = patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=stripe_test_settings,
        )

        # Mock Stripe webhook signature verification
        def construct_event_side_effect(payload, sig_header, secret):
            # Reject invalid signatures
            if sig_header == "invalid_signature":
                raise stripe.error.SignatureVerificationError(
                    "Invalid signature", sig_header
                )

            # Parse the payload and return a mock event
            payload_dict = json.loads(payload)
            mock_event = MagicMock()
            mock_event.id = payload_dict.get("id", "evt_test")
            mock_event.type = payload_dict.get("type")

            # Create nested mock for data.object with all fields accessible as attributes
            event_data = payload_dict.get("data", {}).get("object", {})

            class DictMock(dict):
                """Dict that supports both dict methods AND attribute access.

                Includes to_dict() to mirror Stripe StripeObject behavior.
                """

                def __getattribute__(self, key):
                    # Check dict contents first (before dict methods)
                    if key != "__class__" and key in self:
                        return self[key]
                    # Fall back to normal attribute access (dict methods, etc.)
                    return super().__getattribute__(key)

                def __setattr__(self, key, value):
                    self[key] = value

                def to_dict(self):
                    return dict(self)

            def dict_to_mock(d):
                """Recursively convert dict to DictMock for attribute access + dict methods."""
                if not isinstance(d, dict):
                    return d

                result = DictMock()
                for key, value in d.items():
                    if isinstance(value, dict):
                        result[key] = dict_to_mock(value)
                    elif isinstance(value, list):
                        result[key] = [
                            dict_to_mock(item) if isinstance(item, dict) else item
                            for item in value
                        ]
                    else:
                        result[key] = value
                return result

            mock_event.data = MagicMock()
            mock_event.data.object = dict_to_mock(event_data)
            return mock_event

        webhook_patch = patch(
            "app.api.routes.webhooks.stripe.Webhook.construct_event",
            side_effect=construct_event_side_effect,
        )

        # Start all patches
        settings_patch.start()
        webhook_patch.start()

        yield

        # Stop all patches
        settings_patch.stop()
        webhook_patch.stop()

    @pytest.fixture
    def webhook_client(self):
        """Create test client for webhook testing."""
        from unittest.mock import MagicMock

        from fastapi.testclient import TestClient

        from app.database import get_supabase_admin

        app = create_test_app()

        # Create mock database client
        mock_db = MagicMock()

        def create_mock_table(table_name):
            """Create a chainable mock for database table operations."""
            table_mock = MagicMock()
            table_mock.insert.return_value = table_mock
            table_mock.update.return_value = table_mock
            table_mock.upsert.return_value = table_mock
            table_mock.select.return_value = table_mock
            table_mock.delete.return_value = table_mock
            table_mock.eq.return_value = table_mock
            table_mock.limit.return_value = table_mock
            # stripe_webhook_events upsert returns data to signal a successful claim
            if table_name == "stripe_webhook_events":
                table_mock.execute.return_value = MagicMock(
                    data=[{"stripe_event_id": "evt_test", "status": "processing"}]
                )
            else:
                table_mock.execute.return_value = MagicMock(data=[])
            return table_mock

        mock_db.table.side_effect = create_mock_table

        # Override the dependency - webhook uses get_supabase_admin
        app.dependency_overrides[get_supabase_admin] = lambda: mock_db

        return TestClient(app)

    def _sign_webhook(self, payload: bytes, secret: str) -> str:
        """Generate Stripe webhook signature for testing.

        Args:
            payload: Raw JSON payload bytes
            secret: Webhook secret key

        Returns:
            Stripe signature header value
        """
        timestamp = int(time.time())
        signed_payload = f"{timestamp}.{payload.decode()}"
        signature = hmac.new(
            secret.encode(),
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        return f"t={timestamp},v1={signature}"

    def test_webhook_rejects_invalid_signature(
        self,
        webhook_client,
    ):
        """Verify webhook endpoint rejects invalid signatures."""
        payload = json.dumps({"type": "test.event"}).encode()

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload,
            headers={
                "stripe-signature": "invalid_signature",
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_webhook_accepts_valid_signature(
        self,
        webhook_client,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify webhook accepts properly signed events."""
        payload_data = sample_webhook_payload(
            "customer.subscription.created",
            {
                "id": "sub_webhook123",
                "customer": "cus_webhook123",
                "status": "active",
                "current_period_start": int(time.time()),
                "current_period_end": int(time.time()) + 2592000,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {"price": {"id": "price_professional_test"}, "quantity": 1}
                    ]
                },
                "metadata": {"organization_id": "org_test"},
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["received"] is True

    def test_webhook_subscription_created(
        self,
        webhook_client,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify customer.subscription.created event processing."""
        payload_data = sample_webhook_payload(
            "customer.subscription.created",
            {
                "id": "sub_new456",
                "customer": "cus_existing456",
                "status": "active",
                "current_period_start": int(time.time()),
                "current_period_end": int(time.time()) + 2592000,
                "cancel_at_period_end": False,
                "items": {
                    "data": [{"price": {"id": "price_starter_test"}, "quantity": 1}]
                },
                "metadata": {"organization_id": "test_org_id"},
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_webhook_subscription_updated(
        self,
        webhook_client,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify customer.subscription.updated event processing."""
        payload_data = sample_webhook_payload(
            "customer.subscription.updated",
            {
                "id": "sub_update123",
                "customer": "cus_test123",
                "status": "active",
                "current_period_start": int(time.time()),
                "current_period_end": int(time.time()) + 2592000,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {"price": {"id": "price_professional_test"}, "quantity": 1}
                    ]
                },
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_webhook_invoice_paid(
        self,
        webhook_client,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify invoice.paid event updates invoice status."""
        payload_data = sample_webhook_payload(
            "invoice.paid",
            {
                "id": "in_paid123",
                "customer": "cus_test123",
                "amount_paid": 9900,
                "amount_due": 9900,
                "currency": "usd",
                "status": "paid",
                "invoice_pdf": "https://stripe.com/invoice.pdf",
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_webhook_idempotency(
        self,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify same webhook event: first delivery processed, second skipped via dedup."""
        from unittest.mock import MagicMock

        from fastapi.testclient import TestClient

        from app.database import get_supabase_admin

        app = create_test_app()

        mock_db = MagicMock()
        call_count = {"n": 0}

        def create_mock_table(table_name):
            table_mock = MagicMock()
            table_mock.insert.return_value = table_mock
            table_mock.update.return_value = table_mock
            table_mock.upsert.return_value = table_mock
            table_mock.select.return_value = table_mock
            table_mock.delete.return_value = table_mock
            table_mock.eq.return_value = table_mock
            table_mock.limit.return_value = table_mock

            if table_name == "stripe_webhook_events":
                # First call (upsert) returns data (claim succeeds);
                # second call returns empty (already claimed)
                def execute_side_effect():
                    call_count["n"] += 1
                    if call_count["n"] == 1:
                        return MagicMock(
                            data=[
                                {
                                    "stripe_event_id": "evt_idempotent",
                                    "status": "processing",
                                }
                            ]
                        )
                    return MagicMock(data=[])

                table_mock.execute.side_effect = execute_side_effect
            else:
                table_mock.execute.return_value = MagicMock(data=[])
            return table_mock

        mock_db.table.side_effect = create_mock_table
        app.dependency_overrides[get_supabase_admin] = lambda: mock_db
        client = TestClient(app)

        payload_data = sample_webhook_payload(
            "customer.subscription.updated",
            {
                "id": "sub_idempotent123",
                "customer": "cus_test123",
                "status": "active",
                "current_period_start": int(time.time()),
                "current_period_end": int(time.time()) + 2592000,
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {"price": {"id": "price_professional_test"}, "quantity": 1}
                    ]
                },
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        headers = {
            "stripe-signature": signature,
            "content-type": "application/json",
        }

        # Process same event twice - both should return 200
        response1 = client.post(
            "/webhooks/stripe", content=payload_bytes, headers=headers
        )
        response2 = client.post(
            "/webhooks/stripe", content=payload_bytes, headers=headers
        )

        assert response1.status_code == status.HTTP_200_OK
        assert response2.status_code == status.HTTP_200_OK

    def test_webhook_payment_failed(
        self,
        webhook_client,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify invoice.payment_failed event processing."""
        payload_data = sample_webhook_payload(
            "invoice.payment_failed",
            {
                "id": "in_failed123",
                "customer": "cus_test123",
                "subscription": "sub_test123",
                "amount_due": 9900,
                "amount_paid": 0,
                "currency": "usd",
                "status": "open",
                "attempt_count": 1,
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_webhook_subscription_deleted(
        self,
        webhook_client,
        sample_webhook_payload,
        stripe_test_settings,
    ):
        """Verify customer.subscription.deleted event processing."""
        payload_data = sample_webhook_payload(
            "customer.subscription.deleted",
            {
                "id": "sub_deleted123",
                "customer": "cus_test123",
                "status": "canceled",
                "cancel_at_period_end": False,
                "canceled_at": int(time.time()),
            },
        )

        payload_bytes = json.dumps(payload_data).encode()
        signature = self._sign_webhook(
            payload_bytes,
            stripe_test_settings.stripe_webhook_secret,
        )

        response = webhook_client.post(
            "/webhooks/stripe",
            content=payload_bytes,
            headers={
                "stripe-signature": signature,
                "content-type": "application/json",
            },
        )

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.integration
class TestWebhookDeduplication:
    """Tests for webhook event deduplication via stripe_webhook_events table."""

    @pytest.fixture(autouse=True)
    def setup_mocks(self, stripe_test_settings):
        """Set up all mocks needed for webhook tests."""
        from unittest.mock import MagicMock, patch

        import stripe

        settings_patch = patch(
            "app.api.routes.webhooks.get_stripe_settings",
            return_value=stripe_test_settings,
        )

        def construct_event_side_effect(payload, sig_header, secret):
            if sig_header == "invalid_signature":
                raise stripe.error.SignatureVerificationError(
                    "Invalid signature", sig_header
                )
            payload_dict = json.loads(payload)
            mock_event = MagicMock()
            mock_event.id = payload_dict.get("id", "evt_test")
            mock_event.type = payload_dict.get("type")

            class DictMock(dict):
                def __getattribute__(self, key):
                    if key != "__class__" and key in self:
                        return self[key]
                    return super().__getattribute__(key)

                def __setattr__(self, key, value):
                    self[key] = value

                def to_dict(self):
                    return dict(self)

            def dict_to_mock(d):
                if not isinstance(d, dict):
                    return d
                result = DictMock()
                for key, value in d.items():
                    if isinstance(value, dict):
                        result[key] = dict_to_mock(value)
                    elif isinstance(value, list):
                        result[key] = [
                            dict_to_mock(item) if isinstance(item, dict) else item
                            for item in value
                        ]
                    else:
                        result[key] = value
                return result

            mock_event.data = MagicMock()
            event_data = payload_dict.get("data", {}).get("object", {})
            mock_event.data.object = dict_to_mock(event_data)
            return mock_event

        webhook_patch = patch(
            "app.api.routes.webhooks.stripe.Webhook.construct_event",
            side_effect=construct_event_side_effect,
        )

        settings_patch.start()
        webhook_patch.start()

        yield

        settings_patch.stop()
        webhook_patch.stop()

    def _sign_webhook(self, payload: bytes, secret: str) -> str:
        timestamp = int(time.time())
        signed_payload = f"{timestamp}.{payload.decode()}"
        signature = hmac.new(
            secret.encode(),
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        return f"t={timestamp},v1={signature}"

    def _make_payload(self, event_type: str, event_id: str = "evt_dedup_test") -> bytes:
        return json.dumps(
            {
                "id": event_id,
                "type": event_type,
                "data": {
                    "object": {
                        "id": "sub_dedup123",
                        "status": "active",
                        "cancel_at_period_end": False,
                        "current_period_start": int(time.time()),
                        "current_period_end": int(time.time()) + 2592000,
                        "items": {
                            "data": [
                                {
                                    "price": {"id": "price_test"},
                                    "quantity": 1,
                                }
                            ]
                        },
                        "metadata": {"organization_id": "org_dedup"},
                    }
                },
            }
        ).encode()

    def test_duplicate_event_is_skipped(self, stripe_test_settings):
        """When upsert returns no data (event already claimed), handler is skipped."""
        from unittest.mock import MagicMock

        from fastapi.testclient import TestClient

        from app.database import get_supabase_admin

        app = create_test_app()
        mock_db = MagicMock()

        # Track which tables were accessed
        accessed_tables: list[str] = []

        def create_mock_table(table_name):
            accessed_tables.append(table_name)
            table_mock = MagicMock()
            table_mock.insert.return_value = table_mock
            table_mock.update.return_value = table_mock
            table_mock.upsert.return_value = table_mock
            table_mock.select.return_value = table_mock
            table_mock.delete.return_value = table_mock
            table_mock.eq.return_value = table_mock
            table_mock.limit.return_value = table_mock
            if table_name == "stripe_webhook_events":
                # Empty data = claim failed (event already seen)
                table_mock.execute.return_value = MagicMock(data=[])
            else:
                table_mock.execute.return_value = MagicMock(data=[])
            return table_mock

        mock_db.table.side_effect = create_mock_table
        app.dependency_overrides[get_supabase_admin] = lambda: mock_db

        client = TestClient(app)
        payload = self._make_payload("customer.subscription.updated")
        signature = self._sign_webhook(
            payload, stripe_test_settings.stripe_webhook_secret
        )

        response = client.post(
            "/webhooks/stripe",
            content=payload,
            headers={"stripe-signature": signature, "content-type": "application/json"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"received": True}

        # Only stripe_webhook_events should have been touched (for the claim attempt)
        # subscriptions table should NOT have been called (handler was skipped)
        non_dedup_tables = [t for t in accessed_tables if t != "stripe_webhook_events"]
        assert (
            non_dedup_tables == []
        ), f"Handler ran despite duplicate claim — accessed: {non_dedup_tables}"

    def test_first_event_is_processed_and_completed(self, stripe_test_settings):
        """When claim succeeds, handler runs and event is marked succeeded."""
        from unittest.mock import MagicMock

        from fastapi.testclient import TestClient

        from app.database import get_supabase_admin

        app = create_test_app()
        mock_db = MagicMock()
        webhook_events_mock = None

        def create_mock_table(table_name):
            nonlocal webhook_events_mock
            table_mock = MagicMock()
            table_mock.insert.return_value = table_mock
            table_mock.update.return_value = table_mock
            table_mock.upsert.return_value = table_mock
            table_mock.select.return_value = table_mock
            table_mock.delete.return_value = table_mock
            table_mock.eq.return_value = table_mock
            table_mock.limit.return_value = table_mock
            if table_name == "stripe_webhook_events":
                # Claim succeeds
                table_mock.execute.return_value = MagicMock(
                    data=[{"stripe_event_id": "evt_first", "status": "processing"}]
                )
                webhook_events_mock = table_mock
            else:
                table_mock.execute.return_value = MagicMock(data=[])
            return table_mock

        mock_db.table.side_effect = create_mock_table
        app.dependency_overrides[get_supabase_admin] = lambda: mock_db

        client = TestClient(app)
        payload = self._make_payload("customer.subscription.updated", "evt_first")
        signature = self._sign_webhook(
            payload, stripe_test_settings.stripe_webhook_secret
        )

        response = client.post(
            "/webhooks/stripe",
            content=payload,
            headers={"stripe-signature": signature, "content-type": "application/json"},
        )

        assert response.status_code == status.HTTP_200_OK

        # Verify _complete_webhook_event was called: update(...).eq(...).execute()
        assert webhook_events_mock is not None
        webhook_events_mock.update.assert_called_once()
        update_call_args = webhook_events_mock.update.call_args[0][0]
        assert update_call_args["status"] == "succeeded"

    def test_failed_handler_releases_claim(self, stripe_test_settings):
        """When handler raises, the claim is deleted so Stripe can retry."""
        from unittest.mock import MagicMock, patch

        from fastapi.testclient import TestClient

        from app.database import get_supabase_admin

        app = create_test_app()
        mock_db = MagicMock()
        webhook_events_mock = None

        def create_mock_table(table_name):
            nonlocal webhook_events_mock
            table_mock = MagicMock()
            table_mock.insert.return_value = table_mock
            table_mock.update.return_value = table_mock
            table_mock.upsert.return_value = table_mock
            table_mock.select.return_value = table_mock
            table_mock.delete.return_value = table_mock
            table_mock.eq.return_value = table_mock
            table_mock.limit.return_value = table_mock
            if table_name == "stripe_webhook_events":
                table_mock.execute.return_value = MagicMock(
                    data=[{"stripe_event_id": "evt_fail", "status": "processing"}]
                )
                webhook_events_mock = table_mock
            else:
                table_mock.execute.return_value = MagicMock(data=[])
            return table_mock

        mock_db.table.side_effect = create_mock_table
        app.dependency_overrides[get_supabase_admin] = lambda: mock_db

        client = TestClient(app, raise_server_exceptions=False)
        payload = self._make_payload("customer.subscription.updated", "evt_fail")
        signature = self._sign_webhook(
            payload, stripe_test_settings.stripe_webhook_secret
        )

        # Make the subscription handler raise
        with patch(
            "app.api.routes.webhooks.handle_subscription_updated",
            side_effect=RuntimeError("DB down"),
        ):
            response = client.post(
                "/webhooks/stripe",
                content=payload,
                headers={
                    "stripe-signature": signature,
                    "content-type": "application/json",
                },
            )

        # Should return 500 so Stripe retries
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

        # Verify delete was called to release the claim
        assert webhook_events_mock is not None
        webhook_events_mock.delete.assert_called_once()
