# Stripe Dashboard Setup - Quick Start Guide

Complete guide for setting up your Stripe account and configuring products/prices for CapVeri billing.

## Overview

This guide walks you through:
1. Creating a Stripe account
2. Navigating the dashboard
3. Creating products and prices
4. ~~Configuring webhooks~~ **SKIP for local testing** (use Stripe CLI instead)
5. Getting your API keys
6. Setting up the customer portal

**Time required**: 15-20 minutes

---

## 🚨 Local Testing vs Production

**If you're testing locally**:
- ✅ Follow Steps 1-4 (account, products, API keys)
- ❌ **SKIP Step 5** (webhooks) - use Stripe CLI instead
- ✅ Follow Step 6 (customer portal)
- 📖 Then go to [Local Testing Guide](./STRIPE_LOCAL_TEST_QUICKSTART.md)

**If you're deploying to production**:
- ✅ Follow all steps including Step 5 (webhooks)

**Time required**: 15-20 minutes

---

## Step 1: Create Stripe Account

### Sign Up

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Click **Sign up**
3. Enter your email and create a password
4. Verify your email address

### Initial Setup

After signing in, you'll see the Stripe Dashboard. Notice the **Test mode** toggle in the top right - keep it ON for now.

**Important**: Stripe has two completely separate environments:
- **Test mode** (orange/red indicator): For development, uses test keys
- **Live mode** (green indicator): For production, uses live keys

---

## Step 2: Navigate to Products

1. In the left sidebar, click **Product catalog** (or **Products**)
2. You'll see an empty products list
3. Click **+ Add product** button (top right)

---

## Step 3: Create Package Products

### Product Details

1. **Name**: `CapVeri Control`
2. **Description**: `Portfolio controls and reporting package`
3. **Image**: Upload logo (optional)
4. Click **Add pricing**

### Annual Price

1. **Pricing model**: Select **Standard pricing**
2. **Price**: `17490.00` (Control annual list price)
3. **Billing period**: **Yearly**
4. **Currency**: **USD**
5. **Price description**: `Control annual` (optional)
6. Click **Add price**

You'll see the price appear with an ID like `price_1ABCxyz...`

Repeat this product setup for the other annual packages:

- `CapVeri Reconcile`: `6990.00` yearly
- `CapVeri Defend`: `34990.00` yearly

### Save Product

1. Click **Save product** at the bottom
2. You'll be taken to the product detail page

### Copy Price IDs

**CRITICAL**: Copy these price IDs - you'll need them for your `.env` file:

1. Click on the **Annual** price
2. Copy the **Price ID** (starts with `price_`)
   - Example: `price_1QRfVwKF2eZvKYlo2C3D4E5F`

**Save these somewhere** - you'll use them in Step 6.

---

## Step 4: Create Enterprise Plan Product (Optional)

Enterprise is typically "Contact Sales" only, but you can create a product for tracking:

1. Click **+ Add product** again
2. **Name**: `CapVeri Enterprise`
3. **Description**: `Unlimited buildings, priority support, custom integrations`
4. **Do NOT add pricing** (contact sales only)
5. Click **Save product**

---

## Step 5: Configure Webhooks

Webhooks notify your backend when subscription events occur.

### For Local Testing: SKIP THIS STEP

**If you're testing locally**, do NOT create a webhook endpoint in the dashboard. Instead:

1. Use Stripe CLI to forward webhooks: `stripe listen --forward-to localhost:8000/webhooks/stripe`
2. The CLI will give you a webhook secret starting with `whsec_`
3. See [Local Testing Guide](./STRIPE_LOCAL_TEST_QUICKSTART.md) for complete setup

**The rest of this step is for production deployment only.**

---

### For Production: Create Webhook Endpoint

1. In left sidebar, click **Developers**
2. Click **Webhooks** tab
3. Click **+ Add endpoint**

### Endpoint Configuration

1. **Endpoint URL**:
   - Production: `https://api.capveri.com/webhooks/stripe`
   - Staging: `https://staging-api.capveri.com/webhooks/stripe`

2. **Description**: `CapVeri Production Webhooks` (optional)

3. **Events to send**: Click **Select events**

### Select Events

Choose these events (use search to find them quickly):

**Subscription Events**:
- ✅ `customer.subscription.created`
- ✅ `customer.subscription.updated`
- ✅ `customer.subscription.deleted`

**Invoice Events**:
- ✅ `invoice.created`
- ✅ `invoice.paid`
- ✅ `invoice.payment_failed`

**Checkout Events** (optional but recommended):
- ✅ `checkout.session.completed`
- ✅ `checkout.session.expired`

Click **Add events** at the bottom.

### Save and Get Signing Secret

1. Click **Add endpoint**
2. You'll see your new endpoint in the list
3. Click on the endpoint to view details
4. Click **Reveal** next to **Signing secret**
5. Copy the secret (starts with `whsec_`)

**CRITICAL**: Save this webhook signing secret - you'll need it for your `.env` file.

---

## Step 6: Get API Keys

### Navigate to API Keys

1. In left sidebar, click **Developers**
2. Click **API keys** tab
3. You'll see two keys:
   - **Publishable key** (starts with `pk_test_` in test mode)
   - **Secret key** (starts with `sk_test_` in test mode)

### Copy Keys

1. **Publishable key**: Click to copy
   - This is safe to use in frontend code
   - Example: `pk_test_51ABCxyzKF2eZvKYlo...`

2. **Secret key**: Click **Reveal test key**, then copy
   - ⚠️ **NEVER** commit this to git or expose in frontend
   - Example: `sk_test_51ABCxyzKF2eZvKYlo...`

---

## Step 7: Configure Your Environment

Now update your `backend/.env` file with the values you collected:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51ABCxyzKF2eZvKYlo...
STRIPE_PUBLISHABLE_KEY=pk_test_51ABCxyzKF2eZvKYlo...
STRIPE_WEBHOOK_SECRET=whsec_1ABCxyz...

# Price IDs (from Step 3)
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_reconcile_annual
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_control_annual
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_defend_annual
STRIPE_80OFF_COUPON_ID=80OFF
STRIPE_PRICE_ID_ENTERPRISE=
```

**For frontend** (if needed), create/update `frontend/.env`:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51ABCxyzKF2eZvKYlo...
```

---

## Step 8: Configure Customer Portal

The customer portal lets customers manage their subscriptions self-service.

### Navigate to Portal Settings

1. In left sidebar, click **Settings** (bottom)
2. Click **Billing** in the settings menu
3. Click **Customer portal**

### Enable Features

**Customer information**:
- ✅ Allow customers to update email

**Invoice history**:
- ✅ Allow customers to view invoices
- ✅ Allow customers to download invoices

**Payment methods**:
- ✅ Allow customers to update payment methods
- ✅ Allow customers to remove payment methods

**Subscriptions**:
- ✅ Allow customers to switch plans
- ✅ Allow customers to cancel subscriptions

### Cancellation Settings

Under **Subscription cancellation**:

1. **Cancellation behavior**:
   - ✅ Cancel at end of billing period (recommended)
   - Or: ✅ Cancel immediately (if you prefer)

2. **Cancellation reasons** (optional):
   - ✅ Too expensive
   - ✅ Missing features
   - ✅ Switched to competitor
   - ✅ Unused
   - ✅ Customer service
   - ✅ Too complex
   - ✅ Other

3. **Retention strategies** (optional):
   - Offer discount
   - Pause subscription
   - Switch to lower plan

### Save Settings

Click **Save** at the bottom.

---

## Step 9: Test Your Setup

### Verify Products

1. Go to **Product catalog**
2. Confirm you see:
   - ✅ CapVeri Reconcile with annual pricing
   - ✅ CapVeri Enterprise (optional)

### Verify Webhooks

1. Go to **Developers** > **Webhooks**
2. Confirm endpoint is listed
3. Status should show "Enabled"

### Verify API Keys

1. Go to **Developers** > **API keys**
2. Confirm both keys are visible
3. Note the **Test mode** indicator

---

## Step 10: Quick Reference Summary

Copy these values to your password manager or secure notes:

```
=== STRIPE TEST MODE ===

Secret Key:
sk_test_51ABCxyz...

Publishable Key:
pk_test_51ABCxyz...

Webhook Secret:
whsec_1ABCxyz...

Reconcile Annual Price ID:
price_1ABCxyz...

Control Annual Price ID:
price_1DEFxyz...

Defend Annual Price ID:
price_1GHIxyz...

Webhook Endpoint:
https://api.capveri.com/webhooks/stripe
```

---

## Dashboard Navigation Quick Reference

### Key Sections

| Section | Purpose | Common Tasks |
|---------|---------|--------------|
| **Home** | Overview, recent activity | Monitor daily activity |
| **Payments** | All payment transactions | View successful/failed payments |
| **Customers** | Customer database | Search customers, view history |
| **Subscriptions** | Active subscriptions | Monitor MRR, churn, upgrades |
| **Products** | Product catalog | Edit prices, add products |
| **Billing** | Invoices, billing settings | View invoices, configure portal |
| **Developers** | API keys, webhooks, logs | Debug issues, view API calls |
| **Reports** | Analytics and reporting | Revenue reports, growth metrics |
| **Settings** | Account configuration | Business details, team access |

### Top Bar Features

- **Search bar**: Find customers, payments, subscriptions by ID or email
- **Test mode toggle**: Switch between test and live data
- **Help button**: Access Stripe documentation
- **Account menu**: Settings, team, logout

---

## Common Tasks

### Find a Customer

1. Use search bar at top
2. Type customer email or Stripe customer ID
3. Click result to view customer details

### View Subscription Details

1. Go to **Subscriptions**
2. Click on subscription
3. See plan, status, billing history, upcoming invoice

### Check Webhook Delivery

1. Go to **Developers** > **Webhooks**
2. Click on your endpoint
3. Click **Attempts** tab
4. See all webhook deliveries (success/failure)

### View API Logs

1. Go to **Developers** > **Logs**
2. See all API requests
3. Filter by status code, method, endpoint
4. Click request to see full details

### Test a Payment

1. Go to **Developers** > **Testing**
2. Use test card: `4242 4242 4242 4242`
3. Any future expiry, any CVC
4. Complete checkout flow

---

## Test Mode vs Live Mode

### Test Mode (Development)

- **Indicator**: Orange/red "Test mode" badge
- **API Keys**: Start with `sk_test_` and `pk_test_`
- **Cards**: Only test cards work (4242...)
- **Data**: Completely separate from live
- **Webhooks**: Use Stripe CLI for local development

**Use for**: Development, staging, testing

### Live Mode (Production)

- **Indicator**: Green "Live mode" badge
- **API Keys**: Start with `sk_live_` and `pk_live_`
- **Cards**: Real credit cards only
- **Data**: Real customer data and payments
- **Webhooks**: Must configure in dashboard

**Use for**: Production only

### Switching Modes

Click the **Test mode** toggle in top right to switch. Everything changes:
- Different API keys
- Different data
- Different webhooks
- Different products (must recreate in live mode)

---

## Going Live Checklist

Before switching to live mode:

- [ ] Complete Stripe business verification
- [ ] Add business details (Settings > Business)
- [ ] Add bank account for payouts
- [ ] Verify tax settings
- [ ] Recreate products in live mode
- [ ] Copy live API keys
- [ ] Update webhook endpoint to production URL
- [ ] Copy new webhook signing secret
- [ ] Test with small real payment
- [ ] Monitor dashboard for first few transactions

---

## Security Best Practices

### API Keys

- ✅ **DO**: Store secret keys in environment variables
- ✅ **DO**: Use different keys for dev/staging/prod
- ✅ **DO**: Rotate keys if compromised
- ❌ **DON'T**: Commit secret keys to git
- ❌ **DON'T**: Share keys via email/Slack
- ❌ **DON'T**: Use live keys in test environments

### Webhook Security

- ✅ **DO**: Always verify webhook signatures
- ✅ **DO**: Use HTTPS endpoints only
- ✅ **DO**: Make handlers idempotent
- ❌ **DON'T**: Trust webhook data without verification
- ❌ **DON'T**: Expose webhook URLs publicly

### Customer Data

- ✅ **DO**: Use Stripe's hosted checkout when possible
- ✅ **DO**: Let Stripe store payment methods
- ✅ **DO**: Use customer portal for self-service
- ❌ **DON'T**: Store raw card numbers
- ❌ **DON'T**: Log sensitive payment data

---

## Troubleshooting

### Can't Find Products

**Issue**: Products not showing up

**Solutions**:
- Check you're in the right mode (test vs live)
- Products must be recreated in each mode
- Refresh the page

### Webhook Not Working

**Issue**: Webhooks not being received

**Solutions**:
- Check endpoint URL is correct
- Verify endpoint is HTTPS (not HTTP)
- Check webhook signing secret matches
- View webhook attempts in dashboard
- Check your server logs for errors

### API Key Invalid

**Issue**: "Invalid API key" error

**Solutions**:
- Verify you're using the right key for the mode
- Check for extra spaces when copying
- Ensure key hasn't been deleted
- Try revealing and re-copying the key

### Payment Declined

**Issue**: Test payment failing

**Solutions**:
- Use test card `4242 4242 4242 4242`
- Check you're in test mode
- Use any future expiry date
- Use any 3-digit CVC

---

## Next Steps

After completing this setup:

1. **Test locally**: Follow [Local Testing Guide](./STRIPE_LOCAL_TEST_QUICKSTART.md)
2. **Integrate frontend**: Add Stripe.js and checkout flow
3. **Test webhooks**: Verify all events are processed
4. **Go live**: Switch to live mode and deploy

---

## Helpful Resources

### Stripe Documentation

- **Getting Started**: https://stripe.com/docs/development
- **Testing**: https://stripe.com/docs/testing
- **Webhooks**: https://stripe.com/docs/webhooks
- **Subscriptions**: https://stripe.com/docs/billing/subscriptions/overview
- **Customer Portal**: https://stripe.com/docs/billing/subscriptions/integrating-customer-portal

### CapVeri Documentation

- [Full Stripe Setup Guide](./03-stripe-setup.md) - Complete implementation details
- [Local Testing Guide](./STRIPE_LOCAL_TEST_QUICKSTART.md) - Test before production
- [Environment Variables](../02-deployment/05-environment-variables-reference.md) - All config options

### Support

- **Stripe Support**: https://support.stripe.com
- **Stripe Status**: https://status.stripe.com
- **Community**: https://github.com/stripe

---

## Summary

You've now completed:

- ✅ Created Stripe account
- ✅ Set up products and prices
- ✅ Configured webhooks
- ✅ Retrieved API keys
- ✅ Configured customer portal
- ✅ Updated environment variables

**You're ready to start testing!**

Next: [Test Stripe locally](./STRIPE_LOCAL_TEST_QUICKSTART.md) before going to production.
