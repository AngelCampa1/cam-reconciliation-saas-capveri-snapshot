/**
 * IngestionPage — GL data upload
 */
import { type Page, type Locator } from '@playwright/test'

export class IngestionPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get propertySelect(): Locator {
    return this.page.locator('#property-select')
      .or(this.page.getByRole('combobox', { name: /property/i }))
      .first()
  }

  get fileInput(): Locator {
    return this.page.locator('input[type="file"]')
  }

  get uploadButton(): Locator {
    return this.page.getByRole('button', { name: /upload|import|submit/i })
  }

  async selectProperty(name: string): Promise<void> {
    await this.propertySelect.click()
    await this.page.getByRole('option', { name }).click()
  }

  async uploadFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath)
  }
}
