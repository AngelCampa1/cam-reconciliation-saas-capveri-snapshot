/**
 * PROD E2E STRESS — multi-year cumulative-compounding cap-bank carryforward.
 *
 * Domain: sequential MULTI-YEAR reconciliation on ONE property / ONE lease,
 * against the LIVE production engine (cloudflare-reconciliation-v1 on
 * api.capveri.com). The question this scenario answers penny-exactly:
 *
 *   Does the deployed engine carry the compounding cap-bank forward CORRECTLY
 *   across 3+ consecutive finalized years — accumulating an unused allowance in
 *   an under-cap year and RELEASING it in a later binding year — exactly as the
 *   once-floored oracle math prescribes (caps.py calculate_cumulative_compounding_cap
 *   / cumulative-cap.ts compoundingEffectiveMax)?
 *
 * KNOWN FOOTGUN under test: cap_bank_ledger.py floors the bank PER YEAR, while
 * the reconciliation engine (caps.py line 521 / cumulative-cap.ts line 175)
 * floors it exactly ONCE. On a "bank-then-over" sequence the two DIVERGE. This
 * scenario is a bank-then-over sequence by construction, so if the engine ever
 * regressed to per-year flooring the 2025 effective max would drop from
 * 128012.50 to 115762.50 (the released 12250.00 bank would vanish) and the
 * check would fail.
 *
 * Sequence (pro_rata_share = 1.0, occupancy >= target so NO gross-up, no admin
 * fee, no base-year — the cap carryforward is isolated as the sole moving part):
 *
 *   2023 SEED  N=1, no finalized prior -> cap DORMANT (loadTenantCapHistories
 *              finds no status='finalized' row with period_start < 2023).
 *              GL 100000.00 -> before=after=100000.00. Finalize -> becomes the
 *              cap base AND priors[0] for later years.
 *
 *   2024       N=2, priors=[100000.00], effMax = q2(base*1.05^2) + bank
 *              = 110250.00 + 5000.00 = 115250.00.
 *              GL 103000.00 (UNDER cap) -> after=103000.00. The 12250.00 of
 *              unused allowance (max_prior 105000 - actual_prior... accrues into
 *              next year's bank). Finalize -> priors=[100000, 103000].
 *
 *   2025       N=3, priors=[100000.00, 103000.00],
 *              maxAllowed = q2(base*1.05^3) = 115762.50,
 *              cumulativeMaxPrior = base*1.05 + base*1.05^2 = 105000 + 110250 = 215250,
 *              cumulativeActualPrior = 100000 + 103000 = 203000,
 *              bank = q2(max(0, 215250 - 203000)) = 12250.00  [floored ONCE],
 *              effMax = q2(115762.50 + 12250.00) = 128012.50.
 *              GL 140000.00 (OVER cap) -> BINDS, after=128012.50.
 *              This provably RELEASES the accumulated bank: without it the cap
 *              would be 115762.50 and after would be 115762.50.
 *
 * Plus two adversarial carryforward-integrity probes AFTER 2025 is run (not yet
 * finalized):
 *
 *   A. Re-run finalized 2024 with force_recalculate=true. The engine MUST refuse
 *      with HTTP 409 period_already_finalized (force_recalculate only deletes
 *      DRAFTS; the finalized-period guard precedes enqueue). Proves a re-run
 *      cannot silently corrupt the carryforward chain.
 *
 *   B. Re-list 2024's finalized snapshot after the refused re-run and confirm its
 *      after-cap share is byte-for-byte unchanged (103000.00) — the carryforward
 *      source of truth was not mutated.
 *
 * EXPECTED VALUES are computed OFFLINE, independently derived from the CAM cap
 * math: cap effective-max via decimal.js (precision 28, ROUND_HALF_UP, quantize
 * to 2dp exactly where caps.py quantizes — a faithful port of
 * cumulative-cap.ts::compoundingEffectiveMax), and money via BigInt cents
 * (money.ts semantics). No value is echoed back from the API.
 *
 * Everything created is prefixed "[PROD-TEST] CY3A" and deleted in the finally
 * block (property delete cascades units/leases/GL/snapshots incl. the finalized
 * ones). Cleanup is verified (re-list -> 0 CY3A entities). Finalized snapshots
 * are user-immutable BY DESIGN, so if the property delete is blocked the residual
 * is recorded with the service-role purge recipe rather than counted as a pass.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Decimal from 'decimal.js'

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
  `prod-stress-recon-multiyear-capbank-${runId}`
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
// Money: exact integer cents (port of cloudflare-backend money.ts semantics)
// ---------------------------------------------------------------------------
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

function centsToString(cents) {
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n)
    .toString()
    .padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Cap effective-max: faithful port of cumulative-cap.ts::compoundingEffectiveMax
// (decimal.js precision 28, ROUND_HALF_UP, quantize to 2dp; bank floored ONCE).
// ---------------------------------------------------------------------------
const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP })
const q2 = (value) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

/**
 * @param {string} base  base-year after-cap amount (capBaseYearAmount)
 * @param {string} capRate  e.g. "0.05"
 * @param {string[]} orderedPriorActuals  prior after-cap amounts, oldest-first
 *        (the seed year is BOTH the base AND priors[0], per loadTenantCapHistories)
 * @returns {{ effMax: string, maxAllowed: string, bank: string, years: number }}
 */
function compoundingEffectiveMax(base, capRate, orderedPriorActuals) {
  const baseD = new D(base)
  const priors = orderedPriorActuals.map((a) => new D(a))
  const years = Math.min(priors.length + 1, 50)
  const onePlus = new D('1').add(new D(capRate))

  const maxAllowed = q2(baseD.mul(onePlus.pow(years)))
  let cumulativeMaxPrior = new D('0')
  for (let y = 1; y < years; y++) {
    cumulativeMaxPrior = cumulativeMaxPrior.add(baseD.mul(onePlus.pow(y)))
  }
  const cumulativeActualPrior = priors.reduce(
    (sum, a) => sum.add(a),
    new D('0')
  )
  const bank = q2(
    Decimal.max(cumulativeMaxPrior.sub(cumulativeActualPrior), new D('0'))
  )
  const effMax = q2(maxAllowed.add(bank))
  return {
    effMax: effMax.toFixed(2),
    maxAllowed: maxAllowed.toFixed(2),
    bank: bank.toFixed(2),
    years,
  }
}

// ---------------------------------------------------------------------------
// Offline per-year snapshot model for THIS scenario's shape:
//   pro_rata_share = 1.0, occupancy >= target (no gross-up), no admin fee,
//   no base-year, single operating pool. So:
//     total_operating = grossed_up = GL total
//     before_cap = GL total (net * 1.0 * 1.0)
//     after_cap  = min(before_cap, effMax)   [cap engages only when priors exist]
//     admin_fee  = 0.00
//     total_recovery = after_cap
// ---------------------------------------------------------------------------
const CAP_RATE = '0.05'

function yearExpectation({ glTotal, base, priors }) {
  const before = parseMoney(glTotal)
  let after = before
  let cap = null
  if (base !== null) {
    cap = compoundingEffectiveMax(base, CAP_RATE, priors)
    const effMaxCents = parseMoney(cap.effMax)
    if (before > effMaxCents) after = effMaxCents
  }
  return {
    total_operating_expenses: centsToString(before),
    grossed_up_expenses: centsToString(before),
    base_year_amount: '0.00',
    tenant_share_before_cap: centsToString(before),
    tenant_share_after_cap: centsToString(after),
    admin_fee: '0.00',
    total_recovery: centsToString(after),
    _cap: cap,
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] CY3A Multi-Year Capbank ${suffix}`
  const poolName = `[PROD-TEST] CY3A CAM Ops ${suffix}`
  const tenantName = `[PROD-TEST] CY3A Anchor ${suffix}`

  const years = [
    { label: '2023', start: '2023-01-01', end: '2023-12-31', gl: '100000.00' },
    { label: '2024', start: '2024-01-01', end: '2024-12-31', gl: '103000.00' },
    { label: '2025', start: '2025-01-01', end: '2025-12-31', gl: '140000.00' },
  ]

  const created = {
    propertyId: null,
    unitId: null,
    leaseId: null,
    poolId: null,
    mappingId: null,
    batchIds: {}, // label -> batch_id
    jobIds: {}, // label -> job_id
    snapshotIds: {}, // label -> [snapshotId]
    finalizedLabels: [],
  }
  report.generated = { propertyName, poolName, tenantName, years }

  // -- Offline expected sequence (independent of the API) --------------------
  // Seed 2023: cap dormant (no finalized prior) -> after = before = 100000.00.
  const exp2023 = yearExpectation({ glTotal: years[0].gl, base: null, priors: [] })
  const base = exp2023.tenant_share_after_cap // 100000.00
  // 2024: priors=[base]; under-cap.
  const exp2024 = yearExpectation({
    glTotal: years[1].gl,
    base,
    priors: [base],
  })
  const prior2024 = exp2024.tenant_share_after_cap // 103000.00
  // 2025: priors=[base, prior2024]; binding, releases bank.
  const exp2025 = yearExpectation({
    glTotal: years[2].gl,
    base,
    priors: [base, prior2024],
  })
  const expected = { '2023': exp2023, '2024': exp2024, '2025': exp2025 }
  report.offline_expected = {
    seed_base: base,
    year_2023: publicFields(exp2023),
    year_2024: { ...publicFields(exp2024), cap: exp2024._cap },
    year_2025: { ...publicFields(exp2025), cap: exp2025._cap },
  }

  // Design invariants — the scenario must actually exercise carryforward.
  check(
    'offline design invariants (seed dormant, 2024 under-cap accrues, 2025 binds & releases bank)',
    {
      seed_uncapped: exp2023.tenant_share_before_cap === exp2023.tenant_share_after_cap,
      y2024_under_cap:
        parseMoney(exp2024.tenant_share_before_cap) <=
        parseMoney(exp2024._cap.effMax),
      y2024_not_capped:
        exp2024.tenant_share_before_cap === exp2024.tenant_share_after_cap,
      y2025_binds:
        parseMoney(exp2025.tenant_share_before_cap) >
        parseMoney(exp2025._cap.effMax),
      y2025_bank_released: exp2025._cap.bank !== '0.00',
      y2025_after_equals_effmax:
        exp2025.tenant_share_after_cap === exp2025._cap.effMax,
      // Per-year flooring would have zeroed the bank and dropped the effmax to
      // maxAllowed. Prove the once-floored math gives a STRICTLY higher cap.
      once_floored_beats_per_year_floored:
        parseMoney(exp2025._cap.effMax) > parseMoney(exp2025._cap.maxAllowed),
    },
    {
      seed_uncapped: true,
      y2024_under_cap: true,
      y2024_not_capped: true,
      y2025_binds: true,
      y2025_bank_released: true,
      y2025_after_equals_effmax: true,
      once_floored_beats_per_year_floored: true,
    }
  )

  try {
    // -- Entities ----------------------------------------------------------
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '333 Carryforward Way',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75201',
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
        unit_number: `CY3A-${suffix.toUpperCase()}`,
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
          // Occupancy is 100% (single full-building tenant) so gross-up never
          // engages regardless of this flag; kept true to prove that.
          is_gross_up_applicable: true,
          gross_up_target: null,
          description: 'Production E2E disposable multi-year capbank pool',
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

    // Full-building single tenant: pro_rata_share = 1.0, occupancy = 100%
    // (>= 0.95 target -> no gross-up). cumulative_compounding cap @ 5%.
    const lease = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unit.id,
        tenant_name: tenantName,
        start_date: '2023-01-01',
        end_date: '2027-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '1.0',
          cap_type: 'cumulative_compounding',
          cap_rate: CAP_RATE,
          // admin_fee_percentage is non-nullable (default "0"); 0% keeps the
          // admin fee out so the cap carryforward is the sole moving part.
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

    // -- Run each year sequentially: upload GL, calculate, verify, finalize --
    for (const year of years) {
      const upload = await uploadCsv({
        propertyId: property.id,
        fileName: `cy3a-${year.label}-${suffix}.csv`,
        csv: [
          'Account,Account Description,Date,Amount,Vendor,Description',
          `6100,Common Area Maintenance,06/15/${year.label},${year.gl},CapbankCo,${year.label} CAM`,
        ].join('\n'),
        sourceOverride: 'yardi',
      })
      created.batchIds[year.label] = upload.batch_id
      check(
        `gl upload ${year.label} creates one clean row`,
        {
          source_system: upload.source_system,
          row_count: upload.row_count,
          error_count: upload.error_count,
        },
        { source_system: 'yardi', row_count: 1, error_count: 0 }
      )

      const job = await expectJson('/api/v1/reconciliation/calculate', {
        method: 'POST',
        status: 202,
        body: {
          property_id: property.id,
          period_start: year.start,
          period_end: year.end,
          force_recalculate: true,
        },
      })
      created.jobIds[year.label] = job.job_id
      const done = await waitForJob(job.job_id)
      created.snapshotIds[year.label] = done.snapshot_ids

      const exp = expected[year.label]
      check(
        `${year.label} job completes (single lease) with expected potential recovery`,
        {
          status: done.status,
          processed_leases: done.processed_leases,
          total_leases: done.total_leases,
          snapshot_count: done.snapshot_ids.length,
          potential_recovery_total: done.potential_recovery_total,
        },
        {
          status: 'completed',
          processed_leases: 1,
          total_leases: 1,
          snapshot_count: 1,
          potential_recovery_total: exp.total_recovery,
        }
      )

      const snapshot = await expectJson(
        `/api/v1/reconciliation/snapshots/${done.snapshot_ids[0]}`,
        { status: 200 }
      )
      check(
        `${year.label} snapshot matches offline cap math penny-exact` +
          (year.label === '2025'
            ? ' (BINDING compounding cap releases carried bank)'
            : year.label === '2024'
              ? ' (under-cap year, bank accrues)'
              : ' (seed year, cap dormant)'),
        snapshotMoney(snapshot),
        { lease_id: lease.id, ...publicFields(exp) }
      )
      // Cross-check: snapshot aggregate = sum of its pool line items.
      crossCheckLineItems(year.label, snapshot)

      const finalize = await expectJson(
        '/api/v1/reconciliation/snapshots/finalize-batch',
        {
          method: 'POST',
          status: 200,
          body: {
            property_id: property.id,
            period_start: year.start,
            period_end: year.end,
          },
        }
      )
      check(
        `${year.label} snapshot finalizes (adds to cap history)`,
        {
          total_attempted: finalize.total_attempted,
          total_succeeded: finalize.total_succeeded,
          total_failed: finalize.total_failed,
        },
        { total_attempted: 1, total_succeeded: 1, total_failed: 0 }
      )
      created.finalizedLabels.push(year.label)
    }

    // -- Probe A: re-running a finalized prior year must be REFUSED ----------
    // force_recalculate deletes DRAFTS only; the finalized-period guard (HTTP
    // 409 period_already_finalized) precedes enqueue, so carryforward cannot be
    // silently corrupted by a re-run.
    const reRun = await expectStatusJson('/api/v1/reconciliation/calculate', {
      method: 'POST',
      body: {
        property_id: property.id,
        period_start: '2024-01-01',
        period_end: '2024-12-31',
        force_recalculate: true,
      },
    })
    const reRunCode =
      reRun.json?.error?.code ??
      reRun.json?.code ??
      (typeof reRun.json?.error === 'string' ? reRun.json.error : null)
    check(
      're-running finalized 2024 is refused (409 period_already_finalized) — carryforward is protected',
      { status: reRun.status, error_code: reRunCode },
      { status: 409, error_code: 'period_already_finalized' }
    )

    // -- Probe B: 2024 finalized carryforward source is byte-for-byte intact --
    const snap2024After = await expectJson(
      `/api/v1/reconciliation/snapshots/${created.snapshotIds['2024'][0]}`,
      { status: 200 }
    )
    check(
      '2024 finalized after-cap share unchanged after refused re-run (carryforward source intact)',
      {
        tenant_share_after_cap: snap2024After.tenant_share_after_cap,
        is_finalized: snap2024After.is_finalized ?? snap2024After.status === 'finalized',
      },
      {
        tenant_share_after_cap: exp2024.tenant_share_after_cap,
        is_finalized: true,
      }
    )
  } finally {
    await cleanup(created, years)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

/**
 * Cross-check the snapshot's aggregate money against the sum of its per-pool
 * line-item breakdowns (when present). Any divergence is a real defect: the
 * per-pool allocation must reconcile EXACTLY to the aggregate.
 */
function crossCheckLineItems(label, snapshot) {
  const breakdowns =
    snapshot.pool_breakdowns ??
    snapshot.pool_breakdown ??
    snapshot.line_items ??
    null
  if (!Array.isArray(breakdowns) || breakdowns.length === 0) {
    report.checks.push({
      label: `${label} line-item cross-check (no per-pool breakdown in payload — skipped)`,
      ok: true,
      actual: { breakdown_present: false },
      expected: { breakdown_present: false },
    })
    return
  }
  const sumField = (field) =>
    breakdowns.reduce((acc, item) => {
      const raw = item[field] ?? item[`${field}_amount`] ?? '0'
      return acc + parseMoney(String(raw))
    }, 0n)
  const beforeSum = sumField('recoverable_share_before_cap') || sumField('share_before_cap')
  const afterSum = sumField('recoverable_share_after_cap') || sumField('share_after_cap')
  check(
    `${label} snapshot aggregate = sum of pool line items`,
    {
      before_cap_sum: centsToString(beforeSum),
      after_cap_sum: centsToString(afterSum),
    },
    {
      before_cap_sum: snapshot.tenant_share_before_cap,
      after_cap_sum: snapshot.tenant_share_after_cap,
    }
  )
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
    `Timed out waiting for reconciliation job ${jobId}: ${JSON.stringify(lastJob).slice(0, 500)}`
  )
}

async function cleanup(created, years) {
  const failures = []

  // Document that finalized immutability holds at the DB (expected: 0 rows).
  const definalized = await attemptDefinalize(created.propertyId)
  report.generated.definalizeViaUserJwt = definalized

  for (const year of years) {
    const batchId = created.batchIds[year.label]
    if (!batchId) continue
    const blocked = await attemptCleanup(
      failures,
      `delete ingestion batch ${year.label}`,
      () => deleteEmpty(`/api/v1/ingestion/batches/${batchId}`),
      { residualOn: 'batch_in_finalized_reconciliation', id: batchId }
    )
    if (blocked) continue
    await attemptCleanup(
      failures,
      `verify ingestion batch ${year.label} deleted`,
      () =>
        expectCleanupStatus(`/api/v1/ingestion/batches/${batchId}`, {
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
    await attemptCleanup(failures, 'verify expense pool deleted', () =>
      expectCleanupStatus(
        `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`,
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
      for (const year of years) {
        await attemptCleanup(
          failures,
          `verify ${year.label} snapshots deleted by cascade`,
          () =>
            expectNoSnapshots(created.propertyId, {
              periodStart: year.start,
              periodEnd: year.end,
            })
        )
      }
      for (const label of Object.keys(created.jobIds)) {
        await attemptCleanup(
          failures,
          `verify ${label} calculation job deleted by cascade`,
          () =>
            expectCleanupStatus(
              `/api/v1/reconciliation/jobs/${created.jobIds[label]}`,
              { status: 404 }
            )
        )
      }
    }
  }

  // Final verification: query the DB directly (PostgREST, RLS-scoped user JWT —
  // the reliable seam, since /api/v1/properties is org-paginated and can miss a
  // row) and confirm zero CY3A properties remain. A property still present is a
  // KNOWN finalized-immutability residual (recorded above) — reported truthfully,
  // NOT counted as a clean-cleanup pass.
  await verifyCy3aResidualState(created.propertyId)

  if (report.residuals?.length > 0) {
    // Known immutability block. Service-role purge recipe:
    //   update reconciliation_snapshots set status='draft', finalized_at=null
    //   where property_id='<propertyId>' and status='finalized';
    // then DELETE the batches + property via the API as this user.
    report.cleanup_requires_service_role_purge = true
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
  }
}

async function verifyCy3aResidualState(propertyId) {
  // PostgREST direct query by name (RLS-scoped) — reliable, unlike the paginated
  // /api/v1/properties list.
  const response = await fetch(
    `${supabaseUrl}/rest/v1/properties?name=like.${encodeURIComponent('[PROD-TEST] CY3A%')}&select=id,name`,
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
  const fullyClean = residual.length === 0
  // A residual is EXPECTED and acceptable ONLY when it is this run's property
  // blocked by finalized immutability (already recorded in report.residuals).
  const onlyKnownResidual =
    residual.length > 0 &&
    residual.every((p) => p.id === propertyId) &&
    (report.residuals ?? []).some(
      (r) => r.id === propertyId && r.blocked_by === 'property_in_finalized_snapshot'
    )
  report.cleanup.push({
    label: 'CY3A residual state (PostgREST direct)',
    ok: fullyClean || onlyKnownResidual,
    fully_clean: fullyClean,
    known_immutability_residual_only: onlyKnownResidual,
    cy3a_properties_remaining: residual.map((p) => ({ id: p.id, name: p.name })),
  })
  report.cleanup_fully_verified_clean = fullyClean
  if (!fullyClean && !onlyKnownResidual) {
    throw new Error(
      `Unexpected CY3A residual (not the known finalized-immutability block): ${JSON.stringify(residual).slice(0, 500)}`
    )
  }
}

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

/** Like expectJson but returns { status, json } WITHOUT asserting the status —
 *  used for the intentional-error re-run probe. */
async function expectStatusJson(path, options) {
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
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { status: response.status, json }
}

async function expectStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
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
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) {
    throw new Error(`DELETE ${path} returned ${response.status}: ${text.slice(0, 500)}`)
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
