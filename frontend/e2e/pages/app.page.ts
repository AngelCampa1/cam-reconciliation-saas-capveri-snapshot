/**
 * AppPage — shared base navigation + logout
 *
 * Uses data-testid="nav-item-{id}" selectors from Sidebar.tsx.
 */
import { type Page, type Locator } from '@playwright/test'

export type NavItem =
  | 'dashboard'
  | 'properties'
  | 'reconciliations'
  | 'disputes'
  | 'analysis'
  | 'analysis-yoy'
  | 'documents'
  | 'documents-upload-gl'
  | 'documents-extractions'
  | 'settings'
  | 'settings-team'
  | 'settings-billing'

export type NavParent = 'analysis' | 'documents' | 'settings'

export class AppPage {
  readonly page: Page
  /** Scope nav clicks to desktop sidebar to avoid strict-mode violation with mobile sidebar */
  private readonly sidebar: Locator

  constructor(page: Page) {
    this.page = page
    this.sidebar = page.locator('[data-testid="sidebar-desktop"]')
  }

  get userMenuButton(): Locator {
    return this.page.locator('[data-testid="user-menu-button"]')
  }

  get logoutButton(): Locator {
    return this.page.locator('[data-testid="logout-button"]')
  }

  navItem(id: NavItem): Locator {
    return this.sidebar.locator(`[data-testid="nav-item-${id}"]`)
  }

  async navTo(item: NavItem): Promise<void> {
    await this.navItem(item).click()
  }

  async expandNav(parent: NavParent): Promise<void> {
    await this.navItem(parent).click()
  }

  async logout(): Promise<void> {
    await this.userMenuButton.click()
    await this.logoutButton.click()
  }
}
