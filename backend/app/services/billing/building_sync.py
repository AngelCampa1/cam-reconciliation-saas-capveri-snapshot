"""Subscription usage synchronization service."""

import logging
from enum import Enum
from typing import Any, cast
from uuid import UUID

import stripe
from postgrest import CountMethod

from app.database.client import SupabaseDB
from app.models.subscription import Subscription, SubscriptionPricingModel
from app.services.billing.config import get_stripe_settings
from app.services.billing.plans import (
    get_annual_total_cents,
    get_stripe_price_id_for_tier,
)
from app.services.billing.stripe_client import StripeService

logger = logging.getLogger(__name__)


class BillingStatus(str, Enum):
    """Billing status relative to subscribed usage."""

    CURRENT = "current"
    OVER_LIMIT = "over_limit"
    NO_SUBSCRIPTION = "no_subscription"


class BuildingSyncService:
    """Syncs billable building or unit usage between the app and Stripe."""

    def __init__(self, stripe_service: StripeService, db: SupabaseDB):
        self.stripe = stripe_service
        self.db = db

    async def get_building_count(self, organization_id: UUID) -> int:
        """Count properties for an organization."""
        result = (
            self.db.table("properties")
            .select("id", count=CountMethod.exact)
            .eq("organization_id", str(organization_id))
            .execute()
        )
        return result.count or 0

    async def get_billable_unit_count(self, organization_id: UUID) -> int:
        """Count billable rentable units for an organization."""
        properties_result = (
            self.db.table("properties")
            .select("id")
            .eq("organization_id", str(organization_id))
            .execute()
        )
        property_ids = [
            row["id"] for row in properties_result.data or [] if row.get("id")
        ]
        if not property_ids:
            return 0

        result = (
            self.db.table("units")
            .select("id", count=CountMethod.exact)
            .in_("property_id", property_ids)
            .neq("space_type", "outdoor_amenity")
            .neq("space_type", "equipment_shaft")
            .execute()
        )
        return result.count or 0

    async def get_subscription(self, organization_id: UUID) -> Subscription | None:
        """Get subscription for organization."""
        result = (
            self.db.table("subscriptions")
            .select("*")
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )

        if not result or not result.data:
            return None

        data = cast(dict[str, Any], result.data)
        return Subscription(**data)

    async def update_stripe_quantity(
        self, organization_id: UUID, new_count: int
    ) -> None:
        """Update legacy per-building Stripe subscription quantity."""
        if new_count < 1:
            raise ValueError("Building count must be at least 1")

        subscription = await self.get_subscription(organization_id)
        if not subscription:
            raise ValueError("No subscription found for organization")
        if not subscription.stripe_subscription_id:
            raise ValueError("No Stripe subscription ID found")

        stripe_sub = cast(
            Any, stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        )
        items = stripe_sub.get("items", {})
        items_list = items.get("data", []) if isinstance(items, dict) else []
        if not items_list:
            raise ValueError("No subscription items found")

        first_item = items_list[0]
        item_id = (
            first_item.get("id") if isinstance(first_item, dict) else first_item.id
        )
        if not item_id:
            raise ValueError("Subscription item missing ID")

        stripe.SubscriptionItem.modify(
            str(item_id),
            quantity=new_count,
            proration_behavior="create_prorations",
        )
        self.db.table("subscriptions").update({"building_count": new_count}).eq(
            "organization_id", str(organization_id)
        ).execute()

    async def update_unit_overage_quantity(
        self, organization_id: UUID, new_overage_count: int
    ) -> None:
        """Update the recurring unit subscription pricing for changed usage."""
        if new_overage_count < 0:
            raise ValueError("Unit overage count cannot be negative")

        subscription = await self.get_subscription(organization_id)
        if not subscription:
            raise ValueError("No subscription found for organization")
        if not subscription.stripe_subscription_id:
            raise ValueError("No Stripe subscription ID found")

        stripe_sub = cast(
            Any, stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        )
        items = stripe_sub.get("items", {})
        items_list = items.get("data", []) if isinstance(items, dict) else []
        if not items_list:
            raise ValueError("No subscription items found")

        settings = get_stripe_settings()
        overage_price_ids = {
            settings.stripe_price_id_unit_overage_annual,
        }
        overage_item_id: str | None = None
        primary_item_id: str | None = None
        for item in items_list:
            if not isinstance(item, dict):
                continue
            if primary_item_id is None and item.get("id"):
                primary_item_id = str(item.get("id"))
            price = item.get("price", {})
            price_id = price.get("id") if isinstance(price, dict) else None
            if price_id in overage_price_ids:
                overage_item_id = item.get("id")
                break

        included_units = subscription.included_units or 50
        updated_unit_count = included_units + new_overage_count
        if overage_item_id:
            stripe.SubscriptionItem.modify(
                str(overage_item_id),
                quantity=new_overage_count,
                proration_behavior="create_prorations",
            )
        else:
            if not primary_item_id:
                raise ValueError("No unit subscription item found")
            annual_total_cents = get_annual_total_cents("reconcile", updated_unit_count)
            if annual_total_cents is None:
                raise ValueError("No annual Reconcile price configured")
            if updated_unit_count <= included_units:
                stripe.SubscriptionItem.modify(
                    primary_item_id,
                    price=get_stripe_price_id_for_tier("reconcile", annual=True),
                    quantity=1,
                    proration_behavior="create_prorations",
                )
            else:
                price_data: dict[str, Any] = {
                    "currency": "usd",
                    "unit_amount": annual_total_cents,
                    "recurring": {"interval": "year"},
                }
                if settings.stripe_product_id_reconcile:
                    price_data["product"] = settings.stripe_product_id_reconcile
                else:
                    price_data["product_data"] = {
                        "name": "CapVeri Reconcile",
                        "description": (
                            "Annual Reconcile subscription for "
                            f"{updated_unit_count} rentable units"
                        ),
                    }
                stripe.SubscriptionItem.modify(
                    primary_item_id,
                    price_data=cast(Any, price_data),
                    quantity=1,
                    proration_behavior="create_prorations",
                )

        self.db.table("subscriptions").update(
            {
                "unit_count": updated_unit_count,
                "unit_overage_count": new_overage_count,
            }
        ).eq("organization_id", str(organization_id)).execute()

    def _is_credit_pack_subscription(self, sub_data: dict[str, Any]) -> bool:
        """Return True if the subscription uses the credit_pack billing model."""
        return str(sub_data.get("billing_model", "subscription")) == "credit_pack"

    async def check_billing_status(self, organization_id: UUID) -> BillingStatus:
        """Check whether current usage exceeds the subscribed usage limit."""
        subscription = await self.get_subscription(organization_id)
        if not subscription:
            return BillingStatus.NO_SUBSCRIPTION

        if subscription.pricing_model == SubscriptionPricingModel.PER_UNIT:
            actual_count = await self.get_billable_unit_count(organization_id)
            paid_count = subscription.unit_count or 0
        else:
            actual_count = await self.get_building_count(organization_id)
            paid_count = subscription.building_count

        if actual_count <= paid_count:
            return BillingStatus.CURRENT
        return BillingStatus.OVER_LIMIT

    async def sync_building_count(self, organization_id: UUID) -> dict[str, Any]:
        """Sync property count for legacy per-building subscriptions."""
        sub_result = (
            self.db.table("subscriptions")
            .select("billing_model")
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )
        if (
            sub_result
            and sub_result.data
            and self._is_credit_pack_subscription(sub_result.data)
        ):
            new_count = await self.get_building_count(organization_id)
            return {
                "old_count": new_count,
                "new_count": new_count,
                "status": "skipped_credit_pack",
            }

        subscription = await self.get_subscription(organization_id)
        if not subscription:
            raise ValueError("No subscription found for organization")

        old_count = subscription.building_count
        new_count = await self.get_building_count(organization_id)

        if subscription.pricing_model == SubscriptionPricingModel.PER_BUILDING:
            if old_count != new_count:
                await self.update_stripe_quantity(organization_id, new_count)
            status = "synced" if old_count != new_count else "already_synced"
            return {"old_count": old_count, "new_count": new_count, "status": status}

        return {"old_count": old_count, "new_count": new_count, "status": "ignored"}

    async def sync_unit_count(self, organization_id: UUID) -> dict[str, Any]:
        """Sync billable unit count for hybrid per-unit subscriptions."""
        subscription = await self.get_subscription(organization_id)
        if not subscription:
            raise ValueError("No subscription found for organization")

        old_count = subscription.unit_count or 0
        new_count = await self.get_billable_unit_count(organization_id)
        included_units = subscription.included_units or 50
        new_overage_count = max(new_count - included_units, 0)

        if subscription.pricing_model == SubscriptionPricingModel.PER_UNIT:
            if old_count != new_count:
                await self.update_unit_overage_quantity(
                    organization_id, new_overage_count
                )
            status = "synced" if old_count != new_count else "already_synced"
            return {"old_count": old_count, "new_count": new_count, "status": status}

        return {"old_count": old_count, "new_count": new_count, "status": "ignored"}
