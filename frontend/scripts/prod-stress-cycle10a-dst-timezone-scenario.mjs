/**
 * PROD E2E STRESS — Cycle 10A: TIMEZONE / DST correctness end-to-end.
 *
 * Target: the DEPLOYED capveri-api Worker (api.capveri.com), which runs in UTC.
 * C4 already proved leap-year denominators, endpoint inclusivity, and a single
 * lease-date round-trip. This cycle isolates the TIMEZONE / DST angle that C4
 * did not: periods and leases whose boundaries LAND ON or STRADDLE a US DST
 * transition, plus date-only round-trip across those transition dates, plus a
 * verification that the reconciliation day-count is invariant to DST (it must be,
 * because the engine anchors every day at 00:00:00Z).
 *
 * DST reference (US): spring-forward = 2nd Sunday of March, fall-back = 1st
 * Sunday of November.
 *   2025-03-09 spring-forward, 2025-11-02 fall-back
 *   2024-03-10 spring-forward, 2024-11-03 fall-back
 *
 * Day counts are computed OFFLINE the same way the engine does: UTC-anchored
 * inclusive `(b - a).days + 1`. If the engine leaked a local-tz Date anywhere,
 * a period that straddles spring-forward would lose a day (23-hour day) or a
 * fall-back period would gain a day (25-hour day) when divided by 86_400_000
 * from a NON-UTC-anchored millisecond delta. We assert the engine's prorated
 * money matches the UTC-anchored count to the penny.
 *
 * SCENARIOS (each an isolated, non-finalized property; occupancy held at 100%
 * so gross-up=1.0, no cap/base-year/admin-fee — money is a pure function of the
 * date math):
 *   T1  Period 2025-03-01..2025-03-31 straddles spring-forward (2025-03-09).
 *       Full-period lease -> 1.0 (31/31). Partial lease 2025-03-09..2025-03-31
 *       (the transition day onward) -> 23/31. Proves the 23-hour civil day is
 *       still counted as ONE calendar day (no lost day).
 *   T2  Period 2025-11-01..2025-11-30 straddles fall-back (2025-11-02).
 *       Partial lease 2025-11-02..2025-11-30 -> 29/30. Proves the 25-hour civil
 *       day is counted as ONE calendar day (no gained day).
 *   T3  Lease boundary EXACTLY on the transition instant: lease start
 *       2025-03-09 (spring-forward day) in a full-year 2025 period. Segment
 *       2025-03-09..2025-12-31 vs 365. Proves a boundary on the "missing hour"
 *       day is not off-by-one.
 *   T4  Round-trip: create leases whose start_date is each transition date
 *       (2025-03-09, 2025-11-02, 2024-03-10, 2024-11-03) and GET them back;
 *       assert start_date reads back byte-identical (no day-shift on write/read).
 *   T5  GL transaction dated ON the transition day (2025-03-09) is in-period
 *       for a period that contains it -> full operating expense recognized.
 *
 * All entities prefixed "[PROD-TEST] CY10A". Cleanup cascades property deletes
 * and re-verifies zero CY10A residue. No finalized snapshots created.
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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-stress-cycle10a-dst-${runId}`)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  offline_expected: {},
  checks: [],
  probes: [],
  cleanup: [],
}

let token

// ---------------------------------------------------------------------------
// Exact integer arithmetic (port of cloudflare-backend money.ts / Rate)
// ---------------------------------------------------------------------------
const RATE = 100_000_000n

function roundDiv(numerator, denominator) {
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const q = n / d
  const r = n % d
  const rounded = r * 2n >= d ? q + 1n : q
  return negative ? -rounded : rounded
}

function parseMoney(text) {
  const s = String(text).trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`bad money ${s}`)
  const neg = s.startsWith('-')
  const u = neg ? s.slice(1) : s
  const [whole = '0', fraction = ''] = u.split('.')
  const padded = `${fraction}000`
  const cents =
    BigInt(whole) * 100n +
    BigInt(padded.slice(0, 2)) +
    (Number(padded[2]) >= 5 ? 1n : 0n)
  return neg ? -cents : cents
}

function parseRate(text) {
  const s = String(text).trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`bad rate ${s}`)
  const neg = s.startsWith('-')
  const u = neg ? s.slice(1) : s
  const [whole = '0', fraction = ''] = u.split('.')
  const padded = `${fraction}${'0'.repeat(9)}`
  const scaled =
    BigInt(whole) * RATE +
    BigInt(padded.slice(0, 8)) +
    (Number(padded[8]) >= 5 ? 1n : 0n)
  return neg ? -scaled : scaled
}

const mulRate = (cents, rate) => roundDiv(cents * rate, RATE)

function centsToString(cents) {
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
}

function rateToString(rate) {
  const neg = rate < 0n
  const abs = neg ? -rate : rate
  const whole = abs / RATE
  const fraction = (abs % RATE).toString().padStart(8, '0')
  return `${neg ? '-' : ''}${whole}.${fraction}`.replace(/0+$/, '').replace(/\.$/, '')
}

/** INCLUSIVE day count, UTC-anchored exactly like calculator.ts inclusiveDayCount. */
function inclusiveDays(startDay, endDay) {
  const s = Date.parse(`${startDay}T00:00:00Z`)
  const e = Date.parse(`${endDay}T00:00:00Z`)
  return Math.round((e - s) / 86_400_000) + 1
}

function prorationFactor(leaseStart, leaseEnd, periodStart, periodEnd) {
  const activeStart = leaseStart > periodStart ? leaseStart : periodStart
  const activeEnd = leaseEnd && leaseEnd < periodEnd ? leaseEnd : periodEnd
  if (activeStart > activeEnd) return 0n
  const totalDays = inclusiveDays(periodStart, periodEnd)
  const segmentDays = inclusiveDays(activeStart, activeEnd)
  if (totalDays <= 0 || segmentDays >= totalDays) return RATE
  return roundDiv(BigInt(segmentDays) * RATE, BigInt(totalDays))
}

function dateLeaseSnapshot({ operatingCents, proRata, proration }) {
  const afterShare = mulRate(operatingCents, proRata)
  let before = mulRate(afterShare, proration)
  if (before < 0n) before = 0n
  return {
    total_operating_expenses: centsToString(operatingCents),
    tenant_share_before_cap: centsToString(before),
    tenant_share_after_cap: centsToString(before),
    admin_fee: '0.00',
    total_recovery: centsToString(before),
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
const registered = []
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const P = (s) => `[PROD-TEST] CY10A ${s} ${suffix}`
  const registerProp = (p) => {
    registered.push(p)
    return p
  }

  const mkProperty = async (name, buildingSqft = '10000.00') => {
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: P(name),
        address_line1: '1 DST Way',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        total_rentable_sqft: buildingSqft,
        total_usable_sqft: buildingSqft,
        common_area_sqft: '0.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    return registerProp({
      id: property.id,
      buildingSqft,
      poolIds: [],
      mappingIds: [],
      unitIds: [],
      leaseIds: [],
      batchIds: [],
    })
  }

  const mkPool = async (prop, name) => {
    const p = await expectJson(`/api/v1/properties/${prop.id}/expense-pools`, {
      method: 'POST',
      status: 201,
      body: {
        name: P(name),
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: null,
        description: 'CY10A disposable pool',
      },
    })
    prop.poolIds.push(p.id)
    return p.id
  }

  const mkMapping = async (prop, poolId, pattern) => {
    const m = await expectJson(`/api/v1/properties/${prop.id}/pool-mappings`, {
      method: 'POST',
      status: 201,
      body: {
        expense_pool_id: poolId,
        gl_account_pattern: pattern,
        allocation_percentage: '1',
        priority: 10,
      },
    })
    prop.mappingIds.push(m.id)
    return m.id
  }

  const mkUnit = async (prop, num, sqft) => {
    const u = await expectJson(`/api/v1/properties/${prop.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: num,
        rentable_sqft: sqft,
        usable_sqft: sqft,
        floor: 1,
        status: 'occupied',
        space_type: 'office',
      },
    })
    prop.unitIds.push(u.id)
    return u.id
  }

  const mkLease = async (prop, unitId, tenantName, startDate, endDate, tenantSqft, proRataShare) => {
    const body = {
      property_id: prop.id,
      unit_id: unitId,
      tenant_name: P(tenantName),
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      recovery_profile: {
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: proRataShare,
        cap_type: 'none',
        cap_rate: null,
        admin_fee_percentage: '0',
        management_fee_percentage: null,
        excluded_pools: [],
        accounting_basis: 'cash',
        base_year_adjustments: [],
      },
    }
    if (tenantSqft != null) body.tenant_sqft = tenantSqft
    const l = await expectJson('/api/v1/leases', { method: 'POST', status: 201, body })
    prop.leaseIds.push(l.id)
    return l
  }

  const uploadOperatingGl = async (prop, txnDate, amount, fileTag) => {
    const upload = await uploadCsv({
      propertyId: prop.id,
      fileName: `cy10a-${fileTag}-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,${txnDate},${amount},CamCo,CY10A CAM`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    prop.batchIds.push(upload.batch_id)
    return upload
  }

  const runRecon = async (prop, periodStart, periodEnd) => {
    const job = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: { property_id: prop.id, period_start: periodStart, period_end: periodEnd, force_recalculate: true },
    })
    const done = await waitForJob(job.job_id)
    const byLease = {}
    for (const sid of done.snapshot_ids) {
      const snap = await expectJson(`/api/v1/reconciliation/snapshots/${sid}`, { status: 200 })
      byLease[snap.lease_id] = snap
    }
    return { done, byLease }
  }

  const GL = '100000.00'
  const operatingCents = parseMoney(GL)
  const pr = parseRate('0.10')

  try {
    // ===================================================================
    // T1 — period straddles SPRING-FORWARD (2025-03-09); 23-hour civil day
    // ===================================================================
    {
      const prop = await mkProperty('T1 SpringForward Mar2025')
      const pool = await mkPool(prop, 'T1 CAM')
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, '03/15/2025', GL, 't1-gl')
      const uOcc = await mkUnit(prop, `T1-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'T1 FullOcc', '2025-03-01', '2027-12-31', prop.buildingSqft, '0.00')
      // Partial: 2025-03-09 (transition day) .. 2025-03-31 = 23 days inclusive.
      const uP = await mkUnit(prop, `T1-P-${suffix}`, '10.00')
      const lP = await mkLease(prop, uP, 'T1 FromTransition', '2025-03-09', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-03-01'
      const periodEnd = '2025-03-31'
      const totalDays = inclusiveDays(periodStart, periodEnd)
      const segDays = inclusiveDays('2025-03-09', periodEnd)
      const proration = prorationFactor('2025-03-09', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.t1 = { total_days: totalDays, segment_days: segDays, proration: rateToString(proration) }
      check(
        'T1 March 2025 period is 31 days and 03-09..03-31 is 23 days despite spring-forward (no lost day)',
        { total_days: totalDays, segment_days: segDays },
        { total_days: 31, segment_days: 23 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      softCheck(
        'T1 partial lease from spring-forward day prorated 23/31 penny-exact',
        snapshotMoney(byLease[lP.id]),
        { lease_id: lP.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration }) }
      )
    }

    // ===================================================================
    // T2 — period straddles FALL-BACK (2025-11-02); 25-hour civil day
    // ===================================================================
    {
      const prop = await mkProperty('T2 FallBack Nov2025')
      const pool = await mkPool(prop, 'T2 CAM')
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, '11/15/2025', GL, 't2-gl')
      const uOcc = await mkUnit(prop, `T2-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'T2 FullOcc', '2025-11-01', '2027-12-31', prop.buildingSqft, '0.00')
      // Partial: 2025-11-02 (fall-back day) .. 2025-11-30 = 29 days inclusive.
      const uP = await mkUnit(prop, `T2-P-${suffix}`, '10.00')
      const lP = await mkLease(prop, uP, 'T2 FromTransition', '2025-11-02', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-11-01'
      const periodEnd = '2025-11-30'
      const totalDays = inclusiveDays(periodStart, periodEnd)
      const segDays = inclusiveDays('2025-11-02', periodEnd)
      const proration = prorationFactor('2025-11-02', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.t2 = { total_days: totalDays, segment_days: segDays, proration: rateToString(proration) }
      check(
        'T2 Nov 2025 period is 30 days and 11-02..11-30 is 29 days despite fall-back (no gained day)',
        { total_days: totalDays, segment_days: segDays },
        { total_days: 30, segment_days: 29 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      softCheck(
        'T2 partial lease from fall-back day prorated 29/30 penny-exact',
        snapshotMoney(byLease[lP.id]),
        { lease_id: lP.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration }) }
      )
    }

    // ===================================================================
    // T3 — lease boundary EXACTLY on spring-forward day in a full-year period
    // ===================================================================
    {
      const prop = await mkProperty('T3 BoundaryOnDST 2025')
      const pool = await mkPool(prop, 'T3 CAM')
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, '06/15/2025', GL, 't3-gl')
      const uOcc = await mkUnit(prop, `T3-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'T3 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      // Lease starts on the spring-forward day.
      const uT = await mkUnit(prop, `T3-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'T3 StartOnSpringForward', '2025-03-09', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const totalDays = inclusiveDays(periodStart, periodEnd)
      const segDays = inclusiveDays('2025-03-09', periodEnd)
      const proration = prorationFactor('2025-03-09', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.t3 = { total_days: totalDays, segment_days: segDays, proration: rateToString(proration) }
      check(
        'T3 2025 period 365d; 03-09..12-31 = 298 days (spring-forward boundary not off-by-one)',
        { total_days: totalDays, segment_days: segDays },
        { total_days: 365, segment_days: 298 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      softCheck(
        'T3 lease starting on spring-forward day prorated 298/365 penny-exact',
        snapshotMoney(byLease[lT.id]),
        { lease_id: lT.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration }) }
      )
    }

    // ===================================================================
    // T4 — date-only ROUND-TRIP across each DST transition date
    // ===================================================================
    {
      const prop = await mkProperty('T4 RoundTrip DST')
      const pool = await mkPool(prop, 'T4 CAM')
      await mkMapping(prop, pool, '61*')
      const transitionDates = ['2025-03-09', '2025-11-02', '2024-03-10', '2024-11-03']
      for (const d of transitionDates) {
        const u = await mkUnit(prop, `T4-${d}-${suffix}`, '10.00')
        const l = await mkLease(prop, u, `T4 ${d}`, d, '2027-12-31', '10.00', '0.10')
        const readBack = await expectJson(`/api/v1/leases/${l.id}`, { status: 200 })
        const rbStart = String(readBack.start_date ?? readBack.startDate ?? '').slice(0, 10)
        check(
          `T4 lease start ${d} (DST transition date) round-trips exactly, no day-shift`,
          { start_date: rbStart },
          { start_date: d }
        )
      }
    }

    // ===================================================================
    // T5 — GL txn dated ON the spring-forward day is in-period
    // ===================================================================
    {
      const prop = await mkProperty('T5 GLonDST 2025')
      const pool = await mkPool(prop, 'T5 CAM')
      await mkMapping(prop, pool, '61*')
      // GL dated exactly on the spring-forward transition day.
      await uploadOperatingGl(prop, '03/09/2025', GL, 't5-gl')
      const uOcc = await mkUnit(prop, `T5-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'T5 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      const uT = await mkUnit(prop, `T5-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'T5 FullPeriod', '2025-01-01', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const proration = prorationFactor('2025-01-01', '2027-12-31', periodStart, periodEnd)
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      softCheck(
        'T5 GL txn dated on spring-forward day is recognized in-period (full operating expense)',
        snapshotMoney(byLease[lT.id]),
        { lease_id: lT.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration }) }
      )
    }
  } finally {
    await cleanup()
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup() {
  const failures = []
  for (const prop of registered) {
    for (const batchId of prop.batchIds ?? []) {
      if (!batchId) continue
      await attemptCleanup(failures, 'delete ingestion batch', () =>
        deleteEmpty(`/api/v1/ingestion/batches/${batchId}`))
    }
    for (const mappingId of prop.mappingIds ?? []) {
      await attemptCleanup(failures, 'delete pool mapping', () =>
        deleteEmpty(`/api/v1/properties/${prop.id}/pool-mappings/${mappingId}`))
    }
    for (const poolId of prop.poolIds ?? []) {
      await attemptCleanup(failures, 'delete expense pool', () =>
        deleteEmpty(`/api/v1/properties/${prop.id}/expense-pools/${poolId}`))
    }
    await attemptCleanup(failures, 'delete property (cascade)', () =>
      deleteEmpty(`/api/v1/properties/${prop.id}`))
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectCleanupStatus(`/api/v1/properties/${prop.id}`, { status: 404 }))
  }
  await attemptCleanup(failures, 'verify zero [PROD-TEST] CY10A properties remain', () =>
    expectNoResidue())
  if (failures.length > 0) report.cleanup_failures = failures
}

async function expectNoResidue() {
  const list = await expectJson(`/api/v1/properties?page=1&size=100`, { status: 200 })
  const items = Array.isArray(list.items) ? list.items : Array.isArray(list) ? list : []
  const leftovers = items.filter((p) => typeof p?.name === 'string' && p.name.includes('CY10A'))
  const ok = leftovers.length === 0
  report.cleanup.push({ path: 'list properties', ok, body_preview: `cy10a_left=${leftovers.length}`, ids: leftovers.map((p) => p.id) })
  if (!ok) throw new Error(`CY10A properties remain: ${leftovers.map((p) => p.id).join(',')}`)
}

// ---------------------------------------------------------------------------
// Shared HTTP + util helpers
// ---------------------------------------------------------------------------
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
    throw new Error(`POST /api/v1/ingestion/upload returned ${response.status}: ${text.slice(0, 500)}`)
  }
  return JSON.parse(text)
}

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(`Reconciliation job failed: ${JSON.stringify(job).slice(0, 800)}`)
    }
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`)
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
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  }
  return text ? JSON.parse(text) : null
}

async function expectStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  }
  return { status: response.status, text }
}

async function expectCleanupStatus(path, options) {
  const result = await expectStatus(path, options)
  report.cleanup.push({ path, status: result.status, ok: true })
  return result
}

async function deleteEmpty(path) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok })
  if (!ok) throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
}

async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  }
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL }
  return json.access_token
}

function snapshotMoney(s) {
  if (!s) return { missing: true }
  return {
    lease_id: s.lease_id,
    total_operating_expenses: s.total_operating_expenses,
    tenant_share_before_cap: s.tenant_share_before_cap,
    tenant_share_after_cap: s.tenant_share_after_cap,
    admin_fee: s.admin_fee,
    total_recovery: s.total_recovery,
  }
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(`${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`)
  }
}

function softCheck(label, actual, expected) {
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
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortDeep(v)])
    )
  }
  return value
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function trimSlash(value) {
  return value.replace(/\/+$/u, '')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok =
    report.checks.every((c) => c.ok) &&
    report.probes.every((p) => p.ok) &&
    !report.cleanup_failures
} catch (error) {
  report.fatal = errorMessage(error)
  report.ok = false
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1
