# Billing Journey - Manual Test Execution Report

**Test Date**: 2026-01-16
**Tester**: Claude Sonnet 4.5 (Manual Browser Testing)
**Browser**: Chrome
**Environment**: Local Development
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Stripe Webhook Listener: Terminal 8 (Active)

---

## Test Configuration

### Stripe Test Mode Configuration ✅
- **Secret Key**: sk_test_51SqH3ILkeiNaSEml... (Configured)
- **Publishable Key**: pk_test_51SqH3ILkeiNaSEml... (Configured)
- **Webhook Secret**: whsec_... (ephemeral `stripe listen` session secret, redacted)
- **Control Annual Price ID**: configured via `STRIPE_PRICE_ID_CONTROL_ANNUAL`
- **80OFF Coupon ID**: configured via `STRIPE_80OFF_COUPON_ID`
- **Webhook Listener**: ✅ Running (stripe listen --forward-to localhost:8000/webhooks/stripe)

### Test User Credentials
- **Email**: owner@acme.test.capveri.com
- **Password**: TestPass123!
- **Organization**: Acme Property Management
- **Role**: Owner (full billing access)

### Stripe Test Cards
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **3D Secure**: 4000 0025 0000 3155
- **Expiry**: Any future date (e.g., 12/34)
- **CVC**: Any 3 digits (e.g., 123)
- **ZIP**: Any 5 digits (e.g., 12345)

---

## TC14.1: Navigate to Pricing Page and View Plans

### Test Steps
1. ⏳ Open Chrome browser
2. ⏳ Navigate to http://localhost:5173
3. ⏳ Click "Pricing" in navigation menu (or navigate directly to /pricing)
4. ⏳ Verify page loads without errors
5. ? Verify Control plan card displays:
   - Plan name: "Control"
   - Price: "Reconcile unit-based annual total with 80OFF" and "$4,990/year list"
   - Features list visible
   - "Get Started" button present
6. ⏳ Verify Reconcile unit selector displays:
   - Plan name: "Enterprise"
   - Price: "Custom Pricing"
   - "Contact Sales" button present
7. ⏳ Verify monthly billing is not offered
8. ? Click "Get Started" on Control plan

### Expected Results
- Pricing page loads successfully
- Both plans displayed with correct pricing
- Pricing is annual only
- "Get Started" redirects to /checkout?tier=reconcile&units=25&offer=80OFF

### Actual Results
_To be filled during manual testing..._

### Status
⏳ PENDING - Ready to execute

### Screenshots
_To be captured during testing..._

---

## TC14.2: Complete Stripe Checkout Flow (5 Buildings)

### Pre-requisites
- TC14.1 completed successfully
- User logged in as owner@acme.test.capveri.com
- Currently on checkout page (/checkout?tier=reconcile&units=25&offer=80OFF)

### Test Steps
1. ⏳ Verify checkout page loaded correctly
2. ⏳ Verify plan shows "Control"
3. ⏳ Verify 80OFF is present
4. ⏳ Verify price calculation:
   - Annual: selected Reconcile unit-based annual total with 80OFF
5. ⏳ Verify annual billing is selected and monthly billing is not offered
6. ⏳ Verify "Total Today" shows the Stripe-hosted Control limited offer price
7. ⏳ Click "Proceed to Checkout" button
8. ⏳ Verify redirect to Stripe Checkout page
9. ⏳ On Stripe Checkout:
   - Enter email: test@example.com
   - Enter card: 4242 4242 4242 4242
   - Enter expiry: 12/34
   - Enter CVC: 123
   - Enter ZIP: 12345
10. ⏳ Click "Subscribe" on Stripe page
11. ⏳ Monitor Terminal 8 (Stripe webhook listener) for events:
    - customer.subscription.created
    - invoice.created
    - invoice.paid
12. ⏳ Verify redirect to success page (/billing/success or /settings/billing)
13. ⏳ Verify success message displayed

### Expected Results
- Checkout page calculates price correctly
- Stripe Checkout session created successfully
- Payment processed with test card
- Webhooks received and processed (200 OK responses)
- Subscription created in database with:
  - tier: "control"
  - launch_offer_code: "80OFF"
  - status: "active"
  - stripe_subscription_id: sub_xxx
  - stripe_customer_id: cus_xxx
- User redirected to success page

### Actual Results
_To be filled during manual testing..._

### Webhook Events to Capture
```
Expected in Terminal 8:
--> customer.subscription.created [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
--> invoice.created [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
--> invoice.paid [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
```

### Status
⏳ PENDING - Awaiting TC14.1 completion

---

## TC14.3: Verify Subscription in Billing Dashboard

### Pre-requisites
- TC14.2 completed successfully
- Subscription created and active

### Test Steps
1. ⏳ Navigate to http://localhost:5173/settings/billing
2. ⏳ Verify "Current Plan" card shows:
   - Plan name: "Control"
   - Status badge: "Active" (green)
   - Package: "Control"
   - Price: "Reconcile unit-based annual total with 80OFF"
3. ⏳ Verify "Next Billing Date" shows correct date (30 days from now)
4. ⏳ Verify "Payment Method" card shows:
   - Card type: "Visa"
   - Last 4 digits: "4242"
   - Expiry: "12/2034"
5. ⏳ Verify "Usage" card shows:
   - Properties used: Current property count
   - Buildings paid for: 5
   - Progress bar shows usage percentage
6. ⏳ Scroll down to verify action buttons:
   - "Manage Payment Methods"
   - "View Invoices"
   - "Cancel Subscription"

### Expected Results
- Billing dashboard displays all subscription details correctly
- All cards render without errors
- Data matches Stripe subscription (Control plan, Active)
- Payment method displays correctly

### Actual Results
_To be filled during manual testing..._

### Status
⏳ PENDING - Awaiting TC14.2 completion

---

## TC14.4: Add Property and Verify Building Count Sync

### Pre-requisites
- TC14.3 completed successfully
- Active Control subscription

### Test Steps
1. ⏳ Navigate to http://localhost:5173/properties
2. ⏳ Count current properties
3. ⏳ Click "Add Property" button
4. ⏳ Fill in property form:
   - Name: "Test Building for Billing Sync"
   - Address: "123 Billing Test St"
   - City: "San Francisco"
   - State: "CA"
   - ZIP: "94105"
   - Rentable Area: 50000
   - Usable Area: 45000
5. ⏳ Click "Create Property"
6. ⏳ Verify property created successfully (toast notification)
7. ⏳ **IMMEDIATELY** check Terminal 8 for webhook event:
   - customer.subscription.updated
   - Should show package activity if applicable
8. ⏳ Wait 2-3 seconds for webhook processing
9. ⏳ Navigate back to /settings/billing
10. ⏳ Verify usage remains within Control limits
11. ⏳ Verify price remains the selected Reconcile unit-based annual total with 80OFF
12. ⏳ Verify "Usage" card shows:
    - Properties used: current count
    - Package unit limit: within Control limits
    - Progress bar updated

### Expected Results
- Property creation triggers automatic building sync
- Subscription package remains Control
- Webhook received: customer.subscription.updated
- Database usage updates after property creation
- Billing dashboard reflects usage without per-building repricing
- No per-building proration is expected within package limits

### Actual Results
_To be filled during manual testing..._

### Webhook Events to Capture
```
Expected in Terminal 8 (immediately after property creation):
--> customer.subscription.updated [evt_xxx]
    Metadata: subscription/package activity if applicable
<-- [200] POST http://localhost:8000/webhooks/stripe
```

### Status
⏳ PENDING - Awaiting TC14.3 completion

---

## TC14.5: View Invoice History

### Pre-requisites
- TC14.4 completed successfully
- At least 1 invoice exists for the active Control subscription

### Test Steps
1. ⏳ Navigate to http://localhost:5173/settings/invoices
2. ⏳ Verify page loads without errors
3. ⏳ Verify invoice list displays the Control subscription invoice
4. ⏳ For the initial invoice (first in list):
   - Amount: $875
   - Status: "Paid" (green badge)
   - Date: Today's date
   - Description: "Subscription creation"
6. ⏳ Click "View Details" on first invoice
7. ⏳ Verify invoice details modal shows:
   - Invoice number
   - Line items for Control subscription with 80OFF
   - Total amount
   - Payment date
8. ⏳ Click "Download PDF" button
9. ⏳ Verify PDF opens in new tab (Stripe-hosted PDF)
10. ⏳ Verify PDF contains:
    - Organization name
    - Invoice details
    - Line items
    - Total amount

### Expected Results
- Invoice history page displays all invoices
- Invoices sorted by date (newest first)
- All invoices show correct amounts and status
- Invoice details modal displays complete information
- PDF download works and opens Stripe-hosted PDF

### Actual Results
_To be filled during manual testing..._

### Status
⏳ PENDING - Awaiting TC14.4 completion

---

## Additional Test Scenarios (Bonus)

### Bonus TC14.6: Test Building Count Decrease (Delete Property)

**Steps**:
1. Delete the property created in TC14.4
2. Verify webhook: customer.subscription.updated (6 → 5)
3. Verify billing dashboard shows 5 buildings again
4. Verify credit applied for removed building

**Expected**: Building count syncs down, credit issued

---

### Bonus TC14.7: Test Subscription Cancellation

**Steps**:
1. Navigate to /settings/billing
2. Click "Cancel Subscription"
3. Confirm cancellation
4. Verify status changes to "Canceling" with end date
5. Verify webhook: customer.subscription.updated (cancel_at_period_end=true)

**Expected**: Subscription scheduled for cancellation at period end

---

### Bonus TC14.8: Test Upgrade to Annual Billing

**Steps**:
1. Navigate to /settings/billing
2. Click "Switch to Annual Billing"
3. Verify price shows $12,000/year (20% discount)
4. Confirm upgrade
5. Verify webhook: customer.subscription.updated

**Expected**: Billing period changed to annual with discount applied

---

## Test Execution Summary

| Test Case | Status | Result | Duration | Notes |
|-----------|--------|--------|----------|-------|
| TC14.1: Pricing Page | ⏳ PENDING | - | - | Ready to execute |
| TC14.2: Checkout Flow | ⏳ PENDING | - | - | Awaiting TC14.1 |
| TC14.3: Billing Dashboard | ⏳ PENDING | - | - | Awaiting TC14.2 |
| TC14.4: Building Sync | ⏳ PENDING | - | - | Awaiting TC14.3 |
| TC14.5: Invoice History | ⏳ PENDING | - | - | Awaiting TC14.4 |

---

## Issues Found

_To be documented during testing..._

---

## Test Environment Verification

### Services Status
- ✅ Frontend: http://localhost:5173 (Running)
- ✅ Backend: http://localhost:8000 (Running)
- ✅ Supabase: Local instance (Running)
- ✅ Stripe Webhook Listener: Terminal 8 (Active)

### Pre-Test Checklist
- [x] Stripe test keys configured in backend/.env
- [x] Webhook listener running and forwarding to localhost:8000
- [x] Test user credentials available
- [x] Browser (Chrome) ready
- [x] Terminal 8 visible for webhook monitoring

---

## Next Steps

1. **Execute TC14.1**: Open Chrome, navigate to pricing page
2. **Document findings**: Screenshot each step, record actual results
3. **Monitor webhooks**: Keep Terminal 8 visible during checkout
4. **Update tracker**: After each test, update E2E_TEST_EXECUTION_TRACKER.md
5. **Report issues**: Document any bugs or unexpected behavior

---

**Ready to begin manual testing!** 🚀

_Awaiting manual execution in Chrome browser..._
