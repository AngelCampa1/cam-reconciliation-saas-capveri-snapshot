import { chromium } from '@playwright/test'
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
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-dashboard-portfolio-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {
    write_policy: 'read-only API and authenticated page loads only',
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
  },
  checks: [],
  browser_errors: [],
  failed_responses: [],
  mutating_requests: [],
  cleanup: [],
  auth: {},
}

let token
try {
  const session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }
  await runApiScenario()
  await runBrowserScenario(session)
  report.cleanup.push({
    label: 'read-only dashboard portfolio cleanup',
    ok: true,
    body_preview:
      'No CapVeri app/API mutating requests were issued by this scenario.',
  })
  report.ok =
    report.checks.every((check) => check.ok) &&
    report.browser_errors.length === 0 &&
    report.failed_responses.length === 0 &&
    report.mutating_requests.length === 0
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runApiScenario() {
  const dashboard = await expectJson('/api/v1/dashboard', { status: 200 })
  check(
    'dashboard returns nonnegative counts and arrays',
    {
      property_count: nonnegativeInteger(dashboard.property_count),
      unit_count: nonnegativeInteger(dashboard.unit_count),
      lease_count: nonnegativeInteger(dashboard.lease_count),
      gl_entry_count: nonnegativeInteger(dashboard.gl_entry_count),
      pending_reconciliations: nonnegativeInteger(
        dashboard.pending_reconciliations
      ),
      pending_verifications: nonnegativeInteger(
        dashboard.pending_verifications
      ),
      recent_properties_is_array: Array.isArray(dashboard.recent_properties),
      recent_activity_is_array: Array.isArray(dashboard.recent_activity),
      total_recovery_finalized_money: decimalString(
        dashboard.total_recovery_finalized
      ),
      alerts_is_array: Array.isArray(dashboard.alerts),
    },
    {
      property_count: true,
      unit_count: true,
      lease_count: true,
      gl_entry_count: true,
      pending_reconciliations: true,
      pending_verifications: true,
      recent_properties_is_array: true,
      recent_activity_is_array: true,
      total_recovery_finalized_money: true,
      alerts_is_array: true,
    }
  )

  const leakage = await expectJson('/api/v1/dashboard/leakage-summary', {
    status: 200,
  })
  check(
    'dashboard leakage summary returns stable money and counts',
    {
      total_recovery_opportunity_money: decimalString(
        leakage.total_recovery_opportunity
      ),
      total_underbill_exposure_money: decimalString(
        leakage.total_underbill_exposure
      ),
      total_overbill_exposure_money: decimalString(
        leakage.total_overbill_exposure
      ),
      total_billing_exposure_money: decimalString(
        leakage.total_billing_exposure
      ),
      draft_recovery_money: decimalString(leakage.draft_recovery),
      properties_with_leakage: nonnegativeInteger(
        leakage.properties_with_leakage
      ),
      properties_with_billing_exposure: nonnegativeInteger(
        leakage.properties_with_billing_exposure
      ),
      draft_property_count: nonnegativeInteger(leakage.draft_property_count),
      has_billing_data_is_boolean:
        typeof leakage.has_billing_data === 'boolean',
    },
    {
      total_recovery_opportunity_money: true,
      total_underbill_exposure_money: true,
      total_overbill_exposure_money: true,
      total_billing_exposure_money: true,
      draft_recovery_money: true,
      properties_with_leakage: true,
      properties_with_billing_exposure: true,
      draft_property_count: true,
      has_billing_data_is_boolean: true,
    }
  )

  const portfolio = await expectJson('/api/v1/portfolio/summary', {
    status: 200,
  })
  check(
    'portfolio summary returns bounded numbers and property rows',
    {
      period_year_valid:
        portfolio.period_year === null ||
        (Number.isInteger(portfolio.period_year) &&
          portfolio.period_year >= 2000 &&
          portfolio.period_year <= 2100),
      total_recoverable_cam_money: decimalString(
        portfolio.total_recoverable_cam
      ),
      total_leakage_money: decimalString(portfolio.total_leakage),
      recovery_rate_valid:
        portfolio.recovery_rate === null ||
        (typeof portfolio.recovery_rate === 'number' &&
          Number.isFinite(portfolio.recovery_rate) &&
          portfolio.recovery_rate >= 0),
      properties_with_leakage: nonnegativeInteger(
        portfolio.properties_with_leakage
      ),
      has_billing_data_is_boolean:
        typeof portfolio.has_billing_data === 'boolean',
      total_recovery_all_years_money: decimalString(
        portfolio.total_recovery_all_years
      ),
      properties_is_array: Array.isArray(portfolio.properties),
      property_rows_valid: Array.isArray(portfolio.properties)
        ? portfolio.properties.every(validPortfolioRow)
        : false,
    },
    {
      period_year_valid: true,
      total_recoverable_cam_money: true,
      total_leakage_money: true,
      recovery_rate_valid: true,
      properties_with_leakage: true,
      has_billing_data_is_boolean: true,
      total_recovery_all_years_money: true,
      properties_is_array: true,
      property_rows_valid: true,
    }
  )
}

async function runBrowserScenario(session) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    context.on('request', (request) => {
      const url = request.url()
      const method = request.method()
      if (
        isCapVeriOrigin(url) &&
        !['GET', 'HEAD', 'OPTIONS'].includes(method)
      ) {
        report.mutating_requests.push({ method, url })
      }
    })
    context.on('response', (response) => {
      const url = response.url()
      const status = response.status()
      if (status >= 400 && isRelevantFailure(url)) {
        report.failed_responses.push({ status, url })
      }
    })
    await injectSupabaseSession(context, session)
    await checkApp(context, '/dashboard', 'dashboard-page')
    await checkApp(context, '/portfolio', 'portfolio-page')
  } finally {
    await browser.close()
  }
}

async function checkApp(context, path, label) {
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    report.browser_errors.push({ label, message: errorMessage(error) })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browser_errors.push({ label, message: message.text() })
    }
  })

  const item = { label, path, ok: false }
  try {
    const response = await page.goto(`${appUrl}${path}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.waitForTimeout(1000)
    item.status = response?.status() ?? null
    item.final_url = page.url()
    item.final_path = new URL(item.final_url).pathname
    item.title = await page.title()
    item.ok = !!response && response.status() < 400 && item.final_path === path
    await page.screenshot({ path: resolve(outputDir, `${label}.png`) })
  } catch (error) {
    item.error = errorMessage(error)
  } finally {
    report.checks.push({
      label: `${label} loads authenticated app route`,
      ok: item.ok,
      actual: item,
      expected: { ok: true },
    })
    await page.close()
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

async function signInWithPassword() {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
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

async function injectSupabaseSession(context, session) {
  const supabaseUrlObj = new URL(supabaseUrl)
  const storageKey = `sb-${supabaseUrlObj.hostname.split('.')[0]}-auth-token`
  const sampleSeenStorageKey = `capveri_onboarding_sample_result_seen:${session.user.id}`
  const authValue = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at:
      Math.floor(Date.now() / 1000) + Number(session.expires_in ?? 3600),
    expires_in: Number(session.expires_in ?? 3600),
    token_type: session.token_type ?? 'bearer',
    user: session.user,
  }

  await context.addInitScript(
    ({ key, sampleKey, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value))
      window.localStorage.setItem(sampleKey, '1')
    },
    { key: storageKey, sampleKey: sampleSeenStorageKey, value: authValue }
  )
}

function validPortfolioRow(row) {
  return (
    typeof row.property_id === 'string' &&
    typeof row.property_name === 'string' &&
    decimalString(row.total_recoverable) &&
    decimalString(row.total_billed) &&
    decimalString(row.leakage) &&
    (row.recovery_rate === null ||
      (typeof row.recovery_rate === 'number' &&
        Number.isFinite(row.recovery_rate) &&
        row.recovery_rate >= 0))
  )
}

function nonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function decimalString(value) {
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value)
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
  return (
    isCapVeriOrigin(url) ||
    url.includes('supabase.co') ||
    url.includes('posthog.com') ||
    url.includes('sentry.io')
  )
}

function isCapVeriOrigin(url) {
  if (url.startsWith(`${appUrl}/cdn-cgi/rum`)) return false
  return url.startsWith(appUrl) || url.startsWith(apiUrl)
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
