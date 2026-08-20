"""Tests for winback offer mutual exclusion at checkout."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

from app.api.v1.billing import CheckoutRequest, create_checkout_session
from app.auth.dependencies import OrganizationContext
from app.models.user import User
from app.services.billing.offer_tokens import create_offer_token

SECRET = "test-secret"


def _make_valid_token(org_id: str, tier: str) -> str:
    return create_offer_token(
        organization_id=org_id,
        offer_tier=tier,
        expires_at=datetime.now(UTC) + timedelta(days=14),
        secret=SECRET,
    )


@pytest.fixture
def org_id():
    return str(uuid4())


@pytest.fixture
def mock_stripe_service():
    svc = MagicMock()
    session = MagicMock()
    session.id = "cs_test123"
    session.url = "https://checkout.stripe.com/pay/cs_test123"
    svc.create_checkout_session = AsyncMock(return_value=session)
    svc.create_customer = AsyncMock(
        return_value=MagicMock(id="cus_test123", email="t@e.com", name="Org")
    )
    return svc


def _make_ctx(winback_data: dict | None) -> MagicMock:
    """
    Return a mock OrgContext where:
    - subscriptions table returns a customer_id (skips org creation)
    - free_audit_winback_offers table returns winback_data
    """
    org_uuid = uuid4()
    user = User(
        id=uuid4(),
        email="user@example.com",
        organization_id=org_uuid,
        role="admin",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    ctx = MagicMock(spec=OrganizationContext)
    ctx.organization_id = org_uuid
    ctx.user = user
    ctx.client = MagicMock()

    def table_factory(table_name: str) -> MagicMock:
        m = MagicMock()
        if table_name == "subscriptions":
            m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                data={"stripe_customer_id": "cus_existing123"}
            )
        elif table_name == "free_audit_winback_offers":
            m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                data=winback_data
            )
        elif table_name == "organizations":
            m.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                data={"settings": {}}
            )
        return m

    ctx.client.table.side_effect = table_factory
    ctx.table = ctx.client.table
    return ctx


class TestWinbackOfferExclusion:
    @pytest.mark.asyncio
    async def test_offer_50_already_redeemed_blocks_offer_free(
        self, org_id, mock_stripe_service, monkeypatch
    ):
        """When offer_50 was redeemed, using an offer_free token → 409."""
        import app.api.v1.billing as billing_routes

        monkeypatch.setattr(
            billing_routes,
            "_resolve_coupon_and_tier",
            lambda token, org: ("coupon_free_mock", "offer_free"),
        )

        ctx = _make_ctx({"redeemed_offer_tier": "offer_50"})
        request = CheckoutRequest(
            plan_id="reconcile",
            success_url="https://app.capveri.com/success",
            cancel_url="https://app.capveri.com/cancel",
            offer_token="any-token",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(request, ctx, mock_stripe_service)

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.asyncio
    async def test_offer_free_already_redeemed_blocks_offer_50(
        self, org_id, mock_stripe_service, monkeypatch
    ):
        """When offer_free was redeemed, using an offer_50 token → 409."""
        import app.api.v1.billing as billing_routes

        monkeypatch.setattr(
            billing_routes,
            "_resolve_coupon_and_tier",
            lambda token, org: ("coupon_50_mock", "offer_50"),
        )

        ctx = _make_ctx({"redeemed_offer_tier": "offer_free"})
        request = CheckoutRequest(
            plan_id="reconcile",
            success_url="https://app.capveri.com/success",
            cancel_url="https://app.capveri.com/cancel",
            offer_token="any-token",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(request, ctx, mock_stripe_service)

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.asyncio
    async def test_same_tier_already_redeemed_is_also_blocked(
        self, org_id, mock_stripe_service, monkeypatch
    ):
        """A second offer_50 token is blocked even if same tier was redeemed."""
        import app.api.v1.billing as billing_routes

        monkeypatch.setattr(
            billing_routes,
            "_resolve_coupon_and_tier",
            lambda token, org: ("coupon_50_mock", "offer_50"),
        )

        ctx = _make_ctx({"redeemed_offer_tier": "offer_50"})
        request = CheckoutRequest(
            plan_id="reconcile",
            success_url="https://app.capveri.com/success",
            cancel_url="https://app.capveri.com/cancel",
            offer_token="any-token",
        )

        with pytest.raises(HTTPException) as exc_info:
            await create_checkout_session(request, ctx, mock_stripe_service)

        assert exc_info.value.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.asyncio
    async def test_no_prior_redemption_proceeds_to_checkout(
        self, org_id, mock_stripe_service, monkeypatch
    ):
        """No prior redemption → checkout session created normally."""
        import app.api.v1.billing as billing_routes

        monkeypatch.setattr(
            billing_routes,
            "_resolve_coupon_and_tier",
            lambda token, org: ("coupon_50_mock", "offer_50"),
        )

        ctx = _make_ctx(None)  # no row in DB
        request = CheckoutRequest(
            plan_id="reconcile",
            success_url="https://app.capveri.com/success",
            cancel_url="https://app.capveri.com/cancel",
            offer_token="any-token",
        )

        response = await create_checkout_session(request, ctx, mock_stripe_service)

        assert response.session_id == "cs_test123"
        mock_stripe_service.create_checkout_session.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_offer_token_skips_redemption_check(
        self, org_id, mock_stripe_service, monkeypatch
    ):
        """No offer_token in request → no DB check, checkout proceeds."""
        org_uuid = uuid4()
        user = User(
            id=uuid4(),
            email="user@example.com",
            organization_id=org_uuid,
            role="admin",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        ctx = MagicMock(spec=OrganizationContext)
        ctx.organization_id = org_uuid
        ctx.user = user
        ctx.client = MagicMock()

        winback_called = []

        def table_factory(table_name: str) -> MagicMock:
            m = MagicMock()
            if table_name == "subscriptions":
                m.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
                    data={"stripe_customer_id": "cus_existing123"}
                )
            elif table_name == "free_audit_winback_offers":
                winback_called.append(True)
            elif table_name == "organizations":
                m.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
                    data={"settings": {}}
                )
            return m

        ctx.client.table.side_effect = table_factory
        ctx.table = ctx.client.table

        request = CheckoutRequest(
            plan_id="reconcile",
            success_url="https://app.capveri.com/success",
            cancel_url="https://app.capveri.com/cancel",
            offer_token=None,
        )

        response = await create_checkout_session(request, ctx, mock_stripe_service)

        assert response.session_id == "cs_test123"
        assert winback_called == [], "winback_offers table should not be queried"
