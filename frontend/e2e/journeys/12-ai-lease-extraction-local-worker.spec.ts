/**
 * Journey 12b: real local Worker lease extraction path
 *
 * Exercises browser upload, process, signed-PDF review, draft save, and
 * approval against the local Cloudflare Worker. The only shortcut is completing
 * the asynchronous queue job via local Supabase admin writes after the real
 * process endpoint queues it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const TEST_USER_EMAIL = 'e2e-test@capveri.com'
const TEST_USER_PASSWORD = 'TestPassword123!'
const TEST_PROPERTY_ID = '00000000-0000-0000-0000-000000000001'
const API_BASE_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8797'

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

type UploadResponse = {
  document_id: string
  status: string
}

type ProcessResponse = {
  job_id: string
}

type LeaseRow = {
  id: string
  recovery_profile: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseUploadResponse(value: unknown): UploadResponse {
  if (
    !isRecord(value) ||
    typeof value.document_id !== 'string' ||
    typeof value.status !== 'string'
  ) {
    throw new Error(`Unexpected upload response: ${JSON.stringify(value)}`)
  }

  return {
    document_id: value.document_id,
    status: value.status,
  }
}

function parseProcessResponse(value: unknown): ProcessResponse {
  if (!isRecord(value) || typeof value.job_id !== 'string') {
    throw new Error(`Unexpected process response: ${JSON.stringify(value)}`)
  }

  return { job_id: value.job_id }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function getSeedLease(): Promise<LeaseRow> {
  const { data, error } = await adminClient
    .from('leases')
    .select('id,recovery_profile')
    .eq('property_id', TEST_PROPERTY_ID)
    .eq('tenant_name', 'Test Tenant 101')
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to load seeded lease: ${error?.message ?? 'missing row'}`
    )
  }

  return data as LeaseRow
}

async function promoteDocumentToReadyForReview(
  documentId: string,
  jobId: string
) {
  const extractionResult = {
    profile: {
      base_year: 2024,
      base_year_amount: null,
      gross_up_base_year: true,
      pro_rata_share: '0.0625',
      cap_type: 'non_cumulative',
      cap_rate: '0.0500',
      admin_fee_percentage: '0.1500',
      management_fee_percentage: null,
      excluded_pools: [],
      accounting_basis: 'accrual',
    },
    confidence_scores: {
      base_year: 0.95,
      gross_up_base_year: 0.91,
      pro_rata_share: 0.82,
      cap_type: 0.88,
      cap_rate: 0.62,
      admin_fee_percentage: 0.9,
      accounting_basis: 0.93,
    },
    source_references: [
      {
        field: 'pro_rata_share',
        page: 1,
        text: 'Tenant shall pay 6.25% of operating expenses.',
        confidence: 0.82,
        boundingBox: null,
      },
      {
        field: 'cap_rate',
        page: 1,
        text: 'Annual increases are capped at five percent.',
        confidence: 0.62,
        boundingBox: null,
      },
    ],
  }

  const { error: documentError } = await adminClient
    .from('documents')
    .update({
      status: 'ready_for_review',
      extraction_result: extractionResult,
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', documentId)

  if (documentError) {
    throw new Error(`Failed to promote document: ${documentError.message}`)
  }

  const { error: jobError } = await adminClient
    .from('extraction_jobs')
    .update({
      status: 'completed',
      result_data: extractionResult,
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId)

  if (jobError) {
    throw new Error(`Failed to complete extraction job: ${jobError.message}`)
  }
}

async function getTestUserAccessToken(): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  })

  if (error || !data.session?.access_token) {
    throw new Error(
      `Failed to sign in test user: ${error?.message ?? 'missing token'}`
    )
  }

  return data.session.access_token
}

async function deleteViaWorker(documentId: string) {
  const token = await getTestUserAccessToken()

  await adminClient
    .from('documents')
    .update({ status: 'failed' })
    .eq('id', documentId)

  const response = await fetch(
    `${API_BASE_URL}/api/v1/documents/${documentId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Worker cleanup failed with ${response.status}: ${await response.text()}`
    )
  }
}

async function cleanupUploadedDocument(documentId: string | null) {
  if (!documentId) return

  await deleteViaWorker(documentId)
}

test.describe('Journey 12b - local Worker AI lease extraction', () => {
  test('uploads, processes, reviews, drafts, and approves a lease PDF through the real Worker', async ({
    authenticatedPage: page,
  }) => {
    let uploadedDocumentId: string | null = null
    const seedLease = await getSeedLease()
    const originalRecoveryProfile = seedLease.recovery_profile
    const uniqueFilename = `Browser_HITL_${Date.now()}.pdf`

    try {
      await page.goto('/leases/upload')

      await page.locator('#property-select').click()
      await page
        .getByRole('option', { name: /Test Plaza Shopping Center/i })
        .click()
      await page.locator('#lease-select').click()
      await page.getByRole('option', { name: /Test Tenant 101/i }).click()

      const pdfBuffer = readFileSync(
        path.join(process.cwd(), 'e2e', 'fixtures', 'sample-lease.pdf')
      )
      await page.locator('[data-testid="file-input"]').setInputFiles({
        name: uniqueFilename,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      })

      const uploadResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/documents/upload') &&
          response.request().method() === 'POST' &&
          response.status() === 201
      )
      await page.getByRole('button', { name: /^Upload 1 PDF$/ }).click()
      const uploadResponse = parseUploadResponse(
        await (await uploadResponsePromise).json()
      )
      uploadedDocumentId = uploadResponse.document_id
      expect(uploadResponse.status).toBe('pending')

      await expect(page).toHaveURL(/\/extractions/, { timeout: 15000 })
      const processButton = page.getByRole('button', {
        name: new RegExp(`^Process ${escapeRegex(uniqueFilename)}$`),
      })
      await expect(processButton).toBeVisible({ timeout: 15000 })

      const processResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/v1/extractions/${uploadedDocumentId}/process`) &&
          response.request().method() === 'POST' &&
          response.status() === 202
      )
      await processButton.click()
      const processResponse = parseProcessResponse(
        await (await processResponsePromise).json()
      )

      await promoteDocumentToReadyForReview(
        uploadedDocumentId,
        processResponse.job_id
      )

      const reviewButton = page.getByRole('button', {
        name: new RegExp(`^Review ${escapeRegex(uniqueFilename)}$`),
      })
      await expect(reviewButton)
        .toBeVisible({ timeout: 12000 })
        .catch(async () => {
          await page.reload({ waitUntil: 'networkidle' })
          await expect(reviewButton).toBeVisible({ timeout: 12000 })
        })

      const signedPdfResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/v1/document-files/${uploadedDocumentId}`) &&
          response.status() === 200
      )
      await reviewButton.click()
      const signedPdfResponse = await signedPdfResponsePromise
      expect(signedPdfResponse.headers()['content-type']).toContain(
        'application/pdf'
      )

      await expect(page).toHaveURL(new RegExp(`/verify/${uploadedDocumentId}`))
      await expect(page.getByText(uniqueFilename)).toBeVisible({
        timeout: 10000,
      })
      await expect(
        page.locator('[data-testid="pdf-viewer"]').first()
      ).toBeVisible({
        timeout: 15000,
      })
      await expect(
        page.locator('[data-testid="verification-summary"]')
      ).toBeVisible()
      await expect(page.locator('[data-testid="progress-text"]')).toHaveText(
        '0/7'
      )

      const proRataField = page.locator(
        '[data-testid="editable-field-pro_rata_share"]'
      )
      await expect(proRataField).toBeVisible()
      await expect(
        page.locator('[data-testid="input-pro_rata_share"]')
      ).toHaveValue('6.25')
      await expect(
        proRataField.locator('[data-testid="confidence-badge"]')
      ).toHaveText('82%')
      await proRataField.locator('[data-testid="confidence-badge"]').hover()
      await expect(
        page
          .locator('[data-testid="source-preview"]')
          .filter({
            hasText: 'Tenant shall pay 6.25% of operating expenses.',
          })
          .first()
      ).toBeVisible()
      await page.keyboard.press('Escape')

      const capRateField = page.locator(
        '[data-testid="editable-field-cap_rate"]'
      )
      await expect(capRateField).toBeVisible()
      await expect(page.locator('[data-testid="input-cap_rate"]')).toHaveValue(
        '5'
      )
      await expect(
        capRateField.locator('[data-testid="confidence-badge"]')
      ).toHaveText('62%')
      await expect(
        capRateField.locator('[data-testid="confidence-badge"]')
      ).toHaveAttribute('data-confidence-level', 'low')
      await capRateField
        .locator('[data-testid="confidence-badge"]')
        .hover({ force: true })
      await expect(
        page
          .locator('[data-testid="source-preview"]')
          .filter({
            hasText: 'Annual increases are capped at five percent.',
          })
          .first()
      ).toBeVisible()

      const lowConfidenceFilter = page.locator(
        '[data-testid="low-confidence-filter"]'
      )
      await expect(lowConfidenceFilter).toHaveText(/1 need review/)
      await lowConfidenceFilter.click()
      await expect(capRateField).toBeVisible()
      await expect(proRataField).toBeHidden()
      await lowConfidenceFilter.click()
      await expect(proRataField).toBeVisible()

      const draftResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/v1/extractions/${uploadedDocumentId}/draft`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: 10000 }
      )
      const proRataInput = page.locator('[data-testid="input-pro_rata_share"]')
      await proRataInput.clear()
      await proRataInput.fill('7.10')
      await draftResponsePromise

      const approveButton = page.locator('[data-testid="approve-button"]')
      await expect(approveButton).toBeEnabled({ timeout: 15000 })

      const approveResponsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/v1/extractions/${uploadedDocumentId}/approve`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200
      )
      await approveButton.click()
      await page.locator('[data-testid="confirm-button"]').last().click()
      await approveResponsePromise
      await expect(page).toHaveURL(/\/extractions/, { timeout: 15000 })

      const { data: verifiedDocument, error: documentError } = await adminClient
        .from('documents')
        .select('status,verified_at,edit_history')
        .eq('id', uploadedDocumentId)
        .single()
      expect(documentError).toBeNull()
      expect(verifiedDocument?.status).toBe('verified')
      expect(verifiedDocument?.verified_at).toBeTruthy()

      const { data: approvedLease, error: leaseError } = await adminClient
        .from('leases')
        .select('recovery_profile')
        .eq('id', seedLease.id)
        .single()
      expect(leaseError).toBeNull()
      expect(approvedLease?.recovery_profile).toMatchObject({
        pro_rata_share: '0.071',
      })
    } finally {
      await adminClient
        .from('leases')
        .update({ recovery_profile: originalRecoveryProfile })
        .eq('id', seedLease.id)
      await cleanupUploadedDocument(uploadedDocumentId)
    }
  })
})
