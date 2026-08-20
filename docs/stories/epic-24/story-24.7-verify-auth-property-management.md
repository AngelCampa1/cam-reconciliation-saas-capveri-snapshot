# Story 24.7: Verify Authentication & Property Management (Epics 9-10)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 5 hours
**Status**: `pending`
**Dependencies**: Epics 9, 10

---

## User Story

As a **CAM accountant**,
I want to **verify that authentication works correctly and property/lease management is fully functional**,
So that **I can securely manage my properties and leases in the application**.

---

## Acceptance Criteria

### Authentication (Epic 9)
- [ ] User can register a new account
- [ ] User can log in with email/password
- [ ] User can log in with Google OAuth
- [ ] User can log in with Google OAuth
- [ ] User can reset forgotten password
- [ ] User can link multiple OAuth providers to one account
- [ ] User can update profile information
- [ ] User can change password
- [ ] Protected routes redirect to login when unauthenticated
- [ ] Session persists across page refreshes
- [ ] Token refresh works automatically

### Property Management (Epic 10)
- [ ] User can create a new property
- [ ] User can view list of properties with pagination
- [ ] User can view property details
- [ ] User can edit property information
- [ ] User can delete property (with confirmation)
- [ ] User can add units to property
- [ ] User can edit unit information
- [ ] User can delete units
- [ ] User can create leases for units
- [ ] User can upload lease PDF documents

### Authorization
- [ ] Users can only see properties in their organization
- [ ] Cross-tenant data access is blocked
- [ ] Only organization admins can change organization settings
- [ ] Regular users cannot delete organization

### Data Validation
- [ ] Form validation works correctly (required fields, formats)
- [ ] Duplicate property names are allowed (different addresses)
- [ ] Overlapping lease dates trigger warning
- [ ] Invalid BOMA area values are rejected
- [ ] Recovery profile values are validated

---

## Technical Specifications

### E2E Authentication Flow

```typescript
// frontend/tests/e2e/auth-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('User can register, login, and logout', async ({ page }) => {
    // 1. Register
    await page.goto('/register');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');
    await page.fill('input[name="organizationName"]', 'Test Org');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Welcome')).toBeVisible();

    // 2. Logout
    await page.click('button[aria-label="User menu"]');
    await page.click('text=Logout');

    // Should redirect to login
    await expect(page).toHaveURL('/login');

    // 3. Login again
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    // Should be logged in
    await expect(page).toHaveURL('/dashboard');
  });

  test('Protected route redirects to login', async ({ page }) => {
    // Try to access protected route while logged out
    await page.goto('/properties');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/login\?returnUrl=/);

    // Login
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    // Should redirect back to original URL
    await expect(page).toHaveURL('/properties');
  });

  test('User can reset password', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.click('button[type="submit"]');

    // Should show success message
    await expect(page.locator('text=Check your email')).toBeVisible();

    // Note: Actual password reset would require email testing
  });

  test('OAuth login flow works', async ({ page }) => {
    await page.goto('/login');

    // Click Google login button
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('button:has-text("Continue with Google")'),
    ]);

    // Note: Full OAuth flow requires test OAuth provider
    // Verify redirect happens
    expect(popup.url()).toContain('accounts.google.com');
  });
});
```

### E2E Property Management Flow

```typescript
// frontend/tests/e2e/property-management.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Property Management Flow', () => {
  test.use({ storageState: 'auth-state.json' }); // Pre-authenticated

  test('Complete property/lease workflow', async ({ page }) => {
    // 1. Create property
    await page.goto('/properties');
    await page.click('button:has-text("Add Property")');

    await page.fill('input[name="name"]', 'Sunset Plaza');
    await page.fill('input[name="address"]', '123 Main St, Los Angeles, CA 90001');
    await page.fill('input[name="totalRentableArea"]', '50000');
    await page.fill('input[name="totalUsableArea"]', '45000');
    await page.click('button[type="submit"]');

    // Should show success toast
    await expect(page.locator('text=Property created')).toBeVisible();

    // Should redirect to property detail
    await expect(page).toHaveURL(/\/properties\/.+/);
    await expect(page.locator('h1:has-text("Sunset Plaza")')).toBeVisible();

    // 2. Add unit
    await page.click('button:has-text("Add Unit")');
    await page.fill('input[name="number"]', 'Suite 101');
    await page.fill('input[name="rentableArea"]', '2500');
    await page.fill('input[name="usableArea"]', '2250');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Unit created')).toBeVisible();
    await expect(page.locator('text=Suite 101')).toBeVisible();

    // 3. Create lease
    await page.click('text=Suite 101');
    await page.click('button:has-text("Create Lease")');

    await page.fill('input[name="tenantName"]', 'Acme Corp');
    await page.fill('input[name="startDate"]', '2024-01-01');
    await page.fill('input[name="endDate"]', '2029-12-31');
    await page.fill('input[name="baseRent"]', '5000');

    // Fill recovery profile
    await page.fill('input[name="proRataShare"]', '0.05');
    await page.selectOption('select[name="capType"]', 'cumulative');
    await page.fill('input[name="capRate"]', '0.03');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=Lease created')).toBeVisible();

    // 4. Upload lease PDF
    await page.click('button:has-text("Upload Lease")');
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample_lease.pdf');
    await expect(page.locator('text=Upload complete')).toBeVisible();

    // 5. Edit property
    await page.click('button:has-text("Edit Property")');
    await page.fill('input[name="name"]', 'Sunset Plaza Shopping Center');
    await page.click('button[type="submit"]');

    await expect(page.locator('h1:has-text("Sunset Plaza Shopping Center")')).toBeVisible();

    // 6. Delete confirmation works
    await page.click('button:has-text("Delete Property")');
    await expect(page.locator('text=Are you sure')).toBeVisible();
    await page.click('button:has-text("Cancel")');

    // Property should still exist
    await expect(page.locator('h1:has-text("Sunset Plaza Shopping Center")')).toBeVisible();
  });

  test('Form validation works', async ({ page }) => {
    await page.goto('/properties/new');

    // Submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.locator('text=Name is required')).toBeVisible();
    await expect(page.locator('text=Address is required')).toBeVisible();

    // Fill with invalid data
    await page.fill('input[name="totalRentableArea"]', '-1000');
    await page.fill('input[name="totalUsableArea"]', '60000'); // Greater than rentable

    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.locator('text=must be greater than 0')).toBeVisible();
    await expect(page.locator('text=cannot exceed rentable area')).toBeVisible();
  });
});
```

### Cross-Tenant Isolation Test

```typescript
// frontend/tests/e2e/multi-tenancy.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Multi-Tenancy Isolation', () => {
  test('Users cannot see other organizations data', async ({ browser }) => {
    // Create two browser contexts (two different users)
    const context1 = await browser.newContext({ storageState: 'org-a-auth.json' });
    const context2 = await browser.newContext({ storageState: 'org-b-auth.json' });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Org A creates property
    await page1.goto('/properties/new');
    await page1.fill('input[name="name"]', 'Org A Property');
    await page1.fill('input[name="address"]', '123 Main St');
    await page1.fill('input[name="totalRentableArea"]', '10000');
    await page1.fill('input[name="totalUsableArea"]', '9000');
    await page1.click('button[type="submit"]');

    const orgAPropertyUrl = page1.url();

    // Org B tries to access Org A's property URL
    await page2.goto(orgAPropertyUrl);

    // Should see 404 or redirect (RLS blocks access)
    await expect(page2.locator('text=not found')).toBeVisible({ timeout: 5000 }).catch(() => {
      // Or check for redirect to properties list
      expect(page2.url()).toContain('/properties');
    });

    // Org B should not see Org A's property in list
    await page2.goto('/properties');
    await expect(page2.locator('text=Org A Property')).not.toBeVisible();
  });
});
```

---

## Files to Audit

### Authentication (Epic 9)
- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/auth/RegisterPage.tsx`
- `frontend/src/features/auth/ForgotPasswordPage.tsx`
- `frontend/src/features/auth/ProfilePage.tsx`
- `frontend/src/features/auth/OrganizationPage.tsx`
- `frontend/src/features/auth/AuthCallback.tsx`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/components/ProtectedRoute.tsx`

### Property Management (Epic 10)
- `frontend/src/features/properties/PropertyListPage.tsx`
- `frontend/src/features/properties/PropertyDetailPage.tsx`
- `frontend/src/features/properties/PropertyFormPage.tsx`
- `frontend/src/features/properties/UnitList.tsx`
- `frontend/src/features/properties/LeaseFormPage.tsx`
- `frontend/src/features/properties/RecoveryProfileEditor.tsx`

---

## Definition of Done

- [ ] All authentication flows work end-to-end
- [ ] All property/lease CRUD operations work end-to-end
- [ ] Cross-tenant data access is blocked
- [ ] Form validation works correctly
- [ ] Protected routes redirect to login
- [ ] Session persistence works
- [ ] OAuth login flows work (or are properly mocked)
- [ ] Password reset flow works (or is properly mocked)
- [ ] All E2E tests pass
- [ ] Any bugs found are fixed

---

## Notes

- Test with **real Supabase instance** (not mocks) to verify RLS
- OAuth testing may require **test credentials** or mocks
- Email testing may require **email service mocks**
- Document any UX improvements needed

---

*Created: 2025-12-30*
*Status: pending*
