/**
 * PropertiesPage — property list + detail + tabs
 *
 * data-testid="add-property-button"
 * data-testid="property-card" (role="button") — click to open detail
 * Detail tabs: exact text names
 */
import { type Page, type Locator } from '@playwright/test'

export type PropertyTab =
  | 'Overview'
  | 'Reconciliations'
  | 'Pools'
  | 'Units'
  | 'Leases'
  | 'Imports'
  | 'Compliance'

export class PropertiesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get addPropertyButton(): Locator {
    return this.page.locator('[data-testid="add-property-button"]')
  }

  propertyCard(name: string): Locator {
    return this.page.locator('[data-testid="property-card"]').filter({ hasText: name })
  }

  async clickProperty(name: string): Promise<void> {
    // Desktop DataTable renders <tr> rows, not PropertyCards.
    // PropertyCard (data-testid="property-card") is mobile-only.
    const row = this.page.locator('tbody tr').filter({ hasText: name }).first()
    await row.click()
  }

  tab(name: PropertyTab): Locator {
    return this.page.getByRole('tab', { name, exact: true })
  }

  async clickTab(name: PropertyTab): Promise<void> {
    await this.tab(name).click()
  }
}
