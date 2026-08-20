/**
 * Journey 05: Demand Letter
 *
 * Navigate to property -> Reconciliation tab -> View All -> finalized 2024
 * -> More -> Demand Letter -> select tenant -> review details
 * -> Generate & Download -> assert file downloads.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { PropertiesPage } from '../pages/properties.page'
import { ReconciliationPage } from '../pages/reconciliation.page'

async function goToFinalizedRecon2024(page: any) {
  const app = new AppPage(page)
  const props = new PropertiesPage(page)
  await app.navTo('properties')
  await props.clickProperty('Test Plaza Shopping Center')
  await props.clickTab('Reconciliations')

  await page.getByRole('button', { name: /view all/i }).click()
  await page.waitForLoadState('networkidle')

  const url = page.url()
  const baseUrl = url.split('?')[0]
  await page.goto(`${baseUrl}?year=2024`)
  await page.waitForLoadState('networkidle')

  await expect(page.getByText(/finalized/i).first()).toBeVisible({
    timeout: 15000,
  })
  return new ReconciliationPage(page)
}

async function chooseTenantAndReview(page: any) {
  const tenantSelect = page.locator('[data-testid="tenant-select"]')
  await expect(tenantSelect).toBeVisible({ timeout: 10000 })

  const tenantValue = await tenantSelect.evaluate(
    (select: HTMLSelectElement) => {
      const option = Array.from(select.options).find((candidate) =>
        /test tenant 101/i.test(candidate.textContent ?? '')
      )
      return option?.value ?? ''
    }
  )
  expect(tenantValue).toBeTruthy()

  await tenantSelect.selectOption(tenantValue)
  await page.locator('[data-testid="step-1-next"]').click()
  await page.locator('[data-testid="landlord-name-input"]').fill('Jane Smith')
  await page
    .locator('[data-testid="landlord-title-input"]')
    .fill('Property Manager')
  await page
    .locator('[data-testid="landlord-company-input"]')
    .fill('Skyline Properties LLC')
  await page.locator('[data-testid="step-2-next"]').click()
}

test.describe('Journey 05 - Demand Letter', () => {
  test('generates demand letter and shows tenant name', async ({
    authenticatedPage: page,
  }) => {
    const recon = await goToFinalizedRecon2024(page)
    await recon.openDemandLetterPanel()
    await expect(recon.demandLetterPanel).toBeVisible({ timeout: 10000 })
    await chooseTenantAndReview(page)

    await expect(
      page.getByText(/tenant 101|test tenant 101/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('downloads demand letter file', async ({ authenticatedPage: page }) => {
    const recon = await goToFinalizedRecon2024(page)
    await recon.openDemandLetterPanel()
    await expect(recon.demandLetterPanel).toBeVisible({ timeout: 10000 })
    await chooseTenantAndReview(page)

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.locator('[data-testid="generate-button"]').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^demand-letter-.*\.pdf$/)
  })
})
