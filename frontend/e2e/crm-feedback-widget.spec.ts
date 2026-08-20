/**
 * CRM Feedback Widget — Authenticated Surface Mount
 *
 * Asserts that the CRM loader script is injected into the DOM when a landlord
 * user is authenticated (showAppShell is true) and VITE_CRM_WIDGET_KEY is set.
 *
 * NOTE: We do NOT assert that the CRM widget actually loads data or renders the
 * floating button — the CRM server enforces an authenticated-origin allowlist and
 * will silently no-op on localhost. The ceiling here is DOM-injection only.
 */
import { test, expect } from './fixtures'

test.describe('CRM Feedback Widget', () => {
  test('loader script is present in the DOM on the authenticated landlord surface', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard')

    // Wait for the app shell to settle
    await expect(page.locator('[data-testid="user-menu-button"]')).toBeVisible({
      timeout: 20000,
    })

    // The CrmFeedbackWidget useEffect should have injected the script tag
    const scriptHandle = page.locator(
      'script[data-widget="feedback-button"]'
    )
    await expect(scriptHandle).toHaveCount(1, { timeout: 5000 })

    const dataSrc = await scriptHandle.getAttribute('src')
    expect(dataSrc).toContain('widgets.ventoralabs.com')

    const dataWidget = await scriptHandle.getAttribute('data-widget')
    expect(dataWidget).toBe('feedback-button')
  })
})
