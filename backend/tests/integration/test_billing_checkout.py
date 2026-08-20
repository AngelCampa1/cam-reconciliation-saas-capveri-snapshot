"""Integration tests for billing checkout flow.

Tests the complete checkout workflow from plan selection through
Stripe session creation and success verification.
"""

import pytest
from fastapi import status

from tests.conftest import ORG_A_ID, create_test_app


@pytest.mark.integration
class TestCheckoutFlow:
    """Integration tests for the checkout flow."""

    @pytest.fixture
    def client(self, org_a_owner_client, mock_stripe_service):
        """Test client with mocked Stripe service."""
        from datetime import UTC, datetime

        from app.api.deps import get_stripe_service

        # Seed organization data in mock
        org_data = {
            "id": str(ORG_A_ID),
            "name": "Test Organization A",
            "billing_email": "billing@test.com",
            "created_at": datetime.now(UTC).isoformat(),
        }

        if hasattr(org_a_owner_client.mock_supabase, "_test_data"):
            org_a_owner_client.mock_supabase._test_data["organizations"] = [org_data]
            org_a_owner_client.mock_supabase._test_data["subscriptions"] = []

        # Override the Stripe service dependency
        org_a_owner_client.app.dependency_overrides[get_stripe_service] = (
            lambda: mock_stripe_service
        )

        yield org_a_owner_client

        # Clean up
        if get_stripe_service in org_a_owner_client.app.dependency_overrides:
            del org_a_owner_client.app.dependency_overrides[get_stripe_service]

    def test_checkout_creates_session(
        self,
        client,
        mock_stripe_service,
    ):
        """Verify checkout session created successfully for valid plan."""
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "reconcile",
                "billing_period": "annual",
                "unit_count": 25,
                "building_count": 5,
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "checkout_url" in data
        assert "session_id" in data
        assert data["session_id"] == "cs_test123"
        checkout_kwargs = mock_stripe_service.mock_session.create.call_args.kwargs
        assert checkout_kwargs["customer"] == "cus_test123"
        assert checkout_kwargs["line_items"] == [{"price": "price_reconcile_annual"}]
        assert checkout_kwargs["subscription_data"]["trial_period_days"] == 30
        assert checkout_kwargs["metadata"]["plan_id"] == "reconcile"
        assert checkout_kwargs["metadata"]["unit_count"] == "25"
        assert checkout_kwargs["metadata"]["building_count"] == "5"

    def test_checkout_rejects_free_plan_id(self, client):
        """Verify the legacy free plan ID cannot be checked out."""
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "free",
                "billing_period": "annual",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid plan" in response.json()["detail"].lower()

    def test_checkout_rejects_invalid_plan(self, client):
        """Verify invalid plan rejected with 400 error."""
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "nonexistent",
                "billing_period": "annual",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid" in response.json()["detail"].lower()

    def test_checkout_rejects_non_annual_billing_period_at_contract(self, client):
        """Verify checkout request validation only accepts annual billing."""
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "reconcile",
                "billing_period": "monthly",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "annual" in response.text.lower()

    def test_checkout_rejects_missing_fields(self, client):
        """Verify checkout requires all required fields."""
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "reconcile",
                # Missing success_url and cancel_url
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_checkout_success_verifies_session(
        self,
        client,
        mock_stripe_service,
    ):
        """Verify success endpoint validates session and returns status."""
        # Mock the Stripe module directly (endpoint imports stripe directly)
        from unittest.mock import MagicMock, patch

        mock_session = MagicMock()
        mock_session.status = "complete"
        mock_session.payment_status = "paid"
        mock_session.subscription = "sub_test123"
        mock_session.customer = "cus_test123"
        mock_session.metadata = {"organization_id": str(ORG_A_ID)}

        with patch("stripe.checkout.Session.retrieve", return_value=mock_session):
            response = client.get(
                "/api/v1/billing/checkout/success?session_id=cs_test123"
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "success"

    def test_checkout_success_rejects_invalid_session(
        self,
        client,
        mock_stripe_service,
    ):
        """Verify success endpoint rejects invalid session ID."""
        from unittest.mock import patch

        import stripe

        # Patch global stripe module to raise InvalidRequestError for invalid session
        with patch("stripe.checkout.Session.retrieve") as mock_retrieve:
            mock_retrieve.side_effect = stripe.error.InvalidRequestError(
                message="No such checkout.session: 'invalid'",
                param="session_id",
            )

            response = client.get("/api/v1/billing/checkout/success?session_id=invalid")

        # Should fail to verify session
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND,
        ]

    def test_checkout_annual_billing_period(
        self,
        client,
        mock_stripe_service,
    ):
        """Verify annual billing period creates correct session."""
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "reconcile",
                "billing_period": "annual",
                "unit_count": 25,
                "building_count": 5,
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "checkout_url" in data
        checkout_kwargs = mock_stripe_service.mock_session.create.call_args.kwargs
        assert checkout_kwargs["line_items"] == [{"price": "price_reconcile_annual"}]
        assert checkout_kwargs["metadata"]["plan_id"] == "reconcile"

    def test_checkout_requires_authentication(self):
        """Verify checkout endpoint requires authentication."""
        app = create_test_app()
        from fastapi.testclient import TestClient

        unauthenticated_client = TestClient(app)

        response = unauthenticated_client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_id": "reconcile",
                "billing_period": "annual",
                "unit_count": 25,
                "building_count": 5,
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
