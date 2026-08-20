/**
 * Journey 17: real local Worker tax protest path.
 *
 * Exercises the browser deadlines page and finalized reconciliation export
 * action against the local Cloudflare Worker. The stable E2E seed data already
 * supplies finalized 2024 snapshots, GL rows, pool mappings, and subscription
 * access; this spec temporarily configures the seeded property for Harris
 * County and restores its original tax protest fields in teardown.
 */
import { createClient } from '@supabase/supabase-js'
import { readFile, stat } from 'node:fs/promises'
import { test, expect } from '../fixtures'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000001'
const API_BASE_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8798'
const EXPECTED_API_ORIGIN = new URL(API_BASE_URL).origin

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

type PropertyTaxFields = {
  name: string
  state: string | null
  tax_protest_county: string | null
  tax_protest_deadline_override: string | null
}

type UserOrg = {
  organization_id: string
}

type SubscriptionFields = {
  organization_id: string
  status: string | null
  plan: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

function isExpectedWorkerResponse(url: string): boolean {
  return new URL(url).origin === EXPECTED_API_ORIGIN
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index
    }
  }

  throw new Error('Downloaded file is not a ZIP: missing central directory')
}

function listZipEntries(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOfCentralDirectory = findEndOfCentralDirectory(bytes)
  const entryCount = view.getUint16(endOfCentralDirectory + 10, true)
  let offset = view.getUint32(endOfCentralDirectory + 16, true)
  const entries: string[] = []

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error(`Downloaded ZIP has invalid central entry at ${offset}`)
    }

    const fileNameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const fileNameStart = offset + 46
    const fileNameEnd = fileNameStart + fileNameLength

    entries.push(
      new TextDecoder().decode(bytes.slice(fileNameStart, fileNameEnd))
    )
    offset = fileNameEnd + extraLength + commentLength
  }

  return entries
}

async function loadPropertyTaxFields(): Promise<PropertyTaxFields> {
  const { data, error } = await adminClient
    .from('properties')
    .select('name,state,tax_protest_county,tax_protest_deadline_override')
    .eq('id', TEST_PROPERTY_ID)
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to load seeded property: ${error?.message ?? 'missing row'}`
    )
  }

  return data as PropertyTaxFields
}

async function getE2eOrganizationId(): Promise<string> {
  const { data, error } = await adminClient
    .from('users')
    .select('organization_id')
    .eq('email', TEST_USER_EMAIL)
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to load E2E user org: ${error?.message ?? 'missing row'}`
    )
  }

  return (data as UserOrg).organization_id
}

async function loadSubscription(
  organizationId: string
): Promise<SubscriptionFields | null> {
  const { data, error } = await adminClient
    .from('subscriptions')
    .select(
      'organization_id,status,plan,current_period_end,cancel_at_period_end'
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load E2E subscription: ${error.message}`)
  }

  return (data as SubscriptionFields | null) ?? null
}

async function ensurePaidAccess(organizationId: string) {
  const { error: subscriptionError } = await adminClient
    .from('subscriptions')
    .upsert(
      {
        organization_id: organizationId,
        status: 'active',
        plan: 'defend',
        current_period_end: '2099-01-01T00:00:00Z',
        cancel_at_period_end: false,
      },
      { onConflict: 'organization_id' }
    )

  if (subscriptionError) {
    throw new Error(
      `Failed to ensure paid E2E access: ${subscriptionError.message}`
    )
  }
}

async function restoreSubscription(
  organizationId: string,
  original: SubscriptionFields | null
) {
  if (original === null) {
    const { error } = await adminClient
      .from('subscriptions')
      .delete()
      .eq('organization_id', organizationId)

    if (error) {
      throw new Error(
        `Failed to remove temporary subscription: ${error.message}`
      )
    }

    return
  }

  const { error } = await adminClient
    .from('subscriptions')
    .upsert(original, { onConflict: 'organization_id' })

  if (error) {
    throw new Error(`Failed to restore E2E subscription: ${error.message}`)
  }
}

async function configureSeedPropertyForTaxProtest() {
  const { error } = await adminClient
    .from('properties')
    .update({
      state: 'TX',
      tax_protest_county: 'Harris',
      tax_protest_deadline_override: null,
    })
    .eq('id', TEST_PROPERTY_ID)

  if (error) {
    throw new Error(`Failed to configure seeded property: ${error.message}`)
  }
}

async function restoreSeedProperty(original: PropertyTaxFields) {
  const { error } = await adminClient
    .from('properties')
    .update({
      state: original.state,
      tax_protest_county: original.tax_protest_county,
      tax_protest_deadline_override: original.tax_protest_deadline_override,
    })
    .eq('id', TEST_PROPERTY_ID)

  if (error) {
    throw new Error(`Failed to restore seeded property: ${error.message}`)
  }
}

test.describe('Journey 17 - local Worker tax protest', () => {
  test('loads deadlines and downloads a package from a finalized reconciliation', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const originalProperty = await loadPropertyTaxFields()
    const organizationId = await getE2eOrganizationId()
    const originalSubscription = await loadSubscription(organizationId)

    try {
      await ensurePaidAccess(organizationId)
      await configureSeedPropertyForTaxProtest()

      const deadlinesResponsePromise = page.waitForResponse(
        (response) =>
          isExpectedWorkerResponse(response.url()) &&
          response.url().includes('/api/v1/tax-protest/deadlines') &&
          response.status() === 200
      )
      await page.goto('/tax-protest')
      const deadlinesResponse = await deadlinesResponsePromise
      const deadlinesPayload = (await deadlinesResponse.json()) as {
        items?: {
          property_id: string
          property_name: string
          county: string | null
          state: string | null
          effective_deadline: string | null
          is_configured: boolean
        }[]
        year?: number
      }

      expect(deadlinesPayload.items?.length ?? 0).toBeGreaterThan(0)
      const seededDeadline = deadlinesPayload.items?.find(
        (item) => item.property_id === TEST_PROPERTY_ID
      )
      expect(seededDeadline).toMatchObject({
        property_id: TEST_PROPERTY_ID,
        property_name: originalProperty.name,
        county: 'Harris',
        state: 'TX',
        effective_deadline: `${deadlinesPayload.year}-05-15`,
        is_configured: true,
      })

      await expect(
        page.locator('[data-testid="desktop-table-view"]')
      ).toBeVisible({
        timeout: 10000,
      })
      await expect(
        page.getByRole('heading', { name: 'Tax Protest' })
      ).toBeVisible()
      const seededPropertyRow = page
        .locator('tr')
        .filter({ has: page.getByText(originalProperty.name) })
      await expect(seededPropertyRow).toContainText('Harris')
      await expect(seededPropertyRow).toContainText('TX')
      await expect(seededPropertyRow).toContainText(
        `${deadlinesPayload.year}-05-15`
      )
      await expect(
        page.locator(`[data-testid="configure-property-${TEST_PROPERTY_ID}"]`)
      ).toHaveAttribute(
        'href',
        `/properties/${TEST_PROPERTY_ID}/edit#tax-protest`
      )

      await page.goto(
        `/properties/${TEST_PROPERTY_ID}/reconciliations?year=2024`
      )
      await expect(page.getByText(/finalized/i).first()).toBeVisible({
        timeout: 15000,
      })
      await expect(page.getByText(/test tenant/i).first()).toBeVisible({
        timeout: 15000,
      })

      await page.getByRole('button', { name: /more/i }).click()
      await page.locator('[data-testid="tax-protest-button"]').click()
      await expect(
        page.locator('[data-testid="tax-protest-panel"]')
      ).toBeVisible({
        timeout: 10000,
      })

      const taxYearInput = page.locator('[data-testid="tax-year-input"]')
      await taxYearInput.clear()
      await taxYearInput.fill('2024')
      await page.locator('[data-testid="county-override-input"]').fill('Harris')
      await page.locator('[data-testid="state-override-input"]').fill('TX')

      const generateResponsePromise = page.waitForResponse(
        (response) =>
          isExpectedWorkerResponse(response.url()) &&
          response.url().includes('/api/v1/tax-protest/generate') &&
          response.request().method() === 'POST',
        { timeout: 30000 }
      )
      const downloadPromise = page.waitForEvent('download', {
        timeout: 30000,
      })
      await page.locator('[data-testid="generate-button"]').click()

      const generateResponse = await generateResponsePromise
      const download = await downloadPromise
      expect(generateResponse.status()).toBe(200)
      expect(generateResponse.headers()['content-type']).toContain(
        'application/zip'
      )
      expect(generateResponse.headers()['content-disposition']).toContain(
        'tax-protest-Test Plaza Shopping Center-2024.zip'
      )
      expect(download.suggestedFilename()).toBe(
        'tax-protest-Test Plaza Shopping Center-2024.zip'
      )
      const downloadPath = testInfo.outputPath('tax-protest-package.zip')
      await download.saveAs(downloadPath)
      const downloadedFile = await stat(downloadPath)
      expect(downloadedFile.size).toBeGreaterThan(1000)
      await expect
        .poll(async () => listZipEntries(await readFile(downloadPath)).sort())
        .toEqual([
          '01_Expense_Summary.pdf',
          '02_GL_by_Category.csv',
          '03_Year_Over_Year_Comparison.pdf',
          '04_County_Cover_Sheet.pdf',
        ])

      await expect(
        page.getByText('Tax protest package downloaded')
      ).toBeVisible({
        timeout: 10000,
      })
      await expect(
        page.locator('[data-testid="tax-protest-panel"]')
      ).toBeHidden({
        timeout: 10000,
      })
    } finally {
      await restoreSeedProperty(originalProperty)
      await restoreSubscription(organizationId, originalSubscription)
    }
  })
})
