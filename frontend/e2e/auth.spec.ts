/**
 * Auth: Login, Logout, Role Enforcement
 *
 * Uses AuthPage + AppPage POMs with real selectors from source:
 * - Login: #email, #password, button "Sign in"
 * - Logout: data-testid="user-menu-button" → data-testid="logout-button"
 */
import { test, expect } from './fixtures'
import { AuthPage } from './pages/auth.page'
import { AppPage } from './pages/app.page'

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'e2e-test@capveri.com'
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!'

test.describe('Auth — Login / Logout / Role Enforcement', () => {
  test('logs in with valid credentials and lands on dashboard', async ({ page }) => {
    const auth = new AuthPage(page)

    await page.goto('/login')
    await auth.login(TEST_EMAIL, TEST_PASSWORD)

    await expect(page).toHaveURL(/\/(dashboard|extractions|onboarding)/, { timeout: 20000 })
    await expect(new AppPage(page).userMenuButton).toBeVisible({ timeout: 10000 })
  })

  test('shows error for invalid credentials', async ({ page }) => {
    const auth = new AuthPage(page)

    await page.goto('/login')
    await auth.login('wrong@example.com', 'WrongPassword!')

    await expect(
      page.getByText(/invalid|incorrect|wrong|failed/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('logs out and redirects to login page', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)

    await app.logout()

    await expect(page).toHaveURL(/\/(auth\/login|login)/, { timeout: 15000 })
  })

  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/(auth\/login|login)/, { timeout: 10000 })
  })
})
