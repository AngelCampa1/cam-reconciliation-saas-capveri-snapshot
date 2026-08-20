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
  `prod-tenant-dispute-detail-readonly-${runId}`
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
      'tenant dispute detail browser/API read-only route only; no dispute creation, comments, attachments, status changes, notification reads, or preference writes',
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
let selectedDisputeId
let initialDisputes
let initialDetail
let scenarioError

try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
  }

  initialDisputes = await getTenantDisputes()
  check(
    'tenant dispute detail read-only scenario has an existing dispute fixture',
    { dispute_count: initialDisputes.length },
    { dispute_count: initialDisputes.length > 0 ? initialDisputes.length : 1 }
  )
  const selectedDispute = [...initialDisputes].sort((a, b) =>
    a.id.localeCompare(b.id)
  )[0]
  selectedDisputeId = selectedDispute.id
  initialDetail = await getTenantDisputeDetail(selectedDisputeId)

  report.generated.selectedDisputeId = selectedDisputeId
  report.generated.initialDisputeSummary = summarizeDispute(selectedDispute)
  report.generated.initialDisputeDetail = summarizeDisputeDetail(initialDetail)
  check(
    'tenant dispute detail matches selected dispute summary',
    {
      id: initialDetail.id,
      statement_id: initialDetail.statement_id,
      category: initialDetail.category,
      status: initialDetail.status,
    },
    {
      id: selectedDispute.id,
      statement_id: selectedDispute.statement_id,
      category: selectedDispute.category,
      status: selectedDispute.status,
    }
  )

  await runBrowserScenario(initialDetail)

  const finalDisputes = await getTenantDisputes()
  const finalDetail = await getTenantDisputeDetail(selectedDisputeId)
  report.generated.finalDisputeSummary = summarizeDisputes(finalDisputes)
  report.generated.finalDisputeDetail = summarizeDisputeDetail(finalDetail)

  check(
    'tenant dispute detail read-only scenario left dispute list unchanged',
    summarizeDisputes(finalDisputes),
    summarizeDisputes(initialDisputes)
  )
  check(
    'tenant dispute detail read-only scenario left dispute detail unchanged',
    summarizeDisputeDetail(finalDetail),
    summarizeDisputeDetail(initialDetail)
  )
} catch (error) {
  scenarioError = error
  report.fatal_error = errorMessage(error)
} finally {
  if (token && selectedDisputeId && initialDisputes && initialDetail) {
    await attemptCleanup('verify tenant dispute detail unchanged', async () => {
      const finalDisputes = await getTenantDisputes()
      const finalDetail = await getTenantDisputeDetail(selectedDisputeId)
      const actual = {
        disputes: summarizeDisputes(finalDisputes),
        detail: summarizeDisputeDetail(finalDetail),
      }
      const expected = {
        disputes: summarizeDisputes(initialDisputes),
        detail: summarizeDisputeDetail(initialDetail),
      }
      const ok = stableJson(actual) === stableJson(expected)
      report.cleanup.push({
        label: 'tenant dispute detail unchanged after browser read-only run',
        ok,
        actual,
        expected,
      })
      if (!ok)
        throw new Error('Tenant dispute detail changed during read-only run')
    })
  }

  report.cleanup.push({
    label: 'tenant dispute detail read-only scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only tenant disputes list/detail API GET routes and tenant dispute detail browser routes were called.',
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

async function runBrowserScenario(disputeDetail) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    await blockReadOnlyBrowserRequests(context)
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'tenant-dispute-detail')
    const detailResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/v1/tenant/disputes/${selectedDisputeId}`) &&
        response.request().method() === 'GET' &&
        response.status() === 200,
      { timeout: 20_000 }
    )
    await page.goto(`${appUrl}/tenant/disputes/${selectedDisputeId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await detailResponse

    await page
      .getByRole('heading', { name: categoryLabel(disputeDetail.category) })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('heading', { name: 'What you disputed' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page.getByRole('heading', { name: 'Discussion' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page.getByText(disputeDetail.description).first().waitFor({
      state: 'visible',
      timeout: 20_000,
    })

    const commentCount = disputeDetail.comments?.length ?? 0
    if (commentCount === 0) {
      await page.getByText('No replies yet.').waitFor({
        state: 'visible',
        timeout: 20_000,
      })
    } else {
      await page
        .getByText(disputeDetail.comments[0].content)
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
    }

    if (['open', 'under_review'].includes(disputeDetail.status)) {
      await page.getByLabel('Add a comment').waitFor({
        state: 'visible',
        timeout: 20_000,
      })
      const postButton = page.getByRole('button', { name: 'Post Comment' })
      await postButton.waitFor({ state: 'visible', timeout: 20_000 })
      check(
        'tenant dispute detail post button stays disabled without comment input',
        await postButton.isDisabled(),
        true
      )
    }

    const attachments = disputeDetail.attachments ?? []
    if (attachments.length > 0) {
      await page.getByRole('heading', { name: 'Attachments' }).waitFor({
        state: 'visible',
        timeout: 20_000,
      })
      await page.getByText(attachments[0].filename).waitFor({
        state: 'visible',
        timeout: 20_000,
      })
    }

    check('tenant dispute detail browser rendered read-only', true, true)
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

async function getTenantDisputes() {
  return expectJson('/api/v1/tenant/disputes', { status: 200 })
}

async function getTenantDisputeDetail(disputeId) {
  return expectJson(`/api/v1/tenant/disputes/${disputeId}`, { status: 200 })
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

function summarizeDisputes(disputes) {
  return {
    count: disputes.length,
    ids: disputes.map((dispute) => dispute.id).sort(),
    rows: disputes
      .map((dispute) => summarizeDispute(dispute))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function summarizeDispute(dispute) {
  return {
    id: dispute.id,
    statement_id: dispute.statement_id,
    category: dispute.category,
    status: dispute.status,
    description: dispute.description,
    created_at: dispute.created_at,
  }
}

function summarizeDisputeDetail(dispute) {
  return {
    id: dispute.id,
    statement_id: dispute.statement_id,
    category: dispute.category,
    status: dispute.status,
    description: dispute.description,
    resolution_summary: dispute.resolution_summary ?? null,
    comments: (dispute.comments ?? []).map((comment) => ({
      id: comment.id,
      content: comment.content,
      author_type: comment.author_type,
      created_at: comment.created_at,
    })),
    attachments: (dispute.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      file_size_bytes: attachment.file_size_bytes,
    })),
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
