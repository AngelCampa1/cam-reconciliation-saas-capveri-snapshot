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
  'E2E_PROD_TENANT_EMAIL',
  'E2E_PROD_TENANT_PASSWORD',
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
  `prod-tenant-dashboard-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl, app_url: appUrl },
  generated: {
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
    tenantPreferencesRestoredExpected: true,
  },
  auth: {},
  checks: [],
  cleanup: [],
  guarded_endpoint_requests: [],
  mutating_requests: [],
  failed_responses: [],
  browser_errors: [],
  browser: {
    browser_errors: [],
    failed_responses: [],
    mutating_requests: [],
    unexpected_mutating_requests: [],
    ignored_mutating_requests: [],
  },
}

let token
let session
let initialPreferences

try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
  }

  initialPreferences = pickPreferences(await getPreferences())
  report.generated.initialPreferences = initialPreferences
  report.generated.finalPreferences = initialPreferences

  const dashboard = await getDashboard()
  report.generated.dashboardSummary = summarizeDashboard(dashboard)
  check(
    'tenant dashboard response schema is stable',
    dashboardShape(dashboard),
    {
      leases: true,
      statements: true,
      unread_notifications: true,
    }
  )
  check(
    'tenant dashboard lease rows have required read fields',
    dashboard.leases.map(leaseShape),
    dashboard.leases.map(() => ({
      id: true,
      property: true,
      start_date: true,
      end_date: true,
      pro_rata_share: true,
    }))
  )
  check(
    'tenant dashboard statement rows have required read fields',
    dashboard.statements.map(statementShape),
    dashboard.statements.map(() => ({
      id: true,
      property_name: true,
      period_start: true,
      period_end: true,
      tenant_share: true,
      status: true,
      pdf_url_shape: true,
    }))
  )

  const allNotifications = await getNotifications('')
  const unreadNotifications = await getNotifications('?unread_only=true')
  report.generated.notificationSummary = {
    all_count: allNotifications.length,
    unread_count: unreadNotifications.length,
    dashboard_unread_count: dashboard.unread_notifications,
  }
  check(
    'tenant unread notification count matches unread list length',
    dashboard.unread_notifications,
    unreadNotifications.length
  )
  check(
    'tenant unread notifications are a subset of all notifications',
    unreadNotifications.every((notification) =>
      allNotifications.some((row) => row.id === notification.id)
    ),
    true
  )

  await runBrowserDashboard()

  const finalPreferences = pickPreferences(await getPreferences())
  report.generated.finalPreferences = finalPreferences
  check(
    'tenant dashboard read-only scenario left preferences unchanged',
    finalPreferences,
    initialPreferences
  )
} finally {
  if (token && initialPreferences) {
    await attemptCleanup(
      'verify tenant preferences unchanged defensively',
      async () => {
        const finalPreferences = pickPreferences(await getPreferences())
        const ok =
          stableJson(finalPreferences) === stableJson(initialPreferences)
        report.cleanup.push({
          label: 'tenant preferences unchanged after read-only dashboard',
          ok,
          actual: finalPreferences,
          expected: initialPreferences,
        })
        if (!ok)
          throw new Error('Tenant preferences changed during read-only run')
      }
    )
  }

  report.ok =
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.guarded_endpoint_requests.length === 0 &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.unexpected_mutating_requests.length === 0 &&
    report.browser.mutating_requests.length === 0 &&
    stableJson(report.generated.initialPreferences) ===
      stableJson(report.generated.finalPreferences)

  report.mutating_requests = report.browser.mutating_requests
  report.failed_responses = report.browser.failed_responses
  report.browser_errors = report.browser.browser_errors

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runBrowserDashboard() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'tenant-dashboard')
    const dashboardResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/tenant/dashboard') &&
        response.request().method() === 'GET' &&
        response.status() === 200,
      { timeout: 20_000 }
    )
    await page.goto(`${appUrl}/tenant/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await dashboardResponse
    await page.getByRole('heading', { name: 'Tenant Dashboard' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page.getByRole('heading', { name: 'Your Leases' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page
      .getByRole('heading', { name: 'CAM Reconciliation Statements' })
      .waitFor({ state: 'visible', timeout: 20_000 })
    check('tenant dashboard browser rendered core sections', true, true)
  } finally {
    await browser.close()
  }
}

async function getDashboard() {
  return expectJson('/api/v1/tenant/dashboard', { status: 200 })
}

async function getNotifications(query) {
  return expectJson(`/api/v1/tenant/notifications${query}`, { status: 200 })
}

async function getPreferences() {
  return expectJson('/api/v1/tenant/notifications/preferences', {
    status: 200,
  })
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
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        email: env.E2E_PROD_TENANT_EMAIL,
        password: env.E2E_PROD_TENANT_PASSWORD,
      }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(
      `Supabase tenant password auth failed: ${JSON.stringify(json)}`
    )
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

function attachContextGuards(context) {
  context.on('page', (page) => attachPageGuards(page))
  context.on('request', (request) => {
    if (!isCapVeriOrigin(request.url())) return
    const method = request.method().toUpperCase()
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return
    const entry = { method, url: redactSensitiveUrl(request.url()) }
    if (isIgnoredBrowserMutation(request.url())) {
      report.browser.ignored_mutating_requests.push(entry)
      return
    }
    report.browser.mutating_requests.push(entry)
    report.browser.unexpected_mutating_requests.push(entry)
  })
  context.on('response', (response) => {
    if (!isCapVeriOrigin(response.url())) return
    if (response.status() >= 400) {
      report.browser.failed_responses.push({
        status: response.status(),
        method: response.request().method(),
        url: redactSensitiveUrl(response.url()),
      })
    }
  })
}

async function newTrackedPage(context, label) {
  const page = await context.newPage()
  attachPageGuards(page, label)
  return page
}

function attachPageGuards(page, label = 'page') {
  page.on('pageerror', (error) => {
    if (isIgnoredBrowserError(errorMessage(error))) return
    report.browser.browser_errors.push({ label, error: errorMessage(error) })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (isIgnoredBrowserError(message.text())) return
      report.browser.browser_errors.push({
        label,
        error: message.text(),
      })
    }
  })
}

async function attemptCleanup(label, operation) {
  try {
    await operation()
  } catch (error) {
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

function dashboardShape(dashboard) {
  return {
    leases: Array.isArray(dashboard?.leases),
    statements: Array.isArray(dashboard?.statements),
    unread_notifications:
      Number.isInteger(dashboard?.unread_notifications) &&
      dashboard.unread_notifications >= 0,
  }
}

function leaseShape(lease) {
  return {
    id: isUuid(lease?.id),
    property:
      isUuid(lease?.property?.id) &&
      isNonEmptyString(lease?.property?.name) &&
      isNonEmptyString(lease?.property?.address),
    start_date: isIsoDate(lease?.start_date),
    end_date: isIsoDate(lease?.end_date),
    pro_rata_share: isDecimalString(lease?.pro_rata_share),
  }
}

function statementShape(statement) {
  return {
    id: isUuid(statement?.id),
    property_name: isNonEmptyString(statement?.property_name),
    period_start: isIsoDate(statement?.period_start),
    period_end: isIsoDate(statement?.period_end),
    tenant_share: isDecimalString(statement?.tenant_share),
    status: ['pending', 'paid', 'disputed', 'overdue'].includes(
      statement?.status
    ),
    pdf_url_shape:
      statement?.pdf_url == null ||
      (typeof statement.pdf_url === 'string' &&
        statement.pdf_url.startsWith('/api/v1/')),
  }
}

function summarizeDashboard(dashboard) {
  return {
    lease_count: dashboard.leases.length,
    statement_count: dashboard.statements.length,
    unread_notifications: dashboard.unread_notifications,
    statement_statuses: dashboard.statements.reduce((counts, statement) => {
      counts[statement.status] = (counts[statement.status] ?? 0) + 1
      return counts
    }, {}),
  }
}

function pickPreferences(prefs) {
  return Object.fromEntries(
    [
      'new_statement_emails',
      'dispute_update_emails',
      'reminder_emails',
      'marketing_emails',
    ].map((key) => [key, Boolean(prefs?.[key])])
  )
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

function isIgnoredBrowserError(message) {
  return message.includes(
    "Failed to read the 'localStorage' property from 'Window': Access is denied for this document."
  )
}

function redactSensitiveUrl(value) {
  try {
    const parsed = new URL(value)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|code|key|secret|password|session/i.test(key)) {
        parsed.searchParams.set(key, '[redacted]')
      }
    }
    return parsed.toString()
  } catch {
    return value
  }
}

function stableJson(value) {
  return JSON.stringify(sortJson(value))
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortJson(entry)])
    )
  }
  return value
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  )
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

function isDecimalString(value) {
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
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
