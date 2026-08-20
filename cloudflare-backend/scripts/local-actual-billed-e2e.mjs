import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8834";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-12-31";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local actual-billed E2E always owns ${DEFAULT_BASE_URL}`);
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
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ]));

  if (!anonKey) {
    fail("Missing local Supabase anon key.");
  }

  if (process.env.CI) {
    fail("Refusing to run local actual-billed E2E in CI.");
  }

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
    await runOnce({ baseUrl, sql, account });
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
      `Local actual-billed cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
    );
  }
  if (runError) throw runError;
  if (postRunError) throw postRunError;
}

async function runOnce({ baseUrl, sql, account }) {
  const authHeaders = { authorization: `Bearer ${account.token}` };
  const viewerHeaders = { authorization: `Bearer ${account.viewerToken}` };
  const reviewBillingCsv = [
    "Tenant,Suite,Billed Amount",
    'Mystery Tenant,999,"$111.11"',
  ].join("\n");
  const reviewUpload = await postCsv({
    url: `${baseUrl}/api/v1/actual-billed/upload`,
    authHeaders,
    filename: "review-billing.csv",
    csv: reviewBillingCsv,
    status: 200,
    fields: {
      property_id: account.propertyId,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    },
  });
  assertUploadResponse(reviewUpload, {
    sourceType: "csv_import",
    totalBilled: "111.11",
    rowCount: 1,
    matchedRowCount: 0,
    unmatchedRowCount: 1,
    warnings: [
      "Row 1 needs review. Mystery Tenant / suite 999 did not match a lease.",
    ],
    items: [
      {
        tenant_name: "Mystery Tenant",
        billed_amount: "111.11",
        suite: "999",
        lease_id: null,
        match_status: "needs_review",
      },
    ],
  });

  const reviewRowId = reviewUpload.items[0].id;
  const matchResponse = await expectJson(
    `${baseUrl}/api/v1/actual-billed/matches`,
    {
      method: "PUT",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        property_id: account.propertyId,
        period_start: PERIOD_START,
        period_end: PERIOD_END,
        matches: [
          {
            actual_billed_id: reviewRowId,
            lease_id: account.leaseOneId,
          },
        ],
      }),
      status: 200,
    },
  );
  assertExactJson(
    matchResponse,
    { success: true, updated_count: 1 },
    "review billing match response",
  );
  await assertBilledRowLease(sql, {
    billedRowId: reviewRowId,
    leaseId: account.leaseOneId,
  });

  const clearReviewUpload = await expectJson(
    `${baseUrl}/api/v1/actual-billed/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    {
      method: "DELETE",
      headers: authHeaders,
      status: 200,
    },
  );
  assertExactJson(
    clearReviewUpload,
    { message: "Billing data deleted successfully" },
    "review billing cleanup response",
  );

  const billingCsv = [
    "Tenant,Suite,Billed Amount",
    'Alpha Retail,100,"$900.00"',
    'Beta Office,200,"$1,750.25"',
    'Alpha Retail,100,"$25.75"',
    "Grand Total,,2676.00",
    "Bad Amount,300,n/a",
    "Zero Charge,400,$0",
    'Credit Tenant,500,"($50.00)"',
  ].join("\n");
  const upload = await postCsv({
    url: `${baseUrl}/api/v1/actual-billed/upload`,
    authHeaders,
    filename: "yardi-billing.csv",
    csv: billingCsv,
    status: 200,
    fields: {
      property_id: account.propertyId,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
    },
  });
  assertUploadResponse(upload, {
    sourceType: "yardi_recon",
    totalBilled: "2676",
    rowCount: 3,
    matchedRowCount: 3,
    unmatchedRowCount: 0,
    warnings: [
      "Skipped row 6: amount was not a number",
      "Skipped row 7: amount was zero or negative",
      "Skipped row 8: amount was zero or negative",
    ],
    items: [
      {
        tenant_name: "Alpha Retail",
        billed_amount: "900",
        suite: "100",
        lease_id: account.leaseOneId,
        match_status: "matched",
      },
      {
        tenant_name: "Beta Office",
        billed_amount: "1750.25",
        suite: "200",
        lease_id: account.leaseTwoId,
        match_status: "matched",
      },
      {
        tenant_name: "Alpha Retail",
        billed_amount: "25.75",
        suite: "100",
        lease_id: account.leaseOneId,
        match_status: "matched",
      },
    ],
  });

  const manual = await expectJson(`${baseUrl}/api/v1/actual-billed/manual`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      property_id: account.propertyId,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      total_billed: "300.75",
      pool_id: account.poolId,
    }),
    status: 200,
  });
  assertManualResponse(manual, {
    propertyId: account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    totalBilled: "300.75",
    poolId: account.poolId,
  });

  const list = await expectJson(
    `${baseUrl}/api/v1/actual-billed/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    { headers: authHeaders, status: 200 },
  );
  assertActualBilledListResponse(list, {
    propertyId: account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    totalBilled: "2976.75",
    itemCount: 4,
  });
  assertNoGeneratedMarkerLeak(list, "Hidden Tenant");
  const expectedActualBilledRows = expectedActualBilledRowsFromList(list, {
    organizationId: account.organizationId,
    propertyId: account.propertyId,
    leaseOneId: account.leaseOneId,
    leaseTwoId: account.leaseTwoId,
    poolId: account.poolId,
  });
  assertExactJson(list.items, expectedActualBilledRows, "billing list items");

  await assertActualBilledNegativePaths({
    baseUrl,
    authHeaders,
    viewerHeaders,
    account,
    expectedActualBilledRows,
  });

  const finalizedLeakage = await expectJson(
    `${baseUrl}/api/v1/leakage/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    { headers: authHeaders, status: 200 },
  );
  assertLeakageResponse(finalizedLeakage, {
    propertyId: account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    capveriCalculated: "3500",
    actualBilled: "2976.75",
    leakage: "523.25",
    leakagePct: 14.95,
    hasReconciliationData: true,
    hasGlData: true,
    hasBillingData: true,
    breakdown: [
      {
        tenantName: "Beta Office",
        calculatedAmount: 2300,
        billedAmount: 1750.25,
        difference: 549.75,
        differencePct: 23.902173913043477,
      },
      {
        tenantName: "TOTAL (Manual Entry)",
        calculatedAmount: 0,
        billedAmount: 300.75,
        difference: -300.75,
        differencePct: 0,
      },
      {
        tenantName: "Alpha Retail",
        calculatedAmount: 1200,
        billedAmount: 925.75,
        difference: 274.25,
        differencePct: 22.854166666666668,
      },
    ],
  });

  const draftLeakage = await expectJson(
    `${baseUrl}/api/v1/leakage/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}&include_drafts=true`,
    { headers: authHeaders, status: 200 },
  );
  assertLeakageResponse(draftLeakage, {
    propertyId: account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    capveriCalculated: "3900",
    actualBilled: "2976.75",
    leakage: "923.25",
    leakagePct: 23.673076923076923,
    hasReconciliationData: true,
    hasGlData: true,
    hasBillingData: true,
    breakdown: [
      {
        tenantName: "Alpha Retail",
        calculatedAmount: 1600,
        billedAmount: 925.75,
        difference: 674.25,
        differencePct: 42.140625,
      },
      {
        tenantName: "Beta Office",
        calculatedAmount: 2300,
        billedAmount: 1750.25,
        difference: 549.75,
        differencePct: 23.902173913043477,
      },
      {
        tenantName: "TOTAL (Manual Entry)",
        calculatedAmount: 0,
        billedAmount: 300.75,
        difference: -300.75,
        differencePct: 0,
      },
    ],
  });

  const summary = await expectJson(`${baseUrl}/api/v1/leakage/summary`, {
    headers: authHeaders,
    status: 200,
  });
  assertLeakageSummaryResponse(summary, {
    totalRecoveryOpportunity: "523.25",
    propertiesWithLeakage: 1,
    totalUnderbillExposure: "523.25",
    totalOverbillExposure: "0",
    totalBillingExposure: "523.25",
    propertiesWithUnderbill: 1,
    propertiesWithOverbill: 0,
    propertiesWithBillingExposure: 1,
    hasBillingData: true,
    draftRecovery: "400",
    draftPropertyCount: 1,
  });

  const crossOrg = await expectJson(
    `${baseUrl}/api/v1/leakage/${account.otherPropertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    { headers: authHeaders, status: 200 },
  );
  assertLeakageResponse(crossOrg, {
    propertyId: account.otherPropertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    capveriCalculated: "0",
    actualBilled: "0",
    leakage: "0",
    leakagePct: 0,
    hasReconciliationData: false,
    hasGlData: false,
    hasBillingData: false,
    breakdown: [],
  });

  const verified = await verifyActualBilled(sql, {
    organizationId: account.organizationId,
    propertyId: account.propertyId,
    poolId: account.poolId,
    expectedRows: expectedActualBilledRows,
  });
  await seedControlBillingRow(sql, {
    organizationId: account.organizationId,
    propertyId: account.propertyId,
  });

  const deleteResult = await expectJson(
    `${baseUrl}/api/v1/actual-billed/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    {
      method: "DELETE",
      headers: authHeaders,
      status: 200,
    },
  );
  assertExactJson(
    deleteResult,
    { message: "Billing data deleted successfully" },
    "delete response",
  );
  const afterDelete = await expectJson(
    `${baseUrl}/api/v1/actual-billed/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    { headers: authHeaders, status: 200 },
  );
  assertActualBilledListResponse(afterDelete, {
    propertyId: account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    totalBilled: "0",
    itemCount: 0,
  });
  const deleteVerified = await verifyDeleteScope(sql, {
    organizationId: account.organizationId,
    propertyId: account.propertyId,
  });
  const leakageAfterDelete = await expectJson(
    `${baseUrl}/api/v1/leakage/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    { headers: authHeaders, status: 200 },
  );
  assertLeakageResponse(leakageAfterDelete, {
    propertyId: account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    capveriCalculated: "3500",
    actualBilled: "0",
    leakage: "3500",
    leakagePct: 100,
    hasReconciliationData: true,
    hasGlData: true,
    hasBillingData: false,
    breakdown: [
      {
        tenantName: "Beta Office",
        calculatedAmount: 2300,
        billedAmount: 0,
        difference: 2300,
        differencePct: 100,
      },
      {
        tenantName: "Alpha Retail",
        calculatedAmount: 1200,
        billedAmount: 0,
        difference: 1200,
        differencePct: 100,
      },
    ],
  });
  const summaryAfterDelete = await expectJson(
    `${baseUrl}/api/v1/leakage/summary`,
    {
      headers: authHeaders,
      status: 200,
    },
  );
  assertLeakageSummaryResponse(summaryAfterDelete, {
    totalRecoveryOpportunity: "3422.23",
    propertiesWithLeakage: 1,
    totalUnderbillExposure: "3422.23",
    totalOverbillExposure: "0",
    totalBillingExposure: "3422.23",
    propertiesWithUnderbill: 1,
    propertiesWithOverbill: 0,
    propertiesWithBillingExposure: 1,
    hasBillingData: true,
    draftRecovery: "400",
    draftPropertyCount: 1,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: baseUrl,
        property_id: account.propertyId,
        finalized_leakage: finalizedLeakage.leakage,
        draft_leakage: draftLeakage.leakage,
        summary,
        leakage_after_delete: leakageAfterDelete.leakage,
        summary_after_delete: summaryAfterDelete,
        verified,
        delete_verified: deleteVerified,
      },
      null,
      2,
    ),
  );
}

async function verifyActualBilled(sql, input) {
  const rows = await sql`
    select
      id::text,
      organization_id::text,
      property_id::text,
      lease_id::text,
      period_start_date::text,
      period_end_date::text,
      tenant_name,
      billed_amount::text,
      source_type,
      pool_id::text
    from actual_billed_amounts
    where organization_id = ${input.organizationId}
      and property_id = ${input.propertyId}
    order by tenant_name, id
  `;
  assertExactJson(
    rows.map(normalizedActualBilledRow),
    input.expectedRows.map(normalizedActualBilledRow),
    "actual billed DB rows",
  );

  const snapshotRows = await sql`
    select status, sum(total_recovery)::text as total_recovery
    from reconciliation_snapshots
    where organization_id = ${input.organizationId}
      and property_id = ${input.propertyId}
    group by status
    order by status
  `;

  return {
    actual_billed_rows: rows.length,
    finalized_recovery: snapshotRows.find((row) => row.status === "finalized")
      ?.total_recovery,
    draft_recovery: snapshotRows.find((row) => row.status === "draft")
      ?.total_recovery,
  };
}

async function assertBilledRowLease(sql, input) {
  const rows = await sql`
    select lease_id::text
    from actual_billed_amounts
    where id = ${input.billedRowId}
  `;
  assert(
    rows.length === 1,
    `expected one matched billed row, found ${rows.length}`,
  );
  assert(
    rows[0].lease_id === input.leaseId,
    `billed row lease mismatch: expected ${input.leaseId}, got ${rows[0].lease_id}`,
  );
}

function assertUploadResponse(actual, expected) {
  assertExactKeys(
    actual,
    [
      "items",
      "matched_row_count",
      "row_count",
      "source_type",
      "success",
      "total_billed",
      "unmatched_row_count",
      "warnings",
    ],
    "upload response",
  );
  assert(actual.success === true, "billing upload should succeed");
  assert(
    actual.source_type === expected.sourceType,
    "billing upload source type mismatch",
  );
  assert(
    actual.row_count === expected.rowCount,
    "billing upload row count mismatch",
  );
  assert(
    actual.matched_row_count === expected.matchedRowCount,
    "billing upload matched row count mismatch",
  );
  assert(
    actual.unmatched_row_count === expected.unmatchedRowCount,
    "billing upload unmatched row count mismatch",
  );
  assert(
    actual.total_billed === expected.totalBilled,
    "billing upload total mismatch",
  );
  assertExactJson(
    actual.warnings,
    expected.warnings,
    "billing upload warnings",
  );
  assert(
    Array.isArray(actual.items) && actual.items.length === expected.items.length,
    "billing upload item count mismatch",
  );
  for (const [index, item] of actual.items.entries()) {
    assertExactKeys(
      item,
      ["billed_amount", "id", "lease_id", "match_status", "suite", "tenant_name"],
      `upload item ${index}`,
    );
    assertUuid(item.id, `upload item ${index} id`);
    assertExactJson(
      {
        tenant_name: item.tenant_name,
        billed_amount: item.billed_amount,
        suite: item.suite,
        lease_id: item.lease_id,
        match_status: item.match_status,
      },
      expected.items[index],
      `billing upload parsed item ${index}`,
    );
  }
}

function assertManualResponse(actual, expected) {
  assertExactKeys(
    actual,
    [
      "id",
      "period_end",
      "period_start",
      "pool_id",
      "property_id",
      "total_billed",
    ],
    "manual response",
  );
  assertUuid(actual.id, "manual billed id");
  assert(
    actual.property_id === expected.propertyId,
    "manual property mismatch",
  );
  assert(
    actual.period_start === expected.periodStart,
    "manual period start mismatch",
  );
  assert(
    actual.period_end === expected.periodEnd,
    "manual period end mismatch",
  );
  assert(
    actual.total_billed === expected.totalBilled,
    "manual billed amount mismatch",
  );
  assert(actual.pool_id === expected.poolId, "manual pool id mismatch");
}

function assertActualBilledListResponse(actual, expected) {
  assertExactKeys(
    actual,
    ["items", "period_end", "period_start", "property_id", "total_billed"],
    "actual billed list response",
  );
  assert(actual.property_id === expected.propertyId, "list property mismatch");
  assert(
    actual.period_start === expected.periodStart,
    "list period start mismatch",
  );
  assert(actual.period_end === expected.periodEnd, "list period end mismatch");
  assert(actual.total_billed === expected.totalBilled, "list total mismatch");
  assert(
    actual.items.length === expected.itemCount,
    "list item count mismatch",
  );
}

function assertLeakageResponse(actual, expected) {
  assertExactKeys(
    actual,
    [
      "actual_billed",
      "breakdown",
      "capveri_calculated",
      "has_billing_data",
      "has_gl_data",
      "has_reconciliation_data",
      "leakage",
      "leakage_pct",
      "period_end",
      "period_start",
      "property_id",
    ],
    "leakage response",
  );
  assert(
    actual.property_id === expected.propertyId,
    "leakage property mismatch",
  );
  assert(
    actual.period_start === expected.periodStart,
    "leakage period start mismatch",
  );
  assert(
    actual.period_end === expected.periodEnd,
    "leakage period end mismatch",
  );
  assert(
    actual.capveri_calculated === expected.capveriCalculated,
    "leakage calculated mismatch",
  );
  assert(
    actual.actual_billed === expected.actualBilled,
    "leakage billed mismatch",
  );
  assert(actual.leakage === expected.leakage, "leakage amount mismatch");
  assertCloseNumber(
    actual.leakage_pct,
    expected.leakagePct,
    "leakage pct mismatch",
  );
  assert(
    actual.has_reconciliation_data === expected.hasReconciliationData,
    "leakage reconciliation flag mismatch",
  );
  assert(actual.has_gl_data === expected.hasGlData, "leakage GL flag mismatch");
  assert(
    actual.has_billing_data === expected.hasBillingData,
    "leakage billing flag mismatch",
  );
  assertLeakageBreakdown(actual.breakdown, expected.breakdown);
}

function assertLeakageSummaryResponse(actual, expected) {
  assertExactKeys(
    actual,
    [
      "draft_property_count",
      "draft_recovery",
      "has_billing_data",
      "properties_with_leakage",
      "properties_with_billing_exposure",
      "properties_with_overbill",
      "properties_with_underbill",
      "total_billing_exposure",
      "total_overbill_exposure",
      "total_recovery_opportunity",
      "total_underbill_exposure",
    ],
    "leakage summary response",
  );
  assert(
    actual.total_recovery_opportunity === expected.totalRecoveryOpportunity,
    "summary recovery opportunity mismatch",
  );
  assert(
    actual.properties_with_leakage === expected.propertiesWithLeakage,
    "summary property count mismatch",
  );
  assert(
    actual.total_underbill_exposure === expected.totalUnderbillExposure,
    "summary under-bill exposure mismatch",
  );
  assert(
    actual.total_overbill_exposure === expected.totalOverbillExposure,
    "summary over-bill exposure mismatch",
  );
  assert(
    actual.total_billing_exposure === expected.totalBillingExposure,
    "summary billing exposure mismatch",
  );
  assert(
    actual.properties_with_underbill === expected.propertiesWithUnderbill,
    "summary under-bill property count mismatch",
  );
  assert(
    actual.properties_with_overbill === expected.propertiesWithOverbill,
    "summary over-bill property count mismatch",
  );
  assert(
    actual.properties_with_billing_exposure ===
      expected.propertiesWithBillingExposure,
    "summary billing exposure property count mismatch",
  );
  assert(
    actual.has_billing_data === expected.hasBillingData,
    "summary billing flag mismatch",
  );
  assert(
    actual.draft_recovery === expected.draftRecovery,
    "summary draft recovery mismatch",
  );
  assert(
    actual.draft_property_count === expected.draftPropertyCount,
    "summary draft property count mismatch",
  );
}

async function assertActualBilledNegativePaths(input) {
  const unknownPropertyId = "00000000-0000-4000-8000-000000000001";
  const unknownPoolId = "00000000-0000-4000-8000-000000000002";

  await expectError(
    () =>
      postCsv({
        url: `${input.baseUrl}/api/v1/actual-billed/upload`,
        authHeaders: input.authHeaders,
        filename: "bad-billing.csv",
        csv: "Customer,Value\nAcme,1200",
        status: 422,
        fields: {
          property_id: input.account.propertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
        },
      }),
    {
      detail: {
        message: "Failed to parse billing file",
        errors: [
          "Could not find tenant column. Expected: tenant, lessee, occupant, or name",
          "Could not find amount column. Expected: billed, amount, total, charges, amount billed, or CAM billed",
        ],
      },
      error: {
        code: "billing_parse_failed",
        message: "Failed to parse billing file",
      },
    },
    "parser failure",
  );

  await expectError(
    () =>
      postCsv({
        url: `${input.baseUrl}/api/v1/actual-billed/upload`,
        authHeaders: input.authHeaders,
        filename: "invalid-period.csv",
        csv: "Viewer,Amount\nAcme,10",
        status: 400,
        fields: {
          property_id: input.account.propertyId,
          period_start: PERIOD_END,
          period_end: PERIOD_START,
        },
      }),
    {
      detail: "period_start must be before period_end",
      error: {
        code: "invalid_period",
        message: "period_start must be before period_end",
      },
    },
    "upload invalid period",
  );

  await expectError(
    () =>
      expectJson(`${input.baseUrl}/api/v1/actual-billed/manual`, {
        method: "POST",
        headers: {
          ...input.authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: input.account.propertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          total_billed: "-1",
          pool_id: input.account.poolId,
        }),
        status: 422,
      }),
    {
      detail: "total_billed must be greater than or equal to 0",
      error: {
        code: "invalid_money_amount",
        message: "total_billed must be greater than or equal to 0",
      },
    },
    "manual negative money",
  );

  await expectError(
    () =>
      expectJson(`${input.baseUrl}/api/v1/actual-billed/manual`, {
        method: "POST",
        headers: {
          ...input.authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: input.account.propertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          total_billed: "not-a-number",
        }),
        status: 422,
      }),
    {
      detail: "total_billed must be greater than or equal to 0",
      error: {
        code: "invalid_money_amount",
        message: "total_billed must be greater than or equal to 0",
      },
    },
    "manual nonnumeric money",
  );

  await expectError(
    () =>
      expectJson(`${input.baseUrl}/api/v1/actual-billed/manual`, {
        method: "POST",
        headers: {
          ...input.authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: input.account.propertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          total_billed: "1",
          pool_id: unknownPoolId,
        }),
        status: 404,
      }),
    {
      detail: "Expense pool not found",
      error: {
        code: "pool_not_found",
        message: "Expense pool not found",
      },
    },
    "manual unknown pool",
  );

  await expectError(
    () =>
      expectJson(`${input.baseUrl}/api/v1/actual-billed/manual`, {
        method: "POST",
        headers: {
          ...input.authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: input.account.otherPropertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          total_billed: "1",
        }),
        status: 404,
      }),
    {
      detail: "Property not found",
      error: {
        code: "property_not_found",
        message: "Property not found",
      },
    },
    "manual hidden property",
  );

  await expectError(
    () =>
      expectJson(`${input.baseUrl}/api/v1/actual-billed/matches`, {
        method: "PUT",
        headers: {
          ...input.authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: input.account.propertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          matches: [
            {
              actual_billed_id: input.expectedActualBilledRows[0].id,
              lease_id: input.account.leaseOneId,
            },
            {
              actual_billed_id: input.expectedActualBilledRows[0].id,
              lease_id: input.account.leaseTwoId,
            },
          ],
        }),
        status: 400,
      }),
    {
      detail: "Choose one tenant for each billed row",
      error: {
        code: "duplicate_billing_match",
        message: "Choose one tenant for each billed row",
      },
    },
    "duplicate billing match",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/actual-billed/${unknownPropertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
        { headers: input.authHeaders, status: 404 },
      ),
    {
      detail: "Property not found",
      error: {
        code: "property_not_found",
        message: "Property not found",
      },
    },
    "list unknown property",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/actual-billed/${input.account.propertyId}`,
        {
          headers: input.authHeaders,
          status: 422,
        },
      ),
    {
      detail: "period_start is required",
      error: {
        code: "missing_query_parameter",
        message: "period_start is required",
      },
    },
    "list missing period",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/leakage/${input.account.propertyId}?period_start=${PERIOD_END}&period_end=${PERIOD_START}`,
        { headers: input.authHeaders, status: 400 },
      ),
    {
      detail: "period_start must be before period_end",
      error: {
        code: "invalid_period",
        message: "period_start must be before period_end",
      },
    },
    "leakage invalid period",
  );

  const viewerList = await expectJson(
    `${input.baseUrl}/api/v1/actual-billed/${input.account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
    { headers: input.viewerHeaders, status: 200 },
  );
  assertActualBilledListResponse(viewerList, {
    propertyId: input.account.propertyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    totalBilled: "2976.75",
    itemCount: 4,
  });
  assertExactJson(
    viewerList.items,
    input.expectedActualBilledRows,
    "viewer actual billed list items",
  );

  await expectError(
    () =>
      expectJson(`${input.baseUrl}/api/v1/actual-billed/manual`, {
        method: "POST",
        headers: {
          ...input.viewerHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: input.account.propertyId,
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          total_billed: "1",
        }),
        status: 403,
      }),
    {
      detail: "Insufficient permissions",
      error: {
        code: "insufficient_permissions",
        message: "Insufficient permissions",
      },
    },
    "viewer manual forbidden",
  );
}

function expectedActualBilledRowsFromList(list, input) {
  assert(list.items.length === 4, "billing list expected item count mismatch");
  const alphaRows = list.items.slice(0, 2);
  assert(
    alphaRows.every((row) => row.tenant_name === "Alpha Retail"),
    "billing list Alpha rows are not first",
  );
  assertExactJson(
    alphaRows.map((row) => row.billed_amount).sort(),
    ["25.75", "900.00"],
    "billing list duplicate Alpha amounts",
  );
  assert(
    list.items[2]?.tenant_name === "Beta Office" &&
      list.items[2].billed_amount === "1750.25" &&
      list.items[2].source_type === "yardi_recon" &&
      list.items[2].lease_id === input.leaseTwoId &&
      list.items[2].pool_id === null,
    "billing list Beta row mismatch",
  );
  assert(
    list.items[3]?.tenant_name === "TOTAL (Manual Entry)" &&
      list.items[3].billed_amount === "300.75" &&
      list.items[3].source_type === "manual" &&
      list.items[3].lease_id === null &&
      list.items[3].pool_id === input.poolId,
    "billing list manual row mismatch",
  );
  return list.items.map((row, index) => {
    assertExactKeys(
      row,
      [
        "billed_amount",
        "id",
        "lease_id",
        "organization_id",
        "period_end_date",
        "period_start_date",
        "pool_id",
        "property_id",
        "source_type",
        "tenant_name",
      ],
      `billing list row ${index}`,
    );
    assertUuid(row.id, `billing list row ${index} id`);
    assert(
      row.property_id === input.propertyId,
      `billing list row ${index} property mismatch`,
    );
    assert(
      row.organization_id === input.organizationId,
      `billing list row ${index} organization mismatch`,
    );
    assert(
      row.period_start_date === PERIOD_START,
      `billing list row ${index} period start mismatch`,
    );
    assert(
      row.period_end_date === PERIOD_END,
      `billing list row ${index} period end mismatch`,
    );
    assert(
      row.tenant_name === "Alpha Retail"
        ? row.lease_id === input.leaseOneId
        : true,
      `billing list row ${index} Alpha lease mismatch`,
    );
    return {
      id: row.id,
      organization_id: input.organizationId,
      property_id: input.propertyId,
      period_start_date: PERIOD_START,
      period_end_date: PERIOD_END,
      tenant_name: row.tenant_name,
      billed_amount: row.billed_amount,
      source_type: row.source_type,
      lease_id: row.lease_id,
      pool_id: row.pool_id,
    };
  });
}

function normalizedActualBilledRow(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    property_id: row.property_id,
    lease_id: row.lease_id,
    period_start_date: row.period_start_date,
    period_end_date: row.period_end_date,
    tenant_name: row.tenant_name,
    billed_amount: row.billed_amount,
    source_type: row.source_type,
    pool_id: row.pool_id,
  };
}

function assertLeakageBreakdown(actual, expected) {
  assert(
    Array.isArray(actual) && actual.length === expected.length,
    "leakage breakdown length mismatch",
  );
  for (const [index, expectedRow] of expected.entries()) {
    const actualRow = actual[index];
    assertExactKeys(
      actualRow,
      [
        "billed_amount",
        "calculated_amount",
        "difference",
        "difference_pct",
        "tenant_name",
      ],
      `leakage breakdown row ${index}`,
    );
    assert(
      actualRow?.tenant_name === expectedRow.tenantName,
      `leakage breakdown row ${index} tenant mismatch`,
    );
    assertCloseNumber(
      actualRow.calculated_amount,
      expectedRow.calculatedAmount,
      `leakage breakdown row ${index} calculated mismatch`,
    );
    assertCloseNumber(
      actualRow.billed_amount,
      expectedRow.billedAmount,
      `leakage breakdown row ${index} billed mismatch`,
    );
    assertCloseNumber(
      actualRow.difference,
      expectedRow.difference,
      `leakage breakdown row ${index} difference mismatch`,
    );
    assertCloseNumber(
      actualRow.difference_pct,
      expectedRow.differencePct,
      `leakage breakdown row ${index} pct mismatch`,
    );
  }
}

async function seedControlBillingRow(sql, input) {
  await sql`
    insert into actual_billed_amounts (
      id,
      organization_id,
      property_id,
      period_start_date,
      period_end_date,
      tenant_name,
      billed_amount,
      source_type
    )
    values (
      ${randomUUID()},
      ${input.organizationId},
      ${input.propertyId},
      '2027-01-01'::date,
      '2027-12-31'::date,
      'Control Future Tenant',
      77.77,
      'manual'
    )
  `;
}

async function verifyDeleteScope(sql, input) {
  const matchingRows = await sql`
    select count(*)::int as row_count
    from actual_billed_amounts
    where organization_id = ${input.organizationId}
      and property_id = ${input.propertyId}
      and period_start_date <= ${PERIOD_END}::date
      and period_end_date >= ${PERIOD_START}::date
  `;
  const controlRows = await sql`
    select count(*)::int as row_count
    from actual_billed_amounts
    where organization_id = ${input.organizationId}
      and property_id = ${input.propertyId}
      and period_start_date = '2027-01-01'::date
      and period_end_date = '2027-12-31'::date
      and billed_amount = 77.77
  `;

  assert(matchingRows[0]?.row_count === 0, "delete left matching billing rows");
  assert(
    controlRows[0]?.row_count === 1,
    "delete removed the control period row",
  );

  return {
    matching_period_rows: matchingRows[0]?.row_count,
    control_period_rows: controlRows[0]?.row_count,
  };
}

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `actual-billed-e2e-${runId}@capveri.com`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
  const viewerEmail = `actual-billed-viewer-${runId}@capveri.com`;
  const viewerPassword = `LocalViewerE2E-${randomUUID()}!`;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const propertyId = randomUUID();
  const otherPropertyId = randomUUID();
  const unitOneId = randomUUID();
  const unitTwoId = randomUUID();
  const otherUnitId = randomUUID();
  const leaseOneId = randomUUID();
  const leaseTwoId = randomUUID();
  const otherLeaseId = randomUUID();
  const poolId = randomUUID();
  const importBatchId = randomUUID();
  const otherImportBatchId = randomUUID();
  const snapshotIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const generated = {
    token: undefined,
    viewerToken: undefined,
    signupEmail,
    viewerEmail,
    userId: "00000000-0000-4000-8000-000000000000",
    viewerUserId: "00000000-0000-4000-8000-000000000000",
    organizationId,
    otherOrganizationId,
    organizationName: `Local Actual Billed E2E Org ${runId}`,
    otherOrganizationName: `Local Actual Billed E2E Other Org ${runId}`,
    propertyId,
    otherPropertyId,
    unitIds: [unitOneId, unitTwoId, otherUnitId],
    leaseOneId,
    leaseTwoId,
    leaseIds: [leaseOneId, leaseTwoId, otherLeaseId],
    snapshotIds,
    poolId,
    importBatchIds: [importBatchId, otherImportBatchId],
  };
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });

  const signupUrl = new URL("/auth/v1/signup", input.supabaseUrl);

  try {
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
    const viewerSignupResponse = await fetch(signupUrl, {
      method: "POST",
      headers: {
        apikey: input.anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: viewerEmail, password: viewerPassword }),
    });
    const viewerSignupBody = await viewerSignupResponse
      .json()
      .catch(() => ({}));
    if (!viewerSignupResponse.ok) {
      fail(
        `Local viewer Supabase signup failed: ${safeJson(viewerSignupBody)}`,
      );
    }
    const viewerUserId = viewerSignupBody.user?.id;
    if (typeof viewerUserId !== "string") {
      fail("Local viewer Supabase signup did not return a user id.");
    }
    generated.viewerUserId = viewerUserId;

    await sql.begin(async (transaction) => {
      await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id in ${transaction([userId, viewerUserId])}
        `;
      await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values
            (${organizationId}, ${generated.organizationName}, 'active', '{}'::jsonb),
            (${otherOrganizationId}, ${generated.otherOrganizationName}, 'active', '{}'::jsonb)
        `;
      await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${userId}, ${organizationId}, ${signupEmail}, 'Local Actual Billed E2E', 'owner')
          on conflict (id) do update
          set organization_id = excluded.organization_id,
              email = excluded.email,
              full_name = excluded.full_name,
              role = excluded.role
        `;
      await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${viewerUserId}, ${organizationId}, ${viewerEmail}, 'Local Actual Billed E2E Viewer', 'viewer')
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
            ${organizationId},
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
            ${propertyId},
            ${organizationId},
            'Local Actual Billed E2E Tower',
            '500 Recovery Way',
            'Denver',
            'CO',
            '80202',
            50000,
            45000,
            5000,
            0.95
          ),
          (
            ${otherPropertyId},
            ${otherOrganizationId},
            'Other Org Actual Billed Property',
            '999 Hidden Way',
            'Denver',
            'CO',
            '80202',
            25000,
            22500,
            2500,
            0.95
          )
        `;
      await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${unitOneId}, ${propertyId}, '100', 10000, 9000, 1, 'occupied'),
            (${unitTwoId}, ${propertyId}, '200', 15000, 13500, 2, 'occupied'),
            (${otherUnitId}, ${otherPropertyId}, '900', 5000, 4500, 9, 'occupied')
        `;
      await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (${leaseOneId}, ${propertyId}, ${unitOneId}, 'Alpha Retail', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${leaseTwoId}, ${propertyId}, ${unitTwoId}, 'Beta Office', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${otherLeaseId}, ${otherPropertyId}, ${otherUnitId}, 'Hidden Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb)
        `;
      await transaction`
          insert into expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target)
          values (${poolId}, ${propertyId}, 'Operating Expenses', 'operating', true, 0.95)
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
            ${importBatchId},
            ${organizationId},
            ${propertyId},
            'seeded-gl.csv',
            ${"a".repeat(64)},
            'yardi',
            'completed',
            1,
            0
          ),
          (
            ${otherImportBatchId},
            ${otherOrganizationId},
            ${otherPropertyId},
            'other-seeded-gl.csv',
            ${"c".repeat(64)},
            'yardi',
            'completed',
            1,
            0
          )
        `;
      await transaction`
          insert into reconciliation_snapshots (
            id,
            organization_id,
            property_id,
            lease_id,
            period_start_date,
            period_end_date,
            status,
            total_operating_expenses,
            grossed_up_expenses,
            base_year_amount,
            tenant_share_before_cap,
            tenant_share_after_cap,
            admin_fee,
            total_recovery,
            calculation_trace,
            finalized_at,
            finalized_by_user_id
          )
          values
            (${snapshotIds[0]}, ${organizationId}, ${propertyId}, ${leaseOneId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 10000, 10000, 0, 1200, 1200, 0, 1200, '[]'::jsonb, now(), ${userId}),
            (${snapshotIds[1]}, ${organizationId}, ${propertyId}, ${leaseTwoId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 20000, 20000, 0, 2300, 2300, 0, 2300, '[]'::jsonb, now(), ${userId}),
            (${snapshotIds[2]}, ${organizationId}, ${propertyId}, ${leaseOneId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'draft', 10000, 10000, 0, 400, 400, 0, 400, '[]'::jsonb, null, null),
            (${snapshotIds[3]}, ${otherOrganizationId}, ${otherPropertyId}, ${otherLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 9000, 9000, 0, 9999, 9999, 0, 9999, '[]'::jsonb, now(), null)
        `;
      await transaction`
          insert into actual_billed_amounts (
            id,
            organization_id,
            property_id,
            period_start_date,
            period_end_date,
            tenant_name,
            billed_amount,
            source_type
          )
          values (
            ${randomUUID()},
            ${otherOrganizationId},
            ${otherPropertyId},
            ${PERIOD_START}::date,
            ${PERIOD_END}::date,
            'Hidden Tenant',
            8888.88,
            'manual'
          )
        `;
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
    const viewerToken =
      viewerSignupBody.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: viewerEmail,
        password: viewerPassword,
      }));
    if (!viewerToken) {
      fail(
        "Local viewer Supabase signup seed could not mint a password token.",
      );
    }
    generated.viewerToken = viewerToken;

    return generated;
  } catch (error) {
    try {
      await cleanupGeneratedRows(sql, generated);
    } catch (cleanupError) {
      throw new Error(
        `${errorMessage(error)}; seed cleanup also failed: ${errorMessage(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function cleanupGeneratedRows(sql, input) {
  await sql.begin(async (transaction) => {
    await transaction`
      delete from actual_billed_amounts
      where organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or property_id in ${transaction([input.propertyId, input.otherPropertyId])}
    `;
    await transaction`
      delete from reconciliation_snapshots
      where id in ${transaction(input.snapshotIds)}
        or organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or property_id in ${transaction([input.propertyId, input.otherPropertyId])}
        or lease_id in ${transaction(input.leaseIds)}
    `;
    await transaction`
      delete from expense_pools
      where id = ${input.poolId}
        or property_id in ${transaction([input.propertyId, input.otherPropertyId])}
    `;
    await transaction`
      delete from import_batches
      where id in ${transaction(input.importBatchIds)}
        or organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or property_id in ${transaction([input.propertyId, input.otherPropertyId])}
    `;
    await transaction`
      delete from leases
      where id in ${transaction(input.leaseIds)}
        or property_id in ${transaction([input.propertyId, input.otherPropertyId])}
    `;
    await transaction`
      delete from units
      where id in ${transaction(input.unitIds)}
        or property_id in ${transaction([input.propertyId, input.otherPropertyId])}
    `;
    await transaction`
      delete from properties
      where id in ${transaction([input.propertyId, input.otherPropertyId])}
        or organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or user_id in ${transaction([input.userId, input.viewerUserId])}
        or email in ${transaction([input.signupEmail, input.viewerEmail])}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or user_id in ${transaction([input.userId, input.viewerUserId])}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or changed_by in ${transaction([input.userId, input.viewerUserId])}
        or row_id in ${transaction([
          input.userId,
          input.viewerUserId,
          input.organizationId,
          input.otherOrganizationId,
          input.propertyId,
          input.otherPropertyId,
          input.poolId,
          ...input.snapshotIds,
          ...input.unitIds,
          ...input.leaseIds,
          ...input.importBatchIds,
        ])}
    `;
    await transaction`
      delete from users
      where id in ${transaction([input.userId, input.viewerUserId])}
        or email in ${transaction([input.signupEmail, input.viewerEmail])}
        or organization_id in ${transaction([input.organizationId, input.otherOrganizationId])}
    `;
    await transaction`
      delete from auth.users
      where id in ${transaction([input.userId, input.viewerUserId])}
        or email in ${transaction([input.signupEmail, input.viewerEmail])}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction([input.organizationId, input.otherOrganizationId])}
        or name in ${transaction([input.organizationName, input.otherOrganizationName])}
    `;
  });
}

async function assertCleanupComplete(sql, input) {
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql([input.userId, input.viewerUserId])} or email in ${sql([input.signupEmail, input.viewerEmail])}) as auth_users,
      (select count(*)::int from users where id in ${sql([input.userId, input.viewerUserId])} or email in ${sql([input.signupEmail, input.viewerEmail])} or organization_id in ${sql([input.organizationId, input.otherOrganizationId])}) as public_users,
      (select count(*)::int from organizations where id in ${sql([input.organizationId, input.otherOrganizationId])} or name in ${sql([input.organizationName, input.otherOrganizationName])}) as organizations,
      (select count(*)::int from subscriptions where organization_id in ${sql([input.organizationId, input.otherOrganizationId])}) as subscriptions,
      (select count(*)::int from properties where id in ${sql([input.propertyId, input.otherPropertyId])} or organization_id in ${sql([input.organizationId, input.otherOrganizationId])}) as properties,
      (select count(*)::int from units where id in ${sql(input.unitIds)} or property_id in ${sql([input.propertyId, input.otherPropertyId])}) as units,
      (select count(*)::int from leases where id in ${sql(input.leaseIds)} or property_id in ${sql([input.propertyId, input.otherPropertyId])}) as leases,
      (select count(*)::int from expense_pools where id = ${input.poolId} or property_id in ${sql([input.propertyId, input.otherPropertyId])}) as expense_pools,
      (select count(*)::int from import_batches where id in ${sql(input.importBatchIds)} or organization_id in ${sql([input.organizationId, input.otherOrganizationId])} or property_id in ${sql([input.propertyId, input.otherPropertyId])}) as import_batches,
      (select count(*)::int from reconciliation_snapshots where id in ${sql(input.snapshotIds)} or organization_id in ${sql([input.organizationId, input.otherOrganizationId])} or property_id in ${sql([input.propertyId, input.otherPropertyId])} or lease_id in ${sql(input.leaseIds)}) as reconciliation_snapshots,
      (select count(*)::int from actual_billed_amounts where organization_id in ${sql([input.organizationId, input.otherOrganizationId])} or property_id in ${sql([input.propertyId, input.otherPropertyId])}) as actual_billed_amounts,
      (select count(*)::int from legal_acceptances where organization_id in ${sql([input.organizationId, input.otherOrganizationId])} or user_id in ${sql([input.userId, input.viewerUserId])}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id in ${sql([input.organizationId, input.otherOrganizationId])} or user_id in ${sql([input.userId, input.viewerUserId])} or email in ${sql([input.signupEmail, input.viewerEmail])}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql([input.organizationId, input.otherOrganizationId])} or changed_by in ${sql([input.userId, input.viewerUserId])}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function postCsv(input) {
  const form = new FormData();
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    form.append(key, value);
  }
  form.append(
    "file",
    new Blob([input.csv], { type: "text/csv" }),
    input.filename,
  );

  return expectJson(input.url, {
    method: "POST",
    headers: input.authHeaders,
    body: form,
    status: input.status,
  });
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
    resolve(tmpdir(), "capveri-actual-billed-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-actual-billed-e2e");
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
      lastError = error instanceof Error ? error.message : String(error);
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

async function expectError(runRequest, expected, label) {
  const body = await runRequest();
  assertExactJson(body, expected, `${label} error body`);
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

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertCloseNumber(actual, expected, message) {
  assert(
    typeof actual === "number" && Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

function assertExactJson(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(actual && typeof actual === "object", `${label} should be an object`);
  assertExactJson(
    Object.keys(actual).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function assertNoGeneratedMarkerLeak(value, marker) {
  assert(!JSON.stringify(value).includes(marker), `${marker} leaked`);
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
