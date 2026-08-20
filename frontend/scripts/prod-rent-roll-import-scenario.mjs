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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-rent-roll-${runId}`)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
  auth: {},
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
  const propertyName = `[PROD-TEST] Rent Roll Tower ${suffix}`
  const fileName = `yardi-rent-roll-prod-stress-${suffix}.csv`
  const csv = rentRollCsv(propertyName)
  const created = { propertyId: null, leaseIds: [], unitIds: [] }
  report.generated = { propertyName, fileName }

  try {
    const preview = await uploadRentRoll('/api/v1/rent-roll/preview', {
      fileName,
      csv,
      status: 200,
    })
    check(
      'rent roll preview parses valid rows and warnings',
      {
        success: preview.success,
        source_system: preview.source_system,
        property_metadata: preview.property_metadata,
        row_count: preview.row_count,
        error_count: preview.error_count,
        total_units: preview.total_units,
        occupied_units: preview.occupied_units,
        unit_numbers: preview.units.map((unit) => unit.unit_number),
        warnings_include_duplicate: preview.warnings.some((warning) =>
          warning.includes('Duplicate unit number')
        ),
        warnings_include_invalid_sqft: preview.warnings.some((warning) =>
          warning.includes('Missing or invalid rentable_sqft')
        ),
      },
      {
        success: true,
        source_system: 'yardi_rent_roll',
        property_metadata: {
          name: propertyName,
          address_line1: '600 Fixture Plaza',
          city: 'Austin',
          state: 'TX',
          postal_code: '78701',
        },
        row_count: 3,
        error_count: 0,
        total_units: 3,
        occupied_units: 2,
        unit_numbers: ['100', '200', '300'],
        warnings_include_duplicate: true,
        warnings_include_invalid_sqft: true,
      }
    )

    const imported = await uploadRentRoll('/api/v1/rent-roll/import', {
      fileName,
      csv,
      status: 201,
      fields: {
        property_name: propertyName,
        address: '600 Fixture Plaza',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
      },
    })
    created.propertyId = imported.property_id
    report.generated.propertyId = imported.property_id
    check(
      'rent roll import creates property units and occupied leases',
      {
        success: imported.success,
        property_id_present:
          typeof imported.property_id === 'string' &&
          imported.property_id.length > 0,
        property_name: imported.property_name,
        units_created: imported.units_created,
        leases_created: imported.leases_created,
        warnings_include_duplicate: imported.warnings.some((warning) =>
          warning.includes('Duplicate unit number')
        ),
        warnings_include_invalid_sqft: imported.warnings.some((warning) =>
          warning.includes('Missing or invalid rentable_sqft')
        ),
      },
      {
        success: true,
        property_id_present: true,
        property_name: propertyName,
        units_created: 3,
        leases_created: 2,
        warnings_include_duplicate: true,
        warnings_include_invalid_sqft: true,
      }
    )

    const property = await expectJson(
      `/api/v1/properties/${imported.property_id}`,
      {
        status: 200,
      }
    )
    check(
      'imported property totals are deterministic decimal math',
      pick(property, [
        'name',
        'address_line1',
        'city',
        'state',
        'postal_code',
        'total_rentable_sqft',
        'total_usable_sqft',
        'common_area_sqft',
        'target_occupancy',
      ]),
      {
        name: propertyName,
        address_line1: '600 Fixture Plaza',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '3650.50',
        total_usable_sqft: '3310.25',
        common_area_sqft: '340.25',
        target_occupancy: '0.9500',
      }
    )

    const units = await expectJson(
      `/api/v1/properties/${imported.property_id}/units?skip=0&limit=20`,
      { status: 200 }
    )
    created.unitIds = units.data.map((unit) => unit.id)
    report.generated.unitIds = created.unitIds
    check(
      'imported unit list contains occupied and vacant units',
      units.data
        .map((unit) =>
          pick(unit, [
            'unit_number',
            'rentable_sqft',
            'usable_sqft',
            'floor',
            'status',
          ])
        )
        .sort((a, b) => a.unit_number.localeCompare(b.unit_number)),
      [
        {
          unit_number: '100',
          rentable_sqft: '1250.50',
          usable_sqft: '1100.25',
          floor: 1,
          status: 'occupied',
        },
        {
          unit_number: '200',
          rentable_sqft: '900.00',
          usable_sqft: '810.00',
          floor: 2,
          status: 'vacant',
        },
        {
          unit_number: '300',
          rentable_sqft: '1500.00',
          usable_sqft: '1400.00',
          floor: 3,
          status: 'occupied',
        },
      ]
    )

    const leases = await expectJson(
      `/api/v1/leases?property_id=${imported.property_id}&skip=0&limit=20`,
      { status: 200 }
    )
    created.leaseIds = leases.data.map((lease) => lease.id)
    report.generated.leaseIds = created.leaseIds
    check(
      'imported lease list contains occupied tenants only',
      leases.data
        .map((lease) => ({
          tenant_name: lease.tenant_name,
          start_date: String(lease.start_date).slice(0, 10),
          end_date: String(lease.end_date).slice(0, 10),
          status: lease.status,
          recovery_profile: lease.recovery_profile,
        }))
        .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name)),
      [
        {
          tenant_name: `[PROD-TEST] Alpha LLC ${propertyName.slice(-8)}`,
          start_date: '2026-01-01',
          end_date: '2030-12-31',
          status: 'active',
          recovery_profile: expectedProfile('0.1850'),
        },
        {
          tenant_name: `[PROD-TEST] Beta LLC ${propertyName.slice(-8)}`,
          start_date: '2026-02-15',
          end_date: '2031-02-14',
          status: 'active',
          recovery_profile: expectedProfile('0.1250'),
        },
      ]
    )

    const imports = await expectJson(
      `/api/v1/properties/${imported.property_id}/imports?page=1&size=10`,
      { status: 200 }
    )
    check('rent roll import does not create GL import batches', imports, {
      imports: [],
      total: 0,
    })
  } finally {
    await cleanup(created)
  }
}

async function cleanup(created) {
  const failures = []

  for (const leaseId of created.leaseIds) {
    await attemptCleanup(failures, `delete lease ${leaseId}`, () =>
      deleteEmpty(`/api/v1/leases/${leaseId}`)
    )
  }
  for (const unitId of created.unitIds) {
    await attemptCleanup(failures, `delete unit ${unitId}`, () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}/units/${unitId}`)
    )
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete rent roll property', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify rent roll property deleted', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    await attemptCleanup(failures, 'verify rent roll leases deleted', () =>
      expectListEmpty(`/api/v1/leases?property_id=${created.propertyId}`)
    )
    await attemptCleanup(failures, 'verify rent roll units inaccessible', () =>
      expectStatus(`/api/v1/properties/${created.propertyId}/units`, {
        status: 404,
      })
    )
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function uploadRentRoll(path, options) {
  const form = new FormData()
  form.set(
    'file',
    new Blob([options.csv], { type: 'text/csv' }),
    options.fileName
  )
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.set(key, value)
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `POST ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
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
    throw new Error(
      `GET ${path} returned ${response.status}: ${text.slice(0, 500)}`
    )
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
    throw new Error(
      `List still contains rows after cleanup: ${text.slice(0, 500)}`
    )
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

function rentRollCsv(propertyName) {
  const suffix = propertyName.slice(-8)
  return [
    'Yardi Voyager Rent Roll',
    `Property: ${propertyName}`,
    'Address: 600 Fixture Plaza, Austin, TX 78701',
    '',
    'Unit Number,Rentable SF,Usable SF,Floor,Tenant,Lease Start,Lease End,Monthly Rent,CAM %',
    `100,"1,250.50","1,100.25",1,[PROD-TEST] Alpha LLC ${suffix},01/01/2026,12/31/2030,"$10,000.00",18.5%`,
    '200,900,,2,,,,0,',
    `300,1500,1400,3,[PROD-TEST] Beta LLC ${suffix},2026-02-15,2031-02-14,12000,0.125`,
    `300,777,700,3,[PROD-TEST] Duplicate LLC ${suffix},2026-03-01,2031-03-01,7000,9%`,
    `400,not-a-number,800,4,[PROD-TEST] Bad Sqft LLC ${suffix},2026-04-01,2031-04-01,5000,5%`,
    'Total,4427.50,4000,,,,,,',
  ].join('\n')
}

function expectedProfile(proRataShare) {
  return {
    base_year: null,
    base_year_amount: null,
    base_year_adjustments: [],
    gross_up_base_year: false,
    pro_rata_share: proRataShare,
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0',
    management_fee_percentage: null,
    excluded_pools: [],
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
