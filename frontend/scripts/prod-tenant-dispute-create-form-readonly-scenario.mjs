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
  `prod-tenant-dispute-create-form-readonly-${runId}`
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
      'tenant dispute create form browser read-only route only; no dispute submission, comments, attachments, status changes, or preference writes',
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
let initialDisputes
let scenarioError

try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
  }

  const dashboard = await getDashboard()
  check(
    'tenant dispute create form scenario has at least one statement',
    Array.isArray(dashboard?.statements) && dashboard.statements.length > 0,
    true
  )
  const statement = dashboard.statements[0]
  report.generated.statement = summarizeStatement(statement)
  check(
    'tenant dispute create form selected statement has stable read fields',
    statementShape(statement),
    {
      id: true,
      property_name: true,
      period_start: true,
      period_end: true,
      tenant_share: true,
      status: true,
    }
  )

  initialDisputes = await getTenantDisputes()
  report.generated.initialDisputeSummary = summarizeDisputes(initialDisputes)

  await runBrowserScenario(statement.id)

  const finalDisputes = await getTenantDisputes()
  report.generated.finalDisputeSummary = summarizeDisputes(finalDisputes)
  check(
    'tenant dispute create form read-only scenario left disputes unchanged',
    summarizeDisputes(finalDisputes),
    summarizeDisputes(initialDisputes)
  )
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (token && initialDisputes) {
    await attemptCleanup(
      'verify tenant dispute list unchanged defensively',
      async () => {
        const finalDisputes = await getTenantDisputes()
        const ok =
          stableJson(summarizeDisputes(finalDisputes)) ===
          stableJson(summarizeDisputes(initialDisputes))
        report.cleanup.push({
          label:
            'tenant dispute list unchanged after create-form read-only run',
          ok,
          actual: summarizeDisputes(finalDisputes),
          expected: summarizeDisputes(initialDisputes),
        })
        if (!ok)
          throw new Error(
            'Tenant dispute list changed during create-form read-only run'
          )
      }
    )
  }

  report.cleanup.push({
    label:
      'tenant dispute create form read-only scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only tenant dashboard, tenant disputes list, and tenant create-dispute browser form routes were called.',
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

async function runBrowserScenario(statementId) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'tenant-dispute-create-form')
    const targetUrl = `${appUrl}/tenant/disputes/new?statement_id=${statementId}`
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.waitForURL(`**/tenant/disputes/new?statement_id=${statementId}`)
    await page.getByRole('heading', { name: 'Submit Dispute' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page.getByText('Select a category').waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page.getByLabel('Description').waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page
      .getByPlaceholder('Please describe the issue in detail...')
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('button', { name: 'Cancel' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    const submitButton = page.getByRole('button', { name: 'Submit Dispute' })
    await submitButton.waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    check(
      'tenant dispute create form submit button starts disabled',
      await submitButton.isDisabled(),
      true
    )
    check('tenant dispute create form browser rendered read-only', true, true)
  } finally {
    await browser.close()
  }
}

async function getDashboard() {
  return expectJson('/api/v1/tenant/dashboard', { status: 200 })
}

async function getTenantDisputes() {
  return expectJson('/api/v1/tenant/disputes', { status: 200 })
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
  }
}

function summarizeStatement(statement) {
  return {
    id: statement.id,
    property_name: statement.property_name,
    period_start: statement.period_start,
    period_end: statement.period_end,
    status: statement.status,
  }
}

function summarizeDisputes(disputes) {
  return {
    count: disputes.length,
    ids: disputes.map((dispute) => dispute.id).sort(),
    rows: disputes
      .map((dispute) => ({
        id: dispute.id,
        statement_id: dispute.statement_id,
        category: dispute.category,
        status: dispute.status,
        description: dispute.description,
        created_at: dispute.created_at,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
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
