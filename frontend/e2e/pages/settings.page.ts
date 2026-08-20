/**
 * SettingsPage — team management + billing
 */
import { type Page, type Locator } from '@playwright/test'

export class SettingsPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // --- Team ---
  get inviteMemberButton(): Locator {
    return this.page.getByRole('button', { name: 'Invite Member' })
  }

  get emailField(): Locator {
    return this.page.getByRole('textbox', { name: /email/i })
  }

  get roleSelect(): Locator {
    return this.page.getByRole('combobox', { name: /role/i })
  }

  get sendInvitationButton(): Locator {
    return this.page.getByRole('button', { name: 'Send Invitation' })
  }

  revokeButton(email: string): Locator {
    return this.page
      .locator('tr, [data-row]')
      .filter({ hasText: email })
      .getByRole('button').last()
  }

  // --- Billing ---
  get cancelSubscriptionButton(): Locator {
    return this.page.getByRole('button', { name: 'Cancel Subscription' })
  }

  get resumeSubscriptionButton(): Locator {
    return this.page.getByRole('button', { name: 'Resume Subscription' })
  }

  get changePlanButton(): Locator {
    return this.page.getByRole('button', { name: 'Change Plan' })
  }

  get cancelingBadge(): Locator {
    return this.page.getByText('Canceling')
  }
}
