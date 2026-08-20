import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { TextDecoder } from "node:util";
import { unzipSync, unzlibSync } from "fflate";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8857";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const REQUEST_ROW_KEYS = [
  "created_at",
  "export_format",
  "exported_at",
  "id",
  "lease_id",
  "notes",
  "organization_id",
  "property_id",
  "request_date",
  "requested_by_email",
  "requested_by_name",
  "response_deadline",
  "status",
  "updated_at",
  "window_end_date",
  "window_start_date",
];
const LIST_RESPONSE_KEYS = ["count", "data", "has_more"];
const ALERT_ROW_KEYS = [
  "days_remaining",
  "property_id",
  "property_name",
  "request_id",
  "response_deadline",
  "status",
  "tenant_name",
];

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
    fail(`local SB 1103 E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const supabaseUrl = normalizedLocalSupabaseUrl(
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
      DEFAULT_DATABASE_URL,
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
    fail("Refusing to run local SB 1103 E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let cleanupError;
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
  }
  try {
    await worker.close();
  } catch (error) {
    cleanupError = error;
  }
  if (runError) {
    if (cleanupError) {
      console.error(
        `Worker cleanup failed after scenario failure: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
    throw runError;
  }
  if (cleanupError) throw cleanupError;
}

async function runOnce(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.ownerToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccessToken);
  const hiddenHeaders = jsonAuthHeaders(account.hiddenToken);
  const generatedRequestIds = new Set();
  let runError;
  let cleanupError;
  let closeError;
  let result;

  try {
    const created = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({
          property_id: account.propertyId,
          lease_id: account.leaseId,
          requested_by_name: "Local SB 1103 Tenant",
          requested_by_email: account.tenantEmail,
          request_date: "2026-08-31",
          notes: "Initial local SB 1103 request",
        }),
      },
    );
    generatedRequestIds.add(created.id);
    assertRequestRowShape(created, "created request");
    assertRequestRowFields(
      created,
      {
        organization_id: account.organizationId,
        property_id: account.propertyId,
        lease_id: account.leaseId,
        requested_by_name: "Local SB 1103 Tenant",
        requested_by_email: account.tenantEmail,
        request_date: "2026-08-31",
        response_deadline: "2026-09-30",
        window_start_date: "2025-02-28",
        window_end_date: "2026-08-31",
        status: "pending",
        export_format: null,
        exported_at: null,
        notes: "Initial local SB 1103 request",
      },
      "created request",
    );
    const createdDb = await findRequest(sql, created.id);
    assertRequestRowParity(createdDb, created, "created DB row");

    const listed = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103?property_id=${account.propertyId}&status=pending`,
      { headers: ownerHeaders, status: 200 },
    );
    assertExactKeys(listed, LIST_RESPONSE_KEYS, "filtered list response");
    assert(listed.count === 1, "filtered list count mismatch");
    assert(listed.data?.[0]?.id === created.id, "filtered list id mismatch");
    assert(listed.has_more === false, "filtered list has_more mismatch");
    assert(Array.isArray(listed.data), "filtered list data missing");
    assertRequestRowShape(listed.data[0], "filtered list row");
    assertRequestRowParity(listed.data[0], created, "filtered list row");

    const detail = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${created.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertRequestRowShape(detail, "detail row");
    assert(detail.id === created.id, "detail id mismatch");
    assertRequestRowParity(detail, created, "detail row");

    const patched = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${created.id}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          notes: "Updated after local route verification",
        }),
      },
    );
    assertRequestRowShape(patched, "patched row");
    assert(
      patched.notes === "Updated after local route verification",
      "notes mismatch",
    );
    assertRequestRowFields(
      patched,
      {
        ...created,
        notes: "Updated after local route verification",
      },
      "patched row",
      { allowUpdatedAtChange: true },
    );
    const patchedDb = await findRequest(sql, created.id);
    assertRequestRowParity(patchedDb, patched, "patched DB row");

    const noAccessCreate = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          lease_id: account.noAccessLeaseId,
          requested_by_name: "No Access Tenant",
          requested_by_email: account.noAccessEmail,
          request_date: "2026-06-01",
        }),
      },
    );
    assertJsonEqual(
      noAccessCreate,
      {
        detail:
          "subscription_required: An active subscription or trial is required.",
        error: {
          code: "subscription_required",
          message:
            "subscription_required: An active subscription or trial is required.",
        },
      },
      "no-access create error",
    );

    const hiddenRequest = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103`,
      {
        method: "POST",
        headers: hiddenHeaders,
        status: 201,
        body: JSON.stringify({
          property_id: account.hiddenPropertyId,
          lease_id: account.hiddenLeaseId,
          requested_by_name: "Hidden Tenant",
          requested_by_email: account.hiddenEmail,
          request_date: "2026-06-01",
        }),
      },
    );
    generatedRequestIds.add(hiddenRequest.id);
    assertRequestRowShape(hiddenRequest, "hidden request");
    assertRequestRowFields(
      hiddenRequest,
      {
        organization_id: account.hiddenOrganizationId,
        property_id: account.hiddenPropertyId,
        lease_id: account.hiddenLeaseId,
        requested_by_name: "Hidden Tenant",
        requested_by_email: account.hiddenEmail,
        request_date: "2026-06-01",
        response_deadline: "2026-07-01",
        window_start_date: "2024-12-01",
        window_end_date: "2026-06-01",
        status: "pending",
        export_format: null,
        exported_at: null,
        notes: null,
      },
      "hidden request",
    );
    const hiddenGet = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${hiddenRequest.id}`,
      { headers: ownerHeaders, status: 404 },
    );
    assertNotFoundError(hiddenGet, "hidden GET error");
    const hiddenExport = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${hiddenRequest.id}/export?format=pdf`,
      { method: "POST", headers: ownerHeaders, status: 404 },
    );
    assertNotFoundError(
      hiddenExport,
      "hidden export error",
      `SB1103Request not found: ${hiddenRequest.id}`,
    );
    const hiddenPatch = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${hiddenRequest.id}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({ notes: "cross-org patch attempt" }),
      },
    );
    assertNotFoundError(hiddenPatch, "hidden patch error");
    const hiddenDelete = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${hiddenRequest.id}`,
      { method: "DELETE", headers: ownerHeaders, status: 404 },
    );
    assertNotFoundError(hiddenDelete, "hidden delete error");

    const alertRequest = await seedAlertRequest(sql, account);
    generatedRequestIds.add(alertRequest.id);
    const alerts = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/alerts?days_warning=40`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(Array.isArray(alerts), "alerts response should be an array");
    const alert = alerts.find((row) => row.request_id === alertRequest.id);
    assert(alert, "alert for seeded pending request missing");
    assertExactKeys(alert, ALERT_ROW_KEYS, "alert row");
    assertJsonEqual(
      alert,
      {
        request_id: alertRequest.id,
        property_id: account.propertyId,
        property_name: account.propertyName,
        tenant_name: account.tenantName,
        response_deadline: alertRequest.responseDeadline,
        days_remaining: diffDays(todayUtc(), alertRequest.responseDeadline),
        status: "pending",
      },
      "alert row",
    );

    const pdf = await expectBytes(
      `${input.baseUrl}/api/v1/compliance/sb1103/${created.id}/export?format=pdf`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assert(pdf.contentType === "application/pdf", "PDF content-type mismatch");
    assert(
      pdf.contentDisposition ===
        `attachment; filename="${sb1103BaseName({
          tenantName: account.tenantName,
          windowStartDate: created.window_start_date,
          windowEndDate: created.window_end_date,
        })}.pdf"`,
      "PDF filename mismatch",
    );
    assert(startsWithAscii(pdf.bytes, "%PDF-"), "PDF header missing");
    assert(endsWithMarker(pdf.bytes, "%%EOF"), "PDF EOF marker missing");
    assertPdfContainsExpectedLedger(pdf.bytes, "standalone PDF", account);
    await assertExportState(sql, {
      requestId: created.id,
      status: "exported",
      format: "pdf",
    });
    const pdfExportDb = await findRequest(sql, created.id);
    assertRequestRowFields(
      pdfExportDb,
      {
        ...patched,
        status: "exported",
        export_format: "pdf",
      },
      "PDF export DB row",
      { allowUpdatedAtChange: true, requireExportedAt: true },
    );

    const excel = await expectBytes(
      `${input.baseUrl}/api/v1/compliance/sb1103/${created.id}/export?format=excel`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assert(
      excel.contentType.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
      "Excel content-type mismatch",
    );
    assert(
      excel.contentDisposition ===
        `attachment; filename="${sb1103BaseName({
          tenantName: account.tenantName,
          windowStartDate: created.window_start_date,
          windowEndDate: created.window_end_date,
        })}.xlsx"`,
      "Excel filename mismatch",
    );
    const xlsxEntries = Object.keys(unzipSync(excel.bytes));
    assert(
      xlsxEntries.some((name) => name.includes("xl/workbook.xml")),
      "XLSX workbook entry missing",
    );
    assertXlsxContainsExpectedLedger(excel.bytes, account);
    await assertExportState(sql, {
      requestId: created.id,
      status: "exported",
      format: "excel",
    });
    const excelExportDb = await findRequest(sql, created.id);
    assertRequestRowFields(
      excelExportDb,
      {
        ...pdfExportDb,
        export_format: "excel",
      },
      "Excel export DB row",
      { allowUpdatedAtChange: true, requireExportedAt: true },
    );

    const zip = await expectBytes(
      `${input.baseUrl}/api/v1/compliance/sb1103/${created.id}/export?format=both`,
      { method: "POST", headers: ownerHeaders, status: 200 },
    );
    assert(zip.contentType === "application/zip", "ZIP content-type mismatch");
    const expectedBaseName = sb1103BaseName({
      tenantName: account.tenantName,
      windowStartDate: created.window_start_date,
      windowEndDate: created.window_end_date,
    });
    assert(
      zip.contentDisposition.includes(`filename="${expectedBaseName}.zip"`),
      "ZIP filename mismatch",
    );
    const zipEntries = Object.entries(unzipSync(zip.bytes));
    const zipEntryNames = zipEntries.map(([name]) => name).sort();
    assert(
      JSON.stringify(zipEntryNames) ===
        JSON.stringify([`${expectedBaseName}.pdf`, `${expectedBaseName}.xlsx`]),
      `ZIP entries mismatch: ${JSON.stringify(zipEntryNames)}`,
    );
    const zippedPdf = zipEntries.find(
      ([name]) => name === `${expectedBaseName}.pdf`,
    )?.[1];
    assert(
      zippedPdf && startsWithAscii(zippedPdf, "%PDF-"),
      "zipped PDF invalid",
    );
    assertPdfContainsExpectedLedger(zippedPdf, "zipped PDF", account);
    const zippedXlsx = zipEntries.find(
      ([name]) => name === `${expectedBaseName}.xlsx`,
    )?.[1];
    assert(zippedXlsx, "zipped XLSX missing");
    assertXlsxContainsExpectedLedger(zippedXlsx, account);
    await assertExportState(sql, {
      requestId: created.id,
      status: "exported",
      format: "both",
    });
    const zipExportDb = await findRequest(sql, created.id);
    assertRequestRowFields(
      zipExportDb,
      {
        ...excelExportDb,
        export_format: "both",
      },
      "ZIP export DB row",
      { allowUpdatedAtChange: true, requireExportedAt: true },
    );

    const deleteTarget = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({
          property_id: account.propertyId,
          lease_id: account.leaseId,
          requested_by_name: "Delete Target",
          requested_by_email: account.tenantEmail,
          request_date: "2026-06-01",
        }),
      },
    );
    generatedRequestIds.add(deleteTarget.id);
    assertRequestRowShape(deleteTarget, "delete target row");
    await expectEmpty(
      `${input.baseUrl}/api/v1/compliance/sb1103/${deleteTarget.id}`,
      { method: "DELETE", headers: ownerHeaders, status: 204 },
    );
    generatedRequestIds.delete(deleteTarget.id);
    const deletedGet = await expectJson(
      `${input.baseUrl}/api/v1/compliance/sb1103/${deleteTarget.id}`,
      { headers: ownerHeaders, status: 404 },
    );
    assertNotFoundError(deletedGet, "deleted GET error");
    const deletedDb = await findRequest(sql, deleteTarget.id);
    assert(deletedDb === null, "deleted request still present in DB");

    result = {
      index: input.index,
      organization_id: account.organizationId,
      exported_request_id: created.id,
      alert_request_id: alertRequest.id,
      zip_entries: zipEntries.map(([name]) => name).sort(),
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupAccount(sql, account, [...generatedRequestIds]);
      await assertCleanupComplete(sql, account);
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError = error;
      }
    }
  }
  const postRunError = cleanupError ?? closeError;
  if (postRunError) {
    if (runError) {
      console.error(
        `SB 1103 cleanup failed after scenario failure: ${
          postRunError instanceof Error
            ? postRunError.message
            : String(postRunError)
        }`,
      );
    } else {
      throw postRunError;
    }
  }
  if (runError) throw runError;
  return result;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  let owner;
  let noAccess;
  let hidden;

  const ids = {
    propertyId: randomUUID(),
    unitId: randomUUID(),
    leaseId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    hiddenUnitId: randomUUID(),
    hiddenLeaseId: randomUUID(),
    noAccessPropertyId: randomUUID(),
    noAccessUnitId: randomUUID(),
    noAccessLeaseId: randomUUID(),
    importBatchId: randomUUID(),
    hiddenImportBatchId: randomUUID(),
  };
  const propertyName = `Local SB 1103 Plaza ${suffix}`;
  const tenantName = `SB 1103 Cafe ${suffix}`;
  const tenantEmail = `sb1103-tenant-${suffix}@example.com`;
  const account = {
    ...ids,
    ownerUserId: undefined,
    ownerToken: undefined,
    ownerEmail: `sb1103-e2e-owner-${suffix}@capveri.local`,
    ownerOrganizationName: `Local SB 1103 Org ${suffix}`,
    organizationId: undefined,
    noAccessUserId: undefined,
    noAccessToken: undefined,
    noAccessEmail: `sb1103-e2e-no-access-${suffix}@capveri.local`,
    noAccessOrganizationName: `Local SB 1103 No Access Org ${suffix}`,
    noAccessOrganizationId: undefined,
    hiddenUserId: undefined,
    hiddenToken: undefined,
    hiddenEmail: `sb1103-e2e-hidden-${suffix}@capveri.local`,
    hiddenOrganizationName: `Local SB 1103 Hidden Org ${suffix}`,
    hiddenOrganizationId: undefined,
    orgIds: [],
    userIds: [],
    emails: [],
    organizationNames: [],
    propertyIds: [ids.propertyId, ids.hiddenPropertyId, ids.noAccessPropertyId],
    unitIds: [ids.unitId, ids.hiddenUnitId, ids.noAccessUnitId],
    leaseIds: [ids.leaseId, ids.hiddenLeaseId, ids.noAccessLeaseId],
    importBatchIds: [ids.importBatchId, ids.hiddenImportBatchId],
    propertyName,
    tenantName,
    tenantEmail,
  };
  account.emails.push(
    account.ownerEmail,
    account.noAccessEmail,
    account.hiddenEmail,
  );
  account.organizationNames.push(
    account.ownerOrganizationName,
    account.noAccessOrganizationName,
    account.hiddenOrganizationName,
  );
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let seedError;
  let cleanupError;
  let closeError;

  try {
    owner = await createLocalAuthUser(input, {
      email: account.ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local SB 1103 Owner",
      organizationName: account.ownerOrganizationName,
      account,
      kind: "owner",
    });
    account.ownerUserId = owner.userId;
    account.ownerToken = owner.accessToken;
    account.organizationId = owner.organizationId;
    noAccess = await createLocalAuthUser(input, {
      email: account.noAccessEmail,
      password: `NoAccessPass${input.index}A1!`,
      fullName: "Local SB 1103 No Access",
      organizationName: account.noAccessOrganizationName,
      account,
      kind: "noAccess",
    });
    account.noAccessUserId = noAccess.userId;
    account.noAccessToken = noAccess.accessToken;
    account.noAccessOrganizationId = noAccess.organizationId;
    hidden = await createLocalAuthUser(input, {
      email: account.hiddenEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local SB 1103 Hidden",
      organizationName: account.hiddenOrganizationName,
      account,
      kind: "hidden",
    });
    account.hiddenUserId = hidden.userId;
    account.hiddenToken = hidden.accessToken;
    account.hiddenOrganizationId = hidden.organizationId;

    await sql.begin(async (transaction) => {
      await transaction`
        update users
        set role = 'owner', full_name = 'Local SB 1103 Owner', updated_at = now()
        where id = ${owner.userId}
      `;
      await transaction`
        update users
        set role = 'owner', full_name = 'Local SB 1103 No Access', updated_at = now()
        where id = ${noAccess.userId}
      `;
      await transaction`
        update users
        set role = 'owner', full_name = 'Local SB 1103 Hidden', updated_at = now()
        where id = ${hidden.userId}
      `;
      await transaction`
        insert into subscriptions (organization_id, plan, status, current_period_start, current_period_end)
        values
          (${owner.organizationId}, 'professional', 'active', now(), now() + interval '30 days'),
          (${hidden.organizationId}, 'professional', 'active', now(), now() + interval '30 days')
      `;
      await insertProperty(transaction, {
        id: ids.propertyId,
        orgId: owner.organizationId,
        name: propertyName,
        state: "CA",
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        orgId: hidden.organizationId,
        name: `Hidden SB 1103 Plaza ${suffix}`,
        state: "CA",
      });
      await insertProperty(transaction, {
        id: ids.noAccessPropertyId,
        orgId: noAccess.organizationId,
        name: `No Access SB 1103 Plaza ${suffix}`,
        state: "CA",
      });
      await insertUnit(transaction, {
        id: ids.unitId,
        propertyId: ids.propertyId,
        unitNumber: "100",
      });
      await insertUnit(transaction, {
        id: ids.hiddenUnitId,
        propertyId: ids.hiddenPropertyId,
        unitNumber: "200",
      });
      await insertUnit(transaction, {
        id: ids.noAccessUnitId,
        propertyId: ids.noAccessPropertyId,
        unitNumber: "300",
      });
      await insertLease(transaction, {
        id: ids.leaseId,
        propertyId: ids.propertyId,
        unitId: ids.unitId,
        tenantName,
      });
      await insertLease(transaction, {
        id: ids.hiddenLeaseId,
        propertyId: ids.hiddenPropertyId,
        unitId: ids.hiddenUnitId,
        tenantName: "Hidden Tenant",
      });
      await insertLease(transaction, {
        id: ids.noAccessLeaseId,
        propertyId: ids.noAccessPropertyId,
        unitId: ids.noAccessUnitId,
        tenantName: "No Access Tenant",
      });
      await transaction`
        insert into import_batches (
          id, organization_id, property_id, file_name, file_hash,
          source_system, status, row_count, error_count, error_log
        )
        values
          (${ids.importBatchId}, ${owner.organizationId}, ${ids.propertyId}, ${`sb1103-e2e-${suffix}.csv`}, ${"a".repeat(64)}, 'yardi', 'completed', 3, 0, '[]'::jsonb),
          (${ids.hiddenImportBatchId}, ${hidden.organizationId}, ${ids.hiddenPropertyId}, ${`sb1103-hidden-${suffix}.csv`}, ${"b".repeat(64)}, 'yardi', 'completed', 1, 0, '[]'::jsonb)
      `;
      await transaction`
        insert into gl_entries (
          import_batch_id, property_id, account_code, account_description,
          amount, transaction_date, period_year, period_month,
          vendor_name, description, raw_row_data
        )
        values
          (${ids.importBatchId}, ${ids.propertyId}, '5100', 'Janitorial', 1000.00, '2025-03-15', 2025, 3, 'Clean Co', 'Monthly service', '{}'::jsonb),
          (${ids.importBatchId}, ${ids.propertyId}, '5200', 'Utilities', 500.005, '2026-01-15', 2026, 1, 'Power Co', 'Usage charge', '{}'::jsonb),
          (${ids.importBatchId}, ${ids.propertyId}, '5300', 'Repairs', 250.00, '2026-08-01', 2026, 8, 'Repair Co', 'HVAC repair', '{}'::jsonb),
          (${ids.hiddenImportBatchId}, ${ids.hiddenPropertyId}, '9999', 'Hidden', 99999.00, '2026-01-15', 2026, 1, 'Hidden Vendor', 'Should not leak', '{}'::jsonb)
      `;
    });
  } catch (error) {
    seedError = error;
    try {
      await cleanupAccount(sql, account, []);
      await assertCleanupComplete(sql, account);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      closeError = error;
    }
  }
  if (seedError) {
    const postSeedError = cleanupError ?? closeError;
    if (postSeedError) {
      console.error(
        `SB 1103 seed cleanup failed after seed failure: ${
          postSeedError instanceof Error
            ? postSeedError.message
            : String(postSeedError)
        }`,
      );
    }
    throw seedError;
  }
  if (cleanupError) throw cleanupError;
  if (closeError) throw closeError;

  return {
    ...account,
  };
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
  let childError;
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.once("error", (error) => {
    childError = error;
    output += `\nwrangler dev spawn error: ${
      error instanceof Error ? error.message : String(error)
    }`;
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-sb1103-e2e-"));
  const path = resolve(directory, ".dev.vars.local-sb1103-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-sb1103-e2e-signing-secret",
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

async function createLocalAuthUser(input, user) {
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      data: {
        full_name: user.fullName,
        organization_name: user.organizationName,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
  }
  const userId = body.user?.id;
  assert(typeof userId === "string", "signup did not return user id");
  user.account.userIds.push(userId);
  if (user.kind === "owner") user.account.ownerUserId = userId;
  if (user.kind === "noAccess") user.account.noAccessUserId = userId;
  if (user.kind === "hidden") user.account.hiddenUserId = userId;

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
    if (typeof organizationId === "string") {
      user.account.orgIds.push(organizationId);
      if (user.kind === "owner") user.account.organizationId = organizationId;
      if (user.kind === "noAccess") {
        user.account.noAccessOrganizationId = organizationId;
      }
      if (user.kind === "hidden") {
        user.account.hiddenOrganizationId = organizationId;
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const accessToken =
    body.session?.access_token ??
    (await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: user.email,
      password: user.password,
    }));
  assert(typeof accessToken === "string", "signup did not return token");
  assert(typeof organizationId === "string", "signup org missing");

  return { ...user, userId, organizationId, accessToken };
}

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.orgId}, ${input.name}, '1103 Compliance Way',
      'Los Angeles', ${input.state}, '90017', 10000, 9000, 1000, 0.95
    )
  `;
}

async function insertUnit(sql, input) {
  await sql`
    insert into units (
      id, property_id, unit_number, floor, rentable_sqft, usable_sqft, status
    )
    values (${input.id}, ${input.propertyId}, ${input.unitNumber}, '1', 2500, 2250, 'occupied')
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
      'active', '2025-01-01', '2029-12-31',
      ${sql.json({
        pro_rata_share: "0.25",
        admin_fee_percentage: "0.15",
        cap_type: "none",
        excluded_pools: [],
      })}
    )
  `;
}

async function seedAlertRequest(sql, account) {
  const id = randomUUID();
  const today = new Date();
  const requestDate = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - 20,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const responseDeadline = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + 10,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const windowStart = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - 18,
      today.getUTCDate() - 20,
    ),
  )
    .toISOString()
    .slice(0, 10);
  await sql`
    insert into sb1103_requests (
      id, organization_id, property_id, lease_id, requested_by_name,
      requested_by_email, request_date, response_deadline, window_start_date,
      window_end_date, status, notes
    )
    values (
      ${id}, ${account.organizationId}, ${account.propertyId}, ${account.leaseId},
      'Alert Tenant', ${account.tenantEmail}, ${requestDate}, ${responseDeadline},
      ${windowStart}, ${requestDate}, 'pending', 'Alert fixture'
    )
  `;
  return { id, responseDeadline };
}

async function assertExportState(sql, input) {
  const rows = await sql`
    select status, export_format, exported_at
    from sb1103_requests
    where id = ${input.requestId}
  `;
  const row = rows[0];
  assert(row?.status === input.status, "export status mismatch");
  assert(row?.export_format === input.format, "export format mismatch");
  assert(row?.exported_at !== null, "exported_at missing");
}

async function findRequest(sql, requestId) {
  const rows = await sql`
    select
      id,
      organization_id,
      property_id,
      lease_id,
      requested_by_name,
      requested_by_email,
      request_date::text as request_date,
      response_deadline::text as response_deadline,
      window_start_date::text as window_start_date,
      window_end_date::text as window_end_date,
      status,
      export_format,
      exported_at::text as exported_at,
      notes,
      created_at::text as created_at,
      updated_at::text as updated_at
    from sb1103_requests
    where id = ${requestId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function cleanupAccount(sql, account, requestIds) {
  await cleanupGeneratedRows(sql, {
    orgIds: account.orgIds,
    userIds: account.userIds,
    emails: account.emails,
    organizationNames: account.organizationNames,
    propertyIds: account.propertyIds,
    unitIds: account.unitIds,
    leaseIds: account.leaseIds,
    importBatchIds: account.importBatchIds,
    requestIds,
  });
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmptyUuid(input.orgIds);
  const userIds = nonEmptyUuid(input.userIds);
  const propertyIds = nonEmptyUuid(input.propertyIds);
  const unitIds = nonEmptyUuid(input.unitIds);
  const leaseIds = nonEmptyUuid(input.leaseIds);
  const importBatchIds = nonEmptyUuid(input.importBatchIds);
  const requestIds = nonEmptyUuid(input.requestIds);
  const emails = nonEmptyText(input.emails);
  const organizationNames = nonEmptyText(input.organizationNames);
  const auditRowIds = [
    ...requestIds,
    ...orgIds,
    ...userIds,
    ...propertyIds,
    ...unitIds,
    ...leaseIds,
    ...importBatchIds,
  ];

  await sql.begin(async (transaction) => {
    await transaction`
      delete from sb1103_requests
      where organization_id in ${transaction(orgIds)}
         or id in ${transaction(requestIds)}
    `;
    await transaction`
      delete from gl_entries
      where import_batch_id in ${transaction(importBatchIds)}
         or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from import_batches
      where id in ${transaction(importBatchIds)}
         or organization_id in ${transaction(orgIds)}
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
         or organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction(orgIds)}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(orgIds)}
         or user_id in ${transaction(userIds)}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction(orgIds)}
         or user_id in ${transaction(userIds)}
         or email in ${transaction(emails)}
    `;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(orgIds)}
         or changed_by in ${transaction(userIds)}
         or row_id in ${transaction(auditRowIds)}
    `;
    await transaction`
      delete from users
      where id in ${transaction(userIds)}
         or email in ${transaction(emails)}
         or organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from auth.users
      where id in ${transaction(userIds)}
         or email in ${transaction(emails)}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction(orgIds)}
         or name in ${transaction(organizationNames)}
    `;
  });
}

async function assertCleanupComplete(sql, account) {
  const orgIds = nonEmptyUuid(account.orgIds);
  const userIds = nonEmptyUuid(account.userIds);
  const emails = nonEmptyText(account.emails);
  const organizationNames = nonEmptyText(account.organizationNames);
  const propertyIds = nonEmptyUuid(account.propertyIds);
  const unitIds = nonEmptyUuid(account.unitIds);
  const leaseIds = nonEmptyUuid(account.leaseIds);
  const importBatchIds = nonEmptyUuid(account.importBatchIds);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(organizationNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as property_count,
      (select count(*)::int from units where id in ${sql(unitIds)} or property_id in ${sql(propertyIds)}) as unit_count,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)}) as lease_count,
      (select count(*)::int from sb1103_requests where organization_id in ${sql(orgIds)}) as request_count,
      (select count(*)::int from import_batches where organization_id in ${sql(orgIds)}) as import_batch_count,
      (select count(*)::int from gl_entries where import_batch_id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as gl_entry_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(orgIds)}) as subscription_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptance_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_count,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.unit_count === 0, "cleanup left units");
  assert(row.lease_count === 0, "cleanup left leases");
  assert(row.request_count === 0, "cleanup left SB 1103 requests");
  assert(row.import_batch_count === 0, "cleanup left import batches");
  assert(row.gl_entry_count === 0, "cleanup left GL entries");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.signup_email_count === 0, "cleanup left signup email events");
  assert(row.audit_log_count === 0, "cleanup left audit logs");
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
  const text = await response.text();
  const body = text ? parseJsonResponse(text, url) : null;
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
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
  };
}

async function expectEmpty(url, options = {}) {
  const { status = 204, headers = {}, ...fetchOptions } = options;
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
    fail(`${fetchOptions.method ?? "GET"} ${url} returned ${response.status}`);
  }
}

function parseJsonResponse(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`);
  }
}

function startsWithAscii(bytes, prefix) {
  return new TextDecoder().decode(bytes.slice(0, prefix.length)) === prefix;
}

function endsWithMarker(bytes, marker) {
  return new TextDecoder().decode(bytes.slice(-2048)).includes(marker);
}

function assertXlsxContainsExpectedLedger(bytes, account) {
  const entries = unzipSync(bytes);
  const workbook = parseXlsxWorkbook(entries);
  const coverRows = workbook.sheetRows("Cover");
  const ledgerRows = workbook.sheetRows("Ledger");
  const subtotalRows = workbook.sheetRows("Category Subtotals");

  assertDeepEqual(
    coverRows.slice(0, 13),
    [
      ["California SB 1103 — CAM Expense Disclosure"],
      ["Property", account.propertyName],
      ["Address", "1103 Compliance Way, Los Angeles, CA 90017"],
      ["Tenant", account.tenantName],
      ["Requestor Name", "Local SB 1103 Tenant"],
      ["Requestor Email", account.tenantEmail],
      ["Request Date", "August 31, 2026"],
      ["Response Deadline", "September 30, 2026"],
      ["Ledger Period", "February 28, 2025 — August 31, 2026"],
      ["Pro-Rata Share", "25.0000%"],
      ["Total CAM Expenses", "$1,750.01"],
      ["Tenant Total Share", "$437.50"],
      ["Landlord Certification"],
    ],
    "XLSX Cover sheet contract",
  );

  assertDeepEqual(
    ledgerRows,
    [
      [
        "Date",
        "Account Code",
        "Account Description",
        "Vendor",
        "Description",
        "Full Amount",
        "Your Share",
        "Import Batch ID",
      ],
      [
        "2025-03-15",
        "5100",
        "Janitorial",
        "Clean Co",
        "Monthly service",
        "$1,000.00",
        "$250.00",
        account.importBatchId,
      ],
      [
        "2026-01-15",
        "5200",
        "Utilities",
        "Power Co",
        "Usage charge",
        "$500.01",
        "$125.00",
        account.importBatchId,
      ],
      [
        "2026-08-01",
        "5300",
        "Repairs",
        "Repair Co",
        "HVAC repair",
        "$250.00",
        "$62.50",
        account.importBatchId,
      ],
      ["", "", "", "", "TOTAL", "$1,750.01", "$437.50"],
    ],
    "XLSX Ledger sheet contract",
  );

  assertDeepEqual(
    subtotalRows,
    [
      ["Expense Category", "Tenant Share"],
      ["Janitorial", "$250.00"],
      ["Repairs", "$62.50"],
      ["Utilities", "$125.00"],
      ["TOTAL", "$437.50"],
    ],
    "XLSX Category Subtotals sheet contract",
  );

  for (const forbidden of ["9999", "Hidden Vendor", "Should not leak"]) {
    assert(
      !workbook.text.includes(forbidden),
      `XLSX leaked hidden ledger value ${forbidden}`,
    );
  }
}

function assertPdfContainsExpectedLedger(bytes, label, account) {
  const text = extractPdfSearchText(bytes);
  for (const expected of [
    account.propertyName,
    account.tenantName,
    "February 28, 2025",
    "August 31, 2026",
    "September 30, 2026",
    "$1,750.01",
    "$437.50",
    "Janitorial",
    "Clean Co",
    "Utilities",
    "Repairs",
  ]) {
    assert(
      text.includes(expected),
      `${label} missing visible value ${expected}`,
    );
  }
  for (const forbidden of ["9999", "Hidden Vendor", "Should not leak"]) {
    assert(
      !text.includes(forbidden),
      `${label} leaked hidden value ${forbidden}`,
    );
  }
}

function parseXlsxWorkbook(entries) {
  const workbookXml = decodeZipText(entries, "xl/workbook.xml");
  const workbookRels = decodeZipText(entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(entries);
  const relTargets = new Map(
    [...workbookRels.matchAll(/<Relationship\b([^>]*)\/>/gu)].map((match) => {
      const attrs = parseXmlAttributes(match[1]);
      return [attrs.Id, normalizedWorkbookTarget(attrs.Target)];
    }),
  );
  const sheetPaths = new Map(
    [...workbookXml.matchAll(/<sheet\b([^>]*)\/>/gu)].map((match) => {
      const attrs = parseXmlAttributes(match[1]);
      const relId = attrs["r:id"];
      return [attrs.name, relTargets.get(relId)];
    }),
  );
  const textParts = Object.entries(entries)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, entry]) => new TextDecoder().decode(entry));

  return {
    text: textParts.join("\n"),
    sheetRows(name) {
      const path = sheetPaths.get(name);
      assert(path, `XLSX missing sheet ${name}`);
      return parseXlsxRows(decodeZipText(entries, path), sharedStrings);
    },
  };
}

function parseSharedStrings(entries) {
  if (!entries["xl/sharedStrings.xml"]) {
    return [];
  }
  const xml = decodeZipText(entries, "xl/sharedStrings.xml");
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)].map((match) =>
    decodeXmlText(
      [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
        .map((textMatch) => textMatch[1])
        .join(""),
    ),
  );
}

function parseXlsxRows(xml, sharedStrings) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)]
    .map((rowMatch) => {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(
        /<c\b([^>]*)>([\s\S]*?)<\/c>/gu,
      )) {
        const attrs = parseXmlAttributes(cellMatch[1]);
        const columnIndex = xlsxColumnIndex(attrs.r);
        cells[columnIndex] = parseXlsxCell(cellMatch[2], attrs, sharedStrings);
      }
      while (cells.length > 0 && (cells.at(-1) ?? "") === "") {
        cells.pop();
      }
      return cells.map((value) => value ?? "");
    })
    .filter((row) => row.length > 0);
}

function parseXlsxCell(innerXml, attrs, sharedStrings) {
  if (attrs.t === "inlineStr") {
    return decodeXmlText(
      [...innerXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
        .map((match) => match[1])
        .join(""),
    );
  }
  const value = innerXml.match(/<v>([\s\S]*?)<\/v>/u)?.[1] ?? "";
  if (attrs.t === "s") {
    return sharedStrings[Number.parseInt(value, 10)] ?? "";
  }
  return decodeXmlText(value);
}

function parseXmlAttributes(raw) {
  return Object.fromEntries(
    [...raw.matchAll(/([\w:]+)="([^"]*)"/gu)].map((match) => [
      match[1],
      decodeXmlText(match[2]),
    ]),
  );
}

function decodeZipText(entries, path) {
  const entry = entries[path];
  assert(entry, `XLSX entry missing: ${path}`);
  return new TextDecoder().decode(entry);
}

function normalizedWorkbookTarget(target) {
  if (target.startsWith("/")) {
    return target.replace(/^\/+/, "");
  }
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function xlsxColumnIndex(cellRef = "A1") {
  const letters = cellRef.match(/^[A-Z]+/u)?.[0] ?? "A";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeXmlText(value) {
  return String(value)
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertRequestRowShape(row, label) {
  assert(row && typeof row === "object", `${label} missing`);
  assertExactKeys(row, REQUEST_ROW_KEYS, label);
  assertUuid(row.id, `${label}.id`);
  assertUuid(row.organization_id, `${label}.organization_id`);
  assertUuid(row.property_id, `${label}.property_id`);
  assertUuid(row.lease_id, `${label}.lease_id`);
  assert(typeof row.requested_by_name === "string", `${label}.name missing`);
  assert(typeof row.requested_by_email === "string", `${label}.email missing`);
  assertDateString(row.request_date, `${label}.request_date`);
  assertDateString(row.response_deadline, `${label}.response_deadline`);
  assertDateString(row.window_start_date, `${label}.window_start_date`);
  assertDateString(row.window_end_date, `${label}.window_end_date`);
  assert(typeof row.status === "string", `${label}.status missing`);
  assert(
    row.export_format === null || typeof row.export_format === "string",
    `${label}.export_format invalid`,
  );
  if (row.exported_at !== null) {
    assertParseableTimestamp(row.exported_at, `${label}.exported_at`);
  }
  assert(
    row.notes === null || typeof row.notes === "string",
    `${label}.notes invalid`,
  );
  assertParseableTimestamp(row.created_at, `${label}.created_at`);
  assertParseableTimestamp(row.updated_at, `${label}.updated_at`);
}

function assertRequestRowFields(row, expected, label, options = {}) {
  assertRequestRowShape(row, label);
  for (const key of REQUEST_ROW_KEYS) {
    if (key === "id" && expected[key] === undefined) continue;
    if (key === "created_at" && expected[key] === undefined) continue;
    if (key === "updated_at" && options.allowUpdatedAtChange) continue;
    if (key === "exported_at" && options.requireExportedAt) {
      assert(row.exported_at !== null, `${label}.exported_at missing`);
      continue;
    }
    if (expected[key] !== undefined) {
      if (["created_at", "updated_at", "exported_at"].includes(key)) {
        assertTimestampsEqual(row[key], expected[key], `${label}.${key}`);
        continue;
      }
      assert(
        row[key] === expected[key],
        `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(row[key])}`,
      );
    }
  }
}

function assertRequestRowParity(actual, expected, label) {
  assertRequestRowShape(actual, label);
  assertRequestRowFields(actual, expected, label);
}

function assertNotFoundError(body, label, message = "SB1103Request not found") {
  assertJsonEqual(
    body,
    {
      detail: message,
      error: { code: "not_found", message },
    },
    label,
  );
}

function assertExactKeys(value, expectedKeys, label) {
  assert(value && typeof value === "object", `${label} missing`);
  assertJsonEqual(Object.keys(value).sort(), [...expectedKeys].sort(), label);
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertDateString(value, label) {
  assert(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value),
    `${label} should be YYYY-MM-DD: ${safeJson(value)}`,
  );
}

function assertParseableTimestamp(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  assert(
    !Number.isNaN(Date.parse(value)),
    `${label} should be a parseable timestamp: ${value}`,
  );
}

function assertTimestampsEqual(actual, expected, label) {
  if (actual === null || expected === null) {
    assert(
      actual === expected,
      `${label} mismatch: expected ${safeJson(expected)}, got ${safeJson(actual)}`,
    );
    return;
  }
  assertParseableTimestamp(actual, label);
  assertParseableTimestamp(expected, `${label} expected`);
  assert(
    Math.abs(Date.parse(actual) - Date.parse(expected)) < 1000,
    `${label} mismatch: expected ${expected}, got ${actual}`,
  );
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} should be a UUID: ${safeJson(value)}`,
  );
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.trunc((end - start) / 86_400_000);
}

function sb1103BaseName(input) {
  return `SB1103_${tenantSlug(input.tenantName)}_${input.windowStartDate.replaceAll("-", "")}_${input.windowEndDate.replaceAll("-", "")}`;
}

function tenantSlug(tenantName) {
  const slug = tenantName.trim().replace(/\s+/gu, "_");
  const safe = slug.replace(/[^a-zA-Z0-9_]/gu, "");
  return safe.slice(0, 30) || "Tenant";
}

function extractPdfSearchText(bytes) {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts = [raw];
  let cursor = 0;
  while (cursor < raw.length) {
    const marker = raw.indexOf("stream", cursor);
    if (marker === -1) break;
    let streamStart = marker + "stream".length;
    if (raw[streamStart] === "\r" && raw[streamStart + 1] === "\n") {
      streamStart += 2;
    } else if (raw[streamStart] === "\n" || raw[streamStart] === "\r") {
      streamStart += 1;
    }
    const streamEnd = raw.indexOf("endstream", streamStart);
    if (streamEnd === -1) break;
    const streamBytes = bytes.slice(streamStart, streamEnd);
    const dictionaryStart = Math.max(raw.lastIndexOf("<<", marker), 0);
    const dictionary = raw.slice(dictionaryStart, marker);
    if (dictionary.includes("/FlateDecode")) {
      try {
        const decoded = new TextDecoder().decode(unzlibSync(streamBytes));
        parts.push(decoded);
        parts.push(decodePdfHexStrings(decoded));
      } catch {
        const decoded = Buffer.from(streamBytes).toString("latin1");
        parts.push(decoded);
        parts.push(decodePdfHexStrings(decoded));
      }
    } else {
      const decoded = Buffer.from(streamBytes).toString("latin1");
      parts.push(decoded);
      parts.push(decodePdfHexStrings(decoded));
    }
    cursor = streamEnd + "endstream".length;
  }
  return parts.join("\n");
}

function decodePdfHexStrings(value) {
  return [...value.matchAll(/<([0-9a-fA-F\s]{2,})>/gu)]
    .map((match) => {
      const hex = match[1].replace(/\s+/gu, "");
      if (hex.length < 2) return "";
      const normalized = hex.length % 2 === 0 ? hex : `${hex}0`;
      const bytes = new Uint8Array(normalized.length / 2);
      for (let index = 0; index < normalized.length; index += 2) {
        bytes[index / 2] = Number.parseInt(
          normalized.slice(index, index + 2),
          16,
        );
      }
      return new TextDecoder().decode(bytes);
    })
    .join("\n");
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
  if (url.username || url.password)
    fail(`${label} must not include credentials`);
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

function nonEmptyUuid(values) {
  return nonEmpty(values, "00000000-0000-4000-8000-000000000000");
}

function nonEmptyText(values) {
  return nonEmpty(values, "__sb1103_e2e_none__");
}

function nonEmpty(values, sentinel) {
  const clean = [...new Set((values ?? []).filter(Boolean))];
  return clean.length > 0 ? clean : [sentinel];
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
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

function fail(message) {
  throw new Error(message);
}
