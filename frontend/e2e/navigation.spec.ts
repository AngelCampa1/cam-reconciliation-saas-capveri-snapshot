/**
 * Navigation Smoke Test
 *
 * Verifies all main sidebar links render their pages without errors.
 * Uses data-testid="nav-item-{id}" selectors from Sidebar.tsx via AppPage POM.
 * Expands parent nav groups before clicking child items.
 */
import { test, expect } from './fixtures'
import { AppPage, type NavItem } from './pages/app.page'

interface NavCheck {
  item: NavItem
  parent?: 'analysis' | 'documents' | 'settings'
  heading: RegExp | string
  path: RegExp
}

const NAV_CHECKS: NavCheck[] = [
  { item: 'dashboard', heading: /dashboard/i, path: /\/dashboard$/ },
  { item: 'properties', heading: /properties/i, path: /\/properties$/ },
  { item: 'reconciliations', heading: /reconciliation/i, path: /\/reconciliations$/ },
  {
    item: 'documents-upload-gl',
    parent: 'documents',
    heading: /ingestion|upload|import/i,
    path: /\/ingestion$/,
  },
  {
    item: 'documents-extractions',
    parent: 'documents',
    heading: /extraction/i,
    path: /\/extractions$/,
  },
  {
    item: 'analysis-yoy',
    parent: 'analysis',
    heading: /year.over.year|comparison/i,
    path: /\/analysis\/year-over-year$/,
  },
  { item: 'settings-team', parent: 'settings', heading: /team/i, path: /\/settings\/team$/ },
  {
    item: 'settings-billing',
    parent: 'settings',
    heading: /billing/i,
    path: /\/settings\/billing$/,
  },
]

test.describe('Navigation Smoke Tests', () => {
  for (const { item, parent, heading, path } of NAV_CHECKS) {
    test(`nav-item-${item} renders page`, async ({ authenticatedPage: page }) => {
      const app = new AppPage(page)

      // Expand parent group first if needed
      if (parent) {
        const parentLocator = app.navItem(parent)
        const isExpanded = await parentLocator
          .getAttribute('aria-expanded')
          .catch(() => null)
        if (isExpanded !== 'true') {
          await app.expandNav(parent)
        }
      }

      const navLocator = app.navItem(item)
      await expect(navLocator).toBeVisible({ timeout: 5000 })
      await navLocator.click()
      await expect(page).toHaveURL(path)

      await expect(
        page
          .getByRole('heading', { name: heading })
          .or(page.locator('main h1, [data-testid="page-heading"]').first())
          .first()
      ).toBeVisible({ timeout: 15000 })

      await expect(page.getByText(/something went wrong|unexpected error|500/i)).not.toBeVisible({
        timeout: 2000,
      })
    })
  }

  test('sidebar has at least 5 nav items visible from dashboard', async ({
    authenticatedPage: page,
  }) => {
    const count = await page.locator('[data-testid^="nav-item-"]').count()
    expect(count).toBeGreaterThanOrEqual(5)
  })
})
