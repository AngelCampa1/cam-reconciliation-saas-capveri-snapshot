# Billing Flow Summary - Quick Reference

Visual summary of how CapVeri handles self-serve package selection, no-card trials, Stripe checkout, and the 80OFF limited offer.

## TL;DR

**Unit Pricing**: Reconcile is an annual subscription with progressive rentable-unit pricing.

**limited offer**: 80OFF applies 80% off the first year self-serve list prices during the limited offer.

**Trial First**: Users choose a package and start a 30-day no-card trial. They add billing before the trial ends to keep access.

---

## Quick Flow Diagram

```text
Customer Action          System Action                 Billing Result
===============          =============                 ==============

1. INITIAL SIGNUP
   Select Control      -> Save package selection     -> 30-day trial starts
   120 units, annual      with 80OFF                  $0 due today

2. ADD BILLING
   Click Add Billing   -> Stripe Checkout            -> Control annual
                          price_control_annual          80OFF coupon

3. CHANGE PACKAGE
   Pick Defend         -> Validate package/unit      -> Stripe session uses
   500-unit limit         selection                     Reconcile subscription price
```

---

## Code Trigger Points

### Trial Selection

**File**: `backend/app/api/v1/billing.py`

```python
@router.post("/trial/start")
async def start_trial(request: TrialStartRequest, ctx: OrgContext):
    _resolve_launch_offer_coupon(request.launch_offer_code)
    return _do_start_trial(
        ctx,
        plan_id=request.plan_id,
        billing_period="annual",
        unit_count=request.unit_count,
        building_count=request.building_count,
    )
```

### Paid Checkout

**File**: `backend/app/api/v1/billing.py`

```python
@router.post("/checkout")
async def create_checkout_session(request: CheckoutRequest, ctx: OrgContext, stripe_service):
    if request.offer_token and request.launch_offer_code:
        raise HTTPException(400, "Choose either a limited offer code or winback offer token, not both")

    coupon_id = _resolve_launch_offer_coupon(request.launch_offer_code)
    price_id = get_stripe_price_id_for_tier(request.plan_id, annual=True)

    return await stripe_service.create_checkout_session(
        line_items=[{"price": price_id}],
        coupon_id=coupon_id,
        metadata={
            "plan_id": request.plan_id,
            "pricing_model": "per_unit",
            "unit_count": str(request.unit_count),
            "building_count": str(request.building_count),
        },
        ...
    )
```

### Stripe Discount Handling

**File**: `backend/app/services/billing/stripe_client.py`

```python
if coupon_id:
    params["discounts"] = [{"coupon": coupon_id}]
else:
    params["allow_promotion_codes"] = True
```

Stripe Checkout cannot combine automatic `discounts` with manual `allow_promotion_codes`, so CapVeri enables manual entry only when no automatic coupon is being applied.

---

## Database Schema

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    organization_id UUID UNIQUE,
    tier TEXT,                       -- reconcile/control/defend
    billing_interval TEXT,           -- annual
    unit_count INTEGER,
    building_count INTEGER NOT NULL DEFAULT 1,
    plan subscription_plan NOT NULL, -- growth_v2 compatibility value
    stripe_subscription_id VARCHAR(255)
);
```

---

## Pricing Examples

### Control Annual With 80OFF

```text
List price:        $4,990/year
80OFF price:    $998/year
Due today:         $0 during no-card trial
Stripe checkout:   price_control_annual with 80OFF coupon
```

### Defend Annual With 80OFF

```text
List price:        $4,990/year
80OFF price:    $998/year
Due today:         $0 during no-card trial
Stripe checkout:   price_defend_annual with 80OFF coupon
```

---

## Stripe Dashboard View

```text
Subscription: sub_1ABC...
Status: Active
Customer: Acme Properties

Items:
- CapVeri Control annual
- Quantity: 1 package
- Amount: $998/year with 80OFF

Next billing date: Feb 16, 2026
```

---

## API Reference

```bash
# Start no-card trial with package selection
POST /api/v1/billing/trial/start
{
  "plan_id": "control",
  "unit_count": 120,
  "building_count": 12,
  "billing_period": "annual",
  "launch_offer_code": "80OFF"
}

# Create Stripe checkout after trial selection
POST /api/v1/billing/checkout
{
  "plan_id": "control",
  "unit_count": 120,
  "building_count": 12,
  "billing_period": "annual",
  "launch_offer_code": "80OFF",
  "success_url": "https://app.capveri.com/checkout/success",
  "cancel_url": "https://app.capveri.com/settings/billing"
}

# Get current subscription
GET /api/v1/billing/subscription
-> {
    "plan": "growth_v2",
    "tier": "control",
    "unit_count": 120,
    "building_count": 12,
    "status": "active"
  }
```

---

## Configuration

```env
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_reconcile_annual
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_control_annual
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_defend_annual
STRIPE_80OFF_COUPON_ID=80OFF
```

```text
Reconcile: $4,990/year list for up to 25 rentable units; $998/year with 80OFF
Control:   retired legacy package pricing
Defend:    retired legacy package pricing
```

---

## Testing Checklist

- [ ] Start trial from `/checkout?tier=reconcile&units=25&billing=annual&offer=80OFF`
- [ ] Verify billing activation stores plan, unit count, building count, and billing cadence
- [ ] Click Add Billing from billing settings
- [ ] Verify Stripe Checkout uses the selected package price ID
- [ ] Verify `STRIPE_80OFF_COUPON_ID` is sent as an automatic discount
- [ ] Verify manual promotion-code entry remains available when no automatic coupon is sent
- [ ] Complete checkout and verify subscription metadata stores package coverage

---

## Troubleshooting

### Checkout Selection Does Not Match

1. Check backend logs for validation errors.
2. Verify saved activation with `GET /api/v1/billing/plan-selection`.
3. Confirm checkout request matches saved plan, unit count, building count, and billing period.
4. Check Stripe Dashboard > Checkout Sessions > metadata.

### Launch Coupon Missing

1. Confirm `STRIPE_80OFF_COUPON_ID` is set in the backend environment.
2. Confirm frontend request includes `launch_offer_code: "80OFF"`.
3. Confirm checkout request does not also include a winback `offer_token`.
4. Confirm Stripe Checkout Session includes `discounts[0].coupon`.

### Charged Wrong Amount

1. Verify price IDs in environment variables.
2. Check Stripe product prices match package list prices.
3. Verify 80OFF coupon is configured as 80% off once.
4. Check for multiple subscriptions.

---

## Related Documentation

- [Stripe Setup Guide](./03-stripe-setup.md)
- [Stripe Dashboard Quickstart](./STRIPE_DASHBOARD_QUICKSTART.md)
- [Local Testing Guide](./STRIPE_LOCAL_TEST_QUICKSTART.md)
- `backend/app/api/v1/billing.py`
- `backend/app/services/billing/stripe_client.py`
- `backend/app/api/routes/webhooks.py`

---

## Key Takeaways

1. **Unit-based**: Reconcile maps to the annual Stripe price, with dynamic checkout totals for selected rentable units.
2. **Trial-first**: The app starts local no-card trial access before paid checkout.
3. **Offer-aware**: 80OFF is auto-applied from trusted app checkout flows.
4. **Non-stacking**: limited offers and winback offer tokens cannot be combined.
5. **Enterprise threshold**: Enterprise starts above 500 active rentable units or 50 buildings.

**Bottom Line**: Users choose a package and start a no-card trial first. Paid Stripe checkout uses the saved package selection and applies 80OFF when the limited offer is present.
