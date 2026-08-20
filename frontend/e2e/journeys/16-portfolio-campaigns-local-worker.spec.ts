/**
 * Journey 16: real local Worker portfolio and campaign pipeline
 *
 * Existing portfolio/pipeline browser specs route-mock the API. This spec uses
 * the normal seeded E2E account and local Worker, adding only campaign rows
 * needed for pipeline transitions.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000001'

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

type SeededCampaigns = {
  finalizedCampaignId: string
  approvedCampaignId: string
  approvedPropertyId: string
  organizationId: string
  userId: string
  year: number
}

async function getE2EUser() {
  const { data, error } = await adminClient
    .from('users')
    .select('id,organization_id')
    .eq('email', TEST_USER_EMAIL)
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to load E2E user: ${error?.message ?? 'missing row'}`
    )
  }

  return data as { id: string; organization_id: string }
}

async function seedCampaignRows(year: number): Promise<SeededCampaigns> {
  const user = await getE2EUser()
  const finalizedCampaignId = randomUUID()
  const approvedCampaignId = randomUUID()
  const approvedPropertyId = randomUUID()

  const { error: propertyError } = await adminClient.from('properties').insert({
    id: approvedPropertyId,
    organization_id: user.organization_id,
    name: 'Portfolio Pipeline Approved Property',
    address_line1: '200 Pipeline Way',
    city: 'Dallas',
    state: 'TX',
    postal_code: '75201',
    total_rentable_sqft: 25000,
    total_usable_sqft: 22500,
    common_area_sqft: 2500,
    target_occupancy: 0.95,
  })

  if (propertyError) {
    throw new Error(
      `Failed to seed approved property: ${propertyError.message}`
    )
  }

  const { error } = await adminClient.from('reconciliation_campaigns').insert([
    {
      id: finalizedCampaignId,
      organization_id: user.organization_id,
      property_id: TEST_PROPERTY_ID,
      period_year: year,
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by_user_id: user.id,
    },
    {
      id: approvedCampaignId,
      organization_id: user.organization_id,
      property_id: approvedPropertyId,
      period_year: year,
      status: 'approved',
      finalized_at: new Date().toISOString(),
      finalized_by_user_id: user.id,
      submitted_for_review_at: new Date().toISOString(),
      submitted_for_review_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      approved_by_user_id: user.id,
    },
  ])

  if (error) {
    await adminClient.from('properties').delete().eq('id', approvedPropertyId)
    throw new Error(`Failed to seed campaign rows: ${error.message}`)
  }

  return {
    finalizedCampaignId,
    approvedCampaignId,
    approvedPropertyId,
    organizationId: user.organization_id,
    userId: user.id,
    year,
  }
}

async function cleanupCampaignRows(seed: SeededCampaigns | null) {
  if (!seed) return

  const { error: campaignsError } = await adminClient
    .from('reconciliation_campaigns')
    .delete()
    .in('id', [seed.finalizedCampaignId, seed.approvedCampaignId])
  const { error: propertyError } = await adminClient
    .from('properties')
    .delete()
    .eq('id', seed.approvedPropertyId)

  if (campaignsError || propertyError) {
    throw new Error(
      `Failed to cleanup campaign seed: ${
        campaignsError?.message ?? propertyError?.message
      }`
    )
  }
}

test.describe('Journey 16 - local Worker portfolio campaigns', () => {
  test('renders portfolio summary and advances campaign rows through the real Worker', async ({
    authenticatedPage: page,
  }) => {
    const currentYear = new Date().getFullYear()
    let seed: SeededCampaigns | null = null

    try {
      page.on('pageerror', (error) => {
        console.error(`portfolio pipeline page error: ${error.message}`)
      })
      seed = await seedCampaignRows(currentYear)

      const portfolioResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/portfolio/summary') &&
          response.status() === 200
      )
      await page.goto('/portfolio', { waitUntil: 'networkidle' })
      const portfolioSummary = (await (
        await portfolioResponsePromise
      ).json()) as {
        total_leakage?: string
        properties?: Array<{ property_name?: string }>
      }
      expect(Number(portfolioSummary.total_leakage ?? 0)).toBeGreaterThan(0)
      expect(
        portfolioSummary.properties?.some(
          (property) => property.property_name === 'Test Plaza Shopping Center'
        )
      ).toBe(true)
      await expect(
        page.getByRole('heading', { name: 'Portfolio' })
      ).toBeVisible()
      await expect(page.getByTestId('portfolio-metric-cards')).toBeVisible()
      await expect(page.getByText('Test Plaza Shopping Center')).toBeVisible()

      const campaignsResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/campaigns') &&
          response.status() === 200
      )
      await page.goto('/portfolio/pipeline', { waitUntil: 'networkidle' })
      const campaignsPayload = await (await campaignsResponsePromise).json()
      expect(campaignsPayload).toHaveLength(2)
      await expect(
        page.getByRole('heading', { name: /portfolio pipeline/i })
      ).toBeVisible()
      await expect(page.getByTestId('campaign-row')).toHaveCount(2)
      await expect(page.getByTestId('status-chips')).toContainText(
        'Finalized: 1'
      )
      await expect(page.getByTestId('status-chips')).toContainText(
        'Approved: 1'
      )
      const finalizedCampaignRow = page
        .getByTestId('campaign-row')
        .filter({ hasText: 'Test Plaza Shopping Center' })

      const submitResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(
              `/api/v1/campaigns/${seed?.finalizedCampaignId}/submit-for-review`
            ) &&
          response.request().method() === 'POST' &&
          response.status() === 200
      )
      await finalizedCampaignRow
        .getByRole('button', { name: /submit for review/i })
        .click()
      await submitResponsePromise
      await expect(page.getByTestId('status-chips')).toContainText(
        'In Review: 1'
      )

      const approveResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(
              `/api/v1/campaigns/${seed?.finalizedCampaignId}/approve`
            ) &&
          response.request().method() === 'POST' &&
          response.status() === 200
      )
      await finalizedCampaignRow
        .getByRole('button', { name: /^Approve$/ })
        .click()
      await approveResponsePromise
      await expect(page.getByTestId('status-chips')).toContainText(
        'Approved: 2'
      )

      const markSentResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(
              `/api/v1/campaigns/${seed?.finalizedCampaignId}/mark-sent`
            ) &&
          response.request().method() === 'POST' &&
          response.status() === 200
      )
      await finalizedCampaignRow
        .getByRole('button', { name: /^Mark Sent$/ })
        .click()
      await markSentResponsePromise
      await expect(page.getByTestId('status-chips')).toContainText('Sent: 1')

      const { data: transitionedCampaign, error } = await adminClient
        .from('reconciliation_campaigns')
        .select(
          'status,submitted_for_review_by_user_id,approved_by_user_id,sent_by_user_id'
        )
        .eq('id', seed.finalizedCampaignId)
        .single()
      expect(error).toBeNull()
      expect(transitionedCampaign).toMatchObject({
        status: 'sent',
        submitted_for_review_by_user_id: seed.userId,
        approved_by_user_id: seed.userId,
        sent_by_user_id: seed.userId,
      })
    } finally {
      await cleanupCampaignRows(seed)
    }
  })
})
