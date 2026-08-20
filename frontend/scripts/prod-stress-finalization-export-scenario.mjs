/**
 * PROD E2E STRESS — snapshot finalization lifecycle + export + concurrency.
 *
 * Exercises, against the LIVE production API (api.capveri.com), the
 * reconciliation snapshot state machine and its immutability guarantees:
 *
 *   1. FINALIZATION STATE MACHINE. Create a draft snapshot, capture its stored
 *      totals, finalize it (single-snapshot route), and prove:
 *        - the totals are byte-identical before vs after finalization,
 *        - re-finalize is consistently REJECTED with 409 snapshot_already_finalized
 *          (documents the "reject, not idempotent" contract).
 *
 *   2. IMMUTABILITY ENFORCEMENT AT THE API/DB (not just UI):
 *        - PATCH a finalized snapshot's cell -> 403 snapshot_finalized.
 *        - Re-run recon for the same finalized period -> 409 period_already_finalized
 *          AND the finalized snapshot's totals are unchanged afterward.
 *        - A user-JWT PostgREST definalize (status='draft') is attempted and MUST
 *          update 0 rows (RLS "only draft snapshots can be updated") — proving the
 *          guarantee is enforced at the database.
 *        - There is genuinely NO unfinalize/reopen route: candidate paths are
 *          probed and MUST 404 (route not found).
 *        - Property DELETE with a finalized snapshot -> 409 property_in_finalized_snapshot.
 *
 *   3. CONCURRENCY / RACES:
 *        - On a SECOND draft snapshot, fire two finalize requests nearly
 *          simultaneously (Promise.all). Exactly ONE gets 200; the other gets
 *          409 (already_finalized or finalize_conflict). No double-finalize,
 *          and the snapshot ends finalized exactly once.
 *        - Fire two concurrent recon runs (force_recalculate) for the same
 *          draft period: both jobs complete, and the period ends with exactly
 *          ONE draft snapshot per lease (replace, not duplicate), totals coherent.
 *
 *   4. EXPORT CORRECTNESS (penny-exact):
 *        - Generic CSV export of a finalized snapshot: 200 + text/csv, non-empty,
 *          and the parsed CSV money columns MATCH the snapshot API totals EXACTLY.
 *        - PDF export of a finalized snapshot: 200 + application/pdf, %PDF- magic,
 *          non-trivial size.
 *        - CSV export of a DRAFT snapshot -> 400 snapshot_not_finalized (by design).
 *        - PDF export of a DRAFT snapshot without allow_draft -> 400; with
 *          allow_draft=true -> 200.
 *        - Export of a nonexistent snapshot id -> 404 (both CSV and PDF).
 *
 * Two leases are created so we get two draft snapshots per recon run: lease A is
 * the finalization/immutability/export subject; lease B is the concurrency
 * subject (finalized via the racing path). CLEANUP: finalizing PINS the property
 * (DELETE -> 409, no unfinalize route, RLS blocks the user definalize), so the
 * finally block records every finalized (property_id, snapshot_id) pair in
 * report.residue for the orchestrator (Supabase MCP) to definalize + API-delete.
 * Everything is prefixed "[PROD-TEST]".
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
  `prod-stress-finalization-export-${runId}`
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
  const propertyName = `[PROD-TEST] Finalization Export ${suffix}`
  const poolName = `[PROD-TEST] Operating Pool ${suffix}`
  const tenantAName = `[PROD-TEST] Finalize Subject A ${suffix}`
  const tenantBName = `[PROD-TEST] Concurrency Subject B ${suffix}`
  const periodStart = '2027-01-01'
  const periodEnd = '2027-12-31'

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
        address_line1: '700 Finalization Way',
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
        unit_number: `FIN-A-${suffix.toUpperCase()}`,
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
        unit_number: `FIN-B-${suffix.toUpperCase()}`,
        rentable_sqft: '3000.00',
        usable_sqft: '2700.00',
        floor: 2,
        status: 'occupied',
        space_type: 'office',
      },
    })
    created.unitBId = unitB.id

    // Gross-up NOT applicable: keep the math simple so total_operating maps
    // cleanly and the CSV parity check is unambiguous. base_year 0, no cap.
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
          description: 'Production E2E disposable finalization pool',
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
        end_date: '2031-12-31',
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
        end_date: '2031-12-31',
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
      fileName: `yardi-finalization-${suffix}.csv`,
      csv: [
        'Account,Account Description,Date,Amount,Vendor,Description',
        '6100,Common Area Maintenance,03/15/2027,80000.00,FinCo,Annual CAM',
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

    // -- Initial recon run --------------------------------------------------
    const firstRun = await runRecon(property.id, periodStart, periodEnd)
    created.jobIds.push(firstRun.jobId)
    created.snapshotIds = dedupe([
      ...created.snapshotIds,
      ...firstRun.snapshotIds,
    ])
    check(
      'initial recon produces two draft snapshots (one per lease)',
      {
        status: firstRun.status,
        processed_leases: firstRun.processedLeases,
        snapshot_count: firstRun.snapshotIds.length,
      },
      { status: 'completed', processed_leases: 2, snapshot_count: 2 }
    )

    // Map snapshots to leases.
    const snapById = {}
    for (const id of firstRun.snapshotIds) {
      const snap = await expectJson(
        `/api/v1/reconciliation/snapshots/${id}?include_trace=false`,
        { status: 200 }
      )
      snapById[snap.lease_id] = snap
    }
    const draftA = snapById[leaseA.id]
    const draftB = snapById[leaseB.id]
    check(
      'both snapshots start as draft',
      { a: draftA?.status, b: draftB?.status },
      { a: 'draft', b: 'draft' }
    )

    // ==================================================================
    // (3) CONCURRENCY — duplicate recon on drafts BEFORE any finalize.
    // Two concurrent force_recalculate runs; period must end with exactly
    // one draft per lease (replace, not duplicate).
    // ==================================================================
    const [runC1, runC2] = await Promise.all([
      runRecon(property.id, periodStart, periodEnd),
      runRecon(property.id, periodStart, periodEnd),
    ])
    created.jobIds.push(runC1.jobId, runC2.jobId)
    const afterConcurrentList = await listSnapshots(property.id, periodStart, periodEnd)
    const draftLeaseIds = afterConcurrentList.items
      .filter((s) => s.status === 'draft')
      .map((s) => s.lease_id)
      .sort()
    check(
      'concurrent duplicate recon leaves exactly one draft per lease (no duplicates/orphans)',
      {
        total_snapshots: afterConcurrentList.total,
        draft_count: draftLeaseIds.length,
        distinct_lease_ids: dedupe(draftLeaseIds).length,
        both_jobs_completed:
          runC1.status === 'completed' && runC2.status === 'completed',
      },
      {
        total_snapshots: 2,
        draft_count: 2,
        distinct_lease_ids: 2,
        both_jobs_completed: true,
      }
    )

    // Re-fetch the current (post-concurrency) draft snapshot ids.
    const currentDrafts = {}
    for (const item of afterConcurrentList.items) {
      currentDrafts[item.lease_id] = item.id
    }
    created.snapshotIds = dedupe(afterConcurrentList.items.map((s) => s.id))
    const snapshotAId = currentDrafts[leaseA.id]
    const snapshotBId = currentDrafts[leaseB.id]

    // Capture lease A's full stored totals (immutability baseline).
    const preFinalizeA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}?include_trace=false`,
      { status: 200 }
    )
    const totalsA = snapshotMoney(preFinalizeA)
    report.generated.leaseA_pre_finalize_totals = totalsA

    // ==================================================================
    // (2) EXPORT of a DRAFT (by-design negatives) before finalize.
    // ==================================================================
    const draftCsv = await rawRequest(
      `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/erp?format=csv`
    )
    check(
      'CSV export of a DRAFT snapshot is rejected 400 snapshot_not_finalized',
      { status: draftCsv.status, code: bodyCode(draftCsv.text) },
      { status: 400, code: 'snapshot_not_finalized' }
    )
    const draftPdfNoFlag = await rawRequest(
      `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/pdf`
    )
    check(
      'PDF export of a DRAFT snapshot without allow_draft is rejected 400',
      { status: draftPdfNoFlag.status, code: bodyCode(draftPdfNoFlag.text) },
      { status: 400, code: 'snapshot_not_finalized' }
    )
    const draftPdfFlag = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/pdf?allow_draft=true`,
      { status: 200, contentTypePrefix: 'application/pdf' }
    )
    check(
      'PDF export of a DRAFT snapshot WITH allow_draft=true streams a real PDF',
      {
        status: draftPdfFlag.status,
        content_type: draftPdfFlag.content_type,
        starts_with_pdf: draftPdfFlag.starts_with_pdf,
        byte_length_gt_1000: draftPdfFlag.byte_length > 1000,
      },
      {
        status: 200,
        content_type: 'application/pdf',
        starts_with_pdf: true,
        byte_length_gt_1000: true,
      }
    )

    // ==================================================================
    // (1) FINALIZE lease A (single-snapshot route).
    // ==================================================================
    const finalizeA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}/finalize`,
      { method: 'POST', status: 200 }
    )
    // Record residue IMMEDIATELY — from here the property is pinned.
    report.residue.push({
      property_id: property.id,
      snapshot_id: snapshotAId,
      lease_id: leaseA.id,
      note: 'finalized lease A snapshot',
    })
    check(
      'finalize lease A returns is_finalized=true',
      { is_finalized: finalizeA.is_finalized, status: finalizeA.status },
      { is_finalized: true, status: 'finalized' }
    )

    // Totals must be byte-identical after finalization.
    const postFinalizeA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'finalized totals are byte-identical to the pre-finalize draft totals',
      snapshotMoney(postFinalizeA),
      totalsA
    )
    check(
      'finalized snapshot status is finalized',
      { status: postFinalizeA.status },
      { status: 'finalized' }
    )

    // ==================================================================
    // (1)/(2) RE-FINALIZE + immutability probes on the finalized snapshot.
    // ==================================================================
    const reFinalize = await rawRequest(
      `/api/v1/reconciliation/snapshots/${snapshotAId}/finalize`,
      { method: 'POST' }
    )
    check(
      're-finalize of an already-finalized snapshot is rejected 409 (reject, not idempotent)',
      { status: reFinalize.status, code: bodyCode(reFinalize.text) },
      { status: 409, code: 'snapshot_already_finalized' }
    )

    // Cell PATCH on a finalized snapshot -> 403.
    const cellId = encodeCellId(snapshotAId, 'admin_fee')
    const finalizedCellPatch = await rawRequest(
      `/api/v1/reconciliation/cells/${cellId}`,
      { method: 'PATCH', body: { value: '999.99' } }
    )
    check(
      'cell PATCH on a finalized snapshot is rejected 403 snapshot_finalized',
      { status: finalizedCellPatch.status, code: bodyCode(finalizedCellPatch.text) },
      { status: 403, code: 'snapshot_finalized' }
    )

    // Re-run recon for the finalized period -> 409 period_already_finalized.
    const reReconFinalized = await rawRequest('/api/v1/reconciliation/calculate', {
      method: 'POST',
      body: {
        property_id: property.id,
        period_start: periodStart,
        period_end: periodEnd,
        force_recalculate: true,
      },
    })
    check(
      're-recon of a finalized period is rejected 409 period_already_finalized',
      { status: reReconFinalized.status, code: bodyCode(reReconFinalized.text) },
      { status: 409, code: 'period_already_finalized' }
    )
    // ...and the finalized totals are STILL unchanged after that attempt.
    const afterReReconA = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotAId}?include_trace=false`,
      { status: 200 }
    )
    check(
      'finalized totals survive a rejected re-recon attempt unchanged',
      snapshotMoney(afterReReconA),
      totalsA
    )

    // No unfinalize/reopen route exists — probe candidates, expect 404.
    const unfinalizeProbes = []
    for (const [label, req] of [
      [
        'POST .../unfinalize',
        {
          path: `/api/v1/reconciliation/snapshots/${snapshotAId}/unfinalize`,
          method: 'POST',
        },
      ],
      [
        'POST .../reopen',
        {
          path: `/api/v1/reconciliation/snapshots/${snapshotAId}/reopen`,
          method: 'POST',
        },
      ],
      [
        'DELETE snapshot',
        {
          path: `/api/v1/reconciliation/snapshots/${snapshotAId}`,
          method: 'DELETE',
        },
      ],
      [
        'PATCH snapshot status=draft',
        {
          path: `/api/v1/reconciliation/snapshots/${snapshotAId}`,
          method: 'PATCH',
          body: { status: 'draft' },
        },
      ],
    ]) {
      const res = await rawRequest(req.path, {
        method: req.method,
        ...(req.body ? { body: req.body } : {}),
      })
      unfinalizeProbes.push({ label, status: res.status })
    }
    report.generated.unfinalizeProbes = unfinalizeProbes
    check(
      'no unfinalize/reopen/mutate route exists (all candidate paths return 404)',
      { all_404: unfinalizeProbes.every((p) => p.status === 404) },
      { all_404: true }
    )

    // DB-level immutability: user-JWT PostgREST definalize must update 0 rows.
    const definalize = await attemptDefinalize(snapshotAId)
    report.generated.definalizeViaUserJwt = definalize
    check(
      'user-JWT PostgREST definalize updates 0 rows (immutability enforced at DB/RLS)',
      { http_ok: definalize.http_ok, rows_updated: definalize.rows_updated },
      { http_ok: true, rows_updated: 0 }
    )

    // ==================================================================
    // (4) EXPORT CORRECTNESS on the FINALIZED snapshot (penny-exact).
    // ==================================================================
    const csv = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/erp?format=csv`,
      { status: 200, contentTypePrefix: 'text/csv' }
    )
    const csvText = new TextDecoder().decode(csv.bytes)
    report.generated.csvBody = csvText
    const csvRow = parseGenericCsvRow(csvText)
    check(
      'finalized CSV export is a real non-empty text/csv with the generic header + one data row',
      {
        status: csv.status,
        content_type: csv.content_type,
        has_header: csvText.startsWith('Property,Unit,Tenant'),
        data_rows: csvRow.dataRowCount,
        byte_length_gt_0: csv.byte_length > 0,
      },
      {
        status: 200,
        content_type: 'text/csv',
        has_header: true,
        data_rows: 1,
        byte_length_gt_0: true,
      }
    )
    check(
      'CSV money columns are PENNY-EXACT to the finalized snapshot API totals',
      {
        total_operating_expenses: csvRow.totalExpenses,
        grossed_up_expenses: csvRow.grossedUp,
        base_year_amount: csvRow.baseYear,
        tenant_share_before_cap: csvRow.beforeCap,
        tenant_share_after_cap: csvRow.afterCap,
        admin_fee: csvRow.adminFee,
        total_recovery: csvRow.amountDue,
      },
      {
        total_operating_expenses: totalsA.total_operating_expenses,
        grossed_up_expenses: totalsA.grossed_up_expenses,
        base_year_amount: totalsA.base_year_amount,
        tenant_share_before_cap: totalsA.tenant_share_before_cap,
        tenant_share_after_cap: totalsA.tenant_share_after_cap,
        admin_fee: totalsA.admin_fee,
        total_recovery: totalsA.total_recovery,
      }
    )

    const pdf = await expectBinary(
      `/api/v1/exports/reconciliation/snapshots/${snapshotAId}/export/pdf`,
      { status: 200, contentTypePrefix: 'application/pdf' }
    )
    check(
      'finalized PDF export renders a real non-trivial PDF',
      {
        status: pdf.status,
        content_type: pdf.content_type,
        starts_with_pdf: pdf.starts_with_pdf,
        byte_length_gt_1000: pdf.byte_length > 1000,
      },
      {
        status: 200,
        content_type: 'application/pdf',
        starts_with_pdf: true,
        byte_length_gt_1000: true,
      }
    )

    // Export of a nonexistent snapshot id -> 404 (both formats).
    const bogusId = randomUUID()
    const bogusCsv = await rawRequest(
      `/api/v1/exports/reconciliation/snapshots/${bogusId}/export/erp?format=csv`
    )
    const bogusPdf = await rawRequest(
      `/api/v1/exports/reconciliation/snapshots/${bogusId}/export/pdf`
    )
    check(
      'export of a nonexistent snapshot id returns 404 (CSV and PDF)',
      { csv_status: bogusCsv.status, pdf_status: bogusPdf.status },
      { csv_status: 404, pdf_status: 404 }
    )

    // ==================================================================
    // (3) CONCURRENCY — double-finalize race on lease B's draft.
    // ==================================================================
    const [raceOne, raceTwo] = await Promise.all([
      rawRequest(`/api/v1/reconciliation/snapshots/${snapshotBId}/finalize`, {
        method: 'POST',
      }),
      rawRequest(`/api/v1/reconciliation/snapshots/${snapshotBId}/finalize`, {
        method: 'POST',
      }),
    ])
    // Lease B is now (at most) finalized — record residue regardless of which won.
    report.residue.push({
      property_id: property.id,
      snapshot_id: snapshotBId,
      lease_id: leaseB.id,
      note: 'finalized lease B snapshot (double-finalize race)',
    })
    const raceStatuses = [raceOne.status, raceTwo.status].sort((a, b) => a - b)
    const winners = raceStatuses.filter((s) => s === 200).length
    const losers = raceStatuses.filter((s) => s === 409).length
    check(
      'concurrent double-finalize: exactly one 200 winner, one 409 loser (no double-finalize)',
      { winners, losers, statuses: raceStatuses },
      { winners: 1, losers: 1, statuses: [200, 409] }
    )
    // Snapshot B is finalized exactly once.
    const finalB = await expectJson(
      `/api/v1/reconciliation/snapshots/${snapshotBId}?include_trace=false`,
      { status: 200 }
    )
    const listAfterRace = await listSnapshots(property.id, periodStart, periodEnd)
    check(
      'after double-finalize race the snapshot is finalized once and no duplicate exists',
      {
        status: finalB.status,
        snapshot_count_for_lease_b: listAfterRace.items.filter(
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

/** Parse the generic-CSV single data row into the money columns. */
function parseGenericCsvRow(csvText) {
  const lines = csvText.split(/\r\n|\n/u).filter((l) => l.length > 0)
  const dataLines = lines.slice(1) // drop header
  const cols = splitCsvLine(dataLines[0] ?? '')
  // Header order: Property,Unit,Tenant,Period Start,Period End,Total Expenses,
  // Grossed Up Expenses,Base Year Amount,Tenant Share Before Cap,
  // Tenant Share After Cap,Admin Fee,Amount Due
  return {
    dataRowCount: dataLines.length,
    totalExpenses: cols[5],
    grossedUp: cols[6],
    baseYear: cols[7],
    beforeCap: cols[8],
    afterCap: cols[9],
    adminFee: cols[10],
    amountDue: cols[11],
  }
}

/** Minimal RFC-4180 line splitter (handles quoted fields with commas). */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

// ---------------------------------------------------------------------------
// Cleanup — finalized snapshots pin the property; record residue for the
// orchestrator. Delete only what the user JWT CAN delete without a purge.
// ---------------------------------------------------------------------------
async function cleanup(created, period) {
  const failures = []

  // Document that the user-JWT PostgREST definalize is RLS-blocked (0 rows)
  // for the whole property — the reason we need the orchestrator purge.
  if (created.propertyId) {
    const definalizeAll = await attemptDefinalizeProperty(created.propertyId)
    report.generated.definalizePropertyViaUserJwt = definalizeAll
  }

  const hasResidue = report.residue.length > 0

  // If NOTHING was finalized (early failure), we can fully self-clean.
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
    starts_with_pdf: new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
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
    // Do NOT throw: we want the finally-block residue reporting + cleanup to
    // run and ALL checks to be recorded. Fail the run via report.ok instead.
    report.first_failure = report.first_failure ?? {
      label,
      actual,
      expected,
    }
  }
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
