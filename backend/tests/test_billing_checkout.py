"""Tests for billing checkout endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import stripe
from fastapi import HTTPException, status
from pydantic import ValidationError

from app.api.v1.billing import (
    CheckoutRequest,
    TrialStartRequest,
    checkout_success,
    create_checkout_session,
    start_trial,
)
from app.auth.dependencies import OrganizationContext
from app.models.user import User


@pytest.fixture
def mock_org_context():
    """Mock OrganizationContext."""
    org_id = uuid4()
    user = User(
        id=uuid4(),
        email="user@example.com",
        organization_id=org_id,
        role="admin",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    ctx = MagicMock(spec=OrganizationContext)
    ctx.organization_id = org_id
    ctx.user = user
    ctx.client = MagicMock()
    ctx.table = MagicMock(return_value=ctx.client.table.return_value)

    return ctx


@pytest.fixture
def mock_stripe_service():
    """Mock Stripe service."""
    service = MagicMock()
    service.create_customer = AsyncMock()
    service.create_checkout_session = AsyncMock()
    return service


@pytest.fixture
def mock_customer():
    """Mock Stripe customer."""
    customer = MagicMock()
    customer.id = "cus_test123"
    customer.email = "test@example.com"
    customer.name = "Test Org"
    return customer


@pytest.fixture
def mock_checkout_session():
    """Mock Stripe checkout session."""
    session = MagicMock()
    session.id = "cs_test123"
    session.url = "https://checkout.stripe.com/pay/cs_test123"
    session.subscription = "sub_test123"
    session.customer = "cus_test123"
    session.metadata = {"organization_id": "org123", "plan_id": "reconcile"}
    return session


class TestCreateCheckoutSession:
    """Test POST /billing/checkout endpoint."""

    @pytest.mark.asyncio
    async def test_checkout_creates_reconcile_base_session(
        self,
        mock_org_context,
        mock_stripe_service,
        mock_customer,
        mock_checkout_session,
    ):
        """Base Reconcile checkout bills the fixed annual Stripe price."""
        mock_org_context.table().select().eq().single().execute.return_value = (
            MagicMock(
                data={"billing_email": "billing@test.com", "name": "Test Organization"}
            )
        )
        mock_stripe_service.create_customer.return_value = mock_customer
        mock_stripe_service.create_checkout_session.return_value = mock_checkout_session

        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        response = await create_checkout_session(
            request, mock_org_context, mock_stripe_service
        )

        assert response.checkout_url == "https://checkout.stripe.com/pay/cs_test123"
        assert response.session_id == "cs_test123"

        call_kwargs = mock_stripe_service.create_checkout_session.call_args.kwargs
        assert call_kwargs["line_items"] == [{"price": "price_reconcile_annual"}]
        assert call_kwargs["trial_days"] == 30
        assert call_kwargs["metadata"]["plan_id"] == "reconcile"
        assert call_kwargs["metadata"]["pricing_model"] == "per_unit"
        assert call_kwargs["metadata"]["unit_count"] == "25"
        assert call_kwargs["metadata"]["included_units"] == "25"
        assert call_kwargs["metadata"]["unit_overage_count"] == "0"
        assert call_kwargs["metadata"]["annual_total_cents"] == "499000"
        assert call_kwargs["metadata"]["building_count"] == "5"

    @pytest.mark.asyncio
    async def test_checkout_creates_reconcile_dynamic_unit_session(
        self,
        mock_org_context,
        mock_stripe_service,
        mock_customer,
        mock_checkout_session,
    ):
        """Higher unit counts bill one computed annual Reconcile line item."""
        mock_org_context.table().select().eq().single().execute.return_value = (
            MagicMock(
                data={"billing_email": "billing@test.com", "name": "Test Organization"}
            )
        )
        mock_stripe_service.create_customer.return_value = mock_customer
        mock_stripe_service.create_checkout_session.return_value = mock_checkout_session

        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=151,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        await create_checkout_session(request, mock_org_context, mock_stripe_service)

        call_kwargs = mock_stripe_service.create_checkout_session.call_args.kwargs
        assert call_kwargs["line_items"] == [
            {
                "price_data": {
                    "currency": "usd",
                    "unit_amount": 2753400,
                    "recurring": {"interval": "year"},
                    "product_data": {
                        "name": "CapVeri Reconcile",
                        "description": "Annual Reconcile subscription for 151 rentable units",
                    },
                },
                "quantity": 1,
            }
        ]
        assert call_kwargs["metadata"]["unit_count"] == "151"
        assert call_kwargs["metadata"]["included_units"] == "25"
        assert call_kwargs["metadata"]["unit_overage_count"] == "126"
        assert call_kwargs["metadata"]["annual_total_cents"] == "2753400"

    @pytest.mark.asyncio
    async def test_checkout_rejects_monthly_billing_period(
        self, mock_org_context, mock_stripe_service
    ):
        """Checkout accepts annual billing only."""
        with pytest.raises(ValidationError) as exc_info:
            CheckoutRequest(
                plan_id="reconcile",
                billing_period="monthly",
                unit_count=25,
                building_count=5,
                success_url="http://localhost:5173/checkout/success",
                cancel_url="http://localhost:5173/pricing",
            )

        assert "annual" in str(exc_info.value).lower()
        mock_stripe_service.create_checkout_session.assert_not_called()

    @pytest.mark.asyncio
    async def test_checkout_80off_passes_configured_coupon(
        self,
        mock_org_context,
        mock_stripe_service,
        mock_customer,
        mock_checkout_session,
    ):
        """limited offer checkout applies the configured Stripe coupon."""
        mock_org_context.table().select().eq().single().execute.return_value = (
            MagicMock(
                data={"billing_email": "billing@test.com", "name": "Test Organization"}
            )
        )
        mock_stripe_service.create_customer.return_value = mock_customer
        mock_stripe_service.create_checkout_session.return_value = mock_checkout_session

        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
            launch_offer_code="80OFF",
        )

        await create_checkout_session(request, mock_org_context, mock_stripe_service)

        call_kwargs = mock_stripe_service.create_checkout_session.call_args.kwargs
        assert call_kwargs["coupon_id"] == "80OFF"

    @pytest.mark.asyncio
    async def test_checkout_rejects_invalid_launch_offer_code(
        self,
        mock_org_context,
        mock_stripe_service,
    ):
        """Unknown limited offer codes are rejected."""
        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
            launch_offer_code="SAVE20",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid limited offer code" in exc_info.value.detail
        mock_stripe_service.create_customer.assert_not_called()
        mock_stripe_service.create_checkout_session.assert_not_called()

    @pytest.mark.asyncio
    async def test_checkout_rejects_launch_offer_with_offer_token(
        self,
        mock_org_context,
        mock_stripe_service,
    ):
        """limited offers and winback offer tokens cannot stack discounts."""
        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
            offer_token="winback-token",
            launch_offer_code="80OFF",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "either a limited offer code or winback offer token"
            in exc_info.value.detail
        )
        mock_stripe_service.create_customer.assert_not_called()
        mock_stripe_service.create_checkout_session.assert_not_called()

    @pytest.mark.asyncio
    async def test_checkout_offer_token_behavior_remains(
        self,
        mock_org_context,
        mock_stripe_service,
        mock_customer,
        mock_checkout_session,
        monkeypatch,
    ):
        """Winback offer tokens still resolve to their own coupon."""
        import app.api.v1.billing as billing_routes

        monkeypatch.setattr(
            billing_routes,
            "_resolve_coupon_and_tier",
            lambda token, org: ("FREEAUDIT50_ANNUAL", "offer_50"),
        )

        def table_factory(table_name: str) -> MagicMock:
            table = MagicMock()
            if table_name == "subscriptions":
                table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                    data={"stripe_customer_id": "cus_existing123"}
                )
            elif table_name == "free_audit_winback_offers":
                table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                    data=None
                )
            elif table_name == "organizations":
                table.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                    data={"settings": {}}
                )
            return table

        mock_org_context.table.side_effect = table_factory
        mock_org_context.client.table.side_effect = table_factory
        mock_stripe_service.create_checkout_session.return_value = mock_checkout_session

        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
            offer_token="winback-token",
        )

        await create_checkout_session(request, mock_org_context, mock_stripe_service)

        call_kwargs = mock_stripe_service.create_checkout_session.call_args.kwargs
        assert call_kwargs["coupon_id"] == "FREEAUDIT50_ANNUAL"
        assert call_kwargs["metadata"]["offer_tier"] == "offer_50"

    @pytest.mark.asyncio
    async def test_trial_start_accepts_launch_offer_without_applying_coupon(
        self,
        mock_org_context,
        mock_stripe_service,
        monkeypatch,
    ):
        """Trial start validates the launch code but does not call Stripe checkout."""
        import app.api.v1.billing as billing_routes

        do_start_trial = MagicMock(return_value=MagicMock())
        monkeypatch.setattr(
            billing_routes,
            "_do_start_trial",
            do_start_trial,
        )
        request = TrialStartRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            launch_offer_code="80OFF",
        )

        await start_trial(request, mock_org_context)

        do_start_trial.assert_called_once()
        mock_stripe_service.create_checkout_session.assert_not_called()

    @pytest.mark.asyncio
    async def test_trial_start_rejects_invalid_launch_offer_code(
        self,
        mock_org_context,
    ):
        """Trial start accepts the field but rejects unknown codes."""
        request = TrialStartRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            launch_offer_code="SAVE20",
        )

        with pytest.raises(HTTPException) as exc_info:
            await start_trial(request, mock_org_context)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid limited offer code" in exc_info.value.detail

    def test_trial_start_rejects_offer_token_field(self):
        """Trial start must not silently drop winback offer tokens."""
        with pytest.raises(ValidationError) as exc_info:
            TrialStartRequest.model_validate(
                {
                    "plan_id": "reconcile",
                    "billing_period": "annual",
                    "unit_count": 25,
                    "building_count": 5,
                    "offer_token": "winback-token",
                }
            )

        assert "Extra inputs are not permitted" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_checkout_invalid_plan(self, mock_org_context, mock_stripe_service):
        """Verify invalid plan rejected."""
        request = CheckoutRequest(
            plan_id="nonexistent",
            billing_period="annual",
            unit_count=10,
            building_count=2,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid plan" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_checkout_rejects_unit_counts_above_self_serve_limit(
        self, mock_org_context, mock_stripe_service
    ):
        """Self-serve checkout allows large bands but keeps a hard abuse limit."""
        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=100001,
            building_count=25,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "sales" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_checkout_rejects_missing_building_count(
        self, mock_org_context, mock_stripe_service
    ):
        """Building count is retained as positive metadata."""
        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=200,
            building_count=0,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "building" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_checkout_rejects_missing_unit_count(
        self, mock_org_context, mock_stripe_service
    ):
        """Unit count must be at least one rentable unit."""
        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=0,
            building_count=1,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "unit" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_checkout_rejects_paused_subscription(
        self, mock_org_context, mock_stripe_service
    ):
        """Paused trials must resume via billing, not a new checkout session."""
        subscription_result = MagicMock(
            data={
                "stripe_customer_id": "cus_paused",
                "stripe_subscription_id": "sub_paused",
                "status": "paused",
            }
        )
        mock_org_context.table().select().eq().maybe_single().execute.return_value = (
            subscription_result
        )

        request = CheckoutRequest(
            plan_id="reconcile",
            billing_period="annual",
            unit_count=25,
            building_count=5,
            success_url="http://localhost:5173/checkout/success",
            cancel_url="http://localhost:5173/pricing",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(
                request, mock_org_context, mock_stripe_service
            )

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT
        assert "resume access" in exc_info.value.detail.lower()
        mock_stripe_service.create_checkout_session.assert_not_called()


class TestCheckoutSuccess:
    """Test GET /billing/checkout/success endpoint."""

    @pytest.mark.asyncio
    async def test_checkout_success_verifies_session(
        self, mock_org_context, mock_stripe_service
    ):
        """Verify success endpoint validates session."""
        mock_session = MagicMock()
        mock_session.subscription = "sub_test123"
        mock_session.customer = "cus_test123"
        mock_session.metadata = {
            "organization_id": str(mock_org_context.organization_id),
        }

        with patch("stripe.checkout.Session.retrieve") as mock_retrieve:
            mock_retrieve.return_value = mock_session

            response = await checkout_success(
                session_id="cs_test123",
                ctx=mock_org_context,
                stripe_service=mock_stripe_service,
            )

            assert response["status"] == "success"
            assert response["subscription_id"] == "sub_test123"
            assert response["customer_id"] == "cus_test123"

    @pytest.mark.asyncio
    async def test_checkout_success_invalid_session(
        self, mock_org_context, mock_stripe_service
    ):
        """Verify invalid session rejected."""
        with patch("stripe.checkout.Session.retrieve") as mock_retrieve:
            mock_retrieve.side_effect = stripe.error.InvalidRequestError(
                "No such checkout session", None
            )

            with pytest.raises(HTTPException) as exc_info:
                await checkout_success(
                    session_id="invalid",
                    ctx=mock_org_context,
                    stripe_service=mock_stripe_service,
                )

            assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.asyncio
    async def test_checkout_success_wrong_org(
        self, mock_org_context, mock_stripe_service
    ):
        """Verify session must belong to requesting organization."""
        mock_session = MagicMock()
        mock_session.metadata = {
            "organization_id": "different_org",
        }

        with patch("stripe.checkout.Session.retrieve") as mock_retrieve:
            mock_retrieve.return_value = mock_session

            with pytest.raises(HTTPException) as exc_info:
                await checkout_success(
                    session_id="cs_test123",
                    ctx=mock_org_context,
                    stripe_service=mock_stripe_service,
                )

            assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
