/**
 * MRI Format Parity — same 3 audit findings as Yardi
 *
 * True E2E — zero mocks. Runs against live Supabase + Cloudflare Worker backend.
 *
 * MRI-T1/T2: Upload flow tests with MRI file (IngestionPage with real backend)
 * MRI-T3:    YoY comparison using the same seeded GL data as Yardi tests
 */
import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.join(__dirname, 'fixtures')

const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000001'
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/** Remove any real-upload batches (not the seeded baseline) so each upload test starts fresh */
async function cleanUploadBatches() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: batches } = await admin
    .from('import_batches')
    .select('id')
    .eq('property_id', TEST_PROPERTY_ID)
    // Preserve all `__seed_`-prefixed baseline batches (2023 + 2024 YoY dataset)
    .not('file_name', 'like', '__seed_%')
  if (batches && batches.length > 0) {
    const ids = batches.map((b: { id: string }) => b.id)
    await admin.from('gl_entries').delete().in('import_batch_id', ids)
    await admin.from('import_batches').delete().in('id', ids)
  }
}

// ── Upload flow tests ──────────────────────────────────────────────────────

test.describe("Patricia's Upload Flow — MRI", () => {
  test.beforeEach(async () => {
    await cleanUploadBatches()
  })

  test('MRI-T1: Patricia uploads MRI GL and sees source detected as MRI', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/ingestion')
    await page.waitForLoadState('networkidle')

    // Select the seeded test property
    const trigger = page.getByRole('combobox').first()
    const hasTrigger = await trigger.isVisible({ timeout: 5000 }).catch(() => false)
    if (hasTrigger) {
      await trigger.click()
      const option = page.getByRole('option', { name: 'Test Plaza Shopping Center' })
      const hasOption = await option.isVisible({ timeout: 3000 }).catch(() => false)
      if (hasOption) await option.click()
    }

    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeVisible({ timeout: 5000 })

    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'mri_gl_hou01_2024.csv'))

    // Real backend call — should show MRI Commercial detected
    await expect(page.getByText(/MRI Commercial/i)).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/Confidence:.*\d+%/i)).toBeVisible({ timeout: 5000 })
  })

  test('MRI-T2: rows imported successfully', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/ingestion')
    await page.waitForLoadState('networkidle')

    const trigger = page.getByRole('combobox').first()
    const hasTrigger = await trigger.isVisible({ timeout: 5000 }).catch(() => false)
    if (hasTrigger) {
      await trigger.click()
      const option = page.getByRole('option', { name: 'Test Plaza Shopping Center' })
      const hasOption = await option.isVisible({ timeout: 3000 }).catch(() => false)
      if (hasOption) await option.click()
    }

    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeVisible({ timeout: 5000 })

    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'mri_gl_hou01_2024.csv'))

    // Wait for source detection
    await expect(page.getByText(/MRI Commercial/i)).toBeVisible({ timeout: 20000 })

    // Click Continue to advance to success state
    await page.getByRole('button', { name: /Continue/i }).click()

    // Should show success with row count
    await expect(page.getByText(/rows imported successfully/i)).toBeVisible({ timeout: 10000 })
  })
})

// ── Year-over-Year analysis tests ──────────────────────────────────────────

test.describe("Patricia's YoY Analysis — MRI", () => {
  test.beforeEach(async () => {
    // Ensure only the seeded baseline batches are present — any upload from MRI-T1/T2
    // would corrupt the YoY aggregation if left in the DB
    await cleanUploadBatches()
  })

  test('MRI-T3: YoY comparison surfaces all 3 CAM errors from seeded GL data', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/analysis/year-over-year')
    await page.waitForLoadState('networkidle')

    const trigger = page.getByTestId('property-select-trigger')
    await expect(trigger).toBeVisible({ timeout: 5000 })
    await trigger.click()
    await page.getByRole('option', { name: 'Test Plaza Shopping Center' }).click()

    await page.locator('label[for="year-2023"]').click()
    await page.locator('label[for="year-2024"]').click()
    await page.getByRole('button', { name: 'Compare', exact: true }).click()

    // All 3 pools with their expected variances must be visible
    await expect(page.getByText('Taxes - Real Estate')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/\+\$30,003/)).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('R&M - HVAC Repairs')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/\+\$10,800/)).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('Controllable Expenses')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/\+\$12,9[0-9][0-9]/)).toBeVisible({ timeout: 10000 })
  })
})
