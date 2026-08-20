/**
 * Journey 12: AI Lease Extraction Review
 *
 * Navigate to Extractions, open a seeded ready-for-review document, verify the
 * source PDF and extracted fields render, edit a field, reset it, then approve a
 * reviewed document and confirm it leaves the ready-for-review queue.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { ExtractionsPage } from '../pages/extractions.page'

test.describe('Journey 12 - AI Lease Extraction Review', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('**/*', async (route) => {
      if (!route.request().url().includes('/api/v1/document-files/')) {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        path: 'e2e/fixtures/sample-lease.pdf',
      })
    })
  })

  test('navigates to Extractions via nav', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    await app.expandNav('documents')
    await app.navTo('documents-extractions')
    await expect(page.getByRole('heading', { name: /extractions/i })).toBeVisible({
      timeout: 10000,
    })
  })

  test('shows document in ready-for-review state', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    const extractions = new ExtractionsPage(page)
    await app.expandNav('documents')
    await app.navTo('documents-extractions')
    await expect(extractions.statusBadge('Ready for review').first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('opens review page with PDF viewer and extracted fields', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    const extractions = new ExtractionsPage(page)
    await app.expandNav('documents')
    await app.navTo('documents-extractions')
    await expect(extractions.statusBadge('Ready for review').first()).toBeVisible({
      timeout: 10000,
    })

    await extractions.reviewButton.click()

    await expect(page.locator('[data-testid="pdf-viewer"]').first()).toBeVisible({
      timeout: 15000,
    })
    await expect(page.locator('[data-testid^="editable-field-"]').first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('edits pro_rata_share field and can reset it', async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    const extractions = new ExtractionsPage(page)
    await app.expandNav('documents')
    await app.navTo('documents-extractions')
    await extractions.reviewButton.click()
    await expect(page.locator('[data-testid^="editable-field-"]').first()).toBeVisible({
      timeout: 15000,
    })

    const proRataField = page
      .locator('[data-field="pro_rata_share"], [data-testid="editable-field-pro_rata_share"]')
      .first()
    const input = proRataField.locator('[data-testid="input-pro_rata_share"]')
    await input.clear()
    await input.fill('5.5')

    await expect(proRataField).toHaveAttribute('data-changed', 'true', { timeout: 3000 })

    await proRataField.locator('[data-testid="reset-pro_rata_share"]').click()
    await expect(proRataField).toHaveAttribute('data-changed', 'false', { timeout: 3000 })
  })

  test('approves document and redirects to Extractions list', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    const extractions = new ExtractionsPage(page)
    await app.expandNav('documents')
    await app.navTo('documents-extractions')

    const reviewSuite101 = page.getByRole('button', {
      name: /Review Suite_101_Lease_Agreement\.pdf/i,
    })
    await expect(reviewSuite101).toBeVisible({ timeout: 10000 })

    await reviewSuite101.click()
    await expect(page.locator('[data-testid^="editable-field-"]').first()).toBeVisible({
      timeout: 15000,
    })

    const confirmButtons = await page.locator('[data-testid^="confirm-"]').all()
    for (const button of confirmButtons) {
      if (await button.isEnabled().catch(() => false)) {
        await button.click()
      }
    }

    const approveButton = page.locator('[data-testid="approve-button"]')
    await expect(approveButton).toBeEnabled({ timeout: 15000 })
    await approveButton.click()

    const confirmButton = page.locator('[data-testid="confirm-button"]').last()
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    await expect(page).toHaveURL(/\/extractions/, { timeout: 15000 })

    await expect(
      page.getByRole('button', { name: /Review Suite_101_Lease_Agreement\.pdf/i })
    ).not.toBeVisible({ timeout: 5000 })
  })

  test('quick-creates a lease before approving an unlinked extraction', async ({
    authenticatedPage: page,
  }) => {
    const documentId = 'doc-unlinked-ai-lease'
    const propertyId = 'property-unlinked-ai-lease'
    const extractedProfile = {
      base_year: 2024,
      base_year_amount: null,
      gross_up_base_year: true,
      pro_rata_share: '0.0625',
      cap_type: 'non_cumulative',
      cap_rate: '0.05',
      admin_fee_percentage: '0.15',
      management_fee_percentage: null,
      excluded_pools: [],
      accounting_basis: 'accrual',
    }
    let createLeaseBody: Record<string, unknown> | undefined
    let approveBody: Record<string, unknown> | undefined

    await page.route(`**/api/v1/extractions/${documentId}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: documentId,
          filename: 'Unlinked_AI_Lease.pdf',
          status: 'ready_for_review',
          storage_bucket: 'DOCUMENTS_BUCKET',
          storage_key: 'documents/unlinked.pdf',
          document_url: `${page.url().split('/').slice(0, 3).join('/')}/api/v1/document-files/${documentId}?signature=test`,
          content_type: 'application/pdf',
          file_size_bytes: 1200,
          property_id: propertyId,
          lease_id: null,
          extraction_result: {
            profile: extractedProfile,
            source_references: [
              {
                field: 'pro_rata_share',
                page: 1,
                text: 'Tenant share is 6.25%.',
                confidence: 0.98,
                boundingBox: null,
              },
            ],
          },
          created_at: '2026-06-18T00:00:00Z',
          processed_at: '2026-06-18T00:01:00Z',
          verified_at: null,
          verified_by: null,
          edit_history: [],
        }),
      })
    })

    await page.route('**/api/v1/leases**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'GET' && url.pathname === '/api/v1/leases') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], count: 0, has_more: false }),
        })
        return
      }

      if (request.method() === 'POST' && url.pathname === '/api/v1/leases') {
        createLeaseBody = (await request.postDataJSON()) as Record<string, unknown>
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'lease-new',
            property_id: propertyId,
            unit_id: null,
            tenant_name: String(createLeaseBody.tenant_name),
            start_date: String(createLeaseBody.start_date),
            end_date: String(createLeaseBody.end_date),
            status: 'draft',
            recovery_profile: createLeaseBody.recovery_profile,
            document_url: null,
            created_at: '2026-06-18T00:02:00Z',
            updated_at: '2026-06-18T00:02:00Z',
          }),
        })
        return
      }

      await route.continue()
    })

    await page.route(
      `**/api/v1/extractions/${documentId}/approve`,
      async (route) => {
        approveBody = (await route.request().postDataJSON()) as Record<
          string,
          unknown
        >
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, lease_id: 'lease-new' }),
        })
      }
    )

    await page.goto(`/verify/${documentId}`)
    await expect(page.locator('[data-testid="pdf-viewer"]').first()).toBeVisible({
      timeout: 15000,
    })

    const approveButton = page.locator('[data-testid="approve-button"]')
    await expect(approveButton).toBeDisabled()
    await expect(page.locator('[data-testid="approve-disabled-reason"]')).toHaveText(
      /Link a lease before you approve\./
    )

    await page.locator('[data-testid="create-lease-button"]').click()
    await page.locator('[data-testid="new-lease-tenant"]').fill('New Tenant LLC')
    await page.locator('[data-testid="new-lease-start"]').fill('2026-01-01')
    await page.locator('[data-testid="new-lease-end"]').fill('2030-12-31')
    await page.locator('[data-testid="create-lease-submit"]').click()

    await expect(approveButton).toBeEnabled({ timeout: 10000 })
    expect(createLeaseBody).toMatchObject({
      property_id: propertyId,
      tenant_name: 'New Tenant LLC',
      start_date: '2026-01-01',
      end_date: '2030-12-31',
      recovery_profile: expect.objectContaining({
        pro_rata_share: extractedProfile.pro_rata_share,
        base_year: extractedProfile.base_year,
        cap_type: extractedProfile.cap_type,
        cap_rate: extractedProfile.cap_rate,
        admin_fee_percentage: extractedProfile.admin_fee_percentage,
      }),
    })

    await approveButton.click()
    const confirmButton = page.locator('[data-testid="confirm-button"]').last()
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    await expect(page).toHaveURL(/\/extractions$/, { timeout: 15000 })
    expect(approveBody).toMatchObject({
      lease_id: 'lease-new',
      profile: expect.objectContaining({
        pro_rata_share: extractedProfile.pro_rata_share,
        base_year: extractedProfile.base_year,
        cap_type: extractedProfile.cap_type,
        cap_rate: extractedProfile.cap_rate,
        admin_fee_percentage: extractedProfile.admin_fee_percentage,
      }),
    })
  })
})
