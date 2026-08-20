"""
Tests for SaveOfferService - churn prevention save offer logic.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.models.cancel_attempt import CancelReason, SaveOfferType
from app.services.billing.save_offers import OFFER_MAPPING, SaveOfferService

ORG_ID = uuid4()
ATTEMPT_ID = uuid4()


def _make_attempt_data(
    reason: str = "too_expensive",
    offer_shown: str = "discount_20pct_1inv",
    offer_accepted: bool | None = None,
) -> dict:
    return {
        "id": str(ATTEMPT_ID),
        "organization_id": str(ORG_ID),
        "cancel_reason": reason,
        "other_text": None,
        "offer_shown": offer_shown,
        "offer_accepted": offer_accepted,
        "stripe_coupon_id": None,
        "created_at": datetime.now(UTC).isoformat(),
    }


def _make_subscription_data(stripe_sub_id: str | None = "sub_test123") -> dict:
    return {
        "id": str(uuid4()),
        "organization_id": str(ORG_ID),
        "plan": "growth",
        "status": "active",
        "building_count": 1,
        "stripe_subscription_id": stripe_sub_id,
        "stripe_customer_id": "cus_test123",
        "current_period_start": datetime.now(UTC).isoformat(),
        "current_period_end": datetime.now(UTC).isoformat(),
        "cancel_at_period_end": False,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def _make_db(cancel_data=None, sub_data=None):
    """Build a mock DB where table() returns consistent mocks per table name."""
    cancel_mock = MagicMock()
    sub_mock = MagicMock()
    sub_mock.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        None
    )

    if cancel_data:
        # For select queries
        cancel_mock.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            cancel_data
        )
        # For insert
        cancel_mock.insert.return_value.execute.return_value.data = [cancel_data]

    if sub_data:
        sub_mock.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            sub_data
        )

    table_map = {
        "cancel_attempts": cancel_mock,
        "subscriptions": sub_mock,
    }

    db = MagicMock()
    db.table.side_effect = lambda name: table_map.get(name, MagicMock())
    return db, cancel_mock, sub_mock


def _make_service(db=None, stripe_service=None):
    return SaveOfferService(
        stripe_service=stripe_service or MagicMock(),
        db=db or MagicMock(),
    )


class TestOfferMapping:
    def test_get_offer_for_reason_too_expensive(self):
        assert (
            OFFER_MAPPING[CancelReason.TOO_EXPENSIVE]
            == SaveOfferType.DISCOUNT_20PCT_1INV
        )

    def test_get_offer_for_reason_not_using_enough(self):
        assert (
            OFFER_MAPPING[CancelReason.NOT_USING_ENOUGH]
            == SaveOfferType.DISCOUNT_20PCT_1INV
        )

    def test_get_offer_for_reason_missing_feature(self):
        assert (
            OFFER_MAPPING[CancelReason.MISSING_FEATURE] == SaveOfferType.FEATURE_ROADMAP
        )

    def test_get_offer_for_reason_switching_competitor(self):
        assert (
            OFFER_MAPPING[CancelReason.SWITCHING_COMPETITOR]
            == SaveOfferType.DISCOUNT_20PCT_1INV
        )

    def test_get_offer_for_reason_business_closed(self):
        assert OFFER_MAPPING[CancelReason.BUSINESS_CLOSED] == SaveOfferType.NONE

    def test_get_offer_for_reason_other(self):
        assert OFFER_MAPPING[CancelReason.OTHER] == SaveOfferType.DISCOUNT_20PCT_1INV


class TestCreateAttempt:
    @pytest.mark.asyncio
    async def test_create_attempt_saves_to_db(self):
        attempt_data = _make_attempt_data()
        db, cancel_mock, _ = _make_db(cancel_data=attempt_data)
        service = _make_service(db=db)

        await service.create_attempt(ORG_ID, CancelReason.TOO_EXPENSIVE, None)

        cancel_mock.insert.assert_called_once()
        call_args = cancel_mock.insert.call_args[0][0]
        assert call_args["cancel_reason"] == "too_expensive"
        assert call_args["organization_id"] == str(ORG_ID)

    @pytest.mark.asyncio
    async def test_create_attempt_returns_correct_offer_type(self):
        attempt_data = _make_attempt_data(
            reason="missing_feature", offer_shown="feature_roadmap"
        )
        db, _, _ = _make_db(cancel_data=attempt_data)
        service = _make_service(db=db)

        result = await service.create_attempt(
            ORG_ID, CancelReason.MISSING_FEATURE, None
        )

        assert result.offer_shown == SaveOfferType.FEATURE_ROADMAP

    @pytest.mark.asyncio
    async def test_create_attempt_includes_other_text(self):
        attempt_data = _make_attempt_data(reason="other")
        db, cancel_mock, _ = _make_db(cancel_data=attempt_data)
        service = _make_service(db=db)

        await service.create_attempt(ORG_ID, CancelReason.OTHER, "Price is high")

        call_args = cancel_mock.insert.call_args[0][0]
        assert call_args["other_text"] == "Price is high"

    @pytest.mark.asyncio
    async def test_create_attempt_uses_annual_discount_offer(self):
        attempt_data = _make_attempt_data(
            reason="too_expensive", offer_shown="discount_20pct_1inv"
        )
        sub_data = _make_subscription_data()
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        result = await service.create_attempt(ORG_ID, CancelReason.TOO_EXPENSIVE, None)

        assert result.offer_shown == SaveOfferType.DISCOUNT_20PCT_1INV

    @pytest.mark.asyncio
    async def test_create_attempt_non_discount_reason_does_not_check_interval(self):
        attempt_data = _make_attempt_data(
            reason="missing_feature", offer_shown="feature_roadmap"
        )
        db, _, _ = _make_db(cancel_data=attempt_data)
        service = _make_service(db=db)

        result = await service.create_attempt(
            ORG_ID, CancelReason.MISSING_FEATURE, None
        )

        assert result.offer_shown == SaveOfferType.FEATURE_ROADMAP


class TestAcceptOffer:
    @pytest.mark.asyncio
    async def test_accept_offer_applies_stripe_coupon(self):
        attempt_data = _make_attempt_data()
        sub_data = _make_subscription_data()
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with (
            patch("app.services.billing.save_offers.stripe") as mock_stripe,
            patch(
                "app.services.billing.save_offers.get_stripe_settings"
            ) as mock_settings,
        ):
            mock_settings.return_value.stripe_save_offer_coupon_id_annual = (
                "SAVE20_1INV_ANNUAL"
            )

            await service.accept_offer(ATTEMPT_ID, ORG_ID)

            mock_stripe.Subscription.modify.assert_called_once_with(
                "sub_test123",
                coupon="SAVE20_1INV_ANNUAL",
                metadata={"app": "capveri"},
            )

    @pytest.mark.asyncio
    async def test_accept_offer_marks_attempt_accepted(self):
        attempt_data = _make_attempt_data()
        sub_data = _make_subscription_data()
        db, cancel_mock, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with (
            patch("app.services.billing.save_offers.stripe"),
            patch(
                "app.services.billing.save_offers.get_stripe_settings"
            ) as mock_settings,
        ):
            mock_settings.return_value.stripe_save_offer_coupon_id_annual = (
                "SAVE20_1INV_ANNUAL"
            )

            await service.accept_offer(ATTEMPT_ID, ORG_ID)

            cancel_mock.update.assert_called_once_with(
                {"offer_accepted": True, "stripe_coupon_id": "SAVE20_1INV_ANNUAL"}
            )

    @pytest.mark.asyncio
    async def test_accept_offer_fails_when_no_subscription(self):
        attempt_data = _make_attempt_data()
        sub_data = _make_subscription_data(stripe_sub_id=None)
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with pytest.raises(ValueError, match="No active subscription found"):
            await service.accept_offer(ATTEMPT_ID, ORG_ID)

    @pytest.mark.asyncio
    async def test_accept_offer_fails_when_no_coupon_configured(self):
        attempt_data = _make_attempt_data()
        sub_data = _make_subscription_data()
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with patch(
            "app.services.billing.save_offers.get_stripe_settings"
        ) as mock_settings:
            mock_settings.return_value.stripe_save_offer_coupon_id_annual = ""

            with pytest.raises(ValueError, match="Save offer coupon not configured"):
                await service.accept_offer(ATTEMPT_ID, ORG_ID)

    @pytest.mark.asyncio
    async def test_accept_offer_fails_when_attempt_not_found(self):
        db, cancel_mock, _ = _make_db()
        cancel_mock.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )
        service = _make_service(db=db)

        with pytest.raises(ValueError, match="Cancel attempt not found"):
            await service.accept_offer(ATTEMPT_ID, ORG_ID)

    @pytest.mark.asyncio
    async def test_accept_offer_applies_annual_coupon_for_annual_offer(self):
        attempt_data = _make_attempt_data(offer_shown="discount_20pct_1inv")
        sub_data = _make_subscription_data()
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with (
            patch("app.services.billing.save_offers.stripe") as mock_stripe,
            patch(
                "app.services.billing.save_offers.get_stripe_settings"
            ) as mock_settings,
        ):
            mock_settings.return_value.stripe_save_offer_coupon_id_annual = (
                "SAVE20_1INV_ANNUAL"
            )

            await service.accept_offer(ATTEMPT_ID, ORG_ID)

            mock_stripe.Subscription.modify.assert_called_once_with(
                "sub_test123",
                coupon="SAVE20_1INV_ANNUAL",
                metadata={"app": "capveri"},
            )

    @pytest.mark.asyncio
    async def test_accept_offer_rejects_non_discount_offer(self):
        attempt_data = _make_attempt_data(offer_shown="feature_roadmap")
        sub_data = _make_subscription_data()
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with pytest.raises(ValueError, match="does not support coupons"):
            await service.accept_offer(ATTEMPT_ID, ORG_ID)

    @pytest.mark.asyncio
    async def test_accept_offer_handles_empty_coupon_value_from_resolver(self):
        attempt_data = _make_attempt_data()
        sub_data = _make_subscription_data()
        db, _, _ = _make_db(cancel_data=attempt_data, sub_data=sub_data)
        service = _make_service(db=db)

        with patch.object(service, "_coupon_for_offer", return_value=""):
            with pytest.raises(ValueError, match="Save offer coupon not configured"):
                await service.accept_offer(ATTEMPT_ID, ORG_ID)


class TestMarkDeclined:
    @pytest.mark.asyncio
    async def test_mark_declined_updates_attempt(self):
        db, cancel_mock, _ = _make_db()
        service = _make_service(db=db)

        await service.mark_declined(ATTEMPT_ID, ORG_ID)

        cancel_mock.update.assert_called_once_with({"offer_accepted": False})
        cancel_mock.update.return_value.eq.assert_called_with("id", str(ATTEMPT_ID))


class TestInternalHelpers:
    def test_coupon_for_offer_raises_when_annual_coupon_missing(self):
        service = _make_service()
        with patch(
            "app.services.billing.save_offers.get_stripe_settings"
        ) as mock_settings:
            mock_settings.return_value.stripe_save_offer_coupon_id_annual = ""
            with pytest.raises(ValueError, match="Save offer coupon not configured"):
                service._coupon_for_offer(SaveOfferType.DISCOUNT_20PCT_1INV)
