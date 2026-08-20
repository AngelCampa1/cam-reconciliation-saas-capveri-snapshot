# Story 4.5.9: Create E2E Test Patterns

### User Story
**As a** developer
**I want** example E2E tests for common patterns
**So that** I can follow consistent patterns when writing new tests

### Acceptance Criteria

- [x] **AC1**: Login flow test complete
- [x] **AC2**: Create property test complete
- [x] **AC3**: Navigate between pages test
- [x] **AC4**: Error handling test
- [x] **AC5**: All patterns documented

### Technical Specifications

**Files to Create**:
```
frontend/e2e/
├── auth.spec.ts
├── properties.spec.ts
└── navigation.spec.ts
```

**auth.spec.ts**:
```typescript
/**
 * Authentication E2E tests
 */
import { test, expect } from "./fixtures";
import { LoginPage } from "./pages/login.page";

test.describe("Authentication", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should login with valid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);

    // Should show user's name
    await expect(page.locator("header")).toContainText("Test User");
  });

  test("should show error for invalid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login("wrong@email.com", "wrongpassword");

    await loginPage.expectError("Invalid email or password");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should logout and redirect to login", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");

    // Click logout
    await authenticatedPage.locator('[data-testid="user-menu"]').click();
    await authenticatedPage.locator("text=Sign out").click();

    // Should redirect to login
    await expect(authenticatedPage).toHaveURL(/.*login/);
  });
});
```

**properties.spec.ts**:
```typescript
/**
 * Property management E2E tests
 */
import { test, expect, waitForApiResponse } from "./fixtures";

test.describe("Properties", () => {
  test("should list properties on dashboard", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/properties");

    // Wait for API response
    const response = await waitForApiResponse(
      authenticatedPage,
      "/api/v1/properties"
    );
    expect(response.status()).toBe(200);

    // Should show property list or empty state
    const propertyList = authenticatedPage.locator('[data-testid="property-list"]');
    await expect(propertyList).toBeVisible();
  });

  test("should create a new property", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/properties");

    // Click create button
    await authenticatedPage.locator("text=Add Property").click();

    // Fill form
    await authenticatedPage.fill('[name="name"]', "Test Property E2E");
    await authenticatedPage.fill('[name="address_line1"]', "123 Test St");
    await authenticatedPage.fill('[name="city"]', "New York");
    await authenticatedPage.selectOption('[name="state"]', "NY");
    await authenticatedPage.fill('[name="postal_code"]', "10001");
    await authenticatedPage.fill('[name="total_rentable_sqft"]', "50000");
    await authenticatedPage.fill('[name="total_usable_sqft"]', "45000");

    // Submit
    const createPromise = waitForApiResponse(
      authenticatedPage,
      "/api/v1/properties"
    );
    await authenticatedPage.locator('button[type="submit"]').click();

    // Wait for creation
    const response = await createPromise;
    expect(response.status()).toBe(201);

    // Should show success and new property in list
    await expect(
      authenticatedPage.locator("text=Test Property E2E")
    ).toBeVisible();
  });

  test("should validate required fields", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/properties/new");

    // Submit empty form
    await authenticatedPage.locator('button[type="submit"]').click();

    // Should show validation errors
    await expect(
      authenticatedPage.locator("text=Name is required")
    ).toBeVisible();
    await expect(
      authenticatedPage.locator("text=Address is required")
    ).toBeVisible();
  });

  test("should navigate to property details", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/properties");

    // Wait for list to load
    await waitForApiResponse(authenticatedPage, "/api/v1/properties");

    // Click first property
    await authenticatedPage
      .locator('[data-testid="property-row"]')
      .first()
      .click();

    // Should show property details
    await expect(authenticatedPage).toHaveURL(/.*properties\/[a-f0-9-]+/);
    await expect(
      authenticatedPage.locator('[data-testid="property-details"]')
    ).toBeVisible();
  });
});
```

### Definition of Done
- [x] Auth tests pass
- [x] Property CRUD tests pass
- [x] Navigation tests pass
- [x] Patterns documented

### Estimated Time: 3 hours

---
