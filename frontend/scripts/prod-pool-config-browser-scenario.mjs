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
  `prod-pool-config-browser-${runId}`
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
  const propertyName = `[PROD-TEST] Browser Pool Config ${suffix}`
  const sourcePoolName = `[PROD-TEST] Source Pool ${suffix}`
  const targetPoolName = `[PROD-TEST] Target Pool ${suffix}`
  const created = {
    propertyId: null,
    sourcePoolId: null,
    targetPoolId: null,
    mappingId: null,
    allocationId: null,
  }
  report.generated = {
    propertyName,
    sourcePoolName,
    targetPoolName,
    poolIds: [],
    mappingIds: [],
    poolAllocationIds: [],
  }

  try {
    const property = await createDisposableProperty(propertyName)
    created.propertyId = property.id
    report.generated.propertyId = property.id

    await runBrowserScenario({
      created,
      propertyName,
      sourcePoolName,
      targetPoolName,
    })
    await verifyPersistedRecords({
      created,
      propertyName,
      sourcePoolName,
      targetPoolName,
    })
  } finally {
    await cleanup(created)
  }
}

async function createDisposableProperty(propertyName) {
  return expectJson('/api/v1/properties', {
    method: 'POST',
    status: 201,
    body: {
      name: propertyName,
      address_line1: '940 Prod Pool Browser Way',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      total_rentable_sqft: '50000.00',
      total_usable_sqft: '45500.00',
      common_area_sqft: '4500.00',
      target_occupancy: '0.94',
      boma_standard_version: '2024',
      fiscal_year_start_month: 1,
    },
  })
}

async function runBrowserScenario({
  created,
  propertyName,
  sourcePoolName,
  targetPoolName,
}) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'pool-config-browser')
    try {
      await openPoolsTab(page, created.propertyId, propertyName)
      await createPoolThroughBrowser(page, {
        propertyId: created.propertyId,
        name: sourcePoolName,
        typeLabel: 'Operating',
        grossUp: true,
        grossUpTarget: '95',
        description: 'Production E2E disposable source pool',
        assign: (pool) => {
          created.sourcePoolId = pool.id
          report.generated.poolIds.push(pool.id)
        },
      })
      await createPoolThroughBrowser(page, {
        propertyId: created.propertyId,
        name: targetPoolName,
        typeLabel: 'Insurance',
        grossUp: false,
        description: 'Production E2E disposable target pool',
        assign: (pool) => {
          created.targetPoolId = pool.id
          report.generated.poolIds.push(pool.id)
        },
      })
      await createAndEditMappingThroughBrowser(page, {
        propertyId: created.propertyId,
        sourcePoolId: created.sourcePoolId,
        sourcePoolName,
        created,
      })
      await createAllocationThroughBrowser(page, {
        propertyId: created.propertyId,
        sourcePoolId: created.sourcePoolId,
        targetPoolId: created.targetPoolId,
        targetPoolName,
        created,
      })
      await page.screenshot({
        path: resolve(outputDir, 'pool-config-browser.png'),
      })
      report.browser.screenshots.push('pool-config-browser.png')
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function openPoolsTab(page, propertyId, propertyName) {
  const response = await page.goto(`${appUrl}/properties/${propertyId}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  })
  await expectVisible(page, propertyName)
  await page.getByRole('tab', { name: 'Pools' }).click()
  await page
    .getByText(/No expense pools yet|Expense Pools/u)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  check(
    'browser opened disposable property pools tab',
    {
      initial_status: response?.status() ?? null,
      property_visible: await visibleText(page, propertyName),
      url_includes_property: page.url().includes(`/properties/${propertyId}`),
    },
    {
      initial_status: 200,
      property_visible: true,
      url_includes_property: true,
    }
  )
}

async function createPoolThroughBrowser(page, options) {
  const poolResponsePromise = page.waitForResponse(
    (item) =>
      item
        .url()
        .includes(`/api/v1/properties/${options.propertyId}/expense-pools`) &&
      item.request().method() === 'POST' &&
      item.status() === 201,
    { timeout: 30_000 }
  )
  await page.getByRole('button', { name: /^Add Pool$/ }).click()
  await page
    .getByTestId('pool-name-input')
    .waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByTestId('pool-name-input').fill(options.name)
  await chooseSelectOption(page, 'pool-type-trigger', options.typeLabel)
  if (options.grossUp) {
    await page.getByTestId('gross-up-switch').click()
    await page.getByTestId('gross-up-target-input').fill(options.grossUpTarget)
  }
  await page.getByTestId('description-input').fill(options.description)
  await page.getByRole('button', { name: /^Add Pool$/ }).click()
  const poolResponse = await poolResponsePromise
  const pool = await poolResponse.json()
  options.assign(pool)
  await expectVisible(page, options.name)
  check(
    `browser created pool ${options.name}`,
    {
      id_present: typeof pool.id === 'string' && pool.id.length > 0,
      property_id: pool.property_id,
      name: pool.name,
      visible: await visibleText(page, options.name),
    },
    {
      id_present: true,
      property_id: options.propertyId,
      name: options.name,
      visible: true,
    }
  )
}

async function createAndEditMappingThroughBrowser(page, options) {
  await page.getByTestId(`mappings-button-${options.sourcePoolId}`).click()
  await expectVisible(page, 'GL Account Mappings')
  await expectVisible(
    page,
    `Manage GL account patterns for "${options.sourcePoolName}"`
  )

  const createResponsePromise = page.waitForResponse(
    (item) =>
      item
        .url()
        .includes(`/api/v1/properties/${options.propertyId}/pool-mappings`) &&
      item.request().method() === 'POST' &&
      item.status() === 201,
    { timeout: 30_000 }
  )
  await page.getByTestId('add-mapping-button').click()
  await page.getByTestId('new-pattern-input').fill('91*')
  await page.getByTestId('new-allocation-input').fill('100')
  await page.getByTestId('new-priority-input').fill('99')
  await page.getByTestId('save-new-mapping-button').click()
  const createResponse = await createResponsePromise
  const createdMapping = await createResponse.json()
  options.created.mappingId = createdMapping.id
  report.generated.mappingIds.push(createdMapping.id)
  await page
    .getByTestId(`mapping-row-${createdMapping.id}`)
    .waitFor({ state: 'visible', timeout: 10_000 })

  const updateResponsePromise = page.waitForResponse(
    (item) =>
      item
        .url()
        .includes(
          `/api/v1/properties/${options.propertyId}/pool-mappings/${createdMapping.id}`
        ) &&
      item.request().method() === 'PUT' &&
      item.status() === 200,
    { timeout: 30_000 }
  )
  await page.getByTestId(`edit-mapping-${createdMapping.id}`).click()
  await page.getByTestId('edit-pattern-input').fill('92*')
  await page.getByTestId('edit-allocation-input').fill('85')
  await page.getByTestId('edit-priority-input').fill('100')
  await page.getByTestId('save-edit-button').click()
  const updateResponse = await updateResponsePromise
  const updatedMapping = await updateResponse.json()
  const mappingRow = page.getByTestId(`mapping-row-${createdMapping.id}`)
  await mappingRow.getByText('92*', { exact: true }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  const updatedPatternVisible = await mappingRow
    .getByText('92*', { exact: true })
    .isVisible()

  check(
    'browser created and updated GL mapping',
    {
      id: updatedMapping.id,
      expense_pool_id: updatedMapping.expense_pool_id,
      gl_account_pattern: updatedMapping.gl_account_pattern,
      allocation_percentage: updatedMapping.allocation_percentage,
      priority: updatedMapping.priority,
      visible: updatedPatternVisible,
    },
    {
      id: createdMapping.id,
      expense_pool_id: options.sourcePoolId,
      gl_account_pattern: '92*',
      allocation_percentage: '0.8500',
      priority: 100,
      visible: true,
    }
  )
  await page.keyboard.press('Escape')
  await page
    .getByText('GL Account Mappings', { exact: true })
    .waitFor({ state: 'hidden', timeout: 10_000 })
}

async function createAllocationThroughBrowser(page, options) {
  await page.getByTestId(`allocations-button-${options.sourcePoolId}`).click()
  await expectVisible(page, 'Split Allocations')

  const allocationDialog = page.getByRole('dialog').filter({
    has: page.getByText('Split Allocations', { exact: true }),
  })
  await allocationDialog.getByRole('combobox', { name: 'Target pool' }).click()
  await page.getByRole('option', { name: options.targetPoolName }).click()
  await page.getByTestId('new-allocation-value-input').fill('25')
  const createResponsePromise = page.waitForResponse(
    (item) =>
      item
        .url()
        .includes(
          `/api/v1/properties/${options.propertyId}/pool-allocations`
        ) &&
      item.request().method() === 'POST' &&
      item.status() === 201,
    { timeout: 30_000 }
  )
  await page.getByTestId('add-allocation-button').click()
  const createResponse = await createResponsePromise
  const allocation = await createResponse.json()
  options.created.allocationId = allocation.id
  report.generated.poolAllocationIds.push(allocation.id)
  await page
    .getByTestId(`allocation-row-${allocation.id}`)
    .waitFor({ state: 'visible', timeout: 10_000 })
  await expectVisible(page, options.targetPoolName)
  await page.keyboard.press('Escape')

  check(
    'browser created split allocation',
    {
      id: allocation.id,
      source_pool_id: allocation.source_pool_id,
      target_pool_id: allocation.target_pool_id,
      allocation_type: allocation.allocation_type,
      allocation_value: allocation.allocation_value,
      target_visible: await visibleText(page, options.targetPoolName),
    },
    {
      id: allocation.id,
      source_pool_id: options.sourcePoolId,
      target_pool_id: options.targetPoolId,
      allocation_type: 'percentage',
      allocation_value: '25.0000',
      target_visible: true,
    }
  )
}

async function verifyPersistedRecords({
  created,
  propertyName,
  sourcePoolName,
  targetPoolName,
}) {
  const property = await expectJson(
    `/api/v1/properties/${created.propertyId}`,
    {
      status: 200,
    }
  )
  check(
    'api readback confirms disposable property setup',
    {
      id: property.id,
      name: property.name,
      target_occupancy: property.target_occupancy,
      boma_standard_version: property.boma_standard_version,
    },
    {
      id: created.propertyId,
      name: propertyName,
      target_occupancy: '0.9400',
      boma_standard_version: '2024',
    }
  )

  const sourcePool = await expectJson(
    `/api/v1/properties/${created.propertyId}/expense-pools/${created.sourcePoolId}`,
    { status: 200 }
  )
  const targetPool = await expectJson(
    `/api/v1/properties/${created.propertyId}/expense-pools/${created.targetPoolId}`,
    { status: 200 }
  )
  check(
    'api readback confirms browser-created pools',
    normalizePools([sourcePool, targetPool]),
    normalizePools([
      {
        id: created.sourcePoolId,
        name: sourcePoolName,
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: '0.9500',
        parent_pool_id: null,
      },
      {
        id: created.targetPoolId,
        name: targetPoolName,
        pool_type: 'insurance',
        is_gross_up_applicable: false,
        gross_up_target: null,
        parent_pool_id: null,
      },
    ])
  )

  const mappingList = await expectJson(
    `/api/v1/properties/${created.propertyId}/pool-mappings?pool_id=${created.sourcePoolId}&skip=0&limit=10`,
    { status: 200 }
  )
  check(
    'api readback confirms browser-created mapping',
    {
      count: mappingList.count,
      data: normalizeMappings(mappingList.data),
    },
    {
      count: 1,
      data: normalizeMappings([
        {
          id: created.mappingId,
          expense_pool_id: created.sourcePoolId,
          gl_account_pattern: '92*',
          allocation_percentage: '0.8500',
          priority: 100,
        },
      ]),
    }
  )

  const allocationList = await expectJson(
    `/api/v1/properties/${created.propertyId}/pool-allocations?source_pool_id=${created.sourcePoolId}&skip=0&limit=10`,
    { status: 200 }
  )
  check(
    'api readback confirms browser-created split allocation',
    {
      count: allocationList.count,
      data: normalizeAllocations(allocationList.data),
    },
    {
      count: 1,
      data: normalizeAllocations([
        {
          id: created.allocationId,
          source_pool_id: created.sourcePoolId,
          target_pool_id: created.targetPoolId,
          allocation_type: 'percentage',
          allocation_value: '25.0000',
        },
      ]),
    }
  )
}

async function cleanup(created) {
  const failures = []
  if (created.propertyId && created.sourcePoolId) {
    await attemptCleanup(
      failures,
      'verify pool config rows before delete',
      () =>
        expectPoolConfigCounts({
          propertyId: created.propertyId,
          sourcePoolId: created.sourcePoolId,
          expectedMappings: created.mappingId ? 1 : 0,
          expectedAllocations: created.allocationId ? 1 : 0,
        })
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete pool config property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify pool config property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
  }
  for (const poolId of [...report.generated.poolIds].reverse()) {
    if (!created.propertyId) continue
    await attemptCleanup(failures, 'verify expense pool deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId && created.mappingId) {
    await attemptCleanup(failures, 'verify pool mapping deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId && created.allocationId) {
    await attemptCleanup(failures, 'verify pool allocation deleted', () =>
      expectStatus(
        `/api/v1/properties/${created.propertyId}/pool-allocations/${created.allocationId}`,
        { status: 404 }
      )
    )
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectPoolConfigCounts({
  propertyId,
  sourcePoolId,
  expectedMappings,
  expectedAllocations,
}) {
  const mappings = await expectJson(
    `/api/v1/properties/${propertyId}/pool-mappings?pool_id=${sourcePoolId}&skip=0&limit=10`,
    { status: 200 }
  )
  const allocations = await expectJson(
    `/api/v1/properties/${propertyId}/pool-allocations?source_pool_id=${sourcePoolId}&skip=0&limit=10`,
    { status: 200 }
  )
  const ok =
    mappings.count === expectedMappings &&
    mappings.data?.length === expectedMappings &&
    allocations.count === expectedAllocations &&
    allocations.data?.length === expectedAllocations
  report.cleanup.push({
    label: 'pool config rows present before delete',
    status: 200,
    ok,
    summary: {
      mappings: mappings.data?.length ?? null,
      allocations: allocations.data?.length ?? null,
    },
  })
  if (!ok) {
    throw new Error(
      `Unexpected pool config counts: ${JSON.stringify({
        mappings,
        allocations,
      }).slice(0, 500)}`
    )
  }
}

function normalizePools(pools) {
  return pools
    .map((pool) => ({
      id: pool.id,
      name: pool.name,
      pool_type: pool.pool_type,
      is_gross_up_applicable: pool.is_gross_up_applicable,
      gross_up_target: pool.gross_up_target,
      parent_pool_id: pool.parent_pool_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function normalizeMappings(mappings) {
  return mappings
    .map((mapping) => ({
      id: mapping.id,
      expense_pool_id: mapping.expense_pool_id,
      gl_account_pattern: mapping.gl_account_pattern,
      allocation_percentage: mapping.allocation_percentage,
      priority: mapping.priority,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function normalizeAllocations(allocations) {
  return allocations
    .map((allocation) => ({
      id: allocation.id,
      source_pool_id: allocation.source_pool_id,
      target_pool_id: allocation.target_pool_id,
      allocation_type: allocation.allocation_type,
      allocation_value: allocation.allocation_value,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const method = request.method()
    const url = request.url()
    report.browser.requests.push({ method, url: redactQuery(url) })
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const record = { method, url: redactQuery(url) }
      if (isCapVeriOrigin(url)) {
        report.browser.mutating_requests.push(record)
      } else if (isSupabaseOrigin(url)) {
        report.browser.unexpected_mutating_requests.push(record)
      }
    }
  })
  context.on('response', (response) => {
    const status = response.status()
    const url = response.url()
    if (status >= 400 && isRelevantFailure(url)) {
      report.browser.failed_responses.push({
        status,
        url: redactQuery(url),
        method: response.request().method(),
      })
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
    {
      method: 'POST',
      fragment: `/api/v1/properties/${report.generated.propertyId}/expense-pools`,
    },
    {
      method: 'POST',
      fragment: `/api/v1/properties/${report.generated.propertyId}/expense-pools`,
    },
    {
      method: 'POST',
      fragment: `/api/v1/properties/${report.generated.propertyId}/pool-mappings`,
    },
    {
      method: 'PUT',
      fragment: `/api/v1/properties/${report.generated.propertyId}/pool-mappings/${report.generated.mappingIds[0]}`,
    },
    {
      method: 'POST',
      fragment: `/api/v1/properties/${report.generated.propertyId}/pool-allocations`,
    },
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

function isSupabaseOrigin(url) {
  return sameOrigin(url, supabaseUrl)
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

function redactQuery(url) {
  try {
    const parsed = new URL(url)
    parsed.search = parsed.search ? '?[redacted]' : ''
    return parsed.toString()
  } catch {
    return url
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
