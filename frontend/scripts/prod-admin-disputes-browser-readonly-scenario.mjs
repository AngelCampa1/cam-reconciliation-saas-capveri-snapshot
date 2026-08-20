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
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-admin-disputes-browser-readonly-${runId}`
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
      'landlord/admin disputes browser/API read-only list route only; no status updates, comments, attachment downloads, demand-letter generation, tenant writes, or preference writes',
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
let initialDisputes
let scenarioError

try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  initialDisputes = await getAdminDisputes('')
  assertDisputeList('initial admin disputes list shape', initialDisputes)
  const openDisputes = await getAdminDisputes('?status=open')
  const underReviewDisputes = await getAdminDisputes('?status=under_review')
  const resolvedDisputes = await getAdminDisputes('?status=resolved')

  report.generated.initialDisputeListSummary =
    summarizeDisputes(initialDisputes)
  report.generated.initialStatusFilterSummary = {
    open: summarizeDisputes(openDisputes),
    under_review: summarizeDisputes(underReviewDisputes),
    resolved: summarizeDisputes(resolvedDisputes),
  }
  check(
    'admin dispute status filters return subsets of all disputes',
    {
      open: idsAreSubset(openDisputes, initialDisputes),
      under_review: idsAreSubset(underReviewDisputes, initialDisputes),
      resolved: idsAreSubset(resolvedDisputes, initialDisputes),
    },
    { open: true, under_review: true, resolved: true }
  )

  await runBrowserScenario(initialDisputes)

  const finalDisputes = await getAdminDisputes('')
  report.generated.finalDisputeListSummary = summarizeDisputes(finalDisputes)
  check(
    'admin disputes browser read-only scenario left dispute list unchanged',
    summarizeDisputes(finalDisputes),
    summarizeDisputes(initialDisputes)
  )
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (token && initialDisputes) {
    await attemptCleanup('verify admin dispute list unchanged', async () => {
      const finalDisputes = await getAdminDisputes('')
      const ok =
        stableJson(summarizeDisputes(finalDisputes)) ===
        stableJson(summarizeDisputes(initialDisputes))
      report.cleanup.push({
        label: 'admin dispute list unchanged after browser read-only run',
        ok,
        actual: summarizeDisputes(finalDisputes),
        expected: summarizeDisputes(initialDisputes),
      })
      if (!ok)
        throw new Error('Admin dispute list changed during read-only run')
    })
  }

  report.cleanup.push({
    label:
      'admin disputes browser read-only scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only landlord/admin disputes list API GET routes and landlord disputes browser list routes were called.',
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

async function runBrowserScenario(disputes) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    await blockReadOnlyBrowserRequests(context)
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'admin-disputes')
    const listResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/disputes') &&
        response.request().method() === 'GET' &&
        response.status() === 200,
      { timeout: 20_000 }
    )
    await page.goto(`${appUrl}/disputes`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await listResponse

    const pageTitle = page.getByTestId('page-header-title')
    await pageTitle.waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    check(
      'admin disputes browser rendered page heading',
      await pageTitle.textContent(),
      'Disputes'
    )
    await page.getByRole('combobox', { name: 'Filter by status' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })

    if (disputes.length === 0) {
      await page.getByText('No disputes yet').waitFor({
        state: 'visible',
        timeout: 20_000,
      })
      await page.getByText('0 total').waitFor({
        state: 'visible',
        timeout: 20_000,
      })
      await page.getByText('0 need response').waitFor({
        state: 'visible',
        timeout: 20_000,
      })
    } else {
      const firstDispute = [...disputes].sort((a, b) =>
        a.id.localeCompare(b.id)
      )[0]
      await page
        .getByRole('button', {
          name: `${categoryLabel(firstDispute.category)} dispute`,
        })
        .waitFor({ state: 'visible', timeout: 20_000 })
      await page.getByText(firstDispute.description).first().waitFor({
        state: 'visible',
        timeout: 20_000,
      })
    }

    check('admin disputes browser rendered read-only list', true, true)
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

async function getAdminDisputes(query) {
  return expectJson(`/api/v1/disputes${query}`, { status: 200 })
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

function assertDisputeList(label, disputes) {
  check(`${label} is an array`, Array.isArray(disputes), true)
  for (const dispute of disputes) {
    check(
      `${label} row shape ${dispute?.id ?? 'unknown'}`,
      {
        id: isUuid(dispute?.id),
        statement_id: isUuid(dispute?.statement_id),
        category: isNonEmptyString(dispute?.category),
        status: isNonEmptyString(dispute?.status),
        created_at: isNonEmptyString(dispute?.created_at),
      },
      {
        id: true,
        statement_id: true,
        category: true,
        status: true,
        created_at: true,
      }
    )
  }
}

function summarizeDisputes(disputes) {
  return {
    count: disputes.length,
    ids: disputes.map((dispute) => dispute.id).sort(),
    statuses: disputes.reduce((counts, dispute) => {
      counts[dispute.status] = (counts[dispute.status] ?? 0) + 1
      return counts
    }, {}),
  }
}

function idsAreSubset(candidateRows, allRows) {
  const allIds = new Set(allRows.map((row) => row.id))
  return candidateRows.every((row) => allIds.has(row.id))
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

function categoryLabel(category) {
  const labels = {
    billing_question: 'Billing question',
    calculation_error: 'Calculation error',
    lease_interpretation: 'Lease interpretation',
    missing_documentation: 'Missing documentation',
    other: 'Other',
  }
  return labels[category] ?? category
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
