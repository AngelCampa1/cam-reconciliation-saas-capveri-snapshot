import { test, expect } from '../fixtures'

const PROPERTY = {
  id: 'prop-1',
  name: 'North Tower',
  address_line1: '100 Main St',
  city: 'Denver',
  state: 'CO',
  postal_code: '80202',
  total_rentable_sqft: '1000',
  total_usable_sqft: '900',
  common_area_sqft: '100',
  organization_id: 'org-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

function mockKickoffApis(page: import('@playwright/test').Page, firstRun: boolean) {
  return page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/properties' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [PROPERTY], total: 1 }),
      })
      return
    }

    if (
      url.pathname === '/api/v1/reconciliation/snapshots' &&
      route.request().method() === 'GET'
    ) {
      const isProbe = url.searchParams.get('size') === '1' && !url.searchParams.get('period_start')
      if (isProbe) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: firstRun
              ? []
              : [
                  {
                    id: 'snap-existing',
                    property_id: PROPERTY.id,
                    lease_id: 'lease-1',
                    period_start_date: '2025-01-01',
                    period_end_date: '2025-12-31',
                    status: 'draft',
                    total_recovery: '10.00',
                    is_finalized: false,
                    property_name: PROPERTY.name,
                    tenant_name: 'Tenant',
                  },
                ],
            total: firstRun ? 0 : 1,
            page: 1,
            page_size: 1,
            has_next: false,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          page_size: 20,
          has_next: false,
        }),
      })
      return
    }

    if (url.pathname === `/api/v1/leakage/${PROPERTY.id}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          property_id: PROPERTY.id,
          period_start: '2025-01-01',
          period_end: '2025-12-31',
          capveri_calculated: '0',
          actual_billed: '0',
          leakage: '0',
          leakage_pct: 0,
          has_reconciliation_data: false,
          has_gl_data: false,
          has_billing_data: false,
          breakdown: [],
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/leases' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], count: 0, has_more: false }),
      })
      return
    }

    if (
      url.pathname === `/api/v1/properties/${PROPERTY.id}/expense-pools` ||
      url.pathname === `/api/v1/properties/${PROPERTY.id}/pool-mappings`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], count: 0, has_more: false }),
      })
      return
    }

    await route.continue()
  })
}

test.describe('First reconciliation kickoff modal', () => {
  test('shows kickoff modal only for first reconciliation', async ({
    authenticatedPage: page,
  }) => {
    await mockKickoffApis(page, true)
    await page.goto('/reconciliations', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: /start reconciliation/i }).click()
    await expect(page.getByText(/start first reconciliation/i)).toBeVisible()
    await expect(page.getByText(/select a property to continue/i)).toBeVisible()
  })

  test('falls back to standard navigation after first reconciliation exists', async ({
    authenticatedPage: page,
  }) => {
    await mockKickoffApis(page, false)
    await page.goto('/reconciliations', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: /start reconciliation/i }).click()
    await page.waitForURL(/\/properties/, { timeout: 10000 })
    await expect(page).not.toHaveURL(/\/reconciliations$/)
  })
})
