import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { promisify, TextDecoder } from "node:util";
import { inflateSync } from "node:zlib";
import { unzipSync } from "fflate";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8852";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DEFAULT_REPORTS_BUCKET = "capveri-reports-dev";
const SUPABASE_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const execFileAsync = promisify(execFile);

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) {
    fail("Refusing to run local historical-analysis E2E in CI.");
  }
  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local historical-analysis E2E always owns ${DEFAULT_BASE_URL}`);
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
      DEFAULT_DATABASE_URL,
  );
  if (args["reports-bucket"] || process.env.npm_config_reports_bucket) {
    fail(`local historical-analysis E2E always uses ${DEFAULT_REPORTS_BUCKET}`);
  }
  const reportsBucket = DEFAULT_REPORTS_BUCKET;
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    SUPABASE_LOCAL_ANON_KEY;

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
          reportsBucket,
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
  const r2Keys = [];
  let runResult;
  let runError;
  try {
    const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
    const hiddenHeaders = jsonAuthHeaders(account.hidden.accessToken);
    const noAccessHeaders = jsonAuthHeaders(account.noAccess.accessToken);

    const years = await expectJson(
      `${input.baseUrl}/api/v1/analysis/properties/${account.propertyId}/available-years`,
      { headers: ownerHeaders, status: 200 },
    );
    assertJsonEqual(years, [2024, 2025], "available years");
    const hiddenYears = await expectJson(
      `${input.baseUrl}/api/v1/analysis/properties/${account.propertyId}/available-years`,
      { headers: hiddenHeaders, status: 404 },
    );
    assertErrorBody(
      hiddenYears,
      "property_not_found",
      "Property not found",
      "hidden available years response",
    );

    const yoy = await expectJson(
      `${input.baseUrl}/api/v1/analysis/year-over-year`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.propertyId,
          years: [2025, 2024],
          use_fuzzy_matching: true,
        }),
      },
    );
    assertYoy(yoy, account);

    const anomalies = await expectJson(
      `${input.baseUrl}/api/v1/analysis/anomaly-detection`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.propertyId,
          target_year: 2025,
          comparison_years: [2024],
        }),
      },
    );
    assertAnomalies(anomalies, account);
    await assertFeatureUsage(sql, account.owner.organizationId);

    const noAccessYoy = await expectJson(
      `${input.baseUrl}/api/v1/analysis/year-over-year`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          years: [2024, 2025],
        }),
      },
    );
    assertErrorBody(
      noAccessYoy,
      "subscription_required",
      "subscription_required: An active subscription or trial is required.",
      "no-access YoY response",
    );
    const hiddenYoy = await expectJson(
      `${input.baseUrl}/api/v1/analysis/year-over-year`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({
          property_id: account.hiddenPropertyId,
          years: [2024, 2025],
        }),
      },
    );
    assertErrorBody(
      hiddenYoy,
      "property_not_found",
      "Property not found",
      "hidden YoY response",
    );
    const missingYearYoy = await expectJson(
      `${input.baseUrl}/api/v1/analysis/year-over-year`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        body: JSON.stringify({
          property_id: account.propertyId,
          years: [2023, 2025],
        }),
      },
    );
    assertErrorBody(
      missingYearYoy,
      "invalid_analysis_request",
      "No finalized snapshots found for years: 2023",
      "missing-year YoY response",
    );

    const xlsx = await expectBytes(
      `${input.baseUrl}/api/v1/reports/historical/excel`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.propertyId,
          years: [2024, 2025],
          include_charts: false,
        }),
      },
    );
    assert(
      xlsx.contentType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "XLSX content-type mismatch",
    );
    assert(
      xlsx.contentDisposition ===
        `attachment; filename="historical_analysis_${account.propertyId}_2024-2025.xlsx"`,
      "XLSX filename mismatch",
    );
    assertHistoricalXlsx(xlsx.bytes);
    assertXlsxNoLeakage(xlsx.bytes, account);

    const noAccessXlsx = await expectJson(
      `${input.baseUrl}/api/v1/reports/historical/excel`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          years: [2024, 2025],
        }),
      },
    );
    assertErrorBody(
      noAccessXlsx,
      "subscription_required",
      "subscription_required: An active subscription or trial is required.",
      "no-access historical XLSX response",
    );

    const pdfResponse = await expectJson(
      `${input.baseUrl}/api/v1/reports/historical/pdf`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.propertyId,
          years: [2024, 2025],
          include_charts: false,
        }),
      },
    );
    assertExactKeys(
      pdfResponse,
      ["report_url", "expires_at", "format"],
      "historical PDF response",
    );
    assert(pdfResponse.format === "pdf", "historical PDF format mismatch");
    assertIsoTimestamp(pdfResponse.expires_at, "historical PDF expires_at");
    assert(
      typeof pdfResponse.report_url === "string" &&
        pdfResponse.report_url.includes("/api/v1/export/download/file?token="),
      "historical PDF report_url missing token route",
    );
    const token = new URL(pdfResponse.report_url).searchParams.get("token");
    assert(typeof token === "string" && token !== "", "PDF token missing");
    const tokenPayload = decodeExportTokenPayload(token);
    assert(
      tokenPayload.r2Key.startsWith(
        `reports/${account.owner.organizationId}/${account.propertyId}/`,
      ),
      "PDF R2 key scope mismatch",
    );
    r2Keys.push(tokenPayload.r2Key);
    assert(
      tokenPayload.fileName === `historical_analysis_${account.propertyId}.pdf`,
      "PDF token filename mismatch",
    );
    assert(
      tokenPayload.expiresAt ===
        Math.floor(Date.parse(pdfResponse.expires_at) / 1000),
      "PDF token expiry mismatch",
    );

    const pdf = await expectBytes(pdfResponse.report_url, { status: 200 });
    assertPdf(pdf, account);
    assertPdfTextContains(
      pdf.bytes,
      [
        "Historical Expense Analysis Report",
        "Analysis Period: 2024 - 2025",
        "Cleaning",
        "Insurance",
      ],
      "historical PDF",
    );
    assertPdfNoLeakage(pdf.bytes, account);

    const noAccessPdf = await expectJson(
      `${input.baseUrl}/api/v1/reports/historical/pdf`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          years: [2024, 2025],
        }),
      },
    );
    assertErrorBody(
      noAccessPdf,
      "subscription_required",
      "subscription_required: An active subscription or trial is required.",
      "no-access historical PDF response",
    );

    runResult = {
      index: input.index,
      property_id: account.propertyId,
      total_variance_percent: yoy.total_variance_percent,
      anomalies: anomalies.total_anomalies,
      xlsx_bytes: xlsx.bytes.byteLength,
      pdf_bytes: pdf.bytes.byteLength,
      r2_key_deleted: tokenPayload.r2Key,
    };
  } catch (error) {
    runError = error;
  }

  let cleanupError;
  try {
    for (const key of r2Keys) {
      try {
        await deleteLocalR2Object(input.reportsBucket, key);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      await cleanupGeneratedRows(sql, account);
      await assertCleanupComplete(sql, account);
    } catch (error) {
      cleanupError ??= error;
    }
    try {
      await assertR2ObjectsMissing(input.reportsBucket, r2Keys);
    } catch (error) {
      cleanupError ??= error;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return runResult;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const created = [];
  const ids = {
    propertyId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    noAccessPropertyId: randomUUID(),
    leaseId: randomUUID(),
    hiddenLeaseId: randomUUID(),
    noAccessLeaseId: randomUUID(),
    import2024Id: randomUUID(),
    import2025Id: randomUUID(),
    hiddenImportId: randomUUID(),
    hiddenImport2025Id: randomUUID(),
    noAccessImportId: randomUUID(),
  };
  try {
    const owner = await createLocalAuthUser(input, {
      created,
      email: `historical-e2e-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}Aa1!`,
      fullName: `Local Historical Owner ${suffix}`,
      organizationName: `Local Historical Owner Org ${suffix}`,
      role: "owner",
    });
    created.push(owner);
    const hidden = await createLocalAuthUser(input, {
      created,
      email: `historical-e2e-hidden-${suffix}@capveri.local`,
      password: `HiddenPass${input.index}Aa1!`,
      fullName: `Local Historical Hidden ${suffix}`,
      organizationName: `Local Historical Hidden Org ${suffix}`,
      role: "owner",
    });
    created.push(hidden);
    const noAccess = await createLocalAuthUser(input, {
      created,
      email: `historical-e2e-no-access-${suffix}@capveri.local`,
      password: `NoAccessPass${input.index}Aa1!`,
      fullName: `Local Historical No Access ${suffix}`,
      organizationName: `Local Historical No Access Org ${suffix}`,
      role: "owner",
    });
    created.push(noAccess);

    const account = {
      owner,
      hidden,
      noAccess,
      propertyId: ids.propertyId,
      hiddenPropertyId: ids.hiddenPropertyId,
      noAccessPropertyId: ids.noAccessPropertyId,
      propertyName: `Local Historical Tower ${suffix}`,
      hiddenPropertyName: `HIDDEN Historical Tower ${suffix}`,
      hiddenMarker: `HIDDEN-HISTORICAL-${suffix}`,
      cleanupOrganizationIds: [
        owner.signupOrganizationId,
        hidden.signupOrganizationId,
        noAccess.signupOrganizationId,
      ],
      cleanupUserIds: [owner.userId, hidden.userId, noAccess.userId],
      cleanupEmails: [owner.email, hidden.email, noAccess.email],
      cleanupOrganizationNames: [
        owner.organizationName,
        hidden.organizationName,
        noAccess.organizationName,
      ],
      cleanupPropertyIds: [
        ids.propertyId,
        ids.hiddenPropertyId,
        ids.noAccessPropertyId,
      ],
      cleanupLeaseIds: [ids.leaseId, ids.hiddenLeaseId, ids.noAccessLeaseId],
      cleanupImportBatchIds: [
        ids.import2024Id,
        ids.import2025Id,
        ids.hiddenImportId,
        ids.hiddenImport2025Id,
        ids.noAccessImportId,
      ],
    };

    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await sql.begin(async (transaction) => {
        await transaction`
          insert into subscriptions (organization_id, plan, status, current_period_start, current_period_end)
          values
            (${owner.signupOrganizationId}, 'professional', 'active', now(), now() + interval '30 days'),
            (${hidden.signupOrganizationId}, 'professional', 'active', now(), now() + interval '30 days')
        `;
        await insertProperty(transaction, {
          id: ids.propertyId,
          organizationId: owner.signupOrganizationId,
          name: account.propertyName,
        });
        await insertProperty(transaction, {
          id: ids.hiddenPropertyId,
          organizationId: hidden.signupOrganizationId,
          name: account.hiddenPropertyName,
        });
        await insertProperty(transaction, {
          id: ids.noAccessPropertyId,
          organizationId: noAccess.signupOrganizationId,
          name: `Local Historical No Access Tower ${suffix}`,
        });
        await insertLease(transaction, {
          id: ids.leaseId,
          propertyId: ids.propertyId,
          tenantName: `Historical Tenant ${suffix}`,
        });
        await insertLease(transaction, {
          id: ids.hiddenLeaseId,
          propertyId: ids.hiddenPropertyId,
          tenantName: `Hidden Tenant ${suffix}`,
        });
        await insertLease(transaction, {
          id: ids.noAccessLeaseId,
          propertyId: ids.noAccessPropertyId,
          tenantName: `No Access Tenant ${suffix}`,
        });
        await insertSnapshots(transaction, {
          organizationId: owner.signupOrganizationId,
          propertyId: ids.propertyId,
          leaseId: ids.leaseId,
          userId: owner.userId,
        });
        await insertSnapshots(transaction, {
          organizationId: hidden.signupOrganizationId,
          propertyId: ids.hiddenPropertyId,
          leaseId: ids.hiddenLeaseId,
          userId: hidden.userId,
        });
        await insertSnapshots(transaction, {
          organizationId: noAccess.signupOrganizationId,
          propertyId: ids.noAccessPropertyId,
          leaseId: ids.noAccessLeaseId,
          userId: noAccess.userId,
        });
        await seedAnalysisData(transaction, {
          propertyId: ids.propertyId,
          organizationId: owner.signupOrganizationId,
          import2024Id: ids.import2024Id,
          import2025Id: ids.import2025Id,
          suffix,
        });
        await seedAnalysisData(transaction, {
          propertyId: ids.hiddenPropertyId,
          organizationId: hidden.signupOrganizationId,
          import2024Id: ids.hiddenImportId,
          import2025Id: ids.hiddenImport2025Id,
          suffix: account.hiddenMarker,
          hidden: true,
        });
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
    return account;
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, created);
    throw error;
  }
}

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.name}, '100 Local Way',
      'Houston', 'TX', '77002', 100000, 90000
    )
  `;
}

async function insertLease(sql, input) {
  await sql`
    insert into leases (id, property_id, tenant_name, status, start_date, end_date, recovery_profile)
    values (
      ${input.id}, ${input.propertyId}, ${input.tenantName}, 'active',
      '2024-01-01', '2028-12-31',
      ${sql.json({ base_year: 2024, pro_rata_share: "0.1000", cap_type: "none" })}
    )
  `;
}

async function insertSnapshots(sql, input) {
  for (const year of [2024, 2025]) {
    await sql`
      insert into reconciliation_snapshots (
        organization_id, property_id, lease_id, period_start_date, period_end_date,
        status, total_operating_expenses, grossed_up_expenses, base_year_amount,
        tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
        calculation_trace, finalized_at, finalized_by_user_id
      )
      values (
        ${input.organizationId}, ${input.propertyId}, ${input.leaseId},
        ${`${year}-01-01`}, ${`${year}-12-31`}, 'finalized',
        ${year === 2024 ? "30000.00" : "53500.00"},
        ${year === 2024 ? "30000.00" : "53500.00"},
        '0', '0', '0', '0', '0', '[]'::jsonb, now(), ${input.userId}
      )
    `;
  }
}

async function seedAnalysisData(sql, input) {
  const cleaningId = randomUUID();
  const insuranceId = randomUUID();
  const repairsId = randomUUID();
  await sql`
    insert into expense_pools (id, property_id, name, pool_type, is_gross_up_applicable)
    values
      (${cleaningId}, ${input.propertyId}, ${input.hidden ? input.suffix : "Cleaning"}, 'operating', true),
      (${insuranceId}, ${input.propertyId}, 'Insurance', 'insurance', false),
      (${repairsId}, ${input.propertyId}, 'Repairs', 'operating', true)
  `;
  await sql`
    insert into pool_mappings (expense_pool_id, gl_account_pattern, allocation_percentage, priority)
    values
      (${cleaningId}, '600%', 1, 100),
      (${insuranceId}, '700%', 1, 90),
      (${repairsId}, '800%', 1, 80)
  `;
  await sql`
    insert into import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count)
    values
      (${input.import2024Id}, ${input.organizationId}, ${input.propertyId}, 'historical-2024.csv', repeat('a', 64), 'generic', 'completed', 3),
      (${input.import2025Id}, ${input.organizationId}, ${input.propertyId}, 'historical-2025.csv', repeat('b', 64), 'generic', 'completed', 3)
  `;
  await sql`
    insert into gl_entries (
      import_batch_id, property_id, account_code, account_description, amount,
      transaction_date, period_year, period_month, vendor_name, description, raw_row_data
    )
    values
      (${input.import2024Id}, ${input.propertyId}, '6001', 'Cleaning', 10000, '2024-03-01', 2024, 3, 'Clean Co', 'Base cleaning', ${sql.json({ source: "historical-e2e" })}),
      (${input.import2024Id}, ${input.propertyId}, '7001', 'Insurance', 20000, '2024-04-01', 2024, 4, 'Insure Co', 'Base insurance', ${sql.json({ source: "historical-e2e" })}),
      (${input.import2025Id}, ${input.propertyId}, '6001', 'Cleaning', 18000, '2025-03-01', 2025, 3, 'Clean Co', 'Spike cleaning', ${sql.json({ source: "historical-e2e" })}),
      (${input.import2025Id}, ${input.propertyId}, '7001', 'Insurance', 20500, '2025-04-01', 2025, 4, 'Insure Co', 'Stable insurance', ${sql.json({ source: "historical-e2e" })}),
      (${input.import2025Id}, ${input.propertyId}, '8001', 'Repairs', 15000, '2025-05-01', 2025, 5, 'Repair Co', ${input.hidden ? input.suffix : "New repair category"}, ${sql.json({ source: "historical-e2e" })})
  `;
}

function assertYoy(yoy, account) {
  assertExactKeys(
    yoy,
    [
      "property_id",
      "property_name",
      "years",
      "base_year",
      "total_amounts",
      "total_variance_amount",
      "total_variance_percent",
      "pool_comparisons",
    ],
    "YoY response",
  );
  assertExactObject(
    {
      property_id: yoy.property_id,
      property_name: yoy.property_name,
      base_year: yoy.base_year,
      total_variance_amount: yoy.total_variance_amount,
      total_variance_percent: yoy.total_variance_percent,
    },
    {
      property_id: account.propertyId,
      property_name: account.propertyName,
      base_year: 2024,
      total_variance_amount: "23500",
      total_variance_percent: "78.33333333333333333333333333",
    },
    "YoY scalar fields",
  );
  assert(JSON.stringify(yoy.years) === "[2024,2025]", "YoY years mismatch");
  assertExactObject(
    yoy.total_amounts,
    { 2024: "30000", 2025: "53500" },
    "YoY total amounts",
  );
  assert(Array.isArray(yoy.pool_comparisons), "YoY pool list not array");
  assert(yoy.pool_comparisons.length === 3, "YoY pool count mismatch");
  const expectedPools = [
    {
      pool_name: "Cleaning",
      amounts: { 2024: "10000", 2025: "18000" },
      base_year_amount: "10000",
      variance_amount: "8000",
      variance_percent: "80",
      variance_level: "critical",
      matched_from: null,
    },
    {
      pool_name: "Insurance",
      amounts: { 2024: "20000", 2025: "20500" },
      base_year_amount: "20000",
      variance_amount: "500",
      variance_percent: "2.5",
      variance_level: "normal",
      matched_from: null,
    },
    {
      pool_name: "Repairs",
      amounts: { 2024: null, 2025: "15000" },
      base_year_amount: null,
      variance_amount: null,
      variance_percent: null,
      variance_level: "normal",
      matched_from: null,
    },
  ];
  expectedPools.forEach((expected, index) => {
    assertPoolComparison(yoy.pool_comparisons[index], expected, index + 1);
  });
  assertNoLeakage(JSON.stringify(yoy), account);
}

function assertAnomalies(anomalies, account) {
  assertExactKeys(
    anomalies,
    [
      "property_id",
      "target_year",
      "total_anomalies",
      "critical_count",
      "warning_count",
      "info_count",
      "anomalies",
    ],
    "anomaly response",
  );
  assertExactObject(
    {
      property_id: anomalies.property_id,
      target_year: anomalies.target_year,
      total_anomalies: anomalies.total_anomalies,
      critical_count: anomalies.critical_count,
      warning_count: anomalies.warning_count,
      info_count: anomalies.info_count,
    },
    {
      property_id: account.propertyId,
      target_year: 2025,
      total_anomalies: 2,
      critical_count: 1,
      warning_count: 0,
      info_count: 1,
    },
    "anomaly scalar fields",
  );
  assert(Array.isArray(anomalies.anomalies), "anomalies list not array");
  assert(anomalies.anomalies.length === 2, "anomaly row count mismatch");
  assertAnomalyRecord(
    anomalies.anomalies[0],
    {
      pool_name: "Cleaning",
      anomaly_type: "spike",
      severity: "critical",
      current_value: "18000",
      expected_value: "10000",
      variance_percent: "80",
      explanation:
        "Cleaning increased by 80% compared to the 3-year average. Current: $18,000.00, Expected: $10,000.00",
      years_affected: [2025],
    },
    "Cleaning anomaly",
  );
  assertAnomalyRecord(
    anomalies.anomalies[1],
    {
      pool_name: "Repairs",
      anomaly_type: "new_category",
      severity: "info",
      current_value: "15000",
      expected_value: "0",
      variance_percent: "100",
      explanation:
        "Repairs is a new expense category not present in prior years",
      years_affected: [2025],
    },
    "Repairs anomaly",
  );
  assertNoLeakage(JSON.stringify(anomalies), account);
}

function assertPoolComparison(actual, expected, index) {
  assertExactKeys(
    actual,
    [
      "pool_name",
      "amounts",
      "base_year_amount",
      "variance_amount",
      "variance_percent",
      "variance_level",
      "matched_from",
    ],
    `YoY pool ${index}`,
  );
  assertExactObject(
    {
      pool_name: actual.pool_name,
      base_year_amount: actual.base_year_amount,
      variance_amount: actual.variance_amount,
      variance_percent: actual.variance_percent,
      variance_level: actual.variance_level,
      matched_from: actual.matched_from,
    },
    {
      pool_name: expected.pool_name,
      base_year_amount: expected.base_year_amount,
      variance_amount: expected.variance_amount,
      variance_percent: expected.variance_percent,
      variance_level: expected.variance_level,
      matched_from: expected.matched_from,
    },
    `YoY pool ${index}`,
  );
  assertExactObject(
    actual.amounts,
    expected.amounts,
    `YoY pool ${index} amounts`,
  );
}

function assertAnomalyRecord(actual, expected, label) {
  assertExactKeys(
    actual,
    [
      "pool_name",
      "anomaly_type",
      "severity",
      "current_value",
      "expected_value",
      "variance_percent",
      "explanation",
      "years_affected",
    ],
    label,
  );
  for (const key of [
    "pool_name",
    "anomaly_type",
    "severity",
    "current_value",
    "expected_value",
    "variance_percent",
    "explanation",
  ]) {
    assert(
      actual[key] === expected[key],
      `${label} ${key} mismatch: expected ${expected[key]}, got ${actual[key]}`,
    );
  }
  assert(
    JSON.stringify(actual.years_affected) ===
      JSON.stringify(expected.years_affected),
    `${label} years_affected mismatch`,
  );
}

function assertExactObject(actual, expected, label) {
  assertExactKeys(actual, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    assert(
      actual[key] === expectedValue,
      `${label} ${key} mismatch: expected ${expectedValue}, got ${actual[key]}`,
    );
  }
}

function assertErrorBody(body, code, message, label) {
  assertJsonEqual(body, { detail: message, error: { code, message } }, label);
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  const actualKeys = Object.keys(actual).sort();
  const sortedExpected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(sortedExpected),
    `${label} keys mismatch: expected ${sortedExpected.join(",")}, got ${actualKeys.join(",")}`,
  );
}

function assertIsoTimestamp(value, label) {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(Date.parse(value)),
    `${label} should be an ISO timestamp`,
  );
}

async function createLocalAuthUser(input, user) {
  const { created, ...profile } = user;
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
    method: "POST",
    headers: { apikey: input.anonKey, "content-type": "application/json" },
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
  assert(typeof userId === "string" && userId !== "", "signup user id missing");
  const partial = {
    ...profile,
    userId,
    signupOrganizationId: undefined,
    organizationId: undefined,
    accessToken: undefined,
  };
  created?.push(partial);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let organizationId;
  try {
    await sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
    await sql`
      update users
      set role = ${profile.role}, full_name = ${profile.fullName}, updated_at = now()
      where id = ${userId}
    `;
    const rows =
      await sql`select organization_id from users where id = ${userId} limit 1`;
    organizationId = rows[0]?.organization_id;
    partial.signupOrganizationId = organizationId;
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
  assert(
    typeof accessToken === "string" && accessToken !== "",
    "access token missing",
  );
  assert(
    typeof organizationId === "string" && organizationId !== "",
    "organization id missing",
  );
  partial.accessToken = accessToken;
  return {
    ...profile,
    userId,
    signupOrganizationId: organizationId,
    organizationId,
    accessToken,
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-historical-e2e-"));
  const path = resolve(directory, ".dev.vars.local-historical-analysis-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-historical-analysis-e2e-signing-secret",
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
  await killLoopbackPortOwner(Number(url.port));
  const retryDeadline = Date.now() + 3000;
  while (Date.now() < retryDeadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
}

async function killLoopbackPortOwner(port) {
  if (process.platform !== "win32") return;
  await new Promise((resolveKill) => {
    const killer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference='SilentlyContinue'; " +
          `$port=${port}; ` +
          "Get-NetTCPConnection -LocalPort $port -State Listen | " +
          "Select-Object -ExpandProperty OwningProcess -Unique | " +
          "Where-Object { $_ -and $_ -ne $PID } | " +
          "ForEach-Object { Stop-Process -Id $_ -Force }",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
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

async function signInWithPassword(input) {
  const url = new URL("/auth/v1/token", input.supabaseUrl);
  url.searchParams.set("grant_type", "password");
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: input.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return undefined;
  return body.access_token;
}

async function assertFeatureUsage(sql, organizationId) {
  const rows = await sql`
    select usage_count::int
    from feature_usage_events
    where organization_id = ${organizationId}
      and feature_key = 'anomaly_alerts'
    limit 1
  `;
  assert(rows[0]?.usage_count >= 1, "anomaly feature usage was not recorded");
}

async function cleanupGeneratedRows(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds);
  const userIds = nonEmpty(account.cleanupUserIds);
  const emails = nonEmpty(
    account.cleanupEmails,
    "__local_historical_e2e_none__",
  );
  const orgNames = nonEmpty(
    account.cleanupOrganizationNames,
    "__local_historical_e2e_none__",
  );
  const propertyIds = nonEmpty(account.cleanupPropertyIds);
  const leaseIds = nonEmpty(account.cleanupLeaseIds);
  const importBatchIds = nonEmpty(account.cleanupImportBatchIds);
  await sql.begin(async (transaction) => {
    await transaction`delete from feature_usage_events where organization_id in ${transaction(orgIds)}`;
    await transaction`delete from gl_entries where import_batch_id in ${transaction(importBatchIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from pool_mappings where expense_pool_id in (select id from expense_pools where property_id in ${transaction(propertyIds)})`;
    await transaction`delete from expense_pools where property_id in ${transaction(propertyIds)}`;
    await transaction`delete from import_batches where id in ${transaction(importBatchIds)} or property_id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from reconciliation_snapshots where property_id in ${transaction(propertyIds)} or lease_id in ${transaction(leaseIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from leases where id in ${transaction(leaseIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from properties where id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from subscriptions where organization_id in ${transaction(orgIds)}`;
    await transaction`delete from audit_credits where organization_id in ${transaction(orgIds)}`;
    await transaction`delete from signup_email_events where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`delete from legal_acceptances where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)}`;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`delete from audit_log where organization_id in ${transaction(orgIds)} or changed_by in ${transaction(userIds)}`;
    await transaction`delete from users where id in ${transaction(userIds)} or email in ${transaction(emails)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from auth.users where id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`delete from organizations where id in ${transaction(orgIds)} or name in ${transaction(orgNames)}`;
  });
}

async function assertCleanupComplete(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds);
  const userIds = nonEmpty(account.cleanupUserIds);
  const emails = nonEmpty(
    account.cleanupEmails,
    "__local_historical_e2e_none__",
  );
  const orgNames = nonEmpty(
    account.cleanupOrganizationNames,
    "__local_historical_e2e_none__",
  );
  const propertyIds = nonEmpty(account.cleanupPropertyIds);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as properties,
      (select count(*)::int from gl_entries where property_id in ${sql(propertyIds)}) as gl_entries,
      (select count(*)::int from reconciliation_snapshots where property_id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as snapshots,
      (select count(*)::int from feature_usage_events where organization_id in ${sql(orgIds)}) as feature_usage,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events
  `;
  const row = rows[0];
  for (const [key, value] of Object.entries(row)) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function cleanupSeededAccounts(databaseUrl, accounts) {
  if (accounts.length === 0) return;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const account = {
      cleanupOrganizationIds: accounts.map((item) => item.signupOrganizationId),
      cleanupUserIds: accounts.map((item) => item.userId),
      cleanupEmails: accounts.map((item) => item.email),
      cleanupOrganizationNames: accounts.map((item) => item.organizationName),
      cleanupPropertyIds: [],
      cleanupLeaseIds: [],
      cleanupImportBatchIds: [],
    };
    await cleanupGeneratedRows(sql, account);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function deleteLocalR2Object(bucket, key) {
  assertSafeReportKey(key);
  await execFileAsync(
    process.execPath,
    [WRANGLER_BIN, "r2", "object", "delete", `${bucket}/${key}`, "--local"],
    { cwd: process.cwd(), timeout: 30000, windowsHide: true },
  );
}

async function assertR2ObjectsMissing(bucket, keys) {
  for (const key of keys) {
    assertSafeReportKey(key);
    const directory = await mkdtemp(
      resolve(tmpdir(), "capveri-historical-r2-get-"),
    );
    const outputPath = resolve(directory, "object.bin");
    try {
      await execFileAsync(
        process.execPath,
        [
          WRANGLER_BIN,
          "r2",
          "object",
          "get",
          `${bucket}/${key}`,
          "--local",
          "--file",
          outputPath,
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
      fail(`local R2 object still exists after cleanup: ${bucket}/${key}`);
    } catch (error) {
      const text = `${error.message ?? ""}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`;
      if (text.includes("The specified key does not exist")) {
        await rm(directory, { recursive: true, force: true });
        continue;
      }
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function assertSafeReportKey(key) {
  assert(key.startsWith("reports/"), `refusing non-report key: ${key}`);
  assert(!key.startsWith("/"), `refusing absolute key: ${key}`);
  assert(!key.includes("\\"), `refusing Windows-style key: ${key}`);
  assert(
    !key
      .split("/")
      .some((part) => part === "" || part === "." || part === ".."),
    `refusing unsafe key: ${key}`,
  );
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return body;
}

async function expectBytes(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.status !== status) {
    const text = new TextDecoder().decode(bytes);
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
  };
}

function assertHistoricalXlsx(bytes) {
  const workbook = parseXlsxWorkbook(bytes);
  assert(
    workbook.workbookXml.includes("Year-over-Year Comparison") &&
      workbook.workbookXml.includes("Detected Anomalies"),
    "XLSX workbook sheet names mismatch",
  );

  const yoyRows = parseXlsxRows(workbook, 1);
  assertXlsxRowsStartWith(yoyRows, [
    ["Expense Pool", "2024", "2025", "Variance %"],
    ["Cleaning", 10000, 18000, 0.8],
    ["Insurance", 20000, 20500, 0.025],
    ["Repairs", 0, 15000, 0],
    ["Total", 30000, 53500, 0.7833333333],
  ]);
  assert(
    yoyRows.some((row) =>
      String(row[0] ?? "").startsWith(
        "This report is generated automatically from data you provided",
      ),
    ),
    "XLSX YoY disclaimer row missing",
  );

  const anomalyRows = parseXlsxRows(workbook, 2);
  assertXlsxRowsEqual(anomalyRows, [
    [
      "Severity",
      "Expense Pool",
      "Type",
      "Current",
      "Expected",
      "Variance %",
      "Explanation",
    ],
    [
      "CRITICAL",
      "Cleaning",
      "Spike",
      18000,
      10000,
      0.8,
      "Cleaning increased by 80% compared to the 3-year average. Current: $18,000.00, Expected: $10,000.00",
    ],
    [
      "INFO",
      "Repairs",
      "New Category",
      15000,
      0,
      1,
      "Repairs is a new expense category not present in prior years",
    ],
  ]);
}

function parseXlsxWorkbook(bytes) {
  const entries = unzipSync(bytes);
  const workbookXml = decodeXlsxEntry(entries, "xl/workbook.xml");
  const sharedStringsXml = entries["xl/sharedStrings.xml"]
    ? new TextDecoder().decode(entries["xl/sharedStrings.xml"])
    : "";
  return {
    entries,
    workbookXml,
    sharedStrings: parseSharedStrings(sharedStringsXml),
  };
}

function parseSharedStrings(xml) {
  const strings = [];
  for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/gu)) {
    const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)].map(
      (part) => decodeXml(part[1]),
    );
    strings.push(parts.join(""));
  }
  return strings;
}

function parseXlsxRows(workbook, sheetIndex) {
  const xml = decodeXlsxEntry(
    workbook.entries,
    `xl/worksheets/sheet${sheetIndex}.xml`,
  );
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/gu)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(
      /<c([^>]*)>([\s\S]*?)<\/c>/gu,
    )) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\sr="([A-Z]+)(\d+)"/u);
      const columnIndex = ref ? columnLettersToIndex(ref[1]) : row.length;
      while (row.length < columnIndex) row.push(null);
      row.push(parseXlsxCell(attrs, body, workbook.sharedStrings));
    }
    rows.push(row);
  }
  return rows;
}

function parseXlsxCell(attrs, body, sharedStrings) {
  const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/u);
  const inlineMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/u);
  if (attrs.includes(' t="s"')) {
    const index = valueMatch ? Number.parseInt(valueMatch[1], 10) : -1;
    return sharedStrings[index] ?? "";
  }
  if (inlineMatch) return decodeXml(inlineMatch[1]);
  if (!valueMatch) return null;
  const raw = decodeXml(valueMatch[1]);
  const number = Number(raw);
  return Number.isFinite(number) ? number : raw;
}

function assertXlsxRowsStartWith(rows, expectedRows) {
  assert(
    rows.length >= expectedRows.length,
    `XLSX row count too small: expected at least ${expectedRows.length}, got ${rows.length}`,
  );
  expectedRows.forEach((expected, index) => {
    assert(
      xlsxRowEquals(rows[index] ?? [], expected),
      `XLSX row ${index + 1} mismatch: expected ${safeJson(expected)}, got ${safeJson(rows[index])}`,
    );
  });
}

function assertXlsxRowsEqual(rows, expectedRows) {
  assert(
    rows.length === expectedRows.length,
    `XLSX row count mismatch: expected ${expectedRows.length}, got ${rows.length}: ${safeJson(rows)}`,
  );
  expectedRows.forEach((expected, index) => {
    assert(
      xlsxRowEquals(rows[index] ?? [], expected),
      `XLSX row ${index + 1} mismatch: expected ${safeJson(expected)}, got ${safeJson(rows[index])}`,
    );
  });
}

function xlsxRowEquals(actual, expected) {
  if (actual.length < expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (!xlsxValueEquals(actual[index], expected[index])) return false;
  }
  return true;
}

function xlsxValueEquals(actual, expected) {
  if (expected === null || expected === "") {
    return actual === null || actual === undefined || actual === "";
  }
  if (typeof expected === "number") {
    return typeof actual === "number" && Math.abs(actual - expected) < 0.000001;
  }
  return actual === expected;
}

function columnLettersToIndex(letters) {
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeXlsxEntry(entries, name) {
  const entry = entries[name];
  assert(entry, `XLSX entry missing ${name}`);
  return new TextDecoder().decode(entry);
}

function decodeXml(value) {
  return value
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function assertXlsxNoLeakage(bytes, account) {
  assertNoLeakage(extractXlsxXmlText(bytes), account);
}

function extractXlsxXmlText(bytes) {
  const entries = unzipSync(bytes);
  return Object.entries(entries)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, value]) => new TextDecoder().decode(value))
    .join("\n");
}

function assertPdf(result) {
  assert(
    result.contentType.includes("application/pdf"),
    "PDF content-type mismatch",
  );
  assert(
    result.contentDisposition.includes("attachment"),
    "PDF attachment missing",
  );
  assert(startsWithAscii(result.bytes, "%PDF-"), "PDF header missing");
  assert(endsWithMarker(result.bytes, "%%EOF"), "PDF EOF marker missing");
  assert(result.bytes.byteLength > 1000, "PDF bytes too small");
}

function assertPdfTextContains(bytes, expectedValues, label) {
  const text = extractPdfText(bytes);
  for (const expected of expectedValues) {
    assert(
      text.includes(expected),
      `${label} missing ${expected}; extracted=${text.slice(0, 500)}`,
    );
  }
}

function assertPdfNoLeakage(bytes, account) {
  assertNoLeakage(extractPdfText(bytes), account);
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
    let dataStart = streamIndex + streamMarker.length;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a)
      dataStart += 2;
    else if (buffer[dataStart] === 0x0a) dataStart += 1;
    const endIndex = buffer.indexOf(endStreamMarker, dataStart);
    if (endIndex === -1) break;
    const streamBytes = buffer.subarray(
      dataStart,
      trimPdfStreamEnd(buffer, dataStart, endIndex),
    );
    const dict = pdfStreamDictionary(buffer, streamIndex);
    const decoded = dict.includes("/FlateDecode")
      ? inflateSync(streamBytes)
      : streamBytes;
    output += ` ${extractPdfStrings(decoded.toString("latin1"))}`;
    offset = endIndex + endStreamMarker.length;
  }
  return output;
}

function trimPdfStreamEnd(buffer, start, end) {
  let dataEnd = end;
  while (
    dataEnd > start &&
    (buffer[dataEnd - 1] === 0x0a || buffer[dataEnd - 1] === 0x0d)
  )
    dataEnd -= 1;
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
    if (content[index] === "(") {
      const parsed = readPdfLiteralString(content, index);
      values.push(parsed.value);
      index = parsed.end;
    } else if (
      content[index] === "<" &&
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
      value += content[index + 1] ?? "";
      index += 1;
    } else if (char === "(") {
      depth += 1;
      value += char;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { value, end: index };
      value += char;
    } else {
      value += char;
    }
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

function decodeExportTokenPayload(token) {
  const [encodedPayload] = token.split(".");
  assert(encodedPayload, "token payload missing");
  const normalized = encodedPayload.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function assertNoLeakage(value, account) {
  const text = String(value);
  assert(!text.includes(account.hiddenMarker), "hidden marker leaked");
  assert(!text.includes(account.hiddenPropertyName), "hidden property leaked");
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(values.filter((value) => typeof value === "string" && value)),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function startsWithAscii(bytes, marker) {
  return (
    Buffer.from(bytes.subarray(0, marker.length)).toString("ascii") === marker
  );
}

function endsWithMarker(bytes, marker) {
  return Buffer.from(bytes).toString("latin1").trimEnd().endsWith(marker);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//iu.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }
      fail(`Unexpected argument: ${arg}`);
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = "true";
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isSafeInteger(value) || value < 1)
    fail(`${label} must be a positive integer`);
  return value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function normalizedLocalUrl(rawUrl, label) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (!isLoopbackHost(url.hostname)) fail(`${label} must point at loopback`);
  if (!url.port) fail(`${label} must include a port`);
  if (
    label === "supabase-url" &&
    (url.port !== "54321" || (url.pathname !== "" && url.pathname !== "/"))
  ) {
    fail(
      "supabase-url must be the local Supabase API at http://127.0.0.1:54321",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function normalizedLocalDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    fail("database-url must be Postgres");
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322" || url.pathname !== "/postgres") {
    fail(
      "database-url must target local Supabase Postgres on port 54322/postgres",
    );
  }
  return url.toString();
}

async function readEnvValue(filePath, keys) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!keys.includes(key)) continue;
    return trimmed
      .slice(equals + 1)
      .trim()
      .replace(/^["']|["']$/gu, "");
  }
  return undefined;
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function safeJson(value) {
  return JSON.stringify(value);
}

function redactSensitiveJson(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(
    JSON.stringify(value, (key, nestedValue) =>
      /token|password|secret|apikey|authorization/iu.test(key)
        ? "[redacted]"
        : nestedValue,
    ),
  );
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
