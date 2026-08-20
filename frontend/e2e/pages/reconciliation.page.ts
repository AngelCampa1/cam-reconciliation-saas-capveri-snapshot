/**
 * ReconciliationPage — recon actions + filters + panels
 */
import { type Page, type Locator } from '@playwright/test'

export class ReconciliationPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get calculateButton(): Locator {
    return this.page.locator('[data-testid="calculate-button"]')
  }

  get finalizeButton(): Locator {
    return this.page.locator('[data-testid="finalize-button"]')
  }

  get exportButton(): Locator {
    return this.page.locator('[data-testid="export-button"]')
  }

  get demandLetterButton(): Locator {
    return this.page.locator('[data-testid="demand-letter-button"]')
  }

  get moreButton(): Locator {
    return this.page.getByRole('button', { name: /more/i })
  }

  get demandLetterPanel(): Locator {
    return this.page.locator('[data-testid="demand-letter-panel"]')
  }

  get traceDrawer(): Locator {
    return this.page.locator('[data-testid="calculation-trace-drawer"]')
  }

  get yearFilter(): Locator {
    return this.page.locator('[data-testid="year-select-trigger"]')
      .or(this.page.getByRole('combobox', { name: /year/i }))
      .first()
  }

  get propertyFilter(): Locator {
    return this.page.locator('[data-testid="property-select-trigger"]')
      .or(this.page.getByRole('combobox', { name: /property/i }))
      .first()
  }

  /** Click a Radix Select trigger and pick an option by visible text */
  async selectOption(trigger: Locator, optionText: string): Promise<void> {
    await trigger.click()
    await this.page.getByRole('option', { name: optionText }).click()
  }

  get boardCapRateSlider(): Locator {
    return this.page.locator('[data-testid="board-cap-rate-slider"]')
  }

  get boardDownloadButton(): Locator {
    return this.page.locator('[data-testid="board-download-button"]')
  }

  async clickExportPDF(): Promise<void> {
    await this.exportButton.click()
    await this.page.locator('[data-testid="format-card-pdf"]').click()
  }

  async clickBoardDownload(): Promise<void> {
    await this.boardDownloadButton.click()
  }

  async openDemandLetterPanel(): Promise<void> {
    await this.moreButton.click()
    await this.demandLetterButton.click()
  }

  /** Confirm the finalize dialog */
  async confirmFinalize(): Promise<void> {
    await this.finalizeButton.click()
    await this.page.getByRole('button', { name: 'Confirm' }).click()
  }
}
