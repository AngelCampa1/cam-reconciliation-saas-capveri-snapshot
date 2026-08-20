# Billing Journey - Quick Start Guide

**YOU ARE HERE**: Ready to manually test the complete billing journey in Chrome

---

## What I've Prepared For You

1. ✅ **Comprehensive Test Plan**: `BILLING_JOURNEY_TEST_REPORT.md`
2. ✅ **Test Tracker Updated**: `E2E_TEST_EXECUTION_TRACKER.md` - Journey 14 section
3. ✅ **All Services Running**:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:8000
   - Stripe Webhook Listener: Terminal 8 (Active)
4. ✅ **Stripe Fully Configured**: Test keys, price IDs, webhook secret all set

---

## Quick Test Execution Steps

### Step 1: Login (If Not Already Logged In)
1. Open Chrome: http://localhost:5173
2. Login with:
   - Email: `owner@acme.test.capveri.com`
   - Password: `TestPass123!`

### Step 2: TC14.1 - View Pricing Page
1. Navigate to: http://localhost:5173/pricing
2. **Look for**:
   - Reconcile: $998/year with 80OFF ($4,990/year list for up to 25 rentable units)
   - Rentable-unit slider and textbox
   - Extra-unit bands above 25 rentable units
   - Annual-only billing
3. Click "Get Started" on Reconcile
4. **Expected**: Redirects to /checkout?tier=reconcile&units=25&offer=80OFF

### Step 3: TC14.2 - Complete Checkout
1. On checkout page:
   - Verify subscription: **Reconcile**
   - Verify selected rentable-unit count
   - Verify price: **Reconcile unit-based annual total with 80OFF**
   - Verify annual billing is selected and monthly billing is not offered
2. Click "Proceed to Checkout"
3. On Stripe page, enter:
   - Email: test@example.com
   - Card: **4242 4242 4242 4242**
   - Expiry: **12/34**
   - CVC: **123**
   - ZIP: **12345**
4. Click "Subscribe"
5. **WATCH Terminal 8** for webhooks:
   ```
   --> customer.subscription.created
   --> invoice.created
   --> invoice.paid
   ```
6. **Expected**: Redirects to success page

### Step 4: TC14.3 - View Billing Dashboard
1. Navigate to: http://localhost:5173/settings/billing
2. **Verify**:
   - Current Plan: "Reconcile"
   - Status: "Active" (green)
   - Price: "Reconcile unit-based annual total with 80OFF"
   - Payment Method: Visa •••• 4242

### Step 5: TC14.4 - Add Property (Test Building Sync)
1. Navigate to: http://localhost:5173/properties
2. Click "Add Property"
3. Fill in:
   - Name: "Test Building for Billing Sync"
   - Address: "123 Billing Test St"
   - City: "San Francisco"
   - State: "CA"
   - ZIP: "94105"
   - Rentable Area: 50000
   - Usable Area: 45000
4. Click "Create Property"
5. **IMMEDIATELY WATCH Terminal 8** for any subscription or invoice events.
   ```
   --> customer.subscription.updated [if applicable]
   ```
6. Go back to /settings/billing
7. **Verify**: Usage remains within Control limits and package price remains "$998/year with 80OFF"

### Step 6: TC14.5 - View Invoices
1. Navigate to: http://localhost:5173/settings/invoices
2. **Verify**:
   - At least 2 invoices listed
   - First invoice: selected Reconcile unit-based annual total with 80OFF
   - Any additional invoices match Stripe subscription activity
   - Both status: "Paid"
3. Click "Download PDF" on first invoice
4. **Expected**: PDF opens in new tab

---

## What To Report Back

After each test case, tell me:

1. **What you saw** (screenshots helpful!)
2. **Any errors** (console errors, API failures, UI bugs)
3. **Webhook events** (copy from Terminal 8)
4. **Pass/Fail** for each test case

I will then:
- Update the test tracker
- Document any issues
- Help debug if something fails
- Verify database state

---

## Test Cards Reference

| Purpose | Card Number | Result |
|---------|-------------|--------|
| Success | 4242 4242 4242 4242 | Payment succeeds |
| Decline | 4000 0000 0000 0002 | Card declined |
| 3D Secure | 4000 0025 0000 3155 | Requires authentication |

All cards:
- Expiry: 12/34 (any future date)
- CVC: 123 (any 3 digits)
- ZIP: 12345 (any 5 digits)

---

## Terminal 8 - What To Watch For

Keep Terminal 8 visible during testing. You should see:

**During Checkout (TC14.2)**:
```
--> customer.subscription.created [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
--> invoice.created [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
--> invoice.paid [evt_xxx]
<-- [200] POST http://localhost:8000/webhooks/stripe
```

**During Property Creation (TC14.4)**:
```
--> customer.subscription.updated [if applicable]
<-- [200] POST http://localhost:8000/webhooks/stripe
```

All responses should be `[200]`. If you see `[400]` or `[500]`, that's an error!

---

## Ready to Start?

1. Open Chrome
2. Navigate to http://localhost:5173
3. Start with TC14.1 (Pricing Page)
4. Report back what you see!

I'll be monitoring the backend logs and ready to help debug any issues.

**Let's test the billing journey!** 🚀
