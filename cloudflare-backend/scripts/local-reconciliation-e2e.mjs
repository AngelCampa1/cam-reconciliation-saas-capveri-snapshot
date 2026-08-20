import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8837";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-12-31";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const CALCULATE_KEYS = ["job_id", "status", "message"];
const JOB_KEYS = [
  "job_id",
  "status",
  "property_id",
  "period_start",
  "period_end",
  "total_leases",
  "processed_leases",
  "progress_percentage",
  "snapshot_ids",
  "error_message",
  "potential_recovery_total",
  "created_at",
  "started_at",
  "completed_at",
];
const SNAPSHOT_LIST_KEYS = ["items", "total", "page", "page_size"];
const SNAPSHOT_SUMMARY_KEYS = [
  "id",
  "property_id",
  "lease_id",
  "period_start_date",
  "period_end_date",
  "status",
  "total_recovery",
  "admin_fee",
  "is_finalized",
  "finalized_at",
  "created_at",
  "tenant_name",
  "property_name",
];
const CELL_UPDATE_KEYS = [
  "id",
  "snapshot_id",
  "field_name",
  "value",
  "is_manual_override",
  "updated_at",
  "updated_by",
];
const FINALIZE_KEYS = [
  "id",
  "status",
  "finalized_at",
  "finalized_by_user_id",
  "is_finalized",
  "message",
];
const BATCH_FINALIZE_KEYS = [
  "total_attempted",
  "total_succeeded",
  "total_failed",
  "results",
  "message",
];
const BATCH_FINALIZE_RESULT_KEYS = ["snapshot_id", "success", "error_message"];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local reconciliation E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
  );
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const timeoutMs = parsePositiveInteger(
    args["timeout-ms"] ?? process.env.npm_config_timeout_ms ?? "180000",
    "timeout-ms",
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ]));

  if (!anonKey) fail("Missing local Supabase anon key.");
  if (process.env.CI) fail("Refusing to run local reconciliation E2E in CI.");

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  let account;
  let runError;
  let cleanupError;
  let closeError;

  try {
    account = await seedDisposableLocalAccount({
      supabaseUrl,
      anonKey,
      databaseUrl,
    });
    await runOnce({ baseUrl, sql, account, timeoutMs });
  } catch (error) {
    runError = error;
  } finally {
    try {
      if (account) {
        await cleanupGeneratedRows(sql, account);
        await assertCleanupComplete(sql, account);
      }
    } catch (error) {
      cleanupError ??= error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError ??= error;
      } finally {
        try {
          await worker.close();
        } catch (error) {
          closeError ??= error;
        }
      }
    }
  }

  const postRunError = cleanupError ?? closeError;
  if (runError && postRunError) {
    console.error(
      `Local reconciliation cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
    );
  }
  if (runError) throw runError;
  if (postRunError) throw postRunError;
}

async function runOnce({ baseUrl, sql, account, timeoutMs }) {
  const authHeaders = { authorization: `Bearer ${account.token}` };
  const calculate = await expectJson(
    `${baseUrl}/api/v1/reconciliation/calculate`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        property_id: account.propertyId,
        period_start: PERIOD_START,
        period_end: PERIOD_END,
        force_recalculate: true,
      }),
      status: 202,
    },
  );
  assertExactKeys(calculate, CALCULATE_KEYS, "calculate response");
  assertUuid(calculate.job_id, "calculation job_id");
  assertJsonEqual(
    {
      status: calculate.status,
      message: calculate.message,
    },
    {
      status: "pending",
      message: `Reconciliation calculation started. Use job_id ${calculate.job_id} to check status.`,
    },
    "calculate response summary",
  );
  account.jobIds.push(calculate.job_id);

  const job = await pollJobCompleted({
    baseUrl,
    authHeaders,
    jobId: calculate.job_id,
    timeoutMs,
  });
  assertExactKeys(job, JOB_KEYS, "job response");
  assertJsonEqual(
    {
      job_id: job.job_id,
      status: job.status,
      property_id: job.property_id,
      period_start: job.period_start,
      period_end: job.period_end,
      total_leases: job.total_leases,
      processed_leases: job.processed_leases,
      progress_percentage: job.progress_percentage,
      error_message: job.error_message,
      potential_recovery_total: job.potential_recovery_total,
    },
    {
      job_id: calculate.job_id,
      status: "completed",
      property_id: account.propertyId,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      total_leases: 2,
      processed_leases: 2,
      progress_percentage: 100,
      error_message: null,
      potential_recovery_total: "1992.02",
    },
    "job response summary",
  );
  assertParseableIso(job.created_at, "job created_at");
  assertParseableIso(job.started_at, "job started_at");
  assertParseableIso(job.completed_at, "job completed_at");
  assert(job.total_leases === 2, "job total lease count mismatch");
  assert(job.processed_leases === 2, "job processed lease count mismatch");
  assert(job.progress_percentage === 100, "job progress mismatch");
  assert(job.snapshot_ids.length === 2, "job snapshot id count mismatch");
  account.snapshotIds.push(...job.snapshot_ids);
  assert(
    job.potential_recovery_total === "1992.02",
    "job potential recovery mismatch",
  );

  const snapshots = await expectJson(
    `${baseUrl}/api/v1/reconciliation/snapshots?property_id=${account.propertyId}&period_start=${PERIOD_START}&period_end=${PERIOD_END}&is_finalized=false&sort_by=tenant_name&sort_order=asc&page=1&size=10`,
    { headers: authHeaders, status: 200 },
  );
  assertExactKeys(snapshots, SNAPSHOT_LIST_KEYS, "snapshot list");
  assert(snapshots.total === 2, "snapshot list total mismatch");
  assertJsonEqual(
    {
      total: snapshots.total,
      page: snapshots.page,
      page_size: snapshots.page_size,
      item_count: snapshots.items.length,
    },
    { total: 2, page: 1, page_size: 10, item_count: 2 },
    "snapshot list envelope",
  );
  for (const [index, item] of snapshots.items.entries()) {
    assertExactKeys(item, SNAPSHOT_SUMMARY_KEYS, `snapshot list item ${index}`);
  }
  const listedFullSnapshot = snapshots.items.find(
    (item) => item.tenant_name === "Reconcile Tenant",
  );
  const listedPartialSnapshot = snapshots.items.find(
    (item) => item.tenant_name === "Partial Period Tenant",
  );
  assert(listedFullSnapshot, "missing full-period snapshot");
  assert(listedPartialSnapshot, "missing partial-period snapshot");
  assert(
    job.snapshot_ids.includes(listedFullSnapshot.id),
    "full snapshot id missing from job",
  );
  assert(
    job.snapshot_ids.includes(listedPartialSnapshot.id),
    "partial snapshot id missing from job",
  );
  assert(
    listedFullSnapshot.total_recovery === "1437.50",
    "listed full total recovery mismatch",
  );
  assert(
    listedPartialSnapshot.total_recovery === "554.52",
    "listed partial total recovery mismatch",
  );
  assertSnapshotSummary(listedFullSnapshot, {
    id: listedFullSnapshot.id,
    property_id: account.propertyId,
    lease_id: account.leaseIds[0],
    period_start_date: PERIOD_START,
    period_end_date: PERIOD_END,
    status: "draft",
    total_recovery: "1437.50",
    admin_fee: "187.50",
    is_finalized: false,
    finalized_at: null,
    tenant_name: "Reconcile Tenant",
    property_name: "Local Reconciliation E2E Tower",
  });
  assertSnapshotSummary(listedPartialSnapshot, {
    id: listedPartialSnapshot.id,
    property_id: account.propertyId,
    lease_id: account.leaseIds[1],
    period_start_date: PERIOD_START,
    period_end_date: PERIOD_END,
    status: "draft",
    total_recovery: "554.52",
    admin_fee: "50.41",
    is_finalized: false,
    finalized_at: null,
    tenant_name: "Partial Period Tenant",
    property_name: "Local Reconciliation E2E Tower",
  });

  const snapshot = await expectJson(
    `${baseUrl}/api/v1/reconciliation/snapshots/${listedFullSnapshot.id}`,
    { headers: authHeaders, status: 200 },
  );
  assert(snapshot.status === "draft", "snapshot should start draft");
  assert(
    snapshot.total_operating_expenses === "12500.00",
    "operating expense mismatch",
  );
  assert(
    snapshot.grossed_up_expenses === "12500.00",
    "grossed-up expense mismatch",
  );
  assert(
    snapshot.tenant_share_before_cap === "1250.00",
    "tenant share before cap mismatch",
  );
  assert(
    snapshot.tenant_share_after_cap === "1250.00",
    "tenant share after cap mismatch",
  );
  assert(snapshot.admin_fee === "187.50", "admin fee mismatch");
  assert(snapshot.total_recovery === "1437.50", "total recovery mismatch");
  assert(Array.isArray(snapshot.calculation_trace), "trace should be an array");
  assert(snapshot.calculation_trace.length > 0, "trace should be non-empty");
  assertLeaseTermsSnapshot(
    normalizeJsonObject(snapshot.lease_terms_snapshot),
    expectedLeaseTerms(account, {
      tenantName: "Reconcile Tenant",
      proRataShare: "0.1",
      adminFeePercentage: "0.15",
      prorationFactor: "1",
    }),
    "full snapshot response lease terms",
  );

  const partialSnapshot = await expectJson(
    `${baseUrl}/api/v1/reconciliation/snapshots/${listedPartialSnapshot.id}`,
    { headers: authHeaders, status: 200 },
  );
  const partialLeaseTerms = normalizeJsonObject(
    partialSnapshot.lease_terms_snapshot,
  );
  assert(
    partialSnapshot.status === "draft",
    "partial snapshot should start draft",
  );
  assert(
    partialSnapshot.tenant_share_before_cap === "504.11",
    "partial tenant share before cap mismatch",
  );
  assert(
    partialSnapshot.tenant_share_after_cap === "504.11",
    "partial tenant share after cap mismatch",
  );
  assert(partialSnapshot.admin_fee === "50.41", "partial admin fee mismatch");
  assert(
    partialSnapshot.total_recovery === "554.52",
    "partial total recovery mismatch",
  );
  assert(
    partialLeaseTerms.proration_factor === "0.50410959",
    "partial proration factor mismatch",
  );
  assertLeaseTermsSnapshot(
    partialLeaseTerms,
    expectedLeaseTerms(account, {
      tenantName: "Partial Period Tenant",
      proRataShare: "0.08",
      adminFeePercentage: "0.1",
      prorationFactor: "0.50410959",
    }),
    "partial snapshot response lease terms",
  );

  const noTrace = await expectJson(
    `${baseUrl}/api/v1/reconciliation/snapshots/${listedFullSnapshot.id}?include_trace=false`,
    { headers: authHeaders, status: 200 },
  );
  assert(
    noTrace.calculation_trace.length === 0,
    "include_trace=false should strip trace",
  );
  assertJsonEqual(
    {
      id: noTrace.id,
      status: noTrace.status,
      total_recovery: noTrace.total_recovery,
      calculation_trace: noTrace.calculation_trace,
      lease_terms_snapshot: normalizeJsonObject(noTrace.lease_terms_snapshot),
    },
    {
      id: listedFullSnapshot.id,
      status: "draft",
      total_recovery: "1437.50",
      calculation_trace: [],
      lease_terms_snapshot: expectedLeaseTerms(account, {
        tenantName: "Reconcile Tenant",
        proRataShare: "0.1",
        adminFeePercentage: "0.15",
        prorationFactor: "1",
      }),
    },
    "include_trace=false snapshot detail",
  );

  const cellId = encodeCellId(listedFullSnapshot.id, "total_recovery");
  const patched = await expectJson(
    `${baseUrl}/api/v1/reconciliation/cells/${cellId}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ value: "1444.44" }),
      status: 200,
    },
  );
  assertExactKeys(patched, CELL_UPDATE_KEYS, "patched cell");
  assert(
    patched.snapshot_id === listedFullSnapshot.id,
    "patched snapshot mismatch",
  );
  assert(patched.field_name === "total_recovery", "patched field mismatch");
  assert(patched.value === "1444.44", "patched value mismatch");
  assertJsonEqual(
    {
      id: patched.id,
      snapshot_id: patched.snapshot_id,
      field_name: patched.field_name,
      value: patched.value,
      is_manual_override: patched.is_manual_override,
      updated_by: patched.updated_by,
    },
    {
      id: cellId,
      snapshot_id: listedFullSnapshot.id,
      field_name: "total_recovery",
      value: "1444.44",
      is_manual_override: true,
      updated_by: account.userId,
    },
    "patched cell summary",
  );
  assertParseableIso(patched.updated_at, "patched cell updated_at");

  const dbDraft = await verifyDraftSnapshot(sql, {
    leaseIds: account.leaseIds,
    organizationId: account.organizationId,
    snapshotId: listedFullSnapshot.id,
  });
  const dbPartialDraft = await verifyPartialDraftSnapshot(sql, {
    leaseIds: account.leaseIds,
    organizationId: account.organizationId,
    snapshotId: listedPartialSnapshot.id,
  });

  const finalized = await expectJson(
    `${baseUrl}/api/v1/reconciliation/snapshots/${listedFullSnapshot.id}/finalize`,
    {
      method: "POST",
      headers: authHeaders,
      status: 200,
    },
  );
  assertExactKeys(finalized, FINALIZE_KEYS, "finalize response");
  assert(finalized.is_finalized === true, "finalize response mismatch");
  assert(finalized.status === "finalized", "finalized status mismatch");
  assertJsonEqual(
    {
      id: finalized.id,
      status: finalized.status,
      finalized_by_user_id: finalized.finalized_by_user_id,
      is_finalized: finalized.is_finalized,
      message: finalized.message,
    },
    {
      id: listedFullSnapshot.id,
      status: "finalized",
      finalized_by_user_id: account.userId,
      is_finalized: true,
      message: "Snapshot finalized successfully",
    },
    "finalize response summary",
  );
  assertParseableIso(finalized.finalized_at, "finalize finalized_at");

  const editFinalized = await expectJson(
    `${baseUrl}/api/v1/reconciliation/cells/${cellId}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ value: "1500.00" }),
      status: 403,
    },
  );
  assertJsonEqual(
    editFinalized,
    {
      detail:
        "Cannot edit finalized reconciliation snapshot. Snapshot is immutable.",
      error: {
        code: "snapshot_finalized",
        message:
          "Cannot edit finalized reconciliation snapshot. Snapshot is immutable.",
      },
    },
    "finalized edit error body",
  );

  const batchFinalized = await expectJson(
    `${baseUrl}/api/v1/reconciliation/snapshots/finalize-batch`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        property_id: account.propertyId,
        period_start: PERIOD_START,
        period_end: PERIOD_END,
      }),
      status: 200,
    },
  );
  assertExactKeys(batchFinalized, BATCH_FINALIZE_KEYS, "batch finalize");
  assert(
    batchFinalized.total_attempted === 1,
    "batch finalize attempted mismatch",
  );
  assert(
    batchFinalized.total_succeeded === 1,
    "batch finalize success mismatch",
  );
  assert(batchFinalized.total_failed === 0, "batch finalize failure mismatch");
  assert(batchFinalized.results.length === 1, "batch finalize result count");
  assertExactKeys(
    batchFinalized.results[0],
    BATCH_FINALIZE_RESULT_KEYS,
    "batch finalize result 0",
  );
  assertJsonEqual(
    {
      total_attempted: batchFinalized.total_attempted,
      total_succeeded: batchFinalized.total_succeeded,
      total_failed: batchFinalized.total_failed,
      results: batchFinalized.results,
      message: batchFinalized.message,
    },
    {
      total_attempted: 1,
      total_succeeded: 1,
      total_failed: 0,
      results: [
        {
          snapshot_id: listedPartialSnapshot.id,
          success: true,
          error_message: null,
        },
      ],
      message: "All 1 snapshots finalized successfully",
    },
    "batch finalize response",
  );

  const dbFinal = await verifyFinalizedSnapshot(sql, {
    organizationId: account.organizationId,
    snapshotId: listedFullSnapshot.id,
    userId: account.userId,
  });
  const dbPartialFinal = await verifyFinalizedSnapshot(sql, {
    organizationId: account.organizationId,
    snapshotId: listedPartialSnapshot.id,
    userId: account.userId,
  });
  const dbCampaign = await verifyFinalizedCampaign(sql, {
    organizationId: account.organizationId,
    propertyId: account.propertyId,
    userId: account.userId,
    periodYear: 2026,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: baseUrl,
        property_id: account.propertyId,
        job_id: calculate.job_id,
        full_snapshot_id: listedFullSnapshot.id,
        partial_snapshot_id: listedPartialSnapshot.id,
        potential_recovery_total: job.potential_recovery_total,
        draft_verified: dbDraft,
        partial_draft_verified: dbPartialDraft,
        finalized_verified: dbFinal,
        partial_finalized_verified: dbPartialFinal,
        campaign_verified: dbCampaign,
      },
      null,
      2,
    ),
  );
}

async function pollJobCompleted(input) {
  const deadline = Date.now() + input.timeoutMs;
  let lastJob = null;

  while (Date.now() < deadline) {
    const job = await expectJson(
      `${input.baseUrl}/api/v1/reconciliation/jobs/${input.jobId}`,
      { headers: input.authHeaders, status: 200 },
    );
    lastJob = job;

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      fail(
        `Reconciliation job failed: ${job.error_message ?? "unknown error"}`,
      );
    }

    await delay(2_000);
  }

  fail(
    `Timed out waiting for reconciliation job ${input.jobId}; last status ${
      lastJob?.status ?? "unknown"
    }`,
  );
}

async function verifyDraftSnapshot(sql, input) {
  const rows = await sql`
    select
      status,
      total_operating_expenses::text,
      grossed_up_expenses::text,
      tenant_share_before_cap::text,
      tenant_share_after_cap::text,
      admin_fee::text,
      total_recovery::text,
      calculation_trace,
      manual_overrides,
      pool_breakdowns,
      lease_terms_snapshot,
      engine_version,
      trace_checksum
    from reconciliation_snapshots
    where id = ${input.snapshotId}
      and organization_id = ${input.organizationId}
  `;
  const row = rows[0];
  const calculationTrace = normalizeJsonArray(row?.calculation_trace);
  const manualOverrides = normalizeJsonObject(row?.manual_overrides);
  const poolBreakdowns = normalizeJsonArray(row?.pool_breakdowns);
  assert(row, "draft snapshot DB row should exist");
  assert(row.status === "draft", "DB snapshot status should be draft");
  assert(
    row.total_operating_expenses === "12500.00",
    "DB operating expense mismatch",
  );
  assert(row.total_recovery === "1444.44", "DB manual total recovery mismatch");
  assert(
    manualOverrides.total_recovery?.value === "1444.44",
    "DB manual override mismatch",
  );
  assert(Array.isArray(calculationTrace), "DB trace should be an array");
  assert(calculationTrace.length > 0, "DB trace should be non-empty");
  assert(
    Array.isArray(poolBreakdowns),
    "DB pool breakdowns should be an array",
  );
  assertPoolBreakdown(
    poolBreakdowns,
    {
      pool_name: "Operating Expenses",
      pool_type: "operating",
      recovery: "1437.50",
    },
    "full snapshot DB pool breakdown",
  );
  assertLeaseTermsSnapshot(
    normalizeJsonObject(row.lease_terms_snapshot),
    expectedLeaseTerms(input, {
      tenantName: "Reconcile Tenant",
      proRataShare: "0.1",
      adminFeePercentage: "0.15",
      prorationFactor: "1",
    }),
    "full snapshot DB lease terms",
  );
  assert(
    row.engine_version === "cloudflare-reconciliation-v1",
    "engine version mismatch",
  );
  assert(/^[a-f0-9]{64}$/i.test(row.trace_checksum), "trace checksum mismatch");

  return {
    status: row.status,
    total_recovery: row.total_recovery,
    pool_recovery: poolBreakdowns[0]?.recovery,
  };
}

async function verifyPartialDraftSnapshot(sql, input) {
  const rows = await sql`
    select
      status,
      tenant_share_before_cap::text,
      tenant_share_after_cap::text,
      admin_fee::text,
      total_recovery::text,
      calculation_trace,
      pool_breakdowns,
      lease_terms_snapshot
    from reconciliation_snapshots
    where id = ${input.snapshotId}
      and organization_id = ${input.organizationId}
  `;
  const row = rows[0];
  const calculationTrace = normalizeJsonArray(row?.calculation_trace);
  const poolBreakdowns = normalizeJsonArray(row?.pool_breakdowns);
  const leaseTerms = normalizeJsonObject(row?.lease_terms_snapshot);
  assert(row, "partial draft snapshot DB row should exist");
  assert(row.status === "draft", "partial DB snapshot status should be draft");
  assert(
    row.tenant_share_before_cap === "504.11",
    "partial DB tenant share before cap mismatch",
  );
  assert(
    row.tenant_share_after_cap === "504.11",
    "partial DB tenant share after cap mismatch",
  );
  assert(row.admin_fee === "50.41", "partial DB admin fee mismatch");
  assert(row.total_recovery === "554.52", "partial DB total recovery mismatch");
  assert(
    leaseTerms.proration_factor === "0.50410959",
    "partial DB proration factor mismatch",
  );
  assert(
    Array.isArray(calculationTrace),
    "partial DB trace should be an array",
  );
  assert(calculationTrace.length > 0, "partial DB trace should be non-empty");
  assert(
    Array.isArray(poolBreakdowns),
    "partial DB pool breakdowns should be an array",
  );
  assertPoolBreakdown(
    poolBreakdowns,
    {
      pool_name: "Operating Expenses",
      pool_type: "operating",
      recovery: "554.52",
    },
    "partial snapshot DB pool breakdown",
  );
  assertLeaseTermsSnapshot(
    leaseTerms,
    expectedLeaseTerms(input, {
      tenantName: "Partial Period Tenant",
      proRataShare: "0.08",
      adminFeePercentage: "0.1",
      prorationFactor: "0.50410959",
    }),
    "partial snapshot DB lease terms",
  );

  return {
    status: row.status,
    total_recovery: row.total_recovery,
    proration_factor: leaseTerms.proration_factor,
  };
}

async function verifyFinalizedSnapshot(sql, input) {
  const rows = await sql`
    select status, finalized_by_user_id, finalized_at is not null as has_finalized_at
    from reconciliation_snapshots
    where id = ${input.snapshotId}
      and organization_id = ${input.organizationId}
  `;
  const row = rows[0];
  assert(row, "finalized snapshot DB row should exist");
  assert(row.status === "finalized", "DB snapshot status should be finalized");
  assert(row.finalized_by_user_id === input.userId, "finalized user mismatch");
  assert(row.has_finalized_at === true, "finalized timestamp missing");

  return row;
}

async function verifyFinalizedCampaign(sql, input) {
  const rows = await sql`
    select status, finalized_by_user_id, finalized_at is not null as has_finalized_at
    from reconciliation_campaigns
    where organization_id = ${input.organizationId}
      and property_id = ${input.propertyId}
      and period_year = ${input.periodYear}
  `;
  const row = rows[0];
  assert(row, "finalized campaign DB row should exist");
  assert(row.status === "finalized", "campaign status should be finalized");
  assert(
    row.finalized_by_user_id === input.userId,
    "campaign finalized user mismatch",
  );
  assert(row.has_finalized_at === true, "campaign finalized timestamp missing");

  return row;
}

function expectedLeaseTerms(input, expected) {
  const leaseId =
    expected.tenantName === "Partial Period Tenant"
      ? input.leaseIds[1]
      : input.leaseIds[0];
  return {
    lease_id: leaseId,
    tenant_name: expected.tenantName,
    pro_rata_share: expected.proRataShare,
    admin_fee_percentage: expected.adminFeePercentage,
    management_fee_percentage: null,
    base_year: null,
    base_year_amount: null,
    cap_type: "none",
    cap_rate: null,
    excluded_pools: [],
    accounting_basis: "cash",
    proration_factor: expected.prorationFactor,
  };
}

function assertSnapshotSummary(actual, expected) {
  assertExactKeys(actual, SNAPSHOT_SUMMARY_KEYS, "snapshot summary");
  for (const key of [
    "id",
    "property_id",
    "lease_id",
    "period_start_date",
    "period_end_date",
    "status",
    "total_recovery",
    "admin_fee",
    "is_finalized",
    "finalized_at",
    "tenant_name",
    "property_name",
  ]) {
    assert(
      actual[key] === expected[key],
      `snapshot summary ${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(actual[key])}`,
    );
  }
  assertParseableIso(actual.created_at, "snapshot summary created_at");
}

function assertLeaseTermsSnapshot(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    if (Array.isArray(value)) {
      assert(
        JSON.stringify(actual[key]) === JSON.stringify(value),
        `${label} ${key} mismatch: ${safeJson(actual[key])}`,
      );
      continue;
    }
    assert(
      actual[key] === value,
      `${label} ${key} mismatch: ${safeJson(actual[key])}`,
    );
  }
}

function assertPoolBreakdown(actual, expected, label) {
  assert(Array.isArray(actual), `${label} should be an array`);
  assert(actual.length === 1, `${label} should have exactly one row`);
  for (const [key, value] of Object.entries(expected)) {
    assert(
      actual[0]?.[key] === value,
      `${label} ${key} mismatch: ${safeJson(actual[0])}`,
    );
  }
}

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `reconciliation-e2e-${runId}@capveri.com`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
  const generated = {
    token: undefined,
    signupEmail,
    userId: "00000000-0000-4000-8000-000000000000",
    organizationId: randomUUID(),
    organizationName: `Local Reconciliation E2E Org ${runId}`,
    signupOrganizationIds: [],
    signupOrganizationNames: [`${signupEmail.split("@")[0]}'s Organization`],
    propertyId: randomUUID(),
    unitIds: [randomUUID(), randomUUID()],
    leaseIds: [randomUUID(), randomUUID()],
    leaseTermVersionIds: [randomUUID(), randomUUID()],
    poolId: randomUUID(),
    importBatchId: randomUUID(),
    glEntryIds: [randomUUID(), randomUUID()],
    jobIds: [],
    snapshotIds: [],
  };
  const signupUrl = new URL("/auth/v1/signup", input.supabaseUrl);
  const signupResponse = await fetch(signupUrl, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: signupEmail, password: signupPassword }),
  });
  const signupBody = await signupResponse.json().catch(() => ({}));
  if (!signupResponse.ok) {
    fail(`Local Supabase signup failed: ${safeJson(signupBody)}`);
  }
  const userId = signupBody.user?.id;
  if (typeof userId !== "string") {
    fail("Local Supabase signup did not return a user id.");
  }
  generated.userId = userId;

  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });

  try {
    const signupOrgRows = await sql`
      select u.organization_id, o.name
      from users u
      join organizations o on o.id = u.organization_id
      where u.id = ${userId}
      limit 1
    `;
    const signupOrg = signupOrgRows[0];
    if (typeof signupOrg?.organization_id === "string") {
      generated.signupOrganizationIds.push(signupOrg.organization_id);
    }
    if (typeof signupOrg?.name === "string") {
      generated.signupOrganizationNames.push(signupOrg.name);
    }

    await sql
      .begin(async (transaction) => {
        await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id = ${userId}
        `;
        await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values (${generated.organizationId}, ${generated.organizationName}, 'active', '{}'::jsonb)
        `;
        await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${userId}, ${generated.organizationId}, ${signupEmail}, 'Local Reconciliation E2E', 'owner')
          on conflict (id) do update
          set organization_id = excluded.organization_id,
              email = excluded.email,
              full_name = excluded.full_name,
              role = excluded.role
        `;
        await transaction`
          insert into subscriptions (
            organization_id,
            plan,
            status,
            current_period_start,
            current_period_end
          )
          values (
            ${generated.organizationId},
            'professional',
            'active',
            now(),
            now() + interval '30 days'
          )
        `;
        await transaction`
          insert into properties (
            id,
            organization_id,
            name,
            address_line1,
            city,
            state,
            postal_code,
            total_rentable_sqft,
            total_usable_sqft,
            common_area_sqft,
            target_occupancy
          )
          values (
            ${generated.propertyId},
            ${generated.organizationId},
            'Local Reconciliation E2E Tower',
            '600 Recovery Loop',
            'Denver',
            'CO',
            '80202',
            15000,
            13500,
            1500,
            0.95
          )
        `;
        await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${generated.unitIds[0]}, ${generated.propertyId}, '100', 10000, 9000, 1, 'occupied'),
            (${generated.unitIds[1]}, ${generated.propertyId}, '200', 5000, 4500, 2, 'occupied')
        `;
        await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (
              ${generated.leaseIds[0]},
              ${generated.propertyId},
              ${generated.unitIds[0]},
              'Reconcile Tenant',
              ${PERIOD_START}::date,
              ${PERIOD_END}::date,
              'active',
              ${JSON.stringify({
                pro_rata_share: "0.10",
                admin_fee_percentage: "0.15",
                management_fee_percentage: null,
                base_year: null,
                base_year_amount: null,
                gross_up_base_year: false,
                cap_type: "none",
                cap_rate: null,
                excluded_pools: [],
                accounting_basis: "cash",
              })}::jsonb
            ),
            (
              ${generated.leaseIds[1]},
              ${generated.propertyId},
              ${generated.unitIds[1]},
              'Partial Period Tenant',
              '2026-07-01'::date,
              ${PERIOD_END}::date,
              'active',
              ${JSON.stringify({
                pro_rata_share: "0.08",
                admin_fee_percentage: "0.10",
                management_fee_percentage: null,
                base_year: null,
                base_year_amount: null,
                gross_up_base_year: false,
                cap_type: "none",
                cap_rate: null,
                excluded_pools: [],
                accounting_basis: "cash",
              })}::jsonb
            )
        `;
        await transaction`
          insert into lease_term_versions (
            id,
            lease_id,
            version_number,
            effective_date,
            base_year,
            base_year_amount,
            gross_up_base_year,
            pro_rata_share,
            cap_type,
            cap_rate,
            admin_fee_percentage,
            excluded_pools,
            management_fee_percentage,
            created_by
          )
          values
            (
              ${generated.leaseTermVersionIds[0]},
              ${generated.leaseIds[0]},
              1,
              ${PERIOD_START}::date,
              null,
              null,
              false,
              0.10,
              'none',
              null,
              0.15,
              '[]'::jsonb,
              null,
              ${userId}
            ),
            (
              ${generated.leaseTermVersionIds[1]},
              ${generated.leaseIds[1]},
              1,
              '2026-07-01'::date,
              null,
              null,
              false,
              0.08,
              'none',
              null,
              0.10,
              '[]'::jsonb,
              null,
              ${userId}
            )
        `;
        await transaction`
          insert into expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target)
          values (${generated.poolId}, ${generated.propertyId}, 'Operating Expenses', 'operating', true, 0.50)
        `;
        await transaction`
          insert into pool_mappings (expense_pool_id, gl_account_pattern, allocation_percentage, priority)
          values (${generated.poolId}, '6*', 1.0000, 10)
        `;
        await transaction`
          insert into import_batches (
            id,
            organization_id,
            property_id,
            file_name,
            file_hash,
            source_system,
            status,
            row_count,
            error_count
          )
          values (
            ${generated.importBatchId},
            ${generated.organizationId},
            ${generated.propertyId},
            'local-reconciliation-gl.csv',
            ${"b".repeat(64)},
            'yardi',
            'completed',
            2,
            0
          )
        `;
        await transaction`
          insert into gl_entries (
            id,
            import_batch_id,
            property_id,
            account_code,
            account_description,
            amount,
            transaction_date,
            period_year,
            period_month,
            vendor_name,
            description,
            raw_row_data
          )
          values
            (${generated.glEntryIds[0]}, ${generated.importBatchId}, ${generated.propertyId}, '6000', 'Repairs', 10000.00, '2026-03-15'::date, 2026, 3, 'Vendor A', 'Repairs', '{}'::jsonb),
            (${generated.glEntryIds[1]}, ${generated.importBatchId}, ${generated.propertyId}, '6100', 'Utilities', 2500.00, '2026-05-10'::date, 2026, 5, 'Vendor B', 'Utilities', '{}'::jsonb)
        `;
      })
      .catch((error) => {
        throw new Error(
          `Failed to seed local reconciliation E2E records: ${errorMessage(error)}`,
          { cause: error },
        );
      });

    const token =
      signupBody.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: signupEmail,
        password: signupPassword,
      }));
    if (!token) {
      fail("Local Supabase signup seed could not mint a password token.");
    }
    generated.token = token;
  } catch (error) {
    let cleanupError;
    try {
      await cleanupGeneratedRows(sql, generated);
      await assertCleanupComplete(sql, generated);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
    if (cleanupError) {
      throw new Error(
        `${errorMessage(error)}; seed cleanup also failed: ${errorMessage(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }

  return generated;
}

async function cleanupGeneratedRows(sql, input) {
  const organizationIds = nonEmpty([
    input.organizationId,
    ...input.signupOrganizationIds,
  ]);
  const organizationNames = nonEmpty(
    [input.organizationName, ...input.signupOrganizationNames],
    "__local_reconciliation_e2e_none__",
  );
  const propertyIds = nonEmpty([input.propertyId]);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const leaseTermVersionIds = nonEmpty(input.leaseTermVersionIds);
  const poolIds = nonEmpty([input.poolId]);
  const importBatchIds = nonEmpty([input.importBatchId]);
  const glEntryIds = nonEmpty(input.glEntryIds);
  const jobIds = nonEmpty(input.jobIds);
  const snapshotIds = nonEmpty(input.snapshotIds);

  await sql.begin(async (transaction) => {
    await transaction`
      delete from credit_consumption_log
      where reconciliation_snapshot_id in ${transaction(snapshotIds)}
    `;
    await transaction`
      delete from calculation_jobs
      where id in ${transaction(jobIds)}
        or organization_id in ${transaction(organizationIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from reconciliation_snapshots
      where id in ${transaction(snapshotIds)}
        or organization_id in ${transaction(organizationIds)}
        or property_id in ${transaction(propertyIds)}
        or lease_id in ${transaction(leaseIds)}
    `;
    await transaction`
      delete from reconciliation_campaigns
      where organization_id in ${transaction(organizationIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from lease_term_versions
      where id in ${transaction(leaseTermVersionIds)}
        or lease_id in ${transaction(leaseIds)}
        or created_by = ${input.userId}
    `;
    await transaction`
      delete from pool_mappings
      where expense_pool_id in ${transaction(poolIds)}
    `;
    await transaction`
      delete from expense_pools
      where id in ${transaction(poolIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from gl_entries
      where id in ${transaction(glEntryIds)}
        or import_batch_id in ${transaction(importBatchIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from import_batches
      where id in ${transaction(importBatchIds)}
        or organization_id in ${transaction(organizationIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from tenant_lease_links
      where lease_id in ${transaction(leaseIds)}
    `;
    await transaction`
      delete from leases
      where id in ${transaction(leaseIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from units
      where id in ${transaction(unitIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from properties
      where id in ${transaction(propertyIds)}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction(organizationIds)}
        or user_id = ${input.userId}
        or email = ${input.signupEmail}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(organizationIds)}
        or user_id = ${input.userId}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(organizationIds)}
        or changed_by = ${input.userId}
        or row_id in ${transaction([
          input.userId,
          ...organizationIds,
          ...propertyIds,
          ...leaseIds,
          ...snapshotIds,
        ])}
    `;
    await transaction`
      delete from users
      where id = ${input.userId}
        or email = ${input.signupEmail}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from auth.users
      where id = ${input.userId}
        or email = ${input.signupEmail}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction(organizationIds)}
        or name in ${transaction(organizationNames)}
    `;
  });
}

async function assertCleanupComplete(sql, input) {
  const organizationIds = nonEmpty([
    input.organizationId,
    ...input.signupOrganizationIds,
  ]);
  const organizationNames = nonEmpty(
    [input.organizationName, ...input.signupOrganizationNames],
    "__local_reconciliation_e2e_none__",
  );
  const propertyIds = nonEmpty([input.propertyId]);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const leaseTermVersionIds = nonEmpty(input.leaseTermVersionIds);
  const poolIds = nonEmpty([input.poolId]);
  const importBatchIds = nonEmpty([input.importBatchId]);
  const glEntryIds = nonEmpty(input.glEntryIds);
  const jobIds = nonEmpty(input.jobIds);
  const snapshotIds = nonEmpty(input.snapshotIds);

  const rows = await sql`
    select
      (select count(*)::int from credit_consumption_log where reconciliation_snapshot_id in ${sql(snapshotIds)}) as credit_consumption_log,
      (select count(*)::int from calculation_jobs where id in ${sql(jobIds)} or organization_id in ${sql(organizationIds)} or property_id in ${sql(propertyIds)}) as calculation_jobs,
      (select count(*)::int from reconciliation_snapshots where id in ${sql(snapshotIds)} or organization_id in ${sql(organizationIds)} or property_id in ${sql(propertyIds)} or lease_id in ${sql(leaseIds)}) as reconciliation_snapshots,
      (select count(*)::int from reconciliation_campaigns where organization_id in ${sql(organizationIds)} or property_id in ${sql(propertyIds)}) as reconciliation_campaigns,
      (select count(*)::int from lease_term_versions where id in ${sql(leaseTermVersionIds)} or lease_id in ${sql(leaseIds)} or created_by = ${input.userId}) as lease_term_versions,
      (select count(*)::int from pool_mappings where expense_pool_id in ${sql(poolIds)}) as pool_mappings,
      (select count(*)::int from expense_pools where id in ${sql(poolIds)} or property_id in ${sql(propertyIds)}) as expense_pools,
      (select count(*)::int from gl_entries where id in ${sql(glEntryIds)} or import_batch_id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as gl_entries,
      (select count(*)::int from import_batches where id in ${sql(importBatchIds)} or organization_id in ${sql(organizationIds)} or property_id in ${sql(propertyIds)}) as import_batches,
      (select count(*)::int from tenant_lease_links where lease_id in ${sql(leaseIds)}) as tenant_lease_links,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)}) as leases,
      (select count(*)::int from units where id in ${sql(unitIds)} or property_id in ${sql(propertyIds)}) as units,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(organizationIds)}) as properties,
      (select count(*)::int from subscriptions where organization_id in ${sql(organizationIds)}) as subscriptions,
      (select count(*)::int from signup_email_events where organization_id in ${sql(organizationIds)} or user_id = ${input.userId} or email = ${input.signupEmail}) as signup_email_events,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(organizationIds)} or user_id = ${input.userId}) as legal_acceptances,
      (select count(*)::int from audit_log where organization_id in ${sql(organizationIds)} or changed_by = ${input.userId}) as audit_log,
      (select count(*)::int from users where id = ${input.userId} or email = ${input.signupEmail} or organization_id in ${sql(organizationIds)}) as public_users,
      (select count(*)::int from auth.users where id = ${input.userId} or email = ${input.signupEmail}) as auth_users,
      (select count(*)::int from organizations where id in ${sql(organizationIds)} or name in ${sql(organizationNames)}) as organizations
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return undefined;
  }
  if (typeof body.access_token !== "string" || body.access_token === "") {
    fail("Supabase password sign-in did not return an access token.");
  }
  return body.access_token;
}

async function startWorkerServer(input) {
  const port = new URL(input.baseUrl).port;
  const envFile = await createWorkerEnvFile(input);
  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      port,
      "--local",
      "--show-interactive-dev-session",
      "false",
      "--env-file",
      envFile.path,
      "--var",
      "DB_ACCESS_MODE:direct-postgres",
      "--var",
      "DB_PRODUCTION_BOUNDARY:direct-postgres",
      "--var",
      `DATABASE_URL:${input.databaseUrl}`,
      "--var",
      `SUPABASE_URL:${input.supabaseUrl}`,
      "--var",
      `AUTH_JWKS_URL:${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "--var",
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      "RESEND_API_KEY:",
      "--var",
      "OPENROUTER_API_KEY:",
      "--var",
      "LOCAL_E2E_INLINE_RECONCILIATION_QUEUE:1",
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  let childError;
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.once("error", (error) => {
    childError = error;
    output += `\nwrangler dev spawn error: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0) {
      output += `\nwrangler dev exited with ${code}`;
    }
  });
  const handle = {
    close: async () => {
      try {
        if (child.exitCode === null) {
          if (child.pid) await killProcessTree(child.pid);
          await new Promise((resolveClose) => {
            const timeout = setTimeout(resolveClose, 5000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolveClose();
            });
          });
        } else if (child.pid) {
          await killProcessTree(child.pid);
        }
      } finally {
        try {
          await waitForPortClosed(input.baseUrl);
        } finally {
          await envFile.close();
        }
      }
    },
  };
  try {
    await waitForHealth(input.baseUrl, () => output);
    if (childError) {
      fail(`wrangler dev failed to spawn\n${output.slice(-2000)}`);
    }
    if (child.exitCode !== null) {
      fail(`wrangler dev exited before health\n${output.slice(-2000)}`);
    }
    return handle;
  } catch (error) {
    let closeError;
    try {
      await handle.close();
    } catch (cleanupError) {
      closeError = cleanupError;
    }
    if (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-reconciliation-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-reconciliation-e2e");
  await writeFile(
    path,
    [
      "ENVIRONMENT=development",
      "NODE_ENV=development",
      "DB_ACCESS_MODE=direct-postgres",
      "DB_PRODUCTION_BOUNDARY=direct-postgres",
      `DATABASE_URL=${input.databaseUrl}`,
      `SUPABASE_URL=${input.supabaseUrl}`,
      `AUTH_JWKS_URL=${input.supabaseUrl}/auth/v1/.well-known/jwks.json`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "RESEND_API_KEY=",
      "OPENROUTER_API_KEY=",
      "LOCAL_E2E_INLINE_RECONCILIATION_QUEUE=1",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=",
      "UNSUBSCRIBE_HMAC_SECRET=",
      "CHECKOUT_OFFER_TOKEN_SECRET=",
    ].join("\n"),
    "utf8",
  );
  return {
    path,
    close: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function workerEnv(input) {
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  env.DB_ACCESS_MODE = "direct-postgres";
  env.DB_PRODUCTION_BOUNDARY = "direct-postgres";
  env.DATABASE_URL = input.databaseUrl;
  env.SUPABASE_URL = input.supabaseUrl;
  env.AUTH_JWKS_URL = `${input.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  env.LOCAL_E2E_INLINE_RECONCILIATION_QUEUE = "1";
  return env;
}

async function killProcessTree(pid) {
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
    return;
  }
  await new Promise((resolveKill) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
}

async function assertPortAvailable(baseUrl) {
  const url = new URL(baseUrl);
  if (await canConnect(url.hostname, Number(url.port))) {
    fail(`${baseUrl} already accepts TCP connections`);
  }
}

async function waitForHealth(baseUrl, output = () => "") {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = errorMessage(error);
    }
    await sleep(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
}

async function canConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolveConnect(false);
    }, 500);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolveConnect(false);
    });
  });
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function encodeCellId(snapshotId, fieldName) {
  return Buffer.from(`${snapshotId}:${fieldName}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//i.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
    if (!key) {
      fail(`Invalid argument: ${arg}`);
    }
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function normalizedLocalUrl(rawUrl, label) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:") {
    fail(`${label} must use http for local-only E2E`);
  }
  if (url.username || url.password) {
    fail(`${label} must not include credentials`);
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizedLocalSupabaseUrl(rawUrl) {
  const value = normalizedLocalUrl(rawUrl, "supabase-url");
  const url = new URL(value);
  if (url.port !== "54321") {
    fail("supabase-url must use the local Supabase API port 54321");
  }
  if (url.pathname !== "/") {
    fail("supabase-url must not include a path");
  }
  return value;
}

function normalizedLocalDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
  return url.toString();
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

async function readEnvValue(path, names) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  for (const name of names) {
    const line = content
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) {
      continue;
    }
    const value = line.slice(line.indexOf("=") + 1).trim();
    return value.replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = parseJsonResponse(text, url);
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(body)}`,
    );
  }
  return body;
}

function parseJsonResponse(text, url) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`);
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  assertJsonEqual(
    Object.keys(actual).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertParseableIso(value, label) {
  assert(typeof value === "string", `${label} should be a string`);
  assert(!Number.isNaN(Date.parse(value)), `${label} should be parseable ISO`);
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    `${label} should be a UUID`,
  );
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeJsonArray(value) {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return Array.isArray(parsed) ? parsed : null;
}

function normalizeJsonObject(value) {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(
      (values ?? []).filter((value) => typeof value === "string" && value),
    ),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
