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

const preferenceKeys = [
  'new_statement_emails',
  'dispute_update_emails',
  'reminder_emails',
  'marketing_emails',
]

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const appUrl = trimSlash(env.E2E_PROD_APP_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-tenant-preferences-browser-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl, app_url: appUrl },
  generated: {
    tenantPreferencesRestoredExpected: true,
    preferenceKeys,
    persistentIdsCreated: [],
  },
  auth: {},
  checks: [],
  browser: {
    browser_errors: [],
    failed_responses: [],
    mutating_requests: [],
    unexpected_mutating_requests: [],
    ignored_mutating_requests: [],
  },
  cleanup: [],
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

  const initialProbe = await assertPersistedPreferenceRow()
  initialPreferences = pickPreferences(initialProbe)
  report.generated.initialPreferences = initialPreferences
  report.generated.initialUpdatedAt = initialProbe.updated_at ?? null
  const toggledPreferences = invertPreferences(initialPreferences)
  report.generated.toggledPreferences = toggledPreferences

  await runBrowserScenario({ initialPreferences, toggledPreferences })
  await restorePreferences(initialPreferences)
  await verifyRestoredInBrowser(initialPreferences)
  const finalPreferences = pickPreferences(await getPreferences())
  report.generated.finalPreferences = finalPreferences
  check(
    'tenant preferences restored by final API read',
    finalPreferences,
    initialPreferences
  )
} finally {
  if (token && initialPreferences) {
    await attemptCleanup(
      'final defensive tenant preference restore',
      async () => {
        await putPreferences(initialPreferences)
        const restored = pickPreferences(await getPreferences())
        const ok = stableJson(restored) === stableJson(initialPreferences)
        report.cleanup.push({
          label: 'defensive tenant preference restore verified',
          ok,
          actual: restored,
          expected: initialPreferences,
        })
        if (!ok) throw new Error('Tenant preferences were not restored')
      }
    )
  }

  const restoredExpected =
    initialPreferences &&
    stableJson(initialPreferences) ===
      stableJson(report.generated.finalPreferences)
  report.ok =
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.unexpected_mutating_requests.length === 0 &&
    browserMutationsMatchExpected() &&
    restoredExpected

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runBrowserScenario({ initialPreferences, toggledPreferences }) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'tenant-preferences')
    await page.goto(`${appUrl}/tenant/preferences`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.getByRole('heading', { name: 'Email Preferences' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })

    for (const key of preferenceKeys) {
      await expectSwitchState(page, key, initialPreferences[key])
    }
    check(
      'tenant preferences initial UI state matches API',
      await readSwitches(page),
      initialPreferences
    )

    for (const key of preferenceKeys) {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/tenant/notifications/preferences') &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
        { timeout: 15_000 }
      )
      await page.locator(`#${key}`).click()
      await responsePromise
      await waitForPreference(page, key, toggledPreferences[key])
    }

    const afterToggle = pickPreferences(await getPreferences())
    check(
      'tenant preferences toggled state persisted via API',
      afterToggle,
      toggledPreferences
    )
    check(
      'tenant preferences toggled UI state matches API',
      await readSwitches(page),
      toggledPreferences
    )
  } finally {
    await browser.close()
  }
}

async function verifyRestoredInBrowser(expected) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)
    const page = await newTrackedPage(context, 'tenant-preferences-restored')
    await page.goto(`${appUrl}/tenant/preferences`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.getByRole('heading', { name: 'Email Preferences' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    check(
      'tenant preferences restored UI state matches original',
      await readSwitches(page),
      expected
    )
  } finally {
    await browser.close()
  }
}

async function restorePreferences(expected) {
  const restored = pickPreferences(await putPreferences(expected))
  report.cleanup.push({
    label: 'tenant preferences restored through API',
    ok: stableJson(restored) === stableJson(expected),
    actual: restored,
    expected,
  })
  check(
    'tenant preferences restore PUT returned original state',
    restored,
    expected
  )
}

async function assertPersistedPreferenceRow() {
  const first = await getPreferences()
  await sleep(1200)
  const second = await getPreferences()
  const firstTimestamp = first?.updated_at ?? null
  const secondTimestamp = second?.updated_at ?? null
  const persisted =
    typeof firstTimestamp === 'string' &&
    firstTimestamp !== '' &&
    firstTimestamp === secondTimestamp
  check(
    'tenant preferences row existed before mutation',
    {
      persisted,
      first_updated_at: firstTimestamp,
      second_updated_at: secondTimestamp,
    },
    {
      persisted: true,
      first_updated_at: firstTimestamp,
      second_updated_at: firstTimestamp,
    }
  )
  if (!persisted) {
    throw new Error(
      [
        'Tenant preference row does not appear to exist before mutation.',
        'Refusing to run because the public API cannot delete a newly inserted tenant_email_preferences row.',
      ].join(' ')
    )
  }
  return first
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    if (!isCapVeriOrigin(url) || ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return
    }
    if (isIgnoredBrowserMutation(url)) {
      report.browser.ignored_mutating_requests.push({
        method,
        url: redactSensitiveUrl(url),
      })
      return
    }
    const item = { method, url: redactSensitiveUrl(url) }
    report.browser.mutating_requests.push(item)
    if (
      method !== 'PUT' ||
      !url.includes('/api/v1/tenant/notifications/preferences')
    ) {
      report.browser.unexpected_mutating_requests.push(item)
    }
  })
  context.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (status >= 400 && isCapVeriOrigin(url)) {
      report.browser.failed_responses.push({
        status,
        url: redactSensitiveUrl(url),
      })
    }
  })
}

async function newTrackedPage(context, label) {
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    report.browser.browser_errors.push({ label, message: errorMessage(error) })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browser.browser_errors.push({
        label,
        message: message.text().slice(0, 500),
      })
    }
  })
  return page
}

async function readSwitches(page) {
  const entries = []
  for (const key of preferenceKeys) {
    entries.push([key, await switchChecked(page, key)])
  }
  return Object.fromEntries(entries)
}

async function expectSwitchState(page, key, expected) {
  const actual = await switchChecked(page, key)
  check(`switch ${key} state`, { [key]: actual }, { [key]: expected })
}

async function waitForPreference(page, key, expected) {
  const started = Date.now()
  let actual = await switchChecked(page, key)
  while (Date.now() - started < 10_000) {
    const apiPreferences = pickPreferences(await getPreferences())
    actual = apiPreferences[key]
    if (actual === expected) {
      await page.waitForFunction(
        ({ selector, checked }) =>
          document.querySelector(selector)?.getAttribute('aria-checked') ===
          String(checked),
        { selector: `#${key}`, checked: expected },
        { timeout: 10_000 }
      )
      check(
        `switch ${key} persisted state`,
        { [key]: expected },
        { [key]: expected }
      )
      return
    }
    await sleep(500)
  }
  check(`switch ${key} persisted state`, { [key]: actual }, { [key]: expected })
}

async function switchChecked(page, key) {
  const value = await page.locator(`#${key}`).getAttribute('aria-checked')
  if (value !== 'true' && value !== 'false') {
    throw new Error(`Switch ${key} missing aria-checked value: ${value}`)
  }
  return value === 'true'
}

async function getPreferences() {
  return expectJson('/api/v1/tenant/notifications/preferences', { status: 200 })
}

async function putPreferences(body) {
  return expectJson('/api/v1/tenant/notifications/preferences', {
    method: 'PUT',
    status: 200,
    body,
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

async function attemptCleanup(label, operation) {
  try {
    await operation()
  } catch (error) {
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

function browserMutationsMatchExpected() {
  return (
    report.browser.mutating_requests.length === preferenceKeys.length &&
    report.browser.mutating_requests.every(
      (request) =>
        request.method === 'PUT' &&
        request.url.includes('/api/v1/tenant/notifications/preferences')
    )
  )
}

function invertPreferences(prefs) {
  return Object.fromEntries(
    preferenceKeys.map((key) => [key, !Boolean(prefs[key])])
  )
}

function pickPreferences(prefs) {
  return Object.fromEntries(
    preferenceKeys.map((key) => [key, Boolean(prefs?.[key])])
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

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}
