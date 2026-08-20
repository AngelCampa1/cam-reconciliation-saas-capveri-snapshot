import { chromium } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

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
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-ingestion-browser-${runId}`
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
    expected_mutating_requests: [],
    unexpected_mutating_requests: [],
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
    report.browser.unexpected_mutating_requests.length === 0 &&
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
  const propertyName = `[PROD-TEST] Browser Ingestion Tower ${suffix}`
  const fileName = `browser-yardi-gl-prod-stress-${suffix}.csv`
  const csv = yardiGlCsv()
  const created = { batchId: null, propertyId: null, propertyName, fileName }
  report.generated = { propertyName, fileName }

  try {
    const property = await createProperty(propertyName)
    created.propertyId = property.id
    report.generated.propertyId = property.id

    await runBrowserUpload({ propertyName, fileName, csv, created })
    await validateImportedBatch(created)
  } finally {
    await cleanup(created)
  }
}

async function createProperty(propertyName) {
  return expectJson('/api/v1/properties', {
    method: 'POST',
    status: 201,
    body: {
      name: propertyName,
      address_line1: '240 Browser Ingestion Way',
      city: 'Austin',
      state: 'TX',
      postal_code: '78702',
      total_rentable_sqft: '25000.00',
      total_usable_sqft: '22000.00',
      common_area_sqft: '3000.00',
      target_occupancy: '0.95',
      boma_standard_version: '2024',
      fiscal_year_start_month: 1,
    },
  })
}

async function runBrowserUpload({ propertyName, fileName, csv, created }) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'ingestion-browser')
    try {
      const response = await page.goto(`${appUrl}/ingestion`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      })
      await expectVisible(page, 'Upload General Ledger')
      await expectVisible(page, 'Select Property')
      await page.screenshot({
        path: resolve(outputDir, 'ingestion-upload-empty.png'),
        fullPage: true,
      })
      report.browser.screenshots.push('ingestion-upload-empty.png')

      await page.locator('#property-select').click()
      await page.getByRole('option', { name: propertyName }).click()

      const uploadResponsePromise = page.waitForResponse(
        (res) =>
          res.url().includes('/api/v1/ingestion/upload') &&
          res.request().method() === 'POST',
        { timeout: 60_000 }
      )
      await page.setInputFiles('[data-testid="file-input"]', {
        name: fileName,
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
      })
      const uploadResponse = await uploadResponsePromise
      const uploadJson = await uploadResponse.json()
      created.batchId = uploadJson.batch_id
      report.generated.batchId = uploadJson.batch_id

      check(
        'browser gl upload response detects Yardi rows',
        {
          status: uploadResponse.status(),
          source_system: uploadJson.source_system,
          row_count: uploadJson.row_count,
          error_count: uploadJson.error_count,
          detected_columns: uploadJson.detected_columns,
        },
        {
          status: 200,
          source_system: 'yardi',
          row_count: 4,
          error_count: 0,
          detected_columns: [
            'Account',
            'Account Description',
            'Date',
            'Amount',
            'Vendor',
            'Description',
          ],
        }
      )

      await expectVisible(page, 'Yardi Voyager detected')
      await page.getByRole('button', { name: 'Continue' }).click()
      await expectVisible(page, '4 rows imported successfully')
      await expectVisible(page, 'GL Entry Preview')
      await expectVisible(page, '4 entries')
      await expectVisible(page, 'Account')
      await expectVisible(page, 'Debit')
      await expectVisible(page, 'Balance')
      await page.screenshot({
        path: resolve(outputDir, 'ingestion-preview.png'),
        fullPage: true,
      })
      report.browser.screenshots.push('ingestion-preview.png')

      check(
        'browser ingestion flow renders persisted GL preview',
        {
          initial_status: response?.status() ?? null,
          final_url: page.url(),
          saw_upload_request: report.browser.requests.some(
            (request) =>
              request.method === 'POST' &&
              request.url.includes('/api/v1/ingestion/upload')
          ),
          saw_detail_request: report.browser.requests.some(
            (request) =>
              request.method === 'GET' &&
              request.url.includes(
                `/api/v1/ingestion/batches/${created.batchId}`
              )
          ),
        },
        {
          initial_status: 200,
          final_url: `${appUrl}/ingestion`,
          saw_upload_request: true,
          saw_detail_request: true,
        }
      )
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function validateImportedBatch(created) {
  const detail = await expectJson(
    `/api/v1/ingestion/batches/${created.batchId}`,
    { status: 200 }
  )
  check(
    'browser batch detail exposes persisted preview entries',
    {
      file_name: detail.file_name,
      source_system: detail.source_system,
      status: detail.status,
      row_count: detail.row_count,
      error_count: detail.error_count,
      preview_entries: detail.preview_entries
        .map((entry) => ({
          account_code: entry.account_code,
          account_description: entry.account_description,
          transaction_date: dateOnly(entry.transaction_date),
          debit: entry.debit,
          credit: entry.credit,
          balance: entry.balance,
        }))
        .sort((a, b) => a.account_code.localeCompare(b.account_code)),
    },
    {
      file_name: created.fileName,
      source_system: 'yardi',
      status: 'completed',
      row_count: 4,
      error_count: 0,
      preview_entries: [
        {
          account_code: '6100',
          account_description: 'Janitorial',
          transaction_date: '2026-01-15',
          debit: '1250.50',
          credit: null,
          balance: '1250.50',
        },
        {
          account_code: '6200',
          account_description: 'Security',
          transaction_date: '2026-02-20',
          debit: '875.25',
          credit: null,
          balance: '875.25',
        },
        {
          account_code: '6300',
          account_description: 'Repairs',
          transaction_date: '2026-03-05',
          debit: null,
          credit: '125.75',
          balance: '-125.75',
        },
        {
          account_code: '6400',
          account_description: 'Utilities',
          transaction_date: '2026-12-31',
          debit: '2345.67',
          credit: null,
          balance: '2345.67',
        },
      ],
    }
  )

  const dateRange = await expectJson(
    `/api/v1/ingestion/gl-date-range/${created.propertyId}`,
    { status: 200 }
  )
  check('browser gl date range spans uploaded rows', dateRange, {
    min_date: '2026-01-15',
    max_date: '2026-12-31',
    year: 2026,
  })

  const batches = await expectJson('/api/v1/ingestion/batches', {
    status: 200,
  })
  check(
    'browser batch list includes generated upload',
    {
      found: batches.batches.some((batch) => batch.id === created.batchId),
    },
    { found: true }
  )
}

async function cleanup(created) {
  const failures = []

  if (created.propertyId && !created.batchId) {
    await attemptCleanup(failures, 'capture generated ingestion batch', () =>
      captureGeneratedBatch(created)
    )
  }

  if (created.batchId) {
    await attemptCleanup(failures, 'delete browser ingestion batch', () =>
      deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`)
    )
    await attemptCleanup(
      failures,
      'verify browser ingestion batch deleted',
      () => expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, 404)
    )
  }

  if (created.propertyId) {
    await attemptCleanup(failures, 'verify browser gl entries deleted', () =>
      expectStatus(`/api/v1/ingestion/gl-date-range/${created.propertyId}`, 404)
    )
    await attemptCleanup(failures, 'delete browser ingestion property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify browser ingestion property deleted',
      () => expectStatus(`/api/v1/properties/${created.propertyId}`, 404)
    )
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function captureGeneratedBatch(created) {
  const batches = await expectJson('/api/v1/ingestion/batches', {
    status: 200,
  })
  const batch = batches.batches.find(
    (candidate) => candidate.file_name === created.fileName
  )
  if (!batch) {
    throw new Error(`Could not find generated batch ${created.fileName}`)
  }
  created.batchId = batch.id
  report.generated.batchId = batch.id
  report.cleanup.push({
    path: '/api/v1/ingestion/batches',
    status: 200,
    ok: true,
    body_preview: JSON.stringify({
      captured_batch_id: batch.id,
      file_name: batch.file_name,
    }),
  })
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    if (isCapVeriOrigin(url)) {
      report.browser.requests.push({ method, url })
    }
    if (isCapVeriOrigin(url) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const record = { method, url }
      if (isExpectedBrowserMutation(method, url)) {
        report.browser.expected_mutating_requests.push(record)
      } else {
        report.browser.unexpected_mutating_requests.push(record)
      }
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

async function expectStatus(path, status) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const ok = response.status === status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `GET ${path} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`
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
  const locator = page.getByText(text, { exact: false }).first()
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
}

function yardiGlCsv() {
  return [
    'Yardi Voyager GL Detail',
    'Generated by CapVeri production E2E stress harness',
    'Account,Account Description,Date,Amount,Vendor,Description',
    '6100,Janitorial,01/15/2026,"1,250.50",CleanCo,Monthly janitorial',
    '6200,Security,02/20/2026,875.25,SecureCo,Front desk security',
    '6300,Repairs,03/05/2026,(125.75),HVACCo,Credit memo reversal',
    '6400,Utilities,12/31/2026,2345.67,PowerCo,Year end true-up',
  ].join('\n')
}

function isExpectedBrowserMutation(method, url) {
  return method === 'POST' && url.includes('/api/v1/ingestion/upload')
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

function sameOrigin(url, target) {
  try {
    return new URL(url).origin === new URL(target).origin
  } catch {
    return false
  }
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

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function dateOnly(value) {
  return String(value).slice(0, 10)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
