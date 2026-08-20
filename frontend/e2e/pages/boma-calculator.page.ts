/**
 * BomaCalculatorPage — marketing BOMA 2024 calculator tool
 *
 * Selectors from Boma2024CalculatorClient.tsx
 */
import { type Page, type Locator } from '@playwright/test'

const UNLOCK_STORAGE_KEY = 'capveri_calculator_unlocked:boma-2024-calculator'

export class BomaCalculatorPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get usableSfInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Existing usable SF' })
  }

  get rentableSfInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Existing rentable SF' })
  }

  get balconySfInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Balcony SF' })
  }

  get annualRentInput(): Locator {
    return this.page.getByRole('spinbutton', { name: 'Annual rent per SF' })
  }

  get hiddenSfResult(): Locator {
    return this.page.getByText('Hidden Rentable SF Found').locator('..')
  }

  get pctIncreaseResult(): Locator {
    return this.page.getByText('% Increase in Rentable Area').locator('..')
  }

  // Gated results (visible only after the financial-projections gate unlocks)
  get revenueLiftResult(): Locator {
    return this.page.getByText('Annual Revenue Lift').locator('..')
  }

  get assetLiftResult(): Locator {
    return this.page.getByText('Asset Value Lift').locator('..')
  }

  /**
   * Pre-unlock the financial-projections gate the way a returning visitor is
   * unlocked: CalculatorUnlockGate auto-unlocks on mount when the per-slug
   * localStorage flag is set (it does not re-hit the lead-capture API). This
   * keeps the gated assertion deterministic and free of the Turnstile /
   * lead-magnet-storage dependencies that the real submit path requires, which
   * are not provisioned in a local E2E environment. Reloads so the gate's
   * mount-time effect observes the flag.
   */
  async preUnlockGate(): Promise<void> {
    await this.page.evaluate((key) => {
      localStorage.setItem(key, 'true')
    }, UNLOCK_STORAGE_KEY)
    await this.page.reload()
  }
}
