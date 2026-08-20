// Prod E2E stress scenario (Cycle 10, Domain C): sort/filter query-param
// injection + allowlist integrity on the LIVE prod API.
//
// The ONLY user-controlled ORDER BY column in the deployed cloudflare-backend
// is the reconciliation-snapshots list (sort_by / sort_order). It is guarded by
// a Zod enum at the HTTP boundary and a fixed `sortableColumns` map in the DB
// adapter (adapters/db/reconciliation.ts). Every other list endpoint uses a
// FIXED order-by and parameterized ($N) filters. This scenario adversarially
// probes:
//   - reconciliation snapshots sort_by: unknown column, SQL fragments,
//     cross-table column, expression, case variants -> expect 422, never 500,
//     never a reflected SQL error, never injected ordering.
//   - reconciliation snapshots sort_order: values other than asc/desc
//     (asc;DELETE, rand(), empty, uppercase, "asc,desc") -> expect 422.
//   - leases status filter (z.string, NOT enum; VARCHAR column): junk / SQL
//     fragment -> expect fail-SAFE 200 empty (parameterized, text column), not
//     500 / not injection.
//   - property imports status filter (same shape).
//   - audit-trail operation/table_name filters (admin route; z.string, text
//     columns): junk -> fail-safe, never 500.
//   - stable-tiebreak / pagination consistency on a non-unique sort key.
//
// READ-ONLY: creates at most one throwaway [PROD-TEST] property to guarantee a
// concrete resource id for the imports probe, and deletes it in finally. No
// snapshots/leases are created. Verifies 0 residual.
//
// check() records failures instead of throwing so one regression does not mask
// the rest of the surface.
import { randomUUID } from 'node:crypto'
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
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-stress-cycle10c-sort-filter-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  auth: {},
  generated: {},
  checks: [],
  cleanup: [],
}

let landlordToken = null
try {
  landlordToken = await signIn('landlord', env.E2E_PROD_EMAIL, env.E2E_PROD_PASSWORD)
  await runScenario()
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal = errorMessage(error)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

// ---------------------------------------------------------------------------

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const created = { propertyIds: [] }
  report.generated = { suffix, propertyIds: created.propertyIds }

  // Sanity: landlord token reaches a landlord list route.
  const ident = await probe('GET', '/api/v1/properties', { token: landlordToken })
  check(
    'IDENT landlord token accepted on landlord list route',
    { status: ident.status },
    { status: 200 }
  )

  await reconciliationSortByChecks()
  await reconciliationSortOrderChecks()
  await reconciliationSortHappyPathAndTiebreak()
  await leaseStatusFilterChecks()
  await auditTrailFilterChecks()

  try {
    const property = await createLandlordProperty(
      `[PROD-TEST] Sort/Filter Injection ${suffix}`
    )
    created.propertyIds.push(property.id)
    report.generated.propertyId = property.id
    await importStatusFilterChecks(property.id)
  } finally {
    await cleanup(created)
  }
}

// ---------------------------------------------------------------------------
// reconciliation snapshots: sort_by (the one interpolated ORDER BY column)
// ---------------------------------------------------------------------------

async function reconciliationSortByChecks() {
  const base = '/api/v1/reconciliation/snapshots'
  // Each of these must be rejected by the Zod enum BEFORE reaching SQL. The
  // pass condition is "not a 500 AND not a reflected SQL error"; the expected
  // shape is a 422 validation_error.
  const payloads = [
    ['unknown column', 'updated_at'],
    ['unknown column 2', 'organization_id'],
    ['cross-table column', 'leases.tenant_email'],
    ['numeric literal', '1'],
    ['sql fragment - semicolon drop', 'created_at; DROP TABLE reconciliation_snapshots'],
    ['sql fragment - comment', 'id-- '],
    ['sql fragment - subselect', '(SELECT organization_id FROM users LIMIT 1)'],
    ['expression', 'created_at, (SELECT 1)'],
    ['boolean-blind', "created_at) OR (SELECT 1=1"],
    ['uppercase valid col', 'CREATED_AT'],
    ['whitespace-padded valid col', ' created_at '],
    ['empty string', ''],
    ['union attempt', 'created_at UNION SELECT null'],
    ['stacked order desc', 'created_at desc, total_recovery'],
  ]
  for (const [label, value] of payloads) {
    const r = await probe(
      'GET',
      `${base}?sort_by=${encodeURIComponent(value)}`,
      { token: landlordToken }
    )
    check(
      `SORT_BY reject "${label}" -> 422 validation_error, no 500/SQL leak`,
      {
        status: r.status,
        code: errorCode(r.json),
        sqlLeak: looksLikeSqlError(r.text),
      },
      { status: 422, code: 'validation_error', sqlLeak: false }
    )
  }
}

// ---------------------------------------------------------------------------
// reconciliation snapshots: sort_order
// ---------------------------------------------------------------------------

async function reconciliationSortOrderChecks() {
  const base = '/api/v1/reconciliation/snapshots'
  const payloads = [
    ['sql fragment', 'asc; DELETE FROM reconciliation_snapshots'],
    ['function call', 'rand()'],
    ['empty string', ''],
    ['uppercase ASC', 'ASC'],
    ['uppercase DESC', 'DESC'],
    ['multi-direction', 'asc,desc'],
    ['nulls-first injection', 'asc NULLS FIRST'],
    ['comment', 'desc-- '],
    ['unknown token', 'ascending'],
  ]
  for (const [label, value] of payloads) {
    const r = await probe(
      'GET',
      `${base}?sort_order=${encodeURIComponent(value)}`,
      { token: landlordToken }
    )
    check(
      `SORT_ORDER reject "${label}" -> 422 validation_error, no 500/SQL leak`,
      {
        status: r.status,
        code: errorCode(r.json),
        sqlLeak: looksLikeSqlError(r.text),
      },
      { status: 422, code: 'validation_error', sqlLeak: false }
    )
  }
}

// ---------------------------------------------------------------------------
// reconciliation snapshots: valid sort must 200, and repeated calls with a
// non-unique sort key must return a STABLE order (stable tiebreak on id).
// ---------------------------------------------------------------------------

async function reconciliationSortHappyPathAndTiebreak() {
  const base = '/api/v1/reconciliation/snapshots'
  for (const [by, order] of [
    ['created_at', 'desc'],
    ['created_at', 'asc'],
    ['tenant_name', 'asc'],
    ['total_recovery', 'desc'],
  ]) {
    const r = await probe(
      'GET',
      `${base}?sort_by=${by}&sort_order=${order}&size=50`,
      { token: landlordToken }
    )
    check(
      `SORT happy-path ${by}/${order} -> 200`,
      { status: r.status, isObject: r.json !== null },
      { status: 200, isObject: true }
    )
  }

  // Stable-tiebreak: total_recovery is non-unique across snapshots; two
  // identical requests must yield the identical id sequence (the query pins a
  // secondary sort on reconciliation_snapshots.id). If the order flapped, the
  // id lists would differ.
  const q = `${base}?sort_by=total_recovery&sort_order=desc&size=100`
  const a = await probe('GET', q, { token: landlordToken })
  const b = await probe('GET', q, { token: landlordToken })
  const idsA = extractIds(a.json)
  const idsB = extractIds(b.json)
  check(
    'SORT non-unique key (total_recovery) has stable tiebreak across repeats',
    { status: a.status, sameOrder: JSON.stringify(idsA) === JSON.stringify(idsB) },
    { status: 200, sameOrder: true }
  )
  report.generated.snapshotIdSampleCount = idsA.length
}

// ---------------------------------------------------------------------------
// leases status filter: z.string (NOT enum) over a VARCHAR column. Junk must
// fail SAFE (200 empty / no matching rows), never 500, never injection.
// ---------------------------------------------------------------------------

async function leaseStatusFilterChecks() {
  const base = '/api/v1/leases'
  const payloads = [
    ['invalid enum value', 'nonexistent_status'],
    ['sql fragment - or 1=1', "active' OR '1'='1"],
    ['sql fragment - union', "draft' UNION SELECT null-- "],
    ['sql fragment - semicolon', "active; DROP TABLE leases-- "],
    ['empty-ish whitespace', '   '],
    ['very long value', 'x'.repeat(300)],
  ]
  for (const [label, value] of payloads) {
    const r = await probe(
      'GET',
      `${base}?status=${encodeURIComponent(value)}`,
      { token: landlordToken }
    )
    // Fail-safe: either the request is accepted and returns rows that ALL match
    // the (impossible) filter -> i.e. empty, or it is a clean 4xx. It must never
    // 500 or leak SQL, and an injection payload must NOT return the full table.
    const rows = extractRows(r.json)
    const allMatch = rows.every((row) => row?.status === value)
    check(
      `LEASE status filter "${label}" -> fail-safe (no 500/SQL leak, no bypass)`,
      {
        is500: r.status >= 500,
        sqlLeak: looksLikeSqlError(r.text),
        // A successful injection would return leases whose status != value.
        injectionBypass: r.status === 200 && rows.length > 0 && !allMatch,
      },
      { is500: false, sqlLeak: false, injectionBypass: false }
    )
  }
}

// ---------------------------------------------------------------------------
// property imports status filter: same z.string / text-column shape.
// ---------------------------------------------------------------------------

async function importStatusFilterChecks(propertyId) {
  const base = `/api/v1/properties/${propertyId}/imports`
  const payloads = [
    ['invalid enum value', 'not_a_real_status'],
    ['sql fragment', "pending' OR '1'='1"],
    ['union attempt', "completed' UNION SELECT null-- "],
  ]
  for (const [label, value] of payloads) {
    const r = await probe(
      'GET',
      `${base}?status=${encodeURIComponent(value)}`,
      { token: landlordToken }
    )
    check(
      `IMPORT status filter "${label}" -> fail-safe (no 500/SQL leak)`,
      { is500: r.status >= 500, sqlLeak: looksLikeSqlError(r.text) },
      { is500: false, sqlLeak: false }
    )
  }
}

// ---------------------------------------------------------------------------
// audit-trail operation/table_name filters: admin-only, z.string over text
// columns. Junk must fail-safe. (The landlord E2E account may or may not be a
// platform admin; either 200-with-fail-safe or 403 is acceptable, but never a
// 500 / SQL leak.)
// ---------------------------------------------------------------------------

async function auditTrailFilterChecks() {
  const base = '/api/v1/audit-trail'
  const payloads = [
    ['operation junk', 'operation=NONSENSE'],
    ['operation sql', `operation=${encodeURIComponent("DELETE'; DROP TABLE audit_log-- ")}`],
    ['table_name junk', 'table_name=not_a_table'],
    ['table_name sql', `table_name=${encodeURIComponent("leases' UNION SELECT null-- ")}`],
  ]
  for (const [label, qs] of payloads) {
    const r = await probe('GET', `${base}?${qs}`, { token: landlordToken })
    check(
      `AUDIT-TRAIL filter "${label}" -> fail-safe (no 500/SQL leak)`,
      { is500: r.status >= 500, sqlLeak: looksLikeSqlError(r.text) },
      { is500: false, sqlLeak: false }
    )
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function extractIds(json) {
  return extractRows(json)
    .map((row) => row?.id)
    .filter((id) => typeof id === 'string')
}

function extractRows(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.snapshots)) return json.snapshots
  if (Array.isArray(json?.imports)) return json.imports
  if (Array.isArray(json?.items)) return json.items
  return []
}

// Heuristic: does the response body reflect a raw Postgres/SQL error? A safe
// API returns structured {error:{code}} envelopes, never driver text.
function looksLikeSqlError(text) {
  if (typeof text !== 'string') return false
  const t = text.toLowerCase()
  return (
    t.includes('syntax error at or near') ||
    t.includes('column ') && t.includes('does not exist') ||
    t.includes('sqlstate') ||
    t.includes('postgres') && t.includes('error') ||
    t.includes('invalid input syntax') ||
    t.includes('42703') || // undefined_column
    t.includes('42601') || // syntax_error
    t.includes('22p02') // invalid_text_representation
  )
}

async function createLandlordProperty(name) {
  const result = await probe('POST', '/api/v1/properties', {
    token: landlordToken,
    body: propertyBody(name),
  })
  if (result.status !== 201 || !result.json?.id) {
    throw new Error(
      `createLandlordProperty failed: ${result.status} ${result.text.slice(0, 500)}`
    )
  }
  return result.json
}

function propertyBody(name) {
  return {
    name,
    address_line1: '10 Sort Order Lane',
    city: 'Austin',
    state: 'TX',
    postal_code: '78704',
    total_rentable_sqft: '25000.00',
    total_usable_sqft: '22000.00',
    common_area_sqft: '3000.00',
    target_occupancy: '0.95',
    boma_standard_version: '2024',
    fiscal_year_start_month: 1,
  }
}

async function probe(method, path, { token, rawAuth, body } = {}) {
  const headers = { accept: 'application/json' }
  if (rawAuth !== undefined) {
    headers.authorization = rawAuth
  } else if (token) {
    headers.authorization = `Bearer ${token}`
  }
  if (body !== undefined) headers['content-type'] = 'application/json'

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: response.status, text, json }
}

async function cleanup(created) {
  const failures = []
  for (const propertyId of created.propertyIds) {
    await attemptCleanup(failures, `delete property ${propertyId}`, async () => {
      const response = await fetch(`${apiUrl}/api/v1/properties/${propertyId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${landlordToken}` },
      })
      const text = await response.text()
      report.cleanup.push({
        path: `DELETE /api/v1/properties/${propertyId}`,
        status: response.status,
        ok: response.status === 204,
        body_preview: text.slice(0, 200),
      })
      if (response.status !== 204) {
        throw new Error(`DELETE returned ${response.status}: ${text.slice(0, 300)}`)
      }
    })
    await attemptCleanup(failures, `verify property ${propertyId} gone`, async () => {
      const response = await fetch(`${apiUrl}/api/v1/properties/${propertyId}`, {
        headers: { authorization: `Bearer ${landlordToken}` },
      })
      const text = await response.text()
      report.cleanup.push({
        path: `GET /api/v1/properties/${propertyId}`,
        status: response.status,
        ok: response.status === 404,
        body_preview: text.slice(0, 200),
      })
      if (response.status !== 404) {
        throw new Error(`expected 404 after delete, got ${response.status}`)
      }
    })
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

async function signIn(party, email, password) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    }
  )
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(
      `Supabase password auth failed for ${party}: ${JSON.stringify(json)}`
    )
  }
  report.auth[party] = {
    user_id: json.user?.id ?? null,
    email: json.user?.email ?? email,
  }
  return json.access_token
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
}

function errorCode(json) {
  return json?.error?.code ?? null
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}
