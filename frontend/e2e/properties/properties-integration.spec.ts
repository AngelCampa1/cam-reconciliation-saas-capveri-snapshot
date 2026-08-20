import { test, expect } from '../fixtures'

// Helper: open the manual-entry property form at /properties/new.
// The create page (PropertyFormPage) defaults to the "Upload Rent Roll" tab,
// so we must switch to "Enter Manually" before the form fields are visible.
async function openManualPropertyForm(page: import('@playwright/test').Page) {
  await page.goto('/properties/new')
  await page.getByRole('tab', { name: /enter manually/i }).click()
}

// Helper: fill the manual property form using current data-testids.
// The address is split into line1/city/state/zip (no single "address" input),
// and State is a Radix combobox (options labelled "CA - California").
async function fillPropertyForm(
  page: import('@playwright/test').Page,
  name: string
) {
  await page.getByTestId('property-name-input').fill(name)
  await page.getByTestId('address-line1-input').fill('123 Test St')
  await page.getByTestId('city-input').fill('Los Angeles')
  await page.getByTestId('state-input').click()
  await page.getByRole('option', { name: /CA .* California/i }).click()
  await page.getByTestId('postal-code-input').fill('90001')
  await page.getByTestId('total-rentable-sqft-input').fill('50000')
  await page.getByTestId('total-usable-sqft-input').fill('45000')
  await page.getByTestId('common-area-sqft-input').fill('5000')
}

test.describe('Property Management Integration', () => {
  test('Create, edit, and confirm-delete a property', async ({
    authenticatedPage: page,
  }) => {
    const propertyName = `E2E Test Property ${Date.now()}`

    // 1. Create property via the manual form
    await openManualPropertyForm(page)
    await fillPropertyForm(page, propertyName)
    await page.getByRole('button', { name: /create property/i }).click()

    await expect(page.getByText(/property created successfully/i)).toBeVisible({
      timeout: 15000,
    })
    await expect(page).toHaveURL(/\/properties\/[a-f0-9-]+/)
    await expect(page.getByTestId('page-header-title')).toHaveText(propertyName)

    // 2. Edit property name
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page).toHaveURL(/\/properties\/[a-f0-9-]+\/edit/)
    await page.getByTestId('property-name-input').fill(`${propertyName} Updated`)
    await page.getByRole('button', { name: /update property/i }).click()

    await expect(page.getByText(/property updated successfully/i)).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('page-header-title')).toHaveText(
      `${propertyName} Updated`
    )

    // 3. Delete confirmation can be cancelled — property still exists
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText(/are you sure you want to delete/i)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('page-header-title')).toHaveText(
      `${propertyName} Updated`
    )
  })

  test('Property list displays correctly', async ({ authenticatedPage: page }) => {
    await page.goto('/properties')

    // Should show properties table
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('th:has-text("Name")')).toBeVisible()
    await expect(page.locator('th:has-text("Address")')).toBeVisible()
  })

  test('Form validation works', async ({ authenticatedPage: page }) => {
    await openManualPropertyForm(page)

    // Submit empty form — name + address validation messages appear
    await page.getByRole('button', { name: /create property/i }).click()

    await expect(
      page.getByText(/property name must be at least 2 characters/i)
    ).toBeVisible()
    await expect(page.getByText(/address is required/i)).toBeVisible()

    // Negative rentable area is rejected ("Must be a positive number")
    await page.getByTestId('total-rentable-sqft-input').fill('-1000')
    await page.getByRole('button', { name: /create property/i }).click()
    await expect(
      page.getByText(/must be a positive number/i).first()
    ).toBeVisible()
  })
})
