/**
 * TenantPage — tenant portal interactions
 */
import { type Page, type Locator } from '@playwright/test'

export class TenantPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  statementRow(year: string | number): Locator {
    // Statement rows render as a <div data-testid="statement-row"> on the
    // tenant dashboard (period text is "YYYY-MM-DD - YYYY-MM-DD"), not a table row.
    return this.page
      .locator('[data-testid="statement-row"], tr, [data-row]')
      .filter({ hasText: String(year) })
  }

  // Dashboard "Dispute statement for {property}" button — scoped so it does NOT
  // match the sidebar "Disputes" nav item (substring match would otherwise win).
  get disputeButton(): Locator {
    return this.page
      .getByRole('button', { name: /Dispute statement for/i })
      .first()
  }

  get categorySelect(): Locator {
    return this.page.getByLabel(/category/i)
  }

  categoryOption(label: string | RegExp): Locator {
    return this.page.getByRole('option', { name: label })
  }

  get descriptionField(): Locator {
    return this.page.getByLabel(/description/i)
  }

  get submitDisputeButton(): Locator {
    return this.page.getByRole('button', { name: /submit dispute/i })
  }
}
