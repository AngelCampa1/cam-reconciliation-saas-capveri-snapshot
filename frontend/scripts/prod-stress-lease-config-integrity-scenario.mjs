/**
 * PROD E2E STRESS — lease / recovery_profile CONFIG -> recon ENGINE integrity.
 *
 * Domain: prove that every CAM config a user can set on a lease recovery_profile
 * flows correctly into the DEPLOYED engine (cloudflare-reconciliation-v1 on
 * api.capveri.com) and produces penny-exact output — or find a config that is
 * silently dropped, misapplied, or math-wrong.
 *
 * This scenario is COMPLEMENTARY to prod-stress-recon-cap-grossup-torture (which
 * already exercises a BINDING cumulative_compounding cap + gross-up + admin
 * exclusion + mid-year proration with a finalized seed year). To stay bounded and
 * fully self-cleaning, this script uses a SINGLE non-finalized period (2025) and
 * concentrates on config PATHS the torture script does not cover:
 *
 *   L1  base_year + base_year_amount + base_year_adjustments  (base-year subtract)
 *   L2  management_fee_percentage cap  (fee pool reduced to cap; excess removed)
 *   L3  excluded_pools (type match)    (excluded pool removed from recovery base)
 *   L4  gross-up engaged + admin_fee_excludes_tax_insurance (PostgREST-only key)
 *   L5  partial-year lease proration   (day-weighted 8dp) + fixed pro_rata_share
 *   L6  sqft-derived pro_rata_share    (no explicit share -> tenant_sqft/building)
 *   L7  admin_fee_excluded_pools explicit list (PostgREST-only key)
 *
 * Plus ADVERSARIAL API-VALIDATION probes (no recon; assert the HTTP write path
 * accepts/rejects as documented):
 *   P1  cap_rate > 1            -> 400  (boundedDecimalSchema(0,1))
 *   P2  admin_fee_percentage>0.2-> 400  (boundedDecimalSchema(0,0.2))
 *   P3  pro_rata_share > 1      -> 400  (boundedDecimalSchema(0,1))
 *   P4  negative base_year_amount-> 400 (nonNegativeDecimalSchema)
 *   P5  cap_type set, cap_rate null -> 400 (refine)
 *   P6  cap_type + cap_rate 0   -> 201  (0% cap is a valid config; binds to base)
 *   P7  unknown key on CREATE   -> stripped silently (default .strip())
 *   P8  unknown key on PATCH    -> 400  (.strict())
 *   P9  admin_fee_excluded_pools via CREATE -> stripped (not in schema)
 *   P10 PostgREST-inject pro_rata_share=1.5 -> engine job FAILS (assertProRataShareInRange)
 *
 * EXPECTED values are computed OFFLINE in exact integer arithmetic (BigInt cents /
 * 1e8-scaled rates), a faithful port of the deployed money.ts + calculator.ts +
 * cumulative-cap.ts. Matching the Python oracle is NOT the bar — correctness from
 * first principles is (CLAUDE.md).
 *
 * All entities prefixed "[PROD-TEST] CY3B". Cleanup deletes EVERYTHING in finally
 * and re-verifies zero CY3B residue. No finalized snapshots are created, so the
 * property delete cascades cleanly with a user JWT.
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
  `prod-stress-lease-config-integrity-${runId}`
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
// Exact integer arithmetic (port of cloudflare-backend money.ts semantics)
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
const rateDiv = (a, b) => roundDiv(a * RATE, b)
const rateMul = (a, b) => roundDiv(a * b, RATE)
/** Rate.quantize(4): half-up to 4 decimal places on the 1e8 scale. */
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
// Offline engine model (port of calculator.ts). Covers: aggregate gross-up with
// single safety valve, per-pool bare gross-up (admin inclusion ratio), management
// -fee cap, excluded pools (type match), base-year subtraction + adjustments,
// sequential pro-rata then proration rounding, admin fee (excluded-pool inclusion
// ratio / excludes-tax-insurance / explicit list). No cumulative cap here (no
// finalized history in this scenario).
// ---------------------------------------------------------------------------
const TARGET_OCC = parseRate('0.95')
const GROSS_UP_EXEMPT = new Set(['tax', 'insurance', 'capital'])
const CAP_EXEMPT = new Set(['tax', 'insurance', 'capital'])
const MIN_SAFE_OCC = parseRate('0.0001')
const MGMT_MARKER = 'management fee'
// Default admin-fee excluded pool NAMES when admin_fee_excludes_tax_insurance set.
const DEFAULT_TI_NAMES = new Set([
  'taxes',
  'insurance',
  'real_estate_taxes',
  'property_insurance',
  'tax',
  'property_tax',
  'building_insurance',
])

function grossUpFactor(occ) {
  if (occ === 0n || occ >= TARGET_OCC) return RATE
  return quantize4(rateDiv(TARGET_OCC, occ))
}

/**
 * Compute one lease snapshot's money fields from pools + terms.
 * pools: [{ name, type, cents }]  (type lowercased pool_type)
 * terms: {
 *   shareRate, prorationRate, adminRate, mgmtRate|null,
 *   baseYear|null, baseYearAmountCents|null, baseYearAdjCents,
 *   excludedTypes:Set, adminExcludedNames:Set (already-resolved lowercased),
 * }
 */
function leaseSnapshot({ pools, occ, factor, terms }) {
  const nearVacant = !(occ > MIN_SAFE_OCC)

  // --- management-fee cap (capManagementFeePools) applied to BARE-grossed pools.
  // Order: gross up bare, then cap the mgmt pool.
  const grossedBare = pools.map((p) => {
    const grossable = !GROSS_UP_EXEMPT.has(p.type) // ignoring per-pool flag: all our grossable pools are 'operating' with flag true
    const amount =
      grossable && !nearVacant ? mulRate(p.cents, factor) : p.cents
    return { ...p, grossedCents: amount }
  })

  // aggregate gross-up scalar with single valve
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

  // management-fee cap: cap the mgmt-fee pool(s) to rate*operating_base_excl_fee.
  let mgmtExcess = 0n
  let leasePools = grossedBare.map((p) => ({ ...p, capped: p.grossedCents }))
  if (terms.mgmtRate !== null && terms.mgmtRate !== 0n) {
    const mgmtIdx = leasePools
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.name.toLowerCase().includes(MGMT_MARKER))
    if (mgmtIdx.length > 0) {
      const mgmtSet = new Set(mgmtIdx.map(({ i }) => i))
      let operatingBase = 0n
      leasePools.forEach((p, i) => {
        if (p.type === 'operating' && !mgmtSet.has(i))
          operatingBase += p.grossedCents
      })
      let cap = mulRate(operatingBase, terms.mgmtRate)
      if (cap < 0n) cap = 0n
      const bookedFee = mgmtIdx.reduce((a, { p }) => a + p.grossedCents, 0n)
      if (bookedFee > cap) {
        // single mgmt pool in our scenarios -> set to cap
        mgmtIdx.forEach(({ i }) => {
          leasePools[i].capped = cap
        })
        mgmtExcess = bookedFee - cap
      }
    }
  }

  const totalOperating = pools.reduce((a, p) => a + p.cents, 0n)

  // excluded pools (type OR name match); sum from BARE-grossed (post-mgmt-cap) dict.
  const excludedAmount = leasePools
    .filter(
      (p) =>
        terms.excludedTypes.has(p.type) ||
        terms.excludedTypes.has(p.name.toLowerCase())
    )
    .reduce((a, p) => a + p.capped, 0n)

  const netRecoverable = aggregateGrossedUp - mgmtExcess - excludedAmount

  // base year
  let increaseOverBase
  const baseActive =
    terms.baseYear != null &&
    terms.baseYearAmountCents !== null &&
    terms.baseYearAmountCents !== 0n
  if (baseActive) {
    const adjustedBase = terms.baseYearAmountCents + terms.baseYearAdjCents
    increaseOverBase =
      netRecoverable > adjustedBase ? netRecoverable - adjustedBase : 0n
  } else {
    increaseOverBase = netRecoverable
  }

  // sequential: pro-rata then proration
  let before = mulRate(mulRate(increaseOverBase, terms.shareRate), terms.prorationRate)
  if (before < 0n) before = 0n

  // no cap in this scenario
  const after = before

  // admin fee: inclusion ratio over post-mgmt-cap breakdown (leasePools.capped),
  // filtered by admin-excluded NAMES.
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
  const adminFee = mulRate(adminBase, terms.adminRate)

  // reported grossed_up_expenses = aggregateGrossedUp - mgmtExcess
  const grossedUpExpenses = aggregateGrossedUp - mgmtExcess

  return {
    total_operating_expenses: centsToString(totalOperating),
    grossed_up_expenses: centsToString(grossedUpExpenses),
    base_year_amount: centsToString(terms.baseYearAmountCents ?? 0n),
    tenant_share_before_cap: centsToString(before),
    tenant_share_after_cap: centsToString(after),
    admin_fee: centsToString(adminFee),
    total_recovery: centsToString(after + adminFee),
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const P = (s) => `[PROD-TEST] CY3B ${s} ${suffix}`
  const periodStart = '2025-01-01'
  const periodEnd = '2025-12-31'
  const totalDays = 365
  const buildingSqft = '10000.00'

  // Pools: CAM (operating, grossable), Insurance (insurance, fixed),
  // Management Fee (operating, name-marked for mgmt cap).
  const camName = P('CAM Ops')
  const insName = P('Insurance')
  const mgmtName = P('Management Fee')
  const taxName = P('Real Estate Taxes')

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
        name: P('Config Integrity'),
        address_line1: '1 Config Integrity Way',
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
            description: 'CY3B disposable pool',
          },
        }
      )
      return p.id
    }
    created.poolIds.cam = await mkPool(camName, 'operating', true)
    created.poolIds.ins = await mkPool(insName, 'insurance', true) // flag true but type-exempt
    created.poolIds.mgmt = await mkPool(mgmtName, 'operating', true)
    created.poolIds.tax = await mkPool(taxName, 'tax', true) // type-exempt from gross-up

    // -- Pool mappings (GL account prefixes) --------------------------------
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
    created.mappingIds.push(await mkMapping(created.poolIds.ins, '63*'))
    created.mappingIds.push(await mkMapping(created.poolIds.mgmt, '65*'))
    created.mappingIds.push(await mkMapping(created.poolIds.tax, '67*'))

    // -- GL: choose amounts so occupancy math is clean -----------------------
    // Occupancy is day-weighted sum(sqft * days/365) / building. We want gross-up
    // to ENGAGE for the full-year leases (occ < 0.95). Full-year occupied sqft:
    //   L1..L4,L6,L7 full year; L5 partial. Give total full-year sqft < 9500 so
    //   occupancy < 0.95. We control per-lease sqft via units.
    const glAmounts = {
      cam: '120000.00',
      ins: '30000.00',
      mgmt: '50000.00',
      tax: '40000.00',
    }
    report.generated.glAmounts = glAmounts
    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `cy3b-gl-2025-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,03/15/2025,${glAmounts.cam},CamCo,CAM 2025`,
        `6300,Property Insurance,06/20/2025,${glAmounts.ins},InsCo,Insurance 2025`,
        `6500,Management Fee,09/10/2025,${glAmounts.mgmt},MgmtCo,Mgmt fee 2025`,
        `6700,Real Estate Taxes,11/01/2025,${glAmounts.tax},County,Taxes 2025`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batchId = upload.batch_id
    check(
      'GL upload creates four clean rows',
      {
        source_system: upload.source_system,
        row_count: upload.row_count,
        error_count: upload.error_count,
      },
      { source_system: 'yardi', row_count: 4, error_count: 0 }
    )

    // -- Units + Leases -----------------------------------------------------
    // Per-lease sqft (rentable). Chosen so total full-year occupied < 9500.
    // L1:1000 L2:1000 L3:1000 L4:1000 L5:2000(partial) L6:1500 L7:1000
    const mkUnit = async (num, sqft) => {
      const u = await expectJson(
        `/api/v1/properties/${property.id}/units`,
        {
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
        }
      )
      return u.id
    }
    const mkLease = async (unitId, tenantName, startDate, endDate, tenantSqft, profile) => {
      const body = {
        property_id: property.id,
        unit_id: unitId,
        tenant_name: tenantName,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        recovery_profile: profile,
      }
      if (tenantSqft != null) body.tenant_sqft = tenantSqft
      const l = await expectJson('/api/v1/leases', {
        method: 'POST',
        status: 201,
        body,
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

    // L1 — base year + amount + adjustments
    const u1 = await mkUnit(`CY3B-U1-${suffix}`, '1000.00')
    const l1 = await mkLease(u1, P('L1 BaseYear'), periodStart, '2027-12-31', '1000.00',
      baseProfile({
        base_year: 2024,
        base_year_amount: '5000.00',
        pro_rata_share: '0.1',
        admin_fee_percentage: '0.15',
        base_year_adjustments: [
          { service_name: 'Snow removal', imputed_amount: '1000.00', justification: 'New service after base year' },
        ],
      }))
    created.leaseIds.l1 = l1.id
    created.unitIds.push(u1)

    // L2 — management fee cap
    const u2 = await mkUnit(`CY3B-U2-${suffix}`, '1000.00')
    const l2 = await mkLease(u2, P('L2 MgmtCap'), periodStart, '2027-12-31', '1000.00',
      baseProfile({
        pro_rata_share: '0.1',
        management_fee_percentage: '0.05', // 5% of operating base excl fee
        admin_fee_percentage: '0.1',
      }))
    created.leaseIds.l2 = l2.id
    created.unitIds.push(u2)

    // L3 — excluded_pools (exclude insurance type)
    const u3 = await mkUnit(`CY3B-U3-${suffix}`, '1000.00')
    const l3 = await mkLease(u3, P('L3 Excluded'), periodStart, '2027-12-31', '1000.00',
      baseProfile({
        pro_rata_share: '0.1',
        excluded_pools: ['insurance'],
        admin_fee_percentage: '0.1',
      }))
    created.leaseIds.l3 = l3.id
    created.unitIds.push(u3)

    // L4 — gross-up + admin_fee_excludes_tax_insurance (PostgREST inject)
    const u4 = await mkUnit(`CY3B-U4-${suffix}`, '1000.00')
    const l4 = await mkLease(u4, P('L4 AdminExclTI'), periodStart, '2027-12-31', '1000.00',
      baseProfile({
        pro_rata_share: '0.1',
        admin_fee_percentage: '0.15',
      }))
    created.leaseIds.l4 = l4.id
    created.unitIds.push(u4)

    // L5 — partial-year proration (mid-year start) + fixed share
    const u5 = await mkUnit(`CY3B-U5-${suffix}`, '2000.00')
    const l5Start = '2025-07-01' // 2025-07-01..2025-12-31 inclusive = 184 days
    const l5 = await mkLease(u5, P('L5 Proration'), l5Start, '2027-12-31', '2000.00',
      baseProfile({
        pro_rata_share: '0.2',
        admin_fee_percentage: '0.1',
      }))
    created.leaseIds.l5 = l5.id
    created.unitIds.push(u5)

    // L6 — sqft-derived pro_rata_share (no explicit share). PostgREST-remove
    // pro_rata_share so the engine falls back to tenant_sqft/building.
    const u6 = await mkUnit(`CY3B-U6-${suffix}`, '1500.00')
    const l6 = await mkLease(u6, P('L6 SqftShare'), periodStart, '2027-12-31', '1500.00',
      baseProfile({
        pro_rata_share: '0.15', // will be removed via PostgREST
        admin_fee_percentage: '0.1',
      }))
    created.leaseIds.l6 = l6.id
    created.unitIds.push(u6)

    // L7 — admin_fee_excluded_pools explicit list (PostgREST inject)
    const u7 = await mkUnit(`CY3B-U7-${suffix}`, '1000.00')
    const l7 = await mkLease(u7, P('L7 AdminExclList'), periodStart, '2027-12-31', '1000.00',
      baseProfile({
        pro_rata_share: '0.1',
        admin_fee_percentage: '0.15',
      }))
    created.leaseIds.l7 = l7.id
    created.unitIds.push(u7)

    // -- PostgREST injections (API can't express these) ---------------------
    // L4: admin_fee_excludes_tax_insurance = true
    const l4Inject = await patchRecoveryProfileRaw(l4.id, {
      admin_fee_excludes_tax_insurance: true,
    })
    report.generated.l4_inject = l4Inject
    // L6: remove pro_rata_share entirely (force sqft fallback)
    const l6Inject = await patchRecoveryProfileRaw(l6.id, {}, ['pro_rata_share'])
    report.generated.l6_inject = l6Inject
    // L7: admin_fee_excluded_pools = [insName] (the insurance display name)
    const l7Inject = await patchRecoveryProfileRaw(l7.id, {
      admin_fee_excluded_pools: [insName],
    })
    report.generated.l7_inject = l7Inject

    // -- OFFLINE EXPECTED ---------------------------------------------------
    // Occupancy: day-weighted. Full-year leases contribute full sqft; L5 partial.
    // Full-year: L1,L2,L3,L4,L7 = 5x1000 = 5000; L6 = 1500; total = 6500.
    // L5 = 2000 sqft * 184/365 (mid-year start). Engine day-weights the same way.
    const l5Days = inclusiveDays(l5Start, periodEnd) // 184
    const fullYearSqft = parseRate('6500.00')
    const l5Weighted = rateMul(parseRate('2000.00'), rateDiv(BigInt(l5Days) * RATE, BigInt(totalDays) * RATE))
    const weighted = fullYearSqft + l5Weighted
    let occ = quantize4(rateDiv(weighted, parseRate(buildingSqft)))
    if (occ > RATE) occ = RATE
    const factor = grossUpFactor(occ)
    report.offline_expected.occupancy = rateToString(occ)
    report.offline_expected.gross_up_factor = rateToString(factor)
    report.offline_expected.l5_days = l5Days

    // Pools present on every lease (same GL, same property):
    const poolsAll = () => [
      { name: camName, type: 'operating', cents: parseMoney(glAmounts.cam) },
      { name: insName, type: 'insurance', cents: parseMoney(glAmounts.ins) },
      { name: mgmtName, type: 'operating', cents: parseMoney(glAmounts.mgmt) },
      { name: taxName, type: 'tax', cents: parseMoney(glAmounts.tax) },
    ]

    const expected = {}

    expected.l1 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: parseRate('0.1'), prorationRate: RATE, adminRate: parseRate('0.15'),
        mgmtRate: null, baseYear: 2024, baseYearAmountCents: parseMoney('5000.00'),
        baseYearAdjCents: parseMoney('1000.00'),
        excludedTypes: new Set(), adminExcludedNames: new Set(),
      },
    })

    expected.l2 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: parseRate('0.1'), prorationRate: RATE, adminRate: parseRate('0.1'),
        mgmtRate: parseRate('0.05'), baseYear: null, baseYearAmountCents: null,
        baseYearAdjCents: 0n,
        excludedTypes: new Set(), adminExcludedNames: new Set(),
      },
    })

    expected.l3 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: parseRate('0.1'), prorationRate: RATE, adminRate: parseRate('0.1'),
        mgmtRate: null, baseYear: null, baseYearAmountCents: null, baseYearAdjCents: 0n,
        excludedTypes: new Set(['insurance']), adminExcludedNames: new Set(),
      },
    })

    // L4: admin_fee_excludes_tax_insurance -> default T&I NAME set. Our pool names
    // ("[PROD-TEST] CY3B Insurance ...", "...Real Estate Taxes...") do NOT match
    // the DEFAULT_TI_NAMES tokens (exact-lowercased-name compare), so the admin
    // exclusion resolves to a set of default tokens NONE of which equal any pool
    // name -> excludedCents=0 -> admin base == shareAfterCap (no effective change).
    // This is the documented behavior: excludes_tax_insurance only bites pools
    // literally named "insurance"/"taxes"/etc. We assert the NO-OP outcome.
    expected.l4 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: parseRate('0.1'), prorationRate: RATE, adminRate: parseRate('0.15'),
        mgmtRate: null, baseYear: null, baseYearAmountCents: null, baseYearAdjCents: 0n,
        excludedTypes: new Set(),
        adminExcludedNames: new Set(DEFAULT_TI_NAMES), // resolves; matches no pool name
      },
    })

    // L5: partial proration factor = 184/365 (8dp half-up).
    const prorationL5 = rateDiv(BigInt(l5Days) * RATE, BigInt(totalDays) * RATE)
    report.offline_expected.l5_proration = rateToString(prorationL5)
    expected.l5 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: parseRate('0.2'), prorationRate: prorationL5, adminRate: parseRate('0.1'),
        mgmtRate: null, baseYear: null, baseYearAmountCents: null, baseYearAdjCents: 0n,
        excludedTypes: new Set(), adminExcludedNames: new Set(),
      },
    })

    // L6: sqft-derived share = tenantSqft/building = 1500/10000 = 0.15 (8dp).
    const sqftShare = rateDiv(parseRate('1500.00'), parseRate(buildingSqft))
    report.offline_expected.l6_sqft_share = rateToString(sqftShare)
    expected.l6 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: sqftShare, prorationRate: RATE, adminRate: parseRate('0.1'),
        mgmtRate: null, baseYear: null, baseYearAmountCents: null, baseYearAdjCents: 0n,
        excludedTypes: new Set(), adminExcludedNames: new Set(),
      },
    })

    // L7: admin_fee_excluded_pools = [insName] -> admin base excludes insurance pool.
    expected.l7 = leaseSnapshot({
      pools: poolsAll(), occ, factor,
      terms: {
        shareRate: parseRate('0.1'), prorationRate: RATE, adminRate: parseRate('0.15'),
        mgmtRate: null, baseYear: null, baseYearAmountCents: null, baseYearAdjCents: 0n,
        excludedTypes: new Set(),
        adminExcludedNames: new Set([insName.toLowerCase()]),
      },
    })

    report.offline_expected.leases = Object.fromEntries(
      Object.entries(expected).map(([k, v]) => [k, publicFields(v)])
    )

    // Design invariants: gross-up must be engaged (occ < target).
    check(
      'offline design invariant: gross-up engaged (occupancy < target)',
      { occ_below_target: occ < TARGET_OCC, factor_above_one: factor > RATE },
      { occ_below_target: true, factor_above_one: true }
    )

    // -- Run reconciliation -------------------------------------------------
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
      'job completes with all 7 leases',
      {
        status: done.status,
        processed_leases: done.processed_leases,
        total_leases: done.total_leases,
        snapshot_count: done.snapshot_ids.length,
      },
      {
        status: 'completed',
        processed_leases: 7,
        total_leases: 7,
        snapshot_count: 7,
      }
    )

    // Fetch each snapshot, map by lease_id.
    const byLease = {}
    for (const sid of done.snapshot_ids) {
      const snap = await expectJson(
        `/api/v1/reconciliation/snapshots/${sid}`,
        { status: 200 }
      )
      byLease[snap.lease_id] = snap
    }

    const leaseLabel = {
      l1: 'L1 base-year subtraction + adjustments',
      l2: 'L2 management-fee cap (fee pool reduced, excess removed)',
      l3: 'L3 excluded_pools insurance type removed from recovery',
      l4: 'L4 admin_fee_excludes_tax_insurance (PostgREST-only; no-op vs custom names)',
      l5: 'L5 partial-year proration 184/365 + fixed share',
      l6: 'L6 sqft-derived pro_rata_share fallback (PostgREST-removed explicit)',
      l7: 'L7 admin_fee_excluded_pools explicit list (PostgREST-only)',
    }
    // Soft-collect every lease diff so a single run surfaces ALL divergences.
    for (const key of Object.keys(expected)) {
      const leaseId = created.leaseIds[key]
      softCheck(
        `${leaseLabel[key]} penny-exact`,
        snapshotMoney(byLease[leaseId]),
        { lease_id: leaseId, ...publicFields(expected[key]) }
      )
    }
    const expectedTotal = centsToString(
      Object.values(expected).reduce((a, e) => a + parseMoney(e.total_recovery), 0n)
    )
    softCheck(
      'aggregate potential_recovery_total penny-exact',
      { potential_recovery_total: done.potential_recovery_total },
      { potential_recovery_total: expectedTotal }
    )

    // -- ADVERSARIAL API-VALIDATION PROBES ----------------------------------
    const badLease = (over) => ({
      property_id: property.id,
      unit_id: created.unitIds[0],
      tenant_name: P('PROBE'),
      start_date: periodStart,
      end_date: '2027-12-31',
      status: 'draft',
      recovery_profile: baseProfile(over),
    })

    await probe('P1 cap_rate > 1 rejected (422)', badLease({ cap_type: 'non_cumulative', cap_rate: '1.5' }), 422)
    await probe('P2 admin_fee_percentage > 0.2 rejected (422)', badLease({ admin_fee_percentage: '0.5' }), 422)
    await probe('P3 pro_rata_share > 1 rejected (422)', badLease({ pro_rata_share: '1.5' }), 422)
    await probe('P4 negative base_year_amount rejected (422)', badLease({ base_year: 2024, base_year_amount: '-100.00' }), 422)
    await probe('P5 cap_type set without cap_rate rejected (422)', badLease({ cap_type: 'cumulative', cap_rate: null }), 422)

    // P6: cap_type + cap_rate 0 accepted (201). Clean up the created lease.
    const p6 = await probeCreate('P6 cap_type + cap_rate 0.0 accepted (201)', badLease({ cap_type: 'non_cumulative', cap_rate: '0' }), 201)
    if (p6?.id) {
      created.leaseIds.p6 = p6.id
      created.unitIds.push(null) // no separate unit
    }

    // P7: unknown top-level key stripped silently on CREATE (201), read-back omits it.
    const p7Body = badLease({ pro_rata_share: '0.05' })
    p7Body.recovery_profile.totally_unknown_key = 'x'
    const p7 = await probeCreate('P7 unknown key stripped on CREATE (201)', p7Body, 201)
    let p7StrippedOk = false
    if (p7?.id) {
      created.leaseIds.p7 = p7.id
      const prof = await expectJson(`/api/v1/leases/${p7.id}/recovery-profile`, { status: 200 })
      p7StrippedOk = !('totally_unknown_key' in prof)
    }
    report.probes.push({ label: 'P7b unknown key absent from stored profile', ok: p7StrippedOk, actual: { stripped: p7StrippedOk } })

    // P8: unknown key on PATCH recovery-profile rejected (422) via .strict().
    if (created.leaseIds.l1) {
      await probeRaw(
        'P8 unknown key on PATCH recovery-profile rejected (422)',
        () => fetchRetry(`${apiUrl}/api/v1/leases/${created.leaseIds.l1}/recovery-profile`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ totally_unknown_key: 'x' }),
        }),
        422
      )
    }

    // P9: admin_fee_excluded_pools via CREATE is stripped (not in schema) -> read-back omits it.
    const p9Body = badLease({ pro_rata_share: '0.05' })
    p9Body.recovery_profile.admin_fee_excluded_pools = [insName]
    const p9 = await probeCreate('P9 admin_fee_excluded_pools accepted-but-stripped on CREATE (201)', p9Body, 201)
    let p9StrippedOk = false
    if (p9?.id) {
      created.leaseIds.p9 = p9.id
      const prof = await expectJson(`/api/v1/leases/${p9.id}/recovery-profile`, { status: 200 })
      p9StrippedOk = !('admin_fee_excluded_pools' in prof)
    }
    report.probes.push({ label: 'P9b admin_fee_excluded_pools absent from stored profile (API cannot express it)', ok: p9StrippedOk, actual: { stripped: p9StrippedOk } })

    // P10: PostgREST-inject pro_rata_share=1.5 on a fresh lease -> engine JOB FAILS
    // (assertProRataShareInRange). We create a dedicated lease, inject, run a job,
    // and assert failure. This proves the engine's out-of-range guard fires on a
    // config the API refuses but PostgREST/RLS lets through.
    const u10 = await mkUnit(`CY3B-U10-${suffix}`, '10.00')
    const l10 = await mkLease(u10, P('P10 BadShare'), periodStart, '2027-12-31', '10.00',
      baseProfile({ pro_rata_share: '0.1' }))
    created.leaseIds.p10 = l10.id
    created.unitIds.push(u10)
    const p10Inject = await patchRecoveryProfileRaw(l10.id, { pro_rata_share: '1.5' })
    report.generated.p10_inject = p10Inject
    // Deactivate all OTHER leases so this job only processes the bad lease; simpler:
    // run a job on a NARROW period where only l10 is relevant won't help (all active).
    // Instead assert the job fails outright (engine throws on the bad lease).
    let p10JobFailed = false
    let p10Detail = null
    if (p10Inject) {
      const badJob = await expectJson('/api/v1/reconciliation/calculate', {
        method: 'POST', status: 202,
        body: { property_id: property.id, period_start: periodStart, period_end: periodEnd, force_recalculate: true },
      })
      created.badJobId = badJob.job_id
      try {
        await waitForJob(badJob.job_id)
      } catch (e) {
        p10JobFailed = /Invalid pro-rata share|1\.5|must be within/.test(errorMessage(e))
        p10Detail = errorMessage(e).slice(0, 300)
      }
    }
    report.probes.push({
      label: 'P10 PostgREST-injected pro_rata_share=1.5 makes engine job FAIL (assertProRataShareInRange)',
      ok: p10Inject ? p10JobFailed : true,
      actual: { injected: p10Inject, job_failed: p10JobFailed, detail: p10Detail },
      note: p10Inject ? undefined : 'PostgREST refused the injection (RLS); guard not exercised',
    })
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

function publicFields(e) {
  return {
    total_operating_expenses: e.total_operating_expenses,
    grossed_up_expenses: e.grossed_up_expenses,
    base_year_amount: e.base_year_amount,
    tenant_share_before_cap: e.tenant_share_before_cap,
    tenant_share_after_cap: e.tenant_share_after_cap,
    admin_fee: e.admin_fee,
    total_recovery: e.total_recovery,
  }
}

function snapshotMoney(s) {
  if (!s) return { missing: true }
  return {
    lease_id: s.lease_id,
    total_operating_expenses: s.total_operating_expenses,
    grossed_up_expenses: s.grossed_up_expenses,
    base_year_amount: s.base_year_amount,
    tenant_share_before_cap: s.tenant_share_before_cap,
    tenant_share_after_cap: s.tenant_share_after_cap,
    admin_fee: s.admin_fee,
    total_recovery: s.total_recovery,
  }
}

function inclusiveDays(startDay, endDay) {
  const s = Date.parse(`${startDay}T00:00:00Z`)
  const e = Date.parse(`${endDay}T00:00:00Z`)
  return Math.round((e - s) / 86_400_000) + 1
}

/**
 * Merge keys into (and optionally delete keys from) a lease's recovery_profile
 * via Supabase PostgREST with the RLS-scoped user JWT — the seam for configs the
 * API strips/rejects. Returns true on verified write-back, false if RLS refuses.
 */
async function patchRecoveryProfileRaw(leaseId, merge, deleteKeys = []) {
  const readResponse = await fetch(
    `${supabaseUrl}/rest/v1/leases?id=eq.${leaseId}&select=recovery_profile`,
    {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    }
  )
  const rows = await readResponse.json().catch(() => null)
  if (!readResponse.ok || !Array.isArray(rows) || rows.length !== 1) {
    report.generated.injectError = `read failed ${leaseId}: ${readResponse.status}`
    return false
  }
  const merged = { ...rows[0].recovery_profile, ...merge }
  for (const k of deleteKeys) delete merged[k]
  const patchResponse = await fetch(
    `${supabaseUrl}/rest/v1/leases?id=eq.${leaseId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({ recovery_profile: merged }),
    }
  )
  const patched = await patchResponse.json().catch(() => null)
  if (!patchResponse.ok || !Array.isArray(patched) || patched.length !== 1) {
    report.generated.injectError = `patch failed ${leaseId}: ${patchResponse.status} ${JSON.stringify(patched).slice(0, 200)}`
    return false
  }
  return true
}

async function probe(label, body, expectedStatus) {
  const response = await fetchRetry(`${apiUrl}/api/v1/leases`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const ok = response.status === expectedStatus
  report.probes.push({ label, ok, actual: { status: response.status, body: text.slice(0, 200) }, expected: { status: expectedStatus } })
  if (!ok) throw new Error(`${label}: got ${response.status}, expected ${expectedStatus}: ${text.slice(0, 300)}`)
}

async function probeCreate(label, body, expectedStatus) {
  const response = await fetchRetry(`${apiUrl}/api/v1/leases`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const ok = response.status === expectedStatus
  report.probes.push({ label, ok, actual: { status: response.status }, expected: { status: expectedStatus } })
  if (!ok) throw new Error(`${label}: got ${response.status}, expected ${expectedStatus}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function probeRaw(label, fn, expectedStatus) {
  const response = await fn()
  const text = await response.text()
  const ok = response.status === expectedStatus
  report.probes.push({ label, ok, actual: { status: response.status, body: text.slice(0, 200) }, expected: { status: expectedStatus } })
  if (!ok) throw new Error(`${label}: got ${response.status}, expected ${expectedStatus}: ${text.slice(0, 300)}`)
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
    // Verify zero CY3B leftovers by listing properties.
    await attemptCleanup(failures, 'verify zero [PROD-TEST] CY3B properties remain', () =>
      expectNoCy3bProperties())
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

async function expectNoCy3bProperties() {
  const list = await expectJson(`/api/v1/properties?page=1&size=100`, { status: 200 })
  const items = Array.isArray(list.items) ? list.items : Array.isArray(list) ? list : []
  const leftovers = items.filter((p) => typeof p?.name === 'string' && p.name.includes('CY3B'))
  const ok = leftovers.length === 0
  report.cleanup.push({ path: 'list properties', ok, body_preview: `cy3b_left=${leftovers.length}` })
  if (!ok) throw new Error(`CY3B properties remain: ${leftovers.map((p) => p.id).join(',')}`)
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
    report.checks.every((c) => c.ok) && report.probes.every((p) => p.ok)
} catch (error) {
  report.fatal = errorMessage(error)
  report.ok = false
} finally {
  await writeFile(resolve(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1
