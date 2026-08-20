# Epic 22: Promotions & Discounts

## Epic Overview
**Goal**: Provide admin UI for managing Stripe coupons and promotion codes, leveraging Stripe's native discount system.

**Business Value**: Drive customer acquisition through promotional offers while using Stripe's battle-tested discount infrastructure.

## Design Principle: Stripe-First

This epic follows a **Stripe-first approach**:
- All discount logic, validation, and enforcement handled by Stripe
- We build admin UI wrappers around Stripe's Coupon and Promotion Code APIs
- Minimal local storage (only for caching/reporting if needed)
- Checkout already supports promo codes via `allow_promotion_codes: true`

## Stories

| ID | Story | Hours | Dependencies |
|----|-------|-------|--------------|
| 22.1 | Create Stripe Coupon Admin UI | 3 | 21.1 (Stripe Client) |
| 22.2 | Create Promotion Code Admin UI | 3 | 22.1 |
| 22.3 | Verify Checkout Promo Code Support | 1 | 21.9 (Checkout Flow) |
| 22.4 | Create Promotion Analytics Dashboard | 2 | 22.1, 22.2 |

**Total Estimated Hours**: 9

## What Stripe Handles Natively

### Coupons (Discount Definitions)
- **Percentage off** - Up to 100%
- **Fixed amount off** - With multi-currency support
- **Duration** - Once, repeating (N months), or forever
- **Product restrictions** - Limit to specific products
- **Max redemptions** - Total uses across all customers
- **Expiration** - `redeem_by` timestamp

### Promotion Codes (Customer-Facing)
- **Custom or auto-generated codes** - e.g., "SUMMER2024"
- **Customer restriction** - Limit to specific customer
- **First-time transaction** - New customers only
- **Minimum amount** - Purchase threshold
- **Separate limits** - Max redemptions, expiration per code
- **Multiple codes per coupon** - FALL20 and FRIENDS20 → same 20% coupon

### Automatic Features
- Validation at checkout (Stripe handles all rule checking)
- Proration when subscription changes
- Customer Portal integration (customers can apply codes)
- Webhook events for tracking (`coupon.*`, `customer.discount.*`)

## What We Build

### Admin UI
- Create/edit/delete coupons via Stripe API
- Create/manage promotion codes with restrictions
- View redemption stats from Stripe

### Verification
- Confirm `allow_promotion_codes: true` in checkout works
- Test Customer Portal promo code flow

### Analytics (Optional)
- Dashboard showing redemption trends
- Pull data from Stripe API for reporting

## Technical Architecture

### No Custom Database Tables Needed
Stripe is the source of truth for:
- Coupon definitions
- Promotion code configurations
- Redemption counts
- Active discounts on subscriptions

### API Wrapper Pattern
```python
# Thin wrapper around Stripe SDK
class PromotionService:
    async def create_coupon(self, params: CouponCreate) -> stripe.Coupon:
        return stripe.Coupon.create(**params.model_dump())

    async def create_promotion_code(self, coupon_id: str, params: PromoCodeCreate):
        return stripe.PromotionCode.create(coupon=coupon_id, **params.model_dump())

    async def list_coupons(self) -> list[stripe.Coupon]:
        return stripe.Coupon.list(limit=100).data
```

### Checkout Integration
Already implemented in Story 21.9:
```python
session = stripe.checkout.Session.create(
    # ...
    allow_promotion_codes=True,  # Enables promo code input
)
```

## Dependencies

### Required Before Starting
- Story 21.1 (Stripe Client Configuration)
- Story 21.9 (Checkout Flow) - for verification

### Not Required
- ~~Story 2.17 (Promotion Model)~~ - Not needed, Stripe is source of truth
- ~~Story 3.17 (Promotions Table)~~ - Not needed, no local storage required

## Key Files

### Backend
```
backend/app/
├── api/routes/
│   └── promotions.py      # Admin endpoints wrapping Stripe
└── services/
    └── promotions.py      # Stripe API wrapper
```

### Frontend
```
frontend/src/
├── pages/admin/
│   ├── Coupons.tsx        # Coupon management
│   └── PromoCodes.tsx     # Promotion code management
└── components/promotions/
    ├── CouponForm.tsx
    └── PromoCodeForm.tsx
```

## Out of Scope

- Custom eligibility rules beyond Stripe's capabilities
- Local promotion storage (Stripe is source of truth)
- Gift cards (separate Stripe product)
- Referral program (Epic 24 if needed)
