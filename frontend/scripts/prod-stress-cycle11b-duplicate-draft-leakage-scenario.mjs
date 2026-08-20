/**
 * PROD E2E STRESS — Cycle 11B: duplicate DRAFT snapshot guard regression.
 *
 * DOMAIN: snapshot lifecycle temporal correctness. The risk candidate was that
 * running calculate twice with force_recalculate=false over the same
 * (property, period) could leave duplicate draft snapshots that downstream
 * leakage surfaces would sum. Current production has a worker-level guard:
 * before calculating, the queue worker counts existing drafts and fails the job
 * with "Use force_recalculate=true..." instead of inserting another draft.
 *
 * SHAPE (isolate recovery as the only moving part): single full-building tenant,
 * pro_rata_share=1.0, occupancy>=target (no gross-up), no cap, no admin fee, no
 * base year, one operating pool. GL total G => each draft's total_recovery = G.
 *   - After compute #1: 1 draft, leakage capveri_calculated = G.
 *   - After compute #2 (force_recalculate=false): job FAILS, existing draft set
 *     remains one row, leakage capveri_calculated stays G.
 *
 * CONTROL / adversarial refutation built in:
 *   - Assert compute #1 already gives the CORRECT single G (baseline is right).
 *   - Assert compute #2 fails before persistence with the draft-exists guard.
 *   - Assert force_recalculate=true replaces the existing draft and returns G.
 *   - Never echoes: G is set by us; the "correct" figure is our input.
 *
 * All entities prefixed "[PROD-TEST] CY11B" and deleted in finally (property
 * delete cascades units/leases/GL/DRAFT snapshots; nothing is finalized here, so
 * there is no immutability residual). Cleanup is verified via PostgREST re-list.
 */
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
  `prod-stress-cycle11b-duplicate-draft-leakage-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  findings: [],
  checks: [],
  cleanup: [],
}

let token

const GL_TOTAL = '120000.00' // G — single-lease recovery for the period

async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] CY11B Dup Draft Leakage ${suffix}`
  const poolName = `[PROD-TEST] CY11B CAM Ops ${suffix}`
  const tenantName = `[PROD-TEST] CY11B Anchor ${suffix}`
  const period = { start: '2024-01-01', end: '2024-12-31' }

  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    poolId: null,
    mappingId: null,
    batchId: null,
    jobIds: [],
  }
  report.generated = { propertyName, tenantName, period, GL_TOTAL }

  try {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '11 Duplicate Draft Rd',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
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
        unit_number: `CY11B-${suffix.toUpperCase()}`,
        rentable_sqft: '10000.00',
        usable_sqft: '9000.00',
        floor: 1,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitId = unit.id

    const pool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: poolName,
          pool_type: 'operating',
          is_gross_up_applicable: false,
          gross_up_target: null,
          description: 'CY11B disposable single-pool operating',
        },
      }
    )
    created.poolId = pool.id

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

    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2024-01-01',
        end_date: '2027-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '1.0',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0',
          management_fee_percentage: null,
          excluded_pools: [],
          accounting_basis: 'cash',
          base_year_adjustments: [],
        },
      },
    })
    created.leaseId = lease.id
    report.generated.leaseId = lease.id

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `cy11b-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,06/15/2024,${GL_TOTAL},DupCo,2024 CAM`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    check(
      'gl upload creates one clean row',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      { source_system: 'yardi', row_count: 1, error_count: 0 }
    )

    // ---- Compute #1 (force_recalculate=false): the CORRECT baseline ----------
    const snap1 = await computeAndWait({
      propertyId: property.id,
      period,
      force: false,
      created,
    })
    check(
      'compute #1 produces exactly ONE draft snapshot with recovery = G',
      {
        snapshot_count: snap1.snapshotIds.length,
        total_recovery: snap1.recovery,
      },
      { snapshot_count: 1, total_recovery: GL_TOTAL }
    )

    const leakage1 = await getLeakage(property.id, period)
    check(
      'leakage after compute #1 is CORRECT (capveri_calculated = G, single lease)',
      {
        capveri_calculated: leakage1.capveri_calculated,
        leakage: leakage1.leakage,
        breakdown_rows: leakage1.breakdown.length,
        breakdown_calc_for_tenant: breakdownCalc(leakage1, tenantName),
      },
      {
        capveri_calculated: normMoney(GL_TOTAL),
        leakage: normMoney(GL_TOTAL),
        breakdown_rows: 1,
        breakdown_calc_for_tenant: Number(GL_TOTAL),
      }
    )

    // ---- Compute #2 (force_recalculate=false AGAIN): should fail safe ---------
    const failedSecondRun = await computeExpectFailure({
      propertyId: property.id,
      period,
      force: false,
      created,
    })

    const draftRows = await listDraftSnapshots(property.id, period)
    check(
      'compute #2 (force=false): fails with draft-exists guard and leaves one draft',
      {
        failed_status: failedSecondRun.status,
        message_contains_guard: failedSecondRun.error_message?.includes(
          'Draft reconciliation snapshots already exist'
        ),
        draft_count: draftRows.length,
        only_same_lease: draftRows[0]?.lease_id === lease.id,
        recoveries: draftRows.map((r) => normMoney(r.total_recovery)).sort(),
      },
      {
        failed_status: 'failed',
        message_contains_guard: true,
        draft_count: 1,
        only_same_lease: true,
        recoveries: [normMoney(GL_TOTAL)],
      }
    )

    const leakage2 = await getLeakage(property.id, period)
    check(
      'leakage after rejected second compute remains CORRECT (no double-count)',
      {
        capveri_calculated: leakage2.capveri_calculated,
        leakage: leakage2.leakage,
        breakdown_calc_for_tenant: breakdownCalc(leakage2, tenantName),
      },
      {
        capveri_calculated: normMoney(GL_TOTAL),
        leakage: normMoney(GL_TOTAL),
        breakdown_calc_for_tenant: Number(GL_TOTAL),
      }
    )

    // ---- Control: force_recalculate=true replaces the draft with CORRECT G ----
    const snap3 = await computeAndWait({
      propertyId: property.id,
      period,
      force: true,
      created,
    })
    check(
      'CONTROL: force_recalculate=true replaces existing draft -> one draft, recovery = G',
      {
        snapshot_count: snap3.snapshotIds.length,
        total_recovery: snap3.recovery,
      },
      { snapshot_count: 1, total_recovery: GL_TOTAL }
    )
    const leakage3 = await getLeakage(property.id, period)
    check(
      'CONTROL: leakage after force recompute remains CORRECT',
      {
        capveri_calculated: leakage3.capveri_calculated,
        leakage: leakage3.leakage,
      },
      {
        capveri_calculated: normMoney(GL_TOTAL),
        leakage: normMoney(GL_TOTAL),
      }
    )
  } finally {
    await cleanup(created, period)
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
async function computeAndWait({ propertyId, period, force, created }) {
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST',
    status: 202,
    body: {
      property_id: propertyId,
      period_start: period.start,
      period_end: period.end,
      force_recalculate: force,
    },
  })
  created.jobIds.push(job.job_id)
  const done = await waitForJob(job.job_id)
  return {
    snapshotIds: done.snapshot_ids,
    recovery: done.potential_recovery_total,
    job: done,
  }
}

async function computeExpectFailure({ propertyId, period, force, created }) {
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST',
    status: 202,
    body: {
      property_id: propertyId,
      period_start: period.start,
      period_end: period.end,
      force_recalculate: force,
    },
  })
  created.jobIds.push(job.job_id)
  return waitForJobFailure(job.job_id)
}

async function getLeakage(propertyId, period) {
  return expectJson(
    `/api/v1/leakage/${propertyId}?period_start=${period.start}&period_end=${period.end}&include_drafts=true`,
    { status: 200 }
  )
}

function breakdownCalc(leakage, tenantName) {
  const row = (leakage.breakdown ?? []).find(
    (r) => r.tenant_name === tenantName
  )
  return row ? row.calculated_amount : null
}

async function listDraftSnapshots(propertyId, period) {
  // PostgREST direct (RLS-scoped) so we see the raw rows regardless of API paging.
  const url =
    `${supabaseUrl}/rest/v1/reconciliation_snapshots` +
    `?property_id=eq.${propertyId}` +
    `&period_start_date=eq.${period.start}` +
    `&period_end_date=eq.${period.end}` +
    `&status=eq.draft&select=id,lease_id,total_recovery,status`
  const response = await fetch(url, {
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const rows = await response.json().catch(() => null)
  return Array.isArray(rows) ? rows : []
}

async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
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
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, {
      status: 200,
    })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(
        `Reconciliation job failed: ${JSON.stringify(job).slice(0, 800)}`
      )
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function waitForJobFailure(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, {
      status: 200,
    })
    lastJob = job
    if (job.status === 'failed') return job
    if (job.status === 'completed') {
      throw new Error(
        `Expected reconciliation job ${jobId} to fail, but it completed: ${JSON.stringify(job).slice(0, 800)}`
      )
    }
    await sleep(2_000)
  }
  throw new Error(
    `Timed out waiting for failed job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

// ---------------------------------------------------------------------------
// Money helpers (integer cents; leakage fields are decimal.js .toFixed()).
// ---------------------------------------------------------------------------
function toCents(text) {
  const s = String(text).trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`bad money ${s}`)
  const neg = s.startsWith('-')
  const u = neg ? s.slice(1) : s
  const [whole = '0', fraction = ''] = u.split('.')
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2))
  return neg ? -cents : cents
}
function centsToString(cents) {
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
}
/** decimal.js .toFixed() drops trailing-zero cents ("120000" not "120000.00"). */
function normMoney(text) {
  const cents = toCents(text)
  return cents % 100n === 0n ? (cents / 100n).toString() : centsToString(cents)
}

async function cleanup(created, period) {
  const failures = []
  if (created.batchId) {
    await attemptCleanup(failures, 'delete ingestion batch', () =>
      deleteEmptyTolerant(`/api/v1/ingestion/batches/${created.batchId}`)
    )
  }
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmptyTolerant(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
      )
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmptyTolerant(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
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
  await verifyResidualState()
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function verifyResidualState() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/properties?name=like.${encodeURIComponent('[PROD-TEST] CY11B%')}&select=id,name`,
    {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    }
  )
  const rows = await response.json().catch(() => null)
  const residual = Array.isArray(rows) ? rows : []
  report.cleanup.push({
    label: 'CY11B residual state (PostgREST direct)',
    ok: residual.length === 0,
    cy11b_properties_remaining: residual.map((p) => ({ id: p.id, name: p.name })),
  })
  report.cleanup_fully_verified_clean = residual.length === 0
  if (residual.length !== 0) {
    throw new Error(
      `Unexpected CY11B residual: ${JSON.stringify(residual).slice(0, 400)}`
    )
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

async function fetchRetry(url, init) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      await sleep(1_000 * (attempt + 1))
    }
  }
  throw lastError
}

async function expectJson(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
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
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
  }
}

/** Tolerant delete for endpoints that may 404/405 (best-effort cleanup). */
async function deleteEmptyTolerant(path) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204 || response.status === 404
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 150) })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 400)}`)
  }
}

async function expectCleanupStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  report.cleanup.push({ path, status: response.status, ok: response.status === options.status, body_preview: text.slice(0, 150) })
  if (response.status !== options.status) {
    throw new Error(`GET ${path} returned ${response.status}, expected ${options.status}`)
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
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email }
  return json.access_token
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  return ok
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

try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((c) => c.ok)
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
