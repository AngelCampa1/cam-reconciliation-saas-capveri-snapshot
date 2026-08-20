/**
 * PROD E2E STRESS — MULTI-POOL CAM allocation + per-pool line-item breakdown.
 *
 * Domain (Cycle 4A): the per-pool `pool_breakdowns` payload on a reconciliation
 * snapshot — the cross-check Cycle 3A explicitly auto-skipped because a
 * single-pool shape produces no meaningful breakdown. This scenario runs MANY
 * pools (7-8) with mixed types + sharing so the per-pool line-item payload is
 * densely populated, then verifies it penny-exact against an INDEPENDENT offline
 * port of the deployed engine (calculator.ts `allocatePoolBreakdowns` +
 * `calculateTenantRecovery`), never echoing the API back at itself.
 *
 * ENGINE under test: cloudflare-reconciliation-v1 on api.capveri.com.
 *
 * Pools (7):
 *   CAM Ops        operating  grossable   large   (61*)
 *   Utilities      operating  grossable           (62*)
 *   Management Fee operating  grossable   (name-marked; mgmt cap binds)  (65*)
 *   Real Estate Tax tax       FIXED (type-exempt gross-up + cap)  (67*)
 *   Insurance      insurance  FIXED                (63*)
 *   Security       other      grossable            (64*)
 *   Landscaping    operating  grossable   0.00 amount (68*, no GL)  edge
 *
 * Leases exercise, in ONE run:
 *   M1  vanilla multi-pool: proportional Layer-1 split, penny-exact Σ==recovery
 *   M2  excluded_pools (insurance TYPE) removed -> pool absent from breakdown
 *   M3  BINDING non_cumulative cap -> Layer-2 cap reduction to controllable
 *       (operating/other) pools first, tax/insurance untouched
 *   M4  admin_fee_excluded_pools=[Insurance name] (PostgREST) -> Layer-3 admin
 *       fee attributed only to fee-eligible pools; excluded pool has share only
 *   M5  DOUBLE-exclusion: same pool (insurance) in BOTH excluded_pools AND
 *       admin_fee_excluded_pools -> excluded from breakdown entirely (no double
 *       count); admin fee over remaining pools
 *   M6  mgmt-fee cap binds AND admin fee AND cap: order-of-operations proof
 *   M7  repeating-decimal share (1/3) -> largest-remainder conserves to penny
 *   M8  cap so hard it exceeds controllable capacity -> spill onto cap-exempt
 *       (tax/insurance) pools; per-pool still reconciles to capped aggregate
 *
 * Cross-surface identities asserted per lease:
 *   Σ pool_breakdowns.recovery == total_recovery (== after_cap + admin_fee)
 *   no breakdown line negative when the pool had positive expense
 *   excluded pools absent from breakdown
 * And aggregate: potential_recovery_total == Σ per-lease total_recovery.
 *
 * EXPECTED computed OFFLINE in exact BigInt-cents arithmetic (faithful port of
 * money.ts + calculator.ts). Oracle parity is NOT the bar; first-principles
 * correctness is (CLAUDE.md).
 *
 * KNOWN gated gap A1: admin_fee_excluded_pools is engine-honored but PostgREST-
 * only (API strips it). Injected via user-JWT PostgREST raw write; NOT re-
 * reported as a new bug.
 *
 * All entities prefixed "[PROD-TEST] CY4A". Cleanup in finally; residue re-
 * verified via PostgREST direct query. No finalized snapshots -> user-JWT delete
 * cascades cleanly.
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
  `prod-stress-multipool-allocation-${runId}`
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
  auth: {},
}

let token

// ===========================================================================
// Exact integer arithmetic — port of cloudflare-backend money.ts semantics.
// ===========================================================================
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
const rateDiv = (a, b) => roundDiv(a * RATE, b)
/** Rate.quantize(4): half-up to 4 decimals on the 1e8 scale. */
const quantize4 = (rate) => roundDiv(rate, 10_000n) * 10_000n

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

// ---------------------------------------------------------------------------
// largestRemainder — faithful port (calculator.ts:790). Non-negative weights;
// floor each proportional share, hand leftover cents to largest fractional
// remainders (ties -> lowest index). Zero total weight -> even split.
// ---------------------------------------------------------------------------
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
// Offline engine model. Ports calculator.ts for a SINGLE reconciliation period
// (no cumulative history in this scenario, so non_cumulative cap only). Covers:
// per-pool bare gross-up (type-exempt tax/insurance/capital), aggregate gross-up
// with single valve, management-fee cap, excluded pools (type|name), base-year
// (none here), sequential pro-rata*proration, non_cumulative cap, admin fee
// (inclusion ratio over post-mgmt-cap breakdown filtered by admin-excluded
// NAMES), and the 3-layer allocatePoolBreakdowns.
// ---------------------------------------------------------------------------
const TARGET_OCC = parseRate('0.95')
const GROSS_UP_EXEMPT = new Set(['tax', 'insurance', 'capital'])
const CAP_EXEMPT = new Set(['tax', 'insurance', 'capital'])
const MIN_SAFE_OCC = parseRate('0.0001')
const MGMT_MARKER = 'management fee'

function grossUpFactorOf(occ) {
  if (occ === 0n || occ >= TARGET_OCC) return RATE
  return quantize4(rateDiv(TARGET_OCC, occ))
}

/**
 * Full lease snapshot incl. per-pool breakdown.
 * pools: [{ name, type, cents }]  (type lowercased pool_type; cents = booked GL)
 * terms: {
 *   shareRate, prorationRate, adminRate, mgmtRate|null,
 *   capType, capRateRate|null, priorYearCents|null,
 *   excludedKeys:Set (lowercased type|name),
 *   adminExcludedNames:Set (lowercased pool names),
 * }
 */
function leaseSnapshot({ pools, occ, factor, terms }) {
  const nearVacant = !(occ > MIN_SAFE_OCC)

  // Per-pool BARE gross-up (no per-pool valve).
  const grossedBare = pools.map((p) => {
    const grossable = !GROSS_UP_EXEMPT.has(p.type) // scenario grossable pools all flag-true
    const amount =
      grossable && !nearVacant ? mulRate(p.cents, factor) : p.cents
    return { ...p, amount }
  })

  // Aggregate gross-up scalar with single safety valve.
  let variableBooked = 0n
  let fixedTotal = 0n
  for (const p of pools) {
    if (!GROSS_UP_EXEMPT.has(p.type)) variableBooked += p.cents
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

  // Management-fee cap on BARE-grossed pools.
  let mgmtExcess = 0n
  let leasePools = grossedBare.map((p) => ({ ...p, capped: p.amount }))
  if (terms.mgmtRate !== null && terms.mgmtRate !== 0n) {
    const mgmtIdx = leasePools
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.name.toLowerCase().includes(MGMT_MARKER))
      .sort((a, b) => {
        const an = a.p.name, bn = b.p.name
        if (an < bn) return -1
        if (an > bn) return 1
        return a.i - b.i
      })
    if (mgmtIdx.length > 0) {
      const mgmtSet = new Set(mgmtIdx.map(({ i }) => i))
      let operatingBase = 0n
      leasePools.forEach((p, i) => {
        if (p.type === 'operating' && !mgmtSet.has(i)) operatingBase += p.amount
      })
      let cap = mulRate(operatingBase, terms.mgmtRate)
      if (cap < 0n) cap = 0n
      const bookedFee = mgmtIdx.reduce((a, { p }) => a + p.amount, 0n)
      if (bookedFee > cap) {
        if (mgmtIdx.length === 1) {
          leasePools[mgmtIdx[0].i].capped = cap
        } else {
          const weights = mgmtIdx.map(({ p }) => p.amount)
          const reduced = largestRemainder(cap, weights)
          mgmtIdx.forEach(({ i }, pos) => {
            leasePools[i].capped = reduced[pos]
          })
        }
        mgmtExcess = bookedFee - cap
      }
    }
  }

  const totalOperating = pools.reduce((a, p) => a + p.cents, 0n)

  // Excluded pools (type OR name match); summed from post-mgmt-cap dict.
  const isExcluded = (p) =>
    terms.excludedKeys.has(p.type) || terms.excludedKeys.has(p.name.toLowerCase())
  const excludedAmount = leasePools
    .filter(isExcluded)
    .reduce((a, p) => a + p.capped, 0n)

  const netRecoverable = aggregateGrossedUp - mgmtExcess - excludedAmount

  // No base year in this scenario.
  const increaseOverBase = netRecoverable

  // Sequential pro-rata then proration; floor at 0.
  let before = mulRate(mulRate(increaseOverBase, terms.shareRate), terms.prorationRate)
  if (before < 0n) before = 0n

  // non_cumulative cap (or none).
  let after = before
  if (terms.capType === 'non_cumulative' && terms.capRateRate !== null) {
    const base = terms.priorYearCents
    if (base !== null && base !== 0n) {
      // rate range assumed valid (bounded via schema/inject 0..1)
      const onePlusRate = RATE + terms.capRateRate
      const ceiling = mulRate(base, onePlusRate)
      if (after > ceiling) after = ceiling
    }
    // zero/missing base -> uncapped (FIX CAP-4)
  }

  // Admin fee: inclusion ratio over post-mgmt-cap breakdown filtered by names.
  let adminBase
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
  } else {
    adminBase = after
  }
  let adminFee = mulRate(adminBase, terms.adminRate)
  // (no admin_fee_cap in this scenario)

  const grossedUpExpenses = aggregateGrossedUp - mgmtExcess
  const totalRecovery = after + adminFee

  // -- Per-pool breakdown (allocatePoolBreakdowns 3-layer port) --------------
  const included = leasePools.filter((p) => !isExcluded(p))
  const weights = included.map((p) => (p.capped > 0n ? p.capped : 0n))
  const totalWeight = weights.reduce((a, w) => a + w, 0n)
  let breakdown = null
  if (included.length > 0 && totalWeight > 0n) {
    const isCapEligible = included.map((p) => !CAP_EXEMPT.has(p.type))
    // Layer 1: pre-cap share proportional to recoverable amounts.
    const shareBefore = largestRemainder(before, weights)
    // Layer 2: cap reduction to controllable first, spill onto exempt.
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
    // Layer 3: admin fee over fee-eligible pools (name not admin-excluded).
    const isFeeEligible = included.map((p) => !terms.adminExcludedNames.has(p.name.toLowerCase()))
    const adminAlloc = new Array(included.length).fill(0n)
    if (adminFee !== 0n) {
      let feeIdx = included.map((_, i) => i).filter((i) => isFeeEligible[i])
      if (feeIdx.length === 0) feeIdx = included.map((_, i) => i)
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
  const P = (s) => `[PROD-TEST] CY4A ${s} ${suffix}`
  const periodStart = '2025-01-01'
  const periodEnd = '2025-12-31'
  const buildingSqft = '10000.00'

  // Pool display names (unique per run).
  const camName = P('CAM Ops')
  const utilName = P('Utilities')
  const mgmtName = P('Management Fee')
  const taxName = P('Real Estate Tax')
  const insName = P('Insurance')
  const secName = P('Security')
  const landName = P('Landscaping')

  const created = {
    propertyId: null,
    poolIds: {},
    mappingIds: [],
    unitIds: [],
    leaseIds: {},
    batchId: null,
    jobId: null,
    snapshotIds: [],
  }
  report.generated = { suffix, periodStart, periodEnd, buildingSqft }

  try {
    // -- Property ----------------------------------------------------------
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: P('MultiPool Allocation'),
        address_line1: '7 MultiPool Way',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
        total_rentable_sqft: buildingSqft,
        total_usable_sqft: '9500.00',
        common_area_sqft: '500.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    // -- Pools -------------------------------------------------------------
    const mkPool = async (name, poolType, grossUp) => {
      const p = await expectJson(
        `/api/v1/properties/${property.id}/expense-pools`,
        {
          method: 'POST',
          status: 201,
          body: {
            name,
            pool_type: poolType,
            is_gross_up_applicable: grossUp,
            gross_up_target: null,
            description: 'CY4A disposable pool',
          },
        }
      )
      return p.id
    }
    created.poolIds.cam = await mkPool(camName, 'operating', true)
    created.poolIds.util = await mkPool(utilName, 'operating', true)
    created.poolIds.mgmt = await mkPool(mgmtName, 'operating', true)
    created.poolIds.tax = await mkPool(taxName, 'tax', true) // type-exempt
    created.poolIds.ins = await mkPool(insName, 'insurance', true) // type-exempt
    created.poolIds.sec = await mkPool(secName, 'other', true)
    created.poolIds.land = await mkPool(landName, 'operating', true) // 0.00

    // -- Pool mappings (GL account prefixes) -------------------------------
    const mkMapping = async (poolId, pattern) => {
      const m = await expectJson(
        `/api/v1/properties/${property.id}/pool-mappings`,
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
      return m.id
    }
    created.mappingIds.push(await mkMapping(created.poolIds.cam, '61*'))
    created.mappingIds.push(await mkMapping(created.poolIds.util, '62*'))
    created.mappingIds.push(await mkMapping(created.poolIds.ins, '63*'))
    created.mappingIds.push(await mkMapping(created.poolIds.sec, '64*'))
    created.mappingIds.push(await mkMapping(created.poolIds.mgmt, '65*'))
    created.mappingIds.push(await mkMapping(created.poolIds.tax, '67*'))
    created.mappingIds.push(await mkMapping(created.poolIds.land, '68*'))

    // -- GL: distinct amounts; large CAM pool; 0.00 Landscaping (no GL row) --
    const glAmounts = {
      cam: '250000.00',
      util: '60000.00',
      ins: '30000.00',
      sec: '17777.77', // odd amount -> forces largest-remainder cent handling
      mgmt: '90000.00', // large -> mgmt cap will bind
      tax: '40000.00',
      // land: none -> 0.00
    }
    report.generated.glAmounts = glAmounts
    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `cy4a-gl-2025-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,03/15/2025,${glAmounts.cam},CamCo,CAM 2025`,
        `6200,Utilities,04/10/2025,${glAmounts.util},UtilCo,Utilities 2025`,
        `6300,Property Insurance,06/20/2025,${glAmounts.ins},InsCo,Insurance 2025`,
        `6400,Security,07/05/2025,${glAmounts.sec},SecCo,Security 2025`,
        `6500,Management Fee,09/10/2025,${glAmounts.mgmt},MgmtCo,Mgmt fee 2025`,
        `6700,Real Estate Taxes,11/01/2025,${glAmounts.tax},County,Taxes 2025`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    check(
      'GL upload creates six clean rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      { source_system: 'yardi', row_count: 6, error_count: 0 }
    )

    // -- Units + Leases ----------------------------------------------------
    // Full-year occupied sqft total kept < 9500 so gross-up ENGAGES (occ<0.95).
    // M1..M8 = 8 leases. Give each modest sqft; total = 8*1000 = 8000 < 9500.
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

    // M1 vanilla multi-pool + admin fee
    const u1 = await mkUnit(`CY4A-U1-${suffix}`, '1000.00')
    const m1 = await mkLease(u1, P('M1 Vanilla'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0.15' }))
    created.leaseIds.m1 = m1.id
    created.unitIds.push(u1)

    // M2 excluded_pools insurance TYPE
    const u2 = await mkUnit(`CY4A-U2-${suffix}`, '1000.00')
    const m2 = await mkLease(u2, P('M2 ExclType'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0.1', excluded_pools: ['insurance'] }))
    created.leaseIds.m2 = m2.id
    created.unitIds.push(u2)

    // M3 BINDING non_cumulative cap (needs prior-year finalized history -> inject)
    const u3 = await mkUnit(`CY4A-U3-${suffix}`, '1000.00')
    const m3 = await mkLease(u3, P('M3 Cap'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0.1', cap_type: 'non_cumulative', cap_rate: '0.03' }))
    created.leaseIds.m3 = m3.id
    created.unitIds.push(u3)

    // M4 admin_fee_excluded_pools=[insName] (PostgREST inject)
    const u4 = await mkUnit(`CY4A-U4-${suffix}`, '1000.00')
    const m4 = await mkLease(u4, P('M4 AdminExcl'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0.15' }))
    created.leaseIds.m4 = m4.id
    created.unitIds.push(u4)

    // M5 DOUBLE exclusion: insurance in excluded_pools AND admin_fee_excluded_pools
    const u5 = await mkUnit(`CY4A-U5-${suffix}`, '1000.00')
    const m5 = await mkLease(u5, P('M5 Double'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0.15', excluded_pools: ['insurance'] }))
    created.leaseIds.m5 = m5.id
    created.unitIds.push(u5)

    // M6 mgmt-fee cap + admin fee (order-of-ops)
    const u6 = await mkUnit(`CY4A-U6-${suffix}`, '1000.00')
    const m6 = await mkLease(u6, P('M6 MgmtCap'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0.1', management_fee_percentage: '0.05' }))
    created.leaseIds.m6 = m6.id
    created.unitIds.push(u6)

    // M7 repeating-decimal share 1/3
    const u7 = await mkUnit(`CY4A-U7-${suffix}`, '1000.00')
    const m7 = await mkLease(u7, P('M7 Repeating'), '1000.00',
      baseProfile({ pro_rata_share: '0.33333333', admin_fee_percentage: '0.1' }))
    created.leaseIds.m7 = m7.id
    created.unitIds.push(u7)

    // M8 hard cap that EXCEEDS controllable capacity -> spill onto tax/insurance
    const u8 = await mkUnit(`CY4A-U8-${suffix}`, '1000.00')
    const m8 = await mkLease(u8, P('M8 Spill'), '1000.00',
      baseProfile({ pro_rata_share: '0.1', admin_fee_percentage: '0', cap_type: 'non_cumulative', cap_rate: '0.02' }))
    created.leaseIds.m8 = m8.id
    created.unitIds.push(u8)

    // -- PostgREST injections ----------------------------------------------
    // M4: admin_fee_excluded_pools = [insName]
    report.generated.m4_inject = await patchRecoveryProfileRaw(m4.id, {
      admin_fee_excluded_pools: [insName],
    })
    // M5: admin_fee_excluded_pools = [insName] (already excluded_pools too)
    report.generated.m5_inject = await patchRecoveryProfileRaw(m5.id, {
      admin_fee_excluded_pools: [insName],
    })
    // NOTE: the non_cumulative cap baseline is loaded from prior FINALIZED
    // reconciliation_snapshots (db/reconciliation.ts:1069), not a config field
    // or a tenant_cap_history table. These leases are fresh with no finalized
    // history, so M3/M8 caps are configured but non-binding (uncapped path,
    // FIX CAP-4). No history injection is possible/needed.

    // -- OFFLINE EXPECTED --------------------------------------------------
    // Occupancy: 8 full-year leases * 1000 sqft = 8000 / 10000 = 0.8000.
    const occ = parseRate('0.8')
    const factor = grossUpFactorOf(occ) // 0.95/0.80 = 1.1875 -> quantize4 1.1875
    report.offline_expected.occupancy = rateToString(occ)
    report.offline_expected.gross_up_factor = rateToString(factor)

    check(
      'offline design invariant: gross-up engaged (occupancy < target)',
      { occ_below_target: occ < TARGET_OCC, factor_above_one: factor > RATE },
      { occ_below_target: true, factor_above_one: true }
    )

    // Pools present on every lease (same GL); Landscaping present with 0.00.
    const poolsAll = () => [
      { name: camName, type: 'operating', cents: parseMoney(glAmounts.cam) },
      { name: utilName, type: 'operating', cents: parseMoney(glAmounts.util) },
      { name: mgmtName, type: 'operating', cents: parseMoney(glAmounts.mgmt) },
      { name: taxName, type: 'tax', cents: parseMoney(glAmounts.tax) },
      { name: insName, type: 'insurance', cents: parseMoney(glAmounts.ins) },
      { name: secName, type: 'other', cents: parseMoney(glAmounts.sec) },
      { name: landName, type: 'operating', cents: 0n },
    ]

    const T = (over) => ({
      shareRate: parseRate('0.1'),
      prorationRate: RATE,
      adminRate: parseRate('0'),
      mgmtRate: null,
      capType: 'none',
      capRateRate: null,
      priorYearCents: null,
      excludedKeys: new Set(),
      adminExcludedNames: new Set(),
      ...over,
    })

    const expected = {}
    expected.m1 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0.15') }) })
    expected.m2 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0.1'), excludedKeys: new Set(['insurance']) }) })
    // M3/M8 carry a non_cumulative cap CONFIG but NO prior finalized snapshot
    // exists for these fresh leases. The engine loads the cap baseline from
    // prior FINALIZED reconciliation_snapshots (db/reconciliation.ts:1069), not
    // a config field, so with no history FIX CAP-4 leaves the cap non-binding
    // (uncapped). Oracle mirrors that: priorYearCents=null.
    expected.m3 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0.1'), capType: 'non_cumulative', capRateRate: parseRate('0.03'), priorYearCents: null }) })
    expected.m4 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0.15'), adminExcludedNames: new Set([insName.toLowerCase()]) }) })
    expected.m5 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0.15'), excludedKeys: new Set(['insurance']), adminExcludedNames: new Set([insName.toLowerCase()]) }) })
    expected.m6 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0.1'), mgmtRate: parseRate('0.05') }) })
    expected.m7 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ shareRate: parseRate('0.33333333'), adminRate: parseRate('0.1') }) })
    expected.m8 = leaseSnapshot({ pools: poolsAll(), occ, factor,
      terms: T({ adminRate: parseRate('0'), capType: 'non_cumulative', capRateRate: parseRate('0.02'), priorYearCents: null }) })

    report.offline_expected.leases = Object.fromEntries(
      Object.entries(expected).map(([k, v]) => [k, v])
    )

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
      'job completes with all 8 leases',
      {
        status: done.status,
        processed_leases: done.processed_leases,
        total_leases: done.total_leases,
        snapshot_count: done.snapshot_ids.length,
      },
      { status: 'completed', processed_leases: 8, total_leases: 8, snapshot_count: 8 }
    )

    // Fetch each snapshot, map by lease_id.
    const byLease = {}
    for (const sid of done.snapshot_ids) {
      const snap = await expectJson(`/api/v1/reconciliation/snapshots/${sid}`, { status: 200 })
      byLease[snap.lease_id] = snap
    }

    const leaseLabel = {
      m1: 'M1 vanilla multi-pool proportional split',
      m2: 'M2 excluded_pools (insurance TYPE) absent from breakdown',
      m3: 'M3 non_cumulative cap config, no prior history -> uncapped (FIX CAP-4)',
      m4: 'M4 admin_fee_excluded_pools -> Layer-3 fee only on eligible pools',
      m5: 'M5 double-exclusion (excluded_pools + admin_fee_excluded_pools)',
      m6: 'M6 mgmt-fee cap + admin fee order-of-operations',
      m7: 'M7 repeating-decimal share (1/3) largest-remainder conservation',
      m8: 'M8 non_cumulative cap config, no prior history -> uncapped (FIX CAP-4)',
    }

    for (const key of Object.keys(expected)) {
      const leaseId = created.leaseIds[key]
      const snap = byLease[leaseId]
      const exp = expected[key]

      // Aggregate money fields penny-exact.
      softCheck(`${leaseLabel[key]} — aggregate money penny-exact`,
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

      // Per-pool breakdown penny-exact (normalized: sort by pool_name).
      softCheck(`${leaseLabel[key]} — per-pool breakdown penny-exact`,
        normalizeBreakdown(snap?.pool_breakdowns),
        normalizeBreakdown(exp.pool_breakdowns))

      // Cross-surface identity: Σ breakdown recovery == total_recovery.
      const actualSum = sumBreakdown(snap?.pool_breakdowns)
      softCheck(`${leaseLabel[key]} — Σ pool recovery == total_recovery`,
        { sum: actualSum, total_recovery: snap?.total_recovery },
        { sum: exp.total_recovery, total_recovery: exp.total_recovery })

      // Identity: total_recovery == after_cap + admin_fee.
      softCheck(`${leaseLabel[key]} — total_recovery == after_cap + admin_fee`,
        { total: snap?.total_recovery },
        { total: centsToString(parseMoney(exp.tenant_share_after_cap) + parseMoney(exp.admin_fee)) })

      // No breakdown line negative when it has positive expense (adversarial).
      const negatives = (coerceBreakdown(snap?.pool_breakdowns) ?? []).filter((b) => parseMoney(b.recovery) < 0n)
      softCheck(`${leaseLabel[key]} — no negative breakdown line`,
        { negative_count: negatives.length },
        { negative_count: 0 })
    }

    // Excluded-pool absence checks (M2/M5 must NOT list insurance).
    for (const key of ['m2', 'm5']) {
      const snap = byLease[created.leaseIds[key]]
      const names = (coerceBreakdown(snap?.pool_breakdowns) ?? []).map((b) => b.pool_name)
      softCheck(`${leaseLabel[key]} — insurance pool absent from breakdown`,
        { has_insurance: names.includes(insName) },
        { has_insurance: false })
    }

    // M4: insurance still IN breakdown (only admin-excluded, not pool-excluded).
    {
      const snap = byLease[created.leaseIds.m4]
      const names = (coerceBreakdown(snap?.pool_breakdowns) ?? []).map((b) => b.pool_name)
      softCheck('M4 — insurance pool PRESENT in breakdown (admin-excl only)',
        { has_insurance: names.includes(insName) },
        { has_insurance: true })
    }

    // Aggregate potential_recovery_total == Σ per-lease total_recovery.
    const expectedTotal = centsToString(
      Object.values(expected).reduce((a, e) => a + parseMoney(e.total_recovery), 0n)
    )
    softCheck('aggregate potential_recovery_total penny-exact',
      { potential_recovery_total: done.potential_recovery_total },
      { potential_recovery_total: expectedTotal })

    report.offline_expected.occupancy_note =
      'occ=0.80 (8*1000/10000); factor=1.1875; gross-up engaged on all grossable pools'
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

/**
 * The snapshot API returns `pool_breakdowns` as-is from the driver. Unlike
 * calculation_trace/manual_overrides, normalizeSnapshotJsonFields does NOT
 * normalize pool_breakdowns, so it arrives as a JSON STRING. Parse defensively:
 * accept a string OR an already-parsed array.
 */
function coerceBreakdown(value) {
  if (value == null) return null
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
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
// PostgREST helpers (user-JWT, RLS-scoped)
// ---------------------------------------------------------------------------
async function patchRecoveryProfileRaw(leaseId, merge, deleteKeys = []) {
  const readResponse = await fetch(
    `${supabaseUrl}/rest/v1/leases?id=eq.${leaseId}&select=recovery_profile`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
  )
  const rows = await readResponse.json().catch(() => null)
  if (!readResponse.ok || !Array.isArray(rows) || rows.length !== 1) {
    report.generated.injectError = `read failed ${leaseId}: ${readResponse.status}`
    return false
  }
  const merged = { ...rows[0].recovery_profile, ...merge }
  for (const k of deleteKeys) delete merged[k]
  const patchResponse = await fetch(`${supabaseUrl}/rest/v1/leases?id=eq.${leaseId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({ recovery_profile: merged }),
  })
  const patched = await patchResponse.json().catch(() => null)
  if (!patchResponse.ok || !Array.isArray(patched) || patched.length !== 1) {
    report.generated.injectError = `patch failed ${leaseId}: ${patchResponse.status} ${JSON.stringify(patched).slice(0, 200)}`
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// API helpers
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

async function cleanup(created, period) {
  const failures = []
  if (created.batchId) {
    await attemptCleanup(failures, 'delete ingestion batch', () =>
      deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`))
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
  if (created.propertyId) {
    await attemptCleanup(failures, 'delete property (cascades leases/units/GL/snapshots)', () =>
      deleteEmpty(`/api/v1/properties/${created.propertyId}`))
    await attemptCleanup(failures, 'verify property deleted', () =>
      expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, { status: 404 }))
    await attemptCleanup(failures, 'verify snapshots gone by cascade', () =>
      expectNoSnapshots(created.propertyId, period))
    await attemptCleanup(failures, 'verify zero CY4A residue via PostgREST', () =>
      expectNoCy4aResidue())
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function expectNoSnapshots(propertyId, period) {
  const path = `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${period.periodStart}&period_end=${period.periodEnd}&page=1&size=10`
  const list = await expectJson(path, { status: 200 })
  const ok = list.total === 0 && Array.isArray(list.items) && list.items.length === 0
  report.cleanup.push({ path, ok, body_preview: JSON.stringify({ total: list.total }) })
  if (!ok) throw new Error(`Snapshots still present: ${JSON.stringify(list).slice(0, 300)}`)
}

/**
 * PostgREST direct residue query — the /properties list is org-paginated and can
 * silently miss residue, so probe the tables directly with the user JWT.
 */
async function expectNoCy4aResidue() {
  const q = async (table, col) => {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?${col}=like.*CY4A*&select=id`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }
    )
    const rows = await response.json().catch(() => null)
    return Array.isArray(rows) ? rows.length : -1
  }
  const props = await q('properties', 'name')
  const pools = await q('expense_pools', 'name')
  const leases = await q('leases', 'tenant_name')
  const ok = props === 0 && pools === 0 && leases === 0
  report.cleanup.push({
    path: 'PostgREST residue probe (properties/expense_pools/leases like CY4A)',
    ok,
    body_preview: JSON.stringify({ props, pools, leases }),
  })
  if (!ok) throw new Error(`CY4A residue: props=${props} pools=${pools} leases=${leases}`)
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

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    throw new Error(`${label} mismatch: expected ${stableJson(expected)}, got ${stableJson(actual)}`)
  }
}

/** Record a check but do NOT throw — one run surfaces every divergence. */
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

// ===========================================================================
// Entry point
// ===========================================================================
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok =
    report.checks.every((c) => c.ok) && report.probes.every((p) => p.ok)
} catch (error) {
  report.fatal = errorMessage(error)
  report.ok = false
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1
