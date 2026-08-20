# Story T5.3: Checkout Step

## Story Info
- **Epic**: T5 — Audit Wizard
- **Estimated Hours**: 5
- **Dependencies**: T1.2 (Stripe One-Time Payment), T5.2 (Details Step)
- **Status**: `pending`

## User Story
As a commercial tenant, I want to pay for my audit via a secure checkout flow so that processing can begin immediately after payment.

## Acceptance Criteria
- Checkout step shows an order summary (tier name, price, email) before redirecting
-"Pay with Stripe" button initiates checkout by calling `POST /api/v1/tenant-audits/{token}/pay`
- Backend returns a Stripe Checkout Session URL
- User is redirected to Stripe hosted checkout
- On successful payment, Stripe redirects back to `/audit/{token}?status=paid`
- On cancelled payment, Stripe redirects back to `/audit/{token}?status=cancelled`
- Cancelled status shows a"Payment cancelled" message with"Try Again" button
-"Try Again" re-initiates the checkout flow
- Loading state shown while creating checkout session
- Error state shown if checkout session creation fails
- If audit status is already `payment_pending`, show"Waiting for payment confirmation" with a link to retry

## Technical Specifications

### CheckoutStep Component

```typescript
// marketing-tenant/src/components/audit/CheckoutStep.tsx"use client";

import { useSearchParams } from"next/navigation";
import { Button } from"@/components/ui/button";
import { CreditCard, AlertCircle, Loader2 } from"lucide-react";
import { useCreateCheckoutSession } from"@/hooks/use-tenant-audit";
import { AUDIT_TIERS } from"@/lib/audit-tiers";
import type { TenantAudit } from"@/types/tenant-audit";

interface CheckoutStepProps {
  audit: TenantAudit;
}

export function CheckoutStep({ audit }: CheckoutStepProps) {
  const searchParams = useSearchParams();
  const wasCancelled = searchParams.get("status") ==="cancelled";

  const tier = AUDIT_TIERS.find((t) => t.id === audit.tier) ?? AUDIT_TIERS[1];

  const createCheckout = useCreateCheckoutSession(audit.access_token);

  const handleCheckout = () => {
    createCheckout.mutate(undefined, {
      onSuccess: (data) => {
        window.location.href = data.checkout_url;
      },
    });
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          Review & Pay
        </h2>
        <p className="mt-2 text-muted-foreground">
          You&apos;ll be redirected to Stripe for secure payment.
        </p>
      </div>

      {wasCancelled && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          Payment was cancelled. You can try again below.
        </div>
      )}

      {/* Order Summary */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold">Order Summary</h3>

        <div className="mt-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Audit Level</span>
            <span className="font-medium">{tier.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{audit.email}</span>
          </div>
          {audit.property_name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium">{audit.property_name}</span>
            </div>
          )}

          <hr />

          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>${tier.price}.00</span>
          </div>
        </div>
      </div>

      {/* Security Note */}
      <p className="text-center text-xs text-muted-foreground">
        Payment is processed securely by Stripe. We never see your card details.
        Full refund if we can&apos;t complete your audit.
      </p>

      {createCheckout.isError && (
        <p className="text-center text-sm text-destructive" role="alert">
          {createCheckout.error?.message ??"Failed to start checkout. Please try again."}
        </p>
      )}

      <Button
        onClick={handleCheckout}
        disabled={createCheckout.isPending}
        className="w-full"
        size="lg"
      >
        {createCheckout.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparing checkout...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay ${tier.price}.00 with Stripe
          </>
        )}
      </Button>
    </div>
  );
}
```

### API Hook

```typescript
// Additions to marketing-tenant/src/hooks/use-tenant-audit.ts

interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
}

export function useCreateCheckoutSession(accessToken: string) {
  return useMutation<CheckoutSessionResponse, Error, void>({
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/tenant-audits/${accessToken}/pay`,
        {
          method:"POST",
          headers: {"Content-Type":"application/json" },
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.detail ?? `Checkout failed (${response.status})`,
        );
      }

      return response.json();
    },
  });
}
```

### Stripe Redirect URLs (Backend Configuration)

The backend `POST /api/v1/tenant-audits/{token}/pay` endpoint creates the Stripe Checkout Session with these redirect URLs:

```python
# backend/app/services/billing/tenant_audit_checkout.py (reference)
checkout_session = stripe.checkout.Session.create(
    mode="payment",
    line_items=[{"price": price_id,"quantity": 1}],
    success_url=f"{frontend_url}/audit/{access_token}?status=paid",
    cancel_url=f"{frontend_url}/audit/{access_token}?status=cancelled",
    metadata={"tenant_audit_id": str(audit_id),"access_token": access_token,
    },
)
```

## Test Cases
- Order summary displays correct tier name, price, and email
- Optional property name shown in summary when provided
-"Pay with Stripe" button calls `POST /api/v1/tenant-audits/{token}/pay`
- Successful checkout session creation redirects to `checkout_url`
- Loading state shows"Preparing checkout..." with spinner
- Error creating session displays inline error message
- Returning with `?status=cancelled` shows cancellation banner
-"Pay with Stripe" button is functional after cancellation (retry)
- Security note about Stripe and refund policy is visible
- Button is disabled during pending state to prevent double-clicks

## Definition of Done
- [ ] `CheckoutStep` renders order summary with tier, price, email
- [ ]"Pay with Stripe" button creates checkout session via API
- [ ] Successful session redirects to Stripe hosted checkout
- [ ] `?status=cancelled` query param shows cancellation alert
- [ ] Error and loading states handled correctly
- [ ] Security note visible below payment button
- [ ] Unit tests for order summary rendering
- [ ] Unit tests for checkout initiation flow
- [ ] Unit tests for cancelled state display
- [ ] Unit tests for error state display
