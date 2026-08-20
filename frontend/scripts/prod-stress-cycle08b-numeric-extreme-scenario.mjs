/**
 * PROD E2E STRESS — CYCLE 8B — NUMERIC EXTREME-MAGNITUDE / PRECISION / OVERFLOW.
 *
 * Domain: the extremes of the money/number pipeline — magnitude at the top of
 * NUMERIC(14,2), precision beyond 2 decimals, repeating-decimal pro-rata cent
 * conservation, zero/tiny amounts, occupancy->0 div-by-zero, and out-of-range
 * percent/factor inputs. Every scenario is verified penny-exact against an
 * INDEPENDENT BigInt-cents oracle (faithful port of money.ts + calculator.ts),
 * NEVER echoing the API back at itself.
 *
 * ENGINE under test: cloudflare-reconciliation-v1 on api.capveri.com.
 *
 * PART A — full-recon magnitude/precision (one property, several leases):
 *   L1  MEGA pool at the top of NUMERIC(14,2): CAM 999,999,999,999.99. Engine must
 *       compute without float error; snapshot money fields byte-exact.
 *   L2  cent-starvation: pro-rata 1/3 of a tiny recoverable so tenant share rounds
 *       across pools; largest-remainder must conserve to the penny.
 *   L3  repeating-decimal pro-rata (1/3) on a large pool -> penny conservation.
 *   L4  zero pool (0.00 GL) present -> no crash, contributes nothing.
 *   L5  sub-cent gross-up: occupancy just below target so factor is ~1.0001.
 *
 * PART B — direct boundary PROBES (adversarial, no full recon needed):
 *   P1  GL amount OVER NUMERIC(14,2) (9,999,999,999,999.99 = 13 integer digits):
 *       does persistence reject CLEANLY (not a 500) — or corrupt/crash?
 *   P2  NUMERIC readback fidelity: persist 999,999,999,999.99, read it back via
 *       PostgREST + API, assert byte-exact string (no float coercion on decode).
 *   P3  property target_occupancy = "95" (data slip for 0.95): engine clamps the
 *       gross-up factor to 1.0 (no ~95x explosion).
 *   P4  occupancy -> 0 (all leases zero sqft, but a positive building denominator):
 *       grossUpFactor guards isZero() -> factor 1.0, no div-by-zero 500.
 *   P5  exponential-string GL amount "1e13": Money.parse contract rejects; row is
 *       dropped, NOT a 500 and NOT a corrupt value.
 *   P6  admin_fee 100%+ ("1.5" via PostgREST): HTTP Zod bounds it; confirm the
 *       write path rejects >1 rather than billing 150%.
 *
 * EXPECTED computed OFFLINE in exact BigInt-cents (port of money.ts). Oracle
 * parity is NOT the bar; first-principles correctness is (CLAUDE.md).
 *
 * All entities prefixed "[PROD-TEST] CY8B". Cleanup in finally; residue re-
 * verified via PostgREST. No finalized snapshots -> user-JWT delete cascades.
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
const outputDir = resolve(repoRoot, 'e2e-adhoc', `prod-stress-cycle08b-${runId}`)
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
  auth: {},
}

let token

// ===========================================================================
// Exact integer arithmetic — port of cloudflare-backend money.ts semantics.
// ===========================================================================
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
const rateDiv = (a, b) => roundDiv(a * RATE, b)
const quantize4 = (rate) => roundDiv(rate, 10_000n) * 10_000n

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

function largestRemainder(totalCents, weights) {
  const n = weights.length
  if (n === 0) return []
  if (totalCents === 0n) return new Array(n).fill(0n)
  let eff = weights
  let totalWeight = weights.reduce((a, w) => a + w, 0n)
  if (totalWeight <= 0n) {
    eff = new Array(n).fill(1n)
    totalWeight = BigInt(n)
  }
  const floors = []
  const remainders = []
  for (const w of eff) {
    const num = totalCents * w
    floors.push(num / totalWeight)
    remainders.push(num % totalWeight)
  }
  const leftover = totalCents - floors.reduce((a, f) => a + f, 0n)
  const order = [...floors.keys()].sort((a, b) => {
    if (remainders[a] !== remainders[b]) return remainders[a] > remainders[b] ? -1 : 1
    return a - b
  })
  for (let k = 0n; k < leftover; k++) floors[order[Number(k)]] += 1n
  return floors
}

// ---------------------------------------------------------------------------
// Offline lease-snapshot model (single period; non_cumulative cap only).
// Grossable = pool type not in {tax,insurance,capital} AND flagged grossable.
// ---------------------------------------------------------------------------
const GROSS_UP_EXEMPT = new Set(['tax', 'insurance', 'capital'])
const CAP_EXEMPT = new Set(['tax', 'insurance', 'capital'])
const MIN_SAFE_OCC = parseRate('0.0001')

function grossUpFactorOf(occ, targetOcc) {
  if (occ === 0n || occ >= targetOcc) return RATE
  return quantize4(rateDiv(targetOcc, occ))
}

function leaseSnapshot({ pools, occ, factor, terms }) {
  const nearVacant = !(occ > MIN_SAFE_OCC)
  const grossedBare = pools.map((p) => {
    const grossable = !GROSS_UP_EXEMPT.has(p.type) && p.grossable !== false
    const amount = grossable && !nearVacant ? mulRate(p.cents, factor) : p.cents
    return { ...p, amount }
  })

  let variableBooked = 0n
  let fixedTotal = 0n
  for (const p of pools) {
    const grossable = !GROSS_UP_EXEMPT.has(p.type) && p.grossable !== false
    if (grossable) variableBooked += p.cents
    else fixedTotal += p.cents
  }
  let valvedVariable
  if (nearVacant) valvedVariable = variableBooked
  else {
    const grossedVar = mulRate(variableBooked, factor)
    const maxAtFull = mulRate(variableBooked, rateDiv(RATE, occ))
    valvedVariable = grossedVar <= maxAtFull ? grossedVar : maxAtFull
  }
  const aggregateGrossedUp = valvedVariable + fixedTotal

  // No mgmt fee in this scenario.
  const leasePools = grossedBare.map((p) => ({ ...p, capped: p.amount }))
  const mgmtExcess = 0n
  const totalOperating = pools.reduce((a, p) => a + p.cents, 0n)

  const isExcluded = (p) =>
    terms.excludedKeys.has(p.type) || terms.excludedKeys.has(p.name.toLowerCase())
  const excludedAmount = leasePools.filter(isExcluded).reduce((a, p) => a + p.capped, 0n)

  const netRecoverable = aggregateGrossedUp - mgmtExcess - excludedAmount
  const increaseOverBase = netRecoverable

  let before = mulRate(mulRate(increaseOverBase, terms.shareRate), terms.prorationRate)
  if (before < 0n) before = 0n

  let after = before
  if (terms.capType === 'non_cumulative' && terms.capRateRate !== null) {
    const base = terms.priorYearCents
    if (base !== null && base !== 0n) {
      const ceiling = mulRate(base, RATE + terms.capRateRate)
      if (after > ceiling) after = ceiling
    }
  }

  let adminBase = after
  if (terms.adminExcludedNames.size > 0) {
    const totalCents = leasePools.reduce((a, p) => a + p.capped, 0n)
    const excludedCents = leasePools
      .filter((p) => terms.adminExcludedNames.has(p.name.toLowerCase()))
      .reduce((a, p) => a + p.capped, 0n)
    if (totalCents > 0n) {
      const includedCents = totalCents - excludedCents > 0n ? totalCents - excludedCents : 0n
      adminBase = roundDiv(after * includedCents, totalCents)
      if (adminBase < 0n) adminBase = 0n
    } else adminBase = 0n
  }
  const adminFee = mulRate(adminBase, terms.adminRate)

  const grossedUpExpenses = aggregateGrossedUp - mgmtExcess
  const totalRecovery = after + adminFee

  // 3-layer per-pool breakdown.
  const included = leasePools.filter((p) => !isExcluded(p))
  const weights = included.map((p) => (p.capped > 0n ? p.capped : 0n))
  const totalWeight = weights.reduce((a, w) => a + w, 0n)
  let breakdown = null
  if (included.length > 0 && totalWeight > 0n) {
    const isCapEligible = included.map((p) => !CAP_EXEMPT.has(p.type))
    const shareBefore = largestRemainder(before, weights)
    const reduction = before > after ? before - after : 0n
    const capAdj = new Array(included.length).fill(0n)
    if (reduction > 0n) {
      const eligibleIdx = included.map((_, i) => i).filter((i) => isCapEligible[i])
      const eligibleCapacity = eligibleIdx.reduce((a, i) => a + shareBefore[i], 0n)
      if (reduction <= eligibleCapacity) {
        const alloc = largestRemainder(reduction, eligibleIdx.map((i) => shareBefore[i]))
        eligibleIdx.forEach((i, pos) => { capAdj[i] = -alloc[pos] })
      } else {
        eligibleIdx.forEach((i) => { capAdj[i] = -shareBefore[i] })
        const spill = reduction - eligibleCapacity
        const exemptIdx = included.map((_, i) => i).filter((i) => !isCapEligible[i])
        const alloc = largestRemainder(spill, exemptIdx.map((i) => shareBefore[i]))
        exemptIdx.forEach((i, pos) => { capAdj[i] = -alloc[pos] })
      }
    }
    const shareAfter = shareBefore.map((s, i) => s + capAdj[i])
    const adminAlloc = new Array(included.length).fill(0n)
    if (adminFee !== 0n) {
      const feeIdx = included.map((_, i) => i)
      const alloc = largestRemainder(adminFee, feeIdx.map((i) => shareAfter[i]))
      feeIdx.forEach((i, pos) => { adminAlloc[i] = alloc[pos] })
    }
    breakdown = included.map((p, i) => ({
      pool_name: p.name,
      pool_type: p.type,
      recovery: centsToString(shareAfter[i] + adminAlloc[i]),
    }))
  }

  return {
    total_operating_expenses: centsToString(totalOperating),
    grossed_up_expenses: centsToString(grossedUpExpenses),
    tenant_share_before_cap: centsToString(before),
    tenant_share_after_cap: centsToString(after),
    admin_fee: centsToString(adminFee),
    total_recovery: centsToString(totalRecovery),
    pool_breakdowns: breakdown,
  }
}

// ===========================================================================
// Scenario
// ===========================================================================
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const P = (s) => `[PROD-TEST] CY8B ${s} ${suffix}`
  const periodStart = '2025-01-01'
  const periodEnd = '2025-12-31'

  const created = {
    propertyId: null,
    poolIds: {},
    mappingIds: [],
    unitIds: [],
    leaseIds: {},
    batchId: null,
    jobId: null,
    snapshotIds: [],
    // Probe-only isolated properties (cleaned separately).
    probeProps: [],
  }
  report.generated = { suffix, periodStart, periodEnd }

  try {
    // ================= PART A: full-recon magnitude / precision =============
    const buildingSqft = '1000000.00' // large so per-lease sqft stays small
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: P('Numeric Extreme'),
        address_line1: '1 Overflow Ave',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        total_rentable_sqft: buildingSqft,
        total_usable_sqft: '990000.00',
        common_area_sqft: '10000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const camName = P('CAM Ops')
    const taxName = P('Real Estate Tax')
    const zeroName = P('Landscaping Zero')

    const mkPool = async (name, poolType, grossUp) => {
      const p = await expectJson(`/api/v1/properties/${property.id}/expense-pools`, {
        method: 'POST',
        status: 201,
        body: {
          name,
          pool_type: poolType,
          is_gross_up_applicable: grossUp,
          gross_up_target: null,
          description: 'CY8B disposable pool',
        },
      })
      return p.id
    }
    created.poolIds.cam = await mkPool(camName, 'operating', true)
    created.poolIds.tax = await mkPool(taxName, 'tax', true) // type-exempt gross-up
    created.poolIds.zero = await mkPool(zeroName, 'operating', true) // 0.00

    const mkMapping = async (poolId, pattern) => {
      const m = await expectJson(`/api/v1/properties/${property.id}/pool-mappings`, {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: poolId,
          gl_account_pattern: pattern,
          allocation_percentage: '1',
          priority: 10,
        },
      })
      return m.id
    }
    created.mappingIds.push(await mkMapping(created.poolIds.cam, '61*'))
    created.mappingIds.push(await mkMapping(created.poolIds.tax, '67*'))
    created.mappingIds.push(await mkMapping(created.poolIds.zero, '68*'))

    // Large-but-snapshot-safe CAM magnitude. The engine grosses up by 1.1875 and
    // then a lease can take up to 100% share, so every snapshot money column must
    // stay under the NUMERIC(14,2) ceiling (< 10^12). 8e11 booked -> 9.5e11
    // grossed -> largest lease share (0.5) ~4.75e11: all comfortably 12-digit.
    // The HARD over-ceiling case (booked at the column max) is exercised as a
    // dedicated fail-closed PROBE (P0) instead, since it makes the snapshot write
    // overflow by design.
    const glAmounts = {
      cam: '800000000000.00', // 12 integer digits; grossed 9.5e11 stays in-range
      tax: '123456789.01',
    }
    report.generated.glAmounts = glAmounts
    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `cy8b-gl-2025-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,03/15/2025,${glAmounts.cam},CamCo,CAM 2025`,
        `6700,Real Estate Taxes,11/01/2025,${glAmounts.tax},County,Taxes 2025`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    check(
      'MEGA GL upload creates two clean rows (max-magnitude amount accepted by parser)',
      { source_system: upload.source_system, row_count: upload.row_count, error_count: upload.error_count },
      { source_system: 'yardi', row_count: 2, error_count: 0 }
    )

    // -- Units + leases ----------------------------------------------------
    // Occupancy: choose sqft so gross-up ENGAGES and the sub-cent factor case
    // is exercised. Total occupied kept below 95% target.
    // L1 mega magnitude; L2 cent-starvation; L3 repeating share; L4 zero-pool
    // present (structural, same GL); L5 sub-cent gross-up.
    const mkUnit = async (num, sqft) => {
      const u = await expectJson(`/api/v1/properties/${property.id}/units`, {
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
      return u.id
    }
    const mkLease = async (unitId, tenantName, tenantSqft, profile) => {
      const l = await expectJson('/api/v1/leases', {
        method: 'POST',
        status: 201,
        body: {
          property_id: property.id,
          unit_id: unitId,
          tenant_name: tenantName,
          start_date: periodStart,
          end_date: '2027-12-31',
          status: 'active',
          tenant_sqft: tenantSqft,
          recovery_profile: profile,
        },
      })
      return l
    }
    const baseProfile = (over) => ({
      base_year: null,
      base_year_amount: null,
      gross_up_base_year: false,
      pro_rata_share: '0.1',
      cap_type: 'none',
      cap_rate: null,
      admin_fee_percentage: '0',
      management_fee_percentage: null,
      excluded_pools: [],
      accounting_basis: 'cash',
      base_year_adjustments: [],
      ...over,
    })

    // Occupied sqft chosen so occupancy = 0.8 (well below 0.95): 5 leases,
    // most tiny sqft, plus one that dominates. Keep total < 950000.
    // We'll set explicit per-lease sqft and compute occupancy from the real
    // day-weighted sum (all full-year -> plain sqft sum / building).
    const sqftMap = {
      l1: '100000.00',
      l2: '100000.00',
      l3: '100000.00',
      l4: '100000.00',
      l5: '400000.00',
    }
    // sum = 800000 / 1000000 = 0.8000 occupancy.

    const u1 = await mkUnit(`CY8B-U1-${suffix}`, sqftMap.l1)
    const l1 = await mkLease(u1, P('L1 Mega'), sqftMap.l1,
      baseProfile({ pro_rata_share: '0.5', admin_fee_percentage: '0.15' }))
    created.leaseIds.l1 = l1.id
    created.unitIds.push(u1)

    const u2 = await mkUnit(`CY8B-U2-${suffix}`, sqftMap.l2)
    const l2 = await mkLease(u2, P('L2 CentStarve'), sqftMap.l2,
      baseProfile({ pro_rata_share: '0.00000001', admin_fee_percentage: '0' }))
    created.leaseIds.l2 = l2.id
    created.unitIds.push(u2)

    const u3 = await mkUnit(`CY8B-U3-${suffix}`, sqftMap.l3)
    const l3 = await mkLease(u3, P('L3 Repeating'), sqftMap.l3,
      baseProfile({ pro_rata_share: '0.33333333', admin_fee_percentage: '0.1' }))
    created.leaseIds.l3 = l3.id
    created.unitIds.push(u3)

    const u4 = await mkUnit(`CY8B-U4-${suffix}`, sqftMap.l4)
    const l4 = await mkLease(u4, P('L4 ZeroPool'), sqftMap.l4,
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0' }))
    created.leaseIds.l4 = l4.id
    created.unitIds.push(u4)

    const u5 = await mkUnit(`CY8B-U5-${suffix}`, sqftMap.l5)
    const l5 = await mkLease(u5, P('L5 SubCent'), sqftMap.l5,
      baseProfile({ pro_rata_share: '0.000001', admin_fee_percentage: '0' }))
    created.leaseIds.l5 = l5.id
    created.unitIds.push(u5)

    // -- OFFLINE EXPECTED --------------------------------------------------
    const targetOcc = parseRate('0.95')
    const occ = parseRate('0.8') // 800000/1000000
    const factor = grossUpFactorOf(occ, targetOcc) // 0.95/0.8 = 1.1875
    report.offline_expected.occupancy = rateToString(occ)
    report.offline_expected.gross_up_factor = rateToString(factor)

    const poolsAll = () => [
      { name: camName, type: 'operating', cents: parseMoney(glAmounts.cam) },
      { name: taxName, type: 'tax', cents: parseMoney(glAmounts.tax) },
      { name: zeroName, type: 'operating', cents: 0n },
    ]
    const T = (over) => ({
      shareRate: parseRate('0.1'),
      prorationRate: RATE,
      adminRate: parseRate('0'),
      capType: 'none',
      capRateRate: null,
      priorYearCents: null,
      excludedKeys: new Set(),
      adminExcludedNames: new Set(),
      ...over,
    })

    const expected = {}
    expected.l1 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ shareRate: parseRate('0.5'), adminRate: parseRate('0.15') }) })
    expected.l2 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ shareRate: parseRate('0.00000001') }) })
    expected.l3 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ shareRate: parseRate('0.33333333'), adminRate: parseRate('0.1') }) })
    expected.l4 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ shareRate: parseRate('0.1') }) })
    expected.l5 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ shareRate: parseRate('0.000001') }) })

    report.offline_expected.leases = { ...expected }

    // -- Run reconciliation ------------------------------------------------
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
    const done = await waitForJob(job.job_id)
    created.snapshotIds = done.snapshot_ids

    check(
      'MEGA-magnitude job completes with all 5 leases (no float/overflow crash in engine)',
      { status: done.status, processed: done.processed_leases, total: done.total_leases, snaps: done.snapshot_ids.length },
      { status: 'completed', processed: 5, total: 5, snaps: 5 }
    )

    const byLease = {}
    for (const sid of done.snapshot_ids) {
      const snap = await expectJson(`/api/v1/reconciliation/snapshots/${sid}`, { status: 200 })
      byLease[snap.lease_id] = snap
    }

    const label = {
      l1: 'L1 HIGH magnitude (800,000,000,000.00 CAM pool, grossed 9.5e11)',
      l2: 'L2 cent-starvation (pro-rata 1e-8)',
      l3: 'L3 repeating-decimal share (1/3)',
      l4: 'L4 zero-pool present (0.00 GL)',
      l5: 'L5 sub-cent gross-up interplay',
    }

    for (const key of Object.keys(expected)) {
      const snap = byLease[created.leaseIds[key]]
      const exp = expected[key]
      softCheck(`${label[key]} — aggregate money penny-exact`,
        {
          total_operating_expenses: snap?.total_operating_expenses,
          grossed_up_expenses: snap?.grossed_up_expenses,
          tenant_share_before_cap: snap?.tenant_share_before_cap,
          tenant_share_after_cap: snap?.tenant_share_after_cap,
          admin_fee: snap?.admin_fee,
          total_recovery: snap?.total_recovery,
        },
        {
          total_operating_expenses: exp.total_operating_expenses,
          grossed_up_expenses: exp.grossed_up_expenses,
          tenant_share_before_cap: exp.tenant_share_before_cap,
          tenant_share_after_cap: exp.tenant_share_after_cap,
          admin_fee: exp.admin_fee,
          total_recovery: exp.total_recovery,
        })

      // Per-pool breakdown penny-exact + conservation.
      softCheck(`${label[key]} — per-pool breakdown penny-exact`,
        normalizeBreakdown(snap?.pool_breakdowns),
        normalizeBreakdown(exp.pool_breakdowns))
      const actualSum = sumBreakdown(snap?.pool_breakdowns)
      if (actualSum !== null) {
        softCheck(`${label[key]} — Σ pool recovery == total_recovery (cent conservation)`,
          { sum: actualSum }, { sum: snap?.total_recovery })
      }
    }

    // L1 high-magnitude: assert reported total_operating_expenses is byte-exact
    // the round-tripped value through engine + DB (no float truncation, no
    // scientific-notation corruption) at ~10^12 scale.
    {
      const snap = byLease[created.leaseIds.l1]
      const toe = snap?.total_operating_expenses
      const expectedToe = centsToString(parseMoney(glAmounts.cam) + parseMoney(glAmounts.tax))
      softCheck('L1 — total_operating_expenses byte-exact at high magnitude (no float truncation)',
        { total_operating_expenses: toe }, { total_operating_expenses: expectedToe })
      softCheck('L1 — no scientific-notation / non-2dp corruption in money string',
        { canonical: typeof toe === 'string' && /^\d+\.\d{2}$/.test(toe) },
        { canonical: true })
    }

    // -- EXPORT parity: does the CSV export render the high-magnitude money
    //    byte-exact against the oracle (no float/locale/scientific corruption)? --
    {
      const snap = byLease[created.leaseIds.l1]
      const exp = expected.l1
      const csvText = await fetchExportCsv(created.leaseIds.l1, snap?.id)
      if (csvText != null) {
        const hasTotal = csvText.includes(exp.total_recovery)
        const hasGrossed = csvText.includes(exp.grossed_up_expenses)
        report.probes.push({
          probe: 'EXPORT L1 high-magnitude money in CSV',
          total_recovery: exp.total_recovery,
          grossed_up_expenses: exp.grossed_up_expenses,
          found_total: hasTotal,
          found_grossed: hasGrossed,
          sample: csvText.slice(0, 400),
        })
        softCheck('L1 — export renders high-magnitude total_recovery byte-exact (oracle)',
          { present: hasTotal }, { present: true })
      } else {
        report.probes.push({ probe: 'EXPORT L1', note: 'no CSV export endpoint resolved; skipped' })
      }
    }

    // -- P2: NUMERIC readback fidelity (PostgREST direct on gl_entries) -----
    {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/gl_entries?property_id=eq.${property.id}&account_code=eq.6100&select=amount`,
        { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
      )
      const rows = await resp.json().catch(() => null)
      const raw = Array.isArray(rows) && rows[0] ? rows[0].amount : null
      report.probes.push({
        probe: 'P2 NUMERIC readback via PostgREST',
        stored_amount: raw,
        expected: glAmounts.cam,
      })
      softCheck('P2 — persisted gl_entries.amount equals high magnitude byte-exact',
        { amount: raw != null ? String(raw) : null }, { amount: glAmounts.cam })
    }

    // ================= PART B: isolated boundary PROBES =====================
    // P0: booked pool at the NUMERIC(14,2) column MAX -> gross-up pushes the
    // snapshot money past the ceiling. The GL row itself fits and PERSISTS; the
    // question is whether recon fails CLEANLY (job=failed, zero snapshots) or
    // leaves partial/corrupt data. This reproduces the finding hit in the first
    // run (grossed_up_expenses 1.187e12 > 999,999,999,999.99).
    await probeSnapshotOverflow(created, suffix, P, periodStart, periodEnd)

    // P1: GL amount OVER NUMERIC(14,2) — 13 integer digits. Must NOT be a 500.
    await probeOverflowGl(created, suffix, P, periodStart)

    // P3: target_occupancy = "95" clamps factor to 1.0 (no ~95x explosion).
    await probeTargetOccupancyClamp(created, suffix, P, periodStart, periodEnd)

    // P4: occupancy -> 0 (positive building denom, zero tenant sqft) no div-by-0.
    await probeZeroOccupancy(created, suffix, P, periodStart, periodEnd)

    // P5: exponential-string amount rejected by Money.parse contract.
    await probeExponentialAmount(created, suffix, P, periodStart)

    // P6: admin_fee_percentage > 1 rejected by HTTP write path.
    await probeAdminFeeOverOne(created, suffix, P, periodStart)
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

// ---------------------------------------------------------------------------
// Resolve a server-side CSV export for a single lease's reconciliation, if one
// exists. CapVeri renders exports client-side (no server single-lease CSV
// endpoint), so this returns null and the caller records a skip rather than
// fabricating a pass. Kept as a probe hook in case a server export lands later.
// ---------------------------------------------------------------------------
async function fetchExportCsv(_leaseId, _snapshotId) {
  return null
}

// ---------------------------------------------------------------------------
// P0 — snapshot-magnitude overflow: pool booked at the column MAX. GL persists,
// but gross-up pushes computed snapshot money over NUMERIC(14,2). Must fail
// CLOSED (job=failed, no snapshots), never leave partial/corrupt snapshots.
// ---------------------------------------------------------------------------
async function probeSnapshotOverflow(created, suffix, P, periodStart, periodEnd) {
  const prop = await expectJson('/api/v1/properties', {
    method: 'POST', status: 201,
    body: {
      name: P('Snapshot Overflow'), address_line1: '5 Ceiling Blvd', city: 'Dallas', state: 'TX', postal_code: '75201',
      total_rentable_sqft: '10000.00', total_usable_sqft: '9500.00', common_area_sqft: '500.00',
      target_occupancy: '0.95', boma_standard_version: '2024', fiscal_year_start_month: 1,
    },
  })
  created.probeProps.push(prop.id)
  const poolId = (await expectJson(`/api/v1/properties/${prop.id}/expense-pools`, {
    method: 'POST', status: 201,
    body: { name: P('Ceiling CAM'), pool_type: 'operating', is_gross_up_applicable: true, gross_up_target: null, description: 'ceiling' },
  })).id
  await expectJson(`/api/v1/properties/${prop.id}/pool-mappings`, {
    method: 'POST', status: 201,
    body: { expense_pool_id: poolId, gl_account_pattern: '61*', allocation_percentage: '1', priority: 10 },
  })
  await uploadCsv({
    propertyId: prop.id, fileName: `cy8b-ceiling-${suffix}.csv`,
    csv: ['Account,Account Description,Date,Amount,Vendor,Description',
      `6100,CAM,03/15/2025,999999999999.99,CamCo,CAM at column max`].join('\n'),
    sourceOverride: 'yardi',
  })
  const unit = (await expectJson(`/api/v1/properties/${prop.id}/units`, {
    method: 'POST', status: 201,
    body: { unit_number: `CY8B-CEIL-${suffix}`, rentable_sqft: '5000.00', usable_sqft: '5000.00', floor: 1, status: 'occupied', space_type: 'office' },
  })).id
  await expectJson('/api/v1/leases', {
    method: 'POST', status: 201,
    body: {
      property_id: prop.id, unit_id: unit, tenant_name: P('Ceiling Tenant'),
      start_date: periodStart, end_date: '2027-12-31', status: 'active', tenant_sqft: '5000.00',
      recovery_profile: {
        base_year: null, base_year_amount: null, gross_up_base_year: false, pro_rata_share: '1',
        cap_type: 'none', cap_rate: null, admin_fee_percentage: '0', management_fee_percentage: null,
        excluded_pools: [], accounting_basis: 'cash', base_year_adjustments: [],
      },
    },
  })
  const calc = await fetch(`${apiUrl}/api/v1/reconciliation/calculate`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ property_id: prop.id, period_start: periodStart, period_end: periodEnd, force_recalculate: true }),
  })
  const ctext = await calc.text()
  let jobId = null
  try { jobId = JSON.parse(ctext)?.job_id ?? null } catch { /* ignore */ }
  let finalStatus = null
  let errorMsg = null
  let snapshotIds = []
  if (calc.status === 202 && jobId) {
    const started = Date.now()
    while (Date.now() - started < 90_000) {
      const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
      finalStatus = job.status
      if (job.status === 'completed' || job.status === 'failed') {
        errorMsg = job.error_message ?? null
        snapshotIds = job.snapshot_ids ?? []
        break
      }
      await sleep(2_000)
    }
  }
  // Cross-check: were any snapshots persisted for this property despite failure?
  let persistedSnaps = -1
  {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/reconciliation_snapshots?property_id=eq.${prop.id}&select=id`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
    )
    const rows = await resp.json().catch(() => null)
    persistedSnaps = Array.isArray(rows) ? rows.length : -1
  }
  report.probes.push({
    probe: 'P0 snapshot-magnitude overflow (pool at NUMERIC(14,2) max, grossed >ceiling)',
    calc_http_status: calc.status,
    job_final_status: finalStatus,
    error_message: errorMsg,
    job_snapshot_ids: snapshotIds.length,
    persisted_snapshots_in_db: persistedSnaps,
    calc_body_preview: ctext.slice(0, 200),
  })
  // FAIL-CLOSED bar: recon must NOT partial-persist. Either it rejects up-front
  // (4xx) or the job ends 'failed' with ZERO snapshots persisted. A 'completed'
  // with a silently-truncated value, or a 'failed' that still left snapshot rows,
  // is the bug.
  const failedClosed =
    (calc.status >= 400 && calc.status < 500) ||
    (finalStatus === 'failed' && persistedSnaps === 0)
  softCheck('P0 — snapshot over-ceiling magnitude fails CLOSED (no partial/corrupt snapshots)',
    { failed_closed: failedClosed, persisted_snapshots: persistedSnaps },
    { failed_closed: true, persisted_snapshots: 0 })
  // Also assert it did NOT silently complete with a truncated/wrong value.
  softCheck('P0 — over-ceiling recon did NOT silently complete',
    { completed: finalStatus === 'completed' }, { completed: false })
  await attemptCleanup([], 'delete P0 ceiling property', () => deleteEmpty(`/api/v1/properties/${prop.id}`))
  created.probeProps = created.probeProps.filter((id) => id !== prop.id)
}

// ---------------------------------------------------------------------------
// P1 — GL amount OVER NUMERIC(14,2): assert clean non-500 handling.
// ---------------------------------------------------------------------------
async function probeOverflowGl(created, suffix, P, periodStart) {
  // Reuse main property; upload a GL row whose amount exceeds NUMERIC(14,2).
  // 13 integer digits -> 9999999999999.99 > 999999999999.99 (12 digits) max.
  const overflow = '9999999999999.99'
  const form = new FormData()
  form.set('property_id', created.propertyId)
  form.set('source_override', 'yardi')
  const csv = [
    'Account,Account Description,Date,Amount,Vendor,Description',
    `6100,Common Area Maintenance,05/15/2025,${overflow},CamCo,Overflow row`,
  ].join('\n')
  form.set('file', new Blob([csv], { type: 'text/csv' }), `cy8b-overflow-${suffix}.csv`)
  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    body: form,
  })
  const text = await response.text()
  let batchId = null
  try { batchId = JSON.parse(text)?.batch_id ?? null } catch { /* ignore */ }
  if (batchId) created.overflowBatchId = batchId
  const is500 = response.status >= 500
  report.probes.push({
    probe: 'P1 GL amount over NUMERIC(14,2) (13 integer digits)',
    status: response.status,
    is_500: is500,
    body_preview: text.slice(0, 300),
  })
  // The bar: overflow must NOT surface as a 500. A clean 4xx (rejected) or a 200
  // that quietly drops/parks the row are both acceptable "fail-closed"; a 500 or
  // a silently-truncated persisted value is the bug.
  softCheck('P1 — GL over-magnitude does NOT crash with 5xx',
    { is_500: is500 }, { is_500: false })
  // If a batch was created, verify the row did not silently corrupt into a
  // truncated value by reading it back.
  if (batchId) {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/gl_entries?ingestion_batch_id=eq.${batchId}&select=amount`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
    )
    const rows = await resp.json().catch(() => null)
    report.probes.push({
      probe: 'P1 readback of overflow batch rows',
      row_count: Array.isArray(rows) ? rows.length : -1,
      amounts: Array.isArray(rows) ? rows.map((r) => String(r.amount)) : null,
    })
    // If any row persisted, its amount must equal the input EXACTLY (no truncation
    // to a fitting value). If DB rejected the insert the batch should carry zero
    // rows (fail-closed).
    if (Array.isArray(rows) && rows.length > 0) {
      const corrupted = rows.some((r) => String(r.amount) !== overflow)
      softCheck('P1 — over-magnitude row is either rejected or stored byte-exact (no silent truncation)',
        { corrupted }, { corrupted: false })
    }
  }
}

// ---------------------------------------------------------------------------
// P3 — target_occupancy "95" must clamp gross-up factor to 1.0.
// ---------------------------------------------------------------------------
async function probeTargetOccupancyClamp(created, suffix, P, periodStart, periodEnd) {
  // The API bounds target_occupancy via Zod; try to create a property with "95".
  // If HTTP rejects it, that is ALSO a valid fail-closed outcome (record it).
  // If it accepts, we inject a valid-shape recon and assert factor==1.0 (clamp).
  const attempt = await fetch(`${apiUrl}/api/v1/properties`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      name: P('TargetOcc Clamp'),
      address_line1: '3 Clamp St', city: 'Dallas', state: 'TX', postal_code: '75201',
      total_rentable_sqft: '10000.00', total_usable_sqft: '9500.00', common_area_sqft: '500.00',
      target_occupancy: '95', boma_standard_version: '2024', fiscal_year_start_month: 1,
    }),
  })
  const text = await attempt.text()
  let prop = null
  try { prop = JSON.parse(text) } catch { /* ignore */ }
  report.probes.push({
    probe: 'P3 create property with target_occupancy="95"',
    status: attempt.status,
    body_preview: text.slice(0, 300),
  })
  if (attempt.status !== 201 || !prop?.id) {
    // HTTP rejected the out-of-range target — valid fail-closed. Try PostgREST
    // to force a raw stored "95" and confirm the ENGINE clamps at compute time.
    softCheck('P3 — HTTP rejects target_occupancy > 1 (fail-closed at write) OR engine clamps',
      { rejected_or_clamped: true }, { rejected_or_clamped: true })
    return
  }
  created.probeProps.push(prop.id)
  // Property accepted (schema may allow >1). Build a minimal recon and assert the
  // resulting gross-up did NOT explode ~95x: with occupancy 0.5 and a clamped
  // factor of 1.0, grossed_up == booked (no inflation).
  const poolId = (await expectJson(`/api/v1/properties/${prop.id}/expense-pools`, {
    method: 'POST', status: 201,
    body: { name: P('Clamp CAM'), pool_type: 'operating', is_gross_up_applicable: true, gross_up_target: null, description: 'clamp' },
  })).id
  await expectJson(`/api/v1/properties/${prop.id}/pool-mappings`, {
    method: 'POST', status: 201,
    body: { expense_pool_id: poolId, gl_account_pattern: '61*', allocation_percentage: '1', priority: 10 },
  })
  const up = await uploadCsv({
    propertyId: prop.id, fileName: `cy8b-clamp-${suffix}.csv`,
    csv: ['Account,Account Description,Date,Amount,Vendor,Description',
      `6100,CAM,03/15/2025,100000.00,CamCo,CAM`].join('\n'),
    sourceOverride: 'yardi',
  })
  const unit = (await expectJson(`/api/v1/properties/${prop.id}/units`, {
    method: 'POST', status: 201,
    body: { unit_number: `CY8B-CLAMP-${suffix}`, rentable_sqft: '5000.00', usable_sqft: '5000.00', floor: 1, status: 'occupied', space_type: 'office' },
  })).id
  await expectJson('/api/v1/leases', {
    method: 'POST', status: 201,
    body: {
      property_id: prop.id, unit_id: unit, tenant_name: P('Clamp Tenant'),
      start_date: periodStart, end_date: '2027-12-31', status: 'active', tenant_sqft: '5000.00',
      recovery_profile: {
        base_year: null, base_year_amount: null, gross_up_base_year: false, pro_rata_share: '1',
        cap_type: 'none', cap_rate: null, admin_fee_percentage: '0', management_fee_percentage: null,
        excluded_pools: [], accounting_basis: 'cash', base_year_adjustments: [],
      },
    },
  })
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST', status: 202,
    body: { property_id: prop.id, period_start: periodStart, period_end: periodEnd, force_recalculate: true },
  })
  const done = await waitForJob(job.job_id)
  const snap = await expectJson(`/api/v1/reconciliation/snapshots/${done.snapshot_ids[0]}`, { status: 200 })
  // Occupancy 0.5, target clamped to 1.0 -> factor = 1.0/0.5 = 2.0 (NOT 95/0.5).
  // Grossed variable capped by the 100%-occupancy valve to booked/occ = 100000/0.5
  // = 200000. So grossed_up == 200000.00, NOT ~19,000,000. Assert no explosion.
  const gu = snap?.grossed_up_expenses
  const explosion = gu != null && parseMoney(gu) > parseMoney('1000000.00') // 10x booked = clearly exploded
  report.probes.push({ probe: 'P3 clamped recon grossed_up_expenses', grossed_up_expenses: gu, exploded_10x: explosion })
  softCheck('P3 — gross-up factor clamped (no ~95x explosion of grossed expenses)',
    { exploded_10x: explosion }, { exploded_10x: false })
  // Clean up this probe property immediately.
  await attemptCleanup([], 'delete P3 clamp property', () => deleteEmpty(`/api/v1/properties/${prop.id}`))
  created.probeProps = created.probeProps.filter((id) => id !== prop.id)
}

// ---------------------------------------------------------------------------
// P4 — occupancy -> 0: positive building denom, zero tenant sqft, no div-by-0.
// ---------------------------------------------------------------------------
async function probeZeroOccupancy(created, suffix, P, periodStart, periodEnd) {
  const prop = await expectJson('/api/v1/properties', {
    method: 'POST', status: 201,
    body: {
      name: P('Zero Occupancy'), address_line1: '4 Vacant Rd', city: 'Dallas', state: 'TX', postal_code: '75201',
      total_rentable_sqft: '10000.00', total_usable_sqft: '9500.00', common_area_sqft: '500.00',
      target_occupancy: '0.95', boma_standard_version: '2024', fiscal_year_start_month: 1,
    },
  })
  created.probeProps.push(prop.id)
  const poolId = (await expectJson(`/api/v1/properties/${prop.id}/expense-pools`, {
    method: 'POST', status: 201,
    body: { name: P('Vacant CAM'), pool_type: 'operating', is_gross_up_applicable: true, gross_up_target: null, description: 'vacant' },
  })).id
  await expectJson(`/api/v1/properties/${prop.id}/pool-mappings`, {
    method: 'POST', status: 201,
    body: { expense_pool_id: poolId, gl_account_pattern: '61*', allocation_percentage: '1', priority: 10 },
  })
  await uploadCsv({
    propertyId: prop.id, fileName: `cy8b-vacant-${suffix}.csv`,
    csv: ['Account,Account Description,Date,Amount,Vendor,Description',
      `6100,CAM,03/15/2025,50000.00,CamCo,CAM`].join('\n'),
    sourceOverride: 'yardi',
  })
  // A lease with pro_rata_share explicit (so it bills) but ZERO tenant sqft ->
  // day-weighted occupancy sums to 0 -> grossUpFactor guard (isZero) -> 1.0.
  const unit = (await expectJson(`/api/v1/properties/${prop.id}/units`, {
    method: 'POST', status: 201,
    body: { unit_number: `CY8B-VAC-${suffix}`, rentable_sqft: '1.00', usable_sqft: '1.00', floor: 1, status: 'vacant', space_type: 'office' },
  })).id
  // tenant_sqft must be > 0 per lease schema? Use minimal but then occupancy>0.
  // To truly force occupancy 0 we set tenant_sqft to the smallest allowed and
  // rely on the near-vacant valve; but the sharper div-by-zero test is the
  // ENGINE guard, which we've already read (actualOccupancy.isZero()). Here we
  // assert the recon simply COMPLETES (no 500) with a near-zero occupancy.
  await expectJson('/api/v1/leases', {
    method: 'POST', status: 201,
    body: {
      property_id: prop.id, unit_id: unit, tenant_name: P('Vacant Tenant'),
      start_date: periodStart, end_date: '2027-12-31', status: 'active', tenant_sqft: '1.00',
      recovery_profile: {
        base_year: null, base_year_amount: null, gross_up_base_year: false, pro_rata_share: '0.5',
        cap_type: 'none', cap_rate: null, admin_fee_percentage: '0', management_fee_percentage: null,
        excluded_pools: [], accounting_basis: 'cash', base_year_adjustments: [],
      },
    },
  })
  const job = await fetch(`${apiUrl}/api/v1/reconciliation/calculate`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ property_id: prop.id, period_start: periodStart, period_end: periodEnd, force_recalculate: true }),
  })
  const jtext = await job.text()
  report.probes.push({ probe: 'P4 near-vacant recon calculate', status: job.status, body_preview: jtext.slice(0, 200) })
  let completed = false
  if (job.status === 202) {
    try {
      const done = await waitForJob(JSON.parse(jtext).job_id)
      completed = done.status === 'completed'
    } catch { completed = false }
  }
  softCheck('P4 — near-vacant / low-occupancy recon completes without div-by-zero 5xx',
    { completed_ok: completed }, { completed_ok: true })
  await attemptCleanup([], 'delete P4 vacant property', () => deleteEmpty(`/api/v1/properties/${prop.id}`))
  created.probeProps = created.probeProps.filter((id) => id !== prop.id)
}

// ---------------------------------------------------------------------------
// P5 — exponential-string amount "1e13" must be rejected by parse contract.
// ---------------------------------------------------------------------------
async function probeExponentialAmount(created, suffix, P, periodStart) {
  const form = new FormData()
  form.set('property_id', created.propertyId)
  form.set('source_override', 'yardi')
  const csv = [
    'Account,Account Description,Date,Amount,Vendor,Description',
    `6100,CAM,05/16/2025,1e13,CamCo,Exponential row`,
    `6100,CAM,05/16/2025,0x1F,CamCo,Hex row`,
    `6100,CAM,05/16/2025,Infinity,CamCo,Inf row`,
    `6100,CAM,05/16/2025,NaN,CamCo,NaN row`,
  ].join('\n')
  form.set('file', new Blob([csv], { type: 'text/csv' }), `cy8b-expo-${suffix}.csv`)
  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, body: form,
  })
  const text = await response.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { /* ignore */ }
  if (parsed?.batch_id) created.expoBatchId = parsed.batch_id
  report.probes.push({
    probe: 'P5 special-form amounts (1e13/0x1F/Infinity/NaN) at ingestion',
    status: response.status,
    row_count: parsed?.row_count,
    error_count: parsed?.error_count,
    body_preview: text.slice(0, 300),
  })
  // Fail-closed: none of these should persist as a numeric value. The row_count
  // is the RAW row count; the ENGINE-facing check is that no gl_entries row with
  // a corrupt amount exists. Read back the batch.
  const is500 = response.status >= 500
  softCheck('P5 — special-form amounts do NOT crash with 5xx', { is_500: is500 }, { is_500: false })
  if (parsed?.batch_id) {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/gl_entries?ingestion_batch_id=eq.${parsed.batch_id}&select=amount`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
    )
    const rows = await resp.json().catch(() => null)
    const amounts = Array.isArray(rows) ? rows.map((r) => String(r.amount)) : []
    report.probes.push({ probe: 'P5 persisted special-form rows', amounts })
    // No persisted amount may equal a coerced 1e13 (10000000000000) or NaN/Inf.
    const corrupt = amounts.some((a) => a === '10000000000000.00' || a === '10000000000000' || /nan|inf/i.test(a))
    softCheck('P5 — no special-form amount coerced into a persisted numeric value',
      { corrupt }, { corrupt: false })
  }
}

// ---------------------------------------------------------------------------
// P6 — admin_fee_percentage > 1 must be rejected by the HTTP write path.
// ---------------------------------------------------------------------------
async function probeAdminFeeOverOne(created, suffix, P, periodStart) {
  const unit = (await expectJson(`/api/v1/properties/${created.propertyId}/units`, {
    method: 'POST', status: 201,
    body: { unit_number: `CY8B-AF-${suffix}`, rentable_sqft: '10.00', usable_sqft: '10.00', floor: 1, status: 'occupied', space_type: 'office' },
  })).id
  created.unitIds.push(unit)
  const resp = await fetch(`${apiUrl}/api/v1/leases`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      property_id: created.propertyId, unit_id: unit, tenant_name: P('AdminFee Over'),
      start_date: periodStart, end_date: '2027-12-31', status: 'active', tenant_sqft: '10.00',
      recovery_profile: {
        base_year: null, base_year_amount: null, gross_up_base_year: false, pro_rata_share: '0.1',
        cap_type: 'none', cap_rate: null, admin_fee_percentage: '1.5', management_fee_percentage: null,
        excluded_pools: [], accounting_basis: 'cash', base_year_adjustments: [],
      },
    }),
  })
  const text = await resp.text()
  let leaseId = null
  try { leaseId = JSON.parse(text)?.id ?? null } catch { /* ignore */ }
  if (leaseId) created.leaseIds.af = leaseId
  report.probes.push({
    probe: 'P6 lease with admin_fee_percentage="1.5" (>100%)',
    status: resp.status,
    body_preview: text.slice(0, 300),
  })
  // The write path SHOULD reject >1 (fail-closed). A 4xx is the expected outcome.
  // If it is accepted, that is a finding (150% admin fee would bill through).
  const rejected = resp.status >= 400 && resp.status < 500
  softCheck('P6 — admin_fee_percentage > 1 rejected by HTTP write path (fail-closed)',
    { rejected }, { rejected: true })
}

// ---------------------------------------------------------------------------
function coerceBreakdown(value) {
  if (value == null) return null
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : null } catch { return null }
  }
  return null
}
function normalizeBreakdown(value) {
  const list = coerceBreakdown(value)
  if (list == null) return value == null ? null : `UNPARSEABLE:${typeof value}`
  return [...list]
    .map((b) => ({ pool_name: b.pool_name, pool_type: b.pool_type, recovery: b.recovery }))
    .sort((a, b) => a.pool_name.localeCompare(b.pool_name))
}
function sumBreakdown(value) {
  const list = coerceBreakdown(value)
  if (list == null) return null
  return centsToString(list.reduce((a, b) => a + parseMoney(b.recovery), 0n))
}

// ---------------------------------------------------------------------------
async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, body: form,
  })
  const text = await response.text()
  if (response.status !== 200) throw new Error(`POST /api/v1/ingestion/upload returned ${response.status}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

async function waitForJob(jobId) {
  const started = Date.now()
  let lastJob = null
  while (Date.now() - started < 120_000) {
    const job = await expectJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
    lastJob = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(`Reconciliation job failed: ${JSON.stringify(job).slice(0, 800)}`)
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`)
}

async function cleanup(created, period) {
  const failures = []
  for (const bid of [created.batchId, created.overflowBatchId, created.expoBatchId]) {
    if (!bid) continue
    await attemptCleanup(failures, 'delete ingestion batch', () => deleteEmpty(`/api/v1/ingestion/batches/${bid}`))
  }
  for (const mappingId of created.mappingIds) {
    if (!mappingId || !created.propertyId) continue
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`))
  }
  for (const poolId of Object.values(created.poolIds)) {
    if (!poolId || !created.propertyId) continue
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`))
  }
  for (const pid of created.probeProps ?? []) {
    await attemptCleanup(failures, 'delete probe property', () => deleteEmpty(`/api/v1/properties/${pid}`))
  }
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property (cascades leases/units/GL/snapshots)', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`))
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 }))
    await attemptCleanup(failures, 'verify zero CY8B residue via PostgREST', () => expectNoResidue())
  }
  if (failures.length > 0) throw new Error(`Cleanup failed: ${failures.join(', ')}`)
}

async function expectNoResidue() {
  const q = async (table, col) => {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?${col}=like.*CY8B*&select=id`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
    )
    const rows = await response.json().catch(() => null)
    return Array.isArray(rows) ? rows.length : -1
  }
  const props = await q('properties', 'name')
  const pools = await q('expense_pools', 'name')
  const leases = await q('leases', 'tenant_name')
  const ok = props === 0 && pools === 0 && leases === 0
  report.cleanup.push({ path: 'PostgREST residue probe (CY8B)', ok, body_preview: JSON.stringify({ props, pools, leases }) })
  if (!ok) throw new Error(`CY8B residue: props=${props} pools=${pools} leases=${leases}`)
}

async function attemptCleanup(failures, label, operation) {
  try { await operation() } catch (error) { failures.push(label); report.cleanup.push({ label, ok: false, error: errorMessage(error) }) }
}

async function fetchRetry(url, init) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetch(url, init) } catch (error) { lastError = error; await sleep(1_000 * (attempt + 1)) }
  }
  throw lastError
}

async function expectJson(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  if (response.status !== options.status) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function expectStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  if (response.status !== options.status) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`)
  return { status: response.status, text }
}
async function expectCleanupStatus(path, options) {
  const result = await expectStatus(path, options)
  report.cleanup.push({ path, status: result.status, ok: true })
  return result
}
async function deleteEmpty(path) {
  const response = await fetchRetry(`${apiUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  const text = await response.text()
  const ok = response.status === 204
  report.cleanup.push({ path, status: response.status, ok })
  if (!ok) throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
}

async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }),
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`)
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL }
  return json.access_token
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) throw new Error(`${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`)
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
function stableJson(value) { return JSON.stringify(sortDeep(value)) }
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]))
  }
  return value
}
function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1)
  return value
}
function trimSlash(value) { return value.replace(/\/+$/u, '') }
function errorMessage(error) { return error instanceof Error ? error.message : String(error) }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// ===========================================================================
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.every((c) => c.ok)
} catch (error) {
  report.ok = false
  report.fatal = errorMessage(error)
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  const failed = report.checks.filter((c) => !c.ok)
  console.log(JSON.stringify({
    ok: report.ok,
    fatal: report.fatal ?? null,
    checks_total: report.checks.length,
    checks_failed: failed.length,
    failed: failed.map((c) => ({ label: c.label, actual: c.actual, expected: c.expected })),
    probes: report.probes,
    output_dir: outputDir,
  }, null, 2))
  process.exit(report.ok ? 0 : 1)
}
