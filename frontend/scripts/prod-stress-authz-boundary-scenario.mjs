// Prod E2E stress scenario: authorization / party / cross-org isolation
// boundaries on the LIVE prod API.
//
// Exercises the authMiddleware party guard (fail-safe deny: routes are
// landlord-only unless they opt into tenant access), unauthenticated /
// malformed-credential rejection, cross-party access denial (a tenant JWT —
// whose actor.organizationId equals the landlord's org — must NOT reach
// landlord routes, and a landlord JWT must NOT reach tenant routes), and
// org-scoped IDOR behavior (a random property id returns 404, not data).
//
// Ordering matters: the party guard fires in middleware BEFORE the handler,
// so a tenant hitting a landlord property-by-id route gets 403 (guard), not
// 404 (org scope) — this scenario asserts that ordering explicitly.
//
// All created entities are prefixed "[PROD-TEST]" and cleaned up in finally.
// Unlike the GL scenario, check() records failures instead of throwing, so a
// single boundary regression does not mask the rest of the audit surface.
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
const runId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-stress-authz-boundary-${runId}`
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
let tenantToken = null
try {
  landlordToken = await signIn('landlord', env.E2E_PROD_EMAIL, env.E2E_PROD_PASSWORD)
  tenantToken = await signIn('tenant', env.E2E_PROD_TENANT_EMAIL, env.E2E_PROD_TENANT_PASSWORD)
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

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const created = { propertyIds: [] }
  report.generated = { suffix, propertyIds: created.propertyIds }

  // Confirm the two accounts resolve to the parties we expect. If the tenant
  // account is not actually a tenant party, the cross-party tests below are
  // meaningless, so surface it loudly.
  await verifyPartyIdentities()

  try {
    // A real landlord-owned property gives us a genuine resource id to prove
    // that the party guard denies a tenant BEFORE org-scoping can 404 it.
    const property = await createLandlordProperty(
      `[PROD-TEST] AuthZ Boundary ${suffix}`
    )
    created.propertyIds.push(property.id)
    report.generated.landlordPropertyId = property.id

    await unauthenticatedChecks(property.id)
    await tenantVsLandlordRoutes(property.id)
    await landlordVsTenantRoutes()
    await positiveControls(property.id)
    await orgScopeIdorChecks(property.id)
    await guardOrderingChecks(property.id)
  } finally {
    await cleanup(created)
  }
}

// ---------------------------------------------------------------------------
// identity sanity
// ---------------------------------------------------------------------------

async function verifyPartyIdentities() {
  // Landlord reaches a landlord-only route; tenant reaches a tenant-only route.
  const landlordList = await probe('GET', '/api/v1/properties', {
    token: landlordToken,
  })
  check(
    'IDENT landlord token is accepted on landlord route (party=landlord)',
    { status: landlordList.status },
    { status: 200 }
  )
  const tenantDash = await probe('GET', '/api/v1/tenant/dashboard', {
    token: tenantToken,
  })
  check(
    'IDENT tenant token is accepted on tenant route (party=tenant)',
    { status: tenantDash.status },
    { status: 200 }
  )
}

// ---------------------------------------------------------------------------
// U: unauthenticated / malformed credential rejection (landlord-only route)
// ---------------------------------------------------------------------------

async function unauthenticatedChecks(propertyId) {
  const target = '/api/v1/properties'

  const u1 = await probe('GET', target, { token: null })
  check(
    'U1 missing Authorization header -> 401 authorization_required',
    { status: u1.status, code: errorCode(u1.json) },
    { status: 401, code: 'authorization_required' }
  )

  const u2 = await probe('GET', target, { rawAuth: `Token ${landlordToken}` })
  check(
    'U2 non-Bearer scheme -> 401 invalid_authorization',
    { status: u2.status, code: errorCode(u2.json) },
    { status: 401, code: 'invalid_authorization' }
  )

  const u3 = await probe('GET', target, {
    rawAuth: `Bearer ${landlordToken} extrapart`,
  })
  check(
    'U3 Bearer with trailing extra token -> 401 invalid_authorization',
    { status: u3.status, code: errorCode(u3.json) },
    { status: 401, code: 'invalid_authorization' }
  )

  const u4 = await probe('GET', target, { rawAuth: 'Bearer ' })
  check(
    'U4 Bearer with empty token -> 401 invalid_authorization',
    { status: u4.status, code: errorCode(u4.json) },
    { status: 401, code: 'invalid_authorization' }
  )

  const u5 = await probe('GET', target, {
    rawAuth: 'Bearer not-a-real-jwt.abc.def',
  })
  check(
    'U5 garbage bearer token -> 401 invalid_token',
    { status: u5.status, code: errorCode(u5.json) },
    { status: 401, code: 'invalid_token' }
  )

  const u6 = await probe('GET', target, { rawAuth: 'bearer ' + landlordToken })
  check(
    'U6 lowercase bearer scheme -> 401 invalid_authorization (scheme is case-sensitive)',
    { status: u6.status, code: errorCode(u6.json) },
    { status: 401, code: 'invalid_authorization' }
  )

  // A tampered JWT (valid-looking but bad signature) must be rejected as
  // invalid_token, not silently accepted.
  const tampered = tamperJwt(landlordToken)
  const u7 = await probe('GET', target, { rawAuth: `Bearer ${tampered}` })
  check(
    'U7 signature-tampered JWT -> 401 invalid_token',
    { status: u7.status, code: errorCode(u7.json) },
    { status: 401, code: 'invalid_token' }
  )

  // Unauthenticated access to a real resource id must not leak it either.
  const u8 = await probe('GET', `/api/v1/properties/${propertyId}`, {
    token: null,
  })
  check(
    'U8 unauthenticated property-by-id -> 401, no resource leak',
    { status: u8.status, code: errorCode(u8.json) },
    { status: 401, code: 'authorization_required' }
  )
}

// ---------------------------------------------------------------------------
// P: tenant JWT must NOT reach landlord-only routes (default-deny party guard)
// ---------------------------------------------------------------------------

async function tenantVsLandlordRoutes(landlordPropertyId) {
  const forbidden = { status: 403, code: 'forbidden' }

  const p1 = await probe('GET', '/api/v1/properties', { token: tenantToken })
  check(
    'P1 tenant -> landlord property list -> 403 forbidden',
    { status: p1.status, code: errorCode(p1.json) },
    forbidden
  )

  const p2 = await probe('GET', '/api/v1/dashboard', { token: tenantToken })
  check(
    'P2 tenant -> landlord dashboard -> 403 forbidden',
    { status: p2.status, code: errorCode(p2.json) },
    forbidden
  )

  // Data-bearing landlord ingestion route on a REAL landlord property id.
  const p3 = await probe(
    'GET',
    `/api/v1/ingestion/gl-date-range/${landlordPropertyId}`,
    { token: tenantToken }
  )
  check(
    'P3 tenant -> landlord GL data route (real property id) -> 403 forbidden',
    { status: p3.status, code: errorCode(p3.json) },
    forbidden
  )

  // Write attempt: tenant creating a landlord property must be blocked by the
  // guard before the handler runs (no row is created).
  const p4 = await probe('POST', '/api/v1/properties', {
    token: tenantToken,
    body: propertyBody(`[PROD-TEST] Tenant Should Not Create`),
  })
  check(
    'P4 tenant -> POST landlord property (write) -> 403 forbidden',
    { status: p4.status, code: errorCode(p4.json) },
    forbidden
  )

  // Destructive attempt: tenant deleting the landlord property must be blocked
  // (this both proves the guard AND protects our fixture).
  const p5 = await probe('DELETE', `/api/v1/properties/${landlordPropertyId}`, {
    token: tenantToken,
  })
  check(
    'P5 tenant -> DELETE landlord property (destructive) -> 403 forbidden',
    { status: p5.status, code: errorCode(p5.json) },
    forbidden
  )
}

// ---------------------------------------------------------------------------
// L: landlord JWT must NOT reach tenant-only routes
// ---------------------------------------------------------------------------

async function landlordVsTenantRoutes() {
  const forbidden = { status: 403, code: 'forbidden' }

  const l1 = await probe('GET', '/api/v1/tenant/dashboard', {
    token: landlordToken,
  })
  check(
    'L1 landlord -> tenant dashboard -> 403 forbidden',
    { status: l1.status, code: errorCode(l1.json) },
    forbidden
  )

  const l2 = await probe('GET', '/api/v1/tenant/disputes', {
    token: landlordToken,
  })
  check(
    'L2 landlord -> tenant disputes list -> 403 forbidden',
    { status: l2.status, code: errorCode(l2.json) },
    forbidden
  )

  const l3 = await probe('GET', '/api/v1/tenant/notifications', {
    token: landlordToken,
  })
  check(
    'L3 landlord -> tenant notifications -> 403 forbidden',
    { status: l3.status, code: errorCode(l3.json) },
    forbidden
  )

  // Landlord writing into the tenant dispute surface must also be blocked.
  const l4 = await probe('POST', '/api/v1/tenant/disputes', {
    token: landlordToken,
    body: { note: 'landlord should not reach this' },
  })
  check(
    'L4 landlord -> POST tenant dispute (write) -> 403 forbidden',
    { status: l4.status, code: errorCode(l4.json) },
    forbidden
  )
}

// ---------------------------------------------------------------------------
// C: positive controls — the guard must not over-block the correct party
// ---------------------------------------------------------------------------

async function positiveControls(landlordPropertyId) {
  const c1 = await probe('GET', '/api/v1/properties', { token: landlordToken })
  check(
    'C1 landlord -> landlord property list -> 200 (paginated envelope with data[])',
    { status: c1.status, has_data: Array.isArray(c1.json?.data) },
    { status: 200, has_data: true }
  )

  const c2 = await probe(
    'GET',
    `/api/v1/properties/${landlordPropertyId}`,
    { token: landlordToken }
  )
  check(
    'C2 landlord -> own property by id -> 200 with matching id',
    { status: c2.status, id: c2.json?.id ?? null },
    { status: 200, id: landlordPropertyId }
  )

  const c3 = await probe('GET', '/api/v1/tenant/dashboard', {
    token: tenantToken,
  })
  check(
    'C3 tenant -> tenant dashboard -> 200',
    { status: c3.status },
    { status: 200 }
  )

  const c4 = await probe('GET', '/api/v1/tenant/disputes', {
    token: tenantToken,
  })
  check(
    'C4 tenant -> tenant disputes list -> 200',
    { status: c4.status },
    { status: 200 }
  )
}

// ---------------------------------------------------------------------------
// I: org-scoped IDOR — landlord cannot read arbitrary / other-org resources
// ---------------------------------------------------------------------------

async function orgScopeIdorChecks(landlordPropertyId) {
  const randomId = randomUUID()
  const i1 = await probe('GET', `/api/v1/properties/${randomId}`, {
    token: landlordToken,
  })
  check(
    'I1 landlord -> random property id -> 404 property_not_found (org-scoped)',
    { status: i1.status, code: errorCode(i1.json) },
    { status: 404, code: 'property_not_found' }
  )

  // Nil UUID is a valid UUID string but belongs to no org.
  const i2 = await probe(
    'GET',
    '/api/v1/properties/00000000-0000-0000-0000-000000000000',
    { token: landlordToken }
  )
  check(
    'I2 landlord -> nil-uuid property id -> 404 property_not_found',
    { status: i2.status, code: errorCode(i2.json) },
    { status: 404, code: 'property_not_found' }
  )

  // Malformed (non-UUID) id fails validation with 422 for an authorized
  // landlord (handler-level Zod parse).
  const i3 = await probe('GET', '/api/v1/properties/not-a-uuid', {
    token: landlordToken,
  })
  check(
    'I3 landlord -> malformed property id -> 422 validation_error',
    { status: i3.status, code: errorCode(i3.json) },
    { status: 422, code: 'validation_error' }
  )

  // Sub-resources of the real property must remain reachable by the owner
  // (confirms org-scope allows the owner, only denies cross-org).
  const i4 = await probe(
    'GET',
    `/api/v1/properties/${landlordPropertyId}/units`,
    { token: landlordToken }
  )
  check(
    'I4 landlord -> own property units -> 200 (owner org-scope allowed)',
    { status: i4.status },
    { status: 200 }
  )
}

// ---------------------------------------------------------------------------
// G: guard-ordering proof — party guard fires BEFORE handler-level checks
// ---------------------------------------------------------------------------

async function guardOrderingChecks(landlordPropertyId) {
  // Tenant hitting a landlord property-by-id with a REAL id: if org-scoping
  // ran first the tenant (same org id as landlord) might see 200/404; the
  // guard must intercept with 403 before either can happen.
  const g1 = await probe(
    'GET',
    `/api/v1/properties/${landlordPropertyId}`,
    { token: tenantToken }
  )
  check(
    'G1 tenant -> landlord property by REAL id -> 403 forbidden (guard before org-scope)',
    { status: g1.status, code: errorCode(g1.json) },
    { status: 403, code: 'forbidden' }
  )

  // Tenant hitting a landlord route with a MALFORMED id: the party guard must
  // still win over the handler's Zod validation (403, not 422).
  const g2 = await probe('GET', '/api/v1/properties/not-a-uuid', {
    token: tenantToken,
  })
  check(
    'G2 tenant -> landlord route with malformed id -> 403 forbidden (guard before validation)',
    { status: g2.status, code: errorCode(g2.json) },
    { status: 403, code: 'forbidden' }
  )

  // Landlord hitting a tenant route with a malformed id: guard must win over
  // handler validation (403, not 422/404).
  const g3 = await probe(
    'POST',
    '/api/v1/tenant/notifications/not-a-uuid/read',
    { token: landlordToken }
  )
  check(
    'G3 landlord -> tenant route with malformed id -> 403 forbidden (guard before validation)',
    { status: g3.status, code: errorCode(g3.json) },
    { status: 403, code: 'forbidden' }
  )
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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
    address_line1: '403 Forbidden Way',
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

// Invalidate the JWT signature while keeping the structural shape valid.
// NOTE: flipping the LAST base64url char is not safe — for a 64-byte ES256
// signature the trailing char carries non-significant padding bits, so the
// decoded bytes (and thus the signature the server verifies) can be
// unchanged, leaving the token VALID and this check a silent false-negative.
// Instead, flip a real signature byte and assert the decoded bytes differ.
function tamperJwt(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return token + 'x'
  const sigBytes = Buffer.from(parts[2], 'base64url')
  if (sigBytes.length === 0) return token + 'x'
  const mutated = Buffer.from(sigBytes)
  const i = Math.floor(mutated.length / 2)
  mutated[i] = mutated[i] ^ 0xff
  if (mutated.equals(sigBytes)) {
    throw new Error('tamperJwt: signature bytes unchanged after mutation')
  }
  parts[2] = mutated.toString('base64url')
  return parts.join('.')
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
