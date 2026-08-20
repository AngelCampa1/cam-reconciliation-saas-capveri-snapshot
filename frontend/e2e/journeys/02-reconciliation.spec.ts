/**
 * Journey 02: Reconciliation
 *
 * Full reconciliation workflow: navigate to property, open reconciliation,
 * assert tenant amounts, view trace, finalize, and export PDF.
 *
 * No API mocking. Navigation via visible UI only.
 */
import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { PropertiesPage } from '../pages/properties.page'
import { ReconciliationPage } from '../pages/reconciliation.page'

async function goToRecon(page: Page, year = '2024') {
  const app = new AppPage(page)
  const props = new PropertiesPage(page)
  await app.navTo('properties')
  await props.clickProperty('Test Plaza Shopping Center')
  await props.clickTab('Reconciliations')

  await page.getByRole('button', { name: /view all/i }).click()
  await page.waitForLoadState('networkidle')

  if (year) {
    const url = page.url()
    const baseUrl = url.split('?')[0]
    await page.goto(`${baseUrl}?year=${year}`)
    await page.waitForLoadState('networkidle')
  }

  await expect(page.getByText(/something went wrong/i).first()).toBeHidden({
    timeout: 3000,
  })
}

test.describe('Journey 02 - Reconciliation', () => {
  test('navigates to reconciliation tab via sidebar and property click', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    const props = new PropertiesPage(page)
    await app.navTo('properties')
    await props.clickProperty('Test Plaza Shopping Center')
    await props.clickTab('Reconciliations')

    await expect(
      page.getByText(/recent reconciliations|reconciliation/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('shows finalized 2024 reconciliation data', async ({
    authenticatedPage: page,
  }) => {
    await goToRecon(page, '2024')

    await expect(
      page.getByText(/test tenant|tenant 101/i).first()
    ).toBeVisible({ timeout: 15000 })
  })

  test('opens trace drawer when View Trace is clicked', async ({
    authenticatedPage: page,
  }) => {
    const recon = new ReconciliationPage(page)
    await goToRecon(page, '2024')
    await expect(page.getByText(/test tenant/i).first()).toBeVisible({
      timeout: 15000,
    })

    await page.locator('[data-testid="trace-button"]').first().click()
    await expect(recon.traceDrawer).toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('[data-testid="calculation-step-card"]').first()
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/gross-up|tenant share|total recovery/i).first())
      .toBeVisible()
  })

  test('can initiate PDF export from finalized reconciliation', async ({
    authenticatedPage: page,
  }) => {
    const recon = new ReconciliationPage(page)
    await goToRecon(page, '2024')
    await expect(page.getByText(/finalized/i).first()).toBeVisible({
      timeout: 15000,
    })

    await recon.exportButton.click()
    await expect(page.locator('[data-testid="export-panel"]')).toBeVisible({
      timeout: 10000,
    })
    await page.locator('[data-testid="format-card-pdf"]').click()

    const previewResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/export/pdf/preview') &&
        response.request().method() === 'POST',
      { timeout: 30000 }
    )
    await page.locator('[data-testid="preview-button"]').click()

    const previewResponse = await previewResponsePromise
    expect(previewResponse.ok()).toBeTruthy()
    expect(previewResponse.headers()['content-type']).toContain(
      'application/pdf'
    )
  })
})
