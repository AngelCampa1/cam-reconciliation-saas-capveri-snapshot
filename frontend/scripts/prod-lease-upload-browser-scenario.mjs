import { execFile } from 'node:child_process'
import { chromium } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

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
  `prod-lease-upload-browser-${runId}`
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
    requests: [],
    browser_errors: [],
    failed_responses: [],
    mutating_requests: [],
    screenshots: [],
  },
  cleanup: [],
}

let token
let session
try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }
  await runScenario()
  report.ok =
    report.checks.every((check) => check.ok) &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.mutating_requests.length === 1 &&
    report.browser.mutating_requests[0]?.method === 'POST' &&
    report.browser.mutating_requests[0]?.url.includes(
      '/api/v1/documents/upload'
    ) &&
    report.cleanup.every((item) => item.ok)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Browser Lease Upload Tower ${suffix}`
  const unitNumber = `LeaseUpload-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Browser Lease Upload Tenant ${suffix}`
  const documentName = `browser-lease-upload-prod-${suffix}.pdf`
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
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '924 Prod Lease Upload Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78710',
        total_rentable_sqft: '12000.00',
        total_usable_sqft: '10800.00',
        common_area_sqft: '1200.00',
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
        rentable_sqft: '2400.00',
        usable_sqft: '2160.00',
        floor: 9,
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
        recovery_profile: recoveryProfile(),
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const upload = await runBrowserUpload({
      propertyName,
      tenantName,
      documentName,
      propertyId: property.id,
      leaseId: lease.id,
    })
    created.documentId = upload.document_id
    report.generated.documentId = upload.document_id
    check(
      'browser upload returns pending document id',
      {
        status: upload.status,
        has_document_id:
          typeof upload.document_id === 'string' &&
          upload.document_id.length > 0,
      },
      {
        status: 'pending',
        has_document_id: true,
      }
    )

    const extraction = await expectJson(
      `/api/v1/extractions/${upload.document_id}`,
      {
        status: 200,
      }
    )
    created.documentStorageKey = extraction.storage_key
    report.generated.documentStorageKey = extraction.storage_key
    check(
      'pending extraction detail matches browser-uploaded lease document',
      {
        id: extraction.id,
        filename: extraction.filename,
        status: extraction.status,
        property_id: extraction.property_id,
        lease_id: extraction.lease_id,
        storage_bucket: extraction.storage_bucket,
        storage_key_matches_property:
          typeof extraction.storage_key === 'string' &&
          extraction.storage_key.includes(`/${property.id}/`),
        has_document_url:
          typeof extraction.document_url === 'string' &&
          extraction.document_url.includes('/api/v1/document-files/'),
      },
      {
        id: upload.document_id,
        filename: documentName,
        status: 'pending',
        property_id: property.id,
        lease_id: lease.id,
        storage_bucket: 'DOCUMENTS_BUCKET',
        storage_key_matches_property: true,
        has_document_url: true,
      }
    )

    await expectPropertyDocumentsContain({
      propertyId: property.id,
      documentId: upload.document_id,
      documentName,
    })
  } finally {
    await cleanup(created)
  }
}

async function runBrowserUpload({
  propertyName,
  tenantName,
  documentName,
  propertyId,
  leaseId,
}) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'lease-upload')
    try {
      const response = await page.goto(`${appUrl}/leases/upload`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      })
      await expectVisible(page, 'Upload Lease PDFs')
      await expectVisible(page, 'Upload Lease Documents')

      await page.locator('#property-select').click()
      const leasesResponsePromise = page.waitForResponse(
        (item) =>
          item.url().includes(`/api/v1/leases?property_id=${propertyId}`) &&
          item.request().method() === 'GET' &&
          item.status() === 200,
        { timeout: 15_000 }
      )
      await page.getByRole('option', { name: propertyName }).click()
      await leasesResponsePromise
      await page.locator('#lease-select').click()
      await page.getByRole('option', { name: tenantName }).click()

      await page.locator('[data-testid="file-input"]').setInputFiles({
        name: documentName,
        mimeType: 'application/pdf',
        buffer: Buffer.from(
          minimalPdfBytes({
            title: 'CapVeri browser lease upload fixture',
            tenantName,
          })
        ),
      })

      const uploadResponsePromise = page.waitForResponse(
        (item) =>
          item.url().includes('/api/v1/documents/upload') &&
          item.url().includes(`property_id=${propertyId}`) &&
          item.url().includes(`lease_id=${leaseId}`) &&
          item.request().method() === 'POST' &&
          item.status() === 201,
        { timeout: 30_000 }
      )
      await page.getByRole('button', { name: /^Upload 1 PDF$/ }).click()
      const uploadResponse = await uploadResponsePromise
      const uploadJson = await uploadResponse.json()

      await expectVisible(
        page,
        'Lease PDFs uploaded successfully! Redirecting to extractions...'
      )
      await page.waitForURL('**/extractions', { timeout: 15_000 })
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => {})
      await expectVisible(page, documentName)
      await expectVisible(page, 'Pending')
      await page.screenshot({
        path: resolve(outputDir, 'lease-upload-extractions-pending.png'),
      })
      report.browser.screenshots.push('lease-upload-extractions-pending.png')
      check(
        'browser lease upload route selects seeded records and redirects to pending inbox',
        {
          initial_status: response?.status() ?? null,
          final_url: page.url(),
          document_visible: await visibleText(page, documentName),
          pending_visible: await visibleText(page, 'Pending'),
          process_action_visible: await visibleText(page, 'Process'),
          saw_property_request: report.browser.requests.some((request) =>
            request.url.includes('/api/v1/properties?limit=100')
          ),
          saw_lease_request: report.browser.requests.some((request) =>
            request.url.includes(`/api/v1/leases?property_id=${propertyId}`)
          ),
          saw_upload_request: report.browser.requests.some(
            (request) =>
              request.method === 'POST' &&
              request.url.includes('/api/v1/documents/upload')
          ),
        },
        {
          initial_status: 200,
          final_url: `${appUrl}/extractions`,
          document_visible: true,
          pending_visible: true,
          process_action_visible: true,
          saw_property_request: true,
          saw_lease_request: true,
          saw_upload_request: true,
        }
      )
      return uploadJson
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    if (isCapVeriOrigin(url)) {
      report.browser.requests.push({ method, url })
    }
    if (isCapVeriOrigin(url) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      report.browser.mutating_requests.push({ method, url })
    }
  })
  context.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (status >= 400 && isRelevantFailure(url)) {
      report.browser.failed_responses.push({ status, url })
    }
  })
}

async function newTrackedPage(context, label) {
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browser.browser_errors.push({
        label,
        type: 'console',
        text: message.text().slice(0, 500),
      })
    }
  })
  page.on('pageerror', (error) => {
    report.browser.browser_errors.push({
      label,
      type: 'pageerror',
      text: error.message.slice(0, 500),
    })
  })
  return page
}

async function expectPropertyDocumentsContain({
  propertyId,
  documentId,
  documentName,
}) {
  const documents = await expectJson(
    `/api/v1/documents?property_id=${propertyId}&skip=0&limit=100`,
    { status: 200 }
  )
  const match = documents.find((item) => item.id === documentId)
  check(
    'property document list includes browser-uploaded lease document',
    {
      found: Boolean(match),
      filename: match?.filename ?? null,
      document_type: match?.document_type ?? null,
    },
    {
      found: true,
      filename: documentName,
      document_type: 'lease',
    }
  )
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
    }
  )
  report.cleanup.push({
    path: `r2://${objectPath}`,
    status: 204,
    ok: true,
    body_preview: 'deleted directly after product-route cleanup miss',
  })
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({
      label,
      ok: false,
      error: errorMessage(error),
    })
  }
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
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

async function expectStatus(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
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
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
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

async function expectVisible(page, text) {
  const locator = page.getByText(text, { exact: true }).first()
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function visibleText(page, text) {
  const locator = page.getByText(text, { exact: true }).first()
  if ((await locator.count()) === 0) return false
  try {
    await locator.waitFor({ state: 'visible', timeout: 2500 })
    return true
  } catch {
    return false
  }
}

function recoveryProfile() {
  return {
    base_year: 2025,
    base_year_amount: '6500.00',
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

function minimalPdfBytes({ title, tenantName }) {
  const body = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
    `4 0 obj << /Length 92 >> stream\nBT /F1 12 Tf 72 720 Td (${title}) Tj 0 -20 Td (${tenantName}) Tj ET\nendstream endobj`,
    'xref',
    '0 5',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000204 00000 n ',
    'trailer << /Size 5 /Root 1 0 R >>',
    'startxref',
    '347',
    '%%EOF',
  ].join('\n')
  return new TextEncoder().encode(body)
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

function isRelevantFailure(url) {
  if (url.includes('posthog.com')) return false
  if (url.includes('sentry.io')) return false
  if (url.includes('cdn.')) return false
  return isCapVeriOrigin(url) || url.includes('supabase.co')
}

function isCapVeriOrigin(url) {
  if (isCloudflareRum(url)) return false
  return sameOrigin(url, appUrl) || sameOrigin(url, apiUrl)
}

function isCloudflareRum(url) {
  try {
    return new URL(url).pathname.startsWith('/cdn-cgi/rum')
  } catch {
    return false
  }
}

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin
  } catch {
    return false
  }
}

function npxBinary() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

function bufferToString(value) {
  if (!value) return ''
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  return String(value)
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
