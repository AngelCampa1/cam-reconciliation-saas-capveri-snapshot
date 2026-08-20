# Story 4.5.8: Set Up Playwright for E2E

### User Story
**As a** developer
**I want** Playwright configured for end-to-end testing
**So that** I can test full user flows through the real application

### Acceptance Criteria

- [x] **AC1**: Playwright installed and configured
- [x] **AC2**: Test database setup for E2E tests
- [x] **AC3**: Can run tests in headed and headless modes
- [x] **AC4**: Tests wait for API responses properly
- [x] **AC5**: Screenshots captured on failure

### Technical Specifications

**Files to Create**:
```
frontend/
├── playwright.config.ts
├── e2e/
│   ├── fixtures/
│   │   └── index.ts
│   ├── pages/
│   │   └── login.page.ts
│   └── example.spec.ts
└── .env.test
```

**playwright.config.ts**:
```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  // Start dev server before tests
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "cd ../backend && uvicorn app.main:app --port 8000",
      url: "http://localhost:8000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL,
      },
    },
  ],
});
```

**e2e/fixtures/index.ts**:
```typescript
/**
 * Playwright test fixtures
 */
import { test as base, expect, type Page } from "@playwright/test";

// Extend base test with custom fixtures
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  // Fixture for authenticated user
  authenticatedPage: async ({ page }, use) => {
    // Login before test
    await page.goto("/login");
    await page.fill('[name="email"]', process.env.TEST_USER_EMAIL!);
    await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD!);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard");

    await use(page);

    // Cleanup: logout after test
    await page.goto("/logout");
  },

  // Fixture for admin user
  adminPage: async ({ page }, use) => {
    await page.goto("/login");
    await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL!);
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    await use(page);

    await page.goto("/logout");
  },
});

export { expect };

/**
 * Wait for API response helper
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp
): Promise<Response> {
  const response = await page.waitForResponse(
    (res) => {
      if (typeof urlPattern === "string") {
        return res.url().includes(urlPattern);
      }
      return urlPattern.test(res.url());
    },
    { timeout: 10000 }
  );

  return response;
}
```

**e2e/pages/login.page.ts**:
```typescript
/**
 * Login page object model
 */
import { type Page, type Locator } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[name="email"]');
    this.passwordInput = page.locator('[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[role="alert"]');
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await this.errorMessage.waitFor();
    await this.page.locator(`text=${message}`).isVisible();
  }
}
```

### Definition of Done
- [x] Playwright configured
- [x] Fixtures for auth work
- [x] Headed/headless modes work
- [x] Screenshots on failure

### Estimated Time: 3 hours

---
