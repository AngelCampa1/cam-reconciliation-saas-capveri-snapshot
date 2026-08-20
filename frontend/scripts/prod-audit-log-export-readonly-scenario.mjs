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
  `prod-audit-log-export-readonly-${runId}`
)
await mkdir(outputDir, { recursive: true })

const csvHeader = [
  'id',
  'table_name',
  'operation',
  'row_id',
  'old_data',
  'new_data',
  'changed_by',
  'changed_at',
]

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
  const latest = await expectCsv('/api/v1/exports/audit-log?limit=5')
  check('audit-log CSV header is stable', latest.header, csvHeader)
  check(
    'audit-log CSV export has production rows',
    latest.rows.length > 0,
    true
  )
  check('audit-log CSV filename is dated', latest.filenameOk, true)
  check('audit-log CSV content-type is text/csv', latest.contentTypeOk, true)

  const firstEntry = latest.rows[0]
  check('audit-log CSV latest row shape is stable', entryShape(firstEntry), {
    id: true,
    table_name: true,
    operation: true,
    row_id: true,
    changed_at: true,
    old_or_new_payload: true,
  })

  const firstChangedDate = firstEntry.changed_at.slice(0, 10)
  report.generated.referenceAuditLogEntry = {
    table_name: firstEntry.table_name,
    operation: firstEntry.operation,
    row_id: firstEntry.row_id || null,
    changed_at_date: firstChangedDate,
  }

  const glEntries = await expectCsv(
    '/api/v1/exports/audit-log?table_name=gl_entries&operation=INSERT&limit=5'
  )
  check(
    'audit-log CSV table and operation filters return only gl_entries inserts',
    glEntries.rows.map((entry) => ({
      table_name: entry.table_name,
      operation: entry.operation,
    })),
    glEntries.rows.map(() => ({
      table_name: 'gl_entries',
      operation: 'INSERT',
    }))
  )
  check(
    'audit-log CSV gl_entries insert filter has production rows',
    glEntries.rows.length > 0,
    true
  )
  check(
    'audit-log CSV gl_entries insert rows carry payload data',
    glEntries.rows.map((entry) => entry.new_data.trim() !== ''),
    glEntries.rows.map(() => true)
  )

  const dateRows = await expectCsv(
    `/api/v1/exports/audit-log?start_date=${firstChangedDate}&end_date=${firstChangedDate}&limit=10`
  )
  check(
    'audit-log CSV date filter has production rows',
    dateRows.rows.length > 0,
    true
  )
  check(
    'audit-log CSV date filter includes the reference row',
    dateRows.rows.some((entry) => entry.id === firstEntry.id),
    true
  )
  check(
    'audit-log CSV date filter includes reference changed_at date only',
    dateRows.rows.map((entry) => entry.changed_at.slice(0, 10)),
    dateRows.rows.map(() => firstChangedDate)
  )

  if (firstEntry.row_id) {
    const rowRows = await expectCsv(
      `/api/v1/exports/audit-log?row_id=${encodeURIComponent(firstEntry.row_id)}&limit=10`
    )
    check(
      'audit-log CSV row_id filter has production rows',
      rowRows.rows.length > 0,
      true
    )
    check(
      'audit-log CSV row_id filter includes the reference row',
      rowRows.rows.some((entry) => entry.id === firstEntry.id),
      true
    )
    check(
      'audit-log CSV row_id filter returns only the reference row id',
      rowRows.rows.map((entry) => entry.row_id),
      rowRows.rows.map(() => firstEntry.row_id)
    )
  }

  await expectError(
    '/api/v1/exports/audit-log?row_id=not-a-uuid',
    422,
    'validation_error'
  )
  await expectError(
    '/api/v1/exports/audit-log?limit=9999',
    422,
    'validation_error'
  )

  report.cleanup.push({
    label: 'audit-log CSV export scenario created no persistent ids',
    ok: report.generated.persistentIdsCreated.length === 0,
    actual: report.generated.persistentIdsCreated.length,
    expected: 0,
  })
}

async function expectCsv(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'text/csv',
    },
  })
  const text = await response.text()
  if (response.status !== 200) {
    recordFailedResponse(path, response.status)
    throw new Error(
      `GET ${path} returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }

  const records = parseCsv(text)
  const header = records[0] ?? []
  const rows = records.slice(1).map((record) => rowFromRecord(header, record))
  return {
    text,
    header,
    rows,
    contentTypeOk: response.headers.get('content-type')?.includes('text/csv'),
    filenameOk: /^attachment; filename="audit_log_\d{8}\.csv"$/u.test(
      response.headers.get('content-disposition') ?? ''
    ),
  }
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
  check(`audit-log CSV export rejects ${path}`, body?.error?.code, code)
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

function entryShape(entry) {
  return {
    id: isNonEmptyString(entry?.id),
    table_name: isNonEmptyString(entry?.table_name),
    operation: ['INSERT', 'UPDATE', 'DELETE'].includes(entry?.operation),
    row_id: entry?.row_id === '' || isUuid(entry?.row_id),
    changed_at: isNonEmptyString(entry?.changed_at),
    old_or_new_payload:
      entry?.old_data.trim() !== '' || entry?.new_data.trim() !== '',
  }
}

function rowFromRecord(header, record) {
  return Object.fromEntries(
    header.map((field, index) => [field, record[index] ?? ''])
  )
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r' && next === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      index += 1
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((record) => record.some((value) => value !== ''))
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
