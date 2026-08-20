"""Subscription domain model for billing management.

This module defines the Subscription entity for Stripe billing integration.
The SubscriptionStatus here represents Stripe's subscription states, which
is distinct from the simpler OrganizationSubscriptionStatus used for
organization-level subscription tracking.
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BillingSubscriptionStatus(str, Enum):
    """Current status of a Stripe subscription.

    These values align with Stripe's subscription status values.
    Note: This is distinct from organization.SubscriptionStatus which
    represents the organization's overall subscription state.
    """

    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    PAUSED = "paused"


class SubscriptionPlan(str, Enum):
    """Available subscription plans.

    Defines the tier of service available to an organization.

    Canonical package IDs after the 2026-04 workflow-tier refresh are stored
    in subscription metadata. This legacy plan column continues to use
    GROWTH_V2 for self-serve subscriptions and ENTERPRISE for custom accounts.

    Legacy values retained for backward compat with existing DB rows
    (all resolve through compatibility entitlements):
    - PORTFOLIO: legacy portfolio subscription tier
    - ESSENTIALS: legacy flat model
    - PROFESSIONAL: legacy flat model
    - GROWTH: deprecated alias for professional
    """

    # Canonical legacy plan values used by current package subscriptions
    GROWTH_V2 = "growth_v2"
    ENTERPRISE = "enterprise"
    # Legacy values — kept for backward compat; collapse to growth in entitlements.py
    PORTFOLIO = "portfolio"
    ESSENTIALS = "essentials"
    PROFESSIONAL = "professional"
    GROWTH = "growth"  # Deprecated alias for professional
    STARTER = "starter"  # Deprecated flat-tier legacy value
    PRO = "pro"  # Deprecated flat-tier legacy value
    BUSINESS = "business"  # Deprecated flat-tier legacy value


class SubscriptionPricingModel(str, Enum):
    """Pricing metric used for a subscription."""

    PER_BUILDING = "per_building"
    PER_UNIT = "per_unit"
    CREDIT_PACK = "credit_pack"


class SubscriptionBase(BaseModel):
    """Base subscription fields shared across DTOs.

    Contains the minimal fields required for subscription operations.
    """

    plan: SubscriptionPlan = Field(
        ...,
        description=(
            "The subscription plan tier. "
            "Current values: growth_v2, enterprise. "
            "Legacy values (backward compat): "
            "portfolio, essentials, professional, growth."
        ),
    )
    status: BillingSubscriptionStatus = Field(
        default=BillingSubscriptionStatus.TRIALING,
        description="Current billing status from Stripe",
    )
    pricing_model: SubscriptionPricingModel = Field(
        default=SubscriptionPricingModel.PER_BUILDING,
        description="Billing metric used for this subscription",
    )
    building_count: int = Field(
        default=1,
        ge=1,
        description="Number of buildings in subscription (for per-building pricing)",
    )
    unit_count: int | None = Field(
        default=None,
        ge=1,
        description="Number of rentable units included in the subscription snapshot",
    )
    included_units: int | None = Field(
        default=None,
        ge=0,
        description="Number of units included before overage billing begins",
    )
    unit_overage_count: int | None = Field(
        default=None,
        ge=0,
        description="Billable units above the included unit threshold",
    )


class SubscriptionCreate(SubscriptionBase):
    """DTO for creating a new subscription.

    Used when setting up a new billing subscription for an organization.
    Stripe IDs are optional as they may be set after Stripe webhook.
    """

    organization_id: UUID = Field(
        ...,
        description="Organization this subscription belongs to",
    )
    stripe_subscription_id: str | None = Field(
        None,
        description="Stripe subscription ID (sub_xxx)",
    )
    stripe_customer_id: str | None = Field(
        None,
        description="Stripe customer ID (cus_xxx)",
    )


class SubscriptionUpdate(BaseModel):
    """DTO for updating an existing subscription.

    All fields are optional - only provided fields are updated.
    """

    plan: SubscriptionPlan | None = Field(
        None,
        description="New subscription plan tier",
    )
    status: BillingSubscriptionStatus | None = Field(
        None,
        description="New billing status",
    )
    stripe_subscription_id: str | None = Field(
        None,
        description="Stripe subscription ID (sub_xxx)",
    )
    cancel_at_period_end: bool | None = Field(
        None,
        description="Whether to cancel at end of current period",
    )
    pricing_model: SubscriptionPricingModel | None = Field(
        None,
        description="Billing metric used for this subscription",
    )
    building_count: int | None = Field(
        None,
        ge=1,
        description="Number of buildings in subscription",
    )
    unit_count: int | None = Field(
        None,
        ge=1,
        description="Number of rentable units in subscription",
    )
    included_units: int | None = Field(
        None,
        ge=0,
        description="Included units before overage billing",
    )
    unit_overage_count: int | None = Field(
        None,
        ge=0,
        description="Units billed as overage",
    )


class Subscription(SubscriptionBase):
    """Full subscription model with all fields.

    Represents a complete subscription record as stored in the database.
    Includes all billing period information and Stripe integration fields.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(
        ...,
        description="Unique subscription identifier",
    )
    organization_id: UUID = Field(
        ...,
        description="Organization this subscription belongs to",
    )
    stripe_subscription_id: str | None = Field(
        None,
        description="Stripe subscription ID (sub_xxx)",
    )
    stripe_customer_id: str | None = Field(
        None,
        description="Stripe customer ID (cus_xxx)",
    )
    current_period_start: datetime = Field(
        ...,
        description="Start of the current billing period",
    )
    current_period_end: datetime = Field(
        ...,
        description="End of the current billing period",
    )
    cancel_at_period_end: bool = Field(
        default=False,
        description="Whether subscription will cancel at period end",
    )
    created_at: datetime = Field(
        ...,
        description="When the subscription was created",
    )
    updated_at: datetime = Field(
        ...,
        description="When the subscription was last updated",
    )
    money_back_claimed_at: datetime | None = Field(
        None,
        description="When the money-back guarantee was claimed (None if not claimed)",
    )
    money_back_refund_id: str | None = Field(
        None,
        description="Stripe refund ID (rf_xxx) for the money-back guarantee",
    )


class CreditBalance(BaseModel):
    """Aggregated credit balance across all packs for an organization."""

    total_purchased: int = Field(0, description="Sum of all credits purchased")
    total_used: int = Field(0, description="Sum of all credits consumed")
    total_remaining: int = Field(0, description="Credits remaining = purchased - used")


class CreditPack(BaseModel):
    """A single prepaid audit credit pack purchase."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique pack identifier")
    organization_id: UUID = Field(description="Organization this pack belongs to")
    credits_purchased: int = Field(description="Number of credits purchased")
    credits_used: int = Field(description="Number of credits consumed")
    credits_remaining: int = Field(description="Credits available for use")
    unit_price_cents: int = Field(description="Price per audit credit in cents")
    stripe_payment_intent_id: str | None = Field(None)
    stripe_checkout_session_id: str | None = Field(None)
    purchased_at: datetime = Field(description="When this pack was purchased")


class SubscriptionSummary(BaseModel):
    """Lightweight subscription view for listings.

    Contains essential subscription info without full details.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique subscription identifier")
    organization_id: UUID = Field(description="Organization ID")
    plan: SubscriptionPlan = Field(description="Current plan tier")
    status: BillingSubscriptionStatus = Field(description="Billing status")
    pricing_model: SubscriptionPricingModel = Field(
        default=SubscriptionPricingModel.PER_BUILDING,
        description="Billing metric",
    )
    building_count: int = Field(description="Number of buildings in subscription")
    unit_count: int | None = Field(
        default=None,
        description="Number of rentable units in subscription",
    )
    included_units: int | None = Field(
        default=None,
        description="Included units before overage",
    )
    unit_overage_count: int | None = Field(
        default=None,
        description="Units billed as overage",
    )
    current_period_end: datetime = Field(description="When current period ends")
    cancel_at_period_end: bool = Field(description="Will cancel at period end")
