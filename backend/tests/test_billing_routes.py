"""
Tests for billing API endpoints.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import stripe
from fastapi import HTTPException, status

from app.api.v1.billing import (
    SubscribeRequest,
    create_customer,
    create_subscription,
    get_customer,
    get_free_audit_entitlement_status,
)
from app.auth.dependencies import OrganizationContext
from app.models.user import User


@pytest.fixture
def mock_org_context():
    """Mock OrganizationContext."""
    user = User(
        id=uuid4(),
        email="user@example.com",
        organization_id=uuid4(),
        role="admin",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    ctx = MagicMock(spec=OrganizationContext)
    ctx.organization_id = user.organization_id
    ctx.user = user
    ctx.client = MagicMock()
    ctx.table = MagicMock(return_value=ctx.client.table.return_value)

    return ctx


@pytest.fixture
def mock_customer_service():
    """Mock CustomerService."""
    return MagicMock()


class TestGetCustomer:
    """Test GET /billing/customer endpoint."""

    @pytest.mark.asyncio
    async def test_get_customer_success(self, mock_org_context):
        """Verify customer details are returned."""
        # Mock customer without spec to avoid bool evaluation issues
        mock_customer = MagicMock()
        mock_customer.id = "cus_test123"
        mock_customer.email = "billing@example.com"
        mock_customer.name = "Test Org"
        mock_customer.created = 1234567890

        # Create mock service with AsyncMock for the method
        mock_customer_service = MagicMock()
        mock_get = AsyncMock(return_value=mock_customer)
        mock_customer_service.get_customer_by_organization = mock_get

        # Execute
        result = await get_customer(mock_org_context, mock_customer_service)

        # Verify response format
        assert result["id"] == "cus_test123"
        assert result["email"] == "billing@example.com"
        assert result["name"] == "Test Org"
        assert result["created"] == 1234567890

        # Verify service called correctly
        mock_get.assert_awaited_once_with(mock_org_context.organization_id)

    @pytest.mark.asyncio
    async def test_get_customer_not_found(
        self, mock_org_context, mock_customer_service
    ):
        """Verify 404 when customer doesn't exist."""
        # Mock customer doesn't exist
        mock_customer_service.get_customer_by_organization = AsyncMock(
            return_value=None
        )

        # Execute and verify exception
        with pytest.raises(HTTPException) as exc_info:
            await get_customer(mock_org_context, mock_customer_service)

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "No billing customer found" in exc_info.value.detail


class TestCreateCustomer:
    """Test POST /billing/customer endpoint."""

    @pytest.mark.asyncio
    async def test_create_customer_success(
        self, mock_org_context, mock_customer_service
    ):
        """Verify customer is created with organization details."""
        # Mock organization data
        org_data = {
            "id": str(mock_org_context.organization_id),
            "name": "Test Organization",
            "billing_email": "billing@testorg.com",
        }

        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = org_data

        # Mock customer creation
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_new123"
        mock_customer.email = "billing@testorg.com"
        mock_customer.name = "Test Organization"
        mock_customer.created = 1234567890

        mock_customer_service.get_or_create_customer = AsyncMock(
            return_value=mock_customer
        )

        # Execute
        result = await create_customer(mock_org_context, mock_customer_service)

        # Verify organization queried
        mock_org_context.table.assert_called_once_with("organizations")

        # Verify customer created
        mock_customer_service.get_or_create_customer.assert_called_once_with(
            organization_id=mock_org_context.organization_id,
            email="billing@testorg.com",
            name="Test Organization",
        )

        # Verify response
        assert result["id"] == "cus_new123"
        assert result["email"] == "billing@testorg.com"
        assert result["name"] == "Test Organization"
        assert result["created"] == 1234567890

    @pytest.mark.asyncio
    async def test_create_customer_uses_user_email_fallback(
        self, mock_org_context, mock_customer_service
    ):
        """Verify user email is used when billing_email is not set."""
        # Mock organization without billing_email
        org_data = {
            "id": str(mock_org_context.organization_id),
            "name": "No Billing Email Org",
            "billing_email": None,
        }

        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = org_data

        # Mock customer creation
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_fallback123"
        mock_customer.email = mock_org_context.user.email
        mock_customer.name = "No Billing Email Org"
        mock_customer.created = 1234567890

        mock_customer_service.get_or_create_customer = AsyncMock(
            return_value=mock_customer
        )

        # Execute
        await create_customer(mock_org_context, mock_customer_service)

        # Verify user email was used
        mock_customer_service.get_or_create_customer.assert_called_once()
        call_kwargs = mock_customer_service.get_or_create_customer.call_args.kwargs
        assert call_kwargs["email"] == mock_org_context.user.email

    @pytest.mark.asyncio
    async def test_create_customer_organization_not_found(
        self, mock_org_context, mock_customer_service
    ):
        """Verify 404 when organization doesn't exist."""
        # Mock organization not found
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = None

        # Execute and verify exception
        with pytest.raises(HTTPException) as exc_info:
            await create_customer(mock_org_context, mock_customer_service)

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
        assert "Organization not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_create_customer_handles_empty_name(
        self, mock_org_context, mock_customer_service
    ):
        """Verify empty organization name defaults to empty string."""
        # Mock organization without name
        org_data = {
            "id": str(mock_org_context.organization_id),
            "billing_email": "noname@example.com",
        }

        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = org_data

        # Mock customer creation
        mock_customer = MagicMock(spec=stripe.Customer)
        mock_customer.id = "cus_noname123"
        mock_customer.email = "noname@example.com"
        mock_customer.name = ""
        mock_customer.created = 1234567890

        mock_customer_service.get_or_create_customer = AsyncMock(
            return_value=mock_customer
        )

        # Execute
        await create_customer(mock_org_context, mock_customer_service)

        # Verify empty name was used
        call_kwargs = mock_customer_service.get_or_create_customer.call_args.kwargs
        assert call_kwargs["name"] == ""


class TestCreateSubscription:
    """Test POST /billing/subscribe endpoint."""

    def test_subscribe_request_accepts_current_self_serve_tiers(self):
        request = SubscribeRequest(
            tier="reconcile",
            unit_count=151,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
        )

        assert request.tier == "reconcile"
        assert request.unit_count == 151

    def test_subscribe_request_rejects_retired_tiers(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            SubscribeRequest(
                tier="starter",
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel",
            )

    @pytest.mark.asyncio
    async def test_create_subscription_returns_400_for_unmapped_tier(
        self, mock_org_context
    ):
        request = SubscribeRequest.model_construct(
            tier="starter",
            unit_count=25,
            building_count=1,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_subscription(
                request=request,
                ctx=mock_org_context,
                stripe_service=MagicMock(),
                customer_service=MagicMock(),
            )

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.asyncio
    async def test_create_subscription_raises_500_when_session_url_missing(
        self, mock_org_context, monkeypatch
    ):
        request = SubscribeRequest(
            tier="reconcile",
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
        )

        monkeypatch.setattr(
            "app.api.v1.billing.get_stripe_price_id_for_tier",
            lambda _tier, annual=True: "price_reconcile_annual",
        )
        monkeypatch.setattr(
            "app.api.v1.billing.get_annual_total_cents",
            lambda _tier, _unit_count: 499000,
        )

        org_result = MagicMock()
        org_result.data = {"name": "Acme", "billing_email": "billing@example.com"}
        mock_org_context.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            org_result
        )

        customer_service = MagicMock()
        customer = MagicMock()
        customer.id = "cus_test123"
        customer_service.get_or_create_customer = AsyncMock(return_value=customer)

        stripe_service = MagicMock()
        session = MagicMock()
        session.url = None
        stripe_service.create_checkout_session = AsyncMock(return_value=session)

        with pytest.raises(HTTPException) as exc_info:
            await create_subscription(
                request=request,
                ctx=mock_org_context,
                stripe_service=stripe_service,
                customer_service=customer_service,
            )

        assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    @pytest.mark.asyncio
    async def test_create_subscription_uses_unit_priced_reconcile_checkout(
        self, mock_org_context
    ):
        request = SubscribeRequest(
            tier="reconcile",
            unit_count=151,
            building_count=3,
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
        )

        org_result = MagicMock()
        org_result.data = {"name": "Acme", "billing_email": "billing@example.com"}
        mock_org_context.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            org_result
        )

        customer_service = MagicMock()
        customer = MagicMock()
        customer.id = "cus_test123"
        customer_service.get_or_create_customer = AsyncMock(return_value=customer)

        stripe_service = MagicMock()
        session = MagicMock()
        session.url = "https://checkout.stripe.test/session"
        stripe_service.create_checkout_session = AsyncMock(return_value=session)

        response = await create_subscription(
            request=request,
            ctx=mock_org_context,
            stripe_service=stripe_service,
            customer_service=customer_service,
        )

        assert response.price_annual_cents == 2753400
        call_kwargs = stripe_service.create_checkout_session.call_args.kwargs
        assert call_kwargs["line_items"][0]["price_data"]["unit_amount"] == 2753400
        assert call_kwargs["metadata"]["unit_count"] == "151"
        assert call_kwargs["metadata"]["unit_overage_count"] == "126"


class TestFreeAuditStatus:
    """Tests for GET /billing/free-audit-status endpoint."""

    @pytest.mark.asyncio
    async def test_status_unpaid_with_draft_snapshot(self, mock_org_context):
        def table_side_effect(table_name):
            t = MagicMock()
            if table_name == "subscriptions":
                m = MagicMock()
                m.data = None
                t.select.return_value.eq.return_value.in_.return_value.maybe_single.return_value.execute.return_value = (
                    m
                )
                t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
                    m
                )
            elif table_name == "calculation_jobs":
                m = MagicMock()
                m.count = 0
                m.data = []
                t.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    m
                )
            elif table_name == "reconciliation_snapshots":
                m = MagicMock()
                m.count = 1
                m.data = [{"id": str(uuid4())}]
                t.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    m
                )
            return t

        mock_org_context.table.side_effect = table_side_effect

        result = await get_free_audit_entitlement_status(mock_org_context)
        assert result.has_subscription is False
        assert result.has_paused_subscription is False
        assert result.free_audit_consumed is True
        assert result.can_add_property is False
        assert result.can_run_reconciliation is False
        assert result.can_view_draft_report is False
        assert result.can_download_reports is False

    @pytest.mark.asyncio
    async def test_status_exposes_paused_subscription(self, mock_org_context):
        def table_side_effect(table_name):
            t = MagicMock()
            if table_name == "subscriptions":
                paused_result = MagicMock()
                paused_result.data = {"status": "paused"}

                active_result = MagicMock()
                active_result.data = None

                paused_chain = (
                    t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute
                )
                paused_chain.return_value = paused_result

                active_chain = (
                    t.select.return_value.eq.return_value.in_.return_value.maybe_single.return_value.execute
                )
                active_chain.return_value = active_result
            elif table_name == "calculation_jobs":
                jobs = MagicMock()
                jobs.count = 0
                jobs.data = []
                t.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    jobs
                )
            elif table_name == "reconciliation_snapshots":
                snapshots = MagicMock()
                snapshots.count = 0
                snapshots.data = []
                t.select.return_value.eq.return_value.in_.return_value.execute.return_value = (
                    snapshots
                )
            elif table_name == "audit_credits":
                credits = MagicMock()
                credits.data = []
                t.select.return_value.eq.return_value.execute.return_value = credits
                t.select.return_value.eq.return_value.range.return_value.execute.return_value = (
                    credits
                )
            return t

        mock_org_context.table.side_effect = table_side_effect

        result = await get_free_audit_entitlement_status(mock_org_context)

        assert result.has_subscription is False
        assert result.has_paused_subscription is True


class TestGetSubscription:
    """Test GET /billing/subscription endpoint."""

    @pytest.mark.asyncio
    async def test_get_subscription_success(self, mock_org_context):
        """Verify subscription details are returned."""
        from datetime import datetime
        from uuid import uuid4

        from app.api.v1.billing import get_subscription
        from app.models.subscription import Subscription, SubscriptionPlan

        # Create mock subscription
        mock_subscription = Subscription(
            id=uuid4(),
            organization_id=mock_org_context.organization_id,
            plan=SubscriptionPlan.PROFESSIONAL,
            status="active",
            stripe_customer_id="cus_test123",
            stripe_subscription_id="sub_test456",
            current_period_start=datetime.now(UTC),
            current_period_end=datetime.now(UTC),
            cancel_at_period_end=False,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Create mock service
        mock_service = MagicMock()
        mock_get = AsyncMock(return_value=mock_subscription)
        mock_service.get_subscription = mock_get

        # Execute
        result = await get_subscription(mock_org_context, mock_service)

        # Verify
        assert result.plan == SubscriptionPlan.PROFESSIONAL
        mock_get.assert_awaited_once_with(mock_org_context.organization_id)

    @pytest.mark.asyncio
    async def test_get_subscription_not_found(self, mock_org_context):
        """Verify 404 when subscription doesn't exist."""
        from app.api.v1.billing import get_subscription

        # Create mock service that returns None
        mock_service = MagicMock()
        mock_service.get_subscription = AsyncMock(return_value=None)

        # Execute and verify exception
        with pytest.raises(HTTPException) as exc_info:
            await get_subscription(mock_org_context, mock_service)

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND


class TestUpgradeSubscription:
    """Test POST /billing/subscription/upgrade endpoint."""

    @pytest.mark.asyncio
    async def test_upgrade_rejects_legacy_plan_changes(self, mock_org_context):
        """Plan changes are rejected now that Reconcile is the only plan."""
        from app.api.v1.billing import UpgradeRequest, upgrade_subscription
        from app.models.subscription import SubscriptionPlan

        new_plan = SubscriptionPlan.PROFESSIONAL
        mock_service = MagicMock()
        mock_service.upgrade_subscription = AsyncMock()
        request = UpgradeRequest(new_plan=new_plan.value)

        with pytest.raises(HTTPException) as exc_info:
            await upgrade_subscription(request, mock_org_context, mock_service)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Reconcile is the only active subscription" in exc_info.value.detail
        mock_service.upgrade_subscription.assert_not_called()

    @pytest.mark.asyncio
    async def test_upgrade_error(self, mock_org_context):
        """Verify 400 when upgrade fails."""
        from app.api.v1.billing import UpgradeRequest, upgrade_subscription
        from app.models.subscription import SubscriptionPlan

        mock_service = MagicMock()
        mock_service.upgrade_subscription = AsyncMock()

        request = UpgradeRequest(new_plan=SubscriptionPlan.PROFESSIONAL.value)
        with pytest.raises(HTTPException) as exc_info:
            await upgrade_subscription(request, mock_org_context, mock_service)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        mock_service.upgrade_subscription.assert_not_called()


class TestCancelSubscription:
    """Test POST /billing/subscription/cancel endpoint."""

    @pytest.mark.asyncio
    async def test_cancel_at_period_end(self, mock_org_context):
        """Verify cancel at period end works."""
        from datetime import datetime
        from uuid import uuid4

        from app.api.v1.billing import CancelRequest, cancel_subscription
        from app.models.subscription import Subscription, SubscriptionPlan

        # Create mock subscription
        mock_subscription = Subscription(
            id=uuid4(),
            organization_id=mock_org_context.organization_id,
            plan=SubscriptionPlan.PROFESSIONAL,
            status="active",
            stripe_customer_id="cus_test123",
            stripe_subscription_id="sub_test456",
            current_period_start=datetime.now(UTC),
            current_period_end=datetime.now(UTC),
            cancel_at_period_end=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Create mock services
        mock_service = MagicMock()
        mock_service.cancel_subscription = AsyncMock(return_value=mock_subscription)
        mock_save_offer_service = MagicMock()
        mock_save_offer_service.mark_declined = AsyncMock()

        # Execute with immediate=False (default)
        request = CancelRequest(immediate=False)
        result = await cancel_subscription(
            request, mock_org_context, mock_service, mock_save_offer_service
        )

        # Verify
        assert result.cancel_at_period_end is True
        mock_service.cancel_subscription.assert_awaited_once_with(
            mock_org_context.organization_id, at_period_end=True
        )
        mock_save_offer_service.mark_declined.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_cancel_immediately(self, mock_org_context):
        """Verify immediate cancellation works."""
        from datetime import datetime
        from uuid import uuid4

        from app.api.v1.billing import CancelRequest, cancel_subscription
        from app.models.subscription import Subscription, SubscriptionPlan

        # Create mock subscription
        mock_subscription = Subscription(
            id=uuid4(),
            organization_id=mock_org_context.organization_id,
            plan=SubscriptionPlan.PROFESSIONAL,
            status="canceled",
            stripe_customer_id="cus_test123",
            stripe_subscription_id="sub_test456",
            current_period_start=datetime.now(UTC),
            current_period_end=datetime.now(UTC),
            cancel_at_period_end=False,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Create mock services
        mock_service = MagicMock()
        mock_service.cancel_subscription = AsyncMock(return_value=mock_subscription)
        mock_save_offer_service = MagicMock()
        mock_save_offer_service.mark_declined = AsyncMock()

        # Execute with immediate=True
        request = CancelRequest(immediate=True)
        result = await cancel_subscription(
            request, mock_org_context, mock_service, mock_save_offer_service
        )

        # Verify
        assert result.status == "canceled"
        mock_service.cancel_subscription.assert_awaited_once_with(
            mock_org_context.organization_id, at_period_end=False
        )
        mock_save_offer_service.mark_declined.assert_not_awaited()


class TestResumeSubscription:
    """Test POST /billing/subscription/resume endpoint."""

    @pytest.mark.asyncio
    async def test_resume_success(self, mock_org_context):
        """Verify resume works."""
        from datetime import datetime
        from uuid import uuid4

        from app.api.v1.billing import resume_subscription
        from app.models.subscription import Subscription, SubscriptionPlan

        # Create mock subscription
        mock_subscription = Subscription(
            id=uuid4(),
            organization_id=mock_org_context.organization_id,
            plan=SubscriptionPlan.PROFESSIONAL,
            status="active",
            stripe_customer_id="cus_test123",
            stripe_subscription_id="sub_test456",
            current_period_start=datetime.now(UTC),
            current_period_end=datetime.now(UTC),
            cancel_at_period_end=False,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Create mock service
        mock_service = MagicMock()
        mock_service.resume_subscription = AsyncMock(return_value=mock_subscription)

        # Execute
        result = await resume_subscription(mock_org_context, mock_service)

        # Verify
        assert result.cancel_at_period_end is False
        mock_service.resume_subscription.assert_awaited_once_with(
            mock_org_context.organization_id
        )


class TestListPaymentMethods:
    """Test GET /billing/payment-methods endpoint."""

    @pytest.mark.asyncio
    async def test_list_payment_methods_success(self, mock_org_context):
        """Verify payment methods are listed."""
        from app.api.v1.billing import list_payment_methods

        # Mock subscription with customer ID
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = {"stripe_customer_id": "cus_test123"}

        payment_methods = [
            {
                "id": "pm_test1",
                "brand": "visa",
                "last4": "4242",
                "exp_month": 12,
                "exp_year": 2025,
                "is_default": True,
            }
        ]

        mock_service = MagicMock()
        mock_service.list_payment_methods = AsyncMock(return_value=payment_methods)

        result = await list_payment_methods(mock_org_context, mock_service)

        assert len(result) == 1
        assert result[0]["id"] == "pm_test1"
        mock_service.list_payment_methods.assert_awaited_once_with("cus_test123")

    @pytest.mark.asyncio
    async def test_list_payment_methods_no_customer(self, mock_org_context):
        """Verify 404 when no customer found."""
        from app.api.v1.billing import list_payment_methods

        # Mock no subscription
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = None

        mock_service = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await list_payment_methods(mock_org_context, mock_service)

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND


class TestCreateSetupIntent:
    """Test POST /billing/payment-methods/setup endpoint."""

    @pytest.mark.asyncio
    async def test_create_setup_intent_success(self, mock_org_context):
        """Verify SetupIntent is created."""
        from app.api.v1.billing import create_setup_intent

        # Mock subscription with customer ID
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = {"stripe_customer_id": "cus_test123"}

        mock_service = MagicMock()
        mock_service.create_setup_intent = AsyncMock(return_value="seti_secret123")

        result = await create_setup_intent(mock_org_context, mock_service)

        assert result["client_secret"] == "seti_secret123"
        mock_service.create_setup_intent.assert_awaited_once_with("cus_test123")


class TestSetDefaultPaymentMethod:
    """Test POST /billing/payment-methods/{id}/default endpoint."""

    @pytest.mark.asyncio
    async def test_set_default_payment_method_success(self, mock_org_context):
        """Verify default payment method is set."""
        from app.api.v1.billing import set_default_payment_method

        # Mock subscription with customer ID
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = {"stripe_customer_id": "cus_test123"}

        mock_service = MagicMock()
        mock_service.set_default_payment_method = AsyncMock()

        result = await set_default_payment_method(
            "pm_test123", mock_org_context, mock_service
        )

        assert result["status"] == "success"
        mock_service.set_default_payment_method.assert_awaited_once_with(
            "cus_test123", "pm_test123"
        )


class TestRemovePaymentMethod:
    """Test DELETE /billing/payment-methods/{id} endpoint."""

    @pytest.mark.asyncio
    async def test_remove_payment_method_success(self, mock_org_context):
        """Verify payment method is removed."""
        from app.api.v1.billing import remove_payment_method

        # Mock subscription with customer ID
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = {"stripe_customer_id": "cus_test123"}

        mock_service = MagicMock()
        mock_service.remove_payment_method = AsyncMock()

        result = await remove_payment_method(
            "pm_test123", mock_org_context, mock_service
        )

        assert result["status"] == "success"
        mock_service.remove_payment_method.assert_awaited_once_with(
            "cus_test123", "pm_test123"
        )

    @pytest.mark.asyncio
    async def test_remove_payment_method_only_one(self, mock_org_context):
        """Verify 400 when trying to remove only payment method."""
        from app.api.v1.billing import remove_payment_method

        # Mock subscription with customer ID
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = {"stripe_customer_id": "cus_test123"}

        mock_service = MagicMock()
        mock_service.remove_payment_method = AsyncMock(
            side_effect=ValueError("Cannot remove the only payment method")
        )

        with pytest.raises(HTTPException) as exc_info:
            await remove_payment_method("pm_test123", mock_org_context, mock_service)

        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


class TestCreatePortalSession:
    """Test POST /billing/portal endpoint."""

    @pytest.mark.asyncio
    async def test_create_portal_session_success(self, mock_org_context):
        """Verify portal session is created."""
        from app.api.v1.billing import create_portal_session

        # Mock subscription with customer ID
        mock_result = mock_org_context.table.return_value
        mock_result = mock_result.select.return_value.eq.return_value
        mock_result = mock_result.single.return_value.execute.return_value
        mock_result.data = {"stripe_customer_id": "cus_test123"}

        mock_service = MagicMock()
        mock_service.create_portal_session = AsyncMock(
            return_value="https://billing.stripe.com/session/xxx"
        )

        result = await create_portal_session(
            "https://example.com/billing", mock_org_context, mock_service
        )

        assert result["url"] == "https://billing.stripe.com/session/xxx"
        mock_service.create_portal_session.assert_awaited_once_with(
            "cus_test123", "https://example.com/billing"
        )
