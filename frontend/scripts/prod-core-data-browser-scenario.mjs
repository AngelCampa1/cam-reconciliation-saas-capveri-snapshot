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
  `prod-core-data-browser-${runId}`
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
    browserMutationsMatchExpected() &&
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
  const propertyName = `[PROD-TEST] Browser Core Data Tower ${suffix}`
  const unitNumber = `CoreData-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Browser Core Data Tenant ${suffix}`
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
  }

  try {
    await runBrowserScenario({ propertyName, unitNumber, tenantName, created })
    await verifyPersistedRecords({
      propertyName,
      unitNumber,
      tenantName,
      created,
    })
  } finally {
    await cleanup(created)
  }
}

async function runBrowserScenario({
  propertyName,
  unitNumber,
  tenantName,
  created,
}) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'core-data-browser')
    try {
      await createPropertyThroughBrowser(page, propertyName, created)
      await createUnitThroughBrowser(page, unitNumber, created)
      await createLeaseThroughBrowser(page, tenantName, unitNumber, created)
      await page.screenshot({
        path: resolve(outputDir, 'core-data-browser-lease-detail.png'),
      })
      report.browser.screenshots.push('core-data-browser-lease-detail.png')
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function createPropertyThroughBrowser(page, propertyName, created) {
  const response = await page.goto(`${appUrl}/properties/new`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  })
  await expectVisible(page, 'Create Property')
  await page.locator('button').filter({ hasText: 'Enter Manually' }).click()
  await page
    .getByTestId('property-name-input')
    .waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('property-name-input').fill(propertyName)
  await page.getByTestId('address-line1-input').fill('925 Prod Core Data Way')
  await page.getByTestId('city-input').fill('Austin')
  await chooseSelectOption(page, 'state-input', 'TX - Texas')
  await page.getByTestId('postal-code-input').fill('78710')
  await page.getByTestId('total-rentable-sqft-input').fill('12000.00')
  await page.getByTestId('total-usable-sqft-input').fill('10800.00')
  await page.getByTestId('common-area-sqft-input').fill('1200.00')
  await page.getByTestId('target-occupancy-input').fill('95')
  await chooseSelectOption(page, 'boma-standard-version-select', 'BOMA 2024')
  await page.getByTestId('tax-protest-county-input').fill('Travis')

  const createResponsePromise = page.waitForResponse(
    (item) =>
      item.url().includes('/api/v1/properties') &&
      item.request().method() === 'POST' &&
      item.status() === 201,
    { timeout: 30_000 }
  )
  await page.getByRole('button', { name: /^Create Property$/ }).click()
  const createResponse = await createResponsePromise
  const property = await createResponse.json()
  created.propertyId = property.id
  report.generated.propertyId = property.id
  await page.waitForURL(`**/properties/${property.id}`, { timeout: 15_000 })
  await expectVisible(page, propertyName)

  check(
    'browser property form created generated property and navigated to detail',
    {
      initial_status: response?.status() ?? null,
      final_url: page.url(),
      property_visible: await visibleText(page, propertyName),
      has_property_id:
        typeof property.id === 'string' && property.id.length > 0,
    },
    {
      initial_status: 200,
      final_url: `${appUrl}/properties/${property.id}`,
      property_visible: true,
      has_property_id: true,
    }
  )
}

async function createUnitThroughBrowser(page, unitNumber, created) {
  await page.getByRole('tab', { name: 'Units' }).click()
  await expectVisible(page, 'No units yet')
  const unitResponsePromise = page.waitForResponse(
    (item) =>
      item.url().includes(`/api/v1/properties/${created.propertyId}/units`) &&
      item.request().method() === 'POST' &&
      item.status() === 201,
    { timeout: 30_000 }
  )
  await page.getByRole('button', { name: /^Add Unit$/ }).click()
  await expectVisible(page, 'Enter the details for the new unit.')
  await page.getByTestId('unit-number-input').fill(unitNumber)
  await page.getByTestId('rentable-sqft-input').fill('2400.00')
  await page.getByTestId('usable-sqft-input').fill('2160.00')
  await chooseSelectOption(page, 'space-type-select', 'Office')
  await page.getByRole('button', { name: /^Add Unit$/ }).click()
  const unitResponse = await unitResponsePromise
  const unit = await unitResponse.json()
  created.unitId = unit.id
  report.generated.unitId = unit.id
  await expectVisible(page, unitNumber)

  check(
    'browser unit modal created generated unit in property detail',
    {
      unit_visible: await visibleText(page, unitNumber),
      has_unit_id: typeof unit.id === 'string' && unit.id.length > 0,
      property_id: unit.property_id,
    },
    {
      unit_visible: true,
      has_unit_id: true,
      property_id: created.propertyId,
    }
  )
}

async function createLeaseThroughBrowser(
  page,
  tenantName,
  unitNumber,
  created
) {
  const url = `${appUrl}/properties/${created.propertyId}/leases/new`
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await expectVisible(page, 'Create Lease')
  await page.getByTestId('tenant-name-input').fill(tenantName)
  await chooseSelectOption(
    page,
    'unit-select',
    new RegExp(escapeRegex(unitNumber))
  )
  await page.getByTestId('start-date-input').fill('2026-01-01')
  await page.getByTestId('end-date-input').fill('2031-12-31')
  await chooseSelectOption(page, 'status-select', 'Active')
  await page.getByTestId('pro-rata-share-input').fill('20')
  await page.getByTestId('base-year-input').fill('2025')
  await page.getByTestId('base-year-amount-input').fill('6500.00')
  await chooseSelectOption(page, 'cap-type-select', 'No Cap')
  await page.getByTestId('admin-fee-input').fill('1.5')
  await chooseSelectOption(page, 'rsf-measurement-standard-select', 'BOMA 2024')
  await chooseSelectOption(page, 'accounting-basis-select', 'Accrual Basis')

  const leaseResponsePromise = page.waitForResponse(
    (item) =>
      item.url().includes('/api/v1/leases') &&
      item.request().method() === 'POST' &&
      item.status() === 201,
    { timeout: 30_000 }
  )
  await page.getByRole('button', { name: /^Create Lease$/ }).click()
  const leaseResponse = await leaseResponsePromise
  const lease = await leaseResponse.json()
  created.leaseId = lease.id
  report.generated.leaseId = lease.id
  await page.waitForURL(
    `**/properties/${created.propertyId}/leases/${lease.id}`,
    {
      timeout: 15_000,
    }
  )
  await expectVisible(page, tenantName)

  check(
    'browser lease form created generated lease and navigated to detail',
    {
      final_url: page.url(),
      tenant_visible: await visibleText(page, tenantName),
      has_lease_id: typeof lease.id === 'string' && lease.id.length > 0,
      property_id: lease.property_id,
      unit_id: lease.unit_id,
    },
    {
      final_url: `${appUrl}/properties/${created.propertyId}/leases/${lease.id}`,
      tenant_visible: true,
      has_lease_id: true,
      property_id: created.propertyId,
      unit_id: created.unitId,
    }
  )
}

async function verifyPersistedRecords({
  propertyName,
  unitNumber,
  tenantName,
  created,
}) {
  const property = await expectJson(
    `/api/v1/properties/${created.propertyId}`,
    {
      status: 200,
    }
  )
  check(
    'api readback confirms browser-created property fields',
    {
      id: property.id,
      name: property.name,
      state: property.state,
      total_rentable_sqft: property.total_rentable_sqft,
      total_usable_sqft: property.total_usable_sqft,
      common_area_sqft: property.common_area_sqft,
      target_occupancy: property.target_occupancy,
      boma_standard_version: property.boma_standard_version,
      tax_protest_county: property.tax_protest_county,
    },
    {
      id: created.propertyId,
      name: propertyName,
      state: 'TX',
      total_rentable_sqft: '12000.00',
      total_usable_sqft: '10800.00',
      common_area_sqft: '1200.00',
      target_occupancy: '0.9500',
      boma_standard_version: '2024',
      tax_protest_county: 'Travis',
    }
  )

  const unit = await expectJson(
    `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
    { status: 200 }
  )
  check(
    'api readback confirms browser-created unit fields',
    {
      id: unit.id,
      property_id: unit.property_id,
      unit_number: unit.unit_number,
      rentable_sqft: unit.rentable_sqft,
      usable_sqft: unit.usable_sqft,
      status: unit.status,
      space_type: unit.space_type,
    },
    {
      id: created.unitId,
      property_id: created.propertyId,
      unit_number: unitNumber,
      rentable_sqft: '2400.00',
      usable_sqft: '2160.00',
      status: 'vacant',
      space_type: 'office',
    }
  )

  const lease = await expectJson(`/api/v1/leases/${created.leaseId}`, {
    status: 200,
  })
  check(
    'api readback confirms browser-created lease and recovery profile',
    {
      id: lease.id,
      property_id: lease.property_id,
      unit_id: lease.unit_id,
      tenant_name: lease.tenant_name,
      start_date: normalizeDateOnly(lease.start_date),
      end_date: normalizeDateOnly(lease.end_date),
      status: lease.status,
      pro_rata_share: lease.recovery_profile?.pro_rata_share,
      base_year: lease.recovery_profile?.base_year,
      base_year_amount: lease.recovery_profile?.base_year_amount,
      cap_type: lease.recovery_profile?.cap_type,
      admin_fee_percentage: lease.recovery_profile?.admin_fee_percentage,
      rsf_measurement_standard:
        lease.recovery_profile?.rsf_measurement_standard,
      accounting_basis: lease.recovery_profile?.accounting_basis,
    },
    {
      id: created.leaseId,
      property_id: created.propertyId,
      unit_id: created.unitId,
      tenant_name: tenantName,
      start_date: '2026-01-01',
      end_date: '2031-12-31',
      status: 'active',
      pro_rata_share: '0.2',
      base_year: 2025,
      base_year_amount: '6500.00',
      cap_type: 'none',
      admin_fee_percentage: '0.015',
      rsf_measurement_standard: '2024',
      accounting_basis: 'accrual',
    }
  )
}

async function cleanup(created) {
  const failures = []
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
    await attemptCleanup(failures, 'verify property lease list empty', () =>
      expectNoLeases(created.propertyId)
    )
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

async function expectNoLeases(propertyId) {
  const leases = await expectJson(
    `/api/v1/leases?property_id=${propertyId}&limit=100`,
    { status: 200 }
  )
  const isArrayShape = Array.isArray(leases)
  const isPaginatedShape = !isArrayShape && Array.isArray(leases?.data)
  if (!isArrayShape && !isPaginatedShape) {
    throw new Error(
      `Unexpected lease list response shape: ${JSON.stringify(leases).slice(0, 500)}`
    )
  }
  const items = isArrayShape ? leases : leases.data
  const countOk = isPaginatedShape ? leases.count === 0 : true
  const ok = items.length === 0 && countOk
  report.cleanup.push({
    path: `/api/v1/leases?property_id=${propertyId}&limit=100`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      item_count: items.length,
      count: typeof leases?.count === 'number' ? leases.count : null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Leases still present after delete: ${JSON.stringify(leases).slice(0, 500)}`
    )
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

async function chooseSelectOption(page, testId, optionName) {
  await page.getByTestId(testId).click()
  await page.getByRole('option', { name: optionName }).click()
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

function browserMutationsMatchExpected() {
  const expected = [
    { method: 'POST', fragment: '/api/v1/properties' },
    {
      method: 'POST',
      fragment: `/api/v1/properties/${report.generated.propertyId}/units`,
    },
    { method: 'POST', fragment: '/api/v1/leases' },
  ]
  if (report.browser.mutating_requests.length !== expected.length) return false
  return expected.every((item, index) => {
    const actual = report.browser.mutating_requests[index]
    return (
      actual?.method === item.method &&
      typeof actual.url === 'string' &&
      actual.url.includes(item.fragment)
    )
  })
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

function normalizeDateOnly(value) {
  if (typeof value !== 'string') return value
  return value.slice(0, 10)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
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
