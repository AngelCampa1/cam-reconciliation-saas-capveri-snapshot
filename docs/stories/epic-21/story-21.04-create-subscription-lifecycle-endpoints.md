# Story 21.4: Create Subscription Lifecycle Endpoints

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 4
- **Dependencies**: Story 21.3 (Customer Management)
- **Status**: `pending`

## User Story
**As a** customer
**I want** to upgrade, downgrade, and cancel my subscription
**So that** I can manage my billing as my needs change

## Acceptance Criteria
- [ ] **AC1**: GET /billing/subscription returns current subscription
- [ ] **AC2**: POST /billing/subscription/upgrade upgrades plan
- [ ] **AC3**: POST /billing/subscription/downgrade downgrades plan (end of period)
- [ ] **AC4**: POST /billing/subscription/cancel cancels subscription
- [ ] **AC5**: POST /billing/subscription/resume resumes canceled subscription
- [ ] **AC6**: Prorated billing applied on upgrade

## Technical Specifications

**File to Create**: `backend/app/services/billing/subscriptions.py`

```python
"""
Subscription lifecycle management.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

import stripe
from supabase import Client

from app.models.subscription import Subscription, SubscriptionPlan, SubscriptionStatus
from app.services.billing.stripe_client import StripeService
from app.services.billing.plans import PLANS


class SubscriptionService:
    """Manages subscription lifecycle operations."""

    def __init__(self, stripe: StripeService, db: Client):
        self.stripe = stripe
        self.db = db

    async def get_subscription(
        self,
        organization_id: UUID,
    ) -> Optional[Subscription]:
        """Get subscription for organization."""
        result = await self.db.table('subscriptions') \
            .select('*') \
            .eq('organization_id', str(organization_id)) \
            .single() \
            .execute()

        if not result.data:
            return None

        return Subscription(**result.data)

    async def upgrade_subscription(
        self,
        organization_id: UUID,
        new_plan: SubscriptionPlan,
    ) -> Subscription:
        """
        Upgrade subscription to a higher plan.

        Applies prorated billing immediately.
        """
        subscription = await self.get_subscription(organization_id)
        if not subscription:
            raise ValueError("No subscription found")

        if not subscription.stripe_subscription_id:
            # Free plan - need to create Stripe subscription
            raise ValueError("Must use checkout flow for first paid subscription")

        # Get new price ID
        new_plan_details = PLANS[new_plan]
        new_price_id = new_plan_details.stripe_price_id_annual

        # Update Stripe subscription
        stripe_sub = stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            items=[{
                'id': self._get_subscription_item_id(
                    subscription.stripe_subscription_id
                ),
                'price': new_price_id,
            }],
            proration_behavior='create_prorations',  # Bill difference immediately
        )

        # Update local record
        await self.db.table('subscriptions') \
            .update({
                'plan': new_plan.value,
                'updated_at': datetime.utcnow().isoformat(),
            }) \
            .eq('organization_id', str(organization_id)) \
            .execute()

        return await self.get_subscription(organization_id)

    async def downgrade_subscription(
        self,
        organization_id: UUID,
        new_plan: SubscriptionPlan,
    ) -> Subscription:
        """
        Downgrade subscription to a lower plan.

        Change takes effect at end of current billing period.
        """
        subscription = await self.get_subscription(organization_id)
        if not subscription or not subscription.stripe_subscription_id:
            raise ValueError("No active subscription found")

        new_plan_details = PLANS[new_plan]
        new_price_id = new_plan_details.stripe_price_id_annual

        # Schedule downgrade at period end
        stripe_sub = stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            items=[{
                'id': self._get_subscription_item_id(
                    subscription.stripe_subscription_id
                ),
                'price': new_price_id,
            }],
            proration_behavior='none',  # No proration for downgrade
            # This schedules the change for renewal
        )

        return await self.get_subscription(organization_id)

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
            )

            await self.db.table('subscriptions') \
                .update({'cancel_at_period_end': True}) \
                .eq('organization_id', str(organization_id)) \
                .execute()
        else:
            # Cancel immediately
            # NOTE: Stripe uses Subscription.cancel(), NOT Subscription.delete()
            # delete() is for SubscriptionItems, not Subscriptions
            # See: https://docs.stripe.com/api/subscriptions/cancel
            stripe.Subscription.cancel(subscription.stripe_subscription_id)

            await self.db.table('subscriptions') \
                .update({
                    'status': SubscriptionStatus.CANCELED.value,
                    'cancel_at_period_end': False,
                }) \
                .eq('organization_id', str(organization_id)) \
                .execute()

        return await self.get_subscription(organization_id)

    async def resume_subscription(
        self,
        organization_id: UUID,
    ) -> Subscription:
        """Resume a subscription that was scheduled for cancellation."""
        subscription = await self.get_subscription(organization_id)
        if not subscription or not subscription.stripe_subscription_id:
            raise ValueError("No subscription found")

        if not subscription.cancel_at_period_end:
            raise ValueError("Subscription is not scheduled for cancellation")

        # Remove cancellation
        stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            cancel_at_period_end=False,
        )

        await self.db.table('subscriptions') \
            .update({'cancel_at_period_end': False}) \
            .eq('organization_id', str(organization_id)) \
            .execute()

        return await self.get_subscription(organization_id)

    def _get_subscription_item_id(self, subscription_id: str) -> str:
        """Get the subscription item ID for price changes."""
        sub = stripe.Subscription.retrieve(subscription_id)
        return sub['items']['data'][0]['id']
```

**API Endpoints**:

```python
# backend/app/api/routes/billing.py

@router.get("/subscription")
async def get_subscription(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Get current subscription."""
    service = SubscriptionService(stripe, db)
    sub = await service.get_subscription(current_user.organization_id)

    if not sub:
        raise HTTPException(404, "No subscription found")

    return sub


@router.post("/subscription/upgrade")
async def upgrade_subscription(
    new_plan: SubscriptionPlan,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Upgrade to a higher plan."""
    service = SubscriptionService(stripe, db)
    return await service.upgrade_subscription(
        current_user.organization_id,
        new_plan,
    )


@router.post("/subscription/downgrade")
async def downgrade_subscription(
    new_plan: SubscriptionPlan,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Downgrade to a lower plan (at period end)."""
    service = SubscriptionService(stripe, db)
    return await service.downgrade_subscription(
        current_user.organization_id,
        new_plan,
    )


@router.post("/subscription/cancel")
async def cancel_subscription(
    immediate: bool = False,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Cancel subscription."""
    service = SubscriptionService(stripe, db)
    return await service.cancel_subscription(
        current_user.organization_id,
        at_period_end=not immediate,
    )


@router.post("/subscription/resume")
async def resume_subscription(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Resume canceled subscription."""
    service = SubscriptionService(stripe, db)
    return await service.resume_subscription(current_user.organization_id)
```

## Definition of Done
- [ ] All subscription endpoints work
- [ ] Upgrade applies proration
- [ ] Downgrade schedules for period end
- [ ] Cancel respects at_period_end flag
- [ ] Resume works for scheduled cancellations
- [ ] Local database stays in sync
