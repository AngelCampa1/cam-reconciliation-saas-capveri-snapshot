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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-actual-billed-${runId}`)
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
  const propertyName = `[PROD-TEST] Billing Tower ${suffix}`
  const unitNumber = `Suite-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Billed Tenant ${suffix}`
  const unmatchedTenantName = `[PROD-TEST] Unmatched Billed ${suffix}`
  const fileName = `yardi-actual-billed-prod-stress-${suffix}.csv`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    unmatchedTenantName,
    fileName,
    periodStart,
    periodEnd,
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '300 Prod Stress Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78703',
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
        floor: 4,
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
        start_date: periodStart,
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2025,
          base_year_amount: '5000.00',
          gross_up_base_year: true,
          pro_rata_share: '0.13333',
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
    report.generated.leaseId = lease.id

    const csv = [
      'Tenant,Suite,Billed Amount',
      csvRow([tenantName, unitNumber, '1200.50']),
      csvRow([unmatchedTenantName, 'Suite-NO-MATCH', '800.25']),
    ].join('\n')
    const upload = await uploadBillingCsv({
      propertyId: property.id,
      periodStart,
      periodEnd,
      fileName,
      csv,
    })
    report.generated.actualBilledIds = upload.items.map((item) => item.id)
    check(
      'actual billed upload matches one lease and flags one review row',
      {
        source_type: upload.source_type,
        total_billed: upload.total_billed,
        row_count: upload.row_count,
        matched_row_count: upload.matched_row_count,
        unmatched_row_count: upload.unmatched_row_count,
        items: upload.items.map((item) => ({
          tenant_name: item.tenant_name,
          billed_amount: item.billed_amount,
          suite: item.suite,
          lease_id: item.lease_id,
          match_status: item.match_status,
        })),
        warnings: upload.warnings,
      },
      {
        source_type: 'yardi_recon',
        total_billed: '2000.75',
        row_count: 2,
        matched_row_count: 1,
        unmatched_row_count: 1,
        items: [
          {
            tenant_name: tenantName,
            billed_amount: '1200.5',
            suite: unitNumber,
            lease_id: lease.id,
            match_status: 'matched',
          },
          {
            tenant_name: unmatchedTenantName,
            billed_amount: '800.25',
            suite: 'Suite-NO-MATCH',
            lease_id: null,
            match_status: 'needs_review',
          },
        ],
        warnings: [
          `Row 2 needs review. ${unmatchedTenantName} / suite Suite-NO-MATCH did not match a lease.`,
        ],
      }
    )

    const list = await expectJson(
      `/api/v1/actual-billed/${property.id}?period_start=${periodStart}&period_end=${periodEnd}`,
      { status: 200 }
    )
    check(
      'actual billed list returns uploaded rows',
      {
        property_id: list.property_id,
        total_billed: list.total_billed,
        items: list.items.map((item) => ({
          tenant_name: item.tenant_name,
          billed_amount: item.billed_amount,
          lease_id: item.lease_id,
        })),
      },
      {
        property_id: property.id,
        total_billed: '2000.75',
        items: [
          {
            tenant_name: tenantName,
            billed_amount: '1200.50',
            lease_id: lease.id,
          },
          {
            tenant_name: unmatchedTenantName,
            billed_amount: '800.25',
            lease_id: null,
          },
        ],
      }
    )

    const leakage = await expectJson(
      `/api/v1/leakage/${property.id}?period_start=${periodStart}&period_end=${periodEnd}&include_drafts=true`,
      { status: 200 }
    )
    check(
      'leakage reflects billing data without reconciliation snapshots',
      {
        property_id: leakage.property_id,
        capveri_calculated: leakage.capveri_calculated,
        actual_billed: leakage.actual_billed,
        leakage: leakage.leakage,
        leakage_pct: leakage.leakage_pct,
        has_reconciliation_data: leakage.has_reconciliation_data,
        has_gl_data: leakage.has_gl_data,
        has_billing_data: leakage.has_billing_data,
        breakdown: leakage.breakdown,
      },
      {
        property_id: property.id,
        capveri_calculated: '0',
        actual_billed: '2000.75',
        leakage: '-2000.75',
        leakage_pct: 0,
        has_reconciliation_data: false,
        has_gl_data: false,
        has_billing_data: true,
        breakdown: [
          {
            tenant_name: tenantName,
            calculated_amount: 0,
            billed_amount: 1200.5,
            difference: -1200.5,
            difference_pct: 0,
          },
          {
            tenant_name: unmatchedTenantName,
            calculated_amount: 0,
            billed_amount: 800.25,
            difference: -800.25,
            difference_pct: 0,
          },
        ],
      }
    )
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

async function uploadBillingCsv({
  propertyId,
  periodStart,
  periodEnd,
  fileName,
  csv,
}) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('period_start', periodStart)
  form.set('period_end', periodEnd)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)

  const response = await fetch(`${apiUrl}/api/v1/actual-billed/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
    body: form,
  })
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(
      `POST /api/v1/actual-billed/upload returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function cleanup(created, period) {
  const failures = []
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete actual billed rows', () =>
      deleteActualBilledRows(created.propertyId, period)
    )
    await attemptCleanup(failures, 'verify actual billed rows deleted', () =>
      expectDeletedBillingRows(created.propertyId, period)
    )
  }
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

async function deleteActualBilledRows(propertyId, period) {
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  const ok = response.status === 200
  report.cleanup.push({
    path,
    status: response.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(
      `DELETE ${path} returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }
}

async function expectDeletedBillingRows(propertyId, period) {
  const list = await expectJson(
    `/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`,
    { status: 200 }
  )
  const ok =
    list.total_billed === '0' &&
    Array.isArray(list.items) &&
    list.items.length === 0
  report.cleanup.push({
    path: `/api/v1/actual-billed/${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total_billed: list.total_billed,
      item_count: list.items?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Actual billed rows still present after delete: ${JSON.stringify(list).slice(0, 500)}`
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

function csvRow(values) {
  return values
    .map((value) => {
      const text = String(value)
      return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    })
    .join(',')
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
