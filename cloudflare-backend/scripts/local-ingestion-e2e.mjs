import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8835";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const UPLOAD_RESPONSE_KEYS = [
  "batch_id",
  "source_system",
  "source_confidence",
  "row_count",
  "error_count",
  "warnings",
  "detected_columns",
];
const BATCH_LIST_KEYS = ["batches"];
const BATCH_LIST_ROW_KEYS = [
  "id",
  "file_name",
  "source_system",
  "status",
  "row_count",
  "error_count",
  "created_at",
];
const BATCH_DETAIL_KEYS = [
  "id",
  "organization_id",
  "property_id",
  "file_name",
  "file_hash",
  "source_system",
  "status",
  "row_count",
  "error_count",
  "error_log",
  "created_at",
  "updated_at",
  "preview_entries",
];
const PREVIEW_ENTRY_KEYS = [
  "id",
  "transaction_date",
  "account_code",
  "account_description",
  "description",
  "debit",
  "credit",
  "balance",
];
const RANGE_KEYS = ["min_date", "max_date", "year"];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local ingestion E2E always owns ${DEFAULT_BASE_URL}`);
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

  if (!anonKey) fail("Missing local Supabase anon key.");
  if (process.env.CI) fail("Refusing to run local ingestion E2E in CI.");

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
    await runOnce({ baseUrl, supabaseUrl, sql, account });
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
      `Local ingestion cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
    );
  }
  if (runError) throw runError;
  if (postRunError) throw postRunError;
}

async function runOnce({ baseUrl, supabaseUrl, sql, account }) {
  const authHeaders = { authorization: `Bearer ${account.token}` };
  const yardiCsv = [
    "Yardi Voyager GL Detail",
    "Account Code,Account Description,Amount,Transaction Date,Vendor,Description,Accrual Date",
    '6000,Repairs,"$125.50",01/15/2026,ABC HVAC,January repair,01/10/2026',
    '6100,Utilities,"$2,400.25",02/20/2026,Grid Co,Electric service,02/01/2026',
    '6200,Credit Memo,"($75.25)",02/28/2026,ABC HVAC,Repair credit,02/28/2026',
    ",Missing account,100.00,03/01/2026,Bad Vendor,Skipped row,03/01/2026",
  ].join("\n");

  const yardiUpload = await postCsv({
    url: `${baseUrl}/api/v1/ingestion/upload`,
    authHeaders,
    filename: "yardi-gl.csv",
    csv: yardiCsv,
    status: 200,
    fields: { property_id: account.propertyId },
  });
  assertUploadResponse(yardiUpload, {
    label: "Yardi upload",
    sourceSystem: "yardi",
    sourceConfidence: 1,
    rowCount: 3,
    errorCount: 1,
    warnings: ["Excluded 1 rows with missing required data"],
    detectedColumns: [
      "Account Code",
      "Account Description",
      "Amount",
      "Transaction Date",
      "Vendor",
      "Description",
      "Accrual Date",
    ],
  });

  const duplicateCountsBefore = await countIngestionRows(sql, account);
  const duplicateUpload = await postCsv({
    url: `${baseUrl}/api/v1/ingestion/upload`,
    authHeaders,
    filename: "yardi-gl-copy.csv",
    csv: yardiCsv,
    status: 409,
    fields: { property_id: account.propertyId },
  });
  assertDuplicateImportResponse(duplicateUpload, yardiUpload.batch_id);
  const duplicateCountsAfter = await countIngestionRows(sql, account);
  assertJsonEqual(
    duplicateCountsAfter,
    duplicateCountsBefore,
    "duplicate import should not create rows",
  );

  const yardiBatch = await expectJson(
    `${baseUrl}/api/v1/ingestion/batches/${yardiUpload.batch_id}`,
    { headers: authHeaders, status: 200 },
  );
  assertBatchDetail(yardiBatch, account, {
    id: yardiUpload.batch_id,
    fileName: "yardi-gl.csv",
    fileHash: sha256Hex(yardiCsv),
    sourceSystem: "yardi",
    rowCount: 3,
    errorCount: 1,
    previewEntries: [
      {
        transaction_date: "2026-01-15T00:00:00.000Z",
        account_code: "6000",
        account_description: "Repairs",
        description: "January repair",
        debit: "125.50",
        credit: null,
        balance: "125.50",
      },
      {
        transaction_date: "2026-02-20T00:00:00.000Z",
        account_code: "6100",
        account_description: "Utilities",
        description: "Electric service",
        debit: "2400.25",
        credit: null,
        balance: "2400.25",
      },
      {
        transaction_date: "2026-02-28T00:00:00.000Z",
        account_code: "6200",
        account_description: "Credit Memo",
        description: "Repair credit",
        debit: null,
        credit: "75.25",
        balance: "-75.25",
      },
    ],
  });

  const range = await expectJson(
    `${baseUrl}/api/v1/ingestion/gl-date-range/${account.propertyId}`,
    { headers: authHeaders, status: 200 },
  );
  assertExactKeys(range, RANGE_KEYS, "date range");
  assertJsonEqual(
    range,
    { min_date: "2026-01-15", max_date: "2026-02-28", year: 2026 },
    "date range",
  );

  const genericCsv = [
    "Acct,Name,Net,When,Vendor,Memo",
    "7000,Security,810.10,03/03/2026,Safe Co,March security",
    "7010,Janitorial,-125.40,03/04/2026,Clean Co,March credit",
    '7020,"Trash, Removal","($1,250.75)",04/15/2026,"Waste, Inc.","April trash, west lot"',
    "7030,Landscaping,$0,04/30/2026,Green Co,Zero-dollar accrual",
    "Grand Total,,685.05,,,",
    "7040,Bad Date,99.99,14/99/2026,Bad Vendor,Bad date row",
  ].join("\n");
  const genericUpload = await postCsv({
    url: `${baseUrl}/api/v1/ingestion/upload`,
    authHeaders,
    filename: "generic-gl.csv",
    csv: genericCsv,
    status: 200,
    fields: { property_id: account.propertyId },
  });
  assertUploadResponse(genericUpload, {
    label: "generic raw upload",
    sourceSystem: "generic",
    sourceConfidence: 0.1,
    rowCount: 6,
    errorCount: 0,
    warnings: ["No column mapping provided - raw data returned"],
    detectedColumns: ["Acct", "Name", "Net", "When", "Vendor", "Memo"],
  });

  const mapping = {
    account_code: "Acct",
    account_description: "Name",
    amount: "Net",
    transaction_date: "When",
    vendor_name: "Vendor",
    description: "Memo",
  };
  const mapped = await postCsv({
    url: `${baseUrl}/api/v1/ingestion/batches/${genericUpload.batch_id}/apply-mapping`,
    authHeaders,
    filename: "generic-gl.csv",
    csv: genericCsv,
    status: 200,
    fields: { mapping_config: JSON.stringify(mapping) },
  });
  assertUploadResponse(mapped, {
    label: "generic mapped upload",
    batchId: genericUpload.batch_id,
    sourceSystem: "generic",
    sourceConfidence: 1,
    rowCount: 4,
    errorCount: 2,
    warnings: ["Excluded 2 rows with missing required data"],
    detectedColumns: ["Acct", "Name", "Net", "When", "Vendor", "Memo"],
  });

  const batches = await expectJson(`${baseUrl}/api/v1/ingestion/batches`, {
    headers: authHeaders,
    status: 200,
  });
  assertBatchList(batches, [
    {
      id: genericUpload.batch_id,
      file_name: "generic-gl.csv",
      source_system: "generic",
      status: "completed",
      row_count: 4,
      error_count: 2,
    },
    {
      id: yardiUpload.batch_id,
      file_name: "yardi-gl.csv",
      source_system: "yardi",
      status: "completed",
      row_count: 3,
      error_count: 1,
    },
  ]);

  const verified = await verifyIngestion(sql, {
    organizationId: account.organizationId,
    propertyId: account.propertyId,
    yardiBatchId: yardiUpload.batch_id,
    genericBatchId: genericUpload.batch_id,
    yardiFileHash: sha256Hex(yardiCsv),
    genericFileHash: sha256Hex(genericCsv),
  });

  const excelForm = new FormData();
  excelForm.append("property_id", account.propertyId);
  excelForm.append(
    "file",
    new Blob(["not xlsx"], { type: "application/octet-stream" }),
    "gl.xlsx",
  );
  const excelBody = await expectJson(`${baseUrl}/api/v1/ingestion/upload`, {
    method: "POST",
    headers: authHeaders,
    body: excelForm,
    status: 415,
  });
  assertJsonEqual(
    excelBody,
    {
      detail:
        "Cloudflare ingestion currently supports CSV files. Excel parsing is a separate migration slice.",
      error: {
        code: "unsupported_file_type",
        message:
          "Cloudflare ingestion currently supports CSV files. Excel parsing is a separate migration slice.",
      },
    },
    "Excel upload error body",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: baseUrl,
        supabase_url: supabaseUrl,
        property_id: account.propertyId,
        yardi_batch_id: yardiUpload.batch_id,
        generic_batch_id: genericUpload.batch_id,
        verified,
      },
      null,
      2,
    ),
  );
}

async function verifyIngestion(sql, input) {
  const batchRows = await sql`
    select id, organization_id, property_id, file_name, file_hash, source_system, status, row_count, error_count, created_at::text, updated_at::text
    from import_batches
    where id in (${input.yardiBatchId}, ${input.genericBatchId})
    order by source_system
  `;
  assert(batchRows.length === 2, "expected two import batches");
  assertImportBatchRows(batchRows, input);

  const entries = await sql`
    select
      import_batch_id,
      account_code,
      account_description,
      amount::text,
      transaction_date::text,
      period_year,
      period_month,
      vendor_name,
      description,
      raw_row_data
    from gl_entries
    where property_id = ${input.propertyId}
    order by transaction_date, account_code
  `;
  assert(entries.length === 7, "expected seven GL entries");
  assertGlEntries(entries, input);

  const totals = await sql`
    select
      sum(amount)::text as total_amount,
      count(*)::int as entry_count,
      min(transaction_date)::text as min_date,
      max(transaction_date)::text as max_date
    from gl_entries
    where property_id = ${input.propertyId}
  `;

  return {
    entry_count: totals[0]?.entry_count,
    total_amount: totals[0]?.total_amount,
    min_date: totals[0]?.min_date,
    max_date: totals[0]?.max_date,
  };
}

function assertUploadResponse(actual, expected) {
  assertExactKeys(actual, UPLOAD_RESPONSE_KEYS, expected.label);
  if (expected.batchId) {
    assert(
      actual.batch_id === expected.batchId,
      `${expected.label} batch_id mismatch`,
    );
  } else {
    assertUuid(actual.batch_id, `${expected.label} batch_id`);
  }
  assert(
    actual.source_system === expected.sourceSystem,
    `${expected.label} source_system mismatch`,
  );
  assert(
    actual.source_confidence === expected.sourceConfidence,
    `${expected.label} confidence mismatch`,
  );
  assert(
    actual.row_count === expected.rowCount,
    `${expected.label} row_count mismatch`,
  );
  assert(
    actual.error_count === expected.errorCount,
    `${expected.label} error_count mismatch`,
  );
  assertJsonEqual(
    actual.warnings,
    expected.warnings,
    `${expected.label} warnings`,
  );
  assertJsonEqual(
    actual.detected_columns,
    expected.detectedColumns,
    `${expected.label} detected_columns`,
  );
}

function assertDuplicateImportResponse(actual, existingBatchId) {
  assertJsonEqual(
    {
      detail_message: actual.detail?.message,
      existing_batch_id: actual.detail?.existing_batch_id,
      error_code: actual.error?.code,
      error_message: actual.error?.message,
    },
    {
      detail_message: "File has already been imported",
      existing_batch_id: existingBatchId,
      error_code: "duplicate_import",
      error_message: "File has already been imported",
    },
    "duplicate import response",
  );
  assert(
    typeof actual.detail?.imported_at === "string",
    "duplicate imported_at missing",
  );
}

function assertBatchDetail(actual, account, expected) {
  assertExactKeys(actual, BATCH_DETAIL_KEYS, "batch detail");
  assertJsonEqual(
    {
      id: actual.id,
      organization_id: actual.organization_id,
      property_id: actual.property_id,
      file_name: actual.file_name,
      file_hash: actual.file_hash,
      source_system: actual.source_system,
      status: actual.status,
      row_count: actual.row_count,
      error_count: actual.error_count,
      error_log: actual.error_log,
    },
    {
      id: expected.id,
      organization_id: account.organizationId,
      property_id: account.propertyId,
      file_name: expected.fileName,
      file_hash: expected.fileHash,
      source_system: expected.sourceSystem,
      status: "completed",
      row_count: expected.rowCount,
      error_count: expected.errorCount,
      error_log: [],
    },
    "batch detail fields",
  );
  assert(
    !Number.isNaN(Date.parse(actual.created_at)),
    "batch detail created_at invalid",
  );
  assert(
    !Number.isNaN(Date.parse(actual.updated_at)),
    "batch detail updated_at invalid",
  );
  assert(
    actual.preview_entries.length === expected.previewEntries.length,
    "preview entry count mismatch",
  );
  for (let index = 0; index < expected.previewEntries.length; index += 1) {
    const item = actual.preview_entries[index];
    assertExactKeys(item, PREVIEW_ENTRY_KEYS, `preview entry ${index}`);
    assertUuid(item.id, `preview entry ${index} id`);
    const withoutId = { ...item };
    delete withoutId.id;
    assertJsonEqual(
      withoutId,
      expected.previewEntries[index],
      `preview entry ${index}`,
    );
  }
}

function assertBatchList(actual, expectedRows) {
  assertExactKeys(actual, BATCH_LIST_KEYS, "batch list");
  assert(
    actual.batches.length === expectedRows.length,
    "batch list count mismatch",
  );
  for (let index = 0; index < expectedRows.length; index += 1) {
    const item = actual.batches[index];
    assertExactKeys(item, BATCH_LIST_ROW_KEYS, `batch list row ${index}`);
    assertJsonEqual(
      {
        id: item.id,
        file_name: item.file_name,
        source_system: item.source_system,
        status: item.status,
        row_count: item.row_count,
        error_count: item.error_count,
      },
      expectedRows[index],
      `batch list row ${index}`,
    );
    assert(
      !Number.isNaN(Date.parse(item.created_at)),
      `batch list row ${index} created_at invalid`,
    );
  }
}

function assertImportBatchRows(rows, input) {
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  const expected = [
    {
      id: input.genericBatchId,
      file_name: "generic-gl.csv",
      file_hash: input.genericFileHash,
      source_system: "generic",
      row_count: 4,
      error_count: 2,
    },
    {
      id: input.yardiBatchId,
      file_name: "yardi-gl.csv",
      file_hash: input.yardiFileHash,
      source_system: "yardi",
      row_count: 3,
      error_count: 1,
    },
  ];
  for (const expectedRow of expected) {
    const row = byId[expectedRow.id];
    assert(row, `missing import batch ${expectedRow.id}`);
    assertJsonEqual(
      {
        organization_id: row.organization_id,
        property_id: row.property_id,
        file_name: row.file_name,
        file_hash: row.file_hash,
        source_system: row.source_system,
        status: row.status,
        row_count: row.row_count,
        error_count: row.error_count,
      },
      {
        organization_id: input.organizationId,
        property_id: input.propertyId,
        file_name: expectedRow.file_name,
        file_hash: expectedRow.file_hash,
        source_system: expectedRow.source_system,
        status: "completed",
        row_count: expectedRow.row_count,
        error_count: expectedRow.error_count,
      },
      `import batch ${expectedRow.source_system}`,
    );
    assert(
      !Number.isNaN(Date.parse(row.created_at)),
      "batch created_at invalid",
    );
    assert(
      !Number.isNaN(Date.parse(row.updated_at)),
      "batch updated_at invalid",
    );
  }
}

function assertGlEntries(entries, input) {
  assertJsonEqual(
    entries.map((entry) => ({
      import_batch_id: entry.import_batch_id,
      account_code: entry.account_code,
      account_description: entry.account_description,
      amount: entry.amount,
      transaction_date: entry.transaction_date,
      period_year: entry.period_year,
      period_month: entry.period_month,
      vendor_name: entry.vendor_name,
      description: entry.description,
    })),
    [
      {
        import_batch_id: input.yardiBatchId,
        account_code: "6000",
        account_description: "Repairs",
        amount: "125.50",
        transaction_date: "2026-01-15",
        period_year: 2026,
        period_month: 1,
        vendor_name: "ABC HVAC",
        description: "January repair",
      },
      {
        import_batch_id: input.yardiBatchId,
        account_code: "6100",
        account_description: "Utilities",
        amount: "2400.25",
        transaction_date: "2026-02-20",
        period_year: 2026,
        period_month: 2,
        vendor_name: "Grid Co",
        description: "Electric service",
      },
      {
        import_batch_id: input.yardiBatchId,
        account_code: "6200",
        account_description: "Credit Memo",
        amount: "-75.25",
        transaction_date: "2026-02-28",
        period_year: 2026,
        period_month: 2,
        vendor_name: "ABC HVAC",
        description: "Repair credit",
      },
      {
        import_batch_id: input.genericBatchId,
        account_code: "7000",
        account_description: "Security",
        amount: "810.10",
        transaction_date: "2026-03-03",
        period_year: 2026,
        period_month: 3,
        vendor_name: "Safe Co",
        description: "March security",
      },
      {
        import_batch_id: input.genericBatchId,
        account_code: "7010",
        account_description: "Janitorial",
        amount: "-125.40",
        transaction_date: "2026-03-04",
        period_year: 2026,
        period_month: 3,
        vendor_name: "Clean Co",
        description: "March credit",
      },
      {
        import_batch_id: input.genericBatchId,
        account_code: "7020",
        account_description: "Trash, Removal",
        amount: "-1250.75",
        transaction_date: "2026-04-15",
        period_year: 2026,
        period_month: 4,
        vendor_name: "Waste, Inc.",
        description: "April trash, west lot",
      },
      {
        import_batch_id: input.genericBatchId,
        account_code: "7030",
        account_description: "Landscaping",
        amount: "0.00",
        transaction_date: "2026-04-30",
        period_year: 2026,
        period_month: 4,
        vendor_name: "Green Co",
        description: "Zero-dollar accrual",
      },
    ],
    "GL entries",
  );
}

async function countIngestionRows(sql, account) {
  const rows = await sql`
    select
      (select count(*)::int from import_batches where organization_id = ${account.organizationId} or property_id = ${account.propertyId}) as import_batches,
      (select count(*)::int from gl_entries where property_id = ${account.propertyId}) as gl_entries,
      (select count(*)::int from audit_log where organization_id = ${account.organizationId} or changed_by = ${account.userId}) as audit_log,
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
  const expected = [...expectedKeys].sort();
  assertJsonEqual(actualKeys, expected, `${label} keys`);
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
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

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `ingestion-e2e-${runId}@capveri.com`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
  const organizationId = randomUUID();
  const propertyId = randomUUID();
  const generated = {
    token: undefined,
    signupEmail,
    userId: "00000000-0000-4000-8000-000000000000",
    organizationId,
    organizationName: `Local Ingestion E2E Org ${runId}`,
    propertyId,
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
      body: JSON.stringify({
        email: signupEmail,
        password: signupPassword,
      }),
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

    await sql.begin(async (transaction) => {
      await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id = ${userId}
        `;
      await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values (${organizationId}, ${generated.organizationName}, 'active', '{}'::jsonb)
        `;
      await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${userId}, ${organizationId}, ${signupEmail}, 'Local Ingestion E2E', 'owner')
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
            'Local Ingestion E2E Tower',
            '400 Ledger Way',
            'Denver',
            'CO',
            '80202',
            100000,
            90000,
            10000,
            0.95
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
      delete from gl_entries
      where property_id = ${input.propertyId}
        or import_batch_id in (
          select id from import_batches
          where organization_id = ${input.organizationId}
             or property_id = ${input.propertyId}
        )
    `;
    await transaction`
      delete from import_batches
      where organization_id = ${input.organizationId}
        or property_id = ${input.propertyId}
    `;
    await transaction`
      delete from properties
      where id = ${input.propertyId}
        or organization_id = ${input.organizationId}
    `;
    await transaction`
      delete from subscriptions
      where organization_id = ${input.organizationId}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id = ${input.organizationId}
        or user_id = ${input.userId}
        or email = ${input.signupEmail}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id = ${input.organizationId}
        or user_id = ${input.userId}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id = ${input.organizationId}
        or changed_by = ${input.userId}
        or row_id in ${transaction([input.userId, input.organizationId, input.propertyId])}
    `;
    await transaction`
      delete from users
      where id = ${input.userId}
        or email = ${input.signupEmail}
        or organization_id = ${input.organizationId}
    `;
    await transaction`
      delete from auth.users
      where id = ${input.userId}
        or email = ${input.signupEmail}
    `;
    await transaction`
      delete from organizations
      where id = ${input.organizationId}
        or name = ${input.organizationName}
    `;
  });
}

async function assertCleanupComplete(sql, input) {
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id = ${input.userId} or email = ${input.signupEmail}) as auth_users,
      (select count(*)::int from users where id = ${input.userId} or email = ${input.signupEmail} or organization_id = ${input.organizationId}) as public_users,
      (select count(*)::int from organizations where id = ${input.organizationId} or name = ${input.organizationName}) as organizations,
      (select count(*)::int from subscriptions where organization_id = ${input.organizationId}) as subscriptions,
      (select count(*)::int from properties where id = ${input.propertyId} or organization_id = ${input.organizationId}) as properties,
      (select count(*)::int from import_batches where organization_id = ${input.organizationId} or property_id = ${input.propertyId}) as import_batches,
      (select count(*)::int from gl_entries where property_id = ${input.propertyId}) as gl_entries,
      (select count(*)::int from legal_acceptances where organization_id = ${input.organizationId} or user_id = ${input.userId}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id = ${input.organizationId} or user_id = ${input.userId} or email = ${input.signupEmail}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id = ${input.organizationId} or changed_by = ${input.userId}) as audit_log
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-ingestion-e2e-"));
  const path = resolve(directory, ".dev.vars.local-ingestion-e2e");
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
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  }).catch((error) => {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
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

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
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
