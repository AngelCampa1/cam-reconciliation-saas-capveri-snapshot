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
  `prod-core-data-update-${runId}`
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
  const propertyName = `[PROD-TEST] Update Office ${suffix}`
  const updatedPropertyName = `[PROD-TEST] Updated Office ${suffix}`
  const unitNumber = `Update-${suffix.toUpperCase()}`
  const updatedUnitNumber = `Upd-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Update Tenant ${suffix}`
  const updatedTenantName = `[PROD-TEST] Updated Tenant ${suffix}`
  const created = { leaseId: null, unitId: null, propertyId: null }
  report.generated = {
    propertyName,
    updatedPropertyName,
    unitNumber,
    updatedUnitNumber,
    tenantName,
    updatedTenantName,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '810 Prod Update Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78708',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '1000.00',
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
        rentable_sqft: '2000.00',
        usable_sqft: '1750.00',
        floor: 8,
        status: 'occupied',
        space_type: 'office',
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
        end_date: '2030-12-31',
        status: 'draft',
        recovery_profile: initialRecoveryProfile(),
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const updatedProperty = await expectJson(
      `/api/v1/properties/${property.id}`,
      {
        method: 'PUT',
        status: 200,
        body: {
          name: updatedPropertyName,
          address_line1: '811 Prod Update Way',
          address_line2: 'Floor 2',
          city: 'Dallas',
          state: 'TX',
          postal_code: '75201',
          total_rentable_sqft: '12000.00',
          total_usable_sqft: '10800.00',
          common_area_sqft: '1200.00',
          target_occupancy: '0.90',
          boma_standard_version: '2017',
          rsf_measurement_date: '2026-06-01',
          fiscal_year_start_month: 7,
          tax_protest_county: 'Dallas',
          tax_protest_deadline_override: '2026-05-15',
        },
      }
    )
    check(
      'property update persists exact editable fields',
      {
        ...pick(updatedProperty, [
          'id',
          'name',
          'address_line1',
          'address_line2',
          'city',
          'state',
          'postal_code',
          'total_rentable_sqft',
          'total_usable_sqft',
          'common_area_sqft',
          'target_occupancy',
          'boma_standard_version',
          'fiscal_year_start_month',
          'tax_protest_county',
        ]),
        rsf_measurement_date: dateOnly(updatedProperty.rsf_measurement_date),
        tax_protest_deadline_override: dateOnly(
          updatedProperty.tax_protest_deadline_override
        ),
      },
      {
        id: property.id,
        name: updatedPropertyName,
        address_line1: '811 Prod Update Way',
        address_line2: 'Floor 2',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        total_rentable_sqft: '12000.00',
        total_usable_sqft: '10800.00',
        common_area_sqft: '1200.00',
        target_occupancy: '0.9000',
        boma_standard_version: '2017',
        rsf_measurement_date: '2026-06-01',
        fiscal_year_start_month: 7,
        tax_protest_county: 'Dallas',
        tax_protest_deadline_override: '2026-05-15',
      }
    )

    const updatedUnit = await expectJson(
      `/api/v1/properties/${property.id}/units/${unit.id}`,
      {
        method: 'PUT',
        status: 200,
        body: {
          unit_number: updatedUnitNumber,
          rentable_sqft: '2100.00',
          usable_sqft: '1900.00',
          floor: 9,
          status: 'under_renovation',
          space_type: 'laboratory',
        },
      }
    )
    check(
      'unit update persists exact editable fields',
      pick(updatedUnit, [
        'id',
        'property_id',
        'unit_number',
        'rentable_sqft',
        'usable_sqft',
        'floor',
        'status',
        'space_type',
      ]),
      {
        id: unit.id,
        property_id: property.id,
        unit_number: updatedUnitNumber,
        rentable_sqft: '2100.00',
        usable_sqft: '1900.00',
        floor: 9,
        status: 'under_renovation',
        space_type: 'laboratory',
      }
    )

    const unitDetail = await expectJson(
      `/api/v1/properties/${property.id}/units/${unit.id}`,
      { status: 200 }
    )
    check('unit detail reads updated values', unitDetail, updatedUnit)

    const updatedLease = await expectJson(`/api/v1/leases/${lease.id}`, {
      method: 'PUT',
      status: 200,
      body: {
        tenant_name: updatedTenantName,
        start_date: '2026-02-01',
        end_date: '2031-01-31',
        status: 'active',
        document_url: 'https://example.invalid/prod-e2e-update.pdf',
      },
    })
    check(
      'lease update persists identity fields without changing recovery profile',
      {
        id: updatedLease.id,
        property_id: updatedLease.property_id,
        unit_id: updatedLease.unit_id,
        tenant_name: updatedLease.tenant_name,
        start_date: dateOnly(updatedLease.start_date),
        end_date: dateOnly(updatedLease.end_date),
        status: updatedLease.status,
        document_url: updatedLease.document_url,
        recovery_profile: updatedLease.recovery_profile,
      },
      {
        id: lease.id,
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: updatedTenantName,
        start_date: '2026-02-01',
        end_date: '2031-01-31',
        status: 'active',
        document_url: 'https://example.invalid/prod-e2e-update.pdf',
        recovery_profile: lease.recovery_profile,
      }
    )

    const profileLease = await expectJson(
      `/api/v1/leases/${lease.id}/recovery-profile`,
      {
        method: 'PUT',
        status: 200,
        body: {
          base_year_amount: '7777.77',
          gross_up_base_year: false,
          pro_rata_share: '0.175',
          cap_type: 'non_cumulative',
          cap_rate: '0.045',
          admin_fee_percentage: '0.020',
          management_fee_percentage: '0.030',
          excluded_pools: ['capital'],
          base_year_adjustments: [
            {
              service_name: 'Updated security desk',
              imputed_amount: '444.44',
              justification: 'Production E2E update coverage',
            },
          ],
        },
      }
    )
    check(
      'recovery profile update merges and normalizes values',
      profileLease.recovery_profile,
      {
        base_year: 2025,
        base_year_amount: '7777.77',
        gross_up_base_year: false,
        pro_rata_share: '0.175',
        cap_type: 'non_cumulative',
        cap_rate: '0.045',
        admin_fee_percentage: '0.020',
        management_fee_percentage: '0.030',
        excluded_pools: ['capital'],
        base_year_adjustments: [
          {
            service_name: 'Updated security desk',
            imputed_amount: '444.44',
            justification: 'Production E2E update coverage',
          },
        ],
      }
    )

    const leaseDetail = await expectJson(`/api/v1/leases/${lease.id}`, {
      status: 200,
    })
    check(
      'lease detail reads updated profile and identity',
      {
        tenant_name: leaseDetail.tenant_name,
        status: leaseDetail.status,
        recovery_profile: leaseDetail.recovery_profile,
      },
      {
        tenant_name: updatedTenantName,
        status: 'active',
        recovery_profile: profileLease.recovery_profile,
      }
    )
  } finally {
    await cleanup(created)
  }
}

function initialRecoveryProfile() {
  return {
    base_year: 2025,
    base_year_amount: '6000.00',
    gross_up_base_year: true,
    pro_rata_share: '0.1666',
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0.010',
    management_fee_percentage: '0.015',
    excluded_pools: ['tax'],
    base_year_adjustments: [],
  }
}

async function cleanup(created) {
  const failures = []
  if (created.leaseId) {
    await attemptCleanup(failures, 'delete lease', () =>
      deleteEmpty(`/api/v1/leases/${created.leaseId}`)
    )
    await attemptCleanup(failures, 'verify lease deleted', () =>
      expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
    )
  }
  if (created.unitId && created.propertyId) {
    await attemptCleanup(failures, 'delete unit', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/units/${created.unitId}`
      )
    )
    await attemptCleanup(failures, 'verify unit deleted', () =>
      expectStatus(
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
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    await attemptCleanup(failures, 'verify generated lease list empty', () =>
      expectListEmpty(`/api/v1/leases?property_id=${created.propertyId}`)
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
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
}

async function expectListEmpty(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(`GET ${path} returned ${response.status}: ${text}`)
  }
  const body = text ? JSON.parse(text) : null
  const ok =
    body?.count === 0 && Array.isArray(body?.data) && body.data.length === 0
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: JSON.stringify({
      count: body?.count,
      item_count: body?.data?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(`List still contains rows: ${text.slice(0, 500)}`)
  }
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

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
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
