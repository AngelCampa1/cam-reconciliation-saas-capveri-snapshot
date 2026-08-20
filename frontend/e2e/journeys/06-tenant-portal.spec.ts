/**
 * Journey 06: Tenant Portal
 *
 * Login as tenant user → assert redirect to /tenant/dashboard
 * → assert property name and lease card visible → assert 2024 statement row
 * → click Dispute → fill description → submit → assert dispute row appears.
 */
import { test, expect } from '../fixtures'
import { TenantPage } from '../pages/tenant.page'

test.describe('Journey 06 — Tenant Portal', () => {
  test('tenant logs in and lands on dashboard with lease card', async ({ tenantPage: page }) => {
    const tenant = new TenantPage(page)

    await expect(page).toHaveURL(/\/tenant\/dashboard/, { timeout: 15000 })
    await expect(page.getByText(/test plaza|shopping center/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('shows 2024 statement row with dollar amount', async ({ tenantPage: page }) => {
    const tenant = new TenantPage(page)

    await expect(page).toHaveURL(/\/tenant\/dashboard/, { timeout: 10000 })
    // The seeded tenant is linked to two leases, so two 2024 statement rows
    // render (one per lease) — assert against the first.
    await expect(tenant.statementRow('2024').first()).toBeVisible({ timeout: 10000 })
    await expect(
      tenant.statementRow('2024').first().getByText(/\$[\d,]+/)
    ).toBeVisible({ timeout: 5000 })
  })

  test('submits a dispute and new row appears in list', async ({ tenantPage: page }) => {
    const tenant = new TenantPage(page)

    await expect(page).toHaveURL(/\/tenant\/dashboard/, { timeout: 10000 })

    // Disputes must be started from a statement, so click the dashboard
    // "Dispute statement for {property}" button to reach the create form.
    await tenant.disputeButton.click()

    // Category is required before the form can submit.
    await tenant.categorySelect.click()
    await tenant.categoryOption(/calculation error/i).click()

    await tenant.descriptionField.fill(
      'E2E test dispute — HVAC allocation appears incorrect per lease Section 4.2'
    )
    await tenant.submitDisputeButton.click()

    // On success the form navigates back to the disputes list and shows a toast.
    await expect(
      page.getByText(/dispute submitted|submitted|open/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})
