"""Promotion domain model for discounts and coupons.

This module defines the Promotion entity for managing promotional codes,
discounts, and coupon redemptions. Supports percentage discounts, fixed
amounts, and trial extensions with flexible eligibility rules stored as JSONB.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DiscountType(str, Enum):
    """Type of discount applied.

    Defines how the discount_value should be interpreted.
    """

    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"
    FREE_TRIAL_EXTENSION = "free_trial_extension"


class PromotionStatus(str, Enum):
    """Current status of a promotion.

    Tracks the lifecycle state of a promotional code.
    """

    ACTIVE = "active"
    EXPIRED = "expired"
    EXHAUSTED = "exhausted"
    DISABLED = "disabled"


class PromotionBase(BaseModel):
    """Base promotion fields shared across DTOs.

    Contains core promotion configuration fields.
    """

    code: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Unique promotion code (auto-uppercased)",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name for the promotion",
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Optional description of the promotion",
    )
    discount_type: DiscountType = Field(
        ...,
        description="How the discount is applied",
    )
    discount_value: Decimal = Field(
        ...,
        gt=0,
        description="Discount amount (percentage or fixed)",
    )
    duration_months: int | None = Field(
        default=None,
        ge=1,
        le=36,
        description="How many months the discount applies",
    )
    max_redemptions: int | None = Field(
        default=None,
        ge=1,
        description="Maximum number of redemptions (None = unlimited)",
    )
    valid_from: datetime = Field(
        ...,
        description="When the promotion becomes valid",
    )
    valid_until: datetime | None = Field(
        default=None,
        description="When the promotion expires",
    )
    eligibility_rules: dict[str, Any] = Field(
        default_factory=dict,
        description="JSONB rules for eligibility (e.g., new_customers_only)",
    )

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, v: str) -> str:
        """Convert promotion code to uppercase."""
        return v.upper()

    @model_validator(mode="after")
    def validate_percentage_range(self) -> "PromotionBase":
        """Ensure percentage discounts don't exceed 100%."""
        if self.discount_type == DiscountType.PERCENTAGE:
            if self.discount_value > Decimal("100"):
                raise ValueError("Percentage discount cannot exceed 100%")
        return self


class PromotionCreate(PromotionBase):
    """DTO for creating a new promotion.

    Used when creating promotional codes with optional Stripe integration.
    """

    stripe_coupon_id: str | None = Field(
        default=None,
        description="Stripe coupon ID for integration",
    )


class PromotionUpdate(BaseModel):
    """DTO for updating an existing promotion.

    All fields are optional - only provided fields are updated.
    Note: code and discount_type cannot be changed after creation.
    """

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Updated display name",
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Updated description",
    )
    max_redemptions: int | None = Field(
        default=None,
        ge=1,
        description="Updated max redemptions",
    )
    valid_until: datetime | None = Field(
        default=None,
        description="Updated expiration date",
    )
    status: PromotionStatus | None = Field(
        default=None,
        description="Updated promotion status",
    )
    eligibility_rules: dict[str, Any] | None = Field(
        default=None,
        description="Updated eligibility rules",
    )


class Promotion(PromotionBase):
    """Full promotion model with all fields.

    Represents a complete promotion record as stored in the database.
    Includes redemption tracking and Stripe integration fields.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(
        ...,
        description="Unique promotion identifier",
    )
    current_redemptions: int = Field(
        default=0,
        ge=0,
        description="Number of times this promotion has been redeemed",
    )
    stripe_coupon_id: str | None = Field(
        default=None,
        description="Stripe coupon ID for integration",
    )
    status: PromotionStatus = Field(
        default=PromotionStatus.ACTIVE,
        description="Current promotion status",
    )
    created_at: datetime = Field(
        ...,
        description="When the promotion was created",
    )
    updated_at: datetime = Field(
        ...,
        description="When the promotion was last updated",
    )


class PromotionRedemption(BaseModel):
    """Record of a promotion being redeemed by an organization.

    Tracks when and by whom a promotion was used.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(
        ...,
        description="Unique redemption identifier",
    )
    promotion_id: UUID = Field(
        ...,
        description="The promotion that was redeemed",
    )
    organization_id: UUID = Field(
        ...,
        description="The organization that redeemed the promotion",
    )
    redeemed_at: datetime = Field(
        ...,
        description="When the redemption occurred",
    )
    stripe_discount_id: str | None = Field(
        default=None,
        description="Stripe discount ID if applicable",
    )


class PromotionSummary(BaseModel):
    """Lightweight promotion view for listings.

    Contains essential promotion info without full details.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique promotion identifier")
    code: str = Field(description="Promotion code")
    name: str = Field(description="Display name")
    discount_type: DiscountType = Field(description="Type of discount")
    discount_value: Decimal = Field(description="Discount amount")
    status: PromotionStatus = Field(description="Current status")
    current_redemptions: int = Field(description="Number of redemptions")
    max_redemptions: int | None = Field(description="Max redemptions allowed")
    valid_until: datetime | None = Field(description="Expiration date")
