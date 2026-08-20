# Story 21.9: Create Checkout Flow

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 4
- **Dependencies**: Story 21.2 (Plans), Story 21.3 (Customer Management), Story 21.8 (Pricing Page)
- **Status**: `pending`

## User Story
**As a** new customer
**I want** to complete checkout and start my subscription
**So that** I can access paid features

## Acceptance Criteria
- [ ] **AC1**: Checkout page receives plan selection from pricing page
- [ ] **AC2**: Stripe Checkout Session created for selected plan
- [ ] **AC3**: Redirect to Stripe hosted checkout page
- [ ] **AC4**: Success page after payment completion
- [ ] **AC5**: Subscription created and activated on success
- [ ] **AC6**: Cancel returns user to pricing page

## Technical Specifications

**Backend - Checkout Session Creation**:

```python
# backend/app/api/routes/billing.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.services.billing.stripe_client import StripeService
from app.services.billing.plans import PLANS
from app.auth.dependencies import get_current_user
from app.database import get_db

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    """Checkout session request."""
    plan_id: str
    billing_period: str = "annual"
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    """Checkout session response."""
    checkout_url: str
    session_id: str


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    request: CheckoutRequest,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    stripe: StripeService = Depends(get_stripe_service),
):
    """
    Create Stripe Checkout Session for subscription.

    Redirects user to Stripe-hosted checkout page.
    """
    # Validate plan exists
    plan = PLANS.get(request.plan_id)
    if not plan:
        raise HTTPException(400, f"Invalid plan: {request.plan_id}")

    if plan.annual_price == 0:
        raise HTTPException(400, "Cannot checkout free plan")

    # Get or create Stripe customer
    sub_result = await db.table('subscriptions') \
        .select('stripe_customer_id') \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    customer_id = sub_result.data.get('stripe_customer_id') if sub_result.data else None

    if not customer_id:
        # Create new customer
        customer_id = await stripe.create_customer(
            email=current_user.email,
            name=current_user.organization_name,
            metadata={"organization_id": str(current_user.organization_id)},
        )

    # Annual billing is the only self-serve checkout period.
    price_id = plan.stripe_price_id_annual

    # Create checkout session
    session = await stripe.create_checkout_session(
        customer_id=customer_id,
        price_id=price_id,
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        metadata={
            "organization_id": str(current_user.organization_id),
            "plan_id": request.plan_id,
        },
        trial_days=30 if plan.has_trial else 0,
    )

    return CheckoutResponse(
        checkout_url=session.url,
        session_id=session.id,
    )


@router.get("/checkout/success")
async def checkout_success(
    session_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    Handle successful checkout return.

    Note: Actual subscription creation happens via webhook.
    This endpoint confirms the session and shows success UI.
    """
    import stripe

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.InvalidRequestError:
        raise HTTPException(400, "Invalid session")

    # Verify session belongs to this org
    if session.metadata.get('organization_id') != str(current_user.organization_id):
        raise HTTPException(403, "Session does not belong to this organization")

    return {
        "status": "success",
        "subscription_id": session.subscription,
        "customer_id": session.customer,
    }
```

**Stripe Service Extension**:

```python
# backend/app/services/billing/stripe_client.py (add to existing)

async def create_checkout_session(
    self,
    customer_id: str,
    price_id: str,
    success_url: str,
    cancel_url: str,
    metadata: dict = None,
    trial_days: int = 0,
) -> stripe.checkout.Session:
    """Create Stripe Checkout Session."""
    params = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": cancel_url,
        "metadata": metadata or {},
        "allow_promotion_codes": True,  # Enable promo codes
    }

    if trial_days > 0:
        params["subscription_data"] = {
            "trial_period_days": trial_days,
            "metadata": metadata or {},
        }

    return stripe.checkout.Session.create(**params)
```

**Frontend - Checkout Page**:

```tsx
// frontend/src/pages/Checkout.tsx
import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { PLANS } from '@/config/plans'
import { useToast } from '@/hooks/use-toast'

export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const planId = searchParams.get('plan') || 'professional'
  const plan = PLANS.find(p => p.id === planId)

  const billingPeriod = 'annual'
  const [loading, setLoading] = useState(false)

  if (!plan || plan.annualPrice === 0) {
    navigate('/pricing')
    return null
  }

  const price = plan.annualPrice

  const handleCheckout = async () => {
    setLoading(true)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          billing_period: billingPeriod,
          success_url: `${window.location.origin}/checkout/success`,
          cancel_url: `${window.location.origin}/pricing`,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { checkout_url } = await res.json()

      // Redirect to Stripe
      window.location.href = checkout_url
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Checkout failed',
        description: 'Please try again or contact support.',
      })
      setLoading(false)
    }
  }

  return (
    <div className="container max-w-lg py-16">
      <Card>
        <CardHeader>
          <CardTitle>Subscribe to {plan.name}</CardTitle>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Order summary */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span>{plan.name} Plan</span>
              <span>${price}/year</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Billed annually</span>
              <span>Annual only</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Total today</span>
              <span>${price}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Includes 30-day free trial. You won't be charged until the trial ends.
            </p>
          </div>

          {/* Checkout button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting to checkout...
              </>
            ) : (
              'Continue to Payment'
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Frontend - Success Page**:

```tsx
// frontend/src/pages/CheckoutSuccess.tsx
import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid session')
      setLoading(false)
      return
    }

    // Verify session
    fetch(`/api/billing/checkout/success?session_id=${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error('Session verification failed')
        return res.json()
      })
      .then(() => setLoading(false))
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [sessionId])

  if (loading) {
    return (
      <div className="container max-w-lg py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        <p className="mt-4 text-muted-foreground">Confirming your subscription...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container max-w-lg py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Something went wrong</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/billing">Go to Billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container max-w-lg py-16">
      <Card>
        <CardHeader className="text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <CardTitle>Welcome aboard!</CardTitle>
          <CardDescription>
            Your subscription is now active. You have full access to all features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/billing">View Billing Details</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Route Registration**:

```tsx
// frontend/src/App.tsx
<Route path="/checkout" element={<CheckoutPage />} />
<Route path="/checkout/success" element={<CheckoutSuccessPage />} />
```

## Test Cases

```python
def test_checkout_creates_session():
    """Verify checkout session created with correct params."""
    # POST /billing/checkout with valid plan
    # Verify session created
    # Verify redirect URL returned

def test_checkout_invalid_plan():
    """Verify invalid plan rejected."""
    # POST with non-existent plan
    # Should return 400

def test_checkout_free_plan_rejected():
    """Verify free plan cannot be checked out."""
    # POST with free plan
    # Should return 400

def test_checkout_success_verifies_session():
    """Verify success endpoint validates session."""
    # GET with valid session_id
    # Verify session belongs to user
```

## Definition of Done
- [ ] Checkout session creation works
- [ ] Stripe redirect functions correctly
- [ ] Success page confirms subscription
- [ ] Trial period applied correctly
- [ ] Promo codes enabled in checkout
- [ ] Cancel returns to pricing
