/**
 * Tenant Login page object model
 *
 * Encapsulates all interactions with the tenant login page at /tenant/login.
 * Follows the same Page Object Model pattern as LoginPage.
 */
import { type Page, type Locator, expect } from '@playwright/test'

export class TenantLoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator
  readonly loadingSpinner: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.locator('[name="email"]')
    this.passwordInput = page.locator('[name="password"]')
    this.submitButton = page.locator('button[type="submit"]')
    this.errorMessage = page.locator('[role="alert"]')
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]')
  }

  /**
   * Navigate to tenant login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/tenant/login')
    await this.emailInput.waitFor({ state: 'visible' })
  }

  /**
   * Fill and submit tenant login form
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  /**
   * Login and wait for redirect to tenant dashboard
   */
  async loginAndWaitForDashboard(email: string, password: string): Promise<void> {
    await this.login(email, password)
    await this.page.waitForURL('**/tenant/dashboard', { timeout: 10000 })
  }

  /**
   * Assert that an error message is displayed
   */
  async expectError(message: string): Promise<void> {
    await this.errorMessage.waitFor({ state: 'visible' })
    await expect(this.errorMessage).toContainText(message)
  }

  /**
   * Assert tenant login page is displayed
   */
  async expectToBeOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL(/.*tenant\/login/)
    await expect(this.emailInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(): Promise<void> {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // No spinner present is fine
    })
    await expect(this.submitButton).toBeEnabled()
  }
}
