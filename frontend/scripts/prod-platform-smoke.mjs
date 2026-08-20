import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const repoRoot = resolve(frontendRoot, '..')

const env = {
  ...(await readEnv(resolve(repoRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.local'))),
  ...(await readEnv(resolve(frontendRoot, '.env.production.local'))),
}

const required = [
  'E2E_PROD_EMAIL',
  'E2E_PROD_PASSWORD',
  'E2E_PROD_APP_URL',
  'E2E_PROD_MARKETING_URL',
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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-platform-smoke-${runId}`)
await mkdir(outputDir, { recursive: true })

const appUrl = trimSlash(env.E2E_PROD_APP_URL)
const marketingUrl = trimSlash(env.E2E_PROD_MARKETING_URL)
const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { app_url: appUrl, marketing_url: marketingUrl, api_url: apiUrl },
  auth: {},
  checks: [],
  api: [],
  marketing: [],
  app: [],
  browser_errors: [],
  failed_responses: [],
}
let cachedAccessToken = null

try {
  const session = await signInWithPassword({
    supabaseUrl,
    supabaseAnonKey,
    email: env.E2E_PROD_EMAIL,
    password: env.E2E_PROD_PASSWORD,
  })
  cachedAccessToken = session.access_token
  report.auth = {
    ok: true,
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  await checkApi('/health', { auth: false, expectStatus: 200 })
  await checkApi('/api/v1/ai-cs/sign', {
    auth: true,
    method: 'POST',
    expectStatus: 200,
    captureBody: false,
    body: {
      method: 'POST',
      path: '/v1/sessions',
      body: { appId: 'capveri', userId: session.user.id },
    },
  })
  await checkApi('/api/v1/properties', { auth: true, expectStatus: 200 })

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    context.on('response', (response) => {
      const url = response.url()
      const status = response.status()
      if (status >= 400 && isRelevantFailure(url)) {
        report.failed_responses.push({ status, url })
      }
    })

    await checkMarketing(context, '/', 'marketing-home')
    await checkMarketing(context, '/pricing', 'marketing-pricing')
    await checkMarketing(context, '/resources', 'marketing-resources')
    await checkMarketing(context, '/tools', 'marketing-tools')

    await injectSupabaseSession(context, session)
    await checkApp(context, '/dashboard', 'app-dashboard', {
      forbiddenPathIncludes: ['/auth/login'],
      expectedFinalPath: '/dashboard',
    })
    await checkApp(context, '/properties', 'app-properties', {
      forbiddenPathIncludes: ['/auth/login'],
      expectedFinalPath: '/properties',
    })
    await checkApp(context, '/reconciliations', 'app-reconciliations', {
      forbiddenPathIncludes: ['/auth/login'],
      expectedFinalPath: '/reconciliations',
    })
    await checkApp(context, '/leases/upload', 'app-lease-upload', {
      forbiddenPathIncludes: ['/auth/login'],
      expectedFinalPath: '/leases/upload',
    })
    await checkApp(context, '/settings/billing', 'app-billing', {
      forbiddenPathIncludes: ['/auth/login'],
      expectedFinalPath: '/settings/billing',
    })
  } finally {
    await browser.close()
  }

  const hardFailures = [
    ...report.checks.filter((item) => !item.ok),
    ...report.api.filter((item) => !item.ok),
    ...report.marketing.filter((item) => !item.ok),
    ...report.app.filter((item) => !item.ok),
    ...report.browser_errors,
    ...report.failed_responses,
  ]
  report.ok = hardFailures.length === 0
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) {
  process.exitCode = 1
}

async function checkApi(path, options) {
  const headers = { accept: 'application/json' }
  let body
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (options.auth) {
    headers.authorization = `Bearer ${await currentAccessToken()}`
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  })
  const text = await response.text()
  const item = {
    path,
    status: response.status,
    ok: response.status === options.expectStatus,
    body_preview:
      options.captureBody === false ? '[redacted]' : text.slice(0, 500),
    body_redacted: options.captureBody === false,
  }
  report.api.push(item)
  check(
    `API ${path} returned expected status`,
    {
      path,
      status: response.status,
    },
    {
      path,
      status: options.expectStatus,
    }
  )
  return item
}

async function currentAccessToken() {
  if (!cachedAccessToken) {
    const session = await signInWithPassword({
      supabaseUrl,
      supabaseAnonKey,
      email: env.E2E_PROD_EMAIL,
      password: env.E2E_PROD_PASSWORD,
    })
    cachedAccessToken = session.access_token
  }
  return cachedAccessToken
}

async function checkMarketing(context, path, label) {
  const page = await context.newPage()
  attachPageErrors(page, label)
  const url = `${marketingUrl}${path}`
  const item = { label, path, url, ok: false }
  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 45_000,
    })
    item.status = response?.status() ?? null
    item.final_url = page.url()
    item.title = await page.title()
    item.ok = !!response && response.status() < 400
    await page.screenshot({ path: resolve(outputDir, `${label}.png`) })
  } catch (error) {
    item.error = errorMessage(error)
  } finally {
    report.marketing.push(item)
    check(
      `${label} loaded`,
      {
        path: item.path,
        status_lt_400: typeof item.status === 'number' && item.status < 400,
      },
      {
        path,
        status_lt_400: true,
      }
    )
    await page.close()
  }
}

async function checkApp(context, path, label, options) {
  const page = await context.newPage()
  attachPageErrors(page, label)
  const url = `${appUrl}${path}`
  const item = { label, path, url, ok: false }
  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.waitForTimeout(1000)
    item.status = response?.status() ?? null
    item.final_url = page.url()
    item.final_path = safePathname(item.final_url)
    item.title = await page.title()
    item.h1 = await firstVisibleText(page, 'h1')
    item.ok =
      !!response &&
      response.status() < 400 &&
      !options.forbiddenPathIncludes.some((part) =>
        page.url().includes(part)
      ) &&
      (!options.expectedFinalPath ||
        item.final_path === options.expectedFinalPath)
    await page.screenshot({ path: resolve(outputDir, `${label}.png`) })
  } catch (error) {
    item.error = errorMessage(error)
  } finally {
    report.app.push(item)
    check(
      `${label} reached expected authenticated route`,
      {
        requested_path: path,
        final_path: item.final_path ?? null,
        status_lt_400: typeof item.status === 'number' && item.status < 400,
        login_redirected: Boolean(
          item.final_url &&
          options.forbiddenPathIncludes.some((part) =>
            item.final_url.includes(part)
          )
        ),
      },
      {
        requested_path: path,
        final_path: options.expectedFinalPath,
        status_lt_400: true,
        login_redirected: false,
      }
    )
    await page.close()
  }
}

async function injectSupabaseSession(context, session) {
  const storageKey = `sb-${supabaseRef}-auth-token`
  const sampleSeenStorageKey = `capveri_onboarding_sample_result_seen:${session.user.id}`
  const storageValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type ?? 'bearer',
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  })
  await context.addInitScript(
    ({ key, sampleKey, value }) => {
      localStorage.setItem(key, value)
      localStorage.setItem(sampleKey, '1')
    },
    { key: storageKey, sampleKey: sampleSeenStorageKey, value: storageValue }
  )
}

async function signInWithPassword(input) {
  const response = await fetch(
    `${input.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: input.supabaseAnonKey,
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  return json
}

function attachPageErrors(page, label) {
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
}

async function firstVisibleText(page, selector) {
  const locator = page.locator(selector).first()
  if ((await locator.count()) === 0) return null
  try {
    return (await locator.innerText({ timeout: 3000 })).trim()
  } catch {
    return null
  }
}

function isRelevantFailure(url) {
  if (url.includes('posthog.com')) return false
  if (url.includes('sentry.io')) return false
  if (url.includes('cdn.')) return false
  return (
    url.startsWith(appUrl) ||
    url.startsWith(apiUrl) ||
    url.startsWith(marketingUrl) ||
    url.includes('workers.dev')
  )
}

async function readEnv(path) {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = {}
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmed)
      if (!match) continue
      parsed[match[1]] = unquote(match[2].trim())
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

function safePathname(value) {
  try {
    return new URL(value).pathname
  } catch {
    return null
  }
}

function check(label, actual, expected) {
  report.checks.push({
    label,
    ok: deepEqual(actual, expected),
    actual,
    expected,
  })
}

function deepEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
