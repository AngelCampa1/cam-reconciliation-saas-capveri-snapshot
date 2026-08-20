import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import PDFDocument from 'pdfkit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')
const execFileAsync = promisify(execFile)

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
  ...process.env,
}

const required = [
  'E2E_PROD_EMAIL',
  'E2E_PROD_PASSWORD',
  'E2E_PROD_API_URL',
  'E2E_PROD_APP_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const appUrl = trimSlash(env.E2E_PROD_APP_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const documentsR2Bucket =
  env.E2E_PROD_DOCUMENTS_R2_BUCKET?.trim() || 'capveri-documents'
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-extraction-verification-browser-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl, app_url: appUrl },
  generated: {},
  auth: {},
  checks: [],
  browser: {
    browser_errors: [],
    failed_responses: [],
    mutating_requests: [],
    unexpected_mutating_requests: [],
    ignored_mutating_requests: [],
    screenshots: [],
  },
  cleanup: [],
}

let token
let session
try {
  await assertBackendSupportsTerminalDocumentDelete()
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }
  await runScenario()
  report.ok =
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.unexpected_mutating_requests.length === 0 &&
    browserMutationsMatchExpected()
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function assertBackendSupportsTerminalDocumentDelete() {
  const response = await fetch(`${apiUrl}/health`, {
    headers: { accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(`GET /health returned ${response.status}: ${text}`)
  }
  const body = text ? JSON.parse(text) : null
  const actual = {
    status: body?.status ?? null,
    environment: body?.environment ?? null,
    terminal_document_delete:
      body?.capabilities?.terminal_document_delete ?? null,
  }
  const expected = {
    status: 'healthy',
    environment: 'production',
    terminal_document_delete: true,
  }
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({
    label: 'backend deployed terminal document delete capability',
    ok,
    actual,
    expected,
  })
  if (!ok) {
    throw new Error(
      `Production backend does not advertise terminal document delete capability: ${text.slice(0, 500)}`
    )
  }
}

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Verification Tower ${suffix}`
  const unitNumber = `Verify-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Verification Tenant ${suffix}`
  const documentName = `prod-test-verification-${suffix}.pdf`
  const editedBaseYearAmount = '43210.00'
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    documentId: null,
    documentStorageKey: null,
    documentName,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    documentName,
    editedBaseYearAmount,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '1200 Prod Verification Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78711',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '1000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '2000.00',
        usable_sqft: '1800.00',
        floor: 12,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitId = unit.id
    report.generated.unitId = unit.id

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2026-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: recoveryProfile('12500.00'),
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const uploadedDocument = await uploadDocument({
      propertyId: property.id,
      leaseId: lease.id,
      fileName: documentName,
      pdfBytes: await leasePdfBytes({
        propertyName,
        unitNumber,
        tenantName,
      }),
    })
    created.documentId = uploadedDocument.document_id
    report.generated.documentId = uploadedDocument.document_id
    check(
      'document upload creates pending verification fixture',
      {
        status: uploadedDocument.status,
        has_document_id:
          typeof uploadedDocument.document_id === 'string' &&
          uploadedDocument.document_id.length > 0,
      },
      { status: 'pending', has_document_id: true }
    )

    const initialDetail = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    created.documentStorageKey = initialDetail.storage_key
    report.generated.documentStorageKey = initialDetail.storage_key
    check(
      'api confirms generated extraction starts pending',
      {
        id: initialDetail.id,
        status: initialDetail.status,
        property_id: initialDetail.property_id,
        lease_id: initialDetail.lease_id,
        has_document_url:
          typeof initialDetail.document_url === 'string' &&
          initialDetail.document_url.includes('/api/v1/document-files/'),
      },
      {
        id: uploadedDocument.document_id,
        status: 'pending',
        property_id: property.id,
        lease_id: lease.id,
        has_document_url: true,
      }
    )

    const processResponse = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}/process`,
      { method: 'POST', status: 202, body: {} }
    )
    report.generated.extractionJobId = processResponse.job_id
    check(
      'extraction process route queued generated document',
      {
        success: processResponse.success,
        document_id: processResponse.document_id,
        status: processResponse.status,
        has_job_id:
          typeof processResponse.job_id === 'string' &&
          processResponse.job_id.length > 0,
      },
      {
        success: true,
        document_id: uploadedDocument.document_id,
        status: 'processing',
        has_job_id: true,
      }
    )

    const readyDetail = await waitForReadyForReview(
      uploadedDocument.document_id
    )
    check(
      'extraction reaches ready_for_review with profile',
      {
        id: readyDetail.id,
        status: readyDetail.status,
        has_profile: Boolean(readyDetail.extraction_result?.profile),
        has_document_url:
          typeof readyDetail.document_url === 'string' &&
          readyDetail.document_url.includes('/api/v1/document-files/'),
      },
      {
        id: uploadedDocument.document_id,
        status: 'ready_for_review',
        has_profile: true,
        has_document_url: true,
      }
    )

    await runBrowserScenario({
      documentId: uploadedDocument.document_id,
      documentName,
      editedBaseYearAmount,
    })

    const rejectedDetail = await expectJson(
      `/api/v1/extractions/${uploadedDocument.document_id}`,
      { status: 200 }
    )
    check(
      'browser rejection persisted final document state',
      {
        id: rejectedDetail.id,
        status: rejectedDetail.status,
        draft_base_year_amount:
          rejectedDetail.extraction_result?.draft_profile?.base_year_amount ??
          null,
      },
      {
        id: uploadedDocument.document_id,
        status: 'rejected',
        draft_base_year_amount: editedBaseYearAmount,
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function runBrowserScenario({
  documentId,
  documentName,
  editedBaseYearAmount,
}) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)
    const page = await newTrackedPage(context, 'extraction-verification')
    try {
      await page.goto(`${appUrl}/verify/${documentId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      })
      await page.getByRole('heading', { name: documentName }).waitFor({
        state: 'visible',
        timeout: 45_000,
      })
      await page.getByTestId('edit-interface').waitFor({
        state: 'visible',
        timeout: 30_000,
      })
      await page.getByTestId('pdf-viewer').waitFor({
        state: 'visible',
        timeout: 30_000,
      })
      await page.screenshot({
        path: resolve(outputDir, 'verification-ready.png'),
      })
      report.browser.screenshots.push('verification-ready.png')

      const draftResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/extractions/${documentId}/draft`) &&
          response.request().method() === 'PUT',
        { timeout: 20_000 }
      )
      await page.getByTestId('input-base_year_amount').fill('')
      await page
        .getByTestId('input-base_year_amount')
        .fill(editedBaseYearAmount)
      const draftResponse = await draftResponsePromise
      if (draftResponse.status() !== 200) {
        throw new Error(
          `Draft save returned ${draftResponse.status()}: ${(await draftResponse.text()).slice(0, 500)}`
        )
      }
      await page.getByTestId('draft-saved-indicator').waitFor({
        state: 'visible',
        timeout: 20_000,
      })

      await page.getByTestId('reject-button').click()
      await page.getByTestId('reject-dialog').waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await page.getByTestId('reason-option-incorrect_extraction').click()
      await page
        .getByTestId('rejection-notes')
        .fill('Production E2E verification harness rejects generated fixture.')
      const rejectResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/extractions/${documentId}/reject`) &&
          response.request().method() === 'PUT',
        { timeout: 20_000 }
      )
      await page.getByTestId('confirm-button').click()
      const rejectResponse = await rejectResponsePromise
      if (rejectResponse.status() !== 200) {
        throw new Error(
          `Reject returned ${rejectResponse.status()}: ${(await rejectResponse.text()).slice(0, 500)}`
        )
      }
      await page.waitForURL('**/extractions', { timeout: 20_000 })
      check(
        'browser verification page saved draft and rejected extraction',
        {
          final_url: page.url(),
          draft_status: draftResponse.status(),
          reject_status: rejectResponse.status(),
        },
        {
          final_url: `${appUrl}/extractions`,
          draft_status: 200,
          reject_status: 200,
        }
      )
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function waitForReadyForReview(documentId) {
  const started = Date.now()
  const timeoutMs = 8 * 60 * 1000
  let lastDetail = null
  while (Date.now() - started < timeoutMs) {
    lastDetail = await expectJson(`/api/v1/extractions/${documentId}`, {
      status: 200,
    })
    report.generated.lastExtractionStatus = lastDetail.status
    if (
      lastDetail.status === 'ready_for_review' &&
      lastDetail.extraction_result?.profile
    ) {
      return lastDetail
    }
    if (['failed', 'rejected', 'verified'].includes(lastDetail.status)) {
      throw new Error(
        `Extraction reached unexpected terminal status ${lastDetail.status}: ${lastDetail.error_message ?? ''}`
      )
    }
    await sleep(15_000)
  }
  throw new Error(
    `Timed out waiting for ready_for_review; last status ${lastDetail?.status ?? 'unknown'}`
  )
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    if (!isCapVeriOrigin(url) || ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return
    }
    if (isIgnoredBrowserMutation(url)) {
      report.browser.ignored_mutating_requests.push({
        method,
        url: redactSensitiveUrl(url),
      })
      return
    }
    const item = { method, url: redactSensitiveUrl(url) }
    report.browser.mutating_requests.push(item)
    if (!isExpectedBrowserMutation(method, url)) {
      report.browser.unexpected_mutating_requests.push(item)
    }
  })
  context.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (status >= 400 && isRelevantFailure(url)) {
      report.browser.failed_responses.push({
        status,
        url: redactSensitiveUrl(url),
      })
    }
  })
}

function browserMutationsMatchExpected() {
  const requests = report.browser.mutating_requests
  return (
    requests.length === 2 &&
    requests.some(
      (request) =>
        request.method === 'PUT' &&
        request.url.includes('/api/v1/extractions/') &&
        request.url.includes('/draft')
    ) &&
    requests.some(
      (request) =>
        request.method === 'PUT' &&
        request.url.includes('/api/v1/extractions/') &&
        request.url.includes('/reject')
    )
  )
}

function isExpectedBrowserMutation(method, url) {
  return (
    method === 'PUT' &&
    url.includes('/api/v1/extractions/') &&
    (url.includes('/draft') || url.includes('/reject'))
  )
}

async function newTrackedPage(context, label) {
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    report.browser.browser_errors.push({ label, message: errorMessage(error) })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browser.browser_errors.push({
        label,
        message: message.text().slice(0, 500),
      })
    }
  })
  return page
}

async function uploadDocument({ propertyId, leaseId, fileName, pdfBytes }) {
  const form = new FormData()
  form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName)
  const response = await fetch(
    `${apiUrl}/api/v1/documents/upload?property_id=${propertyId}&document_type=lease&lease_id=${leaseId}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      body: form,
    }
  )
  const text = await response.text()
  if (response.status !== 201) {
    throw new Error(
      `POST /api/v1/documents/upload returned ${response.status}, expected 201: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId) {
    if (created.documentId && !created.documentStorageKey) {
      await attemptCleanup(
        failures,
        'capture document R2 key for cleanup',
        () => captureDocumentStorageKey(created)
      )
    }
    await attemptCleanup(failures, 'delete property-scoped documents', () =>
      deleteMatchingDocuments(created)
    )
    await attemptCleanup(failures, 'verify documents deleted', () =>
      expectNoDocuments(created.propertyId)
    )
    if (created.documentStorageKey) {
      await attemptCleanup(failures, 'verify document R2 object deleted', () =>
        expectR2ObjectMissing(created.documentStorageKey)
      )
    }
  }
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
    await attemptCleanup(failures, 'verify lease deleted', () =>
      expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`
      )
    )
    await attemptCleanup(failures, 'verify unit deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function captureDocumentStorageKey(created) {
  const extraction = await expectJson(
    `/api/v1/extractions/${created.documentId}`,
    { status: 200 }
  )
  if (typeof extraction.storage_key !== 'string' || !extraction.storage_key) {
    throw new Error('Extraction detail did not include a storage key')
  }
  created.documentStorageKey = extraction.storage_key
  report.generated.documentStorageKey = extraction.storage_key
  report.cleanup.push({
    path: `/api/v1/extractions/${created.documentId}`,
    status: 200,
    ok: true,
    body_preview: JSON.stringify({ storage_key_present: true }),
  })
}

async function deleteMatchingDocuments(created) {
  const documents = await expectJson(
    `/api/v1/documents?property_id=${created.propertyId}&skip=0&limit=100`,
    { status: 200 }
  )
  const candidates = documents.filter(
    (item) =>
      item.id === created.documentId || item.filename === created.documentName
  )
  for (const document of candidates) {
    await deleteEmpty(`/api/v1/documents/${document.id}`)
    await expectStatus(`/api/v1/documents/${document.id}`, { status: 404 })
  }
}

async function expectNoDocuments(propertyId) {
  const documents = await expectJson(
    `/api/v1/documents?property_id=${propertyId}&skip=0&limit=100`,
    { status: 200 }
  )
  const ok = Array.isArray(documents) && documents.length === 0
  report.cleanup.push({
    path: `/api/v1/documents?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({ item_count: documents.length }),
  })
  if (!ok) {
    throw new Error(
      `Documents still present after delete: ${JSON.stringify(documents).slice(0, 500)}`
    )
  }
}

async function expectR2ObjectMissing(storageKey) {
  const objectPath = `${documentsR2Bucket}/${storageKey}`
  const result = await getR2Object(objectPath)
  if (result.missing) {
    report.cleanup.push({
      path: `r2://${objectPath}`,
      status: 404,
      ok: true,
      body_preview: 'object missing',
    })
    return
  }

  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: 200,
    ok: false,
    body_preview: `object still present (${result.byteLength} bytes)`,
  })
  await deleteR2Object(objectPath)
  throw new Error(
    `R2 object still existed after document delete: ${objectPath}`
  )
}

async function getR2Object(objectPath) {
  try {
    const { stdout } = await execFileAsync(
      npxBinary(),
      ['wrangler', 'r2', 'object', 'get', objectPath, '--remote', '--pipe'],
      {
        cwd: frontendRoot,
        encoding: null,
        maxBuffer: 1024 * 1024,
        shell: process.platform === 'win32',
        timeout: 60_000,
      }
    )
    return { missing: false, byteLength: stdout.byteLength }
  } catch (error) {
    const stderr = bufferToString(error.stderr)
    if (stderr.includes('The specified key does not exist')) {
      return { missing: true, byteLength: 0 }
    }
    throw new Error(
      `R2 get failed for ${objectPath}: ${stderr || errorMessage(error)}`
    )
  }
}

async function deleteR2Object(objectPath) {
  await execFileAsync(
    npxBinary(),
    ['wrangler', 'r2', 'object', 'delete', objectPath, '--remote', '--force'],
    {
      cwd: frontendRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      shell: process.platform === 'win32',
      timeout: 60_000,
    }
  )
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(`${label}: ${errorMessage(error)}`)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  const text = await response.text()
  const ok = response.status === 204 || response.status === 404
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text}`)
  }
}

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, { headers: authHeaders() })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `GET ${path} returned ${response.status}, expected ${options.status}: ${text}`
    )
  }
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...authHeaders(),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function signInWithPassword() {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        email: env.E2E_PROD_EMAIL,
        password: env.E2E_PROD_PASSWORD,
      }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  return json
}

async function injectSupabaseSession(context, authSession) {
  const storageKey = `sb-${supabaseRef}-auth-token`
  const storageValue = JSON.stringify({
    access_token: authSession.access_token,
    refresh_token: authSession.refresh_token,
    token_type: authSession.token_type ?? 'bearer',
    expires_at: authSession.expires_at,
    expires_in: authSession.expires_in,
    user: authSession.user,
  })
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: storageKey, value: storageValue }
  )
}

function recoveryProfile(baseYearAmount) {
  return {
    base_year: 2025,
    base_year_amount: baseYearAmount,
    gross_up_base_year: false,
    pro_rata_share: '0.2000',
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0.015',
    management_fee_percentage: '0.010',
    excluded_pools: [],
    base_year_adjustments: [],
  }
}

async function leasePdfBytes({ propertyName, unitNumber, tenantName }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 72 })
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve)
    doc.on('error', reject)
  })
  doc.fontSize(16).text('Commercial Lease Agreement')
  doc.moveDown()
  doc.fontSize(11).text(`Property: ${propertyName}`)
  doc.text(`Premises: Suite ${unitNumber}`)
  doc.text(`Tenant: ${tenantName}`)
  doc.text('Lease term: January 1, 2026 through December 31, 2031.')
  doc.text('Base year: calendar year 2025.')
  doc.text('Base year amount: $12,500.00.')
  doc.text('Tenant pro-rata share: 20.00%.')
  doc.text('Administrative fee: 1.50% of recoverable operating expenses.')
  doc.text('Management fee: 1.00% of recoverable operating expenses.')
  doc.text('Expense cap: no cap applies to operating expense recoveries.')
  doc.text('Gross-up base year: no gross-up applies.')
  doc.text('Excluded pools: none.')
  doc.end()
  await finished
  return Buffer.concat(chunks)
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
  }
}

function authHeaders() {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  }
}

function isCapVeriOrigin(url) {
  try {
    const origin = new URL(url).origin
    return (
      origin === new URL(appUrl).origin || origin === new URL(apiUrl).origin
    )
  } catch {
    return false
  }
}

function isRelevantFailure(url) {
  try {
    const parsed = new URL(url)
    return (
      parsed.origin === new URL(appUrl).origin ||
      parsed.origin === new URL(apiUrl).origin
    )
  } catch {
    return false
  }
}

function isIgnoredBrowserMutation(url) {
  try {
    const parsed = new URL(url)
    return (
      parsed.origin === new URL(appUrl).origin &&
      parsed.pathname === '/cdn-cgi/rum'
    )
  } catch {
    return false
  }
}

function redactSensitiveUrl(value) {
  try {
    const parsed = new URL(value)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|code|key|secret|password|session|signature/i.test(key)) {
        parsed.searchParams.set(key, '[redacted]')
      }
    }
    return parsed.toString()
  } catch {
    return value
  }
}

async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = {}
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index < 1) continue
      parsed[trimmed.slice(0, index)] = unquote(trimmed.slice(index + 1).trim())
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function stableJson(value) {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortDeep(nested)])
    )
  }
  return value
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function bufferToString(value) {
  if (!value) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
}

function npxBinary() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}
