"""
Save offer service for churn prevention.

.. deprecated::
    The save offer flow was designed for the per-building subscription model.
    It is retained for backward compatibility with existing cancel attempts
    in the database. New churn prevention should use the subscription tier
    model. Do not add new functionality here.

Determines which offer to show based on cancellation reason,
tracks cancel attempts, and applies Stripe coupons when offers are accepted.
"""

import logging
from typing import Any, cast
from uuid import UUID

import stripe

from app.database.client import SupabaseDB
from app.models.cancel_attempt import CancelAttempt, CancelReason, SaveOfferType
from app.models.subscription import Subscription
from app.services.billing.config import APP_IDENTIFIER, get_stripe_settings
from app.services.billing.stripe_client import StripeService

logger = logging.getLogger(__name__)

OFFER_MAPPING: dict[CancelReason, SaveOfferType] = {
    CancelReason.TOO_EXPENSIVE: SaveOfferType.DISCOUNT_20PCT_1INV,
    CancelReason.NOT_USING_ENOUGH: SaveOfferType.DISCOUNT_20PCT_1INV,
    CancelReason.MISSING_FEATURE: SaveOfferType.FEATURE_ROADMAP,
    CancelReason.SWITCHING_COMPETITOR: SaveOfferType.DISCOUNT_20PCT_1INV,
    CancelReason.BUSINESS_CLOSED: SaveOfferType.NONE,
    CancelReason.OTHER: SaveOfferType.DISCOUNT_20PCT_1INV,
}


class SaveOfferService:
    """Manages save offers during the cancellation flow."""

    def __init__(self, stripe_service: StripeService, db: SupabaseDB):
        self.stripe = stripe_service
        self.db = db

    async def create_attempt(
        self,
        org_id: UUID,
        reason: CancelReason,
        other_text: str | None,
    ) -> CancelAttempt:
        """
        Record a cancellation attempt and determine the save offer to show.

        Args:
            org_id: Organization attempting to cancel
            reason: Why they're canceling
            other_text: Free-text explanation for 'other' reason

        Returns:
            CancelAttempt with offer_shown populated
        """
        offer_shown = OFFER_MAPPING[reason]

        result = (
            self.db.table("cancel_attempts")
            .insert(
                {
                    "organization_id": str(org_id),
                    "cancel_reason": reason.value,
                    "other_text": other_text,
                    "offer_shown": offer_shown.value,
                }
            )
            .execute()
        )

        return CancelAttempt(**result.data[0])

    async def accept_offer(self, attempt_id: UUID, org_id: UUID) -> Subscription:
        """
        Apply the save offer discount to the Stripe subscription.

        Args:
            attempt_id: The cancel attempt being accepted
            org_id: Organization (for ownership verification)

        Returns:
            Updated subscription

        Raises:
            ValueError: If attempt not found, no subscription, or coupon not configured
        """
        attempt_result = (
            self.db.table("cancel_attempts")
            .select("*")
            .eq("id", str(attempt_id))
            .eq("organization_id", str(org_id))
            .single()
            .execute()
        )

        if not attempt_result.data:
            raise ValueError("Cancel attempt not found")

        sub_result = (
            self.db.table("subscriptions")
            .select("stripe_subscription_id")
            .eq("organization_id", str(org_id))
            .single()
            .execute()
        )

        if not sub_result.data or not sub_result.data.get("stripe_subscription_id"):
            raise ValueError("No active subscription found")

        offer_shown = SaveOfferType(attempt_result.data["offer_shown"])
        coupon_id = self._coupon_for_offer(offer_shown)
        if not coupon_id:
            raise ValueError("Save offer coupon not configured")

        stripe_sub_id = sub_result.data["stripe_subscription_id"]
        cast(Any, stripe.Subscription).modify(
            stripe_sub_id,
            coupon=coupon_id,
            metadata={"app": APP_IDENTIFIER},
        )

        (
            self.db.table("cancel_attempts")
            .update({"offer_accepted": True, "stripe_coupon_id": coupon_id})
            .eq("id", str(attempt_id))
            .eq("organization_id", str(org_id))
            .execute()
        )

        updated_result = (
            self.db.table("subscriptions")
            .select("*")
            .eq("organization_id", str(org_id))
            .single()
            .execute()
        )

        return Subscription(**updated_result.data)

    async def mark_declined(self, attempt_id: UUID, org_id: UUID) -> None:
        """
        Record that the user declined the save offer.

        Args:
            attempt_id: The cancel attempt being declined
            org_id: Organization (for ownership verification)
        """
        (
            self.db.table("cancel_attempts")
            .update({"offer_accepted": False})
            .eq("id", str(attempt_id))
            .eq("organization_id", str(org_id))
            .execute()
        )

    def _coupon_for_offer(self, offer_type: SaveOfferType) -> str:
        """Resolve coupon ID by offer type and validate required config."""
        settings = get_stripe_settings()
        if offer_type == SaveOfferType.DISCOUNT_20PCT_1INV:
            coupon_id = settings.stripe_save_offer_coupon_id_annual
        else:
            raise ValueError(f"Offer type {offer_type.value} does not support coupons")

        if not coupon_id:
            raise ValueError("Save offer coupon not configured")
        return coupon_id
