"""
Tests for save offer billing API endpoints.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

from app.api.v1.billing import SaveOfferRequest, accept_save_offer, submit_cancel_survey
from app.auth.dependencies import OrganizationContext
from app.models.cancel_attempt import CancelAttempt, CancelReason, SaveOfferType
from app.models.subscription import (
    BillingSubscriptionStatus,
    Subscription,
    SubscriptionPlan,
)
from app.models.user import User


@pytest.fixture
def mock_org_context():
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


def _make_attempt(
    org_id,
    reason: CancelReason = CancelReason.TOO_EXPENSIVE,
    offer_shown: SaveOfferType = SaveOfferType.DISCOUNT_20PCT_1INV,
) -> CancelAttempt:
    return CancelAttempt(
        id=uuid4(),
        organization_id=org_id,
        cancel_reason=reason,
        other_text=None,
        offer_shown=offer_shown,
        offer_accepted=None,
        stripe_coupon_id=None,
        created_at=datetime.now(UTC),
    )


def _make_subscription(org_id) -> Subscription:
    return Subscription(
        id=uuid4(),
        organization_id=org_id,
        plan=SubscriptionPlan.GROWTH,
        status=BillingSubscriptionStatus.ACTIVE,
        building_count=1,
        stripe_subscription_id="sub_test123",
        stripe_customer_id="cus_test123",
        current_period_start=datetime.now(UTC),
        current_period_end=datetime.now(UTC),
        cancel_at_period_end=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


class TestSubmitCancelSurvey:
    @pytest.mark.asyncio
    async def test_submit_survey_creates_attempt(self, mock_org_context):
        attempt = _make_attempt(mock_org_context.organization_id)
        mock_service = MagicMock()
        mock_service.create_attempt = AsyncMock(return_value=attempt)

        request = SaveOfferRequest(reason=CancelReason.TOO_EXPENSIVE)
        result = await submit_cancel_survey(request, mock_org_context, mock_service)

        mock_service.create_attempt.assert_awaited_once_with(
            mock_org_context.organization_id,
            CancelReason.TOO_EXPENSIVE,
            None,
        )
        assert result.attempt_id == str(attempt.id)

    @pytest.mark.asyncio
    async def test_submit_survey_returns_offer_type(self, mock_org_context):
        attempt = _make_attempt(
            mock_org_context.organization_id,
            offer_shown=SaveOfferType.DISCOUNT_20PCT_1INV,
        )
        mock_service = MagicMock()
        mock_service.create_attempt = AsyncMock(return_value=attempt)

        request = SaveOfferRequest(reason=CancelReason.TOO_EXPENSIVE)
        result = await submit_cancel_survey(request, mock_org_context, mock_service)

        assert result.offer_type == SaveOfferType.DISCOUNT_20PCT_1INV
        assert result.discount_percent == 20

    @pytest.mark.asyncio
    async def test_submit_survey_feature_roadmap_has_no_discount_fields(
        self, mock_org_context
    ):
        attempt = _make_attempt(
            mock_org_context.organization_id,
            reason=CancelReason.MISSING_FEATURE,
            offer_shown=SaveOfferType.FEATURE_ROADMAP,
        )
        mock_service = MagicMock()
        mock_service.create_attempt = AsyncMock(return_value=attempt)

        request = SaveOfferRequest(reason=CancelReason.MISSING_FEATURE)
        result = await submit_cancel_survey(request, mock_org_context, mock_service)

        assert result.offer_type == SaveOfferType.FEATURE_ROADMAP
        assert result.discount_percent is None

    @pytest.mark.asyncio
    async def test_submit_survey_annual_discount_sets_discount_percent(
        self, mock_org_context
    ):
        attempt = _make_attempt(
            mock_org_context.organization_id,
            reason=CancelReason.TOO_EXPENSIVE,
            offer_shown=SaveOfferType.DISCOUNT_20PCT_1INV,
        )
        mock_service = MagicMock()
        mock_service.create_attempt = AsyncMock(return_value=attempt)

        request = SaveOfferRequest(reason=CancelReason.TOO_EXPENSIVE)
        result = await submit_cancel_survey(request, mock_org_context, mock_service)

        assert result.offer_type == SaveOfferType.DISCOUNT_20PCT_1INV
        assert result.discount_percent == 20


class TestAcceptSaveOffer:
    @pytest.mark.asyncio
    async def test_accept_save_offer_applies_coupon(self, mock_org_context):
        sub = _make_subscription(mock_org_context.organization_id)
        mock_service = MagicMock()
        mock_service.accept_offer = AsyncMock(return_value=sub)

        result = await accept_save_offer(str(uuid4()), mock_org_context, mock_service)

        assert result.id == sub.id

    @pytest.mark.asyncio
    async def test_accept_save_offer_not_found_404(self, mock_org_context):
        mock_service = MagicMock()
        mock_service.accept_offer = AsyncMock(
            side_effect=ValueError("Cancel attempt not found")
        )

        with pytest.raises(HTTPException) as exc_info:
            await accept_save_offer(str(uuid4()), mock_org_context, mock_service)

        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.asyncio
    async def test_cancel_with_attempt_id_marks_declined(self, mock_org_context):
        """When cancel endpoint is called with attempt_id, it marks the offer declined."""
        from app.api.v1.billing import CancelRequest, cancel_subscription

        sub = _make_subscription(mock_org_context.organization_id)
        mock_sub_service = MagicMock()
        mock_sub_service.cancel_subscription = AsyncMock(return_value=sub)
        mock_save_service = MagicMock()
        mock_save_service.mark_declined = AsyncMock()

        attempt_id = str(uuid4())
        request = CancelRequest(immediate=False, attempt_id=attempt_id)
        await cancel_subscription(
            request, mock_org_context, mock_sub_service, mock_save_service
        )

        mock_save_service.mark_declined.assert_awaited_once()


class TestDeclineSaveOffer:
    @pytest.mark.asyncio
    async def test_decline_save_offer_marks_attempt_declined(self, mock_org_context):
        from app.api.v1.billing import decline_save_offer

        mock_service = MagicMock()
        mock_service.mark_declined = AsyncMock()

        attempt_id = str(uuid4())
        await decline_save_offer(attempt_id, mock_org_context, mock_service)

        mock_service.mark_declined.assert_awaited_once()
        call_args = mock_service.mark_declined.call_args[0]
        assert str(call_args[0]) == attempt_id
        assert call_args[1] == mock_org_context.organization_id

    @pytest.mark.asyncio
    async def test_decline_save_offer_returns_204(self, mock_org_context):
        from app.api.v1.billing import decline_save_offer

        mock_service = MagicMock()
        mock_service.mark_declined = AsyncMock()

        result = await decline_save_offer(str(uuid4()), mock_org_context, mock_service)

        assert result is None
