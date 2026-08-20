"""Integration tests for subscription lifecycle.

Tests the complete subscription workflow including upgrade, downgrade,
cancel, and resume operations.
"""

import pytest
from fastapi import status

from tests.conftest import MockQueryBuilder, create_test_app


@pytest.mark.integration
class TestSubscriptionLifecycle:
    """Integration tests for subscription lifecycle operations."""

    @pytest.fixture
    def client(self, org_a_owner_client, mock_stripe_service):
        """Test client with mocked Stripe and seeded subscription."""
        return org_a_owner_client

    @staticmethod
    def _mock_subscription_item(mock_stripe_service):
        """Configure Stripe retrieval with one subscription item for plan changes."""
        from unittest.mock import MagicMock

        mock_stripe_sub = MagicMock()
        mock_stripe_sub.__getitem__.side_effect = lambda key: {
            "items": {"data": [{"id": "si_test123"}]}
        }.get(key)
        mock_stripe_service.mock_subscription.retrieve.return_value = mock_stripe_sub

    def test_get_subscription_returns_current(
        self,
        client,
        seed_subscription,
    ):
        """Verify GET /subscription returns current active subscription."""
        response = client.get("/api/v1/billing/subscription")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["plan"] == "growth"
        assert data["status"] == "active"
        assert data["stripe_subscription_id"] == "sub_test123"

    def test_upgrade_subscription_rejects_legacy_plan_changes(
        self,
        client,
        seed_subscription,
        mock_stripe_service,
    ):
        """Verify old package upgrade endpoint no longer touches Stripe."""

        response = client.post(
            "/api/v1/billing/subscription/upgrade",
            json={"new_plan": "professional"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Reconcile is the only active subscription" in response.json()["detail"]
        mock_stripe_service.mock_subscription.modify.assert_not_called()

    def test_downgrade_subscription_rejects_legacy_plan_changes(
        self,
        client,
        seed_subscription,
        mock_stripe_service,
    ):
        """Verify old package downgrade endpoint no longer touches Stripe."""

        response = client.post(
            "/api/v1/billing/subscription/downgrade",
            json={"new_plan": "essentials"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Reconcile is the only active subscription" in response.json()["detail"]
        mock_stripe_service.mock_subscription.modify.assert_not_called()

    def test_cancel_subscription_at_period_end(
        self,
        client,
        seed_subscription,
        mock_stripe_service,
        mock_supabase_client,
    ):
        """Verify cancel sets cancel_at_period_end flag."""
        from unittest.mock import MagicMock

        # Mock Stripe cancellation
        mock_canceled_sub = MagicMock()
        mock_canceled_sub.id = "sub_test123"
        mock_canceled_sub.cancel_at_period_end = True
        mock_stripe_service.mock_subscription.modify.return_value = mock_canceled_sub

        # Mock database to return updated subscription after cancel
        updated_sub = dict(seed_subscription)
        updated_sub["cancel_at_period_end"] = True

        def create_mock_table_after_update(table_name):
            builder = MockQueryBuilder(data=[updated_sub])
            return builder

        mock_supabase_client.table.side_effect = create_mock_table_after_update

        response = client.post(
            "/api/v1/billing/subscription/cancel",
            json={"immediate": False},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["cancel_at_period_end"] is True
        mock_stripe_service.mock_subscription.modify.assert_called_once_with(
            "sub_test123",
            cancel_at_period_end=True,
            metadata={"app": "capveri"},
        )

    def test_cancel_subscription_immediately(
        self,
        client,
        seed_subscription,
        mock_stripe_service,
        mock_supabase_client,
    ):
        """Verify immediate cancel terminates subscription."""
        from unittest.mock import MagicMock

        # Mock Stripe immediate cancellation
        mock_canceled_sub = MagicMock()
        mock_canceled_sub.id = "sub_test123"
        mock_canceled_sub.status = "canceled"
        mock_stripe_service.mock_subscription.delete.return_value = mock_canceled_sub

        # Mock database to return canceled subscription
        updated_sub = dict(seed_subscription)
        updated_sub["status"] = "canceled"
        updated_sub["cancel_at_period_end"] = False

        def create_mock_table_after_update(table_name):
            return MockQueryBuilder(data=[updated_sub])

        mock_supabase_client.table.side_effect = create_mock_table_after_update

        response = client.post(
            "/api/v1/billing/subscription/cancel",
            json={"immediate": True},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "canceled"
        mock_stripe_service.mock_subscription.delete.assert_called_once_with(
            "sub_test123"
        )

    def test_resume_canceled_subscription(
        self,
        client,
        seed_subscription_canceling,
        mock_stripe_service,
        mock_supabase_client,
    ):
        """Verify resume removes scheduled cancellation."""
        from unittest.mock import MagicMock

        # Mock Stripe resume
        mock_resumed_sub = MagicMock()
        mock_resumed_sub.id = "sub_cancel123"
        mock_resumed_sub.cancel_at_period_end = False
        mock_stripe_service.mock_subscription.modify.return_value = mock_resumed_sub

        # Mock database to return:
        # 1st call: subscription with cancel_at_period_end=True (for validation)
        # 2nd call: subscription with cancel_at_period_end=False (after resume)
        call_count = 0

        def create_mock_table_progressive(table_name):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First call - return subscription with cancel_at_period_end=True
                return MockQueryBuilder(data=[seed_subscription_canceling])
            else:
                # Subsequent calls - return resumed subscription
                updated_sub = dict(seed_subscription_canceling)
                updated_sub["cancel_at_period_end"] = False
                return MockQueryBuilder(data=[updated_sub])

        mock_supabase_client.table.side_effect = create_mock_table_progressive

        response = client.post("/api/v1/billing/subscription/resume")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["cancel_at_period_end"] is False
        mock_stripe_service.mock_subscription.modify.assert_called_once_with(
            "sub_cancel123",
            cancel_at_period_end=False,
            metadata={"app": "capveri"},
        )

    def test_subscription_upgrade_validates_plan(
        self,
        client,
        seed_subscription,
    ):
        """Verify upgrade rejects invalid plan IDs."""
        response = client.post(
            "/api/v1/billing/subscription/upgrade",
            json={"new_plan": "nonexistent"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_subscription_downgrade_validates_plan(
        self,
        client,
        seed_subscription,
    ):
        """Verify downgrade rejects invalid plan IDs."""
        response = client.post(
            "/api/v1/billing/subscription/downgrade",
            json={"new_plan": "invalid_plan"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_subscription_requires_authentication(self):
        """Verify subscription endpoints require authentication."""
        app = create_test_app()
        from fastapi.testclient import TestClient

        unauthenticated_client = TestClient(app)

        response = unauthenticated_client.get("/api/v1/billing/subscription")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
