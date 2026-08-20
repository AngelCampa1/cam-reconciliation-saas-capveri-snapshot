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
  `prod-team-invitations-browser-${runId}`
)
await mkdir(outputDir, { recursive: true })

const inviteEmail = `e2e-team-invite-${runId.toLowerCase()}@example.com`
const inviteRole = 'member'
const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl, app_url: appUrl },
  generated: {
    teamInvitationCleanupExpected: true,
    teamInvitationEmail: inviteEmail,
    teamInvitationRole: inviteRole,
    persistentIdsCreated: [],
    revokedInvitationIds: [],
  },
  expected_persistent_side_effects: [
    'team invitation audit/log rows may be append-only',
    'transactional invitation email delivery attempt may be recorded externally',
  ],
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
let createdInvitation = null

try {
  session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  await assertNoActiveInvitation(
    inviteEmail,
    'preflight unique invitation email'
  )
  await runBrowserScenario()
  await verifyInvitationRevoked()
} finally {
  if (token && createdInvitation?.id) {
    await attemptCleanup('defensive invitation revoke', async () => {
      await revokeInvitation(createdInvitation.id)
      await verifyInvitationRevoked()
    })
  }

  report.ok =
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.browser.browser_errors.length === 0 &&
    report.browser.failed_responses.length === 0 &&
    report.browser.unexpected_mutating_requests.length === 0 &&
    browserMutationsMatchExpected() &&
    Boolean(report.generated.teamInvitationRevokedAt)

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runBrowserScenario() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: false,
    })
    attachContextGuards(context)
    await injectSupabaseSession(context, session)

    const page = await newTrackedPage(context, 'team-invitations')
    await page.goto(`${appUrl}/settings/team`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.getByRole('heading', { name: 'Team Members' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await page
      .getByRole('heading', { name: 'Pending Invitations', exact: true })
      .waitFor({
        state: 'visible',
        timeout: 20_000,
      })

    await page.getByRole('button', { name: 'Invite Member' }).click()
    await page.getByRole('dialog', { name: 'Invite Team Member' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await page.getByLabel('Email Address').fill(inviteEmail)

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/team/invitations') &&
        response.request().method() === 'POST',
      { timeout: 20_000 }
    )
    await page.getByRole('button', { name: 'Send Invitation' }).click()
    const createResponse = await createResponsePromise
    const createText = await createResponse.text()
    if (createResponse.status() !== 201) {
      throw new Error(
        `Create invitation returned ${createResponse.status()}: ${createText.slice(0, 500)}`
      )
    }
    createdInvitation = JSON.parse(createText)
    report.generated.teamInvitationId = createdInvitation.id
    report.generated.teamInvitationToken = createdInvitation.token
    report.generated.persistentIdsCreated = [createdInvitation.id]

    check('created invitation response', pickInvitation(createdInvitation), {
      email: inviteEmail,
      role: inviteRole,
      revoked_at: null,
      used_at: null,
    })
    await page.getByRole('cell', { name: inviteEmail, exact: true }).waitFor({
      state: 'visible',
      timeout: 20_000,
    })
    await expectActiveInvitation(
      inviteEmail,
      'created invitation visible by API'
    )

    const revokeResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/v1/team/invitations/${createdInvitation.id}`) &&
        response.request().method() === 'DELETE',
      { timeout: 20_000 }
    )
    await page
      .getByLabel(`Revoke invitation for ${inviteEmail}`, { exact: true })
      .click()
    await page.getByRole('alertdialog', { name: 'Revoke Invitation' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Revoke' }).click()
    const revokeResponse = await revokeResponsePromise
    const revokeText = await revokeResponse.text()
    if (revokeResponse.status() !== 200) {
      throw new Error(
        `Revoke invitation returned ${revokeResponse.status()}: ${revokeText.slice(0, 500)}`
      )
    }
    check('revoke response', JSON.parse(revokeText), {
      status: 'revoked',
      invitation_id: createdInvitation.id,
    })
    await page.getByRole('cell', { name: inviteEmail, exact: true }).waitFor({
      state: 'detached',
      timeout: 20_000,
    })
  } finally {
    await browser.close()
  }
}

async function assertNoActiveInvitation(email, label) {
  const invitations = await listInvitations(false)
  const active = invitations.filter((invitation) => invitation.email === email)
  check(label, { active_count: active.length }, { active_count: 0 })
}

async function expectActiveInvitation(email, label) {
  const invitations = await listInvitations(false)
  const active = invitations.find((invitation) => invitation.email === email)
  check(label, pickInvitation(active), {
    email,
    role: inviteRole,
    revoked_at: null,
    used_at: null,
  })
}

async function verifyInvitationRevoked() {
  if (!createdInvitation?.id || !createdInvitation?.token) return

  const activeInvitations = await listInvitations(false)
  const activeMatch = activeInvitations.find(
    (invitation) => invitation.id === createdInvitation.id
  )
  check(
    'revoked invitation absent from active list',
    { active_match: Boolean(activeMatch) },
    { active_match: false }
  )

  const allInvitations = await listInvitations(true)
  const stored = allInvitations.find(
    (invitation) => invitation.id === createdInvitation.id
  )
  report.generated.teamInvitationRevokedAt = stored?.revoked_at ?? null
  check('revoked invitation stored state', pickInvitation(stored), {
    email: inviteEmail,
    role: inviteRole,
    revoked_at: stored?.revoked_at ?? null,
    used_at: null,
  })
  if (!stored?.revoked_at) {
    throw new Error('Invitation was not marked revoked')
  }

  const validation = await expectJson(
    `/api/v1/team/invitations/${encodeURIComponent(createdInvitation.token)}/validate`,
    { status: 200, auth: false }
  )
  check(
    'revoked invitation token rejected',
    {
      valid: validation?.valid,
      error_reason: validation?.error_reason,
    },
    { valid: false, error_reason: 'revoked' }
  )

  report.generated.revokedInvitationIds = [createdInvitation.id]
  const cleanupLabel = 'revoked invitation absent from active invitation list'
  if (report.cleanup.every((item) => item.label !== cleanupLabel)) {
    report.cleanup.push({
      label: cleanupLabel,
      ok: !activeMatch,
      actual: {
        createdInvitationActive: Boolean(activeMatch),
        createdInvitationActiveId: activeMatch?.id ?? null,
        persistentIdsCreated: report.generated.persistentIdsCreated,
        revokedInvitationIds: report.generated.revokedInvitationIds,
      },
      expected: {
        createdInvitationActive: false,
        createdInvitationActiveId: null,
        persistentIdsCreated: [createdInvitation.id],
        revokedInvitationIds: [createdInvitation.id],
      },
    })
  }
}

async function listInvitations(includeUsed) {
  const suffix = includeUsed ? '?include_used=true' : ''
  const body = await expectJson(`/api/v1/team/invitations${suffix}`, {
    status: 200,
  })
  if (!Array.isArray(body)) {
    throw new Error('Team invitations response was not an array')
  }
  return body
}

async function revokeInvitation(invitationId) {
  const response = await fetch(
    `${apiUrl}/api/v1/team/invitations/${invitationId}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  )
  const text = await response.text()
  const alreadyRevoked =
    response.status === 400 && text.includes('already been revoked')
  if (![200, 404, 410].includes(response.status) && !alreadyRevoked) {
    throw new Error(
      `Defensive revoke returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
  report.cleanup.push({
    label: 'defensive invitation revoke returned terminal status',
    ok: true,
    status: response.status,
    already_revoked: alreadyRevoked,
  })
}

async function expectJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers:
      options.auth === false ? { accept: 'application/json' } : authHeaders(),
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
    if (!isExpectedBrowserMutation(method, url)) {
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

async function attemptCleanup(label, operation) {
  try {
    await operation()
  } catch (error) {
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

function browserMutationsMatchExpected() {
  const requests = report.browser.mutating_requests
  return (
    requests.length === 2 &&
    requests.some(
      (request) =>
        request.method === 'POST' &&
        request.url.includes('/api/v1/team/invitations')
    ) &&
    requests.some(
      (request) =>
        request.method === 'DELETE' &&
        request.url.includes('/api/v1/team/invitations/')
    )
  )
}

function isExpectedBrowserMutation(method, url) {
  return (
    (method === 'POST' && url.includes('/api/v1/team/invitations')) ||
    (method === 'DELETE' && url.includes('/api/v1/team/invitations/'))
  )
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

function pickInvitation(invitation) {
  return {
    email: invitation?.email ?? null,
    role: invitation?.role ?? null,
    revoked_at: invitation?.revoked_at ?? null,
    used_at: invitation?.used_at ?? null,
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

function authHeaders() {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
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
