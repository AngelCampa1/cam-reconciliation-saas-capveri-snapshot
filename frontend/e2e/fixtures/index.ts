/**
 * Playwright test fixtures
 *
 * Custom fixtures for authenticated pages and admin access.
 * Provides helpers for waiting on API responses.
 */
/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, type Page, type Response } from '@playwright/test'

// Extend base test with custom fixtures
export const test = base.extend<{
  authenticatedPage: Page
  adminPage: Page
  tenantPage: Page
}>({
  // Fixture for authenticated user

  authenticatedPage: async ({ browser }, use) => {
    console.log('🔐 Starting authenticatedPage fixture (using storageState)...')
    const storageStatePath = './e2e/.auth/user.json'
    const context = await browser.newContext({
      storageState: storageStatePath,
      viewport: { width: 1920, height: 1080 },
    })
    const page = await context.newPage()

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // If stored session is invalid (token rotation or prior logout), re-authenticate.
    // Supabase rotates refresh tokens on each use; if a prior context discarded the
    // new token without saving, the stored token is already expired.
    const isLoggedIn = await page
      .locator('button[data-testid="user-menu-button"]')
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    if (!isLoggedIn) {
      console.log('⚠️ StorageState invalid or expired — re-authenticating...')
      await page.goto('/auth/login')
      await page.fill('[name="email"]', process.env.TEST_USER_EMAIL || 'e2e-test@capveri.com')
      await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD || 'TestPassword123!')
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/(dashboard|extractions|onboarding)/, { timeout: 15000 })
      // Persist the fresh tokens so subsequent fixtures don't need to re-login
      await context.storageState({ path: storageStatePath })
    }

    await expect(page.locator('button[data-testid="user-menu-button"]')).toBeVisible({ timeout: 10000 })
    console.log('✅ User menu visible - authentication confirmed')

    await use(page)

    // Persist the (possibly rotated) auth tokens back to storageState before
    // closing. Supabase rotates the refresh token on each use; with workers:1
    // (serial) the next test loads this same file, so discarding the rotated
    // token here means a later test in a long run loads an already-consumed
    // token and fails mid-suite even though it passes in isolation (F-128).
    // Saving on the happy path keeps the auth chain valid across the whole
    // serial run; the setup-time re-auth check above stays as the backstop if
    // the saved state is ever invalid. Best-effort — never fail a test on
    // teardown persistence.
    try {
      await context.storageState({ path: storageStatePath })
    } catch (error) {
      console.warn('⚠️ Could not persist rotated storageState on teardown:', error)
    }

    await context.close()
  },

  // Fixture for tenant portal user
  tenantPage: async ({ browser }, use) => {
    console.log('🏠 Starting tenantPage fixture...')
    const page = await browser.newPage()

    await page.goto('/tenant/login', { waitUntil: 'networkidle' })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const email = process.env.TEST_TENANT_EMAIL || 'e2e-tenant@capveri.com'
    const password = process.env.TEST_TENANT_PASSWORD || 'TestPassword123!'

    await page.fill('[name="email"]', email)
    await page.fill('[name="password"]', password)
    console.log(`✅ Filled tenant credentials: ${email}`)

    const loginPromise = page.waitForResponse(
      (response) => response.url().includes('/auth/v1/token') && response.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null)

    await page.click('button[type="submit"]')
    console.log('✅ Clicked tenant submit button')

    const authResponse = await loginPromise
    if (authResponse) {
      const status = authResponse.status()
      console.log(`📡 Tenant auth API response: ${status}`)
      if (status !== 200) {
        const body = await authResponse.text().catch(() => 'Unable to read response')
        console.error(`❌ Tenant auth API error: ${body}`)
      }
    }

    try {
      await page.waitForURL('**/tenant/dashboard', { timeout: 15000 })
      console.log('✅ Tenant redirected to /tenant/dashboard')
    } catch (error) {
      await page.screenshot({ path: 'test-failure-tenant-login.png', fullPage: true })
      console.error('❌ Failed to redirect to /tenant/dashboard')
      throw new Error(`Tenant login failed: ${error}`)
    }

    await use(page)
    await page.close()
  },

  // Fixture for admin user

  adminPage: async ({ page }, use) => {
    await page.goto('/login')
    await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@example.com')
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'adminpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/extractions', { timeout: 10000 })

    await use(page)

    try {
      await page.goto('/logout')
    } catch {
      // Ignore errors during cleanup
    }
  },
})

export { expect }

/**
 * Wait for API response helper
 *
 * Waits for a network response matching the given URL pattern.
 *
 * @param page - Playwright page object
 * @param urlPattern - String or RegExp to match against response URLs
 * @returns The matching Response object
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp
): Promise<Response> {
  const response = await page.waitForResponse(
    (res) => {
      if (typeof urlPattern === 'string') {
        return res.url().includes(urlPattern)
      }
      return urlPattern.test(res.url())
    },
    { timeout: 10000 }
  )

  return response
}

/**
 * Wait for multiple API responses
 *
 * @param page - Playwright page object
 * @param urlPatterns - Array of patterns to match
 * @returns Array of matching Response objects
 */
export async function waitForApiResponses(
  page: Page,
  urlPatterns: (string | RegExp)[]
): Promise<Response[]> {
  const promises = urlPatterns.map((pattern) => waitForApiResponse(page, pattern))
  return Promise.all(promises)
}

/**
 * Clear local storage and cookies
 *
 * Useful for resetting state between tests
 */
export async function clearBrowserState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.context().clearCookies()
}

/**
 * Take a named screenshot
 *
 * Saves screenshot to test-results directory with descriptive name
 */
export async function takeNamedScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  })
}
