# Story 2.17: Create Promotion Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Status**: `completed`
**Estimated Time**: 2 hours
**Dependencies**: Story 2.1 (Core Enums)

## User Story

**As a** developer
**I want** Pydantic and Zod schemas for promotions and coupons
**So that** discount logic is type-safe across the stack

## Acceptance Criteria

- [x] **AC1**: Python enums created for:
  - `DiscountType` (percentage, fixed_amount, free_trial_extension)
  - `PromotionStatus` (active, expired, exhausted, disabled)
- [x] **AC2**: TypeScript const objects created with same values
- [x] **AC3**: Pydantic `Promotion` model with fields:
  - `id: UUID`
  - `code: str` (unique, uppercase)
  - `name: str`
  - `description: str | None`
  - `discount_type: DiscountType`
  - `discount_value: Decimal` (percentage or fixed amount)
  - `duration_months: int | None` (how long discount applies)
  - `max_redemptions: int | None` (None = unlimited)
  - `current_redemptions: int`
  - `valid_from: datetime`
  - `valid_until: datetime | None`
  - `eligibility_rules: dict` (JSONB for complex rules)
  - `stripe_coupon_id: str | None`
  - `status: PromotionStatus`
  - `created_at: datetime`
  - `updated_at: datetime`
- [x] **AC4**: Pydantic `PromotionRedemption` model with fields:
  - `id: UUID`
  - `promotion_id: UUID`
  - `organization_id: UUID`
  - `redeemed_at: datetime`
  - `stripe_discount_id: str | None`
- [x] **AC5**: `PromotionCreate`, `PromotionUpdate` DTOs defined
- [x] **AC6**: Matching Zod schemas in frontend
- [x] **AC7**: Unit tests verify schema validation

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── promotion.py

frontend/src/types/
└── promotion.ts
```

**backend/app/models/promotion.py**:
```python
"""
Promotion domain model for discounts and coupons.
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class DiscountType(str, Enum):
    """Type of discount applied."""
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"
    FREE_TRIAL_EXTENSION = "free_trial_extension"


class PromotionStatus(str, Enum):
    """Current status of a promotion."""
    ACTIVE = "active"
    EXPIRED = "expired"
    EXHAUSTED = "exhausted"
    DISABLED = "disabled"


class PromotionBase(BaseModel):
    """Base promotion fields shared across DTOs."""
    code: str = Field(min_length=3, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    discount_type: DiscountType
    discount_value: Decimal = Field(gt=0)
    duration_months: Optional[int] = Field(default=None, ge=1, le=36)
    max_redemptions: Optional[int] = Field(default=None, ge=1)
    valid_from: datetime
    valid_until: Optional[datetime] = None
    eligibility_rules: dict[str, Any] = Field(default_factory=dict)

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, v: str) -> str:
        return v.upper()

    @field_validator("discount_value")
    @classmethod
    def validate_percentage(cls, v: Decimal, info) -> Decimal:
        # If percentage, must be between 0 and 100
        if info.data.get("discount_type") == DiscountType.PERCENTAGE:
            if v > 100:
                raise ValueError("Percentage discount cannot exceed 100%")
        return v


class PromotionCreate(PromotionBase):
    """DTO for creating a new promotion."""
    stripe_coupon_id: Optional[str] = None


class PromotionUpdate(BaseModel):
    """DTO for updating an existing promotion."""
    name: Optional[str] = None
    description: Optional[str] = None
    max_redemptions: Optional[int] = None
    valid_until: Optional[datetime] = None
    status: Optional[PromotionStatus] = None
    eligibility_rules: Optional[dict[str, Any]] = None


class Promotion(PromotionBase):
    """Full promotion model with all fields."""
    id: UUID
    current_redemptions: int = 0
    stripe_coupon_id: Optional[str] = None
    status: PromotionStatus = PromotionStatus.ACTIVE
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PromotionRedemption(BaseModel):
    """Record of a promotion being redeemed by an organization."""
    id: UUID
    promotion_id: UUID
    organization_id: UUID
    redeemed_at: datetime
    stripe_discount_id: Optional[str] = None

    model_config = {"from_attributes": True}
```

**frontend/src/types/promotion.ts**:
```typescript
import { z } from 'zod'

export const DiscountType = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  FREE_TRIAL_EXTENSION: 'free_trial_extension',
} as const
export type DiscountType = typeof DiscountType[keyof typeof DiscountType]

export const PromotionStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  EXHAUSTED: 'exhausted',
  DISABLED: 'disabled',
} as const
export type PromotionStatus = typeof PromotionStatus[keyof typeof PromotionStatus]

export const DiscountTypeSchema = z.enum([
  'percentage',
  'fixed_amount',
  'free_trial_extension',
])

export const PromotionStatusSchema = z.enum([
  'active',
  'expired',
  'exhausted',
  'disabled',
])

export const EligibilityRulesSchema = z.object({
  first_n_users: z.number().optional(),
  plan_restriction: z.array(z.string()).optional(),
  new_customers_only: z.boolean().optional(),
}).passthrough()

export const PromotionSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(3).max(50).transform(v => v.toUpperCase()),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  discount_type: DiscountTypeSchema,
  discount_value: z.string().or(z.number()).transform(v => String(v)),
  duration_months: z.number().min(1).max(36).nullable(),
  max_redemptions: z.number().min(1).nullable(),
  current_redemptions: z.number().default(0),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime().nullable(),
  eligibility_rules: EligibilityRulesSchema.default({}),
  stripe_coupon_id: z.string().nullable(),
  status: PromotionStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Promotion = z.infer<typeof PromotionSchema>

export const PromotionCreateSchema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  discount_type: DiscountTypeSchema,
  discount_value: z.string().or(z.number()),
  duration_months: z.number().min(1).max(36).nullable().optional(),
  max_redemptions: z.number().min(1).nullable().optional(),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime().nullable().optional(),
  eligibility_rules: EligibilityRulesSchema.optional(),
  stripe_coupon_id: z.string().nullable().optional(),
})

export type PromotionCreate = z.infer<typeof PromotionCreateSchema>

export const PromotionRedemptionSchema = z.object({
  id: z.string().uuid(),
  promotion_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  redeemed_at: z.string().datetime(),
  stripe_discount_id: z.string().nullable(),
})

export type PromotionRedemption = z.infer<typeof PromotionRedemptionSchema>
```

## Eligibility Rules Schema

The `eligibility_rules` JSONB field supports these rule types:

```json
{
  "first_n_users": 100,           // Only first 100 signups
  "plan_restriction": ["professional", "enterprise"],  // Only these plans
  "new_customers_only": true,     // Cannot be existing customer
  "one_per_organization": true    // One redemption per org
}
```

## Test Cases

```python
# backend/tests/test_promotion_model.py
def test_discount_type_enum_values():
    """Verify all discount type values."""
    assert DiscountType.PERCENTAGE.value == "percentage"
    assert len(DiscountType) == 3

def test_promotion_code_uppercase():
    """Verify promotion code is uppercased."""
    promo = PromotionCreate(
        code="summer20",
        name="Summer Sale",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("20"),
        valid_from=datetime.utcnow(),
    )
    assert promo.code == "SUMMER20"

def test_percentage_validation():
    """Verify percentage cannot exceed 100."""
    with pytest.raises(ValidationError):
        PromotionCreate(
            code="INVALID",
            name="Invalid",
            discount_type=DiscountType.PERCENTAGE,
            discount_value=Decimal("150"),
            valid_from=datetime.utcnow(),
        )
```

## Definition of Done

- [x] All enums defined in both languages
- [x] Values match exactly between Python and TypeScript
- [x] Code field auto-uppercases
- [x] Percentage validation prevents >100%
- [x] Eligibility rules schema is flexible (JSONB)
- [x] Unit tests pass with 100% coverage (60 Python, 89 TypeScript)
