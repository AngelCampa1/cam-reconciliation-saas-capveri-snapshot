/**
 * Portfolio Pipeline Page E2E Tests
 *
 * Verifies the portfolio pipeline page renders campaign status summary,
 * year selector, campaign table rows, and contextual action buttons.
 *
 * API responses are mocked — tests run without a live Supabase instance.
 */
import { test, expect } from './fixtures'

const MOCK_CAMPAIGNS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    property_id: '00000000-0000-0000-0000-000000000010',
    property_name: 'Harbor View Tower',
    period_year: 2025,
    status: 'draft',
    tenant_count: 8,
    finalized_tenant_count: 0,
    total_recovery: '42000.00',
    finalized_at: null,
    submitted_for_review_at: null,
    approved_at: null,
    sent_at: null,
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    property_id: '00000000-0000-0000-0000-000000000020',
    property_name: 'Main Street Plaza',
    period_year: 2025,
    status: 'finalized',
    tenant_count: 12,
    finalized_tenant_count: 12,
    total_recovery: '78000.00',
    finalized_at: '2025-02-01T00:00:00Z',
    submitted_for_review_at: null,
    approved_at: null,
    sent_at: null,
    updated_at: '2025-02-01T00:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    property_id: '00000000-0000-0000-0000-000000000030',
    property_name: 'Downtown Office Park',
    period_year: 2025,
    status: 'in_review',
    tenant_count: 6,
    finalized_tenant_count: 6,
    total_recovery: '55000.00',
    finalized_at: '2025-01-20T00:00:00Z',
    submitted_for_review_at: '2025-01-25T00:00:00Z',
    approved_at: null,
    sent_at: null,
    updated_at: '2025-01-25T00:00:00Z',
  },
]

function mockCampaignsRoute(page: import('@playwright/test').Page, data = MOCK_CAMPAIGNS) {
  return page.route('**/api/v1/campaigns/**', async (route) => {
    const url = route.request().url()
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      })
    } else if (route.request().method() === 'POST') {
      // Transition endpoint — return success
      const campaign = data.find((c) => url.includes(c.id))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: campaign?.id ?? data[0].id,
          status: 'in_review',
          transitioned_at: new Date().toISOString(),
          transitioned_by_user_id: '00000000-0000-0000-0000-000000000099',
        }),
      })
    }
  })
}

test.describe('Portfolio Pipeline Page', () => {
  test('T1: page loads with status summary chips', async ({
    authenticatedPage: page,
  }) => {
    await mockCampaignsRoute(page)
    await page.goto('/portfolio/pipeline', { waitUntil: 'networkidle' })

    await expect(
      page.getByRole('heading', { name: /portfolio pipeline/i }),
    ).toBeVisible()

    const chips = page.getByTestId('status-chips')
    await expect(chips).toBeVisible()
    await expect(chips.getByText(/Draft: 1/)).toBeVisible()
    await expect(chips.getByText(/Finalized: 1/)).toBeVisible()
    await expect(chips.getByText(/In Review: 1/)).toBeVisible()
  })

  test('T2: year selector is visible', async ({
    authenticatedPage: page,
  }) => {
    await mockCampaignsRoute(page)
    await page.goto('/portfolio/pipeline', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('year-selector')).toBeVisible()
  })

  test('T3: campaign table renders rows with property names', async ({
    authenticatedPage: page,
  }) => {
    await mockCampaignsRoute(page)
    await page.goto('/portfolio/pipeline', { waitUntil: 'networkidle' })

    const rows = page.getByTestId('campaign-row')
    await expect(rows).toHaveCount(3)

    await expect(page.getByText('Harbor View Tower')).toBeVisible()
    await expect(page.getByText('Main Street Plaza')).toBeVisible()
    await expect(page.getByText('Downtown Office Park')).toBeVisible()
  })

  test('T4: shows action buttons matching campaign status', async ({
    authenticatedPage: page,
  }) => {
    await mockCampaignsRoute(page)
    await page.goto('/portfolio/pipeline', { waitUntil: 'networkidle' })

    // Draft campaign has Finalize button
    await expect(page.getByRole('button', { name: /finalize/i })).toBeVisible()
    // Finalized campaign has Submit for Review button
    await expect(
      page.getByRole('button', { name: /submit for review/i }),
    ).toBeVisible()
    // In Review campaign has Approve and Reject buttons
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /reject/i })).toBeVisible()
  })

  test('T5: shows empty state when no campaigns', async ({
    authenticatedPage: page,
  }) => {
    await mockCampaignsRoute(page, [])
    await page.goto('/portfolio/pipeline', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByText(/no campaigns/i)).toBeVisible()
  })
})
