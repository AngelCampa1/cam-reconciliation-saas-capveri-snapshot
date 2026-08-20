/**
 * Portfolio Summary Page E2E Tests
 *
 * Verifies the portfolio summary page renders correctly with the sidebar
 * nav link, 4 metric cards, and property breakdown table.
 *
 * API responses are mocked — tests run without a live Supabase instance.
 */
import { test, expect } from './fixtures'

const PORTFOLIO_SUMMARY = {
  period_year: 2024,
  total_recoverable_cam: '350000',
  total_leakage: '105000',
  recovery_rate: 70.0,
  properties_with_leakage: 2,
  has_billing_data: true,
  properties: [
    {
      property_id: '00000000-0000-0000-0000-000000000001',
      property_name: 'Harbor View Tower',
      total_recoverable: '200000',
      total_billed: '130000',
      leakage: '70000',
      recovery_rate: 65.0,
    },
    {
      property_id: '00000000-0000-0000-0000-000000000002',
      property_name: 'Main Street Plaza',
      total_recoverable: '150000',
      total_billed: '115000',
      leakage: '35000',
      recovery_rate: 76.67,
    },
  ],
}

const EMPTY_PORTFOLIO_SUMMARY = {
  period_year: null,
  total_recoverable_cam: '0',
  total_leakage: '0',
  recovery_rate: null,
  properties_with_leakage: 0,
  has_billing_data: false,
  properties: [],
}

test.describe('Portfolio Summary Page', () => {
  test('navigates to /portfolio via sidebar link', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v1/portfolio/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PORTFOLIO_SUMMARY),
      })
    })

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // Click the Portfolio nav item in the desktop sidebar
    const sidebar = page.locator('[data-testid="sidebar-desktop"]')
    await expect(sidebar).toBeVisible()

    // "Portfolio" is a parent with children (Overview, Pipeline), so it is an
    // expand-only disclosure toggle — clicking it expands the submenu rather
    // than navigating (Sidebar.tsx NavItemButton handleClick; intentional
    // pattern, F-099).
    // Navigation to /portfolio happens via the "Overview" child item.
    const portfolioParent = sidebar.locator(
      'button[data-testid="nav-item-portfolio"]'
    )
    await expect(portfolioParent).toBeVisible()
    await portfolioParent.click()

    const overviewLink = sidebar.locator(
      'button[data-testid="nav-item-portfolio-overview"]'
    )
    await expect(overviewLink).toBeVisible()
    await overviewLink.click()

    await expect(page).toHaveURL(/\/portfolio/)
  })

  test('page loads with "Portfolio" heading', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v1/portfolio/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PORTFOLIO_SUMMARY),
      })
    })

    await page.goto('/portfolio', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  })

  test('renders 4 metric cards', async ({ authenticatedPage: page }) => {
    await page.route('**/api/v1/portfolio/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PORTFOLIO_SUMMARY),
      })
    })

    await page.goto('/portfolio', { waitUntil: 'networkidle' })

    // Metric-card labels must match the component (PortfolioPage.tsx) and its
    // unit test (PortfolioPage.test.tsx): "Recoverable CAM" / "Leakage to
    // Recover", not the older "Total ..." copy. Scope to the metric-cards grid
    // because "Recoverable CAM" and "Recovery Rate" also appear as column
    // headers in the property table below (avoids strict-mode ambiguity).
    const metricCards = page.getByTestId('portfolio-metric-cards')
    await expect(metricCards.getByText('Recoverable CAM')).toBeVisible()
    await expect(metricCards.getByText('Leakage to Recover')).toBeVisible()
    await expect(metricCards.getByText('Recovery Rate')).toBeVisible()
    await expect(metricCards.getByText('Properties with Leakage')).toBeVisible()
  })

  test('property table renders rows when data exists', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v1/portfolio/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PORTFOLIO_SUMMARY),
      })
    })

    await page.goto('/portfolio', { waitUntil: 'networkidle' })

    const table = page.getByRole('table')
    await expect(table).toBeVisible()

    // Should have at least 2 property rows (plus header row)
    const rows = table.getByRole('row')
    await expect(rows).toHaveCount(3) // 1 header + 2 data rows

    await expect(page.getByText('Harbor View Tower')).toBeVisible()
    await expect(page.getByText('Main Street Plaza')).toBeVisible()
  })

  test('shows empty state when no finalized snapshots exist', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v1/portfolio/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PORTFOLIO_SUMMARY),
      })
    })

    await page.goto('/portfolio', { waitUntil: 'networkidle' })

    // Empty-state copy must match the component (PortfolioPage.tsx) and its
    // unit test: "No portfolio data yet".
    await expect(page.getByText(/no portfolio data yet/i)).toBeVisible()
    await expect(page.getByRole('table')).not.toBeVisible()
  })

  test('shows 2024 reconciliation year in subtitle', async ({
    authenticatedPage: page,
  }) => {
    await page.route('**/api/v1/portfolio/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PORTFOLIO_SUMMARY),
      })
    })

    await page.goto('/portfolio', { waitUntil: 'networkidle' })

    await expect(page.getByText(/2024 reconciliation year/i)).toBeVisible()
  })
})
