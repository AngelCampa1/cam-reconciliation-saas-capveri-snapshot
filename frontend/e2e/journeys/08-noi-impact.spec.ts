/**
 * Journey 08: NOI Impact
 *
 * Navigate to property → Reconciliation tab → View All → finalized 2024
 * → click NOI Impact → assert stat cards visible → adjust cap rate slider
 * → assert asset value changes → export PDF.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { PropertiesPage } from '../pages/properties.page'
import { ReconciliationPage } from '../pages/reconciliation.page'

test.describe('Journey 08 — NOI Impact', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    const props = new PropertiesPage(page)
    await app.navTo('properties')
    await props.clickProperty('Test Plaza Shopping Center')
    await props.clickTab('Reconciliations')

    // Click "View All Reconciliations" to get to the full recon page
    await page.getByRole('button', { name: /view all/i }).click()
    await page.waitForLoadState('networkidle')

    // Navigate to 2024 year via URL
    const url = page.url()
    const baseUrl = url.split('?')[0]
    await page.goto(`${baseUrl}?year=2024`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/finalized/i).first()).toBeVisible({ timeout: 15000 })
  })

  test('opens NOI Impact panel with stat cards', async ({ authenticatedPage: page }) => {
    const noiBtn = page.getByRole('button', { name: /noi impact/i })
    await expect(noiBtn).toBeVisible({ timeout: 5000 })
    await noiBtn.click()

    await expect(
      page.getByText(/recovery amount|asset value|noi/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('asset value changes when cap rate slider is adjusted', async ({
    authenticatedPage: page,
  }) => {
    const noiBtn = page.getByRole('button', { name: /noi impact/i })
    await expect(noiBtn).toBeVisible({ timeout: 5000 })
    await noiBtn.click()
    await expect(page.getByText(/asset value/i).first()).toBeVisible({ timeout: 10000 })

    const assetValueEl = page.getByTestId('stat-asset-value-lift')
    const initialValue = await assetValueEl.textContent()

    const slider = page.getByRole('slider', { name: /cap rate/i })
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')

    const newValue = await assetValueEl.textContent()
    expect(newValue).not.toEqual(initialValue)
  })

  test('exports board PDF from NOI panel', async ({ authenticatedPage: page }) => {
    const noiBtn = page.getByRole('button', { name: /noi impact/i })
    await expect(noiBtn).toBeVisible({ timeout: 5000 })
    await noiBtn.click()
    await expect(page.getByText(/asset value/i).first()).toBeVisible({ timeout: 10000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByTestId('export-board-button').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBeTruthy()
  })
})
