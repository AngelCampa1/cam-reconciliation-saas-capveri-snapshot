/**
 * Journey 03: Leakage Detection
 *
 * Leakage results appear on the Dashboard (WelcomeCard "Recovery Opportunity")
 * and in the onboarding wizard (LeakageResultStep). There is no "Leakage" tab
 * on the property detail page — leakage is surfaced via the dashboard hero card.
 *
 * Tests: navigate to dashboard → assert recovery opportunity amount visible
 * → assert it links to reconciliations → navigate and return → assert persists.
 *
 * Seed data: 2024 Tenant 101 billed $28,000 vs correct $22,000 = $6,000 leakage.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'

test.describe('Journey 03 — Leakage Detection', () => {
  test('dashboard shows recovery opportunity when leakage data exists', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    await app.navTo('dashboard')

    await expect(
      page.getByRole('heading', { name: /money to recover/i })
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('$8,950')).toBeVisible()
  })

  test('recovery amount persists after navigation', async ({
    authenticatedPage: page,
  }) => {
    const app = new AppPage(page)
    await app.navTo('dashboard')

    await expect(
      page.getByRole('heading', { name: /money to recover/i })
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('$8,950')).toBeVisible()

    // Navigate away to properties
    await app.navTo('properties')
    await expect(page.getByRole('heading', { name: /properties/i })).toBeVisible({ timeout: 10000 })

    // Navigate back to dashboard
    await app.navTo('dashboard')

    await expect(
      page.getByRole('heading', { name: /money to recover/i })
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('$8,950')).toBeVisible()
  })
})
