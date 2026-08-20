# Story 2.15: Create Subscription Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Status**: `completed`
**Estimated Time**: 2 hours
**Dependencies**: Story 2.1 (Core Enums)

## User Story

**As a** developer
**I want** Pydantic and Zod schemas for subscription data
**So that** billing data is type-safe across the stack

## Acceptance Criteria

- [x] **AC1**: Python enums created for:
  - `BillingSubscriptionStatus` (trialing, active, past_due, canceled, paused) - Named to distinguish from organization.SubscriptionStatus
  - `SubscriptionPlan` (free, starter, professional, enterprise)
- [x] **AC2**: TypeScript const objects created with same values
- [x] **AC3**: Pydantic `Subscription` model with fields:
  - `id: UUID`
  - `organization_id: UUID`
  - `stripe_subscription_id: str | None`
  - `stripe_customer_id: str | None`
  - `plan: SubscriptionPlan`
  - `status: BillingSubscriptionStatus`
  - `current_period_start: datetime`
  - `current_period_end: datetime`
  - `cancel_at_period_end: bool`
  - `created_at: datetime`
  - `updated_at: datetime`
- [x] **AC4**: `SubscriptionCreate` and `SubscriptionUpdate` DTOs defined
- [x] **AC5**: Matching Zod schemas in frontend with identical field names
- [x] **AC6**: Unit tests verify schema validation and serialization (46 Python tests, 66 TypeScript tests)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── subscription.py

frontend/src/types/
└── subscription.ts
```

**backend/app/models/subscription.py**:
```python
"""
Subscription domain model for billing management.
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SubscriptionStatus(str, Enum):
    """Current status of a subscription."""
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    PAUSED = "paused"


class SubscriptionPlan(str, Enum):
    """Available subscription plans."""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class SubscriptionBase(BaseModel):
    """Base subscription fields shared across DTOs."""
    plan: SubscriptionPlan
    status: SubscriptionStatus = SubscriptionStatus.TRIALING


class SubscriptionCreate(SubscriptionBase):
    """DTO for creating a new subscription."""
    organization_id: UUID
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    """DTO for updating an existing subscription."""
    plan: Optional[SubscriptionPlan] = None
    status: Optional[SubscriptionStatus] = None
    stripe_subscription_id: Optional[str] = None
    cancel_at_period_end: Optional[bool] = None


class Subscription(SubscriptionBase):
    """Full subscription model with all fields."""
    id: UUID
    organization_id: UUID
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

**frontend/src/types/subscription.ts**:
```typescript
import { z } from 'zod'

export const SubscriptionStatus = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  PAUSED: 'paused',
} as const
export type SubscriptionStatus = typeof SubscriptionStatus[keyof typeof SubscriptionStatus]

export const SubscriptionPlan = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
} as const
export type SubscriptionPlan = typeof SubscriptionPlan[keyof typeof SubscriptionPlan]

export const SubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'paused',
])

export const SubscriptionPlanSchema = z.enum([
  'free',
  'starter',
  'professional',
  'enterprise',
])

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  stripe_subscription_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  plan: SubscriptionPlanSchema,
  status: SubscriptionStatusSchema,
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime(),
  cancel_at_period_end: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Subscription = z.infer<typeof SubscriptionSchema>

export const SubscriptionCreateSchema = z.object({
  organization_id: z.string().uuid(),
  plan: SubscriptionPlanSchema,
  status: SubscriptionStatusSchema.optional().default('trialing'),
  stripe_subscription_id: z.string().nullable().optional(),
  stripe_customer_id: z.string().nullable().optional(),
})

export type SubscriptionCreate = z.infer<typeof SubscriptionCreateSchema>

export const SubscriptionUpdateSchema = z.object({
  plan: SubscriptionPlanSchema.optional(),
  status: SubscriptionStatusSchema.optional(),
  stripe_subscription_id: z.string().nullable().optional(),
  cancel_at_period_end: z.boolean().optional(),
})

export type SubscriptionUpdate = z.infer<typeof SubscriptionUpdateSchema>
```

## Test Cases

```python
# backend/tests/test_subscription_model.py
def test_subscription_status_enum_values():
    """Verify all subscription status values."""
    assert SubscriptionStatus.TRIALING.value == "trialing"
    assert SubscriptionStatus.ACTIVE.value == "active"
    assert len(SubscriptionStatus) == 5

def test_subscription_plan_enum_values():
    """Verify all subscription plan values."""
    assert SubscriptionPlan.FREE.value == "free"
    assert SubscriptionPlan.ENTERPRISE.value == "enterprise"
    assert len(SubscriptionPlan) == 4

def test_subscription_model_serialization():
    """Verify subscription model serializes to JSON correctly."""
    subscription = Subscription(
        id=uuid4(),
        organization_id=uuid4(),
        plan=SubscriptionPlan.PROFESSIONAL,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    json_data = subscription.model_dump_json()
    assert '"plan":"professional"' in json_data
```

## Definition of Done

- [x] All enums defined in both languages
- [x] Values match exactly between Python and TypeScript
- [x] Pydantic models serialize to JSON correctly
- [x] Zod schemas validate backend responses
- [x] Unit tests pass with 100% coverage (subscription.py at 100%)

## Implementation Notes

**Naming Decision**: The status enum is named `BillingSubscriptionStatus` (not `SubscriptionStatus`) to distinguish it from the existing `SubscriptionStatus` enum in `organization.py`. The organization-level enum tracks simple subscription states (active, trial, suspended, cancelled), while the billing-level enum tracks Stripe's subscription states (trialing, active, past_due, canceled, paused).

**Files Created**:
- `backend/app/models/subscription.py` - Pydantic models
- `backend/tests/test_subscription_model.py` - 46 Python tests
- `frontend/src/types/subscription.ts` - Zod schemas and helpers
- `frontend/src/types/__tests__/subscription.test.ts` - 66 TypeScript tests

**Additional Features Implemented**:
- `SubscriptionSummary` model for lightweight listings
- Helper functions: `isValidBillingSubscriptionStatus`, `isValidSubscriptionPlan`, `getPlanDisplayName`, `getBillingStatusDisplayName`, `isSubscriptionActive`, `requiresPaymentAction`
