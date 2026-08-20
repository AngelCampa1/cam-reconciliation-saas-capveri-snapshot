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
  `prod-lease-term-version-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
}

let token
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((check) => check.ok)
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
  const propertyName = `[PROD-TEST] Term Version ${suffix}`
  const unitNumber = `Term-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Term Tenant ${suffix}`
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    termVersionIds: [],
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    termVersionIds: [],
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '714 Prod Terms Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78707',
        total_rentable_sqft: '18000.00',
        total_usable_sqft: '16000.00',
        common_area_sqft: '2000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '2400.00',
        usable_sqft: '2100.00',
        floor: 7,
        status: 'occupied',
        space_type: 'retail',
      },
    })
    created.unitId = unit.id
    report.generated.unitId = unit.id

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2026-01-01',
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2025,
          base_year_amount: '5000.00',
          gross_up_base_year: false,
          pro_rata_share: '0.1200',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.01000000',
          management_fee_percentage: '0',
          excluded_pools: [],
          base_year_adjustments: [],
        },
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const invalidCap = await expectStatus(
      `/api/v1/leases/${lease.id}/term-versions`,
      {
        method: 'POST',
        status: 422,
        body: {
          effective_date: '2026-07-01',
          pro_rata_share: '0.1300',
          cap_type: 'cumulative',
        },
      }
    )
    check(
      'term version create rejects cap type without cap rate',
      {
        status: invalidCap.status,
        has_validation_error:
          invalidCap.json?.error?.code === 'validation_error' ||
          invalidCap.json?.detail?.some?.((item) =>
            item.path?.includes('cap_rate')
          ) === true,
      },
      {
        status: 422,
        has_validation_error: true,
      }
    )

    const versionOne = await createTermVersion(lease.id, {
      effective_date: '2026-01-01',
      base_year: 2025,
      base_year_amount: '5000.00',
      gross_up_base_year: true,
      pro_rata_share: '0.12500000',
      cap_type: 'none',
      cap_rate: null,
      admin_fee_percentage: '0.05000000',
      management_fee_percentage: '0.01000000',
      excluded_pools: ['capital'],
      amendment_reason: 'Initial production E2E term version',
    })
    const versionTwo = await createTermVersion(lease.id, {
      effective_date: '2026-07-01',
      base_year: 2025,
      base_year_amount: '5250.00',
      gross_up_base_year: true,
      pro_rata_share: '0.15000000',
      cap_type: 'non_cumulative',
      cap_rate: '0.04000000',
      admin_fee_percentage: '0.07500000',
      management_fee_percentage: '0.02000000',
      excluded_pools: ['capital', 'tax'],
      amendment_reason: 'Expansion production E2E term version',
    })
    created.termVersionIds.push(versionOne.id, versionTwo.id)
    report.generated.termVersionIds.push(versionOne.id, versionTwo.id)
    report.generated.termVersionId = versionTwo.id

    check(
      'term version creates increment versions and normalize decimals',
      normalizeVersions([versionOne, versionTwo]),
      [
        {
          id: versionOne.id,
          lease_id: lease.id,
          version_number: 1,
          effective_date: '2026-01-01',
          pro_rata_share: '0.12500000',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.05000000',
          management_fee_percentage: '0.01000000',
          excluded_pools: ['capital'],
          amendment_reason: 'Initial production E2E term version',
        },
        {
          id: versionTwo.id,
          lease_id: lease.id,
          version_number: 2,
          effective_date: '2026-07-01',
          pro_rata_share: '0.15000000',
          cap_type: 'non_cumulative',
          cap_rate: '0.04000000',
          admin_fee_percentage: '0.07500000',
          management_fee_percentage: '0.02000000',
          excluded_pools: ['capital', 'tax'],
          amendment_reason: 'Expansion production E2E term version',
        },
      ]
    )

    const versions = await expectJson(
      `/api/v1/leases/${lease.id}/term-versions`,
      { status: 200 }
    )
    check(
      'term version list orders newest effective date first',
      versions.map((version) => ({
        id: version.id,
        version_number: version.version_number,
        effective_date: version.effective_date,
        pro_rata_share: version.pro_rata_share,
        cap_type: version.cap_type,
      })),
      [
        {
          id: versionTwo.id,
          version_number: 2,
          effective_date: '2026-07-01',
          pro_rata_share: '0.15000000',
          cap_type: 'non_cumulative',
        },
        {
          id: versionOne.id,
          version_number: 1,
          effective_date: '2026-01-01',
          pro_rata_share: '0.12500000',
          cap_type: 'none',
        },
      ]
    )

    const earlyEffective = await expectJson(
      `/api/v1/leases/${lease.id}/term-versions/effective?as_of=2026-03-31`,
      { status: 200 }
    )
    const lateEffective = await expectJson(
      `/api/v1/leases/${lease.id}/term-versions/effective?as_of=2026-10-01`,
      { status: 200 }
    )
    check(
      'effective term version lookup picks the latest eligible version',
      {
        early_id: earlyEffective.id,
        early_effective_date: earlyEffective.effective_date,
        late_id: lateEffective.id,
        late_effective_date: lateEffective.effective_date,
        late_cap_type: lateEffective.cap_type,
        late_cap_rate: lateEffective.cap_rate,
      },
      {
        early_id: versionOne.id,
        early_effective_date: '2026-01-01',
        late_id: versionTwo.id,
        late_effective_date: '2026-07-01',
        late_cap_type: 'non_cumulative',
        late_cap_rate: '0.04000000',
      }
    )

    await deleteTermVersion(lease.id, versionTwo.id)
    created.termVersionIds = created.termVersionIds.filter(
      (id) => id !== versionTwo.id
    )
    const deletedVersion = await expectStatus(
      `/api/v1/leases/${lease.id}/term-versions/${versionTwo.id}`,
      { status: 404 }
    )
    const fallbackEffective = await expectJson(
      `/api/v1/leases/${lease.id}/term-versions/effective?as_of=2026-10-01`,
      { status: 200 }
    )
    check(
      'effective lookup falls back after deleting newest term version',
      {
        deleted_status: deletedVersion.status,
        fallback_id: fallbackEffective.id,
        fallback_effective_date: fallbackEffective.effective_date,
      },
      {
        deleted_status: 404,
        fallback_id: versionOne.id,
        fallback_effective_date: '2026-01-01',
      }
    )
  } finally {
    await cleanup(created)
  }
}

async function createTermVersion(leaseId, body) {
  return expectJson(`/api/v1/leases/${leaseId}/term-versions`, {
    method: 'POST',
    status: 201,
    body,
  })
}

async function deleteTermVersion(leaseId, versionId) {
  const path = `/api/v1/leases/${leaseId}/term-versions/${versionId}`
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
}

async function cleanup(created) {
  const failures = []
  for (const versionId of [...created.termVersionIds].reverse()) {
    if (!created.leaseId) continue
    await attemptCleanup(failures, 'delete lease term version', () =>
      deleteTermVersion(created.leaseId, versionId)
    )
    await attemptCleanup(failures, 'verify lease term version deleted', () =>
      expectCleanupStatus(
        `/api/v1/leases/${created.leaseId}/term-versions/${versionId}`,
        { status: 404 }
      )
    )
  }
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
    await attemptCleanup(failures, 'verify lease deleted', () =>
      expectCleanupStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`
      )
    )
    await attemptCleanup(failures, 'verify unit deleted', () =>
      expectCleanupStatus(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, {
        status: 404,
      })
    )
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
    report.cleanup.push({
      label,
      ok: false,
      error: errorMessage(error),
    })
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
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function expectStatus(path, options) {
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
  return {
    status: response.status,
    json: parseJsonOrNull(text),
    text,
  }
}

async function expectCleanupStatus(path, options) {
  const result = await expectStatus(path, options)
  report.cleanup.push({
    path,
    status: result.status,
    ok: true,
    body_preview: result.text.slice(0, 200),
  })
  return result
}

async function deleteEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`
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
        apikey: env.VITE_SUPABASE_ANON_KEY,
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
  report.auth = {
    user_id: json.user?.id ?? null,
    email: json.user?.email ?? env.E2E_PROD_EMAIL,
  }
  return json.access_token
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

function normalizeVersions(versions) {
  return versions.map((version) => ({
    id: version.id,
    lease_id: version.lease_id,
    version_number: version.version_number,
    effective_date: version.effective_date,
    pro_rata_share: version.pro_rata_share,
    cap_type: version.cap_type,
    cap_rate: version.cap_rate,
    admin_fee_percentage: version.admin_fee_percentage,
    management_fee_percentage: version.management_fee_percentage,
    excluded_pools: version.excluded_pools,
    amendment_reason: version.amendment_reason,
  }))
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

function parseJsonOrNull(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
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
