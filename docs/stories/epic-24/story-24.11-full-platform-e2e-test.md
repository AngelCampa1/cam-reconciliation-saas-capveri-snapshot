# Story 24.11: Full Platform E2E Test - Critical User Journeys

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 8 hours
**Status**: `pending`
**Dependencies**: All epics (0-23)

---

## User Story

As a **QA engineer**,
I want to **verify that all critical user journeys work end-to-end across the entire platform**,
So that **we can confidently release the product to customers**.

---

## Acceptance Criteria

### Journey 1: New Customer Onboarding
- [ ] User registers account
- [ ] User creates organization
- [ ] User sets up first property with units
- [ ] User creates leases with recovery profiles
- [ ] User uploads GL data
- [ ] User runs first reconciliation
- [ ] User exports tenant packets

### Journey 2: AI-Assisted Lease Entry
- [ ] User uploads lease PDF
- [ ] OCR extracts text and tables
- [ ] LLM extracts financial DNA
- [ ] User reviews and approves extraction
- [ ] Lease is created with recovery profile
- [ ] User runs reconciliation with new lease

### Journey 3: Multi-Year Reconciliation
- [ ] User imports GL data for Year 1
- [ ] User runs reconciliation for Year 1
- [ ] User imports GL data for Year 2
- [ ] User runs reconciliation for Year 2 with cumulative caps
- [ ] User reviews year-over-year variance
- [ ] User exports historical reports

### Journey 4: Tenant Portal Access
- [ ] Landlord invites tenant user
- [ ] Tenant activates account
- [ ] Tenant views reconciliation results
- [ ] Tenant downloads their packet
- [ ] Tenant submits dispute
- [ ] Landlord responds to dispute

### Journey 5: Billing & Subscription
- [ ] User starts free trial
- [ ] User upgrades to paid plan
- [ ] User adds payment method
- [ ] User processes reconciliations (usage tracking)
- [ ] Invoice is generated
- [ ] Payment is collected
- [ ] User views billing history

---

## Technical Specifications

### Journey 1: New Customer Onboarding

```typescript
// frontend/tests/e2e/journey-01-onboarding.spec.ts
import { test, expect } from '@playwright/test';

test('Journey 1: New Customer Onboarding', async ({ page }) => {
  // 1. User registers account
  await page.goto('/register');
  await page.fill('input[name="email"]', 'newuser@example.com');
  await page.fill('input[name="password"]', 'SecurePass123!');
  await page.fill('input[name="confirmPassword"]', 'SecurePass123!');
  await page.fill('input[name="organizationName"]', 'Acme Properties LLC');
  await page.fill('input[name="firstName"]', 'John');
  await page.fill('input[name="lastName"]', 'Smith');
  await page.click('button[type="submit"]');

  // Should redirect to dashboard
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('text=Welcome, John')).toBeVisible();

  // 2. User creates organization (already done during registration)
  // Verify organization exists
  await page.goto('/settings/organization');
  await expect(page.locator('text=Acme Properties LLC')).toBeVisible();

  // 3. User sets up first property
  await page.goto('/properties');
  await page.click('button:has-text("Add Property")');
  await page.fill('input[name="name"]', 'Sunset Plaza Shopping Center');
  await page.fill('input[name="address"]', '123 Main St, Los Angeles, CA 90001');
  await page.fill('input[name="totalRentableArea"]', '50000');
  await page.fill('input[name="totalUsableArea"]', '45000');
  await page.click('button[type="submit"]');

  await expect(page.locator('text=Property created')).toBeVisible();

  // Add units
  await page.click('button:has-text("Add Unit")');
  await page.fill('input[name="number"]', 'Suite 101');
  await page.fill('input[name="rentableArea"]', '2500');
  await page.fill('input[name="usableArea"]', '2250');
  await page.click('button[type="submit"]');

  await expect(page.locator('text=Suite 101')).toBeVisible();

  // 4. User creates lease
  await page.click('text=Suite 101');
  await page.click('button:has-text("Create Lease")');
  await page.fill('input[name="tenantName"]', 'Acme Corp');
  await page.fill('input[name="startDate"]', '2024-01-01');
  await page.fill('input[name="endDate"]', '2029-12-31');
  await page.fill('input[name="baseRent"]', '5000');
  await page.fill('input[name="proRataShare"]', '0.05');
  await page.selectOption('select[name="capType"]', 'cumulative');
  await page.fill('input[name="capRate"]', '0.03');
  await page.click('button[type="submit"]');

  await expect(page.locator('text=Lease created')).toBeVisible();

  // 5. User uploads GL data
  await page.goto('/ingestion');
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/yardi/yardi_gl_sample.csv');
  await expect(page.locator('text=Upload complete'), { timeout: 15000 }).toBeVisible();

  // 6. User runs first reconciliation
  await page.goto('/reconciliation/new');
  await page.selectOption('select[name="propertyId"]', { label: 'Sunset Plaza Shopping Center' });
  await page.fill('input[name="periodStart"]', '2024-01-01');
  await page.fill('input[name="periodEnd"]', '2024-12-31');
  await page.click('button:has-text("Calculate")');

  await expect(page.locator('text=Calculation complete'), { timeout: 15000 }).toBeVisible();

  // Verify results
  await expect(page.locator('.reconciliation-grid')).toBeVisible();
  await expect(page.locator('text=Total Recoverable')).toBeVisible();

  // 7. User exports tenant packet
  await page.click('button:has-text("Export")');
  await page.selectOption('select[name="tenantId"]', { label: 'Acme Corp' });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Download PDF")'),
  ]);

  expect(download.suggestedFilename()).toMatch(/Acme_Corp.*\.pdf/);

  // Onboarding complete!
  console.log('✅ Journey 1 complete: User successfully onboarded');
});
```

### Journey 2: AI-Assisted Lease Entry

```typescript
// frontend/tests/e2e/journey-02-ai-lease.spec.ts
import { test, expect } from '@playwright/test';

test('Journey 2: AI-Assisted Lease Entry', async ({ page }) => {
  test.use({ storageState: 'auth-state.json' });

  // 1. Upload lease PDF
  await page.goto('/leases/new');
  await page.click('button:has-text("Upload PDF")');
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/sample_commercial_lease.pdf');

  // 2. OCR extracts text
  await expect(page.locator('text=Processing document'), { timeout: 10000 }).toBeVisible();

  // 3. LLM extracts financial DNA
  await expect(page.locator('text=Extracting lease terms'), { timeout: 30000 }).toBeVisible();

  // 4. User reviews extraction
  await expect(page.locator('text=Verify Extraction'), { timeout: 60000 }).toBeVisible();
  await expect(page.locator('.pdf-viewer')).toBeVisible();
  await expect(page.locator('input[name="baseYear"]')).toHaveValue('2022');
  await expect(page.locator('input[name="proRataShare"]')).toHaveValue('0.05');

  // 5. User approves
  await page.click('button:has-text("Approve")');
  await page.click('button:has-text("Confirm")');

  await expect(page.locator('text=Lease created')).toBeVisible();

  // 6. User runs reconciliation
  await page.goto('/reconciliation/new');
  await page.selectOption('select[name="propertyId"]', { index: 0 });
  await page.fill('input[name="periodStart"]', '2024-01-01');
  await page.fill('input[name="periodEnd"]', '2024-12-31');
  await page.click('button:has-text("Calculate")');

  await expect(page.locator('text=Calculation complete'), { timeout: 15000 }).toBeVisible();

  console.log('✅ Journey 2 complete: AI-assisted lease entry successful');
});
```

### Journey 3: Multi-Year Reconciliation

```typescript
// frontend/tests/e2e/journey-03-multi-year.spec.ts
import { test, expect } from '@playwright/test';

test('Journey 3: Multi-Year Reconciliation', async ({ page }) => {
  test.use({ storageState: 'auth-state.json' });

  // 1. Import Year 1 GL data
  await page.goto('/ingestion');
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/yardi/yardi_gl_2023.csv');
  await expect(page.locator('text=Upload complete'), { timeout: 15000 }).toBeVisible();

  // 2. Run Year 1 reconciliation
  await page.goto('/reconciliation/new');
  await page.selectOption('select[name="propertyId"]', { index: 0 });
  await page.fill('input[name="periodStart"]', '2023-01-01');
  await page.fill('input[name="periodEnd"]', '2023-12-31');
  await page.click('button:has-text("Calculate")');
  await expect(page.locator('text=Calculation complete'), { timeout: 15000 }).toBeVisible();

  // Finalize Year 1
  await page.click('button:has-text("Finalize")');
  await page.click('button:has-text("Confirm")');
  await expect(page.locator('text=Snapshot finalized')).toBeVisible();

  const year1Total = await page.locator('[data-testid="total-recoverable"]').textContent();

  // 3. Import Year 2 GL data
  await page.goto('/ingestion');
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/yardi/yardi_gl_2024.csv');
  await expect(page.locator('text=Upload complete'), { timeout: 15000 }).toBeVisible();

  // 4. Run Year 2 reconciliation with cumulative caps
  await page.goto('/reconciliation/new');
  await page.selectOption('select[name="propertyId"]', { index: 0 });
  await page.fill('input[name="periodStart"]', '2024-01-01');
  await page.fill('input[name="periodEnd"]', '2024-12-31');
  await page.click('button:has-text("Calculate")');
  await expect(page.locator('text=Calculation complete'), { timeout: 15000 }).toBeVisible();

  const year2Total = await page.locator('[data-testid="total-recoverable"]').textContent();

  // 5. Review year-over-year variance
  await page.goto('/reconciliation/variance');
  await page.selectOption('select[name="baseYear"]', '2023');
  await page.selectOption('select[name="comparisonYear"]', '2024');
  await page.click('button:has-text("Compare")');

  await expect(page.locator('.variance-table')).toBeVisible();
  await expect(page.locator('text=Year-over-Year Variance')).toBeVisible();

  // 6. Export historical report
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Export Historical Report")'),
  ]);

  expect(download.suggestedFilename()).toMatch(/historical.*\.xlsx/);

  console.log('✅ Journey 3 complete: Multi-year reconciliation successful');
});
```

### Journey 4: Tenant Portal Access

```typescript
// frontend/tests/e2e/journey-04-tenant-portal.spec.ts
import { test, expect } from '@playwright/test';

test('Journey 4: Tenant Portal Access', async ({ browser }) => {
  // ... (similar to Story 24.10 tenant portal test)
  // Full implementation in Story 24.10

  console.log('✅ Journey 4 complete: Tenant portal access successful');
});
```

### Journey 5: Billing & Subscription

```typescript
// frontend/tests/e2e/journey-05-billing.spec.ts
import { test, expect } from '@playwright/test';

test('Journey 5: Billing & Subscription', async ({ page }) => {
  // ... (similar to Story 24.10 billing test)
  // Full implementation in Story 24.10

  console.log('✅ Journey 5 complete: Billing workflow successful');
});
```

---

## Definition of Done

- [ ] All 5 critical user journeys pass end-to-end
- [ ] Journey 1 (Onboarding) completes in <5 minutes
- [ ] Journey 2 (AI Lease) completes in <3 minutes
- [ ] Journey 3 (Multi-Year) completes in <7 minutes
- [ ] Journey 4 (Tenant Portal) completes in <4 minutes
- [ ] Journey 5 (Billing) completes in <3 minutes
- [ ] No errors occur during any journey
- [ ] All data is correctly saved and retrievable
- [ ] UI is responsive and intuitive
- [ ] Any journey failures are debugged and fixed

---

## Notes

- These are **smoke tests** - they verify the happy path works
- Run these tests **before every release**
- Use **real database and services** (not mocks)
- Record **videos of test runs** for documentation
- Document any journey UX improvements needed

---

*Created: 2025-12-30*
*Status: pending*
