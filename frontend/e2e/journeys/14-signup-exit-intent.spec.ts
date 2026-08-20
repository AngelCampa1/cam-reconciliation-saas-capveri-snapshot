/**
 * Journey 14: Signup Exit-Intent Lead Capture
 *
 * Visit /auth/register → trigger exit-intent via mouse event → verify dialog appears
 * → dismiss → verify it doesn't reappear → fill lead form → verify redirect
 * → verify dialog suppressed while typing in registration form.
 */
import { test, expect } from '@playwright/test'

test.describe('Journey 14 — Signup Exit-Intent', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sessionStorage so exit-intent can fire fresh
    await page.goto('/auth/register', { waitUntil: 'networkidle' })
    await page.evaluate(() => sessionStorage.removeItem('exit-intent-shown'))
  })

  test('shows exit-intent dialog when mouse leaves viewport', async ({
    page,
  }) => {
    // Simulate mouse leaving viewport via top edge
    await page.mouse.move(400, 10)
    await page.evaluate(() => {
      const event = new MouseEvent('mouseleave', {
        bubbles: true,
        clientY: -5,
      })
      document.documentElement.dispatchEvent(event)
    })

    // Dialog should appear
    await expect(
      page.getByText(/not ready to sign up/i)
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/gross-up calculator/i)).toBeVisible()
  })

  test('dismisses dialog and does not reappear on second exit', async ({
    page,
  }) => {
    // Trigger exit intent
    await page.evaluate(() => {
      const event = new MouseEvent('mouseleave', {
        bubbles: true,
        clientY: -5,
      })
      document.documentElement.dispatchEvent(event)
    })

    await expect(
      page.getByText(/not ready to sign up/i)
    ).toBeVisible({ timeout: 5000 })

    // Click dismiss
    await page.getByRole('button', { name: /no thanks/i }).click()

    // Dialog should disappear
    await expect(
      page.getByText(/not ready to sign up/i)
    ).not.toBeVisible()

    // Try to trigger again — should NOT appear (sessionStorage one-shot)
    await page.evaluate(() => {
      const event = new MouseEvent('mouseleave', {
        bubbles: true,
        clientY: -5,
      })
      document.documentElement.dispatchEvent(event)
    })

    // Give it a moment, then verify still hidden
    await page.waitForTimeout(500)
    await expect(
      page.getByText(/not ready to sign up/i)
    ).not.toBeVisible()
  })

  test('submits lead form and redirects to thank-you page', async ({
    page,
  }) => {
    await page.route('**/api/v1/leads/content-download', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          asset_url: 'http://localhost:5173/test-download.xlsx',
        }),
      })
    })

    // Trigger exit intent
    await page.evaluate(() => {
      const event = new MouseEvent('mouseleave', {
        bubbles: true,
        clientY: -5,
      })
      document.documentElement.dispatchEvent(event)
    })

    await expect(
      page.getByText(/not ready to sign up/i)
    ).toBeVisible({ timeout: 5000 })

    // Fill in the lead capture form inside the dialog.
    // Use a unique email per run: the content-download endpoint rate-limits
    // (429) a repeat request for the same email + asset within the window,
    // so a hard-coded address would block the redirect on the second run.
    const uniqueEmail = `jane+${Date.now()}@acmeproperties.com`
    const dialog = page.getByTestId('dialog-content')
    await dialog.locator('#first_name').fill('Jane')
    await dialog.locator('#work_email').fill(uniqueEmail)

    // Submit
    await dialog.getByRole('button', { name: /send me the calculator/i }).click()

    // Should redirect to thank-you page
    await expect(page).toHaveURL(/\/tools\/cam-gross-up-calculator\/thank-you/, {
      timeout: 10000,
    })
  })

  test('does NOT show dialog while user is typing in registration form', async ({
    page,
  }) => {
    // Focus the email input and start typing
    await page.locator('#email').click()
    await page.locator('#email').fill('test@example')

    // Try to trigger exit intent while input is focused
    await page.evaluate(() => {
      const event = new MouseEvent('mouseleave', {
        bubbles: true,
        clientY: -5,
      })
      document.documentElement.dispatchEvent(event)
    })

    // Give it a moment
    await page.waitForTimeout(500)

    // Dialog should NOT appear because form input has focus
    await expect(
      page.getByText(/not ready to sign up/i)
    ).not.toBeVisible()
  })
})
