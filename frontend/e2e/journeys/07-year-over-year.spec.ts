/**
 * Journey 07: Year-over-Year Comparison
 *
 * Navigate via sidebar to Year-over-Year → select Test Plaza
 * → select 2023 + 2024 → compare → assert both year columns visible
 * → assert Variance column → assert color legend → export Excel.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'

async function goToYoYAndCompare(page: any) {
  const app = new AppPage(page)

  await app.expandNav('analysis')
  await app.navTo('analysis-yoy')

  // Property select is Radix — click trigger + click option
  const propertyTrigger = page.locator('[data-testid="property-select-trigger"]')
    .or(page.getByRole('combobox', { name: /property/i }))
    .first()
  await expect(propertyTrigger).toBeVisible({ timeout: 15000 })
  await propertyTrigger.click()
  await page.getByRole('option', { name: 'Test Plaza Shopping Center' }).click()

  // Years are checkboxes, not a dropdown
  await expect(page.getByLabel('2023')).toBeVisible({ timeout: 15000 })
  await page.getByLabel('2023').check()
  await page.getByLabel('2024').check()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('2023').first()).toBeVisible({ timeout: 15000 })
}

test.describe('Journey 07 — Year-over-Year', () => {
  test('navigates to YoY page via sidebar', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    await app.expandNav('analysis')
    await app.navTo('analysis-yoy')

    await expect(
      page.getByRole('heading', { name: /year.over.year|comparison/i })
    ).toBeVisible({ timeout: 10000 })
  })

  test('compares 2023 and 2024 and shows variance columns', async ({
    authenticatedPage: page,
  }) => {
    await goToYoYAndCompare(page)

    await expect(page.getByText('2024').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/variance/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('shows color legend for variance categories', async ({
    authenticatedPage: page,
  }) => {
    await goToYoYAndCompare(page)
    await expect(page.getByText(/normal|warning|critical/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('exports CSV file from comparison', async ({ authenticatedPage: page }) => {
    await goToYoYAndCompare(page)

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: /export.*csv|csv/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.csv$/i)
  })
})
