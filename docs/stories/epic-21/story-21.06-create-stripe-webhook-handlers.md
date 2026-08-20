# Story 21.6: Create Stripe Webhook Handlers

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 4
- **Dependencies**: Story 21.1 (Stripe Client), Story 3.15-3.16 (DB Tables)
- **Status**: `pending`

## User Story
**As a** billing system
**I want** to receive and process Stripe webhook events
**So that** subscription and invoice data stays synchronized

## Acceptance Criteria
- [ ] **AC1**: Webhook endpoint verifies Stripe signature
- [ ] **AC2**: Handle `customer.subscription.created` event
- [ ] **AC3**: Handle `customer.subscription.updated` event
- [ ] **AC4**: Handle `customer.subscription.deleted` event
- [ ] **AC5**: Handle `invoice.paid` event
- [ ] **AC6**: Handle `invoice.payment_failed` event
- [ ] **AC7**: Events are idempotent (can be replayed safely)

## Technical Specifications

**File to Create**: `backend/app/api/routes/webhooks.py`

```python
"""
Stripe webhook handlers.

These endpoints receive events from Stripe and update local database state.
All handlers must be idempotent - processing the same event twice should
produce the same result.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Request, HTTPException, Depends
import stripe

from app.services.billing.stripe_client import StripeService, stripe_settings
from app.database import get_db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def handle_stripe_webhook(
    request: Request,
    db = Depends(get_db),
):
    """
    Handle incoming Stripe webhook events.

    Verifies signature and dispatches to appropriate handler.
    """
    # Get raw body for signature verification
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature header")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            stripe_settings.stripe_webhook_secret,
        )
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    # Dispatch to handler based on event type
    handlers = {
        "customer.subscription.created": handle_subscription_created,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_deleted,
        "invoice.paid": handle_invoice_paid,
        "invoice.payment_failed": handle_invoice_payment_failed,
        "invoice.created": handle_invoice_created,
    }

    handler = handlers.get(event.type)
    if handler:
        await handler(event.data.object, db)

    return {"received": True}


async def handle_subscription_created(sub: stripe.Subscription, db):
    """Handle new subscription creation."""
    org_id = sub.metadata.get("organization_id")
    if not org_id:
        # Try to find org by customer ID
        org_id = await _get_org_by_customer(sub.customer, db)

    if not org_id:
        return  # Cannot link subscription without org

    await db.table('subscriptions') \
        .upsert({
            'organization_id': org_id,
            'stripe_subscription_id': sub.id,
            'stripe_customer_id': sub.customer,
            'plan': _map_price_to_plan(sub.items.data[0].price.id),
            'status': _map_subscription_status(sub.status),
            'current_period_start': datetime.fromtimestamp(sub.current_period_start).isoformat(),
            'current_period_end': datetime.fromtimestamp(sub.current_period_end).isoformat(),
            'cancel_at_period_end': sub.cancel_at_period_end,
            'updated_at': datetime.utcnow().isoformat(),
        }, on_conflict='organization_id') \
        .execute()


async def handle_subscription_updated(sub: stripe.Subscription, db):
    """Handle subscription updates (plan change, status change, etc.)."""
    # Find by stripe_subscription_id
    await db.table('subscriptions') \
        .update({
            'plan': _map_price_to_plan(sub.items.data[0].price.id),
            'status': _map_subscription_status(sub.status),
            'current_period_start': datetime.fromtimestamp(sub.current_period_start).isoformat(),
            'current_period_end': datetime.fromtimestamp(sub.current_period_end).isoformat(),
            'cancel_at_period_end': sub.cancel_at_period_end,
            'updated_at': datetime.utcnow().isoformat(),
        }) \
        .eq('stripe_subscription_id', sub.id) \
        .execute()


async def handle_subscription_deleted(sub: stripe.Subscription, db):
    """Handle subscription cancellation/deletion."""
    await db.table('subscriptions') \
        .update({
            'status': 'canceled',
            'updated_at': datetime.utcnow().isoformat(),
        }) \
        .eq('stripe_subscription_id', sub.id) \
        .execute()


async def handle_invoice_created(invoice: stripe.Invoice, db):
    """Handle new invoice creation."""
    org_id = await _get_org_by_customer(invoice.customer, db)
    if not org_id:
        return

    sub_id = await _get_sub_id(invoice.subscription, db) if invoice.subscription else None

    await db.table('invoices') \
        .upsert({
            'organization_id': org_id,
            'subscription_id': sub_id,
            'stripe_invoice_id': invoice.id,
            'amount_due': invoice.amount_due / 100,  # Convert from cents
            'amount_paid': invoice.amount_paid / 100,
            'currency': invoice.currency,
            'status': invoice.status,
            'period_start': datetime.fromtimestamp(invoice.period_start).isoformat(),
            'period_end': datetime.fromtimestamp(invoice.period_end).isoformat(),
            'due_date': datetime.fromtimestamp(invoice.due_date).isoformat() if invoice.due_date else None,
            'pdf_url': invoice.invoice_pdf,
            'updated_at': datetime.utcnow().isoformat(),
        }, on_conflict='stripe_invoice_id') \
        .execute()


async def handle_invoice_paid(invoice: stripe.Invoice, db):
    """Handle successful invoice payment."""
    await db.table('invoices') \
        .update({
            'status': 'paid',
            'amount_paid': invoice.amount_paid / 100,
            'paid_at': datetime.utcnow().isoformat(),
            'pdf_url': invoice.invoice_pdf,
            'updated_at': datetime.utcnow().isoformat(),
        }) \
        .eq('stripe_invoice_id', invoice.id) \
        .execute()


async def handle_invoice_payment_failed(invoice: stripe.Invoice, db):
    """Handle failed invoice payment."""
    # Update invoice status
    await db.table('invoices') \
        .update({
            'status': 'open',  # Remains open/unpaid
            'updated_at': datetime.utcnow().isoformat(),
        }) \
        .eq('stripe_invoice_id', invoice.id) \
        .execute()

    # Update subscription to past_due
    if invoice.subscription:
        await db.table('subscriptions') \
            .update({
                'status': 'past_due',
                'updated_at': datetime.utcnow().isoformat(),
            }) \
            .eq('stripe_subscription_id', invoice.subscription) \
            .execute()


# Helper functions

async def _get_org_by_customer(customer_id: str, db) -> Optional[str]:
    """Get organization ID by Stripe customer ID."""
    result = await db.table('subscriptions') \
        .select('organization_id') \
        .eq('stripe_customer_id', customer_id) \
        .single() \
        .execute()

    return result.data.get('organization_id') if result.data else None


async def _get_sub_id(stripe_sub_id: str, db) -> Optional[str]:
    """Get local subscription UUID by Stripe subscription ID."""
    result = await db.table('subscriptions') \
        .select('id') \
        .eq('stripe_subscription_id', stripe_sub_id) \
        .single() \
        .execute()

    return result.data.get('id') if result.data else None


def _map_price_to_plan(price_id: str) -> str:
    """Map Stripe price ID to plan name."""
    price_map = {
        stripe_settings.stripe_price_id_reconcile_annual: 'reconcile',
        stripe_settings.stripe_price_id_control_annual: 'control',
        stripe_settings.stripe_price_id_defend_annual: 'defend',
        stripe_settings.stripe_price_id_enterprise: 'enterprise',
    }
    return price_map.get(price_id, 'control')


def _map_subscription_status(status: str) -> str:
    """Map Stripe subscription status to our status enum."""
    status_map = {
        'trialing': 'trialing',
        'active': 'active',
        'past_due': 'past_due',
        'canceled': 'canceled',
        'unpaid': 'past_due',
        'paused': 'paused',
    }
    return status_map.get(status, 'active')
```

**Stripe Dashboard Configuration**:

Configure these events in Stripe Dashboard > Webhooks:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.paid`
- `invoice.payment_failed`

**Webhook URL**: `https://api.capveri.com/webhooks/stripe`

## Test Cases

```python
def test_webhook_signature_verification():
    """Verify invalid signatures are rejected."""
    # Send request without signature
    # Should return 400

def test_subscription_created_updates_db():
    """Verify subscription.created updates local database."""
    # Mock webhook event
    # Call handler
    # Verify subscription record created/updated

def test_invoice_paid_updates_status():
    """Verify invoice.paid updates invoice status."""
    # Create invoice in draft/open
    # Send paid webhook
    # Verify status = paid and paid_at set

def test_handlers_are_idempotent():
    """Verify same event can be processed multiple times."""
    # Process same event twice
    # Verify database state is same
```

## Definition of Done
- [ ] Signature verification works
- [ ] All event handlers implemented
- [ ] Database updated correctly for each event
- [ ] Handlers are idempotent
- [ ] Stripe Dashboard configured
- [ ] Tests pass
