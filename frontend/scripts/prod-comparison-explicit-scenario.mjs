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
  `prod-comparison-explicit-${runId}`
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
  const propertyName = `[PROD-TEST] Comparison Tower ${suffix}`
  const unitNumber = `Suite-${suffix.toUpperCase()}`
  const tenantName = `[PROD-TEST] Comparison Tenant ${suffix}`
  const unmatchedName = `[PROD-TEST] Unmatched Comparison ${suffix}`
  const poolName = `[PROD-TEST] Comparison Pool ${suffix}`
  const fileName = `yardi-comparison-prod-stress-${suffix}.csv`
  const periodStart = '2026-01-01'
  const periodEnd = '2026-12-31'
  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    poolId: null,
    mappingId: null,
    batchId: null,
    jobId: null,
    snapshotIds: [],
  }
  report.generated = {
    propertyName,
    unitNumber,
    tenantName,
    unmatchedName,
    poolName,
    fileName,
    periodStart,
    periodEnd,
  }

  try {
    const property = await createProperty({
      name: propertyName,
      address_line1: '800 Prod Stress Way',
      city: 'Austin',
      state: 'TX',
      postal_code: '78705',
      total_rentable_sqft: '10000.00',
      total_usable_sqft: '9000.00',
      common_area_sqft: '1000.00',
      target_occupancy: '0.95',
      boma_standard_version: '2024',
      fiscal_year_start_month: 1,
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unit = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: unitNumber,
        rentable_sqft: '2000.00',
        usable_sqft: '1800.00',
        floor: 5,
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
          base_year_amount: '1000.00',
          gross_up_base_year: false,
          pro_rata_share: '0.20',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.10',
          management_fee_percentage: '0',
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
          description: 'Production E2E disposable comparison pool',
        },
      }
    )
    created.poolId = pool.id
    report.generated.poolId = pool.id

    const mapping = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings`,
      {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: pool.id,
          gl_account_pattern: '61*',
          allocation_percentage: '1',
          priority: 10,
        },
      }
    )
    created.mappingId = mapping.id
    report.generated.mappingId = mapping.id

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Janitorial,01/15/2026,5000.00,CleanCo,Annual janitorial',
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    report.generated.batchId = upload.batch_id
    check(
      'gl upload creates one clean row for comparison seed',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      {
        source_system: 'yardi',
        row_count: 1,
        error_count: 0,
      }
    )

    const job = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        force_recalculate: true,
      },
    })
    created.jobId = job.job_id
    report.generated.jobId = job.job_id

    const completedJob = await waitForJob(job.job_id)
    created.snapshotIds = completedJob.snapshot_ids
    report.generated.snapshotIds = completedJob.snapshot_ids
    check(
      'reconciliation job produces comparison baseline',
      {
        status: completedJob.status,
        processed_leases: completedJob.processed_leases,
        snapshot_count: completedJob.snapshot_ids.length,
        potential_recovery_total: completedJob.potential_recovery_total,
      },
      {
        status: 'completed',
        processed_leases: 1,
        snapshot_count: 1,
        potential_recovery_total: '5005.00',
      }
    )

    const snapshotId = completedJob.snapshot_ids[0]
    const snapshot = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'draft snapshot has deterministic comparison baseline',
      {
        property_id: snapshot.property_id,
        lease_id: snapshot.lease_id,
        status: snapshot.status,
        total_operating_expenses: snapshot.total_operating_expenses,
        grossed_up_expenses: snapshot.grossed_up_expenses,
        tenant_share_after_cap: snapshot.tenant_share_after_cap,
        admin_fee: snapshot.admin_fee,
        total_recovery: snapshot.total_recovery,
      },
      {
        property_id: property.id,
        lease_id: lease.id,
        status: 'draft',
        total_operating_expenses: '5000.00',
        grossed_up_expenses: '23750.00',
        tenant_share_after_cap: '4550.00',
        admin_fee: '455.00',
        total_recovery: '5005.00',
      }
    )

    const explicit = await expectJson(`/api/v1/comparison/${property.id}`, {
      method: 'POST',
      status: 200,
      body: {
        period_start: periodStart,
        period_end: periodEnd,
        tolerance: '0.01',
        include_drafts: true,
        charges: [
          {
            lease_id: lease.id,
            tenant_name: tenantName,
            pool_id: pool.id,
            amount: '5200.00',
          },
          {
            tenant_name: unmatchedName,
            amount: '123.45',
          },
        ],
      },
    })
    checkComparisonOutput({
      result: explicit,
      propertyId: property.id,
      periodStart,
      periodEnd,
      leaseId: lease.id,
      tenantName,
      unmatchedName,
      poolId: pool.id,
      poolName,
    })

    const missingDrafts = await expectJson(
      `/api/v1/comparison/${property.id}`,
      {
        method: 'POST',
        status: 200,
        body: {
          period_start: periodStart,
          period_end: periodEnd,
          tolerance: '0.01',
          include_drafts: false,
          charges: [
            {
              lease_id: lease.id,
              tenant_name: tenantName,
              pool_id: pool.id,
              amount: '5200.00',
            },
          ],
        },
      }
    )
    check(
      'comparison excludes draft snapshots unless requested',
      {
        total_capveri_correct: missingDrafts.total_capveri_correct,
        total_actual_charged: missingDrafts.total_actual_charged,
        tenants: missingDrafts.tenants.map((tenant) => ({
          lease_id: tenant.lease_id,
          match_status: tenant.match_status,
          capveri_correct: tenant.capveri_correct,
          actual_charged: tenant.actual_charged,
        })),
      },
      {
        total_capveri_correct: '0',
        total_actual_charged: '5200',
        tenants: [
          {
            lease_id: `unmatched-lease::${lease.id}`,
            match_status: 'needs_review',
            capveri_correct: '0',
            actual_charged: '5200',
          },
        ],
      }
    )

    const invalidPeriod = await expectStatus(
      `/api/v1/comparison/${property.id}`,
      {
        method: 'POST',
        status: 400,
        body: {
          period_start: periodEnd,
          period_end: periodStart,
          charges: [],
        },
      }
    )
    check(
      'comparison rejects reversed periods',
      {
        status: invalidPeriod.status,
        error_code: invalidPeriod.json?.error?.code,
      },
      {
        status: 400,
        error_code: 'invalid_period',
      }
    )

    const storedRuns = await expectJson(
      `/api/v1/comparison/${property.id}/runs?limit=10&offset=0`,
      { status: 200 }
    )
    check('comparison compute route does not persist runs', storedRuns, [])
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

function checkComparisonOutput(input) {
  const byLease = new Map(
    input.result.tenants.map((tenant) => [tenant.lease_id, tenant])
  )
  const matched = byLease.get(input.leaseId)
  const unmatched = byLease.get(`unmatched-name::${input.unmatchedName}`)
  check(
    'explicit comparison returns deterministic totals',
    {
      property_id: input.result.property_id,
      period_start: input.result.period_start,
      period_end: input.result.period_end,
      tolerance: input.result.tolerance,
      total_capveri_correct: input.result.total_capveri_correct,
      total_actual_charged: input.result.total_actual_charged,
      total_net_variance: input.result.total_net_variance,
      total_overcharge: input.result.total_overcharge,
      total_undercharge: input.result.total_undercharge,
      overcharge_count: input.result.overcharge_count,
      undercharge_count: input.result.undercharge_count,
      match_count: input.result.match_count,
      tenant_count: input.result.tenants.length,
    },
    {
      property_id: input.propertyId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      tolerance: '0.01',
      total_capveri_correct: '5005',
      total_actual_charged: '5323.45',
      total_net_variance: '318.45',
      total_overcharge: '318.45',
      total_undercharge: '0',
      overcharge_count: 2,
      undercharge_count: 0,
      match_count: 0,
      tenant_count: 2,
    }
  )
  check(
    'explicit comparison matches lease and unmatched charge rows',
    {
      matched: pickTenantFields(matched),
      unmatched: pickTenantFields(unmatched),
    },
    {
      matched: {
        lease_id: input.leaseId,
        tenant_name: input.tenantName,
        match_status: 'matched',
        match_note: null,
        capveri_correct: '5005',
        actual_charged: '5200',
        variance: '195',
        direction: 'overcharge',
        abs_variance: '195',
        variance_pct: '3.90',
      },
      unmatched: {
        lease_id: `unmatched-name::${input.unmatchedName}`,
        tenant_name: input.unmatchedName,
        match_status: 'needs_review',
        match_note: 'No lease matched this billed row.',
        capveri_correct: '0',
        actual_charged: '123.45',
        variance: '123.45',
        direction: 'overcharge',
        abs_variance: '123.45',
        variance_pct: null,
      },
    }
  )
  check(
    'explicit comparison includes pool-level variance for matched lease',
    matched?.pool_breakdowns,
    [
      {
        pool_id: input.poolId,
        pool_name: input.poolName,
        capveri_correct: '5005',
        actual_charged: '5200',
        variance: '195',
        direction: 'overcharge',
        abs_variance: '195',
        variance_pct: '3.90',
      },
    ]
  )
}

function pickTenantFields(tenant) {
  if (!tenant) return null
  return {
    lease_id: tenant.lease_id,
    tenant_name: tenant.tenant_name,
    match_status: tenant.match_status,
    match_note: tenant.match_note,
    capveri_correct: tenant.capveri_correct,
    actual_charged: tenant.actual_charged,
    variance: tenant.variance,
    direction: tenant.direction,
    abs_variance: tenant.abs_variance,
    variance_pct: tenant.variance_pct,
  }
}

async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)

  const response = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
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
      `POST /api/v1/ingestion/upload returned ${response.status}, expected 200: ${text.slice(0, 500)}`
    )
  }
  return JSON.parse(text)
}

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 90_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, {
      status: 200,
    })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(
        `Reconciliation job failed: ${JSON.stringify(job).slice(0, 500)}`
      )
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function cleanup(created, period) {
  const failures = []
  if (created.batchId) {
    await attemptCleanup(failures, 'delete ingestion batch', () =>
      deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`)
    )
    await attemptCleanup(failures, 'verify ingestion batch deleted', () =>
      expectStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
        status: 404,
      })
    )
  }
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
      )
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
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
    if (created.leaseId) {
      await attemptCleanup(failures, 'verify lease deleted by cascade', () =>
        expectStatus(`/api/v1/leases/${created.leaseId}`, { status: 404 })
      )
    }
    if (created.unitId) {
      await attemptCleanup(failures, 'verify unit deleted by cascade', () =>
        expectStatus(
          `/api/v1/properties/${created.propertyId}/units/${created.unitId}`,
          { status: 404 }
        )
      )
    }
    await attemptCleanup(failures, 'verify snapshots deleted by cascade', () =>
      expectNoSnapshots(created.propertyId, period)
    )
    if (created.jobId) {
      await attemptCleanup(
        failures,
        'verify calculation job deleted by cascade',
        () =>
          expectStatus(`/api/v1/reconciliation/jobs/${created.jobId}`, {
            status: 404,
          })
      )
    }
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectNoSnapshots(propertyId, period) {
  const list = await expectJson(
    `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${period.periodStart}&period_end=${period.periodEnd}&page=1&size=10`,
    { status: 200 }
  )
  const ok =
    list.total === 0 && Array.isArray(list.items) && list.items.length === 0
  report.cleanup.push({
    path: `/api/v1/reconciliation/snapshots?property_id=${propertyId}`,
    status: 200,
    ok,
    body_preview: JSON.stringify({
      total: list.total,
      item_count: list.items?.length ?? null,
    }),
  })
  if (!ok) {
    throw new Error(
      `Snapshots still present after property delete: ${JSON.stringify(list).slice(0, 500)}`
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

async function createProperty(body) {
  const response = await fetch(`${apiUrl}/api/v1/properties`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (response.status !== 201) {
    throw new Error(
      `POST /api/v1/properties returned ${response.status}, expected 201: ${text.slice(0, 500)}`
    )
  }
  try {
    if (!text.trim()) {
      throw new Error('Property create returned an empty response body')
    }
    return JSON.parse(text)
  } catch (error) {
    const recovered = await findPropertyByName(body.name)
    if (recovered) {
      report.cleanup.push({
        label: 'recovered property id after malformed create response',
        ok: true,
        property_id: recovered.id,
        error: errorMessage(error),
      })
      return recovered
    }
    throw error
  }
}

async function findPropertyByName(name) {
  const list = await expectJson('/api/v1/properties?skip=0&limit=100', {
    status: 200,
  })
  const items = Array.isArray(list?.data) ? list.data : []
  return items.find((property) => property?.name === name) ?? null
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
  const ok = response.status === options.status
  const json = parseJsonOrNull(text)
  if (options.recordCleanup !== false) {
    report.cleanup.push({
      path,
      status: response.status,
      ok,
      body_preview: text.slice(0, 200),
    })
  }
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return { status: response.status, json, text }
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

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
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
