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
  'E2E_PROD_TENANT_EMAIL',
  'E2E_PROD_TENANT_PASSWORD',
  'E2E_PROD_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`)
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL)
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL)
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-role-boundary-negative-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    write_policy:
      'read-only role-boundary probes; landlord token checks tenant-only routes and tenant token checks landlord-only routes',
    negativeNoPersistentIdsExpected: true,
    persistentIdsCreated: [],
  },
  auth: {},
  checks: [],
  cleanup: [],
}

try {
  const landlord = await signInWithPassword({
    email: env.E2E_PROD_EMAIL,
    password: env.E2E_PROD_PASSWORD,
  })
  const tenant = await signInWithPassword({
    email: env.E2E_PROD_TENANT_EMAIL,
    password: env.E2E_PROD_TENANT_PASSWORD,
  })
  report.auth = {
    landlord: {
      user_id: landlord.user?.id ?? null,
      email: landlord.user?.email ?? env.E2E_PROD_EMAIL,
    },
    tenant: {
      user_id: tenant.user?.id ?? null,
      email: tenant.user?.email ?? env.E2E_PROD_TENANT_EMAIL,
    },
  }

  await runScenario({ landlordToken: landlord.access_token, tenantToken: tenant.access_token })
  report.ok =
    report.generated.persistentIdsCreated.length === 0 &&
    report.checks.length > 0 &&
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario({ landlordToken, tenantToken }) {
  const tenantDisputeId = crypto.randomUUID()
  const landlordAgainstTenantRoutes = [
    { method: 'GET', path: '/api/v1/tenant/dashboard' },
    {
      method: 'GET',
      path: '/api/v1/tenant/notifications?unread_only=true&skip=0&limit=1',
    },
    { method: 'GET', path: '/api/v1/tenant/notifications/preferences' },
    {
      method: 'PUT',
      path: '/api/v1/tenant/notifications/preferences',
      body: {},
    },
    { method: 'GET', path: '/api/v1/tenant/disputes?limit=1' },
    { method: 'GET', path: `/api/v1/tenant/disputes/${tenantDisputeId}` },
    {
      method: 'POST',
      path: '/api/v1/tenant/disputes',
      body: {
        statement_id: crypto.randomUUID(),
        category: 'billing_question',
        description: 'Role boundary probe should be rejected before write.',
      },
    },
    {
      method: 'POST',
      path: `/api/v1/tenant/disputes/${tenantDisputeId}/comments`,
      body: { content: 'Role boundary probe should be rejected before write.' },
    },
    {
      method: 'GET',
      path: `/api/v1/tenant/statements/${crypto.randomUUID()}/pdf`,
    },
  ]
  for (const probe of landlordAgainstTenantRoutes) {
    await expectForbidden({
      label: `landlord token is rejected from tenant route ${probe.method} ${probe.path}`,
      ...probe,
      token: landlordToken,
    })
  }

  const adminDisputeId = crypto.randomUUID()
  const auditRequestId = crypto.randomUUID()
  const tenantAgainstLandlordRoutes = [
    { method: 'GET', path: '/api/v1/properties?limit=1' },
    { method: 'GET', path: '/api/v1/dashboard' },
    { method: 'GET', path: '/api/v1/dashboard/leakage-summary' },
    { method: 'GET', path: '/api/v1/organization/usage' },
    { method: 'GET', path: '/api/v1/organization/settings' },
    { method: 'PATCH', path: '/api/v1/organization/settings', body: {} },
    { method: 'GET', path: '/api/v1/team/members' },
    { method: 'GET', path: '/api/v1/team/invitations' },
    {
      method: 'POST',
      path: '/api/v1/team/invitations',
      body: {
        email: `role-boundary-${runId.toLowerCase()}@example.com`,
        role: 'member',
      },
    },
    { method: 'GET', path: '/api/v1/disputes?limit=1' },
    { method: 'GET', path: `/api/v1/disputes/${adminDisputeId}` },
    {
      method: 'PUT',
      path: `/api/v1/disputes/${adminDisputeId}/status`,
      body: { status: 'under_review' },
    },
    {
      method: 'POST',
      path: `/api/v1/disputes/${adminDisputeId}/comments`,
      body: { content: 'Role boundary probe should be rejected before write.' },
    },
    { method: 'GET', path: '/api/v1/audit-requests' },
    { method: 'GET', path: `/api/v1/audit-requests/${auditRequestId}` },
    {
      method: 'PATCH',
      path: `/api/v1/audit-requests/${auditRequestId}`,
      body: { notes: 'Role boundary probe should be rejected before write.' },
    },
    { method: 'GET', path: '/api/v1/export/history?limit=1' },
    { method: 'GET', path: '/api/v1/billing/plan-selection' },
  ]
  for (const probe of tenantAgainstLandlordRoutes) {
    await expectForbidden({
      label: `tenant token is rejected from landlord route ${probe.method} ${probe.path}`,
      ...probe,
      token: tenantToken,
    })
  }

  report.cleanup.push({
    label: 'role-boundary negative scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
    body_preview:
      'Only wrong-party role-boundary requests were issued. Mutating probes are rejected by auth middleware before body parsing or writes.',
  })
}

async function expectForbidden({ label, path, method, token, body }) {
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  }
  let requestBody
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: requestBody,
  })
  const responseBody = await parseJson(response)
  check(
    label,
    {
      status: response.status,
      error_code: responseBody?.error?.code ?? null,
      message: responseBody?.error?.message ?? responseBody?.detail ?? null,
    },
    {
      status: 403,
      error_code: 'forbidden',
      message: 'Access denied',
    }
  )
}

async function signInWithPassword({ email, password }) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  )
  const json = await parseJson(response)
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  return json
}

function check(label, actual, expected) {
  const ok = deepEqual(actual, expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

function deepEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

async function readEnv(path) {
  try {
    const raw = await readFile(path, 'utf8')
    return Object.fromEntries(
      raw
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const index = line.indexOf('=')
          if (index === -1) return [line, '']
          const key = line.slice(0, index).trim()
          const value = line.slice(index + 1).trim().replace(/^["']|["']$/gu, '')
          return [key, value]
        })
    )
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}
