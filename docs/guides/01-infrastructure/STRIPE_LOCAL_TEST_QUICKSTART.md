# Stripe Local Testing - Quick Start Guide

Quick reference for testing Stripe billing locally before production deployment.

## Prerequisites Checklist

- [ ] Stripe account created (test mode enabled)
- [ ] Stripe CLI installed (`brew install stripe/stripe-cli/stripe` or `scoop install stripe`)
- [ ] Products and prices created in Stripe Dashboard
- [ ] Supabase running locally (`supabase start`)
- [ ] Environment variables configured

## 5-Minute Setup

### 1. Get Stripe Test Keys

```bash
# Visit https://dashboard.stripe.com/test/apikeys
# Copy both keys:
# - Publishable key (pk_test_...)
# - Secret key (sk_test_...)
```

### 2. Configure Environment

```bash
# Edit backend/.env
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_reconcile_annual
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_control_annual
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_defend_annual
STRIPE_80OFF_COUPON_ID=80OFF
```

### 3. Start Stripe Webhook Listener

```bash
# Terminal 1: Start webhook forwarding
stripe login
stripe listen --forward-to localhost:8000/webhooks/stripe

# Copy the webhook secret displayed (whsec_...)
# Add to backend/.env:
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
```

### 4. Start Backend

```bash
# Terminal 2: Start backend server
cd backend
uvicorn app.main:app --reload --port 8000
```

### 5. Test Checkout

```bash
# Terminal 3: Create checkout session
curl -X POST http://localhost:8000/api/v1/billing/checkout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "control",
    "billing_period": "annual",
    "unit_count": 120,
    "building_count": 12,
    "success_url": "http://localhost:5173/billing/success?session_id={CHECKOUT_SESSION_ID}",
    "cancel_url": "http://localhost:5173/billing"
  }'

# Open the returned checkout_url in browser
# Use test card: 4242 4242 4242 4242
# Expiry: 12/34, CVC: 123
```

## Test Card Reference

| Purpose | Card Number | Result |
|---------|-------------|--------|
| Success | `4242 4242 4242 4242` | Payment succeeds |
| Decline | `4000 0000 0000 0002` | Card declined |
| 3D Secure | `4000 0025 0000 3155` | Requires authentication |

All test cards:
- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any 5 digits (e.g., `12345`)

## Expected Webhook Flow

After successful checkout, you should see in Terminal 1 (Stripe CLI):

```
--> customer.subscription.created [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
--> invoice.created [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
--> invoice.paid [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
```

## Verify Success

### Check Database (Supabase Studio)

```sql
-- Check subscription created
SELECT * FROM subscriptions WHERE organization_id = 'YOUR_ORG_ID';

-- Expected: status = 'active' or 'trialing', plan = 'growth'

-- Check invoice created
SELECT * FROM invoices WHERE organization_id = 'YOUR_ORG_ID';

-- Expected: status = 'paid', amount_paid > 0
```

### Check API

```bash
# Get subscription details
curl http://localhost:8000/api/v1/billing/subscription \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get customer details
curl http://localhost:8000/api/v1/billing/customer \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Issues

### "Webhook signature invalid"
- **Cause**: Wrong webhook secret in `.env`
- **Fix**: Copy secret from Stripe CLI output, restart backend

### "No webhook events received"
- **Cause**: Stripe CLI not running or wrong endpoint
- **Fix**: Ensure `stripe listen --forward-to localhost:8000/webhooks/stripe` is running
- **Note**: Endpoint is `/webhooks/stripe` not `/api/v1/billing/webhook`

### "Price not found"
- **Cause**: Wrong price IDs in `.env`
- **Fix**: Copy price IDs from Stripe Dashboard > Products (must start with `price_`)

### "Organization not found"
- **Cause**: No test organization in database
- **Fix**: Create org via Supabase Studio or API

## Complete Testing Checklist

Test these flows before going to production:

- [ ] Successful checkout (test card `4242...`)
- [ ] Failed payment (test card `4000...0002`)
- [ ] 3D Secure auth (test card `4000...3155`)
- [ ] Webhook events received (check CLI terminal)
- [ ] Subscription created in database
- [ ] Invoice created and paid
- [ ] Upgrade subscription (change building count)
- [ ] Downgrade subscription
- [ ] Cancel subscription
- [ ] Access customer portal
- [ ] Payment method management

## Test Workflow Commands

```bash
# Upgrade subscription
curl -X POST http://localhost:8000/api/v1/billing/subscription/upgrade \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_plan": "professional"}'

# Cancel subscription (at period end)
curl -X POST http://localhost:8000/api/v1/billing/subscription/cancel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"immediate": false}'

# Access customer portal
curl -X POST http://localhost:8000/api/v1/billing/portal \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"return_url": "http://localhost:5173/billing"}'
```

## Manual Webhook Testing

Trigger webhook events without UI interaction:

```bash
# Trigger subscription created
stripe trigger customer.subscription.created

# Trigger payment failed
stripe trigger invoice.payment_failed

# Trigger subscription deleted
stripe trigger customer.subscription.deleted
```

## Production Readiness

Once local testing is complete:

1. Replace test keys with live keys
2. Update webhook endpoint to production URL
3. Get new webhook secret from Dashboard (not CLI)
4. Test with small real payment
5. Monitor Stripe Dashboard > Logs

**Important**: Test data and live data are completely separate. Your test subscriptions will NOT appear in production.

## Full Documentation

For detailed explanations and troubleshooting, see:
- [Full Stripe Setup Guide](./03-stripe-setup.md)
- Section 7: Complete local testing walkthrough
- Section 8: Going live checklist

## Support

- **Stripe Documentation**: https://stripe.com/docs/testing
- **Stripe CLI Docs**: https://stripe.com/docs/stripe-cli
- **Test Cards**: https://stripe.com/docs/testing#cards
