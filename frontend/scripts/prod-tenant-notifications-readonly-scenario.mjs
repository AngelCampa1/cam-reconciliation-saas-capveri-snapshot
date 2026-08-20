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
  `prod-tenant-notifications-readonly-${runId}`
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
    write_policy:
      'tenant notifications browser/API read-only route only; no notification mark-read, mark-all-read, preference writes, dispute writes, or navigation clicks',
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
    blocked_analytics_requests: [],
  },
}

let token
let session
let initialNotifications
let initialDashboardSummary
let scenarioError

try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
  }

  const initialDashboard = await getDashboard()
  initialDashboardSummary = summarizeDashboard(initialDashboard)
  initialNotifications = await getNotifications('')
  const initialUnreadNotifications = await getNotifications('?unread_only=true')

  report.generated.initialDashboardSummary = initialDashboardSummary
  report.generated.initialNotificationSummary =
    summarizeNotifications(initialNotifications)
  report.generated.initialUnreadNotificationSummary = summarizeNotifications(
    initialUnreadNotifications
  )

  check(
    'tenant unread notifications are a subset of all notifications',
    initialUnreadNotifications.every((notification) =>
      initialNotifications.some((row) => row.id === notification.id)
    ),
    true
  )
  check(
    'tenant dashboard unread count matches unread notification list',
    initialDashboard.unread_notifications,
    initialUnreadNotifications.length
  )
  check(
    'tenant notifications have stable read fields',
    initialNotifications.map(notificationShape),
    initialNotifications.map(() => ({
      id: true,
      notification_type: true,
      title: true,
      message: true,
      link_url: true,
      read_at: true,
      created_at: true,
    }))
  )

  await runBrowserScenario(initialNotifications)

  const finalDashboard = await getDashboard()
  const finalNotifications = await getNotifications('')
  const finalUnreadNotifications = await getNotifications('?unread_only=true')

  report.generated.finalDashboardSummary = summarizeDashboard(finalDashboard)
  report.generated.finalNotificationSummary =
    summarizeNotifications(finalNotifications)
  report.generated.finalUnreadNotificationSummary = summarizeNotifications(
    finalUnreadNotifications
  )

  check(
    'tenant notifications read-only scenario left dashboard unread count unchanged',
    summarizeDashboard(finalDashboard),
    initialDashboardSummary
  )
  check(
    'tenant notifications read-only scenario left notifications unchanged',
    summarizeNotifications(finalNotifications),
    summarizeNotifications(initialNotifications)
  )
  check(
    'tenant notifications read-only scenario left unread list unchanged',
    summarizeNotifications(finalUnreadNotifications),
    summarizeNotifications(initialUnreadNotifications)
  )
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (token && initialNotifications && initialDashboardSummary) {
    await attemptCleanup(
      'verify tenant notifications unchanged defensively',
      async () => {
        const finalDashboard = await getDashboard()
        const finalNotifications = await getNotifications('')
        const ok =
          stableJson(summarizeDashboard(finalDashboard)) ===
            stableJson(initialDashboardSummary) &&
          stableJson(summarizeNotifications(finalNotifications)) ===
            stableJson(summarizeNotifications(initialNotifications))
        report.cleanup.push({
          label: 'tenant notifications unchanged after read-only run',
          ok,
          actual: {
            dashboard: summarizeDashboard(finalDashboard),
            notifications: summarizeNotifications(finalNotifications),
          },
          expected: {
            dashboard: initialDashboardSummary,
            notifications: summarizeNotifications(initialNotifications),
          },
        })
        if (!ok)
          throw new Error(
            'Tenant notifications changed during read-only notification run'
          )
      }
    )
  }

  report.cleanup.push({
    label: 'tenant notifications read-only scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only tenant dashboard, tenant notifications list, unread notifications list, and tenant notifications browser routes were called.',
  })

  report.ok =
    !scenarioError &&
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.guarded_endpoint_requests.length === 0 &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.unexpected_mutating_requests.length === 0 &&
    report.browser.mutating_requests.length === 0 &&
    report.generated.persistentIdsCreated.length === 0

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
if (scenarioError) throw scenarioError

async function runBrowserScenario(notifications) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    await blockReadOnlyBrowserRequests(context)
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'tenant-notifications')
    const notificationsResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/tenant/notifications') &&
        !response.url().includes('/preferences') &&
        response.request().method() === 'GET' &&
        response.status() === 200,
      { timeout: 20_000 }
    )
    await page.goto(`${appUrl}/tenant/notifications`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await notificationsResponse
    await page.getByTestId('page-header-title').waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    check(
      'tenant notifications browser rendered page heading',
      await page.getByTestId('page-header-title').textContent(),
      'Notifications'
    )

    if (notifications.length === 0) {
      await page
        .getByRole('heading', { name: 'No notifications yet' })
        .waitFor({
          state: 'visible',
          timeout: 20_000,
        })
    } else {
      const firstNotification = notifications[0]
      await page.getByText(firstNotification.title).first().waitFor({
        state: 'visible',
        timeout: 20_000,
      })
      await page.getByText(firstNotification.message).first().waitFor({
        state: 'visible',
        timeout: 20_000,
      })
      const unreadCount = notifications.filter(
        (notification) => !notification.read_at
      ).length
      if (unreadCount > 0) {
        await page.getByText(`${unreadCount} unread`).waitFor({
          state: 'visible',
          timeout: 20_000,
        })
        await page.getByRole('button', { name: /mark all read/i }).waitFor({
          state: 'visible',
          timeout: 20_000,
        })
      }
    }

    check('tenant notifications browser rendered read-only', true, true)
  } finally {
    await browser.close()
  }
}

async function blockReadOnlyBrowserRequests(context) {
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    if (isAnalyticsUrl(url)) {
      report.browser.blocked_analytics_requests.push({
        method: request.method(),
        url: redactSensitiveUrl(url),
      })
      await route.abort('blockedbyclient')
      return
    }
    if (isUnexpectedBrowserMutation(request)) {
      const entry = {
        method: request.method().toUpperCase(),
        url: redactSensitiveUrl(url),
      }
      report.browser.mutating_requests.push(entry)
      report.browser.unexpected_mutating_requests.push(entry)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
}

async function getDashboard() {
  return expectJson('/api/v1/tenant/dashboard', { status: 200 })
}

async function getNotifications(query) {
  return expectJson(`/api/v1/tenant/notifications${query}`, { status: 200 })
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
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

function isUnexpectedBrowserMutation(request) {
  const url = request.url()
  if (!isCapVeriOrigin(url)) return false
  const method = request.method().toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false
  const entry = { method, url: redactSensitiveUrl(url) }
  if (isIgnoredBrowserMutation(url)) {
    report.browser.ignored_mutating_requests.push(entry)
    return false
  }
  return true
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

function summarizeDashboard(dashboard) {
  return {
    unread_notifications: dashboard.unread_notifications,
  }
}

function summarizeNotifications(notifications) {
  return {
    count: notifications.length,
    ids: notifications.map((notification) => notification.id).sort(),
    unread_count: notifications.filter((notification) => !notification.read_at)
      .length,
    rows: notifications
      .map((notification) => ({
        id: notification.id,
        notification_type: notification.notification_type,
        title: notification.title,
        message: notification.message,
        link_url: notification.link_url,
        related_entity_id: notification.related_entity_id,
        read_at: notification.read_at,
        created_at: notification.created_at,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function notificationShape(notification) {
  return {
    id: isUuid(notification?.id),
    notification_type: [
      'new_statement',
      'dispute_update',
      'statement_reminder',
      'system',
    ].includes(notification?.notification_type),
    title: isNonEmptyString(notification?.title),
    message: isNonEmptyString(notification?.message),
    link_url:
      notification?.link_url == null ||
      typeof notification.link_url === 'string',
    read_at:
      notification?.read_at == null || isIsoTimestamp(notification.read_at),
    created_at: isIsoTimestamp(notification?.created_at),
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

function isAnalyticsUrl(url) {
  try {
    const hostname = new URL(url).hostname
    return (
      hostname === 'posthog.com' ||
      hostname.endsWith('.posthog.com') ||
      hostname.endsWith('.i.posthog.com') ||
      hostname.endsWith('-assets.i.posthog.com')
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

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
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

function isIsoTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/u.test(value)
  )
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
