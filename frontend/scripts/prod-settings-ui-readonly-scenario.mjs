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
  `prod-settings-ui-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const appUrl = trimSlash(env.E2E_PROD_APP_URL)
const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const supabaseRef = new URL(supabaseUrl).hostname.split('.')[0]
const readonlyMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { app_url: appUrl, api_url: apiUrl },
  generated: {
    write_policy: 'read-only',
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
  },
  auth: {},
  scenario_completed: false,
  app: [],
  checks: [],
  browser_errors: [],
  failed_responses: [],
  mutating_requests: [],
  interactions: [],
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
    label: 'read-only settings UI cleanup',
    ok: true,
    body_preview: 'No persistent IDs were created by this scenario.',
  })
} finally {
  report.checks.push({
    label: 'settings UI required interactions completed',
    ok: requiredInteractionsPassed(),
    actual: {
      required_interactions_passed: requiredInteractionsPassed(),
      interactions: report.interactions,
    },
    expected: {
      required_interactions_passed: true,
    },
  })
  report.ok =
    report.scenario_completed &&
    report.app.every((item) => item.ok) &&
    report.checks.every((check) => check.ok) &&
    report.browser_errors.length === 0 &&
    report.failed_responses.length === 0 &&
    report.mutating_requests.length === 0

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) {
  process.exitCode = 1
}

function requiredInteractionsPassed() {
  const inviteDialog = report.interactions.find(
    (item) => item.label === 'settings-team-invite-dialog'
  )
  const invoiceFilter = report.interactions.find(
    (item) => item.label === 'settings-invoices-status-filter'
  )
  return (
    report.interactions.every((item) => !item.error && !item.skipped_reason) &&
    inviteDialog?.attempted === true &&
    inviteDialog.opened === true &&
    inviteDialog.closed === true &&
    invoiceFilter?.attempted === true &&
    invoiceFilter.changed_to_paid === true &&
    invoiceFilter.restored_to_all === true
  )
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

    await checkSettingsPage(context, '/settings/profile', 'settings-profile', [
      'Profile Settings',
      'Profile Information',
      'Email',
    ])
    await checkSettingsPage(context, '/settings/team', 'settings-team', [
      'Team Members',
      ['Current Members', 'Admins only'],
      ['Pending Invitations', 'Only organization administrators'],
    ])
    await openAndCloseInviteDialogIfPresent(context)
    await checkSettingsPage(
      context,
      '/settings/billing/invoices',
      'settings-invoices',
      [
        'Invoices',
        'View and download your billing history.',
        ['All Statuses', 'No invoices', 'Status'],
      ]
    )
    await exerciseInvoiceStatusFilterIfPresent(context)
  } finally {
    await browser.close()
  }
}

function attachContextGuards(context) {
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
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

async function checkSettingsPage(context, path, label, expectedTextGroups) {
  const page = await newTrackedPage(context, label)
  const url = `${appUrl}${path}`
  const item = {
    label,
    path,
    url,
    ok: false,
    expected_text: expectedTextGroups,
    visible_text: [],
  }
  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.waitForTimeout(1000)
    item.status = response?.status() ?? null
    item.final_url = page.url()
    item.title = await page.title()
    item.visible_text = await collectVisibleText(page, expectedTextGroups)
    item.authenticated = !page.url().includes('/auth/login')
    item.ok =
      !!response &&
      response.status() < 400 &&
      item.authenticated &&
      item.visible_text.every((entry) => entry.ok)
    await page.screenshot({ path: resolve(outputDir, `${label}.png`) })
  } catch (error) {
    item.error = errorMessage(error)
  } finally {
    report.app.push(item)
    report.checks.push({
      label: `${label} renders expected read-only settings content`,
      ok: item.ok,
      actual: {
        path: item.path,
        status: item.status,
        status_lt_400: typeof item.status === 'number' && item.status < 400,
        final_url: item.final_url,
        authenticated: item.authenticated,
        expected_text_visible: item.visible_text.every((entry) => entry.ok),
        visible_text: item.visible_text,
      },
      expected: {
        status_lt_400: true,
        authenticated: true,
        expected_text_visible: true,
      },
    })
    await page.close()
  }
}

async function openAndCloseInviteDialogIfPresent(context) {
  const label = 'settings-team-invite-dialog'
  const page = await newTrackedPage(context, label)
  const item = {
    label,
    path: '/settings/team',
    attempted: false,
    opened: false,
    closed: false,
    skipped_reason: null,
  }
  try {
    await page.goto(`${appUrl}/settings/team`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.waitForTimeout(1000)
    const inviteButton = page.getByRole('button', { name: /^Invite Member$/u })
    if (
      (await inviteButton.count()) === 0 ||
      !(await inviteButton.isVisible())
    ) {
      item.skipped_reason = 'Invite Member button not visible for this user.'
      return
    }

    item.attempted = true
    await inviteButton.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    await expectVisible(page, 'Invite Team Member')
    await dialog
      .getByPlaceholder('colleague@company.com')
      .waitFor({ state: 'visible', timeout: 5000 })
    await expectVisible(page, 'Role')
    item.opened = true
    await page.screenshot({ path: resolve(outputDir, `${label}-open.png`) })

    const cancelButton = dialog.getByRole('button', { name: /^Cancel$/u })
    if ((await cancelButton.count()) > 0) {
      await cancelButton.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    item.closed = true
  } catch (error) {
    item.error = errorMessage(error)
  } finally {
    report.interactions.push(item)
    await page.close()
  }
}

async function exerciseInvoiceStatusFilterIfPresent(context) {
  const label = 'settings-invoices-status-filter'
  const page = await newTrackedPage(context, label)
  const item = {
    label,
    path: '/settings/billing/invoices',
    attempted: false,
    changed_to_paid: false,
    restored_to_all: false,
    skipped_reason: null,
  }
  try {
    await page.goto(`${appUrl}/settings/billing/invoices`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.waitForTimeout(1000)
    const filter = page.getByRole('combobox', { name: 'Filter by status' })
    if ((await filter.count()) === 0 || !(await filter.isVisible())) {
      item.skipped_reason = 'Invoice status filter not visible.'
      return
    }

    item.attempted = true
    await filter.click()
    const paidOption = page.getByRole('option', { name: /^Paid$/u })
    if ((await paidOption.count()) > 0) {
      await paidOption.click()
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => {})
      await expectFilterSelected(page, 'Paid')
      item.changed_to_paid = true
      await page.screenshot({ path: resolve(outputDir, `${label}-paid.png`) })
    }

    await filter.click()
    const allOption = page.getByRole('option', { name: /^All Statuses$/u })
    if ((await allOption.count()) > 0) {
      await allOption.click()
      await page
        .waitForLoadState('networkidle', { timeout: 15_000 })
        .catch(() => {})
      await expectFilterSelected(page, 'All Statuses')
      item.restored_to_all = true
    }
  } catch (error) {
    item.error = errorMessage(error)
  } finally {
    report.interactions.push(item)
    await page.close()
  }
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

async function collectVisibleText(page, expectedTextGroups) {
  const results = []
  for (const group of expectedTextGroups) {
    const candidates = Array.isArray(group) ? group : [group]
    const match = await firstVisibleCandidate(page, candidates)
    results.push({
      expected_any: candidates,
      ok: Boolean(match),
      matched: match,
    })
  }
  return results
}

async function firstVisibleCandidate(page, candidates) {
  for (const text of candidates) {
    if (await visibleText(page, text)) return text
  }
  return null
}

async function visibleText(page, text) {
  const locator = page.getByText(text, { exact: true }).first()
  if ((await locator.count()) === 0) return false
  try {
    await locator.waitFor({ state: 'visible', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

async function expectVisible(page, text) {
  if (!(await visibleText(page, text))) {
    throw new Error(`Expected visible text not found: ${text}`)
  }
}

async function expectFilterSelected(page, expectedText) {
  const filter = page.getByRole('combobox', { name: 'Filter by status' })
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const text = ((await filter.textContent()) ?? '').trim()
    if (text.includes(expectedText)) return
    await page.waitForTimeout(100)
  }
  const actual = ((await filter.textContent()) ?? '').trim()
  throw new Error(
    `Expected invoice status filter to show ${expectedText}, got ${actual}`
  )
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
