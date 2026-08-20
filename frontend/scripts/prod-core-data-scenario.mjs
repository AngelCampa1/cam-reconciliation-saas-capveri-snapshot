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
const outputRunId = new Date().toISOString().replace(/[:.]/gu, '-')
const outputDir = resolve(
  repoRoot,
  'e2e-adhoc',
  `prod-core-data-${outputRunId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: outputRunId,
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
  const propertyName = `[PROD-TEST] Stress Office ${suffix}`
  const unitNumber = `Suite ${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Credit Heavy Tenant ${suffix}`
  const created = { leaseId: null, unitId: null, propertyId: null }
  report.generated = { propertyName, unitNumber, tenantName }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '100 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '8750.00',
        common_area_sqft: '1250.00',
        target_occupancy: '0.925',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
        tax_protest_county: 'Travis',
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id
    check(
      'property create persisted exact fields',
      {
        name: property.name,
        total_rentable_sqft: property.total_rentable_sqft,
        total_usable_sqft: property.total_usable_sqft,
        common_area_sqft: property.common_area_sqft,
        target_occupancy: property.target_occupancy,
        boma_standard_version: property.boma_standard_version,
      },
      {
        name: propertyName,
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '8750.00',
        common_area_sqft: '1250.00',
        target_occupancy: '0.9250',
        boma_standard_version: '2024',
      }
    )

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '1875.50',
        usable_sqft: '1625.25',
        floor: 12,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitId = unit.id
    report.generated.unitId = unit.id
    check(
      'unit create persisted exact fields',
      {
        property_id: unit.property_id,
        unit_number: unit.unit_number,
        rentable_sqft: unit.rentable_sqft,
        usable_sqft: unit.usable_sqft,
        floor: unit.floor,
        status: unit.status,
        space_type: unit.space_type,
      },
      {
        property_id: property.id,
        unit_number: unitNumber,
        rentable_sqft: '1875.50',
        usable_sqft: '1625.25',
        floor: 12,
        status: 'occupied',
        space_type: 'office',
      }
    )

    const recoveryProfile = {
      base_year: 2025,
      base_year_amount: '9876.54',
      gross_up_base_year: true,
      pro_rata_share: '0.18755',
      cap_type: 'cumulative_compounding',
      cap_rate: '0.035',
      admin_fee_percentage: '0.015',
      management_fee_percentage: '0.025',
      excluded_pools: ['capital', 'tax'],
      base_year_adjustments: [
        {
          service_name: 'Security desk added after base year',
          imputed_amount: '333.33',
          justification: 'Normalize post-base-year service addition',
        },
      ],
    }
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
        recovery_profile: recoveryProfile,
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id
    check(
      'lease create persisted exact identity',
      {
        property_id: lease.property_id,
        unit_id: lease.unit_id,
        tenant_name: lease.tenant_name,
        start_date: dateOnly(lease.start_date),
        end_date: dateOnly(lease.end_date),
        status: lease.status,
      },
      {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2026-01-01',
        end_date: '2031-12-31',
        status: 'active',
      }
    )
    check(
      'lease recovery profile normalized correctly',
      lease.recovery_profile,
      {
        base_year: 2025,
        base_year_amount: '9876.54',
        gross_up_base_year: true,
        pro_rata_share: '0.18755',
        cap_type: 'cumulative_compounding',
        cap_rate: '0.035',
        admin_fee_percentage: '0.015',
        management_fee_percentage: '0.025',
        excluded_pools: ['capital', 'tax'],
        base_year_adjustments: [
          {
            service_name: 'Security desk added after base year',
            imputed_amount: '333.33',
            justification: 'Normalize post-base-year service addition',
          },
        ],
      }
    )

    const leaseList = await expectJson(
      `/api/v1/leases?property_id=${property.id}&status=active&skip=0&limit=10`,
      { status: 200 }
    )
    check(
      'lease list returns generated lease only',
      {
        count: leaseList.count,
        has_more: leaseList.has_more,
        ids: leaseList.data.map((item) => item.id),
      },
      {
        count: 1,
        has_more: false,
        ids: [lease.id],
      }
    )

    const profile = await expectJson(
      `/api/v1/leases/${lease.id}/recovery-profile`,
      {
        status: 200,
      }
    )
    check(
      'recovery profile detail matches create response',
      profile,
      lease.recovery_profile
    )
  } finally {
    await cleanup(created)
  }
}

async function cleanup(created) {
  const failures = []
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`
      )
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
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
  if (!ok)
    throw new Error(
      `DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
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
  if (!ok)
    throw new Error(
      `${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`
    )
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

function dateOnly(value) {
  return String(value).slice(0, 10)
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
