// Cycle 2A — MULTI-TENANCY RLS + AUTHZ ISOLATION stress scenario (LIVE PROD).
//
// Probes the highest-severity guarantee: a user can only ever see/mutate their
// own org's data, and party (landlord vs tenant) role gating holds.
//
// Coverage:
//   1. Cross-org read isolation (API): random/well-formed-nonexistent UUIDs return
//      404, real owned IDs return 200. No 403-vs-404 oracle leak.
//   2. Direct PostgREST bypass: with the user's anon-key + JWT, verify RLS blocks
//      cross-org SELECT/INSERT/UPDATE/DELETE, and document exactly what a user JWT
//      CAN write directly (Cycle 1 recovery_profile issue — how far does it go?).
//   3. Party guard: tenant cannot hit landlord-only routes (403); tenant CAN hit
//      tenant routes; landlord cannot hit tenant-only routes (403).
//   4. IDOR mutation: PATCH/DELETE by random UUID -> 404, never 500 / silent success.
//   5. JWT edge: absent/malformed/expired Authorization -> 401.
//
// Self-contained. Prefixes created entities with [PROD-TEST]. Finalizes nothing.
// Cleans up everything in a finally block and verifies 404 after delete.

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
const restUrl = `${supabaseUrl}/rest/v1`
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-stress-rls-authz-isolation-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  targets: { api_url: apiUrl, rest_url: restUrl },
  auth: {},
  generated: {},
  checks: [],
  // Observations that are informative but not pass/fail gated (e.g. documenting
  // exactly what a user JWT can write directly through PostgREST).
  observations: [],
  cleanup: [],
}

let landlordToken
let tenantToken
try {
  const landlord = await signInWithPassword({
    email: env.E2E_PROD_EMAIL,
    password: env.E2E_PROD_PASSWORD,
  })
  const tenant = await signInWithPassword({
    email: env.E2E_PROD_TENANT_EMAIL,
    password: env.E2E_PROD_TENANT_PASSWORD,
  })
  landlordToken = landlord.access_token
  tenantToken = tenant.access_token
  report.auth = {
    landlord: { user_id: landlord.user?.id ?? null, email: landlord.user?.email },
    tenant: { user_id: tenant.user?.id ?? null, email: tenant.user?.email },
  }

  await runScenario()
  report.ok =
    report.checks.length > 0 && report.checks.every((check) => check.ok)
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

async function runScenario() {
  const created = { propertyId: null, unitId: null, leaseId: null }
  const suffix = randomUUID().slice(0, 8)

  try {
    // ---- Setup: create one owned property/unit/lease to have a real, owned ID.
    const property = await apiJson(landlordToken, '/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: `[PROD-TEST] RLS Isolation ${suffix}`,
        address_line1: '742 Isolation Blvd',
        city: 'Austin',
        state: 'TX',
        postal_code: '78704',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '1000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    const unit = await apiJson(
      landlordToken,
      `/api/v1/properties/${property.id}/units`,
      {
        method: 'POST',
        status: 201,
        body: {
          unit_number: `RLS-${suffix.toUpperCase()}`,
          rentable_sqft: '2400.00',
          usable_sqft: '2100.00',
          floor: 1,
          status: 'occupied',
          space_type: 'retail',
        },
      }
    )
    created.unitId = unit.id
    const lease = await apiJson(landlordToken, '/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: `[PROD-TEST] RLS Tenant ${suffix}`,
        start_date: '2026-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2025,
          base_year_amount: '5000.00',
          gross_up_base_year: true,
          pro_rata_share: '0.24000',
          cap_type: 'non_cumulative',
          cap_rate: '0.04',
          admin_fee_percentage: '0.01',
          management_fee_percentage: '0.02',
          excluded_pools: ['capital'],
          base_year_adjustments: [],
        },
      },
    })
    created.leaseId = lease.id
    report.generated = { ...created, suffix }

    // Sanity: owned IDs are readable (proves the 404s below aren't just a broken token).
    await expectApiStatus({
      label: 'owned property GET returns 200',
      token: landlordToken,
      method: 'GET',
      path: `/api/v1/properties/${property.id}`,
      expected: 200,
    })
    await expectApiStatus({
      label: 'owned lease GET returns 200',
      token: landlordToken,
      method: 'GET',
      path: `/api/v1/leases/${lease.id}`,
      expected: 200,
    })

    await runPhase('cross-org-read-isolation', () => probeCrossOrgReadIsolation())
    await runPhase('list-scoping', () => probeListScoping(property.id))
    await runPhase('idor-mutation', () => probeIdorMutation())
    await runPhase('jwt-edges', () => probeJwtEdges())
    await runPhase('postgrest-bypass', () =>
      probePostgrestBypass({ ownedProperty: property, ownedLease: lease })
    )
    await runPhase('party-guard', () => probePartyGuard())
  } finally {
    await cleanup(created)
  }
}

async function runPhase(name, fn) {
  try {
    await fn()
  } catch (error) {
    check(`phase ${name} completed without unexpected error`, { error: errorMessage(error) }, { error: null })
  }
}

// ---- 1. Cross-org read isolation via the API -------------------------------
// We do not hold a second org's real IDs, so we assert that a well-formed random
// UUID is indistinguishable from a nonexistent one: both must 404 (org-scoped
// query), never 200 (leak) and never 403 (which would itself be an existence
// oracle distinguishing "exists but not yours" from "does not exist").
async function probeCrossOrgReadIsolation() {
  const randomA = randomUUID()
  const randomB = randomUUID()
  const readTargets = [
    { name: 'property', path: (id) => `/api/v1/properties/${id}` },
    { name: 'lease', path: (id) => `/api/v1/leases/${id}` },
    {
      name: 'reconciliation snapshot',
      path: (id) => `/api/v1/reconciliation/snapshots/${id}`,
    },
    {
      name: 'reconciliation job',
      path: (id) => `/api/v1/reconciliation/jobs/${id}`,
    },
    {
      name: 'actual-billed by property',
      path: (id) =>
        `/api/v1/actual-billed/${id}?period_start=2026-01-01&period_end=2026-12-31`,
    },
  ]
  for (const target of readTargets) {
    // For actual-billed, the property route returns an (empty) 200 payload for a
    // property the caller doesn't own only if RLS leaks; org scoping should make
    // an unowned property return 404. Assert both random UUIDs behave identically.
    const statusA = await rawApiStatus(landlordToken, 'GET', target.path(randomA))
    const statusB = await rawApiStatus(landlordToken, 'GET', target.path(randomB))
    check(
      `cross-org read ${target.name}: random UUID is 404, not 200 (no leak) and not 403 (no existence oracle)`,
      { statusA, statusB, identical: statusA === statusB, is404: statusA === 404 },
      { statusA: 404, statusB: 404, identical: true, is404: true }
    )
  }
}

// ---- List scoping: list endpoints never return rows outside the caller's org.
async function probeListScoping(ownedPropertyId) {
  const list = await apiJson(landlordToken, '/api/v1/properties?limit=100', {
    method: 'GET',
    status: 200,
  })
  const rows = Array.isArray(list) ? list : (list.items ?? list.data ?? [])
  const ownedPresent = rows.some((row) => row.id === ownedPropertyId)
  // We cannot see another org's rows to prove absence directly, but every row
  // returned must belong to the caller's org. The API query is org-scoped, so
  // the strongest black-box check is: our freshly created property is present
  // and the list is a bounded set (not the whole prod table).
  check(
    'properties list includes the caller-owned property (org-scoped list works)',
    { ownedPresent, isArray: Array.isArray(rows) },
    { ownedPresent: true, isArray: true }
  )
  report.observations.push({
    note: 'properties list row count for caller org',
    row_count: rows.length,
  })
}

// ---- 4. IDOR on mutation: PATCH/DELETE random UUID -> 404, never 500/success.
async function probeIdorMutation() {
  const ghost = randomUUID()
  const mutations = [
    {
      name: 'PATCH random property',
      method: 'PATCH',
      path: `/api/v1/properties/${ghost}`,
      body: { name: '[PROD-TEST] should-never-persist' },
    },
    {
      name: 'DELETE random property',
      method: 'DELETE',
      path: `/api/v1/properties/${ghost}`,
    },
    {
      name: 'PATCH random lease',
      method: 'PATCH',
      path: `/api/v1/leases/${ghost}`,
      body: { tenant_name: '[PROD-TEST] should-never-persist' },
    },
    {
      name: 'DELETE random lease',
      method: 'DELETE',
      path: `/api/v1/leases/${ghost}`,
    },
  ]
  for (const m of mutations) {
    const status = await rawApiStatus(landlordToken, m.method, m.path, m.body)
    check(
      `IDOR ${m.name}: returns 404 (no such row in caller org), never 500 or 2xx`,
      { status, is404: status === 404, isServerError: status >= 500 },
      { status: 404, is404: true, isServerError: false }
    )
  }
}

// ---- 5. JWT edge cases -----------------------------------------------------
async function probeJwtEdges() {
  const path = '/api/v1/properties?limit=1'
  // Absent header.
  {
    const res = await fetch(`${apiUrl}${path}`, { headers: { accept: 'application/json' } })
    check(
      'no Authorization header -> 401',
      { status: res.status },
      { status: 401 }
    )
  }
  // Malformed (not Bearer).
  {
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { accept: 'application/json', authorization: 'Basic abc123' },
    })
    check(
      'malformed Authorization (Basic) -> 401',
      { status: res.status },
      { status: 401 }
    )
  }
  // Bearer with garbage token.
  {
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { accept: 'application/json', authorization: 'Bearer not-a-real-jwt' },
    })
    check(
      'Bearer garbage token -> 401',
      { status: res.status },
      { status: 401 }
    )
  }
  // Structurally valid JWT signed with the wrong key (forged).
  {
    const forged = forgeUnsignedJwt()
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${forged}` },
    })
    check(
      'forged JWT (wrong signature) -> 401',
      { status: res.status },
      { status: 401 }
    )
  }
}

// ---- 2. Direct PostgREST bypass -------------------------------------------
// The user JWT + anon key hits Supabase REST directly, bypassing the API's
// business-logic guards. RLS is the only thing standing between the user and the
// raw tables. We verify:
//   (a) SELECT on own org's leases works (baseline — proves the token reaches RLS).
//   (b) Cross-org INSERT (lease for a property we don't own) is blocked.
//   (c) UPDATE targeting a random-UUID (unowned) lease affects 0 rows.
//   (d) DELETE targeting a random-UUID (unowned) lease affects 0 rows.
//   (e) Document exactly which columns a user CAN write on their OWN lease
//       (Cycle 1: recovery_profile writable — is tenant_name / status / dates too?).
//   (f) API-only tables (users, organizations, audit_log) are not freely mutable.
async function probePostgrestBypass({ ownedProperty, ownedLease }) {
  // (a) baseline SELECT of own lease by id.
  {
    const { status, json } = await rest(landlordToken, 'GET', `/leases?id=eq.${ownedLease.id}&select=id,tenant_name`)
    const found = Array.isArray(json) && json.length === 1 && json[0].id === ownedLease.id
    check(
      'PostgREST SELECT own lease by id works (token reaches RLS layer)',
      { status, found },
      { status: 200, found: true }
    )
  }

  // (b) cross-org INSERT: lease for a property the caller does not own (random UUID).
  {
    const ghostProperty = randomUUID()
    const { status, json } = await rest(
      landlordToken,
      'POST',
      '/leases',
      {
        property_id: ghostProperty,
        tenant_name: '[PROD-TEST] cross-org-insert-should-fail',
        start_date: '2026-01-01',
        end_date: '2031-12-31',
        status: 'active',
      }
    )
    // RLS WITH CHECK requires property in caller org -> INSERT must be rejected.
    // Expect 403 (RLS violation) or a foreign-key/insert error, NOT 201.
    const inserted = status === 201
    check(
      'PostgREST INSERT lease for unowned property is BLOCKED by RLS (not 201)',
      { inserted, code: json?.code ?? null, status_observed: status },
      { inserted: false, code: json?.code ?? null, status_observed: status }
    )
    // If it somehow inserted, capture id + flag hard.
    if (inserted) {
      report.observations.push({
        SEVERITY: 'CRITICAL',
        note: 'PostgREST INSERT of a lease for an unowned property SUCCEEDED',
        inserted: json,
      })
    }
  }

  // (c) UPDATE a random-UUID (unowned/nonexistent) lease -> 0 rows changed.
  {
    const ghost = randomUUID()
    const { status, json } = await rest(
      landlordToken,
      'PATCH',
      `/leases?id=eq.${ghost}`,
      { tenant_name: '[PROD-TEST] cross-org-update-should-noop' },
      { prefer: 'return=representation' }
    )
    const rowsAffected = Array.isArray(json) ? json.length : null
    check(
      'PostgREST UPDATE of unowned lease affects 0 rows (RLS row-invisible)',
      { status, rowsAffected },
      { status, rowsAffected: 0 }
    )
  }

  // (d) DELETE a random-UUID lease -> 0 rows.
  {
    const ghost = randomUUID()
    const { status, json } = await rest(
      landlordToken,
      'DELETE',
      `/leases?id=eq.${ghost}`,
      undefined,
      { prefer: 'return=representation' }
    )
    const rowsAffected = Array.isArray(json) ? json.length : null
    check(
      'PostgREST DELETE of unowned lease affects 0 rows (RLS row-invisible)',
      { status, rowsAffected },
      { status, rowsAffected: 0 }
    )
  }

  // (e) Document what a user CAN write directly on their OWN lease. This is the
  //     Cycle 1 vein. These are OBSERVATIONS (the DB grants authenticated full
  //     DML on leases within-org), gated only insofar as the write must remain
  //     confined to the caller's own org — which (b)/(c)/(d) already prove.
  const ownWriteProbes = [
    { column: 'recovery_profile', value: { base_year: 9999, note: '[PROD-TEST] direct-write probe' } },
    { column: 'tenant_name', value: '[PROD-TEST] direct-write tenant_name' },
    { column: 'status', value: 'draft' },
  ]
  for (const probe of ownWriteProbes) {
    const { status, json } = await rest(
      landlordToken,
      'PATCH',
      `/leases?id=eq.${ownedLease.id}`,
      { [probe.column]: probe.value },
      { prefer: 'return=representation' }
    )
    const writable = status >= 200 && status < 300 && Array.isArray(json) && json.length === 1
    report.observations.push({
      note: `PostgREST direct write to own lease column "${probe.column}"`,
      column: probe.column,
      writable,
      status,
      by_design: 'DB grants authenticated INSERT/UPDATE on leases within-org; API guards do not apply to direct PostgREST',
    })
  }
  // Restore the lease to its original tenant_name/status so downstream cleanup
  // (which deletes by id anyway) and any parallel readers see sane state.
  await rest(
    landlordToken,
    'PATCH',
    `/leases?id=eq.${ownedLease.id}`,
    { tenant_name: ownedLease.tenant_name, status: 'active' }
  )

  // (f) API-only / privileged tables: a user must not be able to freely mutate
  //     org membership, other users, or audit rows through PostgREST.
  const privilegedWrites = [
    {
      name: 'insert forged audit_log row',
      method: 'POST',
      path: '/audit_log',
      body: {
        table_name: 'leases',
        operation: 'UPDATE',
        row_id: randomUUID(),
        new_data: { note: '[PROD-TEST] forged' },
        organization_id: report.auth.landlord.user_id,
      },
    },
    {
      name: 'rename another org via organizations UPDATE (random id)',
      method: 'PATCH',
      path: `/organizations?id=eq.${randomUUID()}`,
      body: { name: '[PROD-TEST] hijacked' },
    },
  ]
  for (const w of privilegedWrites) {
    const { status, json } = await rest(landlordToken, w.method, w.path, w.body, {
      prefer: 'return=representation',
    })
    // A privileged write is BLOCKED when no off-limits row was mutated. Success
    // criteria: denied (401/403), not-exposed (404), schema-rejected (400/PGRST),
    // or a 2xx that touched 0 rows.
    const rowsAffected = Array.isArray(json) ? json.length : null
    const succeeded = status >= 200 && status < 300 && (rowsAffected === null || rowsAffected > 0)
    check(
      `PostgREST privileged write "${w.name}" does NOT succeed`,
      { succeeded, status_observed: status, rowsAffected },
      { succeeded: false, status_observed: status, rowsAffected }
    )
    if (succeeded) {
      report.observations.push({
        SEVERITY: 'CRITICAL',
        note: `Privileged PostgREST write succeeded: ${w.name}`,
        status,
        json,
      })
    }
  }

  // (g) users UPDATE via PostgREST: probe role escalation. It must NOT write a
  //     new role. Separately record whether the policy denies cleanly or errors.
  {
    const { status, json } = await rest(
      landlordToken,
      'PATCH',
      `/users?id=eq.${report.auth.landlord.user_id}`,
      { role: 'owner' },
      { prefer: 'return=representation' }
    )
    const rowsAffected = Array.isArray(json) ? json.length : null
    const succeeded = status >= 200 && status < 300 && rowsAffected !== null && rowsAffected > 0
    check(
      'PostgREST users UPDATE (role escalation) does NOT write a row',
      { succeeded },
      { succeeded: false }
    )
    // Real finding: the users UPDATE RLS policy recurses (42P17) instead of
    // denying cleanly. Fails-closed (no privesc) but is a broken-policy DoS/500.
    report.observations.push({
      note: 'PostgREST users UPDATE error surface',
      status,
      code: json?.code ?? null,
      message: json?.message ?? null,
      classification:
        json?.code === '42P17'
          ? 'REAL-BUG (low): users RLS UPDATE policy has infinite recursion; any users UPDATE returns 500 instead of a clean deny. Fails-closed (no privilege escalation) but breaks legitimate self-service profile updates via PostgREST and is a broken RLS policy.'
          : 'users UPDATE handled without recursion',
    })
  }

  // (h) HIGH-SEVERITY PROBE: audit_log cross-org SELECT leak. A single
  //     authenticated owner/admin must only see audit rows for THEIR org. The
  //     RLS policy checks role only, not organization_id -> cross-org leak.
  {
    const mine = await rest(landlordToken, 'GET', '/properties?select=organization_id&limit=1')
    const myOrg = Array.isArray(mine.json) && mine.json[0] ? mine.json[0].organization_id : null
    const audit = await rest(
      landlordToken,
      'GET',
      '/audit_log?select=organization_id&limit=1000'
    )
    const rows = Array.isArray(audit.json) ? audit.json : []
    const distinctOrgs = new Set(rows.map((r) => r.organization_id).filter(Boolean))
    const foreignOrgs = [...distinctOrgs].filter((o) => o !== myOrg)
    check(
      'audit_log SELECT via PostgREST is org-scoped (caller sees only their own org rows)',
      { distinctOrgCount: distinctOrgs.size, foreignOrgCount: foreignOrgs.length },
      { distinctOrgCount: myOrg ? 1 : 0, foreignOrgCount: 0 }
    )
    if (foreignOrgs.length > 0) {
      report.observations.push({
        SEVERITY: 'CRITICAL',
        note: 'CROSS-ORG DATA LEAK: audit_log SELECT returns rows from other organizations',
        my_org: myOrg,
        distinct_orgs_visible: distinctOrgs.size,
        foreign_org_sample: foreignOrgs.slice(0, 5),
        rows_sampled: rows.length,
        root_cause:
          'supabase/migrations/20240101000060_fix_rls_performance.sql:458 "Audit log viewable by admins" SELECT policy checks only users.role IN (owner,admin), with NO organization_id scope. audit_log.new_data/old_data carry full financial records (GL amounts, lease recovery_profiles, tenant names) for every org.',
        fix:
          'Add AND organization_id = public.get_user_organization_id() to the audit_log SELECT policy (the column exists and is fully populated).',
      })
    }
  }
}

// ---- 3. Party guard --------------------------------------------------------
async function probePartyGuard() {
  // Tenant CAN reach a tenant route.
  {
    const status = await rawApiStatus(tenantToken, 'GET', '/api/v1/tenant/dashboard')
    check(
      'tenant token CAN reach tenant route /api/v1/tenant/dashboard (200)',
      { status, is2xx: status >= 200 && status < 300 },
      { status, is2xx: true }
    )
  }
  // Tenant CANNOT reach landlord-only routes.
  const landlordOnly = [
    { method: 'GET', path: '/api/v1/properties?limit=1' },
    { method: 'GET', path: '/api/v1/dashboard' },
    { method: 'GET', path: '/api/v1/organization/usage' },
    { method: 'GET', path: '/api/v1/team/members' },
    { method: 'GET', path: '/api/v1/reconciliation/snapshots' },
  ]
  for (const probe of landlordOnly) {
    await expectForbidden({
      label: `tenant token is forbidden from landlord route ${probe.method} ${probe.path}`,
      token: tenantToken,
      ...probe,
    })
  }
  // Landlord CANNOT reach tenant-only routes.
  const tenantOnly = [
    { method: 'GET', path: '/api/v1/tenant/dashboard' },
    { method: 'GET', path: '/api/v1/tenant/disputes?limit=1' },
    { method: 'GET', path: '/api/v1/tenant/notifications/preferences' },
  ]
  for (const probe of tenantOnly) {
    await expectForbidden({
      label: `landlord token is forbidden from tenant route ${probe.method} ${probe.path}`,
      token: landlordToken,
      ...probe,
    })
  }
}

async function expectForbidden({ label, path, method, token, body }) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}` }
  let requestBody
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: requestBody })
  const json = await parseJson(response)
  check(
    label,
    { status: response.status, error_code: json?.error?.code ?? null },
    { status: 403, error_code: 'forbidden' }
  )
}

// ---- HTTP helpers ----------------------------------------------------------
async function apiJson(token, path, options) {
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

async function rawApiStatus(token, method, path, body) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}` }
  let requestBody
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: requestBody })
  await response.text()
  return response.status
}

async function expectApiStatus({ label, token, method, path, expected }) {
  const status = await rawApiStatus(token, method, path)
  check(label, { status }, { status: expected })
}

async function rest(token, method, path, body, opts = {}) {
  const headers = {
    apikey: supabaseAnonKey,
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (opts.prefer) headers['prefer'] = opts.prefer
  const response = await fetch(`${restUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await parseJson(response)
  return { status: response.status, json }
}

async function cleanup(created) {
  const failures = []
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
  }
  if (created.propertyId && created.unitId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}/units/${created.unitId}`)
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    // Verify the property is gone (404 after delete).
    await attemptCleanup(failures, 'verify property deleted (404)', async () => {
      const status = await rawApiStatus(landlordToken, 'GET', `/api/v1/properties/${created.propertyId}`)
      if (status !== 404) throw new Error(`property still readable, status ${status}`)
      report.cleanup.push({ label: 'verify property deleted (404)', ok: true, status })
    })
  }
  if (failures.length > 0) {
    report.ok = false
    report.cleanup.push({ label: 'cleanup incomplete', ok: false, failures })
  }
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${landlordToken}` },
  })
  const text = await response.text()
  const ok = response.status === 204 || response.status === 200
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
}

async function attemptCleanup(failures, label, operation) {
  try {
    await operation()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

async function signInWithPassword({ email, password }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await parseJson(response)
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed for ${email}: ${JSON.stringify(json)}`)
  }
  return json
}

function forgeUnsignedJwt() {
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({
    sub: randomUUID(),
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  return `${header}.${payload}.${Buffer.from('forged-signature').toString('base64url')}`
}

function check(label, actual, expected) {
  const ok = deepEqual(actual, expected)
  report.checks.push({ label, ok, actual, expected })
  // Do NOT throw — a single failing isolation check should not abort the rest of
  // the sweep. We want the full picture. report.ok is computed from all checks.
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

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
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
