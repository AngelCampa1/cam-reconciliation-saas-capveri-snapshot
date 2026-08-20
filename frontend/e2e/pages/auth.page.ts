/**
 * AuthPage — login + register
 *
 * Uses id= selectors to avoid "Show password" button clash with getByLabel.
 * Login: id="email", id="password", button text "Sign in"
 * Register: id="email", id="password", id="acceptTerms", button "Create account"
 *   (org name is derived from email; there is no confirm-password field)
 */
import { type Page, type Locator } from '@playwright/test'

export class AuthPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // --- Login ---
  get emailInput(): Locator {
    return this.page.locator('#email')
  }

  get passwordInput(): Locator {
    return this.page.locator('#password')
  }

  get signInButton(): Locator {
    return this.page.getByRole('button', { name: 'Sign in' })
  }

  async fillLogin(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
  }

  async submitLogin(): Promise<void> {
    await this.signInButton.click()
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillLogin(email, password)
    await this.submitLogin()
  }

  // --- Register ---
  get createAccountButton(): Locator {
    return this.page.getByRole('button', { name: 'Create account' })
  }

  get acceptTermsCheckbox(): Locator {
    return this.page.locator('#acceptTerms')
  }

  async fillRegister(email: string, _org: string, password: string): Promise<void> {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.acceptTermsCheckbox.click()
  }

  async submitRegister(): Promise<void> {
    await this.createAccountButton.click()
  }

  async register(email: string, org: string, password: string): Promise<void> {
    await this.fillRegister(email, org, password)
    await this.submitRegister()
  }
}
