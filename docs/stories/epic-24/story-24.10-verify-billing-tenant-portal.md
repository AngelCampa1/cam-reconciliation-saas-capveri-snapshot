# Story 24.10: Verify Billing & Tenant Portal (Epics 19, 21)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 5 hours
**Status**: `pending`
**Dependencies**: Epics 19, 21

---

## User Story

As a **platform user**,
I want to **verify that billing works correctly and tenant users can access their data securely**,
So that **subscription payments are collected and tenants can view their reconciliation results**.

---

## Acceptance Criteria

### Billing & Subscriptions (Epic 21)
- [ ] User can view pricing plans
- [ ] User can start free trial
- [ ] User can upgrade to paid plan
- [ ] User can add payment method
- [ ] Stripe checkout flow works correctly
- [ ] Subscription status is tracked correctly
- [ ] Invoices are generated on schedule
- [ ] Invoice display shows correct amounts
- [ ] Webhooks update subscription status
- [ ] Usage tracking works correctly

### Tenant Portal (Epic 19)
- [ ] Landlord can invite tenant user
- [ ] Tenant receives invitation email
- [ ] Tenant can activate account with secure token
- [ ] Tenant can view reconciliation results (read-only)
- [ ] Tenant can download their packet PDF
- [ ] Tenant can submit dispute
- [ ] Landlord receives dispute notification
- [ ] Tenant cannot access other tenants' data
- [ ] Tenant cannot modify reconciliation data
- [ ] Rate limiting prevents abuse

### Authorization
- [ ] Tenant users can only access their own leases
- [ ] Tenant users cannot access landlord features
- [ ] Cross-tenant access is blocked
- [ ] Dispute state machine prevents invalid transitions

---

## Technical Specifications

### E2E Billing Test

```typescript
// frontend/tests/e2e/billing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Billing Flow', () => {
  test.use({ storageState: 'auth-state.json' });

  test('Complete subscription workflow', async ({ page }) => {
    // 1. View pricing
    await page.goto('/pricing');
    await expect(page.locator('text=Control')).toBeVisible();
    await expect(page.locator('text=$4,990/year')).toBeVisible();

    // 2. Start free trial
    await page.click('button:has-text("Start Free Trial")');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Trial active')).toBeVisible();

    // 3. Upgrade to paid plan
    await page.goto('/billing');
    await page.click('button:has-text("Upgrade to Control")');

    // Should redirect to Stripe checkout
    await expect(page).toHaveURL(/checkout.stripe.com/);

    // Note: Actual Stripe checkout requires test mode credentials
    // Mock the callback for testing
    await page.goto('/checkout/success?session_id=test_session');

    // Should show success message
    await expect(page.locator('text=Subscription activated')).toBeVisible();

    // 4. View billing dashboard
    await page.goto('/billing');
    await expect(page.locator('text=Control Plan')).toBeVisible();
    await expect(page.locator('text=$4,990/year')).toBeVisible();

    // 5. View invoices
    await page.click('text=View Invoices');
    await expect(page.locator('.invoice-list')).toBeVisible();

    const invoices = await page.locator('.invoice-item').count();
    expect(invoices).toBeGreaterThan(0);

    // 6. Download invoice
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Download"):first'),
    ]);
    expect(download.suggestedFilename()).toMatch(/invoice.*\.pdf/);
  });

  test('Usage tracking updates correctly', async ({ page }) => {
    await page.goto('/billing');

    // Initial usage
    const initialUsage = await page.locator('[data-testid="current-usage"]').textContent();
    const initialCount = parseInt(initialUsage || '0');

    // Perform billable action (run reconciliation)
    await page.goto('/reconciliation/new');
    await page.selectOption('select[name="propertyId"]', 'test-property-id');
    await page.fill('input[name="periodStart"]', '2024-01-01');
    await page.fill('input[name="periodEnd"]', '2024-12-31');
    await page.click('button:has-text("Calculate")');
    await expect(page.locator('text=Calculation complete'), { timeout: 10000 }).toBeVisible();

    // Check usage incremented
    await page.goto('/billing');
    const newUsage = await page.locator('[data-testid="current-usage"]').textContent();
    const newCount = parseInt(newUsage || '0');
    expect(newCount).toBe(initialCount + 1);
  });
});
```

### E2E Tenant Portal Test

```typescript
// frontend/tests/e2e/tenant-portal.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Tenant Portal', () => {
  test('Landlord invites tenant, tenant accepts and views data', async ({ browser }) => {
    // Landlord context
    const landlordContext = await browser.newContext({ storageState: 'landlord-auth.json' });
    const landlordPage = await landlordContext.newPage();

    // 1. Landlord invites tenant
    await landlordPage.goto('/leases/test-lease-id');
    await landlordPage.click('button:has-text("Invite Tenant")');
    await landlordPage.fill('input[name="email"]', 'tenant@example.com');
    await landlordPage.click('button:has-text("Send Invitation")');

    await expect(landlordPage.locator('text=Invitation sent')).toBeVisible();

    // Get invitation token (in real app, this would be in email)
    const invitationToken = await landlordPage.evaluate(() => {
      return localStorage.getItem('last_invitation_token');
    });

    // Tenant context
    const tenantContext = await browser.newContext();
    const tenantPage = await tenantContext.newPage();

    // 2. Tenant accepts invitation
    await tenantPage.goto(`/tenant/accept-invitation?token=${invitationToken}`);
    await tenantPage.fill('input[name="password"]', 'SecurePass123!');
    await tenantPage.fill('input[name="confirmPassword"]', 'SecurePass123!');
    await tenantPage.click('button:has-text("Activate Account")');

    // Should redirect to tenant dashboard
    await expect(tenantPage).toHaveURL('/tenant/dashboard');
    await expect(tenantPage.locator('text=Welcome')).toBeVisible();

    // 3. Tenant views reconciliation results
    await tenantPage.click('text=View Reconciliation');
    await expect(tenantPage.locator('text=Reconciliation Results')).toBeVisible();

    // Should see tenant-specific data (read-only)
    await expect(tenantPage.locator('text=Your Billable Amount')).toBeVisible();
    await expect(tenantPage.locator('button:has-text("Edit")')).not.toBeVisible(); // Read-only

    // 4. Tenant downloads packet
    const [download] = await Promise.all([
      tenantPage.waitForEvent('download'),
      tenantPage.click('button:has-text("Download Packet")'),
    ]);
    expect(download.suggestedFilename()).toMatch(/reconciliation.*\.pdf/);

    // 5. Tenant submits dispute
    await tenantPage.click('button:has-text("Submit Dispute")');
    await tenantPage.fill('textarea[name="description"]', 'Incorrect janitorial expense allocation');
    await tenantPage.selectOption('select[name="category"]', 'calculation_error');
    await tenantPage.click('button[type="submit"]');

    await expect(tenantPage.locator('text=Dispute submitted')).toBeVisible();

    // 6. Landlord receives notification
    await landlordPage.goto('/disputes');
    await expect(landlordPage.locator('text=New dispute from tenant@example.com')).toBeVisible();
  });

  test('Tenant cannot access other tenants data', async ({ browser }) => {
    const tenantAContext = await browser.newContext({ storageState: 'tenant-a-auth.json' });
    const tenantBContext = await browser.newContext({ storageState: 'tenant-b-auth.json' });

    const tenantAPage = await tenantAContext.newPage();
    const tenantBPage = await tenantBContext.newPage();

    // Tenant A views their reconciliation
    await tenantAPage.goto('/tenant/reconciliation/tenant-a-snapshot-id');
    await expect(tenantAPage.locator('text=Reconciliation Results')).toBeVisible();

    const tenantASnapshotUrl = tenantAPage.url();

    // Tenant B tries to access Tenant A's URL
    await tenantBPage.goto(tenantASnapshotUrl);

    // Should see 404 or redirect (RLS blocks access)
    await expect(tenantBPage.locator('text=not found')).toBeVisible().catch(() => {
      expect(tenantBPage.url()).not.toBe(tenantASnapshotUrl);
    });
  });

  test('Dispute rate limiting works', async ({ page }) => {
    await page.goto('/tenant/dashboard', { waitUntil: 'networkidle' });

    // Submit 3 disputes (should succeed)
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Submit Dispute")');
      await page.fill('textarea[name="description"]', `Dispute ${i + 1}`);
      await page.click('button[type="submit"]');
      await expect(page.locator('text=Dispute submitted')).toBeVisible();
    }

    // 4th dispute should be rate limited
    await page.click('button:has-text("Submit Dispute")');
    await page.fill('textarea[name="description"]', 'Dispute 4');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=rate limit exceeded')).toBeVisible();
  });
});
```

### Stripe Webhook Test

```python
# backend/tests/integration/test_stripe_webhooks.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.integration
async def test_stripe_webhook_updates_subscription():
    """Verify Stripe webhook updates subscription status."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Simulate Stripe webhook: customer.subscription.updated
        webhook_payload = {
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_test123",
                    "customer": "cus_test123",
                    "status": "active",
                    "plan": {"id": "price_control_annual"},
                }
            }
        }

        response = await client.post(
            "/api/v1/webhooks/stripe",
            json=webhook_payload,
            headers={"stripe-signature": "test_signature"}  # Mock signature
        )

        assert response.status_code == 200

        # Verify subscription was updated in database
        # ... check database ...
```

---

## Files to Audit

### Billing (Epic 21)
- `backend/app/services/billing/stripe_client.py`
- `backend/app/services/billing/subscription_service.py`
- `backend/app/api/v1/billing.py`
- `frontend/src/features/billing/PricingPage.tsx`
- `frontend/src/features/billing/CheckoutPage.tsx`
- `frontend/src/features/billing/BillingPage.tsx`
- `frontend/src/features/billing/InvoicesPage.tsx`

### Tenant Portal (Epic 19)
- `backend/app/api/v1/tenant.py`
- `backend/app/services/tenant/invitation_service.py`
- `backend/app/services/tenant/dispute_service.py`
- `frontend/src/features/tenant/TenantDashboard.tsx`
- `frontend/src/features/tenant/DisputeForm.tsx`

---

## Definition of Done

- [ ] Complete billing workflow test passes (pricing → trial → upgrade → invoice)
- [ ] Usage tracking increments correctly
- [ ] Stripe checkout flow works (in test mode)
- [ ] Webhooks update subscription status
- [ ] Tenant invitation flow works end-to-end
- [ ] Tenant can view reconciliation results (read-only)
- [ ] Tenant can download packet PDF
- [ ] Tenant can submit dispute
- [ ] Cross-tenant access is blocked
- [ ] Rate limiting prevents abuse
- [ ] Any billing or portal bugs are fixed

---

## Notes

- Use **Stripe test mode** for billing tests
- Use **Stripe CLI** to trigger test webhooks
- Verify **webhook signature validation** is enabled
- Test with **real email service** or mocks for invitations
- Document any billing edge cases found

---

*Created: 2025-12-30*
*Status: pending*
