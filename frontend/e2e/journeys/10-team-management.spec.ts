/**
 * Journey 10: Team Management
 *
 * Navigate to Settings → Team tab → invite member → revoke → role change.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { SettingsPage } from '../pages/settings.page'

test.describe('Journey 10 — Team Management', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    const app = new AppPage(page)
    await app.expandNav('settings')
    await app.navTo('settings-team')
    await expect(page.getByRole('heading', { name: /team/i })).toBeVisible({ timeout: 10000 })
  })

  test('invites a new team member', async ({ authenticatedPage: page }) => {
    const settings = new SettingsPage(page)
    const inviteEmail = `e2e-invite-${Date.now()}@capveri.com`

    await settings.inviteMemberButton.click()
    await settings.emailField.fill(inviteEmail)
    // Role defaults to "Member" — no need to change via Radix select
    await settings.sendInvitationButton.click()

    // Email appears in table cell and possibly toast — use table cell.
    // exact:true avoids matching the revoke action cell whose aria-label
    // ("Revoke invitation for {email}") also contains the email.
    await expect(page.getByRole('cell', { name: inviteEmail, exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('revokes an invitation and row is removed', async ({ authenticatedPage: page }) => {
    const settings = new SettingsPage(page)
    const revokeEmail = `e2e-revoke-${Date.now()}@capveri.com`

    await settings.inviteMemberButton.click()
    await settings.emailField.fill(revokeEmail)
    // Role defaults to "Member"
    await settings.sendInvitationButton.click()
    await expect(page.getByRole('cell', { name: revokeEmail, exact: true })).toBeVisible({ timeout: 10000 })

    // Click the action button in the row (X/trash icon)
    await settings.revokeButton(revokeEmail).click()

    // Handle confirmation dialog if present
    const confirmBtn = page.getByRole('button', { name: /revoke|confirm|yes/i }).last()
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await expect(page.getByRole('cell', { name: revokeEmail, exact: true })).not.toBeVisible({ timeout: 10000 })
  })

})
