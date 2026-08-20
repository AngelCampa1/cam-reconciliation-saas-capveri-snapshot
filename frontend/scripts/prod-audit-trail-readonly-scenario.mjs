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
  `prod-audit-trail-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl },
  generated: {
    readOnlyNoPersistentWrites: true,
    persistentIdsCreated: [],
  },
  auth: {},
  checks: [],
  cleanup: [],
  guarded_endpoint_requests: [],
  mutating_requests: [],
  failed_responses: [],
  browser_errors: [],
}

let token

try {
  const session = await signInWithPassword()
  token = session.access_token
  report.auth = {
    user_id: session.user?.id ?? null,
    email: session.user?.email ?? env.E2E_PROD_EMAIL,
  }

  await runScenario()
} finally {
  report.ok =
    report.checks.every((check) => check.ok) &&
    report.cleanup.every((item) => item.ok) &&
    report.guarded_endpoint_requests.length === 0 &&
    report.mutating_requests.length === 0 &&
    report.failed_responses.length === 0 &&
    report.browser_errors.length === 0

  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

async function runScenario() {
  const latest = await expectJson('/api/v1/audit-trail?page=1&page_size=5', {
    status: 200,
  })
  check('audit trail envelope shape is paginated', envelopeShape(latest), {
    items: true,
    total: true,
    page: 1,
    page_size: 5,
    total_pages: true,
    has_next: true,
    has_previous: false,
  })
  check('audit trail has production rows to inspect', latest.total > 0, true)

  const firstEntry = latest.items[0]
  check('audit trail latest entry shape is stable', entryShape(firstEntry), {
    id: true,
    table_name: true,
    operation: true,
    row_id: true,
    changed_at: true,
    organization_id: true,
    jsonb_shape: true,
  })

  const firstChangedDate = firstEntry.changed_at.slice(0, 10)
  report.generated.referenceAuditEntry = {
    table_name: firstEntry.table_name,
    operation: firstEntry.operation,
    row_id: firstEntry.row_id,
    changed_at_date: firstChangedDate,
  }

  const glEntries = await expectJson(
    '/api/v1/audit-trail?table_name=gl_entries&page=1&page_size=5',
    { status: 200 }
  )
  check(
    'audit trail table_name filter returns only gl_entries',
    glEntries.items.map((entry) => entry.table_name),
    glEntries.items.map(() => 'gl_entries')
  )
  check(
    'audit trail gl_entries filter has production rows',
    glEntries.total > 0,
    true
  )
  check(
    'audit trail gl_entries rows expose parsed JSONB payloads',
    glEntries.items.map((entry) => ({
      operation: entry.operation,
      has_new_or_old_object:
        isPlainObject(entry.new_data) || isPlainObject(entry.old_data),
      amount_is_number_when_present:
        entry.new_data?.amount == null ||
        typeof entry.new_data.amount === 'number',
    })),
    glEntries.items.map((entry) => ({
      operation: entry.operation,
      has_new_or_old_object: true,
      amount_is_number_when_present: true,
    }))
  )

  const insertRows = await expectJson(
    '/api/v1/audit-trail?operation=insert&page=1&page_size=5',
    { status: 200 }
  )
  check(
    'audit trail operation filter uppercases insert',
    insertRows.items.map((entry) => entry.operation),
    insertRows.items.map(() => 'INSERT')
  )

  const deleteRows = await expectJson(
    '/api/v1/audit-trail?operation=delete&page=1&page_size=5',
    { status: 200 }
  )
  check(
    'audit trail delete rows include old_data object and no new_data',
    deleteRows.items.map((entry) => ({
      operation: entry.operation,
      old_data_object: isPlainObject(entry.old_data),
      new_data_null: entry.new_data === null,
    })),
    deleteRows.items.map(() => ({
      operation: 'DELETE',
      old_data_object: true,
      new_data_null: true,
    }))
  )

  const dateRows = await expectJson(
    `/api/v1/audit-trail?start_date=${firstChangedDate}&end_date=${firstChangedDate}&page=1&page_size=10`,
    { status: 200 }
  )
  check(
    'audit trail date filter includes reference changed_at date only',
    dateRows.items.map((entry) => entry.changed_at.slice(0, 10)),
    dateRows.items.map(() => firstChangedDate)
  )

  if (firstEntry.row_id) {
    const rowRows = await expectJson(
      `/api/v1/audit-trail?row_id=${encodeURIComponent(firstEntry.row_id)}&page=1&page_size=10`,
      { status: 200 }
    )
    check(
      'audit trail row_id filter returns only the reference row id',
      rowRows.items.map((entry) => entry.row_id),
      rowRows.items.map(() => firstEntry.row_id)
    )
  }

  await expectError(
    '/api/v1/audit-trail?row_id=not-a-uuid',
    400,
    'validation_error'
  )
  await expectError(
    '/api/v1/audit-trail?page_size=101',
    400,
    'validation_error'
  )

  report.cleanup.push({
    label: 'audit trail scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
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
    recordFailedResponse(path, response.status)
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function expectError(path, status, code) {
  const body = await expectJson(path, { status })
  check(`audit trail rejects ${path}`, body?.error?.code, code)
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

function envelopeShape(body) {
  return {
    items: Array.isArray(body?.items),
    total: Number.isInteger(body?.total) && body.total >= 0,
    page: body?.page,
    page_size: body?.page_size,
    total_pages: Number.isInteger(body?.total_pages) && body.total_pages >= 0,
    has_next: typeof body?.has_next === 'boolean',
    has_previous: body?.has_previous,
  }
}

function entryShape(entry) {
  return {
    id: Number.isInteger(entry?.id),
    table_name: isNonEmptyString(entry?.table_name),
    operation: ['INSERT', 'UPDATE', 'DELETE'].includes(entry?.operation),
    row_id: entry?.row_id === null || isUuid(entry?.row_id),
    changed_at: isNonEmptyString(entry?.changed_at),
    organization_id: isUuid(entry?.organization_id),
    jsonb_shape:
      entry?.old_data === null ||
      entry?.new_data === null ||
      isPlainObject(entry?.old_data) ||
      isPlainObject(entry?.new_data),
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

function recordFailedResponse(path, status) {
  report.failed_responses.push({
    method: 'GET',
    status,
    url: `${apiUrl}${redactSensitivePath(path)}`,
  })
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

function isPlainObject(value) {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
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

function redactSensitivePath(path) {
  try {
    const parsed = new URL(path, apiUrl)
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|code|key|secret|password|session/i.test(key)) {
        parsed.searchParams.set(key, '[redacted]')
      }
    }
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return path
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
