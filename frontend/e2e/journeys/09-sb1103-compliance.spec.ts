/**
 * Journey 09: SB 1103 Compliance
 *
 * Navigate to property (CA property) -> Compliance tab
 * -> assert tab loads -> assert no non-CA warning.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { PropertiesPage } from '../pages/properties.page'
import type { Page } from '@playwright/test'

async function openComplianceTab(page: Page) {
  const app = new AppPage(page)
  const props = new PropertiesPage(page)
  await app.navTo('properties')
  await props.clickProperty('Test Plaza Shopping Center')
  await props.clickTab('Compliance')
}

test.describe('Journey 09 - SB 1103 Compliance', () => {
  test('compliance tab loads without non-CA warning for CA property', async ({
    authenticatedPage: page,
  }) => {
    await openComplianceTab(page)

    await expect(
      page.getByRole('heading', { name: /compliance|sb.?1103/i })
    ).toBeVisible({ timeout: 10000 })
    // No non-CA warning since property is in CA (state: 'CA')
    await expect(page.getByText(/not.*california|non.*ca/i)).not.toBeVisible({
      timeout: 2000,
    })
  })

  test('shows inline unavailable state when compliance endpoint returns 404', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v1/compliance/sb1103*', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not Found' }),
      })
    })

    await openComplianceTab(page)

    await expect(
      page.getByText(/compliance endpoint is currently unavailable/i)
    ).toBeVisible({ timeout: 10000 })
  })

  test('creates new compliance request with correct deadline', async ({
    authenticatedPage: page,
  }) => {
    await openComplianceTab(page)

    await page.getByRole('button', { name: /log new request/i }).click()
    await page.getByRole('combobox', { name: /tenant lease/i }).click()
    await page.getByRole('option', { name: /test tenant 101/i }).click()
    await page.getByLabel(/requestor name/i).fill('Jane Smith')
    await page.getByLabel(/requestor email/i).fill('jane.smith@example.com')
    await page.getByLabel(/date request received/i).fill('2025-01-15')

    await page.getByRole('button', { name: /log request/i }).click()

    await expect(page.getByText(/request logged successfully/i)).toBeVisible({
      timeout: 10000,
    })
    await expect(
      page.locator('tbody tr').filter({ hasText: /jane smith/i }).first()
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/feb 14, 2025/i)).toBeVisible()
  })

  test('exports compliance PDF', async ({ authenticatedPage: page }) => {
    await openComplianceTab(page)

    await page.getByRole('button', { name: /log new request/i }).click()
    await page.getByRole('combobox', { name: /tenant lease/i }).click()
    await page.getByRole('option', { name: /test tenant 101/i }).click()
    await page.getByLabel(/requestor name/i).fill('PDF Export Requestor')
    await page
      .getByLabel(/requestor email/i)
      .fill('pdf.export.requestor@example.com')
    await page.getByLabel(/date request received/i).fill('2025-01-15')
    await page.getByRole('button', { name: /log request/i }).click()

    const row = page
      .locator('tbody tr')
      .filter({ hasText: /pdf export requestor/i })
      .first()
    await expect(row).toBeVisible({ timeout: 10000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await row.getByRole('button', { name: /actions/i }).click()
    await page.getByRole('menuitem', { name: /export pdf/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(
      /^SB1103_Test_Tenant_101_20230715_20250115\.pdf$/
    )
  })
})
