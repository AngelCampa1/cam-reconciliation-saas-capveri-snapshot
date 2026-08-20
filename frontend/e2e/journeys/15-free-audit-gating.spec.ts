import { test, expect } from '../fixtures'

test.describe('Free Audit Gating', () => {
  test('blocks add-property when free audit is consumed', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/billing/free-audit-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_subscription: false,
          free_audit_consumed: true,
          can_add_property: false,
          can_run_reconciliation: false,
        }),
      })
    })

    await page.route('**/api/v1/properties**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          count: 0,
          has_more: false,
        }),
      })
    })

    await page.goto('/properties')
    await page.getByRole('button', { name: /add property/i }).first().click()

    await expect(
      page.getByRole('dialog', { name: /your free reconciliation is ready/i })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /start free trial/i })
    ).toBeVisible()
  })
})
