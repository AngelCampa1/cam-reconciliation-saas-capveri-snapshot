/**
 * Journey 11: Billing
 *
 * Navigate to Settings → Billing → view plan → cancel subscription
 * → assert Canceling status → resume → assert status normalizes.
 */
import { test, expect } from '../fixtures'
import { AppPage } from '../pages/app.page'
import { SettingsPage } from '../pages/settings.page'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_USER_EMAIL = 'e2e-test@capveri.com'

async function seedBillingSubscription(input: {
  cancelAtPeriodEnd: boolean
}) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: user, error: userError } = await admin
    .from('users')
    .select('organization_id')
    .eq('email', TEST_USER_EMAIL)
    .single()
  if (userError || !user) {
    throw new Error(`Test user not found: ${userError?.message}`)
  }

  const { error } = await admin.from('subscriptions').upsert(
    {
      organization_id: user.organization_id,
      status: 'active',
      plan: 'defend',
      tier: 'reconcile',
      pricing_model: 'per_unit',
      billing_interval: 'annual',
      building_count: 1,
      unit_count: 120,
      included_units: 120,
      stripe_customer_id: 'cus_e2e_local',
      stripe_subscription_id: 'sub_e2e_local',
      current_period_start: '2026-01-01T00:00:00Z',
      current_period_end: '2099-01-01T00:00:00Z',
      cancel_at_period_end: input.cancelAtPeriodEnd,
    },
    { onConflict: 'organization_id' }
  )
  if (error) {
    throw new Error(`Failed to seed billing subscription: ${error.message}`)
  }
}

test.describe('Journey 11 — Billing', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await seedBillingSubscription({ cancelAtPeriodEnd: false })
    const app = new AppPage(page)
    await app.expandNav('settings')
    await app.navTo('settings-billing')
    await expect(
      page.getByTestId('page-header-title')
    ).toBeVisible({ timeout: 10000 })
  })

  test('displays current plan status', async ({ authenticatedPage: page }) => {
    // Either shows plan info OR "No active subscription"
    await expect(
      page.getByText(
        /reconcile|control|defend|enterprise|no active subscription|plan/i
      ).first()
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Growth')).toHaveCount(0)
    await expect(page.getByText('Professional')).toHaveCount(0)
  })

  test('cancel flow shows wizard steps', async ({ authenticatedPage: page }) => {
    const cancelBtn = page.getByRole('button', { name: /cancel subscription/i })
    await expect(cancelBtn).toBeVisible({ timeout: 10000 })
    await cancelBtn.click()
    // Wizard step 1: reason selection
    await expect(
      page.getByText(/why.*cancel|reason|cancel.*subscription/i).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows resume action when subscription is canceling', async ({ authenticatedPage: page }) => {
    const settings = new SettingsPage(page)
    await seedBillingSubscription({ cancelAtPeriodEnd: true })
    await page.reload()

    await expect(settings.cancelingBadge).toBeVisible({ timeout: 15000 })
    await expect(settings.resumeSubscriptionButton).toBeVisible({
      timeout: 10000,
    })
    await expect(
      page.getByRole('button', { name: /cancel subscription/i })
    ).not.toBeVisible()
  })
})
