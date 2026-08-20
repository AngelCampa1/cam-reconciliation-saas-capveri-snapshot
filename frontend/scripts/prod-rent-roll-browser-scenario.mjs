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
  `prod-rent-roll-browser-${runId}`
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
  const propertyName = `[PROD-TEST] Browser Rent Roll Tower ${suffix}`
  const fileName = `browser-rent-roll-prod-stress-${suffix}.csv`
  const csv = rentRollCsv(propertyName)
  const created = { propertyId: null, leaseIds: [], unitIds: [] }
  report.generated = { propertyName, fileName }

  try {
    await runBrowserImport({ propertyName, fileName, csv, created })
    await validateImportedRecords(created, propertyName)
  } finally {
    await cleanup(created)
  }
}

async function runBrowserImport({ propertyName, fileName, csv, created }) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'rent-roll-browser')
    try {
      const response = await page.goto(`${appUrl}/rent-roll/upload`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      })
      await expectVisible(page, 'Upload Rent Roll')
      await expectVisible(page, 'Upload a tenant list')
      await page.screenshot({
        path: resolve(outputDir, 'rent-roll-upload-empty.png'),
      })
      report.browser.screenshots.push('rent-roll-upload-empty.png')

      await page.setInputFiles('[data-testid="file-input"]', {
        name: fileName,
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
      })
      await expectVisible(page, 'Parsed successfully')
      await expectVisible(page, propertyName)
      await expectVisible(page, 'Yardi Voyager')
      await expectVisible(page, 'Duplicate unit number')
      await expectVisible(page, 'Missing or invalid rentable_sqft')
      await expectVisible(page, 'Total Units')
      await expectVisible(page, 'Occupied Units')
      await expectVisible(page, '[PROD-TEST] Alpha LLC')
      await expectVisible(page, '[PROD-TEST] Beta LLC')
      await page.screenshot({
        path: resolve(outputDir, 'rent-roll-preview.png'),
        fullPage: true,
      })
      report.browser.screenshots.push('rent-roll-preview.png')

      const importResponsePromise = page.waitForResponse(
        (res) =>
          res.url().includes('/api/v1/rent-roll/import') &&
          res.request().method() === 'POST',
        { timeout: 60_000 }
      )
      await page.getByRole('button', { name: 'Import Property' }).click()
      const importResponse = await importResponsePromise
      const importJson = await importResponse.json()
      created.propertyId = importJson.property_id
      report.generated.propertyId = importJson.property_id
      check(
        'browser rent roll import response creates expected property graph',
        {
          status: importResponse.status(),
          success: importJson.success,
          property_id_present:
            typeof importJson.property_id === 'string' &&
            importJson.property_id.length > 0,
          property_name: importJson.property_name,
          units_created: importJson.units_created,
          leases_created: importJson.leases_created,
          warnings_include_duplicate: importJson.warnings.some((warning) =>
            warning.includes('Duplicate unit number')
          ),
          warnings_include_invalid_sqft: importJson.warnings.some((warning) =>
            warning.includes('Missing or invalid rentable_sqft')
          ),
        },
        {
          status: 201,
          success: true,
          property_id_present: true,
          property_name: propertyName,
          units_created: 3,
          leases_created: 2,
          warnings_include_duplicate: true,
          warnings_include_invalid_sqft: true,
        }
      )

      await page.waitForURL(`${appUrl}/properties/${created.propertyId}`, {
        timeout: 60_000,
      })
      await expectVisible(page, propertyName)
      await page.screenshot({
        path: resolve(outputDir, 'rent-roll-imported-property.png'),
        fullPage: true,
      })
      report.browser.screenshots.push('rent-roll-imported-property.png')

      check(
        'browser rent roll upload flow reached generated property detail',
        {
          initial_status: response?.status() ?? null,
          final_url: page.url(),
          saw_preview_request: report.browser.requests.some(
            (request) =>
              request.method === 'POST' &&
              request.url.includes('/api/v1/rent-roll/preview')
          ),
          saw_import_request: report.browser.requests.some(
            (request) =>
              request.method === 'POST' &&
              request.url.includes('/api/v1/rent-roll/import')
          ),
        },
        {
          initial_status: 200,
          final_url: `${appUrl}/properties/${created.propertyId}`,
          saw_preview_request: true,
          saw_import_request: true,
        }
      )
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function validateImportedRecords(created, propertyName) {
  const property = await expectJson(
    `/api/v1/properties/${created.propertyId}`,
    {
      status: 200,
    }
  )
  check(
    'browser-imported property totals are deterministic decimal math',
    pick(property, [
      'name',
      'address_line1',
      'city',
      'state',
      'postal_code',
      'total_rentable_sqft',
      'total_usable_sqft',
      'common_area_sqft',
      'target_occupancy',
    ]),
    {
      name: propertyName,
      address_line1: '600 Browser Fixture Plaza',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      total_rentable_sqft: '3650.50',
      total_usable_sqft: '3310.25',
      common_area_sqft: '340.25',
      target_occupancy: '0.9500',
    }
  )

  const units = await expectJson(
    `/api/v1/properties/${created.propertyId}/units?skip=0&limit=20`,
    { status: 200 }
  )
  created.unitIds = units.data.map((unit) => unit.id)
  report.generated.unitIds = created.unitIds
  check(
    'browser-imported unit list contains occupied and vacant units',
    units.data
      .map((unit) =>
        pick(unit, [
          'unit_number',
          'rentable_sqft',
          'usable_sqft',
          'floor',
          'status',
        ])
      )
      .sort((a, b) => a.unit_number.localeCompare(b.unit_number)),
    [
      {
        unit_number: '100',
        rentable_sqft: '1250.50',
        usable_sqft: '1100.25',
        floor: 1,
        status: 'occupied',
      },
      {
        unit_number: '200',
        rentable_sqft: '900.00',
        usable_sqft: '810.00',
        floor: 2,
        status: 'vacant',
      },
      {
        unit_number: '300',
        rentable_sqft: '1500.00',
        usable_sqft: '1400.00',
        floor: 3,
        status: 'occupied',
      },
    ]
  )

  const leases = await expectJson(
    `/api/v1/leases?property_id=${created.propertyId}&skip=0&limit=20`,
    { status: 200 }
  )
  created.leaseIds = leases.data.map((lease) => lease.id)
  report.generated.leaseIds = created.leaseIds
  check(
    'browser-imported lease list contains occupied tenants only',
    leases.data
      .map((lease) => ({
        tenant_name: lease.tenant_name,
        start_date: String(lease.start_date).slice(0, 10),
        end_date: String(lease.end_date).slice(0, 10),
        status: lease.status,
        recovery_profile: lease.recovery_profile,
      }))
      .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
    [
      {
        tenant_name: `[PROD-TEST] Alpha LLC ${propertyName.slice(-8)}`,
        start_date: '2026-01-01',
        end_date: '2030-12-31',
        status: 'active',
        recovery_profile: expectedProfile('0.1850'),
      },
      {
        tenant_name: `[PROD-TEST] Beta LLC ${propertyName.slice(-8)}`,
        start_date: '2026-02-15',
        end_date: '2031-02-14',
        status: 'active',
        recovery_profile: expectedProfile('0.1250'),
      },
    ]
  )
}

async function cleanup(created) {
  const failures = []

  if (
    created.propertyId &&
    (created.leaseIds.length === 0 || created.unitIds.length === 0)
  ) {
    await attemptCleanup(failures, 'capture browser rent roll child IDs', () =>
      captureGeneratedChildren(created)
    )
  }

  for (const leaseId of created.leaseIds) {
    await attemptCleanup(failures, `delete lease ${leaseId}`, () =>
      deleteEmpty(`/api/v1/leases/${leaseId}`)
    )
    await attemptCleanup(failures, `verify lease ${leaseId} deleted`, () =>
      expectStatus(`/api/v1/leases/${leaseId}`, { status: 404 })
    )
  }
  for (const unitId of created.unitIds) {
    await attemptCleanup(failures, `delete unit ${unitId}`, () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}/units/${unitId}`)
    )
    await attemptCleanup(failures, `verify unit ${unitId} deleted`, () =>
      expectStatus(`/api/v1/properties/${created.propertyId}/units/${unitId}`, {
        status: 404,
      })
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete browser rent roll property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify browser rent roll property deleted',
      () =>
        expectStatus(`/api/v1/properties/${created.propertyId}`, {
          status: 404,
        })
    )
    await attemptCleanup(
      failures,
      'verify browser rent roll leases deleted',
      () => expectListEmpty(`/api/v1/leases?property_id=${created.propertyId}`)
    )
    await attemptCleanup(
      failures,
      'verify browser rent roll units inaccessible',
      () =>
        expectStatus(`/api/v1/properties/${created.propertyId}/units`, {
          status: 404,
        })
    )
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function captureGeneratedChildren(created) {
  if (created.leaseIds.length === 0) {
    const leases = await expectJson(
      `/api/v1/leases?property_id=${created.propertyId}&skip=0&limit=100`,
      { status: 200 }
    )
    created.leaseIds = leases.data.map((lease) => lease.id)
    report.generated.leaseIds = created.leaseIds
  }
  if (created.unitIds.length === 0) {
    const units = await expectJson(
      `/api/v1/properties/${created.propertyId}/units?skip=0&limit=100`,
      { status: 200 }
    )
    created.unitIds = units.data.map((unit) => unit.id)
    report.generated.unitIds = created.unitIds
  }
  report.cleanup.push({
    path: `/api/v1/properties/${created.propertyId}/children`,
    status: 200,
    ok: true,
    body_preview: JSON.stringify({
      lease_count: created.leaseIds.length,
      unit_count: created.unitIds.length,
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

async function expectListEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `GET ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
  const body = text ? JSON.parse(text) : null
  const ok =
    body?.count === 0 && Array.isArray(body?.data) && body.data.length === 0
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: JSON.stringify({
      count: body?.count,
      item_count: body?.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `List still contains rows after cleanup: ${text.slice(0, 500)}`
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

function rentRollCsv(propertyName) {
  const suffix = propertyName.slice(-8)
  return [
    'Yardi Voyager Rent Roll',
    `Property: ${propertyName}`,
    'Address: 600 Browser Fixture Plaza, Austin, TX 78701',
    '',
    'Unit Number,Rentable SF,Usable SF,Floor,Tenant,Lease Start,Lease End,Monthly Rent,CAM %',
    `100,"1,250.50","1,100.25",1,[PROD-TEST] Alpha LLC ${suffix},01/01/2026,12/31/2030,"$10,000.00",18.5%`,
    '200,900,,2,,,,0,',
    `300,1500,1400,3,[PROD-TEST] Beta LLC ${suffix},2026-02-15,2031-02-14,12000,0.125`,
    `300,777,700,3,[PROD-TEST] Duplicate LLC ${suffix},2026-03-01,2031-03-01,7000,9%`,
    `400,not-a-number,800,4,[PROD-TEST] Bad Sqft LLC ${suffix},2026-04-01,2031-04-01,5000,5%`,
    'Total,4427.50,4000,,,,,,',
  ].join('\n')
}

function expectedProfile(proRataShare) {
  return {
    base_year: null,
    base_year_amount: null,
    base_year_adjustments: [],
    gross_up_base_year: false,
    pro_rata_share: proRataShare,
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0',
    management_fee_percentage: null,
    excluded_pools: [],
  }
}

function isExpectedBrowserMutation(method, url) {
  return (
    method === 'POST' &&
    (url.includes('/api/v1/rent-roll/preview') ||
      url.includes('/api/v1/rent-roll/import'))
  )
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

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
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

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
