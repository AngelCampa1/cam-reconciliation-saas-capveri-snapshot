/**
 * PROD E2E STRESS — post-import chain IDEMPOTENCY & CONCURRENCY (Cycle 5C).
 *
 * Exercises, against the LIVE production API (api.capveri.com), the
 * exactly-once / deterministic guarantees of the post-import chain
 * (calculate -> finalize -> export -> email) and the finalized-immutability
 * surface. This goes DEEPER than the Cycle-2 finalization-export run: it
 * targets repeatability (byte-identical outputs across repeated & concurrent
 * calls) and the finalize-then-mutate rejection surface that the earlier run
 * did not cover.
 *
 *   (3) SNAPSHOT IDEMPOTENCY / determinism:
 *        - Run recon TWICE sequentially (force_recalculate) on the same draft
 *          period; the stored per-lease money totals are byte-identical run to
 *          run (deterministic engine), and the period always holds exactly ONE
 *          draft per lease (replace, not accumulate) with no orphan rows.
 *        - Fire FIVE concurrent force_recalculate runs; all complete, and the
 *          period still ends with exactly one draft per lease and coherent
 *          totals (no torn/duplicate snapshot from the race).
 *
 *   (4) EXPORT IDEMPOTENCY:
 *        - The finalized ERP CSV export is fetched 3x sequentially and 2x
 *          concurrently; every response body is BYTE-IDENTICAL (same SHA-256).
 *          A read/format export must be a pure function of the finalized row.
 *
 *   (5) EMAIL SEND IDEMPOTENCY (API-observable contract):
 *        - Finalizing sends the results email exactly once (single 200 finalize).
 *          A repeat finalize is REJECTED 409 snapshot_already_finalized and
 *          therefore CANNOT re-enter the email path — a retried/duplicated
 *          finalize can never double-send. (The sequencer send additionally
 *          carries a per-snapshot Idempotency-Key; that is asserted by code
 *          review in the report, not reachable from the public API.)
 *
 *   (1) DOUBLE / N-WAY FINALIZE:
 *        - FIVE concurrent finalize requests on ONE draft snapshot: exactly one
 *          200 winner, the rest 409 (already_finalized | finalize_conflict). The
 *          snapshot is finalized exactly once and no duplicate row appears.
 *
 *   (7) FINALIZE-THEN-MUTATE (the surface Cycle-2 did not test):
 *        - After finalizing the period, POST /actual-billed/manual for the same
 *          property+period is REJECTED 409 actual_billed_period_finalized.
 *        - A cell PATCH on the finalized snapshot is REJECTED 403 snapshot_finalized
 *          (immutability cross-check).
 *        - A user-JWT PostgREST definalize updates 0 rows (DB/RLS enforced).
 *
 *   (2)/(6) CONCURRENT-CALCULATE and QUEUE RETRY/DLQ are analyzed by code review
 *        in the report (the property-scoped pg_advisory_xact_lock serializes all
 *        financial-evidence mutations; forcing a transient queue failure against
 *        prod would corrupt live data and is intentionally NOT done here).
 *
 * One property, two leases: lease A = idempotency/finalize-then-mutate subject;
 * lease B = the N-way finalize race subject. Everything is prefixed
 * "[PROD-TEST]". Finalizing PINS the property (no unfinalize route, RLS blocks
 * the user definalize), so the finally block records every finalized
 * (property_id, snapshot_id) pair in report.residue for the orchestrator
 * (Supabase MCP, project REDACTED_SUPABASE_PROJECT_REF) to definalize + API-delete.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  `prod-stress-postimport-idempotency-${runId}`
)
await mkdir(outputDir, { recursive: true })

const report = {
  ok: false,
  run_id: runId,
  output_dir: outputDir,
  generated: {},
  checks: [],
  cleanup: [],
  // Finalized (property_id, snapshot_id) pairs the orchestrator must purge.
  residue: [],
}

let token

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
async function runScenario() {
  const suffix = randomUUID().slice(0, 8)
  const propertyName = `[PROD-TEST] Postimport Idempotency ${suffix}`
  const poolName = `[PROD-TEST] Operating Pool ${suffix}`
  const tenantAName = `[PROD-TEST] Idempotency Subject A ${suffix}`
  const tenantBName = `[PROD-TEST] Finalize Race B ${suffix}`
  const periodStart = '2028-01-01'
  const periodEnd = '2028-12-31'

  const created = {
    propertyId: null,
    unitAId: null,
    unitBId: null,
    leaseAId: null,
    leaseBId: null,
    poolId: null,
    mappingId: null,
    batchId: null,
    jobIds: [],
    snapshotIds: [],
  }
  report.generated = {
    propertyName,
    poolName,
    tenantAName,
    tenantBName,
    periodStart,
    periodEnd,
  }

  try {
    // -- Entities ----------------------------------------------------------
    const property = await expectJson('/api/v1/properties', {
      method: 'POST',
      status: 201,
      body: {
        name: propertyName,
        address_line1: '820 Idempotency Blvd',
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

    const unitA = await expectJson(`/api/v1/properties/${property.id}/units`, {
      method: 'POST',
      status: 201,
      body: {
        unit_number: `IDM-A-${suffix.toUpperCase()}`,
        rentable_sqft: '2000.00',
        usable_sqft: '1800.00',
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
        unit_number: `IDM-B-${suffix.toUpperCase()}`,
        rentable_sqft: '3000.00',
        usable_sqft: '2700.00',
        floor: 2,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitBId = unitB.id

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
          description: 'Production E2E disposable idempotency pool',
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

    const leaseA = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unitA.id,
        tenant_name: tenantAName,
        start_date: periodStart,
        end_date: '2032-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '0.20',
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
    created.leaseAId = leaseA.id
    report.generated.leaseAId = leaseA.id

    const leaseB = await expectJson('/api/v1/leases', {
      method: 'POST',
      status: 201,
      body: {
        property_id: property.id,
        unit_id: unitB.id,
        tenant_name: tenantBName,
        start_date: periodStart,
        end_date: '2032-12-31',
        status: 'active',
        recovery_profile: {
          base_year: null,
          base_year_amount: '0.00',
          gross_up_base_year: false,
          pro_rata_share: '0.30',
          cap_type: 'none',
          cap_rate: null,
          admin_fee_percentage: '0.15',
          management_fee_percentage: null,
          excluded_pools: [],
          accounting_basis: 'cash',
          base_year_adjustments: [],
        },
      },
    })
    created.leaseBId = leaseB.id
    report.generated.leaseBId = leaseB.id

    // -- GL ingestion -------------------------------------------------------
    const upload = await uploadCsv({
      propertyId: property.id,
      fileName: `yardi-idempotency-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Common Area Maintenance,03/15/2028,90000.00,IdemCo,Annual CAM',
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

    // ==================================================================
    // (3) SNAPSHOT IDEMPOTENCY — repeated sequential recon is deterministic.
    // ==================================================================
    const firstRun = await runRecon(property.id, periodStart, periodEnd)
    created.jobIds.push(firstRun.jobId)
    check(
      'first recon produces two draft snapshots (one per lease)',
      {
        status: firstRun.status,
        processed_leases: firstRun.processedLeases,
        snapshot_count: firstRun.snapshotIds.length,
      },
      { status: 'completed', processed_leases: 2, snapshot_count: 2 }
    )
    const totalsRun1 = await totalsByLease(property.id, periodStart, periodEnd)
    report.generated.totals_run1 = totalsRun1

    const secondRun = await runRecon(property.id, periodStart, periodEnd)
    created.jobIds.push(secondRun.jobId)
    const totalsRun2 = await totalsByLease(property.id, periodStart, periodEnd)
    report.generated.totals_run2 = totalsRun2
    check(
      'repeated recon is DETERMINISTIC: per-lease money totals byte-identical run to run',
      totalsRun2,
      totalsRun1
    )
    const listAfterRun2 = await listSnapshots(property.id, periodStart, periodEnd)
    check(
      'repeated recon replaces (does not accumulate): exactly one draft per lease, no orphans',
      {
        total: listAfterRun2.total,
        draft_count: listAfterRun2.items.filter((s) => s.status === 'draft')
          .length,
        distinct_leases: dedupe(listAfterRun2.items.map((s) => s.lease_id))
          .length,
      },
      { total: 2, draft_count: 2, distinct_leases: 2 }
    )

    // ==================================================================
    // (3) SNAPSHOT IDEMPOTENCY under CONCURRENCY — five racing force runs.
    // ==================================================================
    const concurrentRuns = await Promise.all(
      Array.from({ length: 5 }, () =>
        runRecon(property.id, periodStart, periodEnd)
      )
    )
    for (const run of concurrentRuns) created.jobIds.push(run.jobId)
    const totalsAfterRace = await totalsByLease(
      property.id,
      periodStart,
      periodEnd
    )
    const listAfterRace = await listSnapshots(property.id, periodStart, periodEnd)
    check(
      'five concurrent recon runs: all complete, still exactly one draft per lease, totals unchanged',
      {
        all_completed: concurrentRuns.every((r) => r.status === 'completed'),
        total: listAfterRace.total,
        draft_count: listAfterRace.items.filter((s) => s.status === 'draft')
          .length,
        distinct_leases: dedupe(listAfterRace.items.map((s) => s.lease_id))
          .length,
        totals_match_run1: stableJson(totalsAfterRace) === stableJson(totalsRun1),
      },
      {
        all_completed: true,
        total: 2,
        draft_count: 2,
        distinct_leases: 2,
        totals_match_run1: true,
      }
    )

    // Resolve the current (post-race) draft snapshot ids per lease.
    const currentDrafts = {}
    for (const item of listAfterRace.items) currentDrafts[item.lease_id] = item.id
    created.snapshotIds = dedupe(listAfterRace.items.map((s) => s.id))
    const snapshotAId = currentDrafts[leaseA.id]
    const snapshotBId = currentDrafts[leaseB.id]

    const preFinalizeA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}?include_trace=false`,
      { status: 200 }
    )
    const totalsA = snapshotMoney(preFinalizeA)
    report.generated.leaseA_pre_finalize_totals = totalsA

    // ==================================================================
    // (5) EMAIL SEND IDEMPOTENCY — finalize sends once; re-finalize 409
    // cannot re-enter the email path.
    // ==================================================================
    const finalizeA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}/finalize`,
      { method: 'POST', status: 200 }
    )
    report.residue.push({
      property_id: property.id,
      snapshot_id: snapshotAId,
      lease_id: leaseA.id,
      note: 'finalized lease A snapshot',
    })
    check(
      'finalize lease A returns is_finalized=true (single email send)',
      { is_finalized: finalizeA.is_finalized, status: finalizeA.status },
      { is_finalized: true, status: 'finalized' }
    )
    const reFinalizeA = await rawRequest(
      `/api/v1/reconciliation/snapshots/${snapshotAId}/finalize`,
      { method: 'POST' }
    )
    check(
      'repeat finalize is 409 snapshot_already_finalized (a retried finalize cannot double-send email)',
      { status: reFinalizeA.status, code: bodyCode(reFinalizeA.text) },
      { status: 409, code: 'snapshot_already_finalized' }
    )

    // ==================================================================
    // (4) EXPORT IDEMPOTENCY — repeated + concurrent CSV export is byte-identical.
    // ==================================================================
    const csvHashes = []
    for (let i = 0; i < 3; i += 1) {
      const csv = await expectBinary(
        `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/erp?format=csv`,
        { status: 200, contentTypePrefix: 'text/csv' }
      )
      csvHashes.push(sha256(csv.bytes))
    }
    const [concCsv1, concCsv2] = await Promise.all([
      expectBinary(
        `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/erp?format=csv`,
        { status: 200, contentTypePrefix: 'text/csv' }
      ),
      expectBinary(
        `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/erp?format=csv`,
        { status: 200, contentTypePrefix: 'text/csv' }
      ),
    ])
    csvHashes.push(sha256(concCsv1.bytes), sha256(concCsv2.bytes))
    report.generated.csv_export_sha256 = csvHashes[0]
    check(
      'ERP CSV export is byte-identical across 3 sequential + 2 concurrent fetches (idempotent read)',
      {
        distinct_hashes: dedupe(csvHashes).length,
        all_match_first: csvHashes.every((h) => h === csvHashes[0]),
      },
      { distinct_hashes: 1, all_match_first: true }
    )

    // ==================================================================
    // (7) FINALIZE-THEN-MUTATE — the finalized period rejects new billing.
    // ==================================================================
    const manualBilledFinalized = await rawRequest('/api/v1/actual-billed/manual', {
      method: 'POST',
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_billed: '1234.56',
      },
    })
    check(
      'actual-billed manual entry on a finalized period is rejected 409 actual_billed_period_finalized',
      {
        status: manualBilledFinalized.status,
        code: bodyCode(manualBilledFinalized.text),
      },
      { status: 409, code: 'actual_billed_period_finalized' }
    )

    const cellId = encodeCellId(snapshotAId, 'admin_fee')
    const finalizedCellPatch = await rawRequest(
      `/api/v1/reconciliation/cells/${cellId}`,
      { method: 'PATCH', body: { value: '999.99' } }
    )
    check(
      'cell PATCH on a finalized snapshot is rejected 403 snapshot_finalized',
      {
        status: finalizedCellPatch.status,
        code: bodyCode(finalizedCellPatch.text),
      },
      { status: 403, code: 'snapshot_finalized' }
    )

    const definalize = await attemptDefinalize(snapshotAId)
    report.generated.definalizeViaUserJwt = definalize
    check(
      'user-JWT PostgREST definalize updates 0 rows (immutability enforced at DB/RLS)',
      { http_ok: definalize.http_ok, rows_updated: definalize.rows_updated },
      { http_ok: true, rows_updated: 0 }
    )

    // Finalized totals survive the rejected mutation attempts unchanged.
    const afterMutateA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'finalized totals are unchanged after rejected billing + cell + definalize attempts',
      snapshotMoney(afterMutateA),
      totalsA
    )

    // ==================================================================
    // (1) N-WAY FINALIZE RACE — five concurrent finalize on lease B's draft.
    // ==================================================================
    const raceResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        rawRequest(`/api/v1/reconciliation/snapshots/${snapshotBId}/finalize`, {
          method: 'POST',
        })
      )
    )
    report.residue.push({
      property_id: property.id,
      snapshot_id: snapshotBId,
      lease_id: leaseB.id,
      note: 'finalized lease B snapshot (N-way finalize race)',
    })
    const raceStatuses = raceResults.map((r) => r.status).sort((a, b) => a - b)
    const winners = raceStatuses.filter((s) => s === 200).length
    const losers = raceStatuses.filter((s) => s === 409).length
    report.generated.finalize_race_statuses = raceStatuses
    check(
      'five concurrent finalize: exactly one 200 winner, rest 409 (no double-finalize)',
      {
        winners,
        losers,
        other: raceStatuses.filter((s) => s !== 200 && s !== 409).length,
      },
      { winners: 1, losers: 4, other: 0 }
    )
    const listAfterFinalizeRace = await listSnapshots(
      property.id,
      periodStart,
      periodEnd
    )
    const finalB = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotBId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'after N-way finalize race lease B is finalized exactly once, no duplicate row',
      {
        status: finalB.status,
        snapshot_count_for_lease_b: listAfterFinalizeRace.items.filter(
          (s) => s.lease_id === leaseB.id
        ).length,
      },
      { status: 'finalized', snapshot_count_for_lease_b: 1 }
    )
  } finally {
    await cleanup(created, { periodStart, periodEnd })
  }
}

// ---------------------------------------------------------------------------
// Recon helpers
// ---------------------------------------------------------------------------
async function runRecon(propertyId, periodStart, periodEnd) {
  const job = await expectJson('/api/v1/reconciliation/calculate', {
    method: 'POST',
    status: 202,
    body: {
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
      force_recalculate: true,
    },
  })
  const done = await waitForJob(job.job_id)
  return {
    jobId: job.job_id,
    status: done.status,
    processedLeases: done.processed_leases,
    snapshotIds: done.snapshot_ids ?? [],
  }
}

async function listSnapshots(propertyId, periodStart, periodEnd) {
  return expectJson(
    `/api/v1/reconciliation/snapshots?property_id=${propertyId}&period_start=${periodStart}&period_end=${periodEnd}&page=1&size=50`,
    { status: 200 }
  )
}

/** Money totals keyed by lease id, order-independent (for determinism checks). */
async function totalsByLease(propertyId, periodStart, periodEnd) {
  const list = await listSnapshots(propertyId, periodStart, periodEnd)
  const byLease = {}
  for (const item of list.items) {
    const snap = await expectJson(
      `/api/v1/reconciliation/snapshots/${item.id}?include_trace=false`,
      { status: 200 }
    )
    byLease[snap.lease_id] = snapshotMoney(snap)
  }
  return byLease
}

function snapshotMoney(snapshot) {
  if (!snapshot) return { missing: true }
  return {
    total_operating_expenses: snapshot.total_operating_expenses,
    grossed_up_expenses: snapshot.grossed_up_expenses,
    base_year_amount: snapshot.base_year_amount,
    tenant_share_before_cap: snapshot.tenant_share_before_cap,
    tenant_share_after_cap: snapshot.tenant_share_after_cap,
    admin_fee: snapshot.admin_fee,
    total_recovery: snapshot.total_recovery,
  }
}

// ---------------------------------------------------------------------------
// Cleanup — finalized snapshots pin the property; record residue for the
// orchestrator. Delete only what the user JWT CAN delete without a purge.
// ---------------------------------------------------------------------------
async function cleanup(created, period) {
  const failures = []

  if (created.propertyId) {
    const definalizeAll = await attemptDefinalizeProperty(created.propertyId)
    report.generated.definalizePropertyViaUserJwt = definalizeAll
  }

  const hasResidue = report.residue.length > 0

  if (created.batchId) {
    const blocked = await attemptCleanup(
      failures,
      'delete ingestion batch',
      () => deleteEmpty(`/api/v1/ingestion/batches/${created.batchId}`),
      { residualOn: 'batch_in_finalized_reconciliation', id: created.batchId }
    )
    if (!blocked) {
      await attemptCleanup(failures, 'verify ingestion batch deleted', () =>
        expectCleanupStatus(`/api/v1/ingestion/batches/${created.batchId}`, {
          status: 404,
        })
      )
    }
  }
  if (created.mappingId && created.propertyId) {
    await attemptCleanup(failures, 'delete pool mapping', () =>
      deleteEmpty(
        `/api/v1/properties/${created.propertyId}/pool-mappings/${created.mappingId}`
      )
    )
  }
  if (created.poolId && created.propertyId) {
    await attemptCleanup(
      failures,
      'delete expense pool',
      () =>
        deleteEmpty(
          `/api/v1/properties/${created.propertyId}/expense-pools/${created.poolId}`
        ),
      { residualOn: 'property_in_finalized_snapshot', id: created.poolId }
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
      await attemptCleanup(failures, 'verify snapshots deleted by cascade', () =>
        expectNoSnapshots(created.propertyId, period)
      )
    }
  }

  if (hasResidue) {
    // Known immutability block. Orchestrator purge recipe (Supabase MCP,
    // project REDACTED_SUPABASE_PROJECT_REF), for each residue pair:
    //   update reconciliation_snapshots set status='draft', finalized_at=null
    //   where id='<snapshot_id>' and property_id='<property_id>';
    // then DELETE the property via the API as this user (cascades the rest).
    report.cleanup_requires_service_role_purge = true
  }
  if (failures.length > 0) {
    throw new Error(`Cleanup failed: ${failures.join(', ')}`)
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
      report.cleanup.push({
        label,
        ok: false,
        blocked_by_design: options.residualOn,
        error: message.slice(0, 300),
      })
      return true
    }
    failures.push(label)
    report.cleanup.push({ label, ok: false, error: message })
    return false
  }
}

/** Definalize a single snapshot via user-JWT PostgREST (expect 0 rows). */
async function attemptDefinalize(snapshotId) {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reconciliation_snapshots?id=eq.${snapshotId}&status=eq.finalized`,
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
      http_status: response.status,
      http_ok: response.ok,
      rows_updated: updated,
    }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

async function attemptDefinalizeProperty(propertyId) {
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
      http_status: response.status,
      http_ok: response.ok,
      rows_updated: updated,
      rls_blocked: response.ok && updated === 0,
    }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

// ---------------------------------------------------------------------------
// Low-level HTTP
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

/** Fire a request and return status+text WITHOUT asserting the status. */
async function rawRequest(path, options = {}) {
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
  return { status: response.status, text }
}

async function expectBinary(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: options.contentTypePrefix,
    },
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (response.status !== options.status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${new TextDecoder().decode(bytes.slice(0, 500))}`
    )
  }
  if (!contentType.startsWith(options.contentTypePrefix)) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned content-type ${contentType}, expected ${options.contentTypePrefix}`
    )
  }
  return {
    status: response.status,
    content_type: contentType.split(';')[0].trim(),
    byte_length: bytes.byteLength,
    bytes,
  }
}

async function expectCleanupStatus(path, options) {
  const response = await fetchRetry(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const text = await response.text()
  const ok = response.status === options.status
  report.cleanup.push({ path, status: response.status, ok, body_preview: text.slice(0, 200) })
  if (!ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}, expected ${options.status}: ${text.slice(0, 500)}`
    )
  }
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected)
  report.checks.push({ label, ok, actual, expected })
  if (!ok) {
    report.first_failure = report.first_failure ?? { label, actual, expected }
  }
}

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function bodyCode(text) {
  try {
    const parsed = JSON.parse(text)
    return parsed?.error?.code ?? parsed?.code ?? parsed?.detail ?? null
  } catch {
    return null
  }
}

function dedupe(list) {
  return [...new Set(list)]
}

function encodeCellId(snapshotId, fieldName) {
  return Buffer.from(`${snapshotId}:${fieldName}`, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
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
// Entry point
// ---------------------------------------------------------------------------
try {
  token = await signInWithPassword()
  await runScenario()
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok)
} catch (error) {
  report.fatal_error = errorMessage(error)
} finally {
  await writeFile(
    resolve(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(JSON.stringify(report, null, 2))
}

if (!report.ok) process.exitCode = 1
