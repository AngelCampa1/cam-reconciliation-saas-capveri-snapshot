import { execFile, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { promisify, TextDecoder } from "node:util";
import { inflateSync } from "node:zlib";
import { unzipSync } from "fflate";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8851";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_REPORTS_BUCKET = "capveri-reports-dev";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const R2_STORAGE_PREFIX = "r2:";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const execFileAsync = promisify(execFile);
const GENERIC_ERP_HEADER = [
  "Property",
  "Unit",
  "Tenant",
  "Period Start",
  "Period End",
  "Total Expenses",
  "Grossed Up Expenses",
  "Base Year Amount",
  "Tenant Share Before Cap",
  "Tenant Share After Cap",
  "Admin Fee",
  "Amount Due",
];
const EXPORT_HISTORY_KEYS = ["items", "total", "page", "page_size"];
const EXPORT_HISTORY_ROW_KEYS = [
  "id",
  "organization_id",
  "property_id",
  "format",
  "file_name",
  "file_size",
  "status",
  "created_by_name",
  "created_at",
  "storage_path",
];
const DOWNLOAD_KEYS = ["download_url", "file_name", "expires_at"];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local exports E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
    "supabase-url",
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
    ])) ??
    LOCAL_ANON_KEY;

  if (process.env.CI) {
    fail("Refusing to run local exports E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          anonKey,
          databaseUrl,
          index,
        }),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          supabase_url: supabaseUrl,
          repeat,
          runs,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    runError = error;
  } finally {
    await worker.close();
  }

  if (runError) throw runError;
}

async function runOnce(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.ownerToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccessToken);
  const generatedR2StoragePaths = [];

  try {
    const erp = await expectBytes(
      `${input.baseUrl}/api/v1/exports/reconciliation/snapshots/${account.snapshot2025Id}/export/erp?format=csv`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      erp.contentType.includes("text/csv"),
      "ERP CSV content-type mismatch",
    );
    assert(
      erp.contentDisposition.includes("attachment"),
      "ERP attachment missing",
    );
    assert(
      erp.contentDisposition.includes('filename="CAM_Reconciliation_2025.csv"'),
      "ERP CSV filename mismatch",
    );
    const erpText = decode(erp.bytes);
    assertGenericErpCsv(
      erpText,
      [genericErpRow(account, "2025", account.tenantOneName)],
      "ERP CSV",
    );
    assertExcludes(erpText, account.hiddenTenantName, "ERP CSV hidden tenant");
    assertExcludes(erpText, account.draftRecovery, "ERP CSV draft recovery");

    const batch = await expectBytes(
      `${input.baseUrl}/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${account.propertyId}&period_start=2025-01-01&period_end=2026-12-31&format=csv`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      batch.contentType.includes("text/csv"),
      "batch CSV content-type mismatch",
    );
    assert(
      batch.contentDisposition.includes(
        'filename="CAM_Reconciliation_2025.csv"',
      ),
      "batch CSV filename mismatch",
    );
    const batchText = decode(batch.bytes);
    assertGenericErpCsv(
      batchText,
      [
        genericErpRow(account, "2025", account.tenantOneName),
        genericErpRow(account, "2026", account.tenantTwoName),
      ],
      "batch CSV",
    );
    assertExcludes(
      batchText,
      account.draftRecovery,
      "batch CSV draft recovery",
    );
    assertExcludes(
      batchText,
      account.hiddenRecovery,
      "batch CSV hidden recovery",
    );

    const snapshotPdf = await expectBytes(
      `${input.baseUrl}/api/v1/exports/reconciliation/snapshots/${account.snapshot2025Id}/export/pdf`,
      { headers: ownerHeaders, status: 200 },
    );
    assertPdf(snapshotPdf, "snapshot PDF");
    assertReconciliationPdfText(snapshotPdf.bytes, account, {
      tenantName: account.tenantOneName,
      startYear: "2025",
      recovery: account.recovery2025,
      label: "snapshot PDF",
    });
    assertNoExportLeakage(
      extractPdfText(snapshotPdf.bytes),
      account,
      "snapshot PDF",
    );
    assert(
      snapshotPdf.contentDisposition.includes("Reconciliation_") &&
        snapshotPdf.contentDisposition.includes(".pdf"),
      "snapshot PDF filename mismatch",
    );

    const hiddenSnapshotError = await expectError(
      `${input.baseUrl}/api/v1/exports/reconciliation/snapshots/${account.hiddenSnapshotId}/export/pdf`,
      { headers: ownerHeaders, status: 404, code: "snapshot_not_found" },
    );
    assertErrorBody(hiddenSnapshotError, {
      code: "snapshot_not_found",
      detail: "Snapshot not found",
      label: "hidden snapshot PDF",
    });
    const draftSnapshotError = await expectError(
      `${input.baseUrl}/api/v1/exports/reconciliation/snapshots/${account.draftSnapshotId}/export/pdf`,
      { headers: ownerHeaders, status: 400, code: "snapshot_not_finalized" },
    );
    assertErrorBody(draftSnapshotError, {
      code: "snapshot_not_finalized",
      detail: "Cannot export draft snapshot. Set allow_draft=true to override.",
      label: "draft snapshot PDF",
    });
    const draftPdf = await expectBytes(
      `${input.baseUrl}/api/v1/exports/reconciliation/snapshots/${account.draftSnapshotId}/export/pdf?allow_draft=true`,
      { headers: ownerHeaders, status: 200 },
    );
    assertPdf(draftPdf, "draft snapshot PDF");
    assertReconciliationPdfText(draftPdf.bytes, account, {
      tenantName: account.tenantOneName,
      startYear: "2026",
      recovery: account.draftRecovery,
      label: "draft snapshot PDF",
    });
    assertNoExportLeakage(
      extractPdfText(draftPdf.bytes),
      account,
      "draft snapshot PDF",
    );

    const sideEffectsBefore = await countExportSideEffects(sql, account);
    const propertyPdf = await expectBytes(
      `${input.baseUrl}/api/v1/export/pdf/download`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.propertyId,
          year: 2026,
        }),
      },
    );
    assertPdf(propertyPdf, "property PDF download");
    assertReconciliationPdfText(propertyPdf.bytes, account, {
      tenantName: account.tenantTwoName,
      startYear: "2026",
      recovery: account.recovery2026,
      label: "property PDF download",
    });
    assertNoExportLeakage(
      extractPdfText(propertyPdf.bytes),
      account,
      "property PDF download",
    );
    assert(
      propertyPdf.contentDisposition.includes(
        'filename="reconciliation-2026-property.pdf"',
      ),
      "property PDF filename mismatch",
    );
    const pdfHistory = await findExportHistory(sql, {
      organizationId: account.organizationId,
      propertyId: account.propertyId,
      format: "pdf",
      fileSize: propertyPdf.bytes.byteLength,
    });
    assert(pdfHistory.status === "completed", "PDF export status mismatch");
    assertExportHistoryDbRow(pdfHistory, account, {
      format: "pdf",
      fileName: "reconciliation-2026-property.pdf",
      fileSize: propertyPdf.bytes.byteLength,
      label: "PDF export history DB row",
    });
    assertR2StoragePath(pdfHistory.storage_path, account, "PDF export storage");
    generatedR2StoragePaths.push(pdfHistory.storage_path);
    assert(
      pdfHistory.created_by_name === account.ownerFullName ||
        pdfHistory.created_by_name === account.ownerEmail,
      "PDF export created_by_name mismatch",
    );

    const history = await expectJson(
      `${input.baseUrl}/api/v1/export/history?property_id=${account.propertyId}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertExportHistoryPage(history, account, [pdfHistory]);

    const download = await expectJson(
      `${input.baseUrl}/api/v1/export/download/${pdfHistory.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertDownloadResponse(download, {
      fileName: "reconciliation-2026-property.pdf",
      label: "PDF download token",
    });

    const publicPdf = await expectBytes(download.download_url, { status: 200 });
    assertPdf(publicPdf, "public token PDF");
    assert(
      bytesEqual(publicPdf.bytes, propertyPdf.bytes),
      "public token PDF did not match the persisted property PDF",
    );

    const variance = await expectBytes(
      `${input.baseUrl}/api/v1/export/variance/excel`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.propertyId,
          current_year: 2026,
          prior_year: 2025,
        }),
      },
    );
    assert(
      variance.contentType.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
      "variance XLSX content-type mismatch",
    );
    assert(
      variance.contentDisposition.includes(
        'filename="statement-check-report-2026-vs-2025.xlsx"',
      ),
      "variance XLSX filename mismatch",
    );
    assertVarianceXlsx(variance.bytes, account);
    const varianceHistory = await findExportHistory(sql, {
      organizationId: account.organizationId,
      propertyId: account.propertyId,
      format: "variance_excel",
      fileSize: variance.bytes.byteLength,
    });
    assertExportHistoryDbRow(varianceHistory, account, {
      format: "variance_excel",
      fileName: "statement-check-report-2026-vs-2025.xlsx",
      fileSize: variance.bytes.byteLength,
      label: "variance export history DB row",
    });
    assertR2StoragePath(
      varianceHistory.storage_path,
      account,
      "variance export storage",
    );
    generatedR2StoragePaths.push(varianceHistory.storage_path);
    const varianceDownload = await expectJson(
      `${input.baseUrl}/api/v1/export/download/${varianceHistory.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertDownloadResponse(varianceDownload, {
      fileName: "statement-check-report-2026-vs-2025.xlsx",
      label: "variance XLSX download token",
    });

    const publicVariance = await expectBytes(varianceDownload.download_url, {
      status: 200,
    });
    assert(
      publicVariance.contentType.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
      "public variance XLSX content-type mismatch",
    );
    assert(
      publicVariance.cacheControl === "private, max-age=0, no-store",
      "public variance XLSX cache-control mismatch",
    );
    assert(
      publicVariance.contentTypeOptions === "nosniff",
      "public variance XLSX nosniff header missing",
    );
    assert(
      publicVariance.contentDisposition.includes(
        'filename="statement-check-report-2026-vs-2025.xlsx"',
      ),
      "public variance XLSX filename mismatch",
    );
    assert(
      bytesEqual(publicVariance.bytes, variance.bytes),
      "public variance XLSX did not match the persisted variance workbook",
    );
    assertVarianceXlsx(publicVariance.bytes, account);
    const missingTokenError = await expectError(
      `${input.baseUrl}/api/v1/export/download/file`,
      {
        status: 400,
        code: "missing_token",
      },
    );
    assertErrorBody(missingTokenError, {
      code: "missing_token",
      detail: "token query parameter is required",
      label: "missing public export token",
    });
    const invalidTokenError = await expectError(
      `${input.baseUrl}/api/v1/export/download/file?token=not-a-valid-token`,
      {
        status: 400,
        code: "invalid_export_token",
      },
    );
    assertErrorBody(invalidTokenError, {
      code: "invalid_export_token",
      detail: "Invalid download link.",
      label: "invalid public export token",
    });
    const historyAfterVariance = await expectJson(
      `${input.baseUrl}/api/v1/export/history?property_id=${account.propertyId}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertExportHistoryPage(historyAfterVariance, account, [
      varianceHistory,
      pdfHistory,
    ]);
    const sideEffectsAfter = await countExportSideEffects(sql, account);
    assert(
      sideEffectsAfter.export_history === sideEffectsBefore.export_history + 2,
      "unexpected export_history side-effect count",
    );
    assert(
      sideEffectsAfter.audit_log === sideEffectsBefore.audit_log,
      "unexpected audit_log side-effect count",
    );
    assert(
      sideEffectsAfter.credit_consumption_log ===
        sideEffectsBefore.credit_consumption_log,
      "unexpected credit_consumption_log side-effect count",
    );

    const noAccessPdfError = await expectError(
      `${input.baseUrl}/api/v1/export/pdf/download`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        code: "subscription_required",
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          year: 2026,
        }),
      },
    );
    assertErrorBody(noAccessPdfError, {
      code: "subscription_required",
      detail:
        "subscription_required: Your free trial has ended. Choose a plan and add billing to keep using this feature.",
      label: "no-access property PDF",
    });
    const noAccessVarianceError = await expectError(
      `${input.baseUrl}/api/v1/export/variance/excel`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        code: "subscription_required",
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          current_year: 2026,
          prior_year: 2025,
        }),
      },
    );
    assertErrorBody(noAccessVarianceError, {
      code: "subscription_required",
      detail:
        "subscription_required: Your free trial has ended. Choose a plan and add billing to keep using this feature.",
      label: "no-access variance XLSX",
    });

    return {
      index: input.index,
      organization_id: account.organizationId,
      property_id: account.propertyId,
      pdf_export_id: pdfHistory.id,
      variance_export_id: varianceHistory.id,
      r2_storage_paths_deleted: [
        pdfHistory.storage_path,
        varianceHistory.storage_path,
      ],
    };
  } finally {
    await cleanupRun(sql, account, generatedR2StoragePaths);
  }
}

async function cleanupRun(sql, account, generatedR2StoragePaths) {
  let cleanupError;
  try {
    const historyStoragePaths = await findGeneratedExportStoragePaths(
      sql,
      account,
    );
    await cleanupReportsR2Objects([
      ...generatedR2StoragePaths,
      ...historyStoragePaths,
    ]);
  } catch (error) {
    cleanupError = error;
  }
  try {
    await cleanupAccount(sql, account);
    await assertCleanupComplete(sql, account);
  } catch (error) {
    cleanupError ??= error;
  }
  try {
    await sql.end({ timeout: 5 });
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) throw cleanupError;
}

async function findGeneratedExportStoragePaths(sql, account) {
  const rows = await sql`
    select storage_path
    from export_history
    where organization_id in ${sql([
      account.organizationId,
      account.hiddenOrganizationId,
      account.noAccessOrganizationId,
    ])}
       or property_id in ${sql([
         account.propertyId,
         account.hiddenPropertyId,
         account.noAccessPropertyId,
       ])}
       or created_by_name in ${sql(account.userNames)}
  `;
  return rows
    .map((row) => row.storage_path)
    .filter((storagePath) => typeof storagePath === "string");
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    propertyId: randomUUID(),
    unitOneId: randomUUID(),
    unitTwoId: randomUUID(),
    leaseOneId: randomUUID(),
    leaseTwoId: randomUUID(),
    snapshot2025Id: randomUUID(),
    snapshot2026Id: randomUUID(),
    draftSnapshotId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    hiddenUnitId: randomUUID(),
    hiddenLeaseId: randomUUID(),
    hiddenSnapshotId: randomUUID(),
    noAccessPropertyId: randomUUID(),
    noAccessUnitId: randomUUID(),
    noAccessLeaseId: randomUUID(),
  };
  const ownerFullName = `Local Exports Owner ${suffix}`;
  const hiddenFullName = `Local Exports Hidden Owner ${suffix}`;
  const noAccessFullName = `Local Exports No Access ${suffix}`;
  const propertyName = `Local Exports Plaza ${suffix}`;
  const hiddenPropertyName = `Local Exports Hidden Plaza ${suffix}`;
  const noAccessPropertyName = `Local Exports No Access Plaza ${suffix}`;
  const tenantOneName = `Local Exports Tenant Alpha ${suffix}`;
  const tenantTwoName = `Local Exports Tenant Beta ${suffix}`;
  const hiddenTenantName = `Local Exports Hidden Tenant ${suffix}`;
  const noAccessTenantName = `Local Exports No Access Tenant ${suffix}`;
  const ownerOrganizationName = `Local Exports Owner Org ${suffix}`;
  const hiddenOrganizationName = `Local Exports Hidden Org ${suffix}`;
  const noAccessOrganizationName = `Local Exports No Access Org ${suffix}`;
  const ownerEmail = `exports-e2e-owner-${suffix}@capveri.local`;
  const hiddenEmail = `exports-e2e-hidden-${suffix}@capveri.local`;
  const noAccessEmail = `exports-e2e-no-access-${suffix}@capveri.local`;
  const recovery2025 = "1250.75";
  const recovery2026 = "2440.25";
  const draftRecovery = "7777.77";
  const hiddenRecovery = "9999.99";
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const created = [];
  let owner;
  let hidden;
  let noAccess;

  try {
    owner = await createLocalAuthUser(input, {
      created,
      email: ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: ownerFullName,
      organizationName: ownerOrganizationName,
    });
    hidden = await createLocalAuthUser(input, {
      created,
      email: hiddenEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: hiddenFullName,
      organizationName: hiddenOrganizationName,
    });
    noAccess = await createLocalAuthUser(input, {
      created,
      email: noAccessEmail,
      password: `NoAccessPass${input.index}A1!`,
      fullName: noAccessFullName,
      organizationName: noAccessOrganizationName,
    });

    await sql.begin(async (transaction) => {
      await transaction`
        update users
        set role = 'owner', full_name = ${ownerFullName}, updated_at = now()
        where id = ${owner.userId}
      `;
      await transaction`
        update users
        set role = 'owner', full_name = ${hiddenFullName}, updated_at = now()
        where id = ${hidden.userId}
      `;
      await transaction`
        update users
        set role = 'owner', full_name = ${noAccessFullName}, updated_at = now()
        where id = ${noAccess.userId}
      `;
      await transaction`
        insert into subscriptions (
          organization_id, plan, status, stripe_subscription_id,
          current_period_start, current_period_end
        )
        values
          (${owner.organizationId}, 'professional', 'active', ${`sub_exports_owner_${suffix}`}, now(), now() + interval '30 days'),
          (${hidden.organizationId}, 'professional', 'trialing', null, now(), now() + interval '30 days')
      `;
      await insertProperty(transaction, {
        id: ids.propertyId,
        orgId: owner.organizationId,
        name: propertyName,
        address: "700 Export Way",
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        orgId: hidden.organizationId,
        name: hiddenPropertyName,
        address: "701 Hidden Export Way",
      });
      await insertProperty(transaction, {
        id: ids.noAccessPropertyId,
        orgId: noAccess.organizationId,
        name: noAccessPropertyName,
        address: "702 No Access Export Way",
      });
      await insertUnit(transaction, {
        id: ids.unitOneId,
        propertyId: ids.propertyId,
        unitNumber: "100",
      });
      await insertUnit(transaction, {
        id: ids.unitTwoId,
        propertyId: ids.propertyId,
        unitNumber: "200",
      });
      await insertUnit(transaction, {
        id: ids.hiddenUnitId,
        propertyId: ids.hiddenPropertyId,
        unitNumber: "900",
      });
      await insertUnit(transaction, {
        id: ids.noAccessUnitId,
        propertyId: ids.noAccessPropertyId,
        unitNumber: "300",
      });
      await insertLease(transaction, {
        id: ids.leaseOneId,
        propertyId: ids.propertyId,
        unitId: ids.unitOneId,
        tenantName: tenantOneName,
        proRataShare: "0.25",
      });
      await insertLease(transaction, {
        id: ids.leaseTwoId,
        propertyId: ids.propertyId,
        unitId: ids.unitTwoId,
        tenantName: tenantTwoName,
        proRataShare: "0.35",
      });
      await insertLease(transaction, {
        id: ids.hiddenLeaseId,
        propertyId: ids.hiddenPropertyId,
        unitId: ids.hiddenUnitId,
        tenantName: hiddenTenantName,
        proRataShare: "0.40",
      });
      await insertLease(transaction, {
        id: ids.noAccessLeaseId,
        propertyId: ids.noAccessPropertyId,
        unitId: ids.noAccessUnitId,
        tenantName: noAccessTenantName,
        proRataShare: "0.10",
      });
      await insertSnapshot(transaction, {
        id: ids.snapshot2025Id,
        orgId: owner.organizationId,
        propertyId: ids.propertyId,
        leaseId: ids.leaseOneId,
        start: "2025-01-01",
        end: "2025-12-31",
        status: "finalized",
        recovery: recovery2025,
        finalizedBy: owner.userId,
      });
      await insertSnapshot(transaction, {
        id: ids.snapshot2026Id,
        orgId: owner.organizationId,
        propertyId: ids.propertyId,
        leaseId: ids.leaseTwoId,
        start: "2026-01-01",
        end: "2026-12-31",
        status: "finalized",
        recovery: recovery2026,
        finalizedBy: owner.userId,
      });
      await insertSnapshot(transaction, {
        id: ids.draftSnapshotId,
        orgId: owner.organizationId,
        propertyId: ids.propertyId,
        leaseId: ids.leaseOneId,
        start: "2026-01-01",
        end: "2026-12-31",
        status: "draft",
        recovery: draftRecovery,
        finalizedBy: null,
      });
      await insertSnapshot(transaction, {
        id: ids.hiddenSnapshotId,
        orgId: hidden.organizationId,
        propertyId: ids.hiddenPropertyId,
        leaseId: ids.hiddenLeaseId,
        start: "2026-01-01",
        end: "2026-12-31",
        status: "finalized",
        recovery: hiddenRecovery,
        finalizedBy: hidden.userId,
      });
    });
  } catch (error) {
    await cleanupGeneratedRows(sql, {
      orgIds: [
        ...created.map((account) => account.organizationId),
        owner?.organizationId,
        hidden?.organizationId,
        noAccess?.organizationId,
      ],
      userIds: [
        ...created.map((account) => account.userId),
        owner?.userId,
        hidden?.userId,
        noAccess?.userId,
      ],
      emails: [ownerEmail, hiddenEmail, noAccessEmail],
      organizationNames: [
        ownerOrganizationName,
        hiddenOrganizationName,
        noAccessOrganizationName,
      ],
      propertyIds: [
        ids.propertyId,
        ids.hiddenPropertyId,
        ids.noAccessPropertyId,
      ],
      propertyNames: [propertyName, hiddenPropertyName, noAccessPropertyName],
      unitIds: [
        ids.unitOneId,
        ids.unitTwoId,
        ids.hiddenUnitId,
        ids.noAccessUnitId,
      ],
      leaseIds: [
        ids.leaseOneId,
        ids.leaseTwoId,
        ids.hiddenLeaseId,
        ids.noAccessLeaseId,
      ],
      snapshotIds: [
        ids.snapshot2025Id,
        ids.snapshot2026Id,
        ids.draftSnapshotId,
        ids.hiddenSnapshotId,
      ],
      userNames: [ownerFullName, hiddenFullName, noAccessFullName],
      tenantNames: [
        tenantOneName,
        tenantTwoName,
        hiddenTenantName,
        noAccessTenantName,
      ],
    });
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }

  return {
    ...ids,
    ownerUserId: owner.userId,
    ownerToken: owner.accessToken,
    ownerEmail,
    ownerFullName,
    organizationId: owner.organizationId,
    ownerOrganizationName,
    hiddenUserId: hidden.userId,
    hiddenToken: hidden.accessToken,
    hiddenEmail,
    hiddenOrganizationId: hidden.organizationId,
    hiddenOrganizationName,
    noAccessUserId: noAccess.userId,
    noAccessToken: noAccess.accessToken,
    noAccessEmail,
    noAccessOrganizationId: noAccess.organizationId,
    noAccessOrganizationName,
    propertyName,
    hiddenPropertyName,
    noAccessPropertyName,
    tenantOneName,
    tenantTwoName,
    hiddenTenantName,
    noAccessTenantName,
    recovery2025,
    recovery2026,
    draftRecovery,
    hiddenRecovery,
    userNames: [ownerFullName, hiddenFullName, noAccessFullName],
    tenantNames: [
      tenantOneName,
      tenantTwoName,
      hiddenTenantName,
      noAccessTenantName,
    ],
  };
}

async function createLocalAuthUser(input, user) {
  const { created, ...profile } = user;
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: profile.email,
      password: profile.password,
      data: {
        full_name: profile.fullName,
        organization_name: profile.organizationName,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
  }
  const userId = body.user?.id;
  assert(typeof userId === "string", "signup did not return user id");
  const partial = {
    ...profile,
    userId,
    organizationId: undefined,
    accessToken: undefined,
  };
  created?.push(partial);

  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let organizationId;
  try {
    await sql`
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = ${userId}
    `;
    const rows = await sql`
      select organization_id
      from users
      where id = ${userId}
      limit 1
    `;
    organizationId = rows[0]?.organization_id;
    partial.organizationId = organizationId;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const accessToken =
    body.session?.access_token ??
    (await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: profile.email,
      password: profile.password,
    }));
  assert(typeof accessToken === "string", "signup did not return token");
  assert(typeof organizationId === "string", "signup org missing");
  partial.accessToken = accessToken;

  return { ...profile, userId, organizationId, accessToken };
}

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.orgId}, ${input.name}, ${input.address},
      'Austin', 'TX', '78701', 100000, 90000, 10000, 0.9500
    )
  `;
}

async function insertUnit(sql, input) {
  await sql`
    insert into units (
      id, property_id, unit_number, floor, rentable_sqft, usable_sqft, status
    )
    values (${input.id}, ${input.propertyId}, ${input.unitNumber}, 1, 10000, 9000, 'occupied')
  `;
}

async function insertLease(sql, input) {
  await sql`
    insert into leases (
      id, property_id, unit_id, tenant_name, status, start_date, end_date,
      recovery_profile
    )
    values (
      ${input.id}, ${input.propertyId}, ${input.unitId}, ${input.tenantName},
      'active', '2024-01-01', '2028-12-31',
      ${sql.json({
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: input.proRataShare,
        cap_type: "none",
        cap_rate: null,
        admin_fee_percentage: "0.10",
        excluded_pools: [],
      })}
    )
  `;
}

async function insertSnapshot(sql, input) {
  await sql`
    insert into reconciliation_snapshots (
      id, organization_id, property_id, lease_id, period_start_date,
      period_end_date, status, total_operating_expenses, grossed_up_expenses,
      base_year_amount, tenant_share_before_cap, tenant_share_after_cap,
      admin_fee, total_recovery, calculation_trace, finalized_at,
      finalized_by_user_id
    )
    values (
      ${input.id}, ${input.orgId}, ${input.propertyId}, ${input.leaseId},
      ${input.start}, ${input.end}, ${input.status}, 10000.00, 10500.00,
      5000.00, ${input.recovery}, ${input.recovery}, 125.00,
      ${input.recovery},
      ${sql.json([
        {
          step_name: "Local exports E2E recovery",
          operation: "seeded deterministic recovery",
          output_value: input.recovery,
          output_unit: "USD",
          note: "Seeded for local Worker export route verification",
        },
      ])},
      ${input.status === "finalized" ? sql`now()` : null},
      ${input.finalizedBy}
    )
  `;
}

async function findExportHistory(sql, input) {
  const rows = await sql`
    select id, organization_id, property_id, format, file_name, file_size::int,
           status, created_by_name, created_at::text, storage_path
    from export_history
    where organization_id = ${input.organizationId}
      and property_id = ${input.propertyId}
      and format = ${input.format}
      and file_size = ${input.fileSize}
      and status = 'completed'
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  assert(row, `export_history row missing for format ${input.format}`);
  assert(row.organization_id === input.organizationId, "export org mismatch");
  assert(row.property_id === input.propertyId, "export property mismatch");
  return row;
}

function assertReconciliationPdfText(bytes, account, expected) {
  const text = extractPdfText(bytes);
  assertPdfTextContains(
    bytes,
    [
      account.ownerOrganizationName,
      "Tenant Reconciliation Statement",
      `Period: January 1, ${expected.startYear} - December 31, ${expected.startYear}`,
      `Property: ${account.propertyName}`,
      "Address: 700 Export Way",
      `Tenant: ${expected.tenantName}`,
      "Total Operating Expenses",
      "$10,000.00",
      "Grossed-Up Expenses",
      "$10,500.00",
      "Base Year Amount",
      "$5,000.00",
      "Tenant Share (Before Cap)",
      amountMarker(expected.recovery),
      "Tenant Share (After Cap)",
      "Administrative Fee",
      "$125.00",
      "Total Amount Due",
      "Local exports E2E recovery",
      "seeded deterministic recovery",
      "Seeded for local Worker export route verification",
    ],
    expected.label,
  );
  assert(
    text.includes(amountMarker(expected.recovery)),
    `${expected.label} recovery missing`,
  );
}

function amountMarker(raw) {
  return `$${Number(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function assertExportHistoryPage(history, account, expectedRows) {
  assertExactKeys(history, EXPORT_HISTORY_KEYS, "export history page");
  assert(
    history.total === expectedRows.length,
    "export history total mismatch",
  );
  assert(history.page === 1, "export history page mismatch");
  assert(history.page_size === 25, "export history page_size mismatch");
  assert(
    history.items.length === expectedRows.length,
    "export history item count mismatch",
  );
  for (let index = 0; index < expectedRows.length; index += 1) {
    const item = history.items[index];
    const expected = expectedRows[index];
    assertExactKeys(
      item,
      EXPORT_HISTORY_ROW_KEYS,
      `export history item ${index}`,
    );
    assertJsonEqual(
      item,
      {
        id: expected.id,
        organization_id: account.organizationId,
        property_id: account.propertyId,
        format: expected.format,
        file_name: expected.file_name,
        file_size: expected.file_size,
        status: "completed",
        created_by_name: expected.created_by_name,
        created_at: expected.created_at,
        storage_path: expected.storage_path,
      },
      `export history item ${index}`,
    );
  }
  assertNoExportLeakage(JSON.stringify(history), account, "export history");
}

function assertExportHistoryDbRow(row, account, expected) {
  assertExactKeys(row, EXPORT_HISTORY_ROW_KEYS, expected.label);
  assertJsonEqual(
    {
      organization_id: row.organization_id,
      property_id: row.property_id,
      format: row.format,
      file_name: row.file_name,
      file_size: row.file_size,
      status: row.status,
      created_by_name: row.created_by_name,
    },
    {
      organization_id: account.organizationId,
      property_id: account.propertyId,
      format: expected.format,
      file_name: expected.fileName,
      file_size: expected.fileSize,
      status: "completed",
      created_by_name: account.ownerFullName,
    },
    expected.label,
  );
  assert(
    !Number.isNaN(Date.parse(row.created_at)),
    `${expected.label} created_at invalid`,
  );
}

function assertDownloadResponse(download, expected) {
  assertExactKeys(download, DOWNLOAD_KEYS, expected.label);
  const url = new URL(download.download_url);
  assert(
    url.pathname === "/api/v1/export/download/file",
    `${expected.label} path mismatch`,
  );
  assert(
    typeof url.searchParams.get("token") === "string",
    `${expected.label} token missing`,
  );
  assert(
    download.file_name === expected.fileName,
    `${expected.label} file_name mismatch`,
  );
  assert(
    !Number.isNaN(Date.parse(download.expires_at)),
    `${expected.label} expires_at invalid`,
  );
}

function assertR2StoragePath(storagePath, account, label) {
  assert(typeof storagePath === "string", `${label} storage path missing`);
  assert(storagePath.startsWith("r2:reports/"), `${label} prefix mismatch`);
  assert(!storagePath.includes("\\"), `${label} contains backslash`);
  assert(!storagePath.includes(".."), `${label} contains traversal`);
  const key = storagePath.slice(R2_STORAGE_PREFIX.length);
  const segments = key.split("/");
  assertJsonEqual(
    segments.slice(0, 3),
    ["reports", account.organizationId, account.propertyId],
    `${label} key prefix`,
  );
  assert(
    /^[0-9a-f-]{36}-.+/iu.test(segments[3] ?? ""),
    `${label} file segment mismatch`,
  );
}

function assertVarianceXlsx(bytes, account) {
  const rows = parseXlsxRows(bytes);
  assertJsonEqual(
    rows.slice(0, 6),
    [
      [`Statement Check Report - ${account.propertyName}`],
      ["2026 vs 2025 | Threshold: 10%"],
      [
        "We checked final billing totals for 2025 and 2026. We found the billing total changed by 95.10%.",
      ],
      ["Period", "Total Recovery", "Variance"],
      ["2026", 2440.25],
      ["2025", 1250.75, 0.9510293823710001],
    ],
    "variance XLSX rows",
  );
  assert(
    typeof rows[6]?.[0] === "string" && rows[6][0].startsWith("Generated: "),
    "variance XLSX generated timestamp row mismatch",
  );
  const workbookText = Object.entries(unzipSync(bytes))
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, entry]) => decode(entry))
    .join("\n");
  assertNoExportLeakage(workbookText, account, "variance XLSX");
}

function parseXlsxRows(bytes) {
  const entries = unzipSync(bytes);
  const sharedStrings = parseSharedStrings(entries["xl/sharedStrings.xml"]);
  const sheet = entries["xl/worksheets/sheet1.xml"];
  assert(sheet, "variance XLSX sheet1 missing");
  const xml = decode(sheet);
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)) {
    const rowCells = [];
    const rowXml = rowMatch[1] ?? "";
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/u.exec(attrs)?.[1] ?? "A";
      const index = columnIndex(ref);
      rowCells[index] = parseXlsxCell(attrs, body, sharedStrings);
    }
    rows.push(trimTrailingUndefined(rowCells));
  }
  return rows;
}

function parseSharedStrings(bytes) {
  if (!bytes) return [];
  const xml = decode(bytes);
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/gu)].map((match) =>
    [...(match[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((textMatch) => decodeXml(textMatch[1] ?? ""))
      .join(""),
  );
}

function parseXlsxCell(attrs, body, sharedStrings) {
  const value = /<v>([\s\S]*?)<\/v>/u.exec(body)?.[1];
  if (attrs.includes('t="s"')) return sharedStrings[Number(value)] ?? "";
  if (attrs.includes('t="str"')) return decodeXml(value ?? "");
  const inline = /<t[^>]*>([\s\S]*?)<\/t>/u.exec(body)?.[1];
  if (inline !== undefined) return decodeXml(inline);
  if (value === undefined) return "";
  const numeric = Number(value);
  return Number.isNaN(numeric) ? decodeXml(value) : numeric;
}

function columnIndex(column) {
  let index = 0;
  for (const char of column) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function trimTrailingUndefined(values) {
  let end = values.length;
  while (end > 0 && values[end - 1] === undefined) end -= 1;
  return values.slice(0, end).map((value) => value ?? "");
}

function decodeXml(value) {
  return value
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function assertErrorBody(body, expected) {
  assertJsonEqual(
    body,
    {
      detail: expected.detail,
      error: { code: expected.code, message: expected.detail },
    },
    `${expected.label} error body`,
  );
}

async function countExportSideEffects(sql, account) {
  const rows = await sql`
    select
      (select count(*)::int from export_history where organization_id = ${account.organizationId} and property_id = ${account.propertyId}) as export_history,
      (select count(*)::int from audit_log where organization_id = ${account.organizationId}) as audit_log,
      (select count(*)::int from credit_consumption_log where organization_id = ${account.organizationId}) as credit_consumption_log
  `;
  return rows[0];
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  const actualKeys = Object.keys(actual).sort();
  const sortedExpected = [...expectedKeys].sort();
  assertJsonEqual(actualKeys, sortedExpected, `${label} keys`);
}

function assertNoExportLeakage(text, account, label) {
  const serialized = String(text);
  for (const leaked of [
    account.hiddenOrganizationId,
    account.hiddenPropertyId,
    account.hiddenSnapshotId,
    account.hiddenPropertyName,
    account.hiddenTenantName,
    account.hiddenRecovery,
    account.noAccessOrganizationId,
    account.noAccessPropertyId,
    account.noAccessPropertyName,
    account.noAccessTenantName,
  ]) {
    assert(!serialized.includes(leaked), `${label} leaked ${leaked}`);
  }
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
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  let childError;
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
    await handle.close();
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-exports-e2e-"));
  const path = resolve(directory, ".dev.vars.local-exports-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-exports-e2e-signing-secret",
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

async function cleanupAccount(sql, account) {
  await cleanupGeneratedRows(sql, {
    orgIds: [
      account.organizationId,
      account.hiddenOrganizationId,
      account.noAccessOrganizationId,
    ],
    userIds: [
      account.ownerUserId,
      account.hiddenUserId,
      account.noAccessUserId,
    ],
    emails: [account.ownerEmail, account.hiddenEmail, account.noAccessEmail],
    organizationNames: [
      account.ownerOrganizationName,
      account.hiddenOrganizationName,
      account.noAccessOrganizationName,
    ],
    propertyIds: [
      account.propertyId,
      account.hiddenPropertyId,
      account.noAccessPropertyId,
    ],
    propertyNames: [
      account.propertyName,
      account.hiddenPropertyName,
      account.noAccessPropertyName,
    ],
    unitIds: [
      account.unitOneId,
      account.unitTwoId,
      account.hiddenUnitId,
      account.noAccessUnitId,
    ],
    leaseIds: [
      account.leaseOneId,
      account.leaseTwoId,
      account.hiddenLeaseId,
      account.noAccessLeaseId,
    ],
    snapshotIds: [
      account.snapshot2025Id,
      account.snapshot2026Id,
      account.draftSnapshotId,
      account.hiddenSnapshotId,
    ],
    userNames: account.userNames,
    tenantNames: account.tenantNames,
  });
}

async function cleanupReportsR2Objects(storagePaths) {
  const keys = [
    ...new Set(storagePaths.map(r2StoragePathToKey).filter(Boolean)),
  ].sort();

  for (const key of keys) {
    await execFileAsync(
      process.execPath,
      [
        WRANGLER_BIN,
        "r2",
        "object",
        "delete",
        `${DEFAULT_LOCAL_REPORTS_BUCKET}/${key}`,
        "--local",
        "--force",
      ],
      {
        cwd: process.cwd(),
        timeout: 30000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
  }
}

function r2StoragePathToKey(storagePath) {
  if (!storagePath) return null;
  assert(
    typeof storagePath === "string" &&
      storagePath.startsWith(R2_STORAGE_PREFIX),
    `unexpected report storage path: ${String(storagePath)}`,
  );
  const key = storagePath.slice(R2_STORAGE_PREFIX.length);
  assert(
    key.startsWith("reports/"),
    `refusing to delete non-report key: ${key}`,
  );
  assert(!key.startsWith("/"), `refusing absolute report key: ${key}`);
  assert(!key.includes("\\"), `refusing Windows-style report key: ${key}`);
  assert(
    !key
      .split("/")
      .some((part) => part === "" || part === "." || part === ".."),
    `refusing unsafe report key: ${key}`,
  );
  return key;
}

async function cleanupGeneratedRows(sql, rawInput) {
  const input = normalizeCleanupInput(rawInput);
  const auditRowIds = [
    ...input.orgIds,
    ...input.userIds,
    ...input.propertyIds,
    ...input.unitIds,
    ...input.leaseIds,
    ...input.snapshotIds,
  ];
  const generatedText = [
    ...input.emails,
    ...input.organizationNames,
    ...input.propertyNames,
    ...input.userNames,
    ...input.tenantNames,
  ];

  await sql.begin(async (transaction) => {
    await transaction`
      delete from export_history
      where organization_id in ${transaction(input.orgIds)}
         or property_id in ${transaction(input.propertyIds)}
         or created_by_name in ${transaction(input.userNames)}
    `;
    await transaction`
      delete from credit_consumption_log
      where organization_id in ${transaction(input.orgIds)}
         or reconciliation_snapshot_id in ${transaction(input.snapshotIds)}
    `;
    await transaction`
      delete from reconciliation_snapshots
      where id in ${transaction(input.snapshotIds)}
         or organization_id in ${transaction(input.orgIds)}
         or property_id in ${transaction(input.propertyIds)}
    `;
    await transaction`
      delete from leases
      where id in ${transaction(input.leaseIds)}
         or property_id in ${transaction(input.propertyIds)}
         or tenant_name in ${transaction(input.tenantNames)}
    `;
    await transaction`
      delete from units
      where id in ${transaction(input.unitIds)}
         or property_id in ${transaction(input.propertyIds)}
    `;
    await transaction`
      delete from properties
      where id in ${transaction(input.propertyIds)}
         or organization_id in ${transaction(input.orgIds)}
         or name in ${transaction(input.propertyNames)}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction(input.orgIds)}
    `;
    await transaction`
      delete from audit_credits
      where organization_id in ${transaction(input.orgIds)}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction(input.orgIds)}
         or user_id in ${transaction(input.userIds)}
         or email in ${transaction(input.emails)}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(input.orgIds)}
         or user_id in ${transaction(input.userIds)}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(input.orgIds)}
         or changed_by in ${transaction(input.userIds)}
         or row_id in ${transaction(auditRowIds)}
         or old_data::text like any(${generatedText.map((value) => `%${value}%`)})
         or new_data::text like any(${generatedText.map((value) => `%${value}%`)})
    `;
    await transaction`
      delete from users
      where id in ${transaction(input.userIds)}
         or email in ${transaction(input.emails)}
         or organization_id in ${transaction(input.orgIds)}
    `;
    await transaction`
      delete from auth.users
      where id in ${transaction(input.userIds)}
         or email in ${transaction(input.emails)}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction(input.orgIds)}
         or name in ${transaction(input.organizationNames)}
    `;
  });
}

async function assertCleanupComplete(sql, account) {
  const input = normalizeCleanupInput({
    orgIds: [
      account.organizationId,
      account.hiddenOrganizationId,
      account.noAccessOrganizationId,
    ],
    userIds: [
      account.ownerUserId,
      account.hiddenUserId,
      account.noAccessUserId,
    ],
    emails: [account.ownerEmail, account.hiddenEmail, account.noAccessEmail],
    organizationNames: [
      account.ownerOrganizationName,
      account.hiddenOrganizationName,
      account.noAccessOrganizationName,
    ],
    propertyIds: [
      account.propertyId,
      account.hiddenPropertyId,
      account.noAccessPropertyId,
    ],
    propertyNames: [
      account.propertyName,
      account.hiddenPropertyName,
      account.noAccessPropertyName,
    ],
    unitIds: [
      account.unitOneId,
      account.unitTwoId,
      account.hiddenUnitId,
      account.noAccessUnitId,
    ],
    leaseIds: [
      account.leaseOneId,
      account.leaseTwoId,
      account.hiddenLeaseId,
      account.noAccessLeaseId,
    ],
    snapshotIds: [
      account.snapshot2025Id,
      account.snapshot2026Id,
      account.draftSnapshotId,
      account.hiddenSnapshotId,
    ],
    userNames: account.userNames,
    tenantNames: account.tenantNames,
  });
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(input.userIds)} or email in ${sql(input.emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(input.userIds)} or email in ${sql(input.emails)} or organization_id in ${sql(input.orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(input.orgIds)} or name in ${sql(input.organizationNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(input.propertyIds)} or organization_id in ${sql(input.orgIds)} or name in ${sql(input.propertyNames)}) as property_count,
      (select count(*)::int from units where id in ${sql(input.unitIds)} or property_id in ${sql(input.propertyIds)}) as unit_count,
      (select count(*)::int from leases where id in ${sql(input.leaseIds)} or property_id in ${sql(input.propertyIds)} or tenant_name in ${sql(input.tenantNames)}) as lease_count,
      (select count(*)::int from reconciliation_snapshots where id in ${sql(input.snapshotIds)} or organization_id in ${sql(input.orgIds)} or property_id in ${sql(input.propertyIds)}) as snapshot_count,
      (select count(*)::int from export_history where organization_id in ${sql(input.orgIds)} or property_id in ${sql(input.propertyIds)} or created_by_name in ${sql(input.userNames)}) as export_history_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(input.orgIds)}) as subscription_count,
      (select count(*)::int from audit_credits where organization_id in ${sql(input.orgIds)}) as audit_credit_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(input.orgIds)} or user_id in ${sql(input.userIds)} or email in ${sql(input.emails)}) as signup_email_event_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(input.orgIds)} or user_id in ${sql(input.userIds)}) as legal_acceptance_count,
      (select count(*)::int from audit_log where organization_id in ${sql(input.orgIds)} or changed_by in ${sql(input.userIds)} or row_id in ${sql([...input.snapshotIds, ...input.propertyIds, ...input.leaseIds])}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.unit_count === 0, "cleanup left units");
  assert(row.lease_count === 0, "cleanup left leases");
  assert(row.snapshot_count === 0, "cleanup left reconciliation snapshots");
  assert(row.export_history_count === 0, "cleanup left export_history rows");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(row.audit_credit_count === 0, "cleanup left audit credits");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.audit_log_count === 0, "cleanup left audit logs");
}

function normalizeCleanupInput(input) {
  const uuidSentinel = "00000000-0000-4000-8000-000000000000";
  const textSentinel = "__exports_e2e_none__";
  return {
    orgIds: nonEmpty(input.orgIds, uuidSentinel),
    userIds: nonEmpty(input.userIds, uuidSentinel),
    propertyIds: nonEmpty(input.propertyIds, uuidSentinel),
    unitIds: nonEmpty(input.unitIds, uuidSentinel),
    leaseIds: nonEmpty(input.leaseIds, uuidSentinel),
    snapshotIds: nonEmpty(input.snapshotIds, uuidSentinel),
    emails: nonEmpty(input.emails, textSentinel),
    organizationNames: nonEmpty(input.organizationNames, textSentinel),
    propertyNames: nonEmpty(input.propertyNames, textSentinel),
    userNames: nonEmpty(input.userNames, textSentinel),
    tenantNames: nonEmpty(input.tenantNames, textSentinel),
  };
}

function nonEmpty(values, sentinel) {
  const clean = [...new Set((values ?? []).filter(Boolean))];
  return clean.length > 0 ? clean : [sentinel];
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
  if (!response.ok) return undefined;
  return body.access_token;
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
  const body = await parseResponseJson(response);
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

async function expectError(url, options = {}) {
  const { code, ...rest } = options;
  const body = await expectJson(url, rest);
  assert(errorCode(body) === code, `expected error code ${code}`);
  return body;
}

async function expectBytes(url, options = {}) {
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
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    contentTypeOptions: response.headers.get("x-content-type-options") ?? "",
  };
}

async function parseResponseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON response, received: ${text.slice(0, 500)}`);
  }
}

function assertPdf(result, label) {
  assert(
    result.contentType.includes("application/pdf"),
    `${label} content-type mismatch`,
  );
  assert(
    result.contentDisposition.includes("attachment"),
    `${label} attachment missing`,
  );
  assert(startsWithAscii(result.bytes, "%PDF-"), `${label} header missing`);
  assert(endsWithMarker(result.bytes, "%%EOF"), `${label} EOF marker missing`);
}

function assertPdfTextContains(bytes, expectedValues, label) {
  const text = extractPdfText(bytes);
  for (const expected of expectedValues) {
    assert(
      text.includes(expected),
      `${label} missing text ${expected}; extracted=${text.slice(0, 500)}`,
    );
  }
}

function extractPdfText(bytes) {
  const buffer = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream", "latin1");
  const endStreamMarker = Buffer.from("endstream", "latin1");
  let offset = 0;
  let output = "";

  while (offset < buffer.length) {
    const streamIndex = buffer.indexOf(streamMarker, offset);
    if (streamIndex === -1) break;
    const dataStart = streamDataStart(
      buffer,
      streamIndex + streamMarker.length,
    );
    const endIndex = buffer.indexOf(endStreamMarker, dataStart);
    if (endIndex === -1) break;
    const dataEnd = trimPdfStreamEnd(buffer, dataStart, endIndex);
    const streamBytes = buffer.subarray(dataStart, dataEnd);
    const dict = pdfStreamDictionary(buffer, streamIndex);
    const decoded = dict.includes("/FlateDecode")
      ? inflateSync(streamBytes)
      : streamBytes;
    output += ` ${extractPdfStrings(decoded.toString("latin1"))}`;
    offset = endIndex + endStreamMarker.length;
  }

  return output;
}

function streamDataStart(buffer, start) {
  if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) return start + 2;
  if (buffer[start] === 0x0a || buffer[start] === 0x0d) return start + 1;
  return start;
}

function trimPdfStreamEnd(buffer, start, end) {
  let dataEnd = end;
  while (
    dataEnd > start &&
    (buffer[dataEnd - 1] === 0x0a || buffer[dataEnd - 1] === 0x0d)
  ) {
    dataEnd -= 1;
  }
  return dataEnd;
}

function pdfStreamDictionary(buffer, streamIndex) {
  const dictStart = buffer.lastIndexOf(
    Buffer.from("<<", "latin1"),
    streamIndex,
  );
  const dictEnd = buffer.lastIndexOf(Buffer.from(">>", "latin1"), streamIndex);
  if (dictStart === -1 || dictEnd === -1 || dictEnd < dictStart) return "";
  return buffer.subarray(dictStart, dictEnd + 2).toString("latin1");
}

function extractPdfStrings(content) {
  const values = [];
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === "(") {
      const parsed = readPdfLiteralString(content, index);
      values.push(parsed.value);
      index = parsed.end;
    } else if (
      char === "<" &&
      content[index + 1] !== "<" &&
      /[0-9a-fA-F]/u.test(content[index + 1] ?? "")
    ) {
      const end = content.indexOf(">", index + 1);
      if (end !== -1) {
        values.push(decodePdfHexString(content.slice(index + 1, end)));
        index = end;
      }
    }
  }
  return values.join(" ");
}

function readPdfLiteralString(content, start) {
  let depth = 1;
  let value = "";
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === "\\") {
      const next = content[index + 1];
      if (next === undefined) break;
      if (next === "n") value += "\n";
      else if (next === "r") value += "\r";
      else if (next === "t") value += "\t";
      else if (next === "b") value += "\b";
      else if (next === "f") value += "\f";
      else if (next === "\n" || next === "\r") {
        if (next === "\r" && content[index + 2] === "\n") index += 1;
      } else {
        value += next;
      }
      index += 1;
      continue;
    }
    if (char === "(") {
      depth += 1;
      value += char;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return { value, end: index };
      value += char;
      continue;
    }
    value += char;
  }
  return { value, end: content.length - 1 };
}

function decodePdfHexString(hex) {
  const normalized = hex.replace(/\s+/gu, "");
  const evenHex =
    normalized.length % 2 === 0 ? normalized : `${normalized.slice(0, -1)}0`;
  const bytes = [];
  for (let index = 0; index < evenHex.length; index += 2) {
    bytes.push(Number.parseInt(evenHex.slice(index, index + 2), 16));
  }
  return Buffer.from(bytes).toString("latin1");
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
    if (!key) fail(`Invalid argument: ${arg}`);
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

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
    if (!line) continue;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

function normalizedLocalUrl(rawUrl, label) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (url.username || url.password) {
    fail(`${label} must not include credentials`);
  }
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  if (!url.port) fail(`${label} must include an explicit loopback port`);
  if (
    label === "supabase-url" &&
    (url.port !== "54321" || (url.pathname !== "" && url.pathname !== "/"))
  ) {
    fail(
      "supabase-url must be the local Supabase API at http://127.0.0.1:54321",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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
  if (url.port !== "54322" || url.pathname !== "/postgres") {
    fail(
      "database-url must target local Supabase Postgres on port 54322/postgres",
    );
  }
  return url.toString();
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function startsWithAscii(bytes, prefix) {
  return decode(bytes.slice(0, prefix.length)) === prefix;
}

function endsWithMarker(bytes, marker) {
  return decode(bytes.slice(-2048)).includes(marker);
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function decode(bytes) {
  return new TextDecoder().decode(bytes);
}

function genericErpRow(account, year, tenantName) {
  const recovery =
    year === "2025" ? account.recovery2025 : account.recovery2026;
  return [
    account.propertyName,
    "",
    tenantName,
    `01/01/${year}`,
    `12/31/${year}`,
    "10000.00",
    "10500.00",
    "5000.00",
    recovery,
    recovery,
    "125.00",
    recovery,
  ];
}

function assertGenericErpCsv(text, expectedRows, label) {
  assert(
    text.endsWith("\r\n"),
    `${label} must use CRLF line endings with a final newline`,
  );
  const rows = parseCsvRows(text);
  const expected = [GENERIC_ERP_HEADER, ...expectedRows];
  assertJsonEqual(rows, expected, `${label} rows`);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index += 1;
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  assert(!inQuotes, "CSV ended inside a quoted field");
  assert(row.length === 0 && cell === "", "CSV must end after a full row");
  return rows;
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertExcludes(text, forbidden, label) {
  assert(!text.includes(forbidden), `${label} leaked ${forbidden}`);
}

function errorCode(body) {
  return body?.error?.code;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /token|password|refresh|authorization|apikey|api_key|secret/iu.test(key)
          ? "[REDACTED]"
          : redactSensitiveJson(entry),
      ]),
    );
  }
  return value;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
