# Stripe Setup Guide

This guide covers configuring Stripe for billing and subscription management in CapVeri.

## Overview

CapVeri uses Stripe for:
- Subscription management (Reconcile, Control, Defend, and Enterprise packages)
- Payment processing
- Customer billing portal
- Webhook notifications for subscription events

## Prerequisites

- Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com)
- Business verification completed (for live mode)

**New to Stripe?** See [Stripe Dashboard Quickstart](./STRIPE_DASHBOARD_QUICKSTART.md) for a step-by-step walkthrough of setting up your Stripe account, creating products, and getting your API keys.

## 1. Create Stripe Account

### Initial Setup

1. Navigate to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Sign up or sign in
3. Complete business verification (for live payments)
4. Enable **Test mode** toggle for development

### API Keys

1. Go to **Developers** > **API keys**
2. Note your keys:
   - **Publishable key**: `pk_test_...` (safe to expose in frontend)
   - **Secret key**: `sk_test_...` (keep secure, backend only)

For production, use live keys (`pk_live_...`, `sk_live_...`) after testing.

## 2. Create Products and Prices

### Create Subscription Products

1. Go to **Products** > **Add product**
2. Create products for each tier:

| Tier | Name | Description |
|------|------|-------------|
| Reconcile | CapVeri Reconcile | Entry package for audit-ready CAM reconciliation |
| Control | CapVeri Control | Portfolio controls and reporting |
| Defend | CapVeri Defend | Tenant portal, dispute workflow, and advanced defenses |
| Enterprise | CapVeri Enterprise | Custom portfolios above self-serve limits |

### Create Prices

For each product, add a recurring price:

1. Click on the product
2. Click **Add a price**
3. Configure:
   - **Pricing model**: Standard pricing
   - **Price**: Annual list price from `plan-tiers.json`
   - **Billing period**: Yearly
4. Note the **Price ID** (e.g., `price_1234...`)

Create a Stripe coupon for the limited offer:

- 80% off
- Duration: once
- Promotion code: `80OFF`

### Price IDs

After creating prices, note the IDs:

```
Reconcile annual:  price_1ABCreconcileAnnual...
Control annual:    price_1ABCcontrolAnnual...
Defend annual:     price_1ABCdefendAnnual...
Enterprise:        price_1ABCent...
```

## 3. Configure Webhooks

### Create Webhook Endpoint

1. Go to **Developers** > **Webhooks**
2. Click **Add endpoint**
3. Configure:
   - **Endpoint URL**: `https://api.capveri.com/api/v1/billing/webhook`
   - **Events to listen for**:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
4. Click **Add endpoint**
5. Note the **Signing secret** (`whsec_...`)

### Testing Webhooks Locally

Use Stripe CLI for local development:

```bash
# Install Stripe CLI
# macOS
brew install stripe/stripe-cli/stripe

# Windows (via scoop)
scoop install stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:8000/api/v1/billing/webhook

# Note the webhook signing secret displayed
# Example: whsec_abc123...
```

## 4. Configure Customer Portal

### Enable Portal Features

1. Go to **Settings** > **Billing** > **Customer portal**
2. Enable features:
   - **Invoices**: View and download
   - **Payment methods**: Update card
   - **Subscriptions**: Change plan, cancel
3. Configure cancellation options:
   - Allow immediate cancellation
   - Optional: Pause subscriptions
4. Save changes

### Portal Link

The portal is accessed via the billing API endpoint which creates a session URL.

## 5. Environment Variables

Add to your backend `.env`:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...your-secret-key...
STRIPE_PUBLISHABLE_KEY=pk_test_...your-publishable-key...
STRIPE_WEBHOOK_SECRET=whsec_...your-webhook-secret...

# Price IDs
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_...reconcile-annual-price-id...
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_...control-annual-price-id...
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_...defend-annual-price-id...
STRIPE_80OFF_COUPON_ID=80OFF
STRIPE_PRICE_ID_ENTERPRISE=price_...enterprise-tier-price-id...
```

For frontend (optional, if using Stripe.js):
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 6. Application Integration

### Stripe Client Configuration

The Stripe client (`backend/app/services/billing/stripe_client.py`) is configured with:

| Setting | Value | Description |
|---------|-------|-------------|
| API version | `2023-10-16` | Pinned for stability |
| Promo codes | Enabled | Allow discount codes at checkout |
| Trial support | Yes | Optional trial period |

### Available Features

| Feature | Method | Description |
|---------|--------|-------------|
| Create customer | `create_customer()` | New Stripe customer |
| Checkout session | `create_checkout_session()` | Subscription signup |
| Billing portal | `create_billing_portal_session()` | Self-service management |
| Webhook verify | `verify_webhook_signature()` | Validate webhook authenticity |

### Webhook Handling

Webhooks are processed at `/api/v1/billing/webhook`:

```python
# Example webhook event handling
match event.type:
    case "checkout.session.completed":
        # Activate subscription in database
        pass
    case "customer.subscription.updated":
        # Update subscription status
        pass
    case "invoice.payment_failed":
        # Notify user, retry logic
        pass
```

## 7. Testing Locally Before Production

This section provides a complete step-by-step guide for testing the entire Stripe billing workflow on your local machine.

### Prerequisites

1. **Stripe CLI installed**: Follow install instructions in section 3 above
2. **Supabase running locally**: `supabase start`
3. **Backend running**: With proper environment variables configured

### Step 1: Configure Local Environment

Create or update `backend/.env` with your test keys:

```env
# Stripe Test Keys (from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_51xxxxx...
STRIPE_PUBLISHABLE_KEY=pk_test_51xxxxx...

# Webhook secret - get from Stripe CLI (Step 2)
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...

# Price IDs from your Stripe Dashboard > Products
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_reconcile_annual
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_control_annual
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_defend_annual
STRIPE_80OFF_COUPON_ID=80OFF
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxx...

# Local Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# Local URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
```

### Step 2: Start Stripe Webhook Forwarding

In a dedicated terminal, start the Stripe CLI to forward webhooks to your local backend:

```bash
# Login to Stripe CLI (one-time setup)
stripe login

# Forward webhooks to local backend
stripe listen --forward-to localhost:8000/webhooks/stripe
```

**Important**: The CLI will display a webhook signing secret like `whsec_abc123...`. Copy this and add it to your `.env` file as `STRIPE_WEBHOOK_SECRET`.

You should see output like:

```
> Ready! Your webhook signing secret is whsec_xxxxx (^C to quit)
```

Leave this terminal running throughout testing.

### Step 3: Start Local Backend

In a separate terminal:

```bash
cd backend

# Install dependencies if needed
pip install -r requirements.txt

# Start server with auto-reload
uvicorn app.main:app --reload --port 8000
```

Verify the server started successfully at `http://localhost:8000/health`.

### Step 4: Create Test Organization and User

Use Supabase Studio (`http://localhost:54323`) or API to create:

1. **User**: Sign up via auth endpoint or Supabase Studio
2. **Organization**: Create organization via API or direct SQL:

```sql
-- In Supabase Studio SQL Editor
INSERT INTO organizations (name, billing_email)
VALUES ('Test Org', 'test@example.com')
RETURNING id;
```

Note the organization UUID for testing.

### Step 5: Test Checkout Flow

#### Option A: Using API Directly (Recommended)

Create a checkout session via API:

```bash
# Get auth token first (replace with your credentials)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "your-password"}'

# Use token to create checkout session
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
```

You'll receive a response with a `checkout_url`. Open this URL in your browser.

#### Option B: Using Frontend

1. Start frontend: `cd frontend && npm run dev`
2. Login with test user
3. Navigate to billing/pricing page
4. Click "Upgrade" or "Subscribe"
5. You'll be redirected to Stripe Checkout

### Step 6: Complete Test Payment

On the Stripe Checkout page:

1. Use test card number: `4242 4242 4242 4242`
2. Use any future expiry date (e.g., `12/34`)
3. Use any 3-digit CVC (e.g., `123`)
4. Enter any billing details
5. Click "Subscribe"

### Step 7: Verify Webhook Processing

After completing checkout, check your Stripe CLI terminal. You should see webhook events:

```
2026-01-16 10:30:15   --> customer.subscription.created [evt_xxx]
2026-01-16 10:30:15   <-- [200] POST http://localhost:8000/webhooks/stripe [evt_xxx]
2026-01-16 10:30:16   --> invoice.paid [evt_xxx]
2026-01-16 10:30:16   <-- [200] POST http://localhost:8000/webhooks/stripe [evt_xxx]
```

Check your backend logs for webhook processing:

```
INFO:     POST /webhooks/stripe - 200 OK
INFO:     Subscription created for organization: xxxxx
INFO:     Invoice marked as paid: inv_xxxxx
```

### Step 8: Verify Database Updates

Check Supabase Studio to confirm data was written:

```sql
-- Check subscription was created
SELECT * FROM subscriptions WHERE organization_id = 'your-org-id';

-- Check invoice was created
SELECT * FROM invoices WHERE organization_id = 'your-org-id';
```

You should see:
- **Subscription** with status `active` or `trialing`
- **Invoice** with status `paid`
- Correct `building_count` and `plan` values

### Step 9: Test Additional Workflows

#### Test Subscription Update

```bash
curl -X POST http://localhost:8000/api/v1/billing/subscription/upgrade \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_plan": "defend"}'
```

Watch for `customer.subscription.updated` webhook.

#### Test Payment Method Management

```bash
# List payment methods
curl http://localhost:8000/api/v1/billing/payment-methods \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create setup intent for new card
curl -X POST http://localhost:8000/api/v1/billing/payment-methods/setup \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Test Customer Portal

```bash
curl -X POST http://localhost:8000/api/v1/billing/portal \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"return_url": "http://localhost:5173/billing"}'
```

Opens Stripe-hosted customer portal for managing subscription.

#### Test Subscription Cancellation

```bash
curl -X POST http://localhost:8000/api/v1/billing/subscription/cancel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"immediate": false}'
```

Watch for `customer.subscription.updated` webhook with `cancel_at_period_end: true`.

### Step 10: Test Webhook Events Manually

Stripe CLI allows triggering test events without UI interaction:

```bash
# Trigger subscription created event
stripe trigger customer.subscription.created

# Trigger payment failed event
stripe trigger invoice.payment_failed

# Trigger subscription deleted event
stripe trigger customer.subscription.deleted
```

Check that your webhook handlers process these events correctly.

### Common Test Scenarios

#### Test Failed Payment

1. Use test card `4000 0000 0000 0002` (decline)
2. Complete checkout
3. Verify `invoice.payment_failed` webhook fires
4. Check subscription status changes to `past_due`

#### Test 3D Secure Authentication

1. Use test card `4000 0025 0000 3155` (requires auth)
2. Complete checkout
3. Complete 3D Secure authentication modal
4. Verify payment succeeds

#### Test Proration (Upgrade)

1. Subscribe to Control with 80OFF
2. Change to Defend mid-cycle
3. Check that new invoice includes prorated amount
4. Verify subscription tier metadata updates in database

### Test Checklist

Before going to production, verify you've tested:

- [ ] Successful checkout with test card
- [ ] Webhook events received and processed
- [ ] Subscription created in database
- [ ] Invoice created and marked paid
- [ ] Subscription upgrade/downgrade
- [ ] Payment method management
- [ ] Customer portal access
- [ ] Subscription cancellation
- [ ] Failed payment handling
- [ ] 3D Secure authentication flow
- [ ] Building count quantity updates

### Troubleshooting Local Testing

#### Webhook Not Received

**Problem**: No webhook events showing in Stripe CLI

**Solutions**:
- Ensure Stripe CLI is running: `stripe listen --forward-to localhost:8000/webhooks/stripe`
- Check endpoint URL matches: `/webhooks/stripe` (not `/api/v1/billing/webhook`)
- Verify backend is running on port 8000

#### Webhook Signature Invalid

**Problem**: `400 Invalid signature` error

**Solutions**:
- Copy webhook secret from Stripe CLI output
- Update `STRIPE_WEBHOOK_SECRET` in `.env`
- Restart backend after updating `.env`
- Don't use webhook secret from Stripe Dashboard (different from CLI)

#### Database Not Updating

**Problem**: Webhooks received but no database changes

**Solutions**:
- Check backend logs for errors
- Verify `organization_id` exists in `organizations` table
- Check RLS policies allow service role to write
- Ensure `DATABASE_URL` is correct

#### Price ID Not Found

**Problem**: `Plan not found` error during checkout

**Solutions**:
- Verify price IDs in `.env` match Stripe Dashboard
- Check you created prices in test mode
- Ensure price IDs start with `price_`

#### Authentication Issues

**Problem**: 401 Unauthorized on billing endpoints

**Solutions**:
- Get fresh access token from login endpoint
- Include `Authorization: Bearer <token>` header
- Check token hasn't expired (15min default)
- Verify user belongs to organization

### Next: Test Mode vs Production

**Key Differences**:

| Aspect | Test Mode | Production |
|--------|-----------|------------|
| API Keys | `sk_test_`, `pk_test_` | `sk_live_`, `pk_live_` |
| Webhook Secret | From Stripe CLI | From Stripe Dashboard |
| Webhook URL | `localhost:8000` | `api.capveri.com` |
| Payment Cards | Test cards only | Real cards only |
| Stripe Dashboard | Test data (red) | Live data (green) |

**Remember**:
- Test data and live data are completely separate
- Test keys cannot process real payments
- Live keys cannot see test data

See Section 8 (Going Live) for production deployment steps.

## 8. Going Live

### Pre-Launch Checklist

- [ ] Complete Stripe business verification
- [ ] Replace test keys with live keys
- [ ] Update webhook URL to production
- [ ] Update webhook signing secret
- [ ] Verify products/prices in live mode
- [ ] Test end-to-end with real card (small amount)

### Live Keys

1. Turn OFF **Test mode** toggle
2. Copy live API keys from dashboard
3. Update environment variables
4. Update webhook endpoint to production URL
5. Get new webhook signing secret

## 9. Cost Structure

### Stripe Fees

| Type | Fee |
|------|-----|
| Standard | 2.9% + $0.30 per transaction |
| International | +1.0% |
| Currency conversion | +1.0% |

### Example Monthly Cost

| Revenue | Stripe Fees |
|---------|-------------|
| $1,000 | ~$30 |
| $10,000 | ~$300 |
| $100,000 | ~$3,000 |

## 10. Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook signature invalid | Wrong secret | Check `STRIPE_WEBHOOK_SECRET` |
| Payment declined | Test card in live | Use live card |
| Customer not found | Wrong mode | Match test/live keys |
| Price not found | Wrong price ID | Verify price ID in dashboard |

### Debug Tips

1. Check Stripe Dashboard > **Logs** for API errors
2. Check **Webhooks** > **Endpoint** > **Attempts** for webhook issues
3. Enable debug logging in app
4. Use Stripe CLI `stripe logs tail` for real-time logs

## Related Documentation

- [Stripe Docs](https://stripe.com/docs) - Official documentation
- [Stripe Testing](https://stripe.com/docs/testing) - Test cards and scenarios
- [Environment Variables Reference](../02-deployment/05-environment-variables-reference.md) - All config options

## Next Steps

- [Resend Setup](./04-resend-setup.md) - Configure email notifications
- [Deployment Overview](../02-deployment/01-deployment-overview.md) - Deploy to production
