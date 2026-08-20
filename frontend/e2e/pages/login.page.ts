/**
 * Login page object model
 *
 * Encapsulates all interactions with the login page.
 * Follows Page Object Model pattern for maintainable E2E tests.
 */
import { type Page, type Locator, expect } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator
  readonly forgotPasswordLink: Locator
  readonly registerLink: Locator
  readonly loadingSpinner: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.locator('[name="email"]')
    this.passwordInput = page.locator('[name="password"]')
    this.submitButton = page.locator('button[type="submit"]')
    this.errorMessage = page.locator('[role="alert"]')
    this.forgotPasswordLink = page.locator('a[href*="forgot"]')
    this.registerLink = page.locator('a[href*="register"]')
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]')
  }

  /**
   * Navigate to login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/login')
    await this.emailInput.waitFor({ state: 'visible' })
  }

  /**
   * Fill and submit login form
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  /**
   * Login and wait for redirect to dashboard
   */
  async loginAndWaitForDashboard(email: string, password: string): Promise<void> {
    await this.login(email, password)
    await this.page.waitForURL('**/dashboard', { timeout: 10000 })
  }

  /**
   * Assert that an error message is displayed
   */
  async expectError(message: string): Promise<void> {
    await this.errorMessage.waitFor({ state: 'visible' })
    await expect(this.errorMessage).toContainText(message)
  }

  /**
   * Assert login page is displayed
   */
  async expectToBeOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL(/.*login/)
    await expect(this.emailInput).toBeVisible()
    await expect(this.passwordInput).toBeVisible()
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click()
  }

  /**
   * Click register link
   */
  async clickRegister(): Promise<void> {
    await this.registerLink.click()
  }

  /**
   * Check if submit button is disabled (during loading)
   */
  async isSubmitDisabled(): Promise<boolean> {
    return await this.submitButton.isDisabled()
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for any loading spinner to disappear
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // No spinner present is fine
    })
    // Ensure submit button is enabled
    await expect(this.submitButton).toBeEnabled()
  }
}
