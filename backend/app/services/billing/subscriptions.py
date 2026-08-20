"""
Subscription lifecycle management.
"""

import logging
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

import stripe

from app.database.client import SupabaseDB
from app.models.subscription import (
    BillingSubscriptionStatus,
    Subscription,
    SubscriptionPlan,
)
from app.services.billing.config import APP_IDENTIFIER
from app.services.billing.generated_plan_tiers import TRIAL_DAYS
from app.services.billing.plans import get_stripe_price_id_for_tier
from app.services.billing.stripe_client import StripeService

logger = logging.getLogger(__name__)


def _plan_to_tier_id(plan: SubscriptionPlan) -> str:
    """Map a ``SubscriptionPlan`` enum value to a canonical tier id.

    The DB's ``SubscriptionPlan`` enum still carries legacy values for existing
    subscription rows. Reconcile is the only active Stripe-backed tier.
    """
    return "reconcile"


class SubscriptionService:
    """Manages subscription lifecycle operations."""

    def __init__(self, stripe_service: StripeService, db: SupabaseDB):
        self.stripe = stripe_service
        self.db = db

    async def get_subscription(
        self,
        organization_id: UUID,
    ) -> Subscription | None:
        """Get subscription for organization."""
        result = (
            self.db.table("subscriptions")
            .select("*")
            .eq("organization_id", str(organization_id))
            .single()
            .execute()
        )

        if not result.data:
            return None

        data = cast(dict[str, Any], result.data)
        return Subscription(**data)

    async def create_trial_subscription(
        self,
        organization_id: UUID,
        tier_id: str,
        stripe_customer_id: str,
    ) -> Subscription:
        """Create a Stripe subscription with a free trial period.

        Creates a subscription in Stripe with a trial period defined by
        ``TRIAL_DAYS`` (from plan-tiers.json). The local DB row is created
        with status=trialing and the new tier recorded.

        Args:
            organization_id: Organization to create the subscription for.
            tier_id: Subscription tier. Must be ``reconcile``.
            stripe_customer_id: Pre-existing Stripe customer ID (cus_xxx).

        Returns:
            The newly created Subscription.
        """
        if tier_id != "reconcile":
            raise ValueError("Reconcile is the only active subscription tier")
        price_id = get_stripe_price_id_for_tier(tier_id)

        stripe_sub = stripe.Subscription.create(
            customer=stripe_customer_id,
            items=[{"price": price_id}],
            trial_period_days=TRIAL_DAYS,
            payment_settings={
                "save_default_payment_method": "on_subscription",
            },
            metadata={
                "app": APP_IDENTIFIER,
                "organization_id": str(organization_id),
                "tier": tier_id,
            },
        )

        stripe_sub_dict = cast(dict[str, Any], stripe_sub)
        stripe_sub_id = str(stripe_sub_dict["id"])
        trial_start = datetime.fromtimestamp(stripe_sub_dict["trial_start"], tz=UTC)
        trial_end = datetime.fromtimestamp(stripe_sub_dict["trial_end"], tz=UTC)

        # The DB plan column remains on the legacy growth_v2 value while
        # Stripe and tier metadata use the active Reconcile subscription.
        plan_value = SubscriptionPlan.GROWTH_V2.value

        now = datetime.now(UTC).isoformat()
        row = {
            "organization_id": str(organization_id),
            "plan": plan_value,
            "tier": tier_id,
            "status": BillingSubscriptionStatus.TRIALING.value,
            "billing_model": "subscription",
            "stripe_subscription_id": stripe_sub_id,
            "stripe_customer_id": stripe_customer_id,
            "current_period_start": trial_start.isoformat(),
            "current_period_end": trial_end.isoformat(),
            "cancel_at_period_end": False,
            "created_at": now,
            "updated_at": now,
        }

        result = self.db.table("subscriptions").insert(row).execute()
        return Subscription(**result.data[0])

    async def upgrade_subscription(
        self,
        organization_id: UUID,
        new_plan: SubscriptionPlan,
    ) -> Subscription:
        """
        Upgrade subscription to a higher plan.

        Applies prorated billing immediately.
        """
        raise ValueError(
            "Plan changes are no longer supported. Reconcile is the only active "
            "subscription; use checkout to update rentable unit count."
        )

    async def downgrade_subscription(
        self,
        organization_id: UUID,
        new_plan: SubscriptionPlan,
    ) -> Subscription:
        """
        Downgrade subscription to a lower plan.

        Change takes effect at end of current billing period.
        """
        raise ValueError(
            "Plan changes are no longer supported. Reconcile is the only active "
            "subscription; use checkout to update rentable unit count."
        )

    async def cancel_subscription(
        self,
        organization_id: UUID,
        at_period_end: bool = True,
    ) -> Subscription:
        """
        Cancel subscription.

        Default: Access until end of paid period.
        Immediate: Cancels now with prorated refund.
        """
        subscription = await self.get_subscription(organization_id)
        if not subscription or not subscription.stripe_subscription_id:
            raise ValueError("No active subscription found")

        if at_period_end:
            # Cancel at period end (default)
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=True,
                # Stripe merges metadata; only the app key needs refreshing here
                metadata={"app": APP_IDENTIFIER},
            )

            self.db.table("subscriptions").update({"cancel_at_period_end": True}).eq(
                "organization_id", str(organization_id)
            ).execute()
        else:
            # Cancel immediately
            stripe.Subscription.delete(subscription.stripe_subscription_id)  # type: ignore[arg-type]

            self.db.table("subscriptions").update(
                {
                    "status": BillingSubscriptionStatus.CANCELED.value,
                    "cancel_at_period_end": False,
                }
            ).eq("organization_id", str(organization_id)).execute()

        updated_sub = await self.get_subscription(organization_id)
        if not updated_sub:
            raise ValueError("Failed to retrieve updated subscription")
        return updated_sub

    async def resume_subscription(
        self,
        organization_id: UUID,
    ) -> Subscription:
        """Resume a subscription that is paused or canceling at period end."""
        subscription = await self.get_subscription(organization_id)
        if not subscription or not subscription.stripe_subscription_id:
            raise ValueError("No subscription found")

        if subscription.status == BillingSubscriptionStatus.PAUSED:
            try:
                resumed = cast(
                    dict[str, Any],
                    stripe.Subscription.resume(
                        subscription.stripe_subscription_id,
                        billing_cycle_anchor="now",
                    ),
                )
            except stripe.error.StripeError as exc:
                raise ValueError(
                    "Add a valid payment method before resuming access"
                ) from exc

            update_data: dict[str, Any] = {
                "status": str(resumed.get("status", subscription.status.value)),
                "cancel_at_period_end": bool(
                    resumed.get("cancel_at_period_end", False)
                ),
                "updated_at": datetime.now(UTC).isoformat(),
            }

            current_period_start = resumed.get("current_period_start")
            if current_period_start:
                update_data["current_period_start"] = datetime.fromtimestamp(
                    int(current_period_start), tz=UTC
                ).isoformat()

            current_period_end = resumed.get("current_period_end")
            if current_period_end:
                update_data["current_period_end"] = datetime.fromtimestamp(
                    int(current_period_end), tz=UTC
                ).isoformat()

            self.db.table("subscriptions").update(update_data).eq(
                "organization_id", str(organization_id)
            ).execute()
        else:
            if not subscription.cancel_at_period_end:
                raise ValueError(
                    "Subscription is not paused or scheduled for cancellation"
                )

            # Remove cancellation
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=False,
                # Stripe merges metadata; only the app key needs refreshing here
                metadata={"app": APP_IDENTIFIER},
            )

            self.db.table("subscriptions").update(
                {
                    "cancel_at_period_end": False,
                    "updated_at": datetime.now(UTC).isoformat(),
                }
            ).eq("organization_id", str(organization_id)).execute()

        updated_sub = await self.get_subscription(organization_id)
        if not updated_sub:
            raise ValueError("Failed to retrieve updated subscription")
        return updated_sub

    def _get_subscription_item_id(self, subscription_id: str) -> str:
        """Get the subscription item ID for price changes."""
        sub = cast(Any, stripe.Subscription.retrieve(subscription_id))
        return str(sub["items"]["data"][0]["id"])
