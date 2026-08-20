# Story 9.12: Integration Test - Auth E2E Flow

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 3
- **Dependencies**: All auth stories (9.1-9.11)
- **Status**: `pending`

## User Story
**As a** developer
**I want** end-to-end tests for the complete authentication flow including SSO
**So that** I can verify the full user journey works correctly across all auth methods

## Acceptance Criteria
- [ ] **AC1**: Test: Register new user → Verify email → Login → See dashboard
- [ ] **AC2**: Test: Login with invalid credentials → See error
- [ ] **AC3**: Test: Logout → Cannot access protected routes
- [ ] **AC4**: Test: Session persists across page refresh
- [ ] **AC5**: Test: OAuth login buttons visible and interactive
- [ ] **AC6**: Test: OAuth callback handles success and error states
- [ ] **AC7**: Test: Account linking flow (link/unlink)
- [ ] **AC8**: Tests run against real backend (test database)

## Technical Specifications

**File to Create**: `frontend/e2e/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

// Test user credentials
const TEST_USER = {
  email: 'e2e-test@capveri.com',
  password: 'TestPassword123!',
  name: 'E2E Test User',
}

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Reset test database state
    await fetch(`${process.env.API_URL}/test/reset`, { method: 'POST' })
  })

  test.describe('Email/Password Authentication', () => {
    test('should register a new user successfully', async ({ page }) => {
      await page.goto('/register')

      await page.fill('[name="email"]', TEST_USER.email)
      await page.fill('[name="password"]', TEST_USER.password)
      await page.fill('[name="confirmPassword"]', TEST_USER.password)
      await page.fill('[name="fullName"]', TEST_USER.name)

      await page.click('button[type="submit"]')

      // Should show verification message
      await expect(page.getByText(/check your email/i)).toBeVisible()
    })

    test('should login with valid credentials', async ({ page }) => {
      // First, create a verified user via API
      await createVerifiedUser(TEST_USER)

      await page.goto('/login')

      await page.fill('[name="email"]', TEST_USER.email)
      await page.fill('[name="password"]', TEST_USER.password)
      await page.click('button[type="submit"]')

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard')
      await expect(page.getByText(/welcome/i)).toBeVisible()
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login')

      await page.fill('[name="email"]', 'invalid@example.com')
      await page.fill('[name="password"]', 'wrongpassword')
      await page.click('button[type="submit"]')

      // Should show error message
      await expect(page.getByText(/invalid/i)).toBeVisible()
      // Should stay on login page
      await expect(page).toHaveURL('/login')
    })

    test('should redirect to login for protected routes', async ({ page }) => {
      await page.goto('/dashboard')

      // Should redirect to login with return URL
      await expect(page).toHaveURL('/login?returnUrl=%2Fdashboard')
    })

    test('should preserve return URL after login', async ({ page }) => {
      await createVerifiedUser(TEST_USER)

      // Try to access protected route
      await page.goto('/properties/123')

      // Should redirect to login
      await expect(page).toHaveURL(/\/login\?returnUrl=/)

      // Login
      await page.fill('[name="email"]', TEST_USER.email)
      await page.fill('[name="password"]', TEST_USER.password)
      await page.click('button[type="submit"]')

      // Should redirect to original URL
      await expect(page).toHaveURL('/properties/123')
    })

    test('should persist session across page refresh', async ({ page }) => {
      await createVerifiedUser(TEST_USER)

      // Login
      await page.goto('/login')
      await page.fill('[name="email"]', TEST_USER.email)
      await page.fill('[name="password"]', TEST_USER.password)
      await page.click('button[type="submit"]')

      await expect(page).toHaveURL('/dashboard')

      // Refresh page
      await page.reload()

      // Should still be logged in
      await expect(page).toHaveURL('/dashboard')
      await expect(page.getByText(/welcome/i)).toBeVisible()
    })

    test('should logout and clear session', async ({ page }) => {
      await createVerifiedUser(TEST_USER)

      // Login
      await page.goto('/login')
      await page.fill('[name="email"]', TEST_USER.email)
      await page.fill('[name="password"]', TEST_USER.password)
      await page.click('button[type="submit"]')

      // Click logout
      await page.click('[data-testid="user-menu"]')
      await page.click('[data-testid="logout-button"]')

      // Should redirect to login
      await expect(page).toHaveURL('/login')

      // Try to access protected route
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test.describe('OAuth Authentication', () => {
    test('should display social login buttons', async ({ page }) => {
      await page.goto('/login')

      // Check Google button exists
      await expect(page.getByRole('button', { name: /google/i })).toBeVisible()

      // Check Apple button exists
      await expect(page.getByRole('button', { name: /apple/i })).toBeVisible()

      // Check divider text
      await expect(page.getByText(/or continue with/i)).toBeVisible()
    })

    test('should show loading state when clicking OAuth button', async ({ page }) => {
      await page.goto('/login')

      // Mock the OAuth redirect to prevent actual redirect
      await page.route('**/auth/v1/authorize**', async (route) => {
        // Delay to see loading state
        await new Promise(r => setTimeout(r, 100))
        await route.fulfill({ status: 302, headers: { Location: '/auth/callback' } })
      })

      await page.click('button:has-text("Google")')

      // Button should show loading state (spinner)
      await expect(page.locator('button:has-text("Google") svg.animate-spin')).toBeVisible()
    })

    test('should handle OAuth callback success', async ({ page }) => {
      // Simulate successful OAuth callback
      await page.goto('/auth/callback?access_token=mock_token&token_type=bearer')

      // Mock session check
      await page.route('**/auth/v1/token**', async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            access_token: 'mock_token',
            user: { id: 'test-id', email: 'oauth@example.com' },
          }),
        })
      })

      // Should show completing message or redirect
      await expect(
        page.getByText(/completing/i).or(page.locator('[data-testid="dashboard"]'))
      ).toBeVisible({ timeout: 5000 })
    })

    test('should handle OAuth callback error', async ({ page }) => {
      // Simulate OAuth error
      await page.goto('/auth/callback?error=access_denied&error_description=User+cancelled')

      // Should show error message
      await expect(page.getByText(/cancelled/i)).toBeVisible()

      // Should have link back to login
      await expect(page.getByRole('link', { name: /login/i })).toBeVisible()
    })
  })

  test.describe('Account Linking', () => {
    test('should show linked accounts section on profile', async ({ page }) => {
      await createVerifiedUser(TEST_USER)
      await loginUser(page, TEST_USER)

      await page.goto('/profile')

      // Should see linked accounts section
      await expect(page.getByText(/linked accounts/i)).toBeVisible()

      // Should see provider options
      await expect(page.getByText(/google/i)).toBeVisible()
      await expect(page.getByText(/apple/i)).toBeVisible()
    })

    test('should show link button for unlinked providers', async ({ page }) => {
      await createVerifiedUser(TEST_USER)
      await loginUser(page, TEST_USER)

      await page.goto('/profile')

      // Should see Link buttons (not linked yet)
      const linkButtons = page.getByRole('button', { name: /link/i })
      await expect(linkButtons).toHaveCount(2) // Google and Apple
    })

    test('should show confirmation when unlinking', async ({ page }) => {
      // Create user with linked OAuth
      await createUserWithLinkedOAuth(TEST_USER, 'google')
      await loginUser(page, TEST_USER)

      await page.goto('/profile')

      // Click unlink on Google
      await page.click('[data-testid="unlink-google"]')

      // Should show confirmation dialog
      await expect(page.getByText(/unlink google/i)).toBeVisible()
      await expect(page.getByText(/no longer be able to sign in/i)).toBeVisible()
    })
  })
})

// Helper functions
async function createVerifiedUser(user: typeof TEST_USER) {
  await fetch(`${process.env.API_URL}/test/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...user, verified: true }),
  })
}

async function createUserWithLinkedOAuth(
  user: typeof TEST_USER,
  provider: string
) {
  await fetch(`${process.env.API_URL}/test/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...user, verified: true, linkedProviders: [provider] }),
  })
}

async function loginUser(page: any, user: typeof TEST_USER) {
  await page.goto('/login')
  await page.fill('[name="email"]', user.email)
  await page.fill('[name="password"]', user.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')
}
```

## Test Cases

### Email/Password Tests
- Registration flow completes successfully
- Email verification simulated
- Login with valid credentials succeeds
- Login with invalid credentials shows error
- Protected routes redirect to login
- Return URL preserved and used
- Session persists across page refresh
- Logout clears session and redirects

### OAuth Tests
- Social login buttons displayed on login page
- OAuth redirect initiated on button click
- OAuth callback handles success state
- OAuth callback handles error state
- Return URL preserved through OAuth flow

### Account Linking Tests
- Linked accounts section visible on profile
- Link buttons shown for unlinked providers
- Unlink confirmation dialog appears
- Cannot unlink last auth method

## Definition of Done
- [ ] Email/password registration test passes
- [ ] Email/password login test passes
- [ ] Invalid credentials test passes
- [ ] Protected route redirect test passes
- [ ] Return URL preservation test passes
- [ ] Session persistence test passes
- [ ] Logout test passes
- [ ] OAuth buttons visibility test passes
- [ ] OAuth callback success test passes
- [ ] OAuth callback error test passes
- [ ] Account linking tests pass
- [ ] Tests run in CI pipeline
- [ ] Tests use isolated test database
