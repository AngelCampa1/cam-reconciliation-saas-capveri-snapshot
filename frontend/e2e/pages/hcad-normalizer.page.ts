/**
 * HcadNormalizerPage — marketing HCAD Tax Normalizer tool
 *
 * Selectors from HcadTaxNormalizerClient.tsx
 */
import { type Page, type Locator } from '@playwright/test'

export class HcadNormalizerPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get baseYearInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Original base year assessment' })
  }

  get retroAdjInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'ARB retroactive reduction' })
  }

  get currentTaxInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Current year property tax' })
  }

  get proRataInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Tenant pro-rata share' })
  }

  get capRateInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Expense cap rate' })
  }

  get calculateButton(): Locator {
    return this.page.getByRole('button', { name: 'Calculate Recovery' })
  }

  get recoveryDeltaResult(): Locator {
    // Exact match: the results card also has a "Recovery Opportunity" heading,
    // so a substring match collides (strict-mode violation). The value lives in
    // a sibling <p> under the same wrapping <div> as this label paragraph.
    return this.page.getByText('Recovery opportunity', { exact: true }).locator('..')
  }

  get cappedRecoveryResult(): Locator {
    return this.page.getByText('Capped recovery', { exact: true }).locator('..')
  }

  async calculate(): Promise<void> {
    await this.calculateButton.click()
  }
}
