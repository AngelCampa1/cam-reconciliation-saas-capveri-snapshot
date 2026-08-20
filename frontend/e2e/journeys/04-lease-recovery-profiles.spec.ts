/**
 * Journey 04: Lease Recovery Profiles
 *
 * Navigate to property → Leases tab → edit Tenant 205 lease via actions menu
 * → verify recovery profile fields visible on edit page.
 *
 * Navigation to lease edit: click "..." actions → Edit → /properties/{id}/leases/{leaseId}/edit
 * The edit page includes RecoveryProfileEditor with data-testid fields.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { PropertiesPage } from '../pages/properties.page'
import type { Page } from '@playwright/test'

/** Navigate to Leases tab and open the edit form for Tenant 205 */
async function editTenant205Lease(page: Page) {
  const app = new AppPage(page)
  const props = new PropertiesPage(page)

  await app.navTo('properties')
  await props.clickProperty('Test Plaza Shopping Center')
  await props.clickTab('Leases')

  // Click the actions menu (⋯) on the Tenant 205 row
  const tenantRow = page.locator('tr').filter({ hasText: /test tenant 205/i })
  await tenantRow.getByRole('button').last().click()

  // Click Edit from the dropdown
  await page.getByRole('menuitem', { name: /edit/i }).click()
  await page.waitForLoadState('networkidle')
}

test.describe('Journey 04 — Lease Recovery Profiles', () => {
  test('opens lease edit form with recovery profile fields', async ({
    authenticatedPage: page,
  }) => {
    await editTenant205Lease(page)

    // RecoveryProfileEditor fields should be visible on the edit page
    const capTypeSelect = page.locator('[data-testid="cap-type-select"]')
    await expect(capTypeSelect).toBeVisible({ timeout: 10000 })

    const proRataInput = page.locator('[data-testid="pro-rata-share-input"]')
    await expect(proRataInput).toBeVisible({ timeout: 5000 })
  })

  test('edits recovery profile and values persist after navigation', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    const props = new PropertiesPage(page)

    await editTenant205Lease(page)

    // Set Cap Type to a distinct value so persistence is proven.
    const capTypeSelect = page.locator('[data-testid="cap-type-select"]')
    await expect(capTypeSelect).toBeVisible({ timeout: 10000 })
    await capTypeSelect.click()
    await page.getByRole('option', { name: 'Non-Cumulative' }).click()

    // Cap Rate appears when cap_type !== 'none'
    const capRateInput = page.locator('[data-testid="cap-rate-input"]')
    await expect(capRateInput).toBeVisible({ timeout: 5000 })
    await capRateInput.clear()
    await capRateInput.fill('6.25')

    // Admin Fee
    const adminFeeInput = page.locator('[data-testid="admin-fee-input"]')
    await adminFeeInput.clear()
    await adminFeeInput.fill('12.5')

    const startDateInput = page.getByLabel(/start date/i)
    if ((await startDateInput.inputValue()) === '') {
      await startDateInput.fill('2024-01-01')
    }
    const endDateInput = page.getByLabel(/end date/i)
    if ((await endDateInput.inputValue()) === '') {
      await endDateInput.fill('2025-12-31')
    }

    await page.getByRole('button', { name: /save|update lease/i }).click()
    await expect(page.getByText(/saved|success|updated/i).first()).toBeVisible(
      { timeout: 10000 }
    )

    // Navigate away and back — edit the same lease again to verify
    await app.navTo('properties')
    await props.clickProperty('Test Plaza Shopping Center')
    await props.clickTab('Leases')

    const tenantRow = page.locator('tr').filter({ hasText: /test tenant 205/i })
    await tenantRow.getByRole('button').last().click()
    await page.getByRole('menuitem', { name: /edit/i }).click()
    await page.waitForLoadState('networkidle')

    // Assert values persisted
    await expect(page.locator('[data-testid="cap-type-select"]')).toContainText(
      'Non-Cumulative',
      { timeout: 5000 }
    )
    await expect(page.locator('[data-testid="cap-rate-input"]')).toHaveValue(
      '6.25',
      { timeout: 5000 }
    )
    await expect(page.locator('[data-testid="admin-fee-input"]')).toHaveValue(
      '12.5',
      { timeout: 5000 }
    )
  })
})
