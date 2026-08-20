# Story 21.5: Create Payment Method Management

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 3
- **Dependencies**: Story 21.3 (Customer Management)
- **Status**: `pending`

## User Story
**As a** customer
**I want** to manage my payment methods
**So that** I can update my card and ensure payments succeed

## Acceptance Criteria
- [ ] **AC1**: List all payment methods for customer
- [ ] **AC2**: Add new payment method via Stripe Elements
- [ ] **AC3**: Set default payment method
- [ ] **AC4**: Remove payment method (if not only one)
- [ ] **AC5**: Redirect to Stripe Customer Portal for complex cases

## Technical Specifications

**Backend Service**:

```python
# backend/app/services/billing/payment_methods.py
"""
Payment method management service.
"""
from typing import Optional
from uuid import UUID

import stripe
from supabase import Client

from app.services.billing.stripe_client import StripeService


class PaymentMethodService:
    """Manages customer payment methods."""

    def __init__(self, stripe: StripeService, db: Client):
        self.stripe = stripe
        self.db = db

    async def list_payment_methods(
        self,
        customer_id: str,
    ) -> list[dict]:
        """List all payment methods for a customer."""
        methods = stripe.PaymentMethod.list(
            customer=customer_id,
            type="card",
        )

        return [
            {
                "id": pm.id,
                "brand": pm.card.brand,
                "last4": pm.card.last4,
                "exp_month": pm.card.exp_month,
                "exp_year": pm.card.exp_year,
                "is_default": pm.id == self._get_default_payment_method(customer_id),
            }
            for pm in methods.data
        ]

    async def create_setup_intent(
        self,
        customer_id: str,
    ) -> str:
        """
        Create a SetupIntent for adding a new payment method.

        Returns client_secret for Stripe Elements.
        """
        setup_intent = stripe.SetupIntent.create(
            customer=customer_id,
            payment_method_types=["card"],
        )
        return setup_intent.client_secret

    async def set_default_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
    ) -> None:
        """Set the default payment method for a customer."""
        stripe.Customer.modify(
            customer_id,
            invoice_settings={
                "default_payment_method": payment_method_id,
            },
        )

    async def remove_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
    ) -> None:
        """
        Remove a payment method.

        Raises error if it's the only payment method.
        """
        methods = await self.list_payment_methods(customer_id)

        if len(methods) <= 1:
            raise ValueError("Cannot remove the only payment method")

        stripe.PaymentMethod.detach(payment_method_id)

    async def create_portal_session(
        self,
        customer_id: str,
        return_url: str,
    ) -> str:
        """
        Create Stripe Customer Portal session.

        Returns URL to redirect user to.
        """
        session = await self.stripe.create_billing_portal_session(
            customer_id=customer_id,
            return_url=return_url,
        )
        return session.url

    def _get_default_payment_method(self, customer_id: str) -> Optional[str]:
        """Get the default payment method ID."""
        customer = stripe.Customer.retrieve(customer_id)
        return customer.invoice_settings.default_payment_method
```

**API Endpoints**:

```python
# backend/app/api/routes/billing.py

@router.get("/payment-methods")
async def list_payment_methods(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """List all payment methods."""
    # Get customer ID
    sub = await db.table('subscriptions') \
        .select('stripe_customer_id') \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    if not sub.data or not sub.data.get('stripe_customer_id'):
        return []

    service = PaymentMethodService(stripe, db)
    return await service.list_payment_methods(sub.data['stripe_customer_id'])


@router.post("/payment-methods/setup")
async def create_setup_intent(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Create SetupIntent for adding new payment method."""
    sub = await db.table('subscriptions') \
        .select('stripe_customer_id') \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    if not sub.data or not sub.data.get('stripe_customer_id'):
        raise HTTPException(400, "No billing customer found")

    service = PaymentMethodService(stripe, db)
    client_secret = await service.create_setup_intent(
        sub.data['stripe_customer_id']
    )

    return {"client_secret": client_secret}


@router.post("/payment-methods/{payment_method_id}/default")
async def set_default_payment_method(
    payment_method_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Set payment method as default."""
    sub = await db.table('subscriptions') \
        .select('stripe_customer_id') \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    service = PaymentMethodService(stripe, db)
    await service.set_default_payment_method(
        sub.data['stripe_customer_id'],
        payment_method_id,
    )

    return {"success": True}


@router.delete("/payment-methods/{payment_method_id}")
async def remove_payment_method(
    payment_method_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Remove a payment method."""
    sub = await db.table('subscriptions') \
        .select('stripe_customer_id') \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    service = PaymentMethodService(stripe, db)
    await service.remove_payment_method(
        sub.data['stripe_customer_id'],
        payment_method_id,
    )

    return {"success": True}


@router.post("/portal")
async def create_portal_session(
    return_url: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe = Depends(get_stripe_service),
):
    """Create Stripe Customer Portal session."""
    sub = await db.table('subscriptions') \
        .select('stripe_customer_id') \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    if not sub.data or not sub.data.get('stripe_customer_id'):
        raise HTTPException(400, "No billing customer found")

    service = PaymentMethodService(stripe, db)
    url = await service.create_portal_session(
        sub.data['stripe_customer_id'],
        return_url,
    )

    return {"url": url}
```

**Frontend - Add Card Component**:

```typescript
// frontend/src/components/billing/AddPaymentMethod.tsx
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

function AddCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) return

    setLoading(true)

    try {
      // Get setup intent from backend
      const res = await fetch('/api/billing/payment-methods/setup', {
        method: 'POST',
      })
      const { client_secret } = await res.json()

      // Confirm setup with Stripe
      const { error } = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
        },
      })

      if (error) {
        throw error
      }

      toast({ title: 'Card added successfully' })
      onSuccess()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to add card',
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <CardElement className="p-3 border rounded-md" />
      <Button type="submit" disabled={!stripe || loading}>
        {loading ? 'Adding...' : 'Add Card'}
      </Button>
    </form>
  )
}

export function AddPaymentMethod({ onSuccess }: { onSuccess: () => void }) {
  return (
    <Elements stripe={stripePromise}>
      <AddCardForm onSuccess={onSuccess} />
    </Elements>
  )
}
```

## Definition of Done
- [ ] Payment methods list displays correctly
- [ ] Add new card via Stripe Elements works
- [ ] Set default payment method works
- [ ] Remove payment method works (with validation)
- [ ] Customer Portal redirect works
