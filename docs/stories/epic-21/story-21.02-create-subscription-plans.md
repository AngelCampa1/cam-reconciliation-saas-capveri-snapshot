# Story 21.2: Create Subscription Plans

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 2
- **Dependencies**: Story 21.1 (Stripe Client)
- **Status**: `pending`

## User Story
**As a** product owner
**I want** subscription plans defined in Stripe and the codebase
**So that** customers can choose their billing tier

## Acceptance Criteria
- [ ] **AC1**: Four plans defined: Reconcile, Control, Defend, Enterprise
- [ ] **AC2**: Plans created in Stripe Dashboard with correct pricing
- [ ] **AC3**: Plan metadata includes feature limits
- [ ] **AC4**: Backend can retrieve and validate plan details
- [ ] **AC5**: Frontend has plan definitions for display

## Technical Specifications

### Stripe Dashboard Setup

Create the following Products and Prices in Stripe:

| Product | Annual Price ID | Annual | Features |
|---------|-----------------|--------|----------|
| Reconcile | price_reconcile_annual | $4,990 | Up to 50 active rentable units |
| Control | price_control_annual | $4,990 | Up to 250 active rentable units |
| Defend | price_defend_annual | $4,990 | Up to 500 active rentable units |
| Enterprise | price_enterprise | Custom | White-label |

**Product Metadata**:
```json
{
  "max_properties": "1",
  "max_users": "2",
  "features": "basic_reconciliation",
  "support_level": "community"
}
```

### Backend Plan Definitions

**File to Create**: `backend/app/services/billing/plans.py`

```python
"""
Subscription plan definitions and feature limits.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from app.models.subscription import SubscriptionPlan


@dataclass(frozen=True)
class PlanFeatures:
    """Feature limits for a subscription plan."""
    max_properties: int
    max_users: int
    reconciliation: bool
    historical_analysis: bool
    export_formats: list[str]
    api_access: bool
    white_label: bool
    dedicated_support: bool


@dataclass(frozen=True)
class PlanDetails:
    """Complete plan definition."""
    plan: SubscriptionPlan
    name: str
    description: str
    annual_price: Decimal
    stripe_price_id_annual: Optional[str]
    features: PlanFeatures
    popular: bool = False


# Plan definitions
PLANS: dict[SubscriptionPlan, PlanDetails] = {
    SubscriptionPlan.RECONCILE: PlanDetails(
        plan=SubscriptionPlan.RECONCILE,
        name="Reconcile",
        description="For CAM reconciliation workflows",
        annual_price=Decimal("6990"),
        stripe_price_id_annual="price_reconcile_annual",
        features=PlanFeatures(
            max_properties=5,
            max_users=5,
            reconciliation=True,
            historical_analysis=True,
            export_formats=["pdf", "excel"],
            api_access=False,
            white_label=False,
            dedicated_support=False,
        ),
    ),
    SubscriptionPlan.CONTROL: PlanDetails(
        plan=SubscriptionPlan.CONTROL,
        name="Control",
        description="For portfolio controls and reporting",
        annual_price=Decimal("17490"),
        stripe_price_id_annual="price_control_annual",
        features=PlanFeatures(
            max_properties=-1,  # Unlimited
            max_users=-1,
            reconciliation=True,
            historical_analysis=True,
            export_formats=["pdf", "excel", "csv"],
            api_access=True,
            white_label=False,
            dedicated_support=False,
        ),
        popular=True,
    ),
    SubscriptionPlan.DEFEND: PlanDetails(
        plan=SubscriptionPlan.DEFEND,
        name="Defend",
        description="For tenant-facing audit defense",
        annual_price=Decimal("34990"),
        stripe_price_id_annual="price_defend_annual",
        features=PlanFeatures(
            max_properties=50,
            max_users=-1,
            reconciliation=True,
            historical_analysis=True,
            export_formats=["pdf", "excel", "csv"],
            api_access=True,
            white_label=False,
            dedicated_support=True,
        ),
    ),
    SubscriptionPlan.ENTERPRISE: PlanDetails(
        plan=SubscriptionPlan.ENTERPRISE,
        name="Enterprise",
        description="Custom solutions for large portfolios",
        annual_price=Decimal("0"),
        stripe_price_id_annual=None,
        features=PlanFeatures(
            max_properties=-1,
            max_users=-1,
            reconciliation=True,
            historical_analysis=True,
            export_formats=["pdf", "excel", "csv", "api"],
            api_access=True,
            white_label=True,
            dedicated_support=True,
        ),
    ),
}


def get_plan_details(plan: SubscriptionPlan) -> PlanDetails:
    """Get details for a subscription plan."""
    return PLANS[plan]


def can_use_feature(plan: SubscriptionPlan, feature: str) -> bool:
    """Check if a plan has access to a feature."""
    details = PLANS[plan]
    return getattr(details.features, feature, False)


def check_property_limit(plan: SubscriptionPlan, current_count: int) -> bool:
    """Check if adding a property is allowed."""
    limit = PLANS[plan].features.max_properties
    return limit == -1 or current_count < limit
```

### Frontend Plan Definitions

**File to Create**: `frontend/src/config/plans.ts`

```typescript
export interface PlanFeatures {
  maxProperties: number  // -1 = unlimited
  maxUsers: number
  reconciliation: boolean
  historicalAnalysis: boolean
  exportFormats: string[]
  apiAccess: boolean
  whiteLabel: boolean
  dedicatedSupport: boolean
}

export interface Plan {
  id: 'reconcile' | 'control' | 'defend' | 'enterprise'
  name: string
  description: string
  annualPrice: number
  features: PlanFeatures
  popular?: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'reconcile',
    name: 'Reconcile',
    description: 'For focused CAM reconciliation',
    annualPrice: 6990,
    features: {
      maxProperties: 1,
      maxUsers: 2,
      reconciliation: true,
      historicalAnalysis: false,
      exportFormats: ['pdf'],
      apiAccess: false,
      whiteLabel: false,
      dedicatedSupport: false,
    },
  },
  {
    id: 'control',
    name: 'Control',
    description: 'For portfolio controls',
    annualPrice: 17490,
    features: {
      maxProperties: 5,
      maxUsers: 5,
      reconciliation: true,
      historicalAnalysis: true,
      exportFormats: ['pdf', 'excel'],
      apiAccess: false,
      whiteLabel: false,
      dedicatedSupport: false,
    },
  },
  {
    id: 'defend',
    name: 'Defend',
    description: 'For tenant-facing audit defense',
    annualPrice: 34990,
    features: {
      maxProperties: -1,
      maxUsers: -1,
      reconciliation: true,
      historicalAnalysis: true,
      exportFormats: ['pdf', 'excel', 'csv'],
      apiAccess: true,
      whiteLabel: false,
      dedicatedSupport: false,
    },
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large portfolios',
    annualPrice: 0,
    features: {
      maxProperties: -1,
      maxUsers: -1,
      reconciliation: true,
      historicalAnalysis: true,
      exportFormats: ['pdf', 'excel', 'csv', 'api'],
      apiAccess: true,
      whiteLabel: true,
      dedicatedSupport: true,
    },
  },
]
```

## Definition of Done
- [ ] Plans created in Stripe Dashboard
- [ ] Backend plan definitions complete
- [ ] Frontend plan config complete
- [ ] Feature limit checks work
- [ ] Price IDs configured in environment
