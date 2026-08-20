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
  `prod-actual-billed-manual-rematch-${runId}`
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
  const propertyName = `[PROD-TEST] Manual Billing ${suffix}`
  const unitNumber = `Manual-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Manual Tenant ${suffix}`
  const unmatchedTenantName = `[PROD-TEST] Rematch Needed ${suffix}`
  const poolName = `[PROD-TEST] Manual Billing Pool ${suffix}`
  const fileName = `actual-billed-rematch-prod-stress-${suffix}.csv`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    poolId: null,
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    unmatchedTenantName,
    poolName,
    fileName,
    periodStart,
    periodEnd,
    actualBilledIds: [],
  }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '311 Prod Manual Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78705',
        total_rentable_sqft: '22000.00',
        total_usable_sqft: '19800.00',
        common_area_sqft: '2200.00',
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
        rentable_sqft: '3200.00',
        usable_sqft: '2900.00',
        floor: 3,
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
        start_date: periodStart,
        end_date: '2031-12-31',
        status: 'active',
        recovery_profile: {
          base_year: 2025,
          base_year_amount: '6000.00',
          gross_up_base_year: true,
          pro_rata_share: '0.14545',
          cap_type: 'non_cumulative',
          cap_rate: '0.04',
          admin_fee_percentage: '0.01',
          management_fee_percentage: '0.02',
          excluded_pools: [],
          base_year_adjustments: [],
        },
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const pool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: poolName,
          pool_type: 'operating',
          is_gross_up_applicable: true,
          gross_up_target: '0.95',
          description: 'Production E2E disposable manual billing pool',
        },
      }
    )
    created.poolId = pool.id
    report.generated.poolId = pool.id

    const upload = await uploadBillingCsv({
      propertyId: property.id,
      periodStart,
      periodEnd,
      fileName,
      csv: [
        'Tenant,Suite,Billed Amount',
        csvRow([unmatchedTenantName, 'Suite-REVIEW', '111.11']),
      ].join('\n'),
    })
    const reviewRow = upload.items[0]
    report.generated.actualBilledIds.push(reviewRow.id)
    check(
      'actual billed upload creates one review row before rematch',
      {
        source_type: upload.source_type,
        total_billed: upload.total_billed,
        row_count: upload.row_count,
        matched_row_count: upload.matched_row_count,
        unmatched_row_count: upload.unmatched_row_count,
        item: {
          tenant_name: reviewRow.tenant_name,
          billed_amount: reviewRow.billed_amount,
          suite: reviewRow.suite,
          lease_id: reviewRow.lease_id,
          match_status: reviewRow.match_status,
        },
        warnings: upload.warnings,
      },
      {
        source_type: 'csv_import',
        total_billed: '111.11',
        row_count: 1,
        matched_row_count: 0,
        unmatched_row_count: 1,
        item: {
          tenant_name: unmatchedTenantName,
          billed_amount: '111.11',
          suite: 'Suite-REVIEW',
          lease_id: null,
          match_status: 'needs_review',
        },
        warnings: [
          `Row 1 needs review. ${unmatchedTenantName} / suite Suite-REVIEW did not match a lease.`,
        ],
      }
    )

    const duplicateMatch = await expectStatus('/api/v1/actual-billed/matches', {
      method: 'PUT',
      status: 400,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        matches: [
          { actual_billed_id: reviewRow.id, lease_id: lease.id },
          { actual_billed_id: reviewRow.id, lease_id: lease.id },
        ],
      },
    })
    check(
      'actual billed rematch rejects duplicate row ids',
      {
        status: duplicateMatch.status,
        error_code: duplicateMatch.json?.error?.code,
      },
      {
        status: 400,
        error_code: 'duplicate_billing_match',
      }
    )

    const rematch = await expectJson('/api/v1/actual-billed/matches', {
      method: 'PUT',
      status: 200,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        matches: [{ actual_billed_id: reviewRow.id, lease_id: lease.id }],
      },
    })
    check('actual billed rematch updates the review row', rematch, {
      success: true,
      updated_count: 1,
    })

    const negativeManual = await expectStatus('/api/v1/actual-billed/manual', {
      method: 'POST',
      status: 422,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '-1',
        pool_id: pool.id,
      },
    })
    check(
      'manual actual billed rejects negative money',
      {
        status: negativeManual.status,
        error_code: negativeManual.json?.error?.code,
      },
      {
        status: 422,
        error_code: 'invalid_money_amount',
      }
    )

    const unknownPoolManual = await expectStatus(
      '/api/v1/actual-billed/manual',
      {
        method: 'POST',
        status: 404,
        body: {
          property_id: property.id,
          period_start: periodStart,
          period_end: periodEnd,
          total_billed: '1',
          pool_id: randomUUID(),
        },
      }
    )
    check(
      'manual actual billed rejects unknown pools',
      {
        status: unknownPoolManual.status,
        error_code: unknownPoolManual.json?.error?.code,
      },
      {
        status: 404,
        error_code: 'pool_not_found',
      }
    )

    const manual = await expectJson('/api/v1/actual-billed/manual', {
      method: 'POST',
      status: 200,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '300.75',
        pool_id: pool.id,
      },
    })
    report.generated.manualActualBilledId = manual.id
    report.generated.actualBilledIds.push(manual.id)
    check(
      'manual actual billed creates a pool scoped row',
      {
        property_id: manual.property_id,
        period_start: manual.period_start,
        period_end: manual.period_end,
        total_billed: manual.total_billed,
        pool_id: manual.pool_id,
      },
      {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '300.75',
        pool_id: pool.id,
      }
    )

    const list = await expectJson(
      `/api/v1/actual-billed/${property.id}?period_start=${periodStart}&period_end=${periodEnd}`,
      { status: 200 }
    )
    check(
      'actual billed list reflects rematch and manual entry',
      {
        property_id: list.property_id,
        period_start: list.period_start,
        period_end: list.period_end,
        total_billed: list.total_billed,
        items: normalizeBilledRows(list.items),
      },
      {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '411.86',
        items: normalizeBilledRows([
          {
            id: reviewRow.id,
            lease_id: lease.id,
            tenant_name: unmatchedTenantName,
            billed_amount: '111.11',
            source_type: 'csv_import',
            pool_id: null,
          },
          {
            id: manual.id,
            lease_id: null,
            tenant_name: 'TOTAL (Manual Entry)',
            billed_amount: '300.75',
            source_type: 'manual',
            pool_id: pool.id,
          },
        ]),
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
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
      )
    )
    await attemptCleanup(failures, 'verify expense pool deleted', () =>
      expectCleanupStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
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
  const path = `/api/v1/actual-billed/${propertyId}?period_start=${period.periodStart}&period_end=${period.periodEnd}`
  const list = await expectJson(path, { status: 200 })
  const ok =
    list.total_billed === '0' &&
    Array.isArray(list.items) &&
    list.items.length === 0
  report.cleanup.push({
    path,
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

function normalizeBilledRows(rows) {
  return rows
    .map((row) => ({
      id: row.id,
      lease_id: row.lease_id,
      tenant_name: row.tenant_name,
      billed_amount: row.billed_amount,
      source_type: row.source_type,
      pool_id: row.pool_id,
    }))
    .sort(
      (left, right) =>
        left.tenant_name.localeCompare(right.tenant_name) ||
        left.id.localeCompare(right.id)
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

function csvRow(values) {
  return values
    .map((value) => {
      const text = String(value)
      return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
    })
    .join(',')
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
