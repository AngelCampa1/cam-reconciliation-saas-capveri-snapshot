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
  'E2E_PROD_APP_URL',
  'E2E_PROD_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) {
    throw new Error(`Missing ${key} in ignored E2E env files.`)
  }
}

const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-account-deletion-guard-browser-${runId}`
)
await mkdir(outputDir, { recursive: true })

const appUrl = trimSlash(env.E2E_PROD_APP_URL)
const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const readonlyMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const guardedEndpoint = `${apiUrl}/api/v1/auth/account`

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { app_url: appUrl, api_url: apiUrl },
  generated: {
    write_policy: 'browser-read-only-after-auth',
    write_policy_scope:
      'Uses production Supabase password auth, then permits no CapVeri app/API mutations during the browser scenario.',
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
  },
  auth: {},
  scenario_completed: false,
  checks: [],
  browser_errors: [],
  failed_responses: [],
  mutating_requests: [],
  guarded_endpoint_requests: [],
  screenshots: [],
  cleanup: [],
}

try {
  const session = await signInWithPassword()
  report.auth = {
    ok: true,
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  await runBrowserScenario(session)
  report.scenario_completed = true
  report.cleanup.push({
    label: 'browser-read-only account deletion guard cleanup',
    ok: true,
    body_preview:
      'No persistent IDs were created and no CapVeri browser mutations were observed after authentication.',
  })
} finally {
  report.ok =
    report.scenario_completed &&
    report.checks.every((check) => check.ok) &&
    report.browser_errors.length === 0 &&
    report.failed_responses.length === 0 &&
    report.mutating_requests.length === 0 &&
    report.guarded_endpoint_requests.length === 0

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) {
  process.exitCode = 1
}

async function runBrowserScenario(session) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'account-deletion-guard')
    try {
      const response = await page.goto(`${appUrl}/settings/profile`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      })
      await page.waitForTimeout(1000)

      await expectVisible(page, 'Profile Settings')
      await expectVisible(page, 'Delete Account')
      await expectVisible(page, 'Type DELETE to confirm')
      await expectVisible(page, 'Organization owners')

      const confirmInput = page.locator('#delete-confirm')
      await confirmInput.waitFor({ state: 'visible', timeout: 15_000 })
      const deleteButton = page.getByRole('button', {
        name: /^Delete Account$/u,
      })

      await assertButtonDisabled(deleteButton, 'initial empty confirmation')

      const nonExactInputs = ['delete', 'DELET', 'DELETE ', ' DELETE']
      for (const value of nonExactInputs) {
        await confirmInput.fill('')
        await confirmInput.fill(value)
        await assertButtonDisabled(
          deleteButton,
          `non-exact confirmation ${JSON.stringify(value)}`
        )
      }

      await confirmInput.fill('')
      await assertButtonDisabled(deleteButton, 'cleared confirmation')
      await confirmInput.fill('DELETE')
      await assertButtonEnabled(deleteButton, 'exact confirmation enables only')
      await page.screenshot({
        path: resolve(outputDir, 'account-deletion-exact-confirmation.png'),
        fullPage: true,
      })
      report.screenshots.push('account-deletion-exact-confirmation.png')

      check(
        'account deletion guard page loaded without auth redirect',
        {
          initial_status: response?.status() ?? null,
          final_url: page.url(),
          authenticated: !page.url().includes('/auth/login'),
        },
        {
          initial_status: 200,
          final_url: `${appUrl}/settings/profile`,
          authenticated: true,
        }
      )
      check(
        'account deletion destructive endpoint was never called',
        {
          guarded_endpoint_requests: report.guarded_endpoint_requests.length,
          capveri_mutating_requests: report.mutating_requests.length,
        },
        {
          guarded_endpoint_requests: 0,
          capveri_mutating_requests: 0,
        }
      )
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    if (url === guardedEndpoint) {
      report.guarded_endpoint_requests.push({ method, url })
    }
    if (isCapVeriOrigin(url) && !readonlyMethods.has(method)) {
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
}

async function newTrackedPage(context, label) {
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browser_errors.push({
        label,
        type: 'console',
        text: message.text().slice(0, 500),
      })
    }
  })
  page.on('pageerror', (error) => {
    report.browser_errors.push({
      label,
      type: 'pageerror',
      text: error.message.slice(0, 500),
    })
  })
  return page
}

async function assertButtonDisabled(locator, label) {
  const disabled = await locator.isDisabled()
  check(
    `delete account button disabled for ${label}`,
    { disabled },
    { disabled: true }
  )
}

async function assertButtonEnabled(locator, label) {
  const enabled = await locator.isEnabled()
  check(
    `delete account button enabled for ${label}`,
    { enabled },
    { enabled: true }
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

async function injectSupabaseSession(context, session) {
  const storageKey = `sb-${supabaseRef}-auth-token`
  const storageValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type ?? 'bearer',
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
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
