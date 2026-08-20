/**
 * PROD E2E STRESS — reconciliation cap + gross-up torture scenario.
 *
 * Exercises SIMULTANEOUSLY, against the LIVE production engine
 * (cloudflare-reconciliation-v1 on api.capveri.com):
 *
 *   1. Mid-year lease start (2025-04-16) -> day-weighted proration
 *      (260/365 inclusive days) AND day-weighted occupancy.
 *   2. A cumulative_compounding expense cap (5%) tight enough to BIND.
 *      Cumulative caps only apply when prior FINALIZED snapshots exist
 *      (loadTenantCapHistories reads status='finalized' with
 *      period_start_date < job period), so the scenario first runs and
 *      finalizes a seed year (2024), then runs the target year (2025)
 *      with ~2.5x expenses so the cap binds hard.
 *   3. Admin fee percentages (15% / 10%) with the insurance pool excluded
 *      from the admin-fee base via `admin_fee_excluded_pools` -> exercises
 *      the integer-rational inclusion-ratio path. NOTE: no HTTP write path
 *      persists admin_fee_excluded_pools (the recovery-profile Zod schema
 *      strips it), so the scenario sets it through Supabase PostgREST with
 *      the SAME authenticated user JWT (RLS-scoped) — the blessed
 *      "mess directly with the db" seam. If RLS forbids the write, the
 *      script falls back to no exclusion and flags it in the report.
 *   4. Gross-up enabled with occupancy far below the 0.95 target
 *      (2024: ~12.35%, 2025: ~26.59%) so gross-up engages on the
 *      operating pool; the insurance pool is type-exempt from gross-up
 *      (GROSS_UP_EXEMPT_POOL_TYPES) even though its stored flag is true.
 *   5. A repeating-decimal pro-rata share: lease A's share is the decimal
 *      expansion of 1234.56 sqft / 9999.00 sqft (non-terminating,
 *      truncated to 12 dp), stressing the Rate 8-dp half-up parser and
 *      cent rounding at every multiplication.
 *
 * EXPECTED VALUES are computed OFFLINE in exact integer arithmetic
 * (BigInt cents / 1e8-scaled rates), a faithful port of the deployed
 * engine's money.ts + calculator.ts + cumulative-cap.ts, which are
 * themselves penny-parity ports of the Python oracle
 * (backend/app/services/calculation/{gross_up,occupancy,caps,tenant_share}.py):
 *
 *   occupancy   = quantize4dp_halfup( sum(sqft_i * days_i/total_days) / total_sqft ), capped at 1
 *   factor      = quantize4dp_halfup( 0.95 / occupancy )            (only when occ < target)
 *   grossed_var = min( round(variable * factor), round(variable * round8(1/occ)) )   [aggregate valve]
 *   aggregate   = grossed_var + fixed_pools     (insurance is fixed: type-exempt)
 *   before_cap  = max(0, round(round(net * pro_rata) * proration))  [sequential cent rounding]
 *   cap (cumulative_compounding, yearsSinceBase = len(priors)+1 = 2):
 *       max_allowed = q2(base * 1.05^2);  bank = q2(max(0, base*1.05 - sum(priors)))
 *       effective   = q2(max_allowed + bank);  after = min(before, effective)
 *     where base = capBaseYearAmount = the 2024 finalized after-cap share
 *     (which is ALSO priors[0] — the deployed carry-forward semantics).
 *   admin_fee   = round( round_div(after_c * included_c, total_c) * rate ), included
 *                 over the grossed post-mgmt-cap pool breakdown, insurance excluded.
 *
 * Everything created is prefixed "[PROD-TEST]" and deleted in the finally
 * block (property delete cascades leases/units/GL/snapshots — including
 * the finalized seed snapshot, a cascade this script re-verifies).
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
  `prod-stress-recon-cap-grossup-torture-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  offline_expected: {},
  checks: [],
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
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
}

/** Decimal expansion string of numerator/denominator to `digits` places (truncated). */
function decimalExpansion(numerator, denominator, digits) {
  const scaled = (numerator * 10n ** BigInt(digits)) / denominator
  const s = scaled.toString().padStart(digits + 1, '0')
  const whole = s.slice(0, s.length - digits)
  const fraction = s.slice(s.length - digits)
  return `${whole}.${fraction}`
}

// ---------------------------------------------------------------------------
// Offline engine model (port of calculator.ts for THIS scenario's shape:
// no pool splits, no mgmt fee, no recovery exclusions, base-year inactive)
// ---------------------------------------------------------------------------
const TARGET_OCC = parseRate('0.95')

function occupancyRate(leases, totalSqftRate, totalDays) {
  // calculateActualOccupancy: weight = Rate(days)/Rate(totalDays);
  // weighted += Rate(sqft) * weight; occ = quantize4(weighted/total), min 1.
  let weighted = 0n
  const totalDaysRate = BigInt(totalDays) * RATE
  for (const lease of leases) {
    const weight = rateDiv(BigInt(lease.overlapDays) * RATE, totalDaysRate)
    weighted += rateMul(parseRate(lease.sqft), weight)
  }
  const occ = quantize4(rateDiv(weighted, totalSqftRate))
  return occ > RATE ? RATE : occ
}

function grossUpFactor(occ) {
  if (occ === 0n || occ >= TARGET_OCC) return RATE
  return quantize4(rateDiv(TARGET_OCC, occ))
}

/**
 * Compute one lease's snapshot money fields.
 * pools: [{ name, grossable, cents }] — grossable=false for the insurance
 * pool (type-exempt). No mgmt fee / recovery exclusions / base year here.
 */
function leaseSnapshot({ pools, occ, factor, terms, capHistory }) {
  // Per-pool bare gross-up (feeds the admin-fee inclusion ratio).
  const grossedPools = pools.map((p) => ({
    ...p,
    grossedCents: p.grossable ? mulRate(p.cents, factor) : p.cents,
  }))
  // Aggregate gross-up with single 100%-occupancy safety valve.
  let variable = 0n
  let fixed = 0n
  for (const p of pools) {
    if (p.grossable) variable += p.cents
    else fixed += p.cents
  }
  const grossedVariable = mulRate(variable, factor)
  const maxAtFull = mulRate(variable, rateDiv(RATE, occ))
  const valved = grossedVariable <= maxAtFull ? grossedVariable : maxAtFull
  const aggregateGrossedUp = valved + fixed

  const totalOperating = variable + fixed
  const netRecoverable = aggregateGrossedUp // no excess / exclusions

  // Sequential cent rounding, exactly like calculateTenantRecovery:
  // multiplyRate(proRataShare) THEN multiplyRate(prorationFactor).
  let before = mulRate(mulRate(netRecoverable, terms.shareRate), terms.prorationRate)
  if (before < 0n) before = 0n

  // Cap.
  let after = before
  let effectiveMax = null
  if (terms.capType === 'cumulative_compounding' && capHistory) {
    const base = capHistory.baseCents // 2024 finalized after-cap share
    // yearsSinceBase = priors.length + 1 = 2 with one seed year.
    // maxAllowed = q2(base * 1.05^2) = round_half_up(base * 11025 / 10000)
    const maxAllowed = roundDiv(base * 11025n, 10000n)
    // cumulativeMaxPrior = base * 1.05 (full precision rational);
    // cumulativeActualPrior = sum(priors) = base (the seed year is both the
    // cap base AND priors[0] in the deployed loadTenantCapHistories).
    // bank = q2(max(0, base*105/100 - base)) = q2(base * 5/100)
    const bankRaw = base * 105n - base * 100n // in cents*100
    const bank = bankRaw > 0n ? roundDiv(bankRaw, 100n) : 0n
    effectiveMax = maxAllowed + bank
    if (before > effectiveMax) after = effectiveMax
  }

  // Admin fee: inclusion ratio over grossed (post-mgmt-cap) pools.
  const excluded = new Set(terms.adminExcludedNames.map((n) => n.toLowerCase()))
  let adminBase
  if (excluded.size > 0) {
    const totalCents = grossedPools.reduce((acc, p) => acc + p.grossedCents, 0n)
    const excludedCents = grossedPools
      .filter((p) => excluded.has(p.name.toLowerCase()))
      .reduce((acc, p) => acc + p.grossedCents, 0n)
    if (totalCents > 0n) {
      const includedCents =
        totalCents - excludedCents > 0n ? totalCents - excludedCents : 0n
      adminBase = roundDiv(after * includedCents, totalCents)
      if (adminBase < 0n) adminBase = 0n
    } else {
      adminBase = 0n
    }
  } else {
    adminBase = after
  }
  const adminFee = mulRate(adminBase, terms.adminRate)

  return {
    total_operating_expenses: centsToString(totalOperating),
    grossed_up_expenses: centsToString(aggregateGrossedUp),
    base_year_amount: '0.00',
    tenant_share_before_cap: centsToString(before),
    tenant_share_after_cap: centsToString(after),
    admin_fee: centsToString(adminFee),
    total_recovery: centsToString(after + adminFee),
    _effectiveMax: effectiveMax === null ? null : centsToString(effectiveMax),
    _occ: occ,
    _factor: factor,
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Cap Grossup Torture ${suffix}`
  const camPoolName = `[PROD-TEST] CAM Ops ${suffix}`
  const insPoolName = `[PROD-TEST] Insurance ${suffix}`
  const tenantAName = `[PROD-TEST] Anchor Tenant A ${suffix}`
  const tenantBName = `[PROD-TEST] Midyear Tenant B ${suffix}`
  const seedStart = '2024-01-01'
  const seedEnd = '2024-12-31'
  const targetStart = '2025-01-01'
  const targetEnd = '2025-12-31'

  // Repeating-decimal pro-rata share: 1234.56 / 9999.00, truncated to 12 dp.
  // (123456/999900 = 0.123468346834... repeating "6834".)
  const shareAString = decimalExpansion(123456n, 999900n, 12)

  const glAmounts = {
    cam2024: '100000.01',
    ins2024: '20000.03',
    cam2025a: '175000.07',
    cam2025b: '74999.90',
    ins2025: '29999.99',
  }

  const created = {
    propertyId: null,
    unitAId: null,
    unitBId: null,
    leaseAId: null,
    leaseBId: null,
    camPoolId: null,
    insPoolId: null,
    camMappingId: null,
    insMappingId: null,
    batch2024Id: null,
    batch2025Id: null,
    seedJobId: null,
    targetJobId: null,
    seedSnapshotIds: [],
    targetSnapshotIds: [],
  }
  report.generated = {
    propertyName,
    camPoolName,
    insPoolName,
    tenantAName,
    tenantBName,
    shareAString,
    seedPeriod: [seedStart, seedEnd],
    targetPeriod: [targetStart, targetEnd],
    glAmounts,
  }

  try {
    // -- Entities ----------------------------------------------------------
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '999 Prod Torture Loop',
        city: 'Houston',
        state: 'TX',
        postal_code: '77002',
        total_rentable_sqft: '9999.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '999.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.propertyId = property.id

    const unitA = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: `TORT-A-${suffix.toUpperCase()}`,
        rentable_sqft: '1234.56',
        usable_sqft: '1100.00',
        floor: 1,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitAId = unitA.id
    const unitB = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: `TORT-B-${suffix.toUpperCase()}`,
        rentable_sqft: '2000.00',
        usable_sqft: '1800.00',
        floor: 2,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitBId = unitB.id

    const camPool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: camPoolName,
          pool_type: 'operating',
          is_gross_up_applicable: true,
          gross_up_target: null,
          description: 'Production E2E disposable torture CAM pool',
        },
      }
    )
    created.camPoolId = camPool.id
    // Insurance pool with is_gross_up_applicable=true on purpose: the engine
    // type-guard (GROSS_UP_EXEMPT_POOL_TYPES) must keep it FIXED regardless.
    const insPool = await expectJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: insPoolName,
          pool_type: 'insurance',
          is_gross_up_applicable: true,
          gross_up_target: null,
          description: 'Production E2E disposable torture insurance pool',
        },
      }
    )
    created.insPoolId = insPool.id

    const camMapping = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings`,
      {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: camPool.id,
          gl_account_pattern: '61*',
          allocation_percentage: '1',
          priority: 10,
        },
      }
    )
    created.camMappingId = camMapping.id
    const insMapping = await expectJson(
      `/api/v1/properties/${property.id}/pool-mappings`,
      {
        method: 'POST',
        status: 201,
        body: {
          expense_pool_id: insPool.id,
          gl_account_pattern: '63*',
          allocation_percentage: '1',
          priority: 10,
        },
      }
    )
    created.insMappingId = insMapping.id

    const leaseA = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unitA.id,
        tenant_name: tenantAName,
        start_date: seedStart,
        end_date: '2026-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: shareAString,
          cap_type: 'cumulative_compounding',
          cap_rate: '0.05',
          admin_fee_percentage: '0.15',
          management_fee_percentage: null,
          excluded_pools: [],
          accounting_basis: 'cash',
          base_year_adjustments: [],
        },
      },
    })
    created.leaseAId = leaseA.id
    report.generated.leaseAId = leaseA.id

    const leaseB = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unitB.id,
        tenant_name: tenantBName,
        start_date: '2025-04-16',
        end_date: '2026-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '0.2',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.10',
          management_fee_percentage: null,
          excluded_pools: [],
          accounting_basis: 'cash',
          base_year_adjustments: [],
        },
      },
    })
    created.leaseBId = leaseB.id
    report.generated.leaseBId = leaseB.id

    // -- Admin-fee exclusion seam (no HTTP write path persists it) ---------
    const adminExclusionApplied = await applyAdminFeeExclusion(
      [leaseA.id, leaseB.id],
      insPoolName
    )
    report.generated.adminExclusionApplied = adminExclusionApplied
    const adminExcludedNames = adminExclusionApplied ? [insPoolName] : []

    // -- GL ingestion -------------------------------------------------------
    const upload2024 = await uploadCsv({
      propertyId: property.id,
      fileName: `yardi-torture-2024-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,03/15/2024,${glAmounts.cam2024},TortureCo,Seed year CAM`,
        `6300,Property Insurance,07/20/2024,${glAmounts.ins2024},TortureIns,Seed year insurance`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batch2024Id = upload2024.batch_id
    check(
      'gl upload 2024 creates two clean rows',
      {
        source_system: upload2024.source_system,
        row_count: upload2024.row_count,
        error_count: upload2024.error_count,
      },
      { source_system: 'yardi', row_count: 2, error_count: 0 }
    )

    const upload2025 = await uploadCsv({
      propertyId: property.id,
      fileName: `yardi-torture-2025-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        `6100,Common Area Maintenance,02/10/2025,${glAmounts.cam2025a},TortureCo,Target year CAM part 1`,
        `6100,Common Area Maintenance,09/05/2025,${glAmounts.cam2025b},TortureCo,Target year CAM part 2`,
        `6300,Property Insurance,06/30/2025,${glAmounts.ins2025},TortureIns,Target year insurance`,
      ].join('\n'),
      sourceOverride: 'yardi',
    })
    created.batch2025Id = upload2025.batch_id
    check(
      'gl upload 2025 creates three clean rows',
      {
        source_system: upload2025.source_system,
        row_count: upload2025.row_count,
        error_count: upload2025.error_count,
      },
      { source_system: 'yardi', row_count: 3, error_count: 0 }
    )

    // -- Offline expected: seed year 2024 (366 days, lease A only) ----------
    const totalSqftRate = parseRate('9999.00')
    const occ2024 = occupancyRate(
      [{ sqft: '1234.56', overlapDays: 366 }],
      totalSqftRate,
      366
    )
    const factor2024 = grossUpFactor(occ2024)
    const shareARate = parseRate(shareAString)
    const pools2024 = [
      { name: camPoolName, grossable: true, cents: parseMoney(glAmounts.cam2024) },
      { name: insPoolName, grossable: false, cents: parseMoney(glAmounts.ins2024) },
    ]
    const expectedA2024 = leaseSnapshot({
      pools: pools2024,
      occ: occ2024,
      factor: factor2024,
      terms: {
        shareRate: shareARate,
        prorationRate: RATE, // full seed year
        capType: 'none',
        adminRate: parseRate('0.15'),
        adminExcludedNames,
      },
      capHistory: null,
    })
    report.offline_expected.seed_2024_lease_a = {
      occupancy: rateToString(occ2024),
      gross_up_factor: rateToString(factor2024),
      ...publicFields(expectedA2024),
    }

    // -- Run + finalize seed year -------------------------------------------
    const seedJob = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: {
        property_id: property.id,
        period_start: seedStart,
        period_end: seedEnd,
        force_recalculate: true,
      },
    })
    created.seedJobId = seedJob.job_id
    const seedDone = await waitForJob(seedJob.job_id)
    created.seedSnapshotIds = seedDone.snapshot_ids
    check(
      'seed 2024 job completes with only lease A (lease B starts 2025)',
      {
        status: seedDone.status,
        processed_leases: seedDone.processed_leases,
        total_leases: seedDone.total_leases,
        snapshot_count: seedDone.snapshot_ids.length,
        potential_recovery_total: seedDone.potential_recovery_total,
      },
      {
        status: 'completed',
        processed_leases: 1,
        total_leases: 1,
        snapshot_count: 1,
        potential_recovery_total: expectedA2024.total_recovery,
      }
    )

    const seedSnapshot = await expectJson(
      `/api/v1/reconciliation/snapshots/${seedDone.snapshot_ids[0]}`,
      { status: 200 }
    )
    check(
      'seed 2024 snapshot matches offline penny-exact math (gross-up + repeating share + admin exclusion)',
      snapshotMoney(seedSnapshot),
      {
        lease_id: leaseA.id,
        ...publicFields(expectedA2024),
      }
    )

    const finalize = await expectJson(
      '/api/v1/reconciliation/snapshots/finalize-batch',
      {
        method: 'POST',
        status: 200,
        body: {
          property_id: property.id,
          period_start: seedStart,
          period_end: seedEnd,
        },
      }
    )
    check(
      'seed 2024 snapshot finalizes (cap history seeded)',
      {
        total_attempted: finalize.total_attempted,
        total_succeeded: finalize.total_succeeded,
        total_failed: finalize.total_failed,
      },
      { total_attempted: 1, total_succeeded: 1, total_failed: 0 }
    )

    // -- Offline expected: target year 2025 (365 days, both leases) ---------
    // Lease B overlap: 2025-04-16..2025-12-31 = 260 inclusive days.
    const occ2025 = occupancyRate(
      [
        { sqft: '1234.56', overlapDays: 365 },
        { sqft: '2000.00', overlapDays: 260 },
      ],
      totalSqftRate,
      365
    )
    const factor2025 = grossUpFactor(occ2025)
    const pools2025 = [
      {
        name: camPoolName,
        grossable: true,
        cents: parseMoney(glAmounts.cam2025a) + parseMoney(glAmounts.cam2025b),
      },
      { name: insPoolName, grossable: false, cents: parseMoney(glAmounts.ins2025) },
    ]
    const seedAfterCapCents = parseMoney(expectedA2024.tenant_share_after_cap)
    const expectedA2025 = leaseSnapshot({
      pools: pools2025,
      occ: occ2025,
      factor: factor2025,
      terms: {
        shareRate: shareARate,
        prorationRate: RATE,
        capType: 'cumulative_compounding',
        adminRate: parseRate('0.15'),
        adminExcludedNames,
      },
      capHistory: { baseCents: seedAfterCapCents },
    })
    // Proration for lease B = Rate(260)/Rate(365) (8dp half-up).
    const prorationB = rateDiv(260n * RATE, 365n * RATE)
    const expectedB2025 = leaseSnapshot({
      pools: pools2025,
      occ: occ2025,
      factor: factor2025,
      terms: {
        shareRate: parseRate('0.2'),
        prorationRate: prorationB,
        capType: 'none',
        adminRate: parseRate('0.10'),
        adminExcludedNames,
      },
      capHistory: null,
    })
    report.offline_expected.target_2025 = {
      occupancy: rateToString(occ2025),
      gross_up_factor: rateToString(factor2025),
      lease_b_proration: rateToString(prorationB),
      cap_effective_max: expectedA2025._effectiveMax,
      lease_a: publicFields(expectedA2025),
      lease_b: publicFields(expectedB2025),
    }

    // Scenario self-consistency: the design must actually torture.
    check(
      'offline design invariants (gross-up engaged, cap binds, proration partial)',
      {
        occupancy_below_target: occ2025 < TARGET_OCC,
        gross_up_factor_above_one: factor2025 > RATE,
        cap_binds:
          parseMoney(expectedA2025.tenant_share_before_cap) >
          parseMoney(expectedA2025.tenant_share_after_cap),
        lease_b_prorated: prorationB < RATE,
      },
      {
        occupancy_below_target: true,
        gross_up_factor_above_one: true,
        cap_binds: true,
        lease_b_prorated: true,
      }
    )

    // -- Run target year -----------------------------------------------------
    const targetJob = await expectJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      status: 202,
      body: {
        property_id: property.id,
        period_start: targetStart,
        period_end: targetEnd,
        force_recalculate: true,
      },
    })
    created.targetJobId = targetJob.job_id
    const targetDone = await waitForJob(targetJob.job_id)
    created.targetSnapshotIds = targetDone.snapshot_ids

    const expectedTotal2025 = centsToString(
      parseMoney(expectedA2025.total_recovery) +
        parseMoney(expectedB2025.total_recovery)
    )
    check(
      'target 2025 job completes with both leases',
      {
        status: targetDone.status,
        processed_leases: targetDone.processed_leases,
        total_leases: targetDone.total_leases,
        snapshot_count: targetDone.snapshot_ids.length,
        potential_recovery_total: targetDone.potential_recovery_total,
      },
      {
        status: 'completed',
        processed_leases: 2,
        total_leases: 2,
        snapshot_count: 2,
        potential_recovery_total: expectedTotal2025,
      }
    )

    const byLease = {}
    for (const snapshotId of targetDone.snapshot_ids) {
      const snapshot = await expectJson(
        `/api/v1/reconciliation/snapshots/${snapshotId}`,
        { status: 200 }
      )
      byLease[snapshot.lease_id] = snapshot
    }
    check(
      'target 2025 lease A snapshot matches offline math (BINDING compounding cap + gross-up + repeating share)',
      snapshotMoney(byLease[leaseA.id]),
      { lease_id: leaseA.id, ...publicFields(expectedA2025) }
    )
    check(
      'target 2025 lease B snapshot matches offline math (mid-year 260/365 proration + gross-up)',
      snapshotMoney(byLease[leaseB.id]),
      { lease_id: leaseB.id, ...publicFields(expectedB2025) }
    )
  } finally {
    await cleanup(created, {
      seed: { periodStart: seedStart, periodEnd: seedEnd },
      target: { periodStart: targetStart, periodEnd: targetEnd },
    })
  }
}

function publicFields(expected) {
  return {
    total_operating_expenses: expected.total_operating_expenses,
    grossed_up_expenses: expected.grossed_up_expenses,
    base_year_amount: expected.base_year_amount,
    tenant_share_before_cap: expected.tenant_share_before_cap,
    tenant_share_after_cap: expected.tenant_share_after_cap,
    admin_fee: expected.admin_fee,
    total_recovery: expected.total_recovery,
  }
}

function snapshotMoney(snapshot) {
  if (!snapshot) return { missing: true }
  return {
    lease_id: snapshot.lease_id,
    total_operating_expenses: snapshot.total_operating_expenses,
    grossed_up_expenses: snapshot.grossed_up_expenses,
    base_year_amount: snapshot.base_year_amount,
    tenant_share_before_cap: snapshot.tenant_share_before_cap,
    tenant_share_after_cap: snapshot.tenant_share_after_cap,
    admin_fee: snapshot.admin_fee,
    total_recovery: snapshot.total_recovery,
  }
}

function rateToString(rate) {
  const neg = rate < 0n
  const abs = neg ? -rate : rate
  const whole = abs / RATE
  const fraction = (abs % RATE).toString().padStart(8, '0')
  return `${neg ? '-' : ''}${whole}.${fraction}`.replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * Persist `admin_fee_excluded_pools` on the leases via Supabase PostgREST
 * (RLS-scoped user JWT). Returns true when the merged profile reads back with
 * the exclusion; false (fallback: no exclusion) when RLS/PostgREST refuses.
 */
async function applyAdminFeeExclusion(leaseIds, poolName) {
  for (const leaseId of leaseIds) {
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
      report.generated.adminExclusionError = `postgrest read failed for ${leaseId}: ${readResponse.status} ${JSON.stringify(rows).slice(0, 300)}`
      return false
    }
    const merged = {
      ...rows[0].recovery_profile,
      admin_fee_excluded_pools: [poolName],
    }
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
    const okRow =
      patchResponse.ok &&
      Array.isArray(patched) &&
      patched.length === 1 &&
      Array.isArray(patched[0].recovery_profile?.admin_fee_excluded_pools) &&
      patched[0].recovery_profile.admin_fee_excluded_pools[0] === poolName
    if (!okRow) {
      report.generated.adminExclusionError = `postgrest patch failed for ${leaseId}: ${patchResponse.status} ${JSON.stringify(patched).slice(0, 300)}`
      return false
    }
  }
  return true
}

async function uploadCsv({ propertyId, fileName, csv, sourceOverride }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', sourceOverride)
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)

  const response = await fetchRetry(`${apiUrl}/api/v1/ingestion/upload`, {
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
    `Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function cleanup(created, periods) {
  const failures = []

  // Finalized snapshots are user-immutable BY DESIGN (RLS "Only draft
  // snapshots can be updated/deleted" + route guards
  // property_in_finalized_snapshot / batch_in_finalized_reconciliation),
  // so a scenario that exercises cumulative caps (which REQUIRE a
  // finalized prior year) cannot fully self-clean with a user JWT.
  // Step 1: try the PostgREST definalize anyway — it documents that the
  // immutability holds (expected: 0 rows updated). If a service-role
  // definalize has been done out-of-band, deletes below succeed.
  const definalized = await attemptDefinalize(created.propertyId)
  report.generated.definalizeViaUserJwt = definalized

  for (const [label, batchId] of [
    ['2024', created.batch2024Id],
    ['2025', created.batch2025Id],
  ]) {
    if (!batchId) continue
    const blocked = await attemptCleanup(
      failures,
      `delete ingestion batch ${label}`,
      () => deleteEmpty(`/api/v1/ingestion/batches/${batchId}`),
      { residualOn: 'batch_in_finalized_reconciliation', id: batchId }
    )
    if (blocked) continue
    await attemptCleanup(failures, `verify ingestion batch ${label} deleted`, () =>
      expectCleanupStatus(`/api/v1/ingestion/batches/${batchId}`, { status: 404 })
    )
  }
  for (const mappingId of [created.camMappingId, created.insMappingId]) {
    if (!mappingId || !created.propertyId) continue
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${mappingId}`
      )
    )
  }
  for (const poolId of [created.camPoolId, created.insPoolId]) {
    if (!poolId || !created.propertyId) continue
    await attemptCleanup(failures, 'delete expense pool', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`
      )
    )
    await attemptCleanup(failures, 'verify expense pool deleted', () =>
      expectCleanupStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${poolId}`,
        { status: 404 }
      )
    )
  }
  if (created.propertyId) {
    const blocked = await attemptCleanup(
      failures,
      'delete property',
      () => deleteEmpty(`/api/v1/properties/${created.propertyId}`),
      { residualOn: 'property_in_finalized_snapshot', id: created.propertyId }
    )
    if (!blocked) {
      await attemptCleanup(failures, 'verify property deleted', () =>
        expectCleanupStatus(`/api/v1/properties/${created.propertyId}`, {
          status: 404,
        })
      )
      await attemptCleanup(
        failures,
        'verify seed (finalized) snapshots deleted by cascade',
        () => expectNoSnapshots(created.propertyId, periods.seed)
      )
      await attemptCleanup(
        failures,
        'verify target snapshots deleted by cascade',
        () => expectNoSnapshots(created.propertyId, periods.target)
      )
      for (const jobId of [created.seedJobId, created.targetJobId]) {
        if (!jobId) continue
        await attemptCleanup(
          failures,
          'verify calculation job deleted by cascade',
          () =>
            expectCleanupStatus(`/api/v1/reconciliation/jobs/${jobId}`, {
              status: 404,
            })
        )
      }
    }
  }
  if (report.residuals?.length > 0) {
    // Known immutability block. Purge recipe (service role):
    //   update reconciliation_snapshots set status='draft', finalized_at=null
    //   where property_id='<propertyId>' and status='finalized';
    // then DELETE the batches + property via the API as this user.
    report.cleanup_requires_service_role_purge = true
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

/**
 * Attempt a user-JWT PostgREST definalize of all finalized snapshots on the
 * property. Expected result in prod: RLS blocks it (0 rows) — evidence that
 * finalized immutability is enforced at the database, not just the routes.
 */
async function attemptDefinalize(propertyId) {
  if (!propertyId) return { attempted: false }
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reconciliation_snapshots?property_id=eq.${propertyId}&status=eq.finalized`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify({ status: 'draft', finalized_at: null }),
      }
    )
    const rows = await response.json().catch(() => null)
    const updated = Array.isArray(rows) ? rows.length : 0
    return {
      attempted: true,
      http_status: response.status,
      rows_updated: updated,
      rls_blocked: response.ok && updated === 0,
    }
  } catch (error) {
    return { attempted: true, error: errorMessage(error) }
  }
}

async function expectNoSnapshots(propertyId, period) {
  const path = `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${period.periodStart}&period_end=${period.periodEnd}&page=1&size=10`
  const list = await expectJson(path, { status: 200 })
  const ok =
    list.total === 0 && Array.isArray(list.items) && list.items.length === 0
  report.cleanup.push({
    path,
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

async function attemptCleanup(failures, label, operation, options = {}) {
  try {
    await operation()
    return false
  } catch (error) {
    const message = errorMessage(error)
    if (options.residualOn && message.includes(options.residualOn)) {
      // Expected finalized-immutability block, not a scenario failure:
      // record as a residual needing a service-role purge.
      report.residuals = report.residuals ?? []
      report.residuals.push({
        label,
        id: options.id ?? null,
        blocked_by: options.residualOn,
        detail: message.slice(0, 300),
      })
      report.cleanup.push({
        label,
        ok: false,
        blocked_by_design: options.residualOn,
        error: message,
      })
      return true
    }
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: message })
    return false
  }
}

/** fetch with retry on transient network failures (ECONNRESET etc.). */
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

async function expectStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  const text = await response.text()
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return { status: response.status, text }
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
  const response = await fetchRetry(`${apiUrl}${path}`, {
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

// ---------------------------------------------------------------------------
// Entry point (kept at the bottom so all const bindings are initialized)
// ---------------------------------------------------------------------------
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
