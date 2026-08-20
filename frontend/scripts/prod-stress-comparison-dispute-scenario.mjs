// Prod E2E stress: cross-document comparison variance math + dispute lifecycle authz.
//
// Domain under test (CY3C):
//   1. Comparison variance math on a REAL prod property, driven through the explicit
//      charge route (POST /api/v1/comparison/:propertyId). Every result is verified
//      against an OFFLINE Decimal re-implementation of the server's comparison model
//      (decimal.js, 2dp HALF_UP for variance_pct, .toFixed() serialization). Boundaries
//      exercised: exact match (zero variance), sub-cent within/over tolerance, full-amount
//      undercharge (one-side-only correct), unmatched-lease (one-side-only charged),
//      duplicate line aggregation, very large amount, and cross-surface identities
//      (net == charged-correct == sum of signed line variances; totals == sum of lines).
//   2. Persisted comparison runs (POST/GET /comparison/:propertyId/runs, GET
//      /comparison/runs/:runId) with round-trip fidelity + IDOR (unknown run id 404).
//   3. Dispute lifecycle + authz on a REAL tenant-created dispute (tenant creds; no
//      fixture secret available on this machine): cross-party guards (tenant->/disputes
//      403, landlord->/tenant/disputes 403), tenant-owns-only detail, IDOR 404, tenant
//      cannot mutate status (no route), rate-limit awareness. Landlord-side illegal
//      transitions / 409 concurrency require PROD_E2E_FIXTURE_SECRET or a shared-org
//      dispute and are SKIPPED-with-evidence when unavailable (documented in report).
//
// Run from cwd frontend/: node scripts/prod-stress-comparison-dispute-scenario.mjs
// Cleans up EVERYTHING in finally and verifies zero CY3C entities remain.

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
  ...process.env,
}

const required = [
  'E2E_PROD_EMAIL',
  'E2E_PROD_PASSWORD',
  'E2E_PROD_TENANT_EMAIL',
  'E2E_PROD_TENANT_PASSWORD',
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
  `prod-stress-comparison-dispute-${runId}`
)
await mkdir(outputDir, { recursive: true })

const CY3C = '[PROD-TEST] CY3C'
// Tenant-dispute cleanup endpoint requires this EXACT description marker.
const disputeDescription = `[PROD-TEST] Tenant dispute lifecycle prod_e2e_run_id=${runId}. Synthetic dispute for production cleanup verification.`

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  skips: [],
  cleanup: [],
}

let landlordToken
let tenantToken
try {
  landlordToken = await signIn(env.E2E_PROD_EMAIL, env.E2E_PROD_PASSWORD)
  tenantToken = await signIn(env.E2E_PROD_TENANT_EMAIL, env.E2E_PROD_TENANT_PASSWORD)
  const phaseErrors = []
  try {
    await runComparison()
  } catch (error) {
    phaseErrors.push(`comparison: ${errorMessage(error)}`)
  }
  try {
    await runDisputeAuthz()
  } catch (error) {
    phaseErrors.push(`dispute: ${errorMessage(error)}`)
  }
  if (phaseErrors.length > 0) report.phase_errors = phaseErrors
  report.ok = report.checks.every((c) => c.ok) && phaseErrors.length === 0
} catch (error) {
  report.fatal = errorMessage(error)
  throw error
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1

// ---------------------------------------------------------------------------
// Comparison variance math
// ---------------------------------------------------------------------------

async function runComparison() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `${CY3C} Comparison Tower ${suffix}`
  const unitNumber = `CY3C-${suffix.toUpperCase()}`
  const tenantName = `${CY3C} Tenant ${suffix}`
  const poolName = `${CY3C} Pool ${suffix}`
  const fileName = `cy3c-comparison-${suffix}.csv`
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
    runIds: [],
  }
  report.generated.comparison = {
    propertyName,
    tenantName,
    poolName,
    periodStart,
    periodEnd,
  }

  try {
    const property = await asLandlordJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '900 CY3C Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78705',
        total_rentable_sqft: '10000.00',
        total_usable_sqft: '9000.00',
        common_area_sqft: '1000.00',
        target_occupancy: '0.95',
        boma_standard_version: '2024',
        fiscal_year_start_month: 1,
      },
    })
    created.propertyId = property.id
    report.generated.comparison.propertyId = property.id

    const unit = await asLandlordJson(
      `/api/v1/properties/${property.id}/units`,
      {
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
      }
    )
    created.unitId = unit.id

    const lease = await asLandlordJson('/api/v1/leases', {
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

    const pool = await asLandlordJson(
      `/api/v1/properties/${property.id}/expense-pools`,
      {
        method: 'POST',
        status: 201,
        body: {
          name: poolName,
          pool_type: 'operating',
          is_gross_up_applicable: true,
          gross_up_target: '0.95',
          description: 'CY3C disposable comparison pool',
        },
      }
    )
    created.poolId = pool.id

    const mapping = await asLandlordJson(
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

    const upload = await uploadCsv({
      propertyId: property.id,
      fileName,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Janitorial,01/15/2026,5000.00,CleanCo,Annual janitorial',
      ].join('\n'),
    })
    created.batchId = upload.batch_id

    const job = await asLandlordJson('/api/v1/reconciliation/calculate', {
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
    const completedJob = await waitForJob(job.job_id)
    check(
      'reconciliation baseline recovers 5005.00 for the single lease',
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

    // The server-computed CapVeri-correct recovery for this lease.
    // Verified deterministically by the recon baseline check above (5005.00).
    const correct = new Decimal('5005.00')
    const ctx = {
      propertyId: property.id,
      leaseId: lease.id,
      tenantName,
      poolId: pool.id,
      poolName,
      periodStart,
      periodEnd,
      correct,
    }

    // --- Boundary scenario A: exact match (zero variance) ---------------
    await runComparisonCase(ctx, 'exact match / zero variance', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '5005.00' },
    ])

    // --- Boundary B: sub-cent WITHIN default tolerance (0.01) => match --
    await runComparisonCase(ctx, 'sub-cent within tolerance => match', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '5005.01' },
    ])

    // --- Boundary C: just OVER tolerance => overcharge -----------------
    await runComparisonCase(ctx, 'one cent over tolerance => overcharge', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '5005.02' },
    ])

    // --- Boundary D: undercharge (charged < correct) ------------------
    await runComparisonCase(ctx, 'undercharge below correct', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '4000.00' },
    ])

    // --- Boundary E: duplicate lines to same lease AGGREGATE -----------
    // Two lines 2600 + 2600 = 5200 charged vs 5005 correct => 195 overcharge.
    await runComparisonCase(ctx, 'duplicate lines aggregate to one lease row', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '2600.00' },
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '2600.00' },
    ])

    // --- Boundary F: one-side-only CHARGED (unmatched lease id) --------
    // A random uuid that is NOT a lease with a snapshot => unmatched-lease key.
    const strangerLeaseId = randomUUID()
    await runComparisonCase(ctx, 'charged-only unmatched lease id', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '5005.00' },
      { lease_id: strangerLeaseId, tenant_name: `${CY3C} Ghost ${suffix}`, amount: '999.00' },
    ], { strangerLeaseId, strangerName: `${CY3C} Ghost ${suffix}` })

    // --- Boundary G: unmatched name row (variance_pct null) -----------
    await runComparisonCase(ctx, 'unmatched name row has null variance_pct', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '5005.00' },
      { tenant_name: `${CY3C} NoLease ${suffix}`, amount: '42.42' },
    ], { unmatchedName: `${CY3C} NoLease ${suffix}` })

    // --- Boundary H: very large amount --------------------------------
    await runComparisonCase(ctx, 'very large overcharge amount', [
      { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '9999999999.99' },
    ])

    // --- Boundary I: one-side-only CORRECT (no charge at all) ----------
    // Charges empty => lease has correct 5005, charged 0 => undercharge full amount.
    await runComparisonCase(ctx, 'correct-only lease (no charges) => full undercharge', [])

    // --- Persisted runs -----------------------------------------------
    const persistBody = {
      period_start: periodStart,
      period_end: periodEnd,
      tolerance: '0.01',
      include_drafts: true,
      charges: [
        { lease_id: lease.id, tenant_name: tenantName, pool_id: pool.id, amount: '5200.00' },
      ],
    }
    const expectedPersist = computeExpected(ctx, persistBody.charges, new Decimal('0.01'))
    const stored = await asLandlordJson(
      `/api/v1/comparison/${property.id}/runs`,
      { method: 'POST', status: 201, body: persistBody }
    )
    created.runIds.push(stored.id)
    check(
      'persisted run header matches offline totals + source=explicit',
      {
        source: stored.source,
        property_id: stored.property_id,
        total_capveri_correct: stored.total_capveri_correct,
        total_actual_charged: stored.total_actual_charged,
        total_net_variance: stored.total_net_variance,
        total_overcharge: stored.total_overcharge,
        total_undercharge: stored.total_undercharge,
        overcharge_count: stored.overcharge_count,
        undercharge_count: stored.undercharge_count,
        match_count: stored.match_count,
        finding_count: stored.findings.length,
      },
      {
        source: 'explicit',
        property_id: property.id,
        total_capveri_correct: expectedPersist.total_capveri_correct,
        total_actual_charged: expectedPersist.total_actual_charged,
        total_net_variance: expectedPersist.total_net_variance,
        total_overcharge: expectedPersist.total_overcharge,
        total_undercharge: expectedPersist.total_undercharge,
        overcharge_count: expectedPersist.overcharge_count,
        undercharge_count: expectedPersist.undercharge_count,
        match_count: expectedPersist.match_count,
        finding_count: expectedPersist.tenants.length,
      }
    )

    const listed = await asLandlordJson(
      `/api/v1/comparison/${property.id}/runs?limit=10&offset=0`,
      { status: 200 }
    )
    check(
      'list runs includes the persisted run',
      {
        count: listed.length,
        first_id: listed[0]?.id,
        first_source: listed[0]?.source,
      },
      { count: 1, first_id: stored.id, first_source: 'explicit' }
    )

    const fetched = await asLandlordJson(
      `/api/v1/comparison/runs/${stored.id}`,
      { status: 200 }
    )
    check(
      'get run round-trips findings identically to persisted response',
      normalizeStoredFindings(fetched.findings),
      normalizeStoredFindings(stored.findings)
    )

    // IDOR: unknown run id => 404 comparison_run_not_found
    const ghostRun = await asLandlord(
      `/api/v1/comparison/runs/${randomUUID()}`,
      { status: 404 }
    )
    check(
      'unknown comparison run id returns 404',
      { status: ghostRun.status, code: ghostRun.json?.error?.code },
      { status: 404, code: 'comparison_run_not_found' }
    )

    // Reversed period rejected on persist route too.
    const reversed = await asLandlord(
      `/api/v1/comparison/${property.id}/runs`,
      {
        method: 'POST',
        status: 400,
        body: { period_start: periodEnd, period_end: periodStart, charges: [] },
      }
    )
    check(
      'persist run rejects reversed period',
      { status: reversed.status, code: reversed.json?.error?.code },
      { status: 400, code: 'invalid_period' }
    )
  } finally {
    await cleanupComparison(created, { periodStart, periodEnd })
  }
}

async function runComparisonCase(ctx, label, charges, extras = {}) {
  const tolerance = new Decimal('0.01')
  const expected = computeExpected(ctx, charges, tolerance, extras)
  const actual = await asLandlordJson(`/api/v1/comparison/${ctx.propertyId}`, {
    method: 'POST',
    status: 200,
    body: {
      period_start: ctx.periodStart,
      period_end: ctx.periodEnd,
      tolerance: '0.01',
      include_drafts: true,
      charges,
    },
  })

  // 1. Header totals match offline model exactly.
  check(
    `comparison[${label}]: totals match offline model`,
    {
      total_capveri_correct: actual.total_capveri_correct,
      total_actual_charged: actual.total_actual_charged,
      total_net_variance: actual.total_net_variance,
      total_overcharge: actual.total_overcharge,
      total_undercharge: actual.total_undercharge,
      overcharge_count: actual.overcharge_count,
      undercharge_count: actual.undercharge_count,
      match_count: actual.match_count,
      tenant_count: actual.tenants.length,
    },
    {
      total_capveri_correct: expected.total_capveri_correct,
      total_actual_charged: expected.total_actual_charged,
      total_net_variance: expected.total_net_variance,
      total_overcharge: expected.total_overcharge,
      total_undercharge: expected.total_undercharge,
      overcharge_count: expected.overcharge_count,
      undercharge_count: expected.undercharge_count,
      match_count: expected.match_count,
      tenant_count: expected.tenants.length,
    }
  )

  // 2. Per-line rows match offline model (sorted by abs_variance desc).
  check(
    `comparison[${label}]: line rows match offline model`,
    actual.tenants.map(pickRow),
    expected.tenants.map(pickRow)
  )

  // 3. Cross-surface identity: net_variance == charged - correct == sum(signed line variances).
  const sumLineVar = actual.tenants.reduce(
    (acc, t) => acc.plus(new Decimal(t.variance)),
    new Decimal(0)
  )
  const netFromTotals = new Decimal(actual.total_actual_charged).minus(
    new Decimal(actual.total_capveri_correct)
  )
  check(
    `comparison[${label}]: net == charged-correct == sum(line variances)`,
    {
      net_eq_totals: new Decimal(actual.total_net_variance).eq(netFromTotals),
      net_eq_sum_lines: new Decimal(actual.total_net_variance).eq(sumLineVar),
    },
    { net_eq_totals: true, net_eq_sum_lines: true }
  )

  // 4. Cross-surface identity: overcharge total == sum of positive line variances;
  //    undercharge total == sum of abs of negative line variances (beyond tolerance).
  let over = new Decimal(0)
  let under = new Decimal(0)
  for (const t of actual.tenants) {
    if (t.direction === 'overcharge') over = over.plus(new Decimal(t.variance))
    else if (t.direction === 'undercharge')
      under = under.plus(new Decimal(t.abs_variance))
  }
  check(
    `comparison[${label}]: overcharge/undercharge totals == sum of classified lines`,
    {
      over_eq: new Decimal(actual.total_overcharge).eq(over),
      under_eq: new Decimal(actual.total_undercharge).eq(under),
    },
    { over_eq: true, under_eq: true }
  )
}

// Offline re-implementation of the server comparison model for EXPLICIT charges.
// Mirrors adapters/db/comparison.ts (normalizeExplicitCharges + rekeyChargedToLeases,
// single-lease case) and domain/comparison/model.ts (buildComparisonResult).
function computeExpected(ctx, charges, tolerance, extras = {}) {
  const correctByLease = new Map([[ctx.leaseId, ctx.correct]])
  // tenantNames only contains leases with a snapshot in-period -> our single lease.
  const tenantNames = new Map([[ctx.leaseId, ctx.tenantName]])

  const chargedByLease = new Map()
  const chargedByName = new Map()
  const unidentified = []
  const chargedLeaseNames = new Map()

  charges.forEach((charge, index) => {
    const amount = new Decimal(charge.amount)
    const leaseId = (charge.lease_id ?? '').trim()
    const name = (charge.tenant_name ?? '').trim()
    if (leaseId) {
      addD(chargedByLease, leaseId, amount)
      if (name) chargedLeaseNames.set(leaseId, name)
      return
    }
    if (name) {
      addD(chargedByName, name, amount)
      return
    }
    unidentified.push([`explicit::${index}`, amount])
  })

  // rekey (single-lease, no ambiguity): direct lease charges map to raw id if the
  // lease is known, else unmatched-lease::<id>; name-only charges with no lease match
  // become unmatched-name::<name>.
  const correctForCompare = new Map(correctByLease)
  const chargedFinal = new Map()
  const names = new Map(tenantNames)

  for (const [leaseId, amount] of chargedByLease) {
    if (tenantNames.has(leaseId)) {
      addD(chargedFinal, leaseId, amount)
    } else {
      const key = `unmatched-lease::${leaseId}`
      names.set(key, chargedLeaseNames.get(leaseId) ?? 'Unknown lease')
      addD(chargedFinal, key, amount)
    }
  }
  for (const [name, amount] of chargedByName) {
    const key = `unmatched-name::${name}`
    names.set(key, name)
    addD(chargedFinal, key, amount)
  }
  for (const [rowId, amount] of unidentified) {
    const key = `id::${rowId}`
    names.set(key, 'Unidentified charge')
    addD(chargedFinal, key, amount)
  }

  return buildResult(correctForCompare, chargedFinal, names, tolerance, ctx)
}

function buildResult(correctByLease, chargedByLease, names, tolerance, ctx) {
  const leaseIds = new Set([...correctByLease.keys(), ...chargedByLease.keys()])
  const tenants = []
  let totalCorrect = new Decimal(0)
  let totalCharged = new Decimal(0)
  let totalOver = new Decimal(0)
  let totalUnder = new Decimal(0)
  let overCount = 0
  let underCount = 0
  let matchCount = 0

  for (const leaseId of leaseIds) {
    const correct = correctByLease.get(leaseId) ?? new Decimal(0)
    const charged = chargedByLease.get(leaseId) ?? new Decimal(0)
    const variance = charged.minus(correct)
    const absVar = variance.abs()
    const direction = classify(variance, tolerance)
    const ms = matchStatus(leaseId, correct, charged)
    tenants.push({
      lease_id: leaseId,
      tenant_name: names.get(leaseId) ?? null,
      match_status: ms.match_status,
      match_note: ms.match_note,
      capveri_correct: correct.toFixed(),
      actual_charged: charged.toFixed(),
      variance: variance.toFixed(),
      direction,
      abs_variance: absVar.toFixed(),
      variance_pct: variancePct(variance, correct),
    })
    totalCorrect = totalCorrect.plus(correct)
    totalCharged = totalCharged.plus(charged)
    if (direction === 'overcharge') {
      totalOver = totalOver.plus(variance)
      overCount += 1
    } else if (direction === 'undercharge') {
      totalUnder = totalUnder.plus(absVar)
      underCount += 1
    } else matchCount += 1
  }

  tenants.sort((a, b) =>
    new Decimal(b.abs_variance).cmp(new Decimal(a.abs_variance))
  )

  return {
    total_capveri_correct: totalCorrect.toFixed(),
    total_actual_charged: totalCharged.toFixed(),
    total_net_variance: totalCharged.minus(totalCorrect).toFixed(),
    total_overcharge: totalOver.toFixed(),
    total_undercharge: totalUnder.toFixed(),
    overcharge_count: overCount,
    undercharge_count: underCount,
    match_count: matchCount,
    tenants,
  }
}

function classify(variance, tolerance) {
  if (variance.abs().lte(tolerance)) return 'match'
  return variance.gt(0) ? 'overcharge' : 'undercharge'
}

function matchStatus(leaseId, correct, charged) {
  if (leaseId.startsWith('id::') || leaseId.startsWith('explicit::'))
    return { match_status: 'needs_review', match_note: 'This charge is missing a tenant name.' }
  if (leaseId.startsWith('ambiguous-name::'))
    return { match_status: 'needs_review', match_note: 'More than one lease matched this tenant name.' }
  if (leaseId.startsWith('unmatched-name::') || leaseId.startsWith('unmatched-lease::'))
    return { match_status: 'needs_review', match_note: 'No lease matched this billed row.' }
  if (!leaseId.startsWith('name::')) return { match_status: 'matched', match_note: null }
  // name:: keys never occur in explicit single-lease flow.
  return { match_status: 'needs_review', match_note: 'More than one lease matched this tenant name.' }
}

function variancePct(variance, correct) {
  if (correct.eq(0)) return null
  return variance
    .div(correct.abs())
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2)
}

function pickRow(t) {
  return {
    lease_id: t.lease_id,
    tenant_name: t.tenant_name,
    match_status: t.match_status,
    match_note: t.match_note,
    capveri_correct: t.capveri_correct,
    actual_charged: t.actual_charged,
    variance: t.variance,
    direction: t.direction,
    abs_variance: t.abs_variance,
    variance_pct: t.variance_pct,
  }
}

function normalizeStoredFindings(findings) {
  return findings
    .map(pickRow)
    .sort((a, b) => new Decimal(b.abs_variance).cmp(new Decimal(a.abs_variance)))
}

function addD(map, key, amount) {
  map.set(key, (map.get(key) ?? new Decimal(0)).plus(amount))
}

// ---------------------------------------------------------------------------
// Dispute lifecycle + authz
// ---------------------------------------------------------------------------

async function runDisputeAuthz() {
  // Cross-party guards (do not require any created entity).
  const tenantToAdmin = await asTenant('/api/v1/disputes', { status: 403 })
  check(
    'tenant is forbidden from admin /disputes list',
    { status: tenantToAdmin.status, code: tenantToAdmin.json?.error?.code },
    { status: 403, code: 'forbidden' }
  )
  const landlordToTenant = await asLandlord('/api/v1/tenant/disputes', { status: 403 })
  check(
    'landlord is forbidden from /tenant/disputes list',
    { status: landlordToTenant.status, code: landlordToTenant.json?.error?.code },
    { status: 403, code: 'forbidden' }
  )

  // Real tenant dispute against a finalized statement.
  const dashboard = await asTenantJson('/api/v1/tenant/dashboard', { status: 200 })
  const statement = (dashboard.statements ?? []).find((s) => s?.id)
  if (!statement) {
    report.skips.push({
      area: 'tenant dispute lifecycle',
      reason: 'no finalized statement available on the tenant dashboard to dispute',
    })
    return
  }

  const created = { disputeId: null }
  try {
    const createRes = await asTenant('/api/v1/tenant/disputes', {
      method: 'POST',
      status: 201,
      soft: true,
      body: {
        statement_id: statement.id,
        description: disputeDescription,
        category: 'calculation_error',
      },
    })
    if (createRes.status === 429) {
      report.skips.push({
        area: 'tenant dispute create',
        reason: 'rate limited (3/day) — a prior run already exercised creation today',
      })
      return
    }
    if (createRes.status !== 201) {
      throw new Error(
        `tenant dispute create returned ${createRes.status}: ${createRes.text.slice(0, 300)}`
      )
    }
    created.disputeId = createRes.json.id
    report.generated.dispute = { id: createRes.json.id, statement_id: statement.id }
    check(
      'tenant dispute created in open state',
      { status: createRes.status, status_value: createRes.json.status },
      { status: 201, status_value: 'open' }
    )

    // Tenant can read own dispute.
    const own = await asTenant(`/api/v1/tenant/disputes/${created.disputeId}`, { status: 200 })
    check(
      'tenant can read own dispute detail',
      { status: own.status, id: own.json?.id },
      { status: 200, id: created.disputeId }
    )

    // IDOR: tenant reading a random dispute id => 404 (own-only scoping).
    const idor = await asTenant(`/api/v1/tenant/disputes/${randomUUID()}`, { status: 404 })
    check(
      'tenant cannot read a non-existent/unowned dispute (404)',
      { status: idor.status },
      { status: 404 }
    )

    // Cross-party: landlord (different org) cannot see this tenant dispute via admin route.
    const landlordView = await asLandlord(`/api/v1/disputes/${created.disputeId}`, { status: 404 })
    check(
      'landlord in a different org gets 404 for tenant dispute (no cross-org leak)',
      { status: landlordView.status },
      { status: 404 }
    )

    // Landlord cannot drive a status transition on a dispute they cannot see.
    const landlordTransition = await asLandlord(
      `/api/v1/disputes/${created.disputeId}/status`,
      {
        method: 'PUT',
        status: 404,
        body: { status: 'under_review', expected_status: 'open' },
      }
    )
    check(
      'landlord cannot transition an unowned/unseen dispute (404)',
      { status: landlordTransition.status },
      { status: 404 }
    )

    report.skips.push({
      area: 'landlord dispute state machine (illegal transitions / 409 concurrency / resolution_summary)',
      reason:
        'PROD_E2E_FIXTURE_SECRET absent and the E2E landlord is in a different org than the E2E tenant, so no landlord-visible real dispute exists to transition. Covered structurally by prod-admin-dispute-lifecycle-scenario.mjs (fixture path) and prod-admin-disputes-negative-scenario.mjs (validation branches).',
    })
  } finally {
    await cleanupDispute(created)
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupComparison(created, period) {
  const failures = []
  for (const rid of created.runIds) {
    // Comparison runs have no DELETE route; they belong to the property and are
    // removed by property cascade. Record for transparency.
    report.cleanup.push({ label: `comparison run ${rid} (removed via property cascade)`, ok: true })
  }
  if (created.batchId) {
    await tryCleanup(failures, 'delete ingestion batch', () =>
      landlordDelete(`/api/v1/ingestion/batches/${created.batchId}`)
    )
  }
  if (created.mappingId && created.propertyId) {
    await tryCleanup(failures, 'delete pool mapping', () =>
      landlordDelete(`/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`)
    )
  }
  if (created.poolId && created.propertyId) {
    await tryCleanup(failures, 'delete expense pool', () =>
      landlordDelete(`/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`)
    )
  }
  if (created.propertyId) {
    await tryCleanup(failures, 'delete property', () =>
      landlordDelete(`/api/v1/properties/${created.propertyId}`)
    )
    await tryCleanup(failures, 'verify property deleted', () =>
      asLandlord(`/api/v1/properties/${created.propertyId}`, { status: 404 })
    )
    // Verify no CY3C properties remain in the org (paged scan). Non-fatal: the
    // per-entity delete + 404 verify above already prove the created property is
    // gone; this scan is an extra org-wide residue guard.
    try {
      const remaining = []
      for (let skip = 0; skip < 1000; skip += 100) {
        const list = await asLandlordJson(
          `/api/v1/properties?skip=${skip}&limit=100`,
          { status: 200 }
        )
        const items = Array.isArray(list?.data) ? list.data : []
        for (const p of items) {
          if (typeof p?.name === 'string' && p.name.startsWith(CY3C)) {
            remaining.push({ id: p.id, name: p.name })
          }
        }
        if (items.length < 100) break
      }
      report.cleanup.push({
        label: 'CY3C property residue scan',
        ok: remaining.length === 0,
        remaining,
      })
      if (remaining.length > 0) {
        failures.push(`CY3C residue: ${remaining.map((p) => p.id).join(', ')}`)
      }
    } catch (error) {
      report.cleanup.push({
        label: 'CY3C property residue scan',
        ok: false,
        error: errorMessage(error),
      })
    }
  }
  if (failures.length > 0) throw new Error(`Comparison cleanup failed: ${failures.join(', ')}`)
}

async function cleanupDispute(created) {
  if (!created.disputeId) return
  const res = await fetch(
    `${apiUrl}/api/v1/tenant/disputes/${created.disputeId}/e2e-cleanup`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${tenantToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ run_id: runId, confirm: 'delete-prod-e2e-dispute' }),
    }
  )
  const text = await res.text()
  const ok = res.status === 200 || res.status === 204
  report.cleanup.push({
    label: `delete tenant dispute ${created.disputeId}`,
    status: res.status,
    ok,
    body_preview: text.slice(0, 200),
  })
  if (!ok) {
    throw new Error(`Dispute cleanup failed (${res.status}): ${text.slice(0, 300)}`)
  }
  // Verify gone.
  const verify = await asTenant(`/api/v1/tenant/disputes/${created.disputeId}`, {
    status: 404,
    recordCleanup: true,
  })
  report.cleanup.push({
    label: `verify dispute ${created.disputeId} deleted`,
    ok: verify.status === 404,
    status: verify.status,
  })
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function asLandlordJson(path, options) {
  return httpJson(landlordToken, path, options)
}
async function asTenantJson(path, options) {
  return httpJson(tenantToken, path, options)
}
async function asLandlord(path, options) {
  return httpExpect(landlordToken, path, options)
}
async function asTenant(path, options) {
  return httpExpect(tenantToken, path, options)
}

async function httpJson(token, path, options) {
  const res = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  if (res.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${res.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

// Does NOT throw on status mismatch when the caller passes a status it wants to
// assert on itself; returns {status,json,text}. Only throws if the network fails.
async function httpExpect(token, path, options) {
  const res = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  const json = parseJsonOrNull(text)
  if (options.status !== undefined && res.status !== options.status) {
    // For dispute-create the caller inspects 429/201 itself; only throw when the
    // caller has not opted into manual handling.
    if (!options.soft) {
      // still return so caller can branch, but record a failed expectation.
      report.checks.push({
        label: `HTTP ${options.method ?? 'GET'} ${path} expected ${options.status}, got ${res.status}`,
        ok: false,
        actual: { status: res.status, body: text.slice(0, 300) },
        expected: { status: options.status },
      })
    }
  }
  return { status: res.status, json, text }
}

async function landlordDelete(path) {
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${landlordToken}` },
  })
  const text = await res.text()
  const ok = res.status === 204
  report.cleanup.push({ path, status: res.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) throw new Error(`DELETE ${path} returned ${res.status}: ${text.slice(0, 300)}`)
}

async function uploadCsv({ propertyId, fileName, csv }) {
  const form = new FormData()
  form.set('property_id', propertyId)
  form.set('source_override', 'yardi')
  form.set('file', new Blob([csv], { type: 'text/csv' }), fileName)
  const res = await fetch(`${apiUrl}/api/v1/ingestion/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${landlordToken}`, accept: 'application/json' },
    body: form,
  })
  const text = await res.text()
  if (res.status !== 200) {
    throw new Error(`upload returned ${res.status}: ${text.slice(0, 300)}`)
  }
  return JSON.parse(text)
}

async function waitForJob(jobId) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < 90_000) {
    const job = await asLandlordJson(`/api/v1/reconciliation/jobs/${jobId}`, { status: 200 })
    last = job
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(`job failed: ${JSON.stringify(job).slice(0, 300)}`)
    await sleep(2_000)
  }
  throw new Error(`job timeout: ${JSON.stringify(last).slice(0, 300)}`)
}

async function tryCleanup(failures, label, op) {
  try {
    await op()
  } catch (error) {
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: errorMessage(error) })
  }
}

async function signIn(email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(`auth failed for ${email}: ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json.access_token
}

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    // Do NOT throw — record and continue so later cases + cleanup still run.
    console.error(`CHECK FAILED: ${label}\n  expected ${stableJson(expected)}\n  got      ${stableJson(actual)}`)
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
        .map(([k, v]) => [k, sortDeep(v)])
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
