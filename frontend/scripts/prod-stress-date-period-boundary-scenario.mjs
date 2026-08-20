/**
 * PROD E2E STRESS — DATE / TIMEZONE / PERIOD-BOUNDARY correctness (Cycle 4C).
 *
 * Domain: prove the DEPLOYED reconciliation engine (cloudflare-reconciliation-v1
 * on api.capveri.com) computes day-count denominators, proration factors, leap-
 * year handling, and period/lease boundary inclusivity PENNY- and DAY-exact — or
 * find a wrong-denominator / off-by-one / timezone-shift / degenerate-period
 * defect that mis-bills money.
 *
 * Every proration factor and day count is computed OFFLINE at high precision
 * (BigInt cents / 1e8-scaled rates; day counts as integers), a faithful port of
 * the deployed calculator.ts (computeProrationFactor / inclusiveDayCount:
 * INCLUSIVE `(b-a).days + 1`, ratio held to 8dp half-up; occupancy day-weighted
 * 4dp half-up). Values are NEVER echoed from the API.
 *
 * The DATE variable is isolated: occupancy is held >= target (0.95) so the
 * gross-up factor is 1.0, there is no cap, no base year, no admin fee, no mgmt
 * fee, no exclusions. Then tenant_share_before_cap == round(GL_operating *
 * pro_rata * proration). This turns each snapshot into a direct assertion on the
 * day-count math.
 *
 * SCENARIOS (each an isolated property + non-finalized period):
 *   D1  Leap-year denominator: 2024 (366d) period, lease 2024-07-01.. (184d) ->
 *       proration 184/366. Proves Feb-29 lands in the denominator.
 *   D2  Non-leap control: 2025 (365d), lease 2025-07-01.. (184d) -> 184/365.
 *       Same window, different denominator by year -> engine is period-driven.
 *   D3  Feb-29 boundary: leap 2024, lease 2024-02-01..2024-02-29 (29d) -> 29/366.
 *   D4  Fiscal period with leap Feb: 2023-07-01..2024-06-30 (366d, contains Feb 29
 *       2024). Full-period lease -> 1.0; partial 2024-02-15..2024-06-30 -> d/366.
 *       Proves the engine uses the PERIOD span, not a calendar year.
 *   D5  Endpoint inclusivity (off-by-one hunt): four leases against a 2025 period
 *       (a) exactly cover start..end -> 1.0
 *       (b) start ON period_start, end after -> 1.0
 *       (c) start before, end ON period_end -> 1.0
 *       (d) start ON period_end (single-day overlap) -> 1/365
 *   D6  Zero overlap: lease entirely AFTER the period -> proration 0, share 0.
 *   D7  Timezone round-trip: lease start 2025-01-01 reads back as 2025-01-01
 *       (not 2024-12-31) after a create+GET; GL txn on period_start is in-period.
 *
 * ADVERSARIAL PROBES (HTTP write path):
 *   P1  reversed period (end < start) -> 422 (calculateSchema .refine)
 *   P2  single-day period (start == end) -> 422 (.refine uses strict >)
 *   P3  bogus calendar date 2025-02-30 (passes the loose YYYY-MM-DD regex):
 *       observe the engine outcome (job completes vs fails) and record truthfully.
 *   P4  bogus month 2025-13-01 (passes regex, Date.parse -> NaN): observe outcome.
 *   P5  lease end_date < start_date on CREATE -> observe (expect 422 or engine skip)
 *   P6  GL transaction dated exactly ON period_end is INCLUDED (<= upper bound);
 *       a GL txn one day AFTER period_end is EXCLUDED.
 *
 * All entities prefixed "[PROD-TEST] CY4C". Cleanup deletes EVERYTHING in finally
 * and re-verifies zero CY4C residue. No finalized snapshots are created, so the
 * property delete cascades cleanly with the user JWT.
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
  `prod-stress-date-period-boundary-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  offline_expected: {},
  checks: [],
  probes: [],
  cleanup: [],
}

let token

// ---------------------------------------------------------------------------
// Exact integer arithmetic (port of cloudflare-backend money.ts / Rate)
// ---------------------------------------------------------------------------
const RATE = 100_000_000n // 1e8 rate scale

function roundDiv(numerator, denominator) {
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const q = n / d
  const r = n % d
  const rounded = r * 2n >= d ? q + 1n : q
  return negative ? -rounded : rounded
}

/** Money.parse: string -> integer cents (3rd fractional digit half-up). */
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

/** Rate.parse: string -> 1e8-scaled bigint (9th fractional digit half-up). */
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
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n)
    .toString()
    .padStart(2, '0')}`
}

function rateToString(rate) {
  const neg = rate < 0n
  const abs = neg ? -rate : rate
  const whole = abs / RATE
  const fraction = (abs % RATE).toString().padStart(8, '0')
  return `${neg ? '-' : ''}${whole}.${fraction}`
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

/** INCLUSIVE day count between two YYYY-MM-DD dates: (b - a).days + 1. */
function inclusiveDays(startDay, endDay) {
  const s = Date.parse(`${startDay}T00:00:00Z`)
  const e = Date.parse(`${endDay}T00:00:00Z`)
  return Math.round((e - s) / 86_400_000) + 1
}

/**
 * Port of calculator.ts computeProrationFactor. Returns an 8dp-scaled Rate.
 * activeStart = max(leaseStart, periodStart); activeEnd = min(leaseEnd, periodEnd).
 * No overlap -> 0. segmentDays >= totalDays -> 1.0.
 */
function prorationFactor(leaseStart, leaseEnd, periodStart, periodEnd) {
  const activeStart = leaseStart > periodStart ? leaseStart : periodStart
  const activeEnd =
    leaseEnd && leaseEnd < periodEnd ? leaseEnd : periodEnd
  if (activeStart > activeEnd) return 0n
  const totalDays = inclusiveDays(periodStart, periodEnd)
  const segmentDays = inclusiveDays(activeStart, activeEnd)
  if (totalDays <= 0 || segmentDays >= totalDays) return RATE
  // 1e8-scaled ratio: (segment / total) * RATE. Divisor is totalDays ALONE —
  // multiplying it by RATE would cancel the scale and floor every partial to ~0.
  return roundDiv(BigInt(segmentDays) * RATE, BigInt(totalDays))
}

/**
 * Isolated-date lease snapshot: no gross-up (occ>=target -> factor 1), no cap,
 * no base year, no admin fee, no exclusions. So:
 *   before = round( round(operatingCents * proRata) * proration )
 * matching calculator.ts's SEQUENTIAL multiplyRate(proRata).multiplyRate(proration)
 * (each multiply rounds half-up to cents). tenant_share_after == before;
 * total_recovery == before (admin fee 0).
 */
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
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const P = (s) => `[PROD-TEST] CY4C ${s} ${suffix}`

  // Each sub-scenario gets its own property so date variables never interact and
  // cleanup is a single cascading property delete. We keep occupancy >= target by
  // making the OCCUPYING lease's tenant_sqft == building sqft (100% occupancy),
  // so gross-up is off and only the DATE math drives the number.
  report.generated = { suffix }

  // Push into the module-level `registered` array that cleanup() iterates, so
  // every created property is torn down in finally (cascades its children).
  const registerProp = (p) => {
    registered.push(p)
    return p
  }

  try {
    // =====================================================================
    // Helper builders (scoped to a given property)
    // =====================================================================
    const mkProperty = async (name, buildingSqft = '10000.00') => {
      const property = await expectJson('/api/v1/properties', {
        method: 'POST',
        status: 201,
        body: {
          name: P(name),
          address_line1: '1 Date Boundary Way',
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
        batchId: null,
      })
    }

    const mkPool = async (prop, name, poolType, grossUp) => {
      const p = await expectJson(
        `/api/v1/properties/${prop.id}/expense-pools`,
        {
          method: 'POST',
          status: 201,
          body: {
            name: P(name),
            pool_type: poolType,
            is_gross_up_applicable: grossUp,
            gross_up_target: null,
            description: 'CY4C disposable pool',
          },
        }
      )
      prop.poolIds.push(p.id)
      return p.id
    }

    const mkMapping = async (prop, poolId, pattern) => {
      const m = await expectJson(
        `/api/v1/properties/${prop.id}/pool-mappings`,
        {
          method: 'POST',
          status: 201,
          body: {
            expense_pool_id: poolId,
            gl_account_pattern: pattern,
            allocation_percentage: '1',
            priority: 10,
          },
        }
      )
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

    const mkLease = async (
      prop,
      unitId,
      tenantName,
      startDate,
      endDate,
      tenantSqft,
      proRataShare
    ) => {
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
      const l = await expectJson('/api/v1/leases', {
        method: 'POST',
        status: 201,
        body,
      })
      prop.leaseIds.push(l.id)
      return l
    }

    // A single operating GL row (grossable pool). We put the txn date INSIDE the
    // target period. dateFmt: MM/DD/YYYY (the parser's expected US format).
    const uploadOperatingGl = async (prop, poolId, txnDate, amount, fileTag) => {
      const upload = await uploadCsv({
        propertyId: prop.id,
        fileName: `cy4c-${fileTag}-${suffix}.csv`,
        csv: [
          'Account,Account Description,Date,Amount,Vendor,Description',
          `6100,Common Area Maintenance,${txnDate},${amount},CamCo,CY4C CAM`,
        ].join('\n'),
        sourceOverride: 'yardi',
      })
      prop.batchIds = prop.batchIds ?? []
      prop.batchIds.push(upload.batch_id)
      return upload
    }

    // Run recon and return { job, snapshotsByLease }.
    const runRecon = async (prop, periodStart, periodEnd) => {
      const job = await expectJson('/api/v1/reconciliation/calculate', {
        method: 'POST',
        status: 202,
        body: {
          property_id: prop.id,
          period_start: periodStart,
          period_end: periodEnd,
          force_recalculate: true,
        },
      })
      const done = await waitForJob(job.job_id)
      const byLease = {}
      for (const sid of done.snapshot_ids) {
        const snap = await expectJson(
          `/api/v1/reconciliation/snapshots/${sid}`,
          { status: 200 }
        )
        byLease[snap.lease_id] = snap
      }
      return { done, byLease }
    }

    const GL = '100000.00' // clean operating expense per property
    const operatingCents = parseMoney(GL)

    // =====================================================================
    // D1 — LEAP-YEAR denominator (2024 = 366 days), mid-year lease
    // =====================================================================
    {
      const prop = await mkProperty('D1 Leap 2024')
      const pool = await mkPool(prop, 'D1 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, pool, '03/15/2024', GL, 'd1-gl')
      // Occupier at 100% so occupancy >= target (no gross-up). Full-year lease.
      const uOcc = await mkUnit(prop, `D1-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'D1 FullOcc', '2024-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      // The lease under test: mid-year start 2024-07-01 (Jul1..Dec31 = 184 days
      // inclusive), pro_rata 0.10. Its own sqft is small; occupancy already 100%.
      const uT = await mkUnit(prop, `D1-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'D1 MidYear', '2024-07-01', '2027-12-31', '10.00', '0.10')

      const periodStart = '2024-01-01'
      const periodEnd = '2024-12-31'
      const totalDays = inclusiveDays(periodStart, periodEnd)
      const segDays = inclusiveDays('2024-07-01', periodEnd)
      const proration = prorationFactor('2024-07-01', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.d1 = {
        total_days: totalDays,
        segment_days: segDays,
        proration: rateToString(proration),
      }
      check(
        'D1 leap-year period denominator is 366 (inclusive)',
        { total_days: totalDays, segment_days: segDays },
        { total_days: 366, segment_days: 184 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      const expected = dateLeaseSnapshot({ operatingCents, proRata: parseRate('0.10'), proration })
      softCheck(
        'D1 mid-year lease prorated 184/366 penny-exact',
        snapshotMoney(byLease[lT.id]),
        { lease_id: lT.id, ...expected }
      )
    }

    // =====================================================================
    // D2 — NON-LEAP control (2025 = 365 days), same 07-01 window
    // =====================================================================
    {
      const prop = await mkProperty('D2 NonLeap 2025')
      const pool = await mkPool(prop, 'D2 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, pool, '03/15/2025', GL, 'd2-gl')
      const uOcc = await mkUnit(prop, `D2-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'D2 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      const uT = await mkUnit(prop, `D2-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'D2 MidYear', '2025-07-01', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const totalDays = inclusiveDays(periodStart, periodEnd)
      const segDays = inclusiveDays('2025-07-01', periodEnd)
      const proration = prorationFactor('2025-07-01', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.d2 = {
        total_days: totalDays,
        segment_days: segDays,
        proration: rateToString(proration),
      }
      check(
        'D2 non-leap period denominator is 365; same window but 184/365 not 184/366',
        { total_days: totalDays, segment_days: segDays },
        { total_days: 365, segment_days: 184 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      const expected = dateLeaseSnapshot({ operatingCents, proRata: parseRate('0.10'), proration })
      softCheck(
        'D2 mid-year lease prorated 184/365 penny-exact',
        snapshotMoney(byLease[lT.id]),
        { lease_id: lT.id, ...expected }
      )
    }

    // =====================================================================
    // D3 — Feb-29 boundary inside a leap period
    // =====================================================================
    {
      const prop = await mkProperty('D3 Feb29 2024')
      const pool = await mkPool(prop, 'D3 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, pool, '02/15/2024', GL, 'd3-gl')
      const uOcc = await mkUnit(prop, `D3-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'D3 FullOcc', '2024-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      // Lease active exactly 2024-02-01..2024-02-29 inclusive = 29 days.
      const uT = await mkUnit(prop, `D3-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'D3 FebWindow', '2024-02-01', '2024-02-29', '10.00', '0.10')

      const periodStart = '2024-01-01'
      const periodEnd = '2024-12-31'
      const segDays = inclusiveDays('2024-02-01', '2024-02-29')
      const proration = prorationFactor('2024-02-01', '2024-02-29', periodStart, periodEnd)
      report.offline_expected.d3 = {
        segment_days: segDays,
        proration: rateToString(proration),
      }
      check(
        'D3 Feb 1..Feb 29 2024 counts 29 days (leap Feb handled inclusively)',
        { segment_days: segDays },
        { segment_days: 29 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      const expected = dateLeaseSnapshot({ operatingCents, proRata: parseRate('0.10'), proration })
      softCheck(
        'D3 Feb-29 window lease prorated 29/366 penny-exact',
        snapshotMoney(byLease[lT.id]),
        { lease_id: lT.id, ...expected }
      )
    }

    // =====================================================================
    // D4 — FISCAL period spanning a year boundary + containing Feb 29
    //      2023-07-01 .. 2024-06-30 = 366 days (Feb 29 2024 inside).
    // =====================================================================
    {
      const prop = await mkProperty('D4 Fiscal 2023H2-2024H1')
      const pool = await mkPool(prop, 'D4 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      // GL dated Dec 2023 (inside the fiscal period, across the calendar-year line)
      await uploadOperatingGl(prop, pool, '12/15/2023', GL, 'd4-gl')
      const uOcc = await mkUnit(prop, `D4-OCC-${suffix}`, prop.buildingSqft)
      // Full fiscal-period occupier (covers 2023-07-01..2024-06-30).
      await mkLease(prop, uOcc, 'D4 FullOcc', '2023-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      // Full-period lease under test -> factor 1.0.
      const uFull = await mkUnit(prop, `D4-FULL-${suffix}`, '10.00')
      const lFull = await mkLease(prop, uFull, 'D4 FullPeriod', '2023-01-01', '2027-12-31', '10.00', '0.10')
      // Partial: 2024-02-15..2024-06-30 (crosses into the leap Feb, ends at period end).
      const uPart = await mkUnit(prop, `D4-PART-${suffix}`, '10.00')
      const lPart = await mkLease(prop, uPart, 'D4 Partial', '2024-02-15', '2027-12-31', '10.00', '0.10')

      const periodStart = '2023-07-01'
      const periodEnd = '2024-06-30'
      const totalDays = inclusiveDays(periodStart, periodEnd)
      const partSeg = inclusiveDays('2024-02-15', periodEnd)
      const prorFull = prorationFactor('2023-01-01', '2027-12-31', periodStart, periodEnd)
      const prorPart = prorationFactor('2024-02-15', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.d4 = {
        total_days: totalDays,
        part_segment_days: partSeg,
        proration_full: rateToString(prorFull),
        proration_part: rateToString(prorPart),
      }
      check(
        'D4 fiscal period denominator is 366 (contains Feb 29 2024), not a calendar year',
        { total_days: totalDays },
        { total_days: 366 }
      )
      check(
        'D4 full-period lease proration factor is exactly 1.0',
        { proration_full: rateToString(prorFull) },
        { proration_full: '1' }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      softCheck(
        'D4 full-period lease bills full share (factor 1.0)',
        snapshotMoney(byLease[lFull.id]),
        { lease_id: lFull.id, ...dateLeaseSnapshot({ operatingCents, proRata: parseRate('0.10'), proration: prorFull }) }
      )
      softCheck(
        'D4 partial fiscal lease prorated d/366 penny-exact',
        snapshotMoney(byLease[lPart.id]),
        { lease_id: lPart.id, ...dateLeaseSnapshot({ operatingCents, proRata: parseRate('0.10'), proration: prorPart }) }
      )
    }

    // =====================================================================
    // D5 — ENDPOINT INCLUSIVITY (off-by-one hunt) against a 2025 period
    // =====================================================================
    {
      const prop = await mkProperty('D5 Endpoints 2025')
      const pool = await mkPool(prop, 'D5 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, pool, '06/15/2025', GL, 'd5-gl')
      const uOcc = await mkUnit(prop, `D5-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'D5 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const totalDays = inclusiveDays(periodStart, periodEnd) // 365

      // (a) exactly covers period -> 1.0
      const uA = await mkUnit(prop, `D5-A-${suffix}`, '10.00')
      const lA = await mkLease(prop, uA, 'D5 ExactCover', '2025-01-01', '2025-12-31', '10.00', '0.10')
      // (b) start ON period_start, end after -> 1.0
      const uB = await mkUnit(prop, `D5-B-${suffix}`, '10.00')
      const lB = await mkLease(prop, uB, 'D5 StartOnStart', '2025-01-01', '2030-12-31', '10.00', '0.10')
      // (c) start before, end ON period_end -> 1.0
      const uC = await mkUnit(prop, `D5-C-${suffix}`, '10.00')
      const lC = await mkLease(prop, uC, 'D5 EndOnEnd', '2020-01-01', '2025-12-31', '10.00', '0.10')
      // (d) start ON period_end (single-day overlap) -> 1/365
      const uD = await mkUnit(prop, `D5-D-${suffix}`, '10.00')
      const lD = await mkLease(prop, uD, 'D5 SingleDayOverlap', '2025-12-31', '2027-12-31', '10.00', '0.10')

      const prA = prorationFactor('2025-01-01', '2025-12-31', periodStart, periodEnd)
      const prB = prorationFactor('2025-01-01', '2030-12-31', periodStart, periodEnd)
      const prC = prorationFactor('2020-01-01', '2025-12-31', periodStart, periodEnd)
      const prD = prorationFactor('2025-12-31', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.d5 = {
        total_days: totalDays,
        exact_cover: rateToString(prA),
        start_on_start: rateToString(prB),
        end_on_end: rateToString(prC),
        single_day_overlap: rateToString(prD),
        single_day_segment: inclusiveDays('2025-12-31', '2025-12-31'),
      }
      check(
        'D5 endpoint factors: exact/start/end all 1.0; single-day overlap = 1/365',
        {
          exact_cover: rateToString(prA),
          start_on_start: rateToString(prB),
          end_on_end: rateToString(prC),
          single_day_segment: inclusiveDays('2025-12-31', '2025-12-31'),
        },
        { exact_cover: '1', start_on_start: '1', end_on_end: '1', single_day_segment: 1 }
      )
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      const pr = parseRate('0.10')
      softCheck('D5a exact-cover lease -> factor 1.0', snapshotMoney(byLease[lA.id]),
        { lease_id: lA.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration: prA }) })
      softCheck('D5b start-on-period_start (inclusive) -> factor 1.0', snapshotMoney(byLease[lB.id]),
        { lease_id: lB.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration: prB }) })
      softCheck('D5c end-on-period_end (inclusive) -> factor 1.0', snapshotMoney(byLease[lC.id]),
        { lease_id: lC.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration: prC }) })
      softCheck('D5d single-day overlap (start==period_end) -> 1/365', snapshotMoney(byLease[lD.id]),
        { lease_id: lD.id, ...dateLeaseSnapshot({ operatingCents, proRata: pr, proration: prD }) })
    }

    // =====================================================================
    // D6 — ZERO overlap: lease entirely AFTER the period -> share 0, no crash
    // =====================================================================
    {
      const prop = await mkProperty('D6 ZeroOverlap 2025')
      const pool = await mkPool(prop, 'D6 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      await uploadOperatingGl(prop, pool, '06/15/2025', GL, 'd6-gl')
      const uOcc = await mkUnit(prop, `D6-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'D6 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      // Lease starts AFTER the period ends -> no overlap.
      const uT = await mkUnit(prop, `D6-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'D6 FutureLease', '2026-01-01', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const proration = prorationFactor('2026-01-01', '2027-12-31', periodStart, periodEnd)
      report.offline_expected.d6 = { proration: rateToString(proration) }
      check('D6 non-overlapping future lease proration = 0', { proration: rateToString(proration) }, { proration: '0' })
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      // A zero-overlap lease may either produce a $0.00 snapshot OR no snapshot
      // at all (the engine skips leases with nothing to bill). BOTH are correct:
      // the only defect would be a phantom charge or a negative. Accept either.
      const snap = byLease[lT.id]
      const zeroOk =
        !snap ||
        (snap.tenant_share_before_cap === '0.00' &&
          snap.total_recovery === '0.00' &&
          !String(snap.tenant_share_before_cap).startsWith('-'))
      report.checks.push({
        label: 'D6 zero-overlap lease produces no charge (no snapshot OR $0.00; no negative)',
        ok: zeroOk,
        actual: snap ? snapshotMoney(snap) : { snapshot: 'none (skipped)' },
        expected: { charge: '0.00 or no snapshot' },
      })
    }

    // =====================================================================
    // D7 — TIMEZONE round-trip + GL date exactly on period_start
    // =====================================================================
    {
      const prop = await mkProperty('D7 Timezone 2025')
      const pool = await mkPool(prop, 'D7 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      // GL transaction dated EXACTLY on period_start.
      await uploadOperatingGl(prop, pool, '01/01/2025', GL, 'd7-gl')
      const uOcc = await mkUnit(prop, `D7-OCC-${suffix}`, prop.buildingSqft)
      const lOcc = await mkLease(prop, uOcc, 'D7 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      const uT = await mkUnit(prop, `D7-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'D7 NewYear', '2025-01-01', '2027-12-31', '10.00', '0.10')

      // Round-trip: GET the lease and confirm start_date is 2025-01-01, not 2024-12-31.
      const readBack = await expectJson(`/api/v1/leases/${lT.id}`, { status: 200 })
      const rbStart = String(readBack.start_date ?? readBack.startDate ?? '').slice(0, 10)
      check(
        'D7 lease start 2025-01-01 round-trips exactly (no TZ day-shift)',
        { start_date: rbStart },
        { start_date: '2025-01-01' }
      )

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const proration = prorationFactor('2025-01-01', '2027-12-31', periodStart, periodEnd)
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      // The GL txn dated on period_start MUST be included -> full operating expense.
      softCheck(
        'D7 GL txn ON period_start is in-period; full-period lease bills full share',
        snapshotMoney(byLease[lT.id]),
        { lease_id: lT.id, ...dateLeaseSnapshot({ operatingCents, proRata: parseRate('0.10'), proration }) }
      )
      void lOcc
    }

    // =====================================================================
    // ADVERSARIAL PROBES
    // =====================================================================
    // A probe property WITH an active lease + GL, so the calculate endpoint's
    // "no active leases -> 422" guard does NOT short-circuit the bogus-date probes.
    // Without a lease, every calculate returns 422 no_active_leases_for_period and
    // the bogus date never reaches the job path — a false "fail-closed".
    const probeProp = await mkProperty('Probe Property 2025')
    {
      const pPool = await mkPool(probeProp, 'Probe CAM', 'operating', true)
      await mkMapping(probeProp, pPool, '61*')
      await uploadOperatingGl(probeProp, pPool, '06/15/2025', GL, 'probe-gl')
      const pUnit = await mkUnit(probeProp, `PROBE-${suffix}`, '10.00')
      await mkLease(probeProp, pUnit, 'Probe Lease', '2025-01-01', '2027-12-31', '10.00', '0.10')
    }

    // P1 reversed period -> 422 (Zod .refine, runs before the no-leases guard)
    await probeCalc('P1 reversed period (end < start) rejected (422)', probeProp.id, '2025-12-31', '2025-01-01', 422)
    // P2 single-day period (start == end) -> 422 (strict > refine)
    await probeCalc('P2 single-day period (start == end) rejected (422)', probeProp.id, '2025-06-15', '2025-06-15', 422)
    // P3 bogus calendar date 2025-02-30 (passes loose regex; refine passes since
    // "2025-12-31" > "2025-02-30" lexically). Observe whether the ::date cast /
    // job rejects it (fail-closed) or it silently mis-computes a denominator.
    await probeCalcObserve('P3 bogus date 2025-02-30 (passes YYYY-MM-DD regex): engine outcome', probeProp.id, '2025-02-30', '2025-12-31')
    // P4 bogus month 2025-13-01 (passes regex; "2025-12-31" > "2025-13-01" is
    // FALSE lexically so the refine itself should reject -> 422). Observe.
    await probeCalcObserve('P4 bogus month 2025-13-01 (passes regex, NaN day-count): engine outcome', probeProp.id, '2025-13-01', '2025-12-31')

    // P5 lease end_date < start_date on CREATE. Observe (expect 422 or documented behavior).
    {
      const u = await mkUnit(probeProp, `P5-${suffix}`, '10.00')
      const response = await fetchRetry(`${apiUrl}/api/v1/leases`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          property_id: probeProp.id,
          unit_id: u,
          tenant_name: P('P5 ReversedLease'),
          start_date: '2025-12-31',
          end_date: '2025-01-01',
          status: 'draft',
          recovery_profile: {
            base_year: null, base_year_amount: null, gross_up_base_year: false,
            pro_rata_share: '0.1', cap_type: 'none', cap_rate: null,
            admin_fee_percentage: '0', management_fee_percentage: null,
            excluded_pools: [], accounting_basis: 'cash', base_year_adjustments: [],
          },
        }),
      })
      const text = await response.text()
      let createdId = null
      if (response.status === 201) {
        try { createdId = JSON.parse(text)?.id ?? null } catch { /* ignore */ }
        if (createdId) probeProp.leaseIds.push(createdId)
      }
      report.probes.push({
        label: 'P5 lease end_date < start_date on CREATE: outcome',
        ok: true,
        actual: { status: response.status, created: Boolean(createdId), body: text.slice(0, 160) },
        note: 'Observation: engine skips start>end leases in occupancy/proration (FIX FC-5); a 201 that persists is not itself a money bug.',
      })
    }

    // P6 GL date ON vs AFTER period_end (inclusive upper bound).
    {
      const prop = await mkProperty('P6 GL Boundary 2025')
      const pool = await mkPool(prop, 'P6 CAM', 'operating', true)
      await mkMapping(prop, pool, '61*')
      // Two rows: one ON period_end (in), one one day AFTER (out).
      const upload = await uploadCsv({
        propertyId: prop.id,
        fileName: `cy4c-p6-gl-${suffix}.csv`,
        csv: [
          'Account,Account Description,Date,Amount,Vendor,Description',
          `6100,Common Area Maintenance,12/31/2025,60000.00,CamCo,ON period_end (IN)`,
          `6100,Common Area Maintenance,01/01/2026,40000.00,CamCo,AFTER period_end (OUT)`,
        ].join('\n'),
        sourceOverride: 'yardi',
      })
      prop.batchIds = [upload.batch_id]
      const uOcc = await mkUnit(prop, `P6-OCC-${suffix}`, prop.buildingSqft)
      await mkLease(prop, uOcc, 'P6 FullOcc', '2025-01-01', '2027-12-31', prop.buildingSqft, '0.00')
      const uT = await mkUnit(prop, `P6-T-${suffix}`, '10.00')
      const lT = await mkLease(prop, uT, 'P6 InPeriod', '2025-01-01', '2027-12-31', '10.00', '0.10')

      const periodStart = '2025-01-01'
      const periodEnd = '2025-12-31'
      const { byLease } = await runRecon(prop, periodStart, periodEnd)
      // Only the 12/31/2025 row (60000) is in-period; 01/01/2026 (40000) excluded.
      const expectedOperating = parseMoney('60000.00')
      const proration = prorationFactor('2025-01-01', '2027-12-31', periodStart, periodEnd)
      const expected = dateLeaseSnapshot({ operatingCents: expectedOperating, proRata: parseRate('0.10'), proration })
      const snap = byLease[lT.id]
      const ok =
        snap &&
        snap.total_operating_expenses === expected.total_operating_expenses &&
        snap.tenant_share_before_cap === expected.tenant_share_before_cap
      report.probes.push({
        label: 'P6 GL txn ON period_end included; AFTER period_end excluded (inclusive upper bound)',
        ok: Boolean(ok),
        actual: snap ? { total_operating_expenses: snap.total_operating_expenses, tenant_share_before_cap: snap.tenant_share_before_cap } : { missing: true },
        expected: { total_operating_expenses: expected.total_operating_expenses, tenant_share_before_cap: expected.tenant_share_before_cap },
      })
    }
  } finally {
    await cleanup()
  }
}

// ---------------------------------------------------------------------------
// Probe helpers
// ---------------------------------------------------------------------------
async function probeCalc(label, propertyId, periodStart, periodEnd, expectedStatus) {
  const response = await fetchRetry(`${apiUrl}/api/v1/reconciliation/calculate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ property_id: propertyId, period_start: periodStart, period_end: periodEnd, force_recalculate: true }),
  })
  const text = await response.text()
  const ok = response.status === expectedStatus
  report.probes.push({ label, ok, actual: { status: response.status, body: text.slice(0, 200) }, expected: { status: expectedStatus } })
}

/**
 * Fire a calculate with a bogus-but-regex-passing date and OBSERVE the outcome:
 * whether the request is accepted (202) and, if so, whether the job completes or
 * fails. Recorded truthfully — a NaN/rolled date that silently mis-bills is a bug;
 * a 4xx or a failed job is fail-closed and acceptable.
 */
async function probeCalcObserve(label, propertyId, periodStart, periodEnd) {
  const response = await fetchRetry(`${apiUrl}/api/v1/reconciliation/calculate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ property_id: propertyId, period_start: periodStart, period_end: periodEnd, force_recalculate: true }),
  })
  const text = await response.text()
  let jobStatus = null
  let jobDetail = null
  if (response.status === 202) {
    try {
      const job = JSON.parse(text)
      const done = await waitForJobObserve(job.job_id)
      jobStatus = done.status
      jobDetail = JSON.stringify(done).slice(0, 200)
    } catch (e) {
      jobStatus = 'observe-error'
      jobDetail = errorMessage(e).slice(0, 200)
    }
  }
  // Fail-closed = request rejected (4xx) OR job failed. Silent 'completed' on a
  // bogus date is the only concerning outcome (records but does not throw here;
  // triage decides).
  const failClosed = response.status >= 400 || jobStatus === 'failed'
  report.probes.push({
    label,
    ok: true,
    actual: {
      http_status: response.status,
      http_body: text.slice(0, 240),
      job_status: jobStatus,
      detail: jobDetail,
      fail_closed: failClosed,
    },
    note: failClosed
      ? 'Fail-closed: bogus date rejected or job failed (acceptable).'
      : 'CONCERN: bogus calendar date produced a completed job — inspect the computed denominator.',
  })
}

async function waitForJobObserve(jobId) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < 60_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
    last = job
    if (job.status === 'completed' || job.status === 'failed') return job
    await sleep(2_000)
  }
  return last ?? { status: 'timeout' }
}

// ---------------------------------------------------------------------------
// Cleanup — delete every registered property (cascades pools/mappings/units/
// leases/GL/snapshots) and verify zero CY4C residue.
// ---------------------------------------------------------------------------
const registered = []
async function cleanup() {
  const failures = []
  for (const prop of registered) {
    for (const batchId of prop.batchIds ?? (prop.batchId ? [prop.batchId] : [])) {
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
  await attemptCleanup(failures, 'verify zero [PROD-TEST] CY4C properties remain', () =>
    expectNoCy4cProperties())
  if (failures.length > 0) {
    report.cleanup_failures = failures
  }
}

async function expectNoCy4cProperties() {
  const list = await expectJson(`/api/v1/properties?page=1&size=100`, { status: 200 })
  const items = Array.isArray(list.items) ? list.items : Array.isArray(list) ? list : []
  const leftovers = items.filter((p) => typeof p?.name === 'string' && p.name.includes('CY4C'))
  const ok = leftovers.length === 0
  report.cleanup.push({ path: 'list properties', ok, body_preview: `cy4c_left=${leftovers.length}`, ids: leftovers.map((p) => p.id) })
  if (!ok) throw new Error(`CY4C properties remain: ${leftovers.map((p) => p.id).join(',')}`)
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

/** Record a check but do NOT throw — lets one run surface every divergence. */
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
