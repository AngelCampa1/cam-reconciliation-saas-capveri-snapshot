/**
 * Journey 01: Onboarding
 *
 * Full user registration → property creation → navigate to units/leases → upload GL.
 * Starts at /register (the real entry point for new users).
 * No API mocking. Navigation via visible UI elements only.
 */
import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { AuthPage } from '../pages/auth.page'
import { AppPage } from '../pages/app.page'
import { PropertiesPage } from '../pages/properties.page'
import { IngestionPage } from '../pages/ingestion.page'

async function completeManualUploadFlow(
  page: Page,
  options: { propertyName: string; startTrial: boolean }
) {
  await expect(
    page.getByRole('heading', { name: /tell us about your building/i })
  ).toBeVisible({ timeout: 30000 })

  if (options.startTrial) {
    const trialStart = await page.evaluate(async (apiBaseUrl) => {
      const authEntry = Object.entries(localStorage).find(
        ([key]) => key.startsWith('sb-') && key.endsWith('-auth-token')
      )
      if (!authEntry) {
        return { status: 0, detail: 'Missing Supabase auth token' }
      }
      const session = JSON.parse(authEntry[1] as string) as {
        access_token?: string
        currentSession?: { access_token?: string }
        session?: { access_token?: string }
      }
      const token =
        session.access_token ??
        session.currentSession?.access_token ??
        session.session?.access_token
      if (!token) {
        return { status: 0, detail: 'Missing access token' }
      }
      const response = await fetch(
        `${apiBaseUrl}/api/v1/billing/trial/start-default`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      return {
        status: response.status,
        detail: await response.text().catch(() => ''),
      }
    }, process.env.VITE_API_URL || 'http://127.0.0.1:8797')
    if (trialStart.status < 200 || trialStart.status >= 300) {
      throw new Error(
        `Default trial start failed (${trialStart.status}): ${trialStart.detail}`
      )
    }
  }

  await page.getByRole('tab', { name: /enter manually/i }).click()
  await page.getByLabel(/property name/i).fill(options.propertyName)
  await page.getByLabel(/street address/i).fill('1 Onboard Lane')
  await page.getByLabel(/^city$/i).fill('Houston')
  await page.getByLabel(/^state$/i).fill('TX')
  await page.getByLabel(/zip/i).fill('77002')
  await page.getByLabel(/how big is the building/i).fill('50000')
  const createPropertyResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/properties') &&
      response.request().method() === 'POST',
    { timeout: 15000 }
  )
  await page.getByRole('button', { name: /save my building/i }).click()
  const createPropertyResponse = await createPropertyResponsePromise
  if (!createPropertyResponse.ok()) {
    throw new Error(
      `Create property failed (${createPropertyResponse.status()}): ${createPropertyResponse.url()}`
    )
  }

  await expect(page.getByRole('heading', { name: /add your tenants/i })).toBeVisible({
    timeout: 30000,
  })
  await page.getByLabel(/tenant name/i).fill('E2E Anchor Tenant')
  await page.getByLabel(/lease start/i).fill('2024-01-01')
  await page.getByLabel(/lease end/i).fill('2025-12-31')
  await page.getByLabel(/pro-rata share/i).fill('25')
  await page.getByRole('button', { name: /^add lease$/i }).click()
  await expect(page.getByText(/1 tenant added/i)).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /^next$/i }).click()

  await expect(page.getByRole('heading', { name: /add your expense report/i })).toBeVisible({
    timeout: 30000,
  })
  await page
    .locator('#file-upload')
    .setInputFiles('./e2e/fixtures/mri_gl_hou01_2024.csv')
  await page.getByRole('button', { name: /^use this file$/i }).click()
  await expect(page.getByRole('heading', { name: /your file is in/i })).toBeVisible({
    timeout: 30000,
  })
  await page.getByRole('button', { name: /^next$/i }).click()

  await expect(page.getByRole('heading', { name: /what you charged your tenants/i })).toBeVisible({
    timeout: 30000,
  })
  await page
    .locator('#billing-file-upload')
    .setInputFiles('./e2e/fixtures/actual-billed-anchor-tenant.csv')
  await page.getByRole('button', { name: /^use this file$/i }).click()
  await expect(page.getByRole('heading', { name: /^got it$/i })).toBeVisible({
    timeout: 30000,
  })
  await page.getByRole('button', { name: /^see my results$/i }).click()

  await expect(
    page.getByRole('heading', {
      name: /here is what we checked|we got your files/i,
    })
  ).toBeVisible({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /continue/i })).toBeVisible({
    timeout: 30000,
  })
}

test.describe('Journey 01 — Onboarding', () => {
  test('completes sample-first onboarding from registration', async ({ page }) => {
    test.setTimeout(180000)
    const auth = new AuthPage(page)
    const uniqueEmail = `e2e-onboard-${Date.now()}@capveri.com`

    await page.goto('/register')
    await auth.register(uniqueEmail, 'E2E Onboard Org', 'TestPassword123!')

    await expect(page).toHaveURL(/\/onboard\?demo=1&source=first-login/, {
      timeout: 20000,
    })
    await expect(
      page.getByRole('heading', { name: /modeled sample building check/i })
    ).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /check my own building/i }).click()
    await completeManualUploadFlow(page, {
      propertyName: 'E2E Registered Upload Plaza',
      startTrial: false,
    })
  })

  test('adds a property via UI navigation', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    const props = new PropertiesPage(page)

    await app.navTo('properties')
    await expect(page.getByRole('heading', { name: /properties/i })).toBeVisible({ timeout: 10000 })

    await props.addPropertyButton.click()
    // Default tab is "Upload Rent Roll" — switch to manual entry
    await page.getByRole('tab', { name: /enter manually/i }).click()
    await page.getByLabel(/property name/i).fill('E2E Onboarding Plaza')
    // Use data-testid to avoid strict-mode on Address Line 1 vs Address Line 2
    await page.getByTestId('address-line1-input').fill('1 Onboard Lane')
    await page.getByLabel(/city/i).fill('Test City')
    // State is a Radix combobox (data-testid="state-input"), not a fillable input.
    await page.getByTestId('state-input').click()
    await page.getByRole('option', { name: 'CA - California' }).click()
    await page.getByLabel(/zip|postal/i).fill('90210')
    // BOMA area fields are required
    await page.getByLabel(/total rentable sqft/i).fill('50000')
    await page.getByLabel(/total usable/i).fill('45000')
    await page.getByLabel(/common area/i).fill('5000')
    const createPropertyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/properties') &&
        response.request().method() === 'POST',
      { timeout: 15000 }
    )
    await page.getByRole('button', { name: /create property/i }).click()
    const createPropertyResponse = await createPropertyResponsePromise
    if (!createPropertyResponse.ok()) {
      throw new Error(
        `Create property failed (${createPropertyResponse.status()}): ${await createPropertyResponse.text()}`
      )
    }

    await expect(page.getByTestId('page-header-title')).toHaveText('E2E Onboarding Plaza', { timeout: 15000 })
  })

  test('navigates to units and leases tabs on a property', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    const props = new PropertiesPage(page)

    await app.navTo('properties')
    await props.clickProperty('Test Plaza Shopping Center')

    // Navigate to Units tab
    await props.clickTab('Units')
    await expect(
      page.getByText(/unit/i).first()
    ).toBeVisible({ timeout: 10000 })

    // Navigate to Leases tab
    await props.clickTab('Leases')
    await expect(
      page.getByText(/lease|tenant/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('navigates to GL upload page and selects property', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    const ingestion = new IngestionPage(page)

    await app.expandNav('documents')
    await app.navTo('documents-upload-gl')
    await expect(page.getByTestId('page-header-title')).toBeVisible({ timeout: 10000 })

    await ingestion.selectProperty('Test Plaza Shopping Center')

    // Assert the property was selected and file drop zone is visible
    await expect(page.getByText(/drag and drop|click to browse/i).first()).toBeVisible({ timeout: 5000 })
  })

  // Live PLG onboarding flow (/onboard). This is the real document-upload
  // onboarding: an anonymous visitor adds a property, a lease, then uploads a
  // GL expense report and a billed-amounts file before reaching the results
  // step. The legacy /onboarding "Step 1 of 6" wizard was replaced by this PLG
  // flow (commit fd375410) and is now redirected/unreachable, so we drive the
  // live flow directly instead of the old wizard. We intentionally do NOT
  // register first: /onboard redirects authenticated users to /checkout, so the
  // upload flow only renders for the anonymous session it bootstraps itself.
  test('completes onboarding via document uploads (property + lease + GL + billed)', async ({
    page,
  }) => {
    test.setTimeout(180000)

    await page.goto('/onboard')
    await expect(
      page.getByRole('heading', { name: /modeled sample building check/i })
    ).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: /check my own building/i }).click()
    await completeManualUploadFlow(page, {
      propertyName: 'E2E PLG Upload Plaza',
      startTrial: true,
    })
  })
})
