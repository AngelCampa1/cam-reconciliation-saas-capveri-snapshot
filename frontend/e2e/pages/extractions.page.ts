/**
 * ExtractionsPage — lease extraction review
 */
import { type Page, type Locator } from '@playwright/test'

export class ExtractionsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  get reviewButton(): Locator {
    return this.page.locator('[data-testid="review-button"]').first()
  }

  get approveButton(): Locator {
    return this.page.getByRole('button', { name: 'Approve' })
  }

  get rejectButton(): Locator {
    return this.page.getByRole('button', { name: 'Reject' })
  }

  get draftSavingIndicator(): Locator {
    return this.page.locator('[data-testid="draft-saving-indicator"]')
  }

  get draftSavedIndicator(): Locator {
    return this.page.locator('[data-testid="draft-saved-indicator"]')
  }

  statusBadge(text: string): Locator {
    return this.page.getByText(new RegExp(text, 'i'))
  }
}
