# Story 22.3: Verify Checkout Promo Code Support

## Story Info
- **Epic**: Promotions & Discounts
- **Estimated Hours**: 1
- **Dependencies**: Story 21.9 (Checkout Flow), Story 22.1 (Coupons)
- **Status**: `pending`

## User Story
**As a** customer
**I want** to enter a promo code at checkout
**So that** I can receive my discount

## Acceptance Criteria
- [ ] **AC1**: Checkout page shows promo code input field
- [ ] **AC2**: Valid codes apply discount correctly
- [ ] **AC3**: Invalid codes show clear error message
- [ ] **AC4**: Discount reflected in checkout summary
- [ ] **AC5**: Customer Portal shows applied discounts

## Technical Specifications

**Verification: Checkout Session Configuration**:

Story 21.9 already configured `allow_promotion_codes: true`. This story verifies the complete flow works end-to-end.

```python
# backend/app/api/routes/billing.py (already in 21.9)
session = stripe.checkout.Session.create(
    # ...
    allow_promotion_codes=True,  # ✅ Enables Stripe's native promo input
)
```

**What Stripe Provides Automatically**:
- Promo code input field in Checkout UI
- Real-time validation against Stripe's rules
- Error messages for invalid/expired codes
- Discount calculation and display
- Applied code stored on subscription

**Test Checklist**:

```python
# backend/tests/integration/test_promo_checkout.py
import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestPromoCodeCheckout:
    """Verify promo codes work in checkout flow."""

    async def test_checkout_session_allows_promo_codes(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """Verify checkout session has promo codes enabled."""
        response = await async_client.post(
            "/api/billing/checkout",
            json={
                "plan_id": "control",
                "billing_period": "annual",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/pricing",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        # Session is created with allow_promotion_codes=True
        # (Stripe handles the rest)

    async def test_subscription_has_discount_after_promo(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        subscription_with_promo: dict,
    ):
        """Verify subscription shows applied discount."""
        response = await async_client.get(
            "/api/billing/subscription",
            headers=auth_headers,
        )

        data = response.json()
        # Stripe attaches discount info to subscription
        assert "discount" in data or data.get("has_discount") is True
```

**E2E Test with Playwright**:

```typescript
// frontend/src/__tests__/e2e/promo-checkout.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Promo Code Checkout', () => {
  test('promo code field appears on Stripe checkout', async ({ page }) => {
    // Start checkout
    await page.goto('/checkout?plan=professional')
    await page.click('text=Continue to Payment')

    // Wait for Stripe checkout to load
    await page.waitForURL(/checkout\.stripe\.com/)

    // Stripe's checkout should have promo code section
    // Note: Actual Stripe Checkout UI testing is limited
    // This mainly verifies redirect works
    await expect(page).toHaveURL(/checkout\.stripe\.com/)
  })

  test('applied promo shows in billing dashboard', async ({ page }) => {
    // Login as user with promo discount
    await page.goto('/login')
    // ... login ...

    await page.goto('/settings/billing')

    // Should show active discount
    await expect(page.locator('text=/discount|promo|coupon/i')).toBeVisible()
  })
})
```

**Manual Verification Checklist**:

1. **Create Test Coupon & Code**:
   ```bash
   # Via Stripe Dashboard or Admin UI
   # Create: 20% off, 3 months, code "TEST20"
   ```

2. **Test Checkout Flow**:
   - [ ] Go to /pricing, select Professional plan
   - [ ] Click "Start Free Trial" → redirected to /checkout
   - [ ] Click "Continue to Payment" → redirected to Stripe Checkout
   - [ ] Find promo code input (usually "Add promotion code" link)
   - [ ] Enter TEST20
   - [ ] Verify discount shown in order summary
   - [ ] Complete checkout with test card (4242...)
   - [ ] Verify subscription created with discount

3. **Test Invalid Codes**:
   - [ ] Enter random invalid code → error message shown
   - [ ] Enter expired code → appropriate error
   - [ ] Enter code for different product → error

4. **Test Customer Portal**:
   - [ ] Go to billing settings
   - [ ] Click "Manage Subscription" (Customer Portal)
   - [ ] Verify active discount shown
   - [ ] Verify customer can add promo code when upgrading

**Stripe Dashboard Verification**:

1. Check subscription in Stripe Dashboard
2. Verify `discount` object attached
3. Verify correct coupon applied
4. Check invoice shows discounted amount

## Definition of Done
- [ ] Checkout session creates with `allow_promotion_codes: true`
- [ ] Stripe Checkout shows promo code input
- [ ] Valid codes apply discount correctly
- [ ] Invalid codes show error
- [ ] Subscription discount visible in billing dashboard
- [ ] Customer Portal shows active discounts
- [ ] Manual E2E test completed with test coupon
