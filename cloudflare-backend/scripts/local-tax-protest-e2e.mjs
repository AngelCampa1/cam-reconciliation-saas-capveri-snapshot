import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { inflateSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8856";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const DEADLINE_RESPONSE_KEYS = ["items", "year"];
const DEADLINE_ITEM_KEYS = [
  "property_id",
  "property_name",
  "county",
  "state",
  "effective_deadline",
  "days_remaining",
  "is_past",
  "is_configured",
];
const ZIP_ENTRIES = [
  "01_Expense_Summary.pdf",
  "02_GL_by_Category.csv",
  "03_Year_Over_Year_Comparison.pdf",
  "04_County_Cover_Sheet.pdf",
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
    fail(`local tax protest E2E always owns ${DEFAULT_BASE_URL}`);
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
    fail("Refusing to run local tax protest E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
  });
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
  const account = await seedTaxProtestAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.ownerToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccessToken);
  let runError;
  let cleanupError;
  let closeError;
  let result;

  try {
    const deadlines = await expectJson(
      `${input.baseUrl}/api/v1/tax-protest/deadlines?year=2026`,
      { headers: ownerHeaders, status: 200 },
    );
    assertDeadlineResponse(deadlines, account);
    await assertDeadlineDbApiParity(sql, deadlines, account);

    const noAccessBody = await expectJson(
      `${input.baseUrl}/api/v1/tax-protest/generate`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({
          snapshot_id: account.noAccessSnapshotId,
          tax_year: 2026,
          county: "Harris",
          state: "TX",
        }),
      },
    );
    assertErrorBody(noAccessBody, {
      code: "reconcile_subscription_required",
      detail:
        "reconcile_subscription_required: Tax protest data package requires an active Reconcile subscription.",
      label: "no-access entitlement",
    });

    const crossOrgBody = await expectJson(
      `${input.baseUrl}/api/v1/tax-protest/generate`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({
          snapshot_id: account.noAccessSnapshotId,
          tax_year: 2026,
          county: "Harris",
          state: "TX",
        }),
      },
    );
    assertErrorBody(crossOrgBody, {
      code: "reconciliation_snapshot_not_found",
      detail: `reconciliation_snapshot with id '${account.noAccessSnapshotId}' not found`,
      label: "cross-org snapshot",
    });

    const draftBody = await expectJson(
      `${input.baseUrl}/api/v1/tax-protest/generate`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 400,
        body: JSON.stringify({
          snapshot_id: account.draftSnapshotId,
          tax_year: 2026,
          county: "Harris",
          state: "TX",
        }),
      },
    );
    assertErrorBody(draftBody, {
      code: "snapshot_not_finalized",
      detail:
        "Tax protest packages can only be generated for finalized snapshots. Current status: 'draft'.",
      label: "draft snapshot",
    });

    const sideEffectsBefore = await countTaxProtestSideEffects(sql, account);
    const generateRequest = {
      method: "POST",
      headers: ownerHeaders,
      status: 200,
      body: JSON.stringify({
        snapshot_id: account.finalizedSnapshotId,
        tax_year: 2026,
        county: "Harris",
        state: "TX",
      }),
    };
    const zip = await expectZip(
      `${input.baseUrl}/api/v1/tax-protest/generate`,
      generateRequest,
    );
    assert(
      zip.contentDisposition.includes(
        'filename="tax-protest-Local Tax Protest Alpha - Back-Slash-2026.zip"',
      ),
      `unexpected ZIP filename: ${zip.contentDisposition}`,
    );
    const packageOne = assertTaxProtestZip(zip, account);
    const zipRepeat = await expectZip(
      `${input.baseUrl}/api/v1/tax-protest/generate`,
      generateRequest,
    );
    const packageTwo = assertTaxProtestZip(zipRepeat, account);
    assertJsonEqual(
      packageTwo.entries,
      packageOne.entries,
      "repeat ZIP entries mismatch",
    );
    assert(packageTwo.csv === packageOne.csv, "repeat ZIP CSV mismatch");
    assertPdfTextContains(
      packageTwo.pdfTexts["01_Expense_Summary.pdf"],
      expenseSummaryPdfMarkers(account),
      "repeat expense summary PDF",
    );
    assertPdfTextContains(
      packageTwo.pdfTexts["03_Year_Over_Year_Comparison.pdf"],
      variancePdfMarkers(account),
      "repeat variance PDF",
    );
    assertPdfTextContains(
      packageTwo.pdfTexts["04_County_Cover_Sheet.pdf"],
      coverSheetPdfMarkers(account),
      "repeat cover sheet PDF",
    );
    const sideEffectsAfter = await countTaxProtestSideEffects(sql, account);
    assertJsonEqual(
      sideEffectsAfter,
      sideEffectsBefore,
      "tax protest generate should not create side-effect rows",
    );

    result = {
      index: input.index,
      organization_id: account.organizationId,
      property_id: account.propertyId,
      snapshot_id: account.finalizedSnapshotId,
      zip_entries: zip.entries.length,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupTaxProtestAccount(sql, account);
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
        `Tax protest cleanup failed after scenario failure: ${
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

function assertDeadlineResponse(deadlines, account) {
  assertExactKeys(deadlines, DEADLINE_RESPONSE_KEYS, "deadline response");
  assert(deadlines.year === 2026, "deadline year mismatch");
  assert(deadlines.items.length === 2, "deadline item count mismatch");
  for (const item of deadlines.items) {
    assertExactKeys(item, DEADLINE_ITEM_KEYS, "deadline item");
  }
  assertJsonEqual(
    deadlines.items,
    [
      {
        property_id: account.propertyId,
        property_name: "Local Tax Protest Alpha / Back\\Slash",
        county: "Harris",
        state: "TX",
        effective_deadline: "2026-05-15",
        days_remaining: daysRemaining("2026-05-15"),
        is_past: daysRemaining("2026-05-15") < 0,
        is_configured: true,
      },
      {
        property_id: account.overridePropertyId,
        property_name: "Local Tax Protest Override",
        county: null,
        state: "TX",
        effective_deadline: "2026-04-01",
        days_remaining: daysRemaining("2026-04-01"),
        is_past: daysRemaining("2026-04-01") < 0,
        is_configured: true,
      },
    ],
    "deadline items mismatch",
  );
  assertNoPackageLeakage(stableJson(deadlines), account, "deadline response");
}

async function assertDeadlineDbApiParity(sql, deadlines, account) {
  const rows = await sql`
    select id::text, name, state, tax_protest_county, tax_protest_deadline_override::text as deadline_override
    from properties
    where id in ${sql([account.propertyId, account.overridePropertyId])}
    order by name asc
  `;
  assert(
    rows.length === deadlines.items.length,
    "deadline DB row count mismatch",
  );
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const item = deadlines.items[index];
    assert(
      item.property_id === row.id,
      `deadline DB/API property mismatch ${index}`,
    );
    assert(
      item.property_name === row.name,
      `deadline DB/API name mismatch ${index}`,
    );
    assert(item.state === row.state, `deadline DB/API state mismatch ${index}`);
    assert(
      item.county === row.tax_protest_county,
      `deadline DB/API county mismatch ${index}`,
    );
    const expectedDeadline =
      row.deadline_override ??
      (row.tax_protest_county === "Harris" && row.state === "TX"
        ? "2026-05-15"
        : null);
    assert(
      item.effective_deadline === expectedDeadline,
      `deadline DB/API effective deadline mismatch ${index}`,
    );
  }
}

function assertErrorBody(body, expected) {
  assertJsonEqual(
    body,
    {
      detail: expected.detail,
      error: { code: expected.code, message: expected.detail },
    },
    `${expected.label} error body mismatch`,
  );
}

function assertTaxProtestZip(zip, account) {
  assertJsonEqual(zip.entries, ZIP_ENTRIES, "ZIP entries mismatch");
  const pdfTexts = {
    "01_Expense_Summary.pdf": assertPdfEntry(
      zip.entryBytes,
      "01_Expense_Summary.pdf",
    ),
    "03_Year_Over_Year_Comparison.pdf": assertPdfEntry(
      zip.entryBytes,
      "03_Year_Over_Year_Comparison.pdf",
    ),
    "04_County_Cover_Sheet.pdf": assertPdfEntry(
      zip.entryBytes,
      "04_County_Cover_Sheet.pdf",
    ),
  };
  assertPdfTextContains(
    pdfTexts["01_Expense_Summary.pdf"],
    expenseSummaryPdfMarkers(account),
    "expense summary PDF",
  );
  assertPdfTextContains(
    pdfTexts["03_Year_Over_Year_Comparison.pdf"],
    variancePdfMarkers(account),
    "variance PDF",
  );
  assertPdfTextContains(
    pdfTexts["04_County_Cover_Sheet.pdf"],
    coverSheetPdfMarkers(account),
    "cover sheet PDF",
  );
  const csv = strFromU8(zip.entryBytes["02_GL_by_Category.csv"]);
  assertTaxProtestCsv(csv);
  assertNoPackageLeakage(
    `${csv}\n${Object.values(pdfTexts).join("\n")}`,
    account,
    "tax protest package",
  );
  return { entries: zip.entries, csv, pdfTexts };
}

function expenseSummaryPdfMarkers(account) {
  return [
    account.ownerOrgName,
    "Tenant Reconciliation Statement",
    "Period: January 1, 2026 - December 31, 2026",
    "Property: Local Tax Protest Alpha / Back\\Slash",
    "Address: 100 Protest Way, Houston, TX 77002",
    "Tenant: Tax Protest Tenant",
    "Total Operating Expenses",
    "$15,500.00",
    "Grossed-Up Expenses",
    "Base Year Amount",
    "$0.00",
    "Tenant Share (Before Cap)",
    "$1,550.00",
    "Tenant Share (After Cap)",
    "Administrative Fee",
    "$232.50",
    "Total Amount Due",
    "$1,782.50",
    "local_tax_protest: $1,782.50 (sum)",
    "Note: E2E seed",
  ];
}

function variancePdfMarkers() {
  return [
    "Statement Check Report",
    "Local Tax Protest Alpha / Back\\Slash",
    "2026 vs 2025",
    "Threshold: 10%",
    "We checked final billing totals for 2025 and 2026.",
    "We found the billing total changed by 29.17%.",
    "Period",
    "Total Recovery",
    "Variance",
    "2026",
    "$1,782.50",
    "2025",
    "$1,380.00",
    "29.17%",
  ];
}

function coverSheetPdfMarkers() {
  return [
    "TAX PROTEST DATA PACKAGE",
    "Tax Year 2026",
    "Harris County, TX",
    "Property Information",
    "Local Tax Protest Alpha / Back\\Slash",
    "100 Protest Way, Houston, TX 77002",
    "FILING DEADLINE: May 15, 2026",
    "Texas Property Tax Code",
    "Preparer Instructions",
    "01_Expense_Summary.pdf",
    "02_GL_by_Category.csv",
    "03_Year_Over_Year_Comparison.pdf",
    "04_County_Cover_Sheet.pdf",
    "Accuracy Disclaimer",
    "CapVeri does not warrant the accuracy",
  ];
}

function assertNoPackageLeakage(text, account, label) {
  for (const leaked of [
    account.noAccessOrganizationId,
    account.noAccessPropertyId,
    account.noAccessSnapshotId,
    account.noAccessOrgName,
    "Hidden Tax Protest Property",
    "Hidden Tax Tenant",
    "Hidden Repairs",
    "Hidden Vendor",
    "8888.00",
    "8000",
    "111.00",
  ]) {
    assert(!text.includes(leaked), `${label} leaked ${leaked}`);
  }
}

async function countTaxProtestSideEffects(sql, account) {
  const rows = await sql`
    select
      (select count(*)::int from audit_credits where organization_id = ${account.organizationId}) as audit_credits,
      (select count(*)::int from credit_consumption_log where organization_id = ${account.organizationId}) as credit_consumption_log,
      (select count(*)::int from audit_log where organization_id = ${account.organizationId}) as audit_log
  `;
  return rows[0];
}

function daysRemaining(deadline) {
  const [dy, dm, dd] = deadline.split("-").map(Number);
  const today = new Date();
  const deadlineMs = Date.UTC(dy, dm - 1, dd);
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.trunc((deadlineMs - todayMs) / 86_400_000);
}

function assertTaxProtestCsv(csv) {
  const expected = [
    "Tax Year,Pool Name,Pool Type,Account Code,Account Description,Amount,Pool Total",
    "2026,Operating Expenses,operating,6000,Repairs,10000.00,12500.00",
    "2026,Operating Expenses,operating,6100,Utilities,2500.00,12500.00",
    "2026,Property Taxes,tax,7000,County Taxes,3000.00,3000.00",
    "",
  ].join("\r\n");
  assert(csv === expected, `CSV content mismatch: ${safeJson(csv)}`);
}

async function seedTaxProtestAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `tax-protest-e2e-owner-${suffix}@capveri.local`;
  const noAccessEmail = `tax-protest-e2e-no-access-${suffix}@capveri.local`;
  const ownerOrgName = `Local Tax Protest E2E Org ${suffix}`;
  const noAccessOrgName = `Local Tax Protest No Access Org ${suffix}`;
  const ownerSignupName = `${ownerEmail.split("@")[0]}'s Organization`;
  const noAccessSignupName = `${noAccessEmail.split("@")[0]}'s Organization`;
  let owner;
  let noAccess;
  const organizationId = randomUUID();
  const noAccessOrganizationId = randomUUID();
  const propertyId = randomUUID();
  const overridePropertyId = randomUUID();
  const noAccessPropertyId = randomUUID();
  const unitId = randomUUID();
  const noAccessUnitId = randomUUID();
  const leaseId = randomUUID();
  const noAccessLeaseId = randomUUID();
  const finalizedSnapshotId = randomUUID();
  const draftSnapshotId = randomUUID();
  const priorSnapshotId = randomUUID();
  const noAccessSnapshotId = randomUUID();
  const operatingPoolId = randomUUID();
  const taxPoolId = randomUUID();
  const importBatchId = randomUUID();
  const noAccessImportBatchId = randomUUID();
  const account = {
    organizationId,
    noAccessOrganizationId,
    ownerUserId: undefined,
    noAccessUserId: undefined,
    ownerEmail,
    noAccessEmail,
    ownerOrgName,
    noAccessOrgName,
    ownerSignupOrganizationId: undefined,
    noAccessSignupOrganizationId: undefined,
    ownerSignupName,
    noAccessSignupName,
    ownerToken: undefined,
    noAccessToken: undefined,
    propertyId,
    overridePropertyId,
    noAccessPropertyId,
    propertyIds: [propertyId, overridePropertyId, noAccessPropertyId],
    leaseIds: [leaseId, noAccessLeaseId],
    unitIds: [unitId, noAccessUnitId],
    snapshotIds: [
      finalizedSnapshotId,
      draftSnapshotId,
      priorSnapshotId,
      noAccessSnapshotId,
    ],
    poolIds: [operatingPoolId, taxPoolId],
    importBatchIds: [importBatchId, noAccessImportBatchId],
    finalizedSnapshotId,
    draftSnapshotId,
    noAccessSnapshotId,
  };
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let seedError;
  let cleanupError;
  let closeError;
  try {
    owner = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: ownerEmail,
      password: `TaxProtestOwner${input.index}A1!`,
      account,
      kind: "owner",
    });
    account.ownerUserId = owner.userId;
    account.ownerSignupOrganizationId = owner.signupOrganizationId;
    account.ownerToken = owner.accessToken;
    noAccess = await createLocalAuthUser({
      databaseUrl: input.databaseUrl,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: noAccessEmail,
      password: `TaxProtestNoAccess${input.index}A1!`,
      account,
      kind: "noAccess",
    });
    account.noAccessUserId = noAccess.userId;
    account.noAccessSignupOrganizationId = noAccess.signupOrganizationId;
    account.noAccessToken = noAccess.accessToken;

    await sql
      .begin(async (transaction) => {
        await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values
            (${organizationId}, ${ownerOrgName}, 'active', '{}'::jsonb),
            (${noAccessOrganizationId}, ${noAccessOrgName}, 'trial', '{}'::jsonb)
        `;
        await transaction`
          update users
          set organization_id = ${organizationId},
              email = ${ownerEmail},
              full_name = 'Local Tax Protest Owner',
              role = 'owner',
              updated_at = now()
          where id = ${owner.userId}
        `;
        await transaction`
          update users
          set organization_id = ${noAccessOrganizationId},
              email = ${noAccessEmail},
              full_name = 'Local Tax Protest No Access',
              role = 'owner',
              updated_at = now()
          where id = ${noAccess.userId}
        `;
        await transaction`
          insert into subscriptions (
            organization_id, plan, tier, status, billing_model, pricing_model,
            billing_interval, building_count, unit_count, included_units,
            current_period_start, current_period_end
          )
          values (
            ${organizationId}, 'professional', 'reconcile', 'active',
            'subscription', 'per_unit', 'annual', 1, 100, 25, now(),
            now() + interval '30 days'
          )
        `;
        await transaction`
          insert into properties (
            id, organization_id, name, address_line1, city, state, postal_code,
            total_rentable_sqft, total_usable_sqft, common_area_sqft,
            target_occupancy, tax_protest_county, tax_protest_deadline_override
          )
          values
            (${propertyId}, ${organizationId}, 'Local Tax Protest Alpha / Back\\Slash', '100 Protest Way', 'Houston', 'TX', '77002', 50000, 45000, 5000, 0.95, 'Harris', null),
            (${overridePropertyId}, ${organizationId}, 'Local Tax Protest Override', '200 Protest Way', 'Houston', 'TX', '77003', 20000, 18000, 2000, 0.95, null, '2026-04-01'::date),
            (${noAccessPropertyId}, ${noAccessOrganizationId}, 'Hidden Tax Protest Property', '900 Hidden Way', 'Houston', 'TX', '77004', 25000, 22500, 2500, 0.95, 'Harris', null)
        `;
        await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${unitId}, ${propertyId}, '100', 10000, 9000, 1, 'occupied'),
            (${noAccessUnitId}, ${noAccessPropertyId}, 'H-100', 5000, 4500, 1, 'occupied')
        `;
        await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (${leaseId}, ${propertyId}, ${unitId}, 'Tax Protest Tenant', '2026-01-01'::date, '2026-12-31'::date, 'active', '{}'::jsonb),
            (${noAccessLeaseId}, ${noAccessPropertyId}, ${noAccessUnitId}, 'Hidden Tax Tenant', '2026-01-01'::date, '2026-12-31'::date, 'active', '{}'::jsonb)
        `;
        await transaction`
          insert into reconciliation_snapshots (
          id, organization_id, property_id, lease_id, period_start_date,
            period_end_date, status, total_operating_expenses,
            grossed_up_expenses, base_year_amount, tenant_share_before_cap,
            tenant_share_after_cap, admin_fee, total_recovery,
            calculation_trace, finalized_at, finalized_by_user_id
          )
          values
            (${finalizedSnapshotId}, ${organizationId}, ${propertyId}, ${leaseId}, '2026-01-01'::date, '2026-12-31'::date, 'finalized', 15500.00, 15500.00, 0.00, 1550.00, 1550.00, 232.50, 1782.50, '[{"step_name":"local_tax_protest","operation":"sum","output_value":"1782.50","output_unit":"usd","note":"E2E seed"}]'::jsonb, now(), ${owner.userId}),
            (${draftSnapshotId}, ${organizationId}, ${propertyId}, ${leaseId}, '2026-01-01'::date, '2026-12-31'::date, 'draft', 15500.00, 15500.00, 0.00, 1550.00, 1550.00, 232.50, 1782.50, '[]'::jsonb, null, null),
            (${priorSnapshotId}, ${organizationId}, ${propertyId}, ${leaseId}, '2025-01-01'::date, '2025-12-31'::date, 'finalized', 12000.00, 12000.00, 0.00, 1200.00, 1200.00, 180.00, 1380.00, '[]'::jsonb, now(), ${owner.userId}),
            (${noAccessSnapshotId}, ${noAccessOrganizationId}, ${noAccessPropertyId}, ${noAccessLeaseId}, '2026-01-01'::date, '2026-12-31'::date, 'finalized', 9999.00, 9999.00, 0.00, 999.00, 999.00, 0.00, 999.00, '[]'::jsonb, now(), ${noAccess.userId})
        `;
        await transaction`
          insert into expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target)
          values
            (${operatingPoolId}, ${propertyId}, 'Operating Expenses', 'operating', true, 0.95),
            (${taxPoolId}, ${propertyId}, 'Property Taxes', 'tax', false, null)
        `;
        await transaction`
          insert into pool_mappings (expense_pool_id, gl_account_pattern, allocation_percentage, priority)
          values
            (${operatingPoolId}, '6%', 1.0000, 10),
            (${taxPoolId}, '7%', 1.0000, 10)
        `;
        await transaction`
          insert into import_batches (
            id, organization_id, property_id, file_name, file_hash,
            source_system, status, row_count, error_count
          )
          values
            (${importBatchId}, ${organizationId}, ${propertyId}, 'local-tax-protest-gl.csv', ${"c".repeat(64)}, 'yardi', 'completed', 4, 0),
            (${noAccessImportBatchId}, ${noAccessOrganizationId}, ${noAccessPropertyId}, 'hidden-tax-protest-gl.csv', ${"d".repeat(64)}, 'yardi', 'completed', 1, 0)
        `;
        await transaction`
          insert into gl_entries (
            id, import_batch_id, property_id, account_code,
            account_description, amount, transaction_date, period_year,
            period_month, vendor_name, description, raw_row_data
          )
          values
            (${randomUUID()}, ${importBatchId}, ${propertyId}, '6000', 'Repairs', 10000.00, '2026-02-15'::date, 2026, 2, 'Vendor A', 'Repairs', '{}'::jsonb),
            (${randomUUID()}, ${importBatchId}, ${propertyId}, '6100', 'Utilities', 2500.00, '2026-03-15'::date, 2026, 3, 'Vendor B', 'Utilities', '{}'::jsonb),
            (${randomUUID()}, ${importBatchId}, ${propertyId}, '7000', 'County Taxes', 3000.00, '2026-04-15'::date, 2026, 4, 'County', 'Taxes', '{}'::jsonb),
            (${randomUUID()}, ${importBatchId}, ${propertyId}, '8000', 'Unmapped Expense', 111.00, '2026-05-15'::date, 2026, 5, 'Vendor C', 'Unmapped', '{}'::jsonb),
            (${randomUUID()}, ${noAccessImportBatchId}, ${noAccessPropertyId}, '6000', 'Hidden Repairs', 8888.00, '2026-02-15'::date, 2026, 2, 'Hidden Vendor', 'Hidden', '{}'::jsonb)
        `;
      })
      .catch(async (error) => {
        fail(
          `Failed to seed local tax protest E2E records: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  } catch (error) {
    seedError = error;
    try {
      await cleanupTaxProtestAccount(sql, account);
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
        `Tax protest seed cleanup failed after seed failure: ${
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
    ownerToken: owner.accessToken,
    noAccessToken: noAccess.accessToken,
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
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-tax-protest-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-tax-protest-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-tax-protest-e2e-signing-secret",
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

async function createLocalAuthUser(input) {
  const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
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
    fail(
      `Local Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  const userId = body.user?.id;
  if (typeof userId !== "string" || userId === "") {
    fail("Local Supabase signup did not return a user id.");
  }
  if (input.kind === "owner") {
    input.account.ownerUserId = userId;
  } else {
    input.account.noAccessUserId = userId;
  }

  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let signupOrganizationId;
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
    signupOrganizationId = rows[0]?.organization_id;
    if (typeof signupOrganizationId === "string") {
      if (input.kind === "owner") {
        input.account.ownerSignupOrganizationId = signupOrganizationId;
      } else {
        input.account.noAccessSignupOrganizationId = signupOrganizationId;
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
      email: input.email,
      password: input.password,
    }));
  if (typeof accessToken !== "string" || accessToken === "") {
    fail("Local Supabase signup/sign-in did not return an access token.");
  }

  return { userId, accessToken, signupOrganizationId };
}

async function cleanupTaxProtestAccount(sql, account) {
  const orgIds = [
    account.organizationId,
    account.noAccessOrganizationId,
  ].filter(Boolean);
  const userIds = [account.ownerUserId, account.noAccessUserId].filter(Boolean);
  const emails = [account.ownerEmail, account.noAccessEmail].filter(Boolean);
  const propertyIds = account.propertyIds ?? [];
  const signupOrgIds = [
    account.ownerSignupOrganizationId,
    account.noAccessSignupOrganizationId,
  ].filter(Boolean);
  const allOrgIds = [...new Set([...orgIds, ...signupOrgIds])];
  const signupNames = [
    account.ownerSignupName,
    account.noAccessSignupName,
  ].filter(Boolean);
  const orgNames = [
    account.ownerOrgName,
    account.noAccessOrgName,
    ...signupNames,
  ].filter(Boolean);
  const safeOrgIds = nonEmptyUuid(orgIds);
  const safeAllOrgIds = nonEmptyUuid(allOrgIds);
  const safeUserIds = nonEmptyUuid(userIds);
  const safeEmails = nonEmptyText(emails);
  const safeOrgNames = nonEmptyText(orgNames);
  const safeSignupNames = nonEmptyText(signupNames);
  const safePropertyIds = nonEmptyUuid(propertyIds);
  const safeLeaseIds = nonEmptyUuid(account.leaseIds ?? []);
  const safeUnitIds = nonEmptyUuid(account.unitIds ?? []);
  const safeSnapshotIds = nonEmptyUuid(account.snapshotIds ?? []);
  const safePoolIds = nonEmptyUuid(account.poolIds ?? []);
  const safeImportBatchIds = nonEmptyUuid(account.importBatchIds ?? []);
  await sql.begin(async (transaction) => {
    if (orgIds.length > 0) {
      await transaction`delete from credit_consumption_log where organization_id in ${transaction(safeOrgIds)}`;
      await transaction`delete from audit_credits where organization_id in ${transaction(safeOrgIds)}`;
      await transaction`delete from gl_entries where property_id in ${transaction(safePropertyIds)} or import_batch_id in ${transaction(safeImportBatchIds)}`;
      await transaction`delete from pool_mappings where expense_pool_id in ${transaction(safePoolIds)}`;
      await transaction`delete from expense_pools where id in ${transaction(safePoolIds)} or property_id in ${transaction(safePropertyIds)}`;
      await transaction`delete from reconciliation_snapshots where id in ${transaction(safeSnapshotIds)} or organization_id in ${transaction(safeOrgIds)}`;
      await transaction`delete from leases where id in ${transaction(safeLeaseIds)} or property_id in ${transaction(safePropertyIds)}`;
      await transaction`delete from units where id in ${transaction(safeUnitIds)} or property_id in ${transaction(safePropertyIds)}`;
      await transaction`delete from import_batches where id in ${transaction(safeImportBatchIds)} or organization_id in ${transaction(safeOrgIds)}`;
      await transaction`delete from subscriptions where organization_id in ${transaction(safeOrgIds)}`;
    }
    if (propertyIds.length > 0 || orgIds.length > 0) {
      await transaction`delete from properties where id in ${transaction(safePropertyIds)} or organization_id in ${transaction(safeOrgIds)}`;
    }
    if (allOrgIds.length > 0 || userIds.length > 0 || emails.length > 0) {
      await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
      await transaction`
        delete from legal_acceptances
        where organization_id in ${transaction(safeAllOrgIds)}
           or user_id in ${transaction(safeUserIds)}
      `;
      await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
      await transaction`
        delete from signup_email_events
        where organization_id in ${transaction(safeAllOrgIds)}
           or user_id in ${transaction(safeUserIds)}
           or email in ${transaction(safeEmails)}
      `;
      await transaction`
        delete from audit_log
        where organization_id in ${transaction(safeAllOrgIds)}
           or changed_by in ${transaction(safeUserIds)}
      `;
      await transaction`
        delete from users
        where id in ${transaction(safeUserIds)}
           or email in ${transaction(safeEmails)}
           or organization_id in ${transaction(safeAllOrgIds)}
      `;
      await transaction`
        delete from auth.users
        where id in ${transaction(safeUserIds)}
           or email in ${transaction(safeEmails)}
      `;
    }
    if (allOrgIds.length > 0 || orgNames.length > 0) {
      await transaction`
        delete from organizations
        where id in ${transaction(safeAllOrgIds)}
           or name in ${transaction(safeOrgNames)}
      `;
    }
    if (signupNames.length > 0) {
      await transaction`
      delete from organizations
      where name in ${transaction(safeSignupNames)}
        and not exists (
          select 1 from users where users.organization_id = organizations.id
        )
      `;
    }
  });
}

async function assertCleanupComplete(sql, account) {
  const orgIds = [
    account.organizationId,
    account.noAccessOrganizationId,
  ].filter(Boolean);
  const userIds = [account.ownerUserId, account.noAccessUserId].filter(Boolean);
  const emails = [account.ownerEmail, account.noAccessEmail].filter(Boolean);
  const propertyIds = account.propertyIds ?? [];
  const signupOrgIds = [
    account.ownerSignupOrganizationId,
    account.noAccessSignupOrganizationId,
  ].filter(Boolean);
  const allOrgIds = [...new Set([...orgIds, ...signupOrgIds])];
  const orgNames = [
    account.ownerOrgName,
    account.noAccessOrgName,
    account.ownerSignupName,
    account.noAccessSignupName,
  ].filter(Boolean);
  const safeAllOrgIds = nonEmptyUuid(allOrgIds);
  const safeOrgIds = nonEmptyUuid(orgIds);
  const safeUserIds = nonEmptyUuid(userIds);
  const safeEmails = nonEmptyText(emails);
  const safeOrgNames = nonEmptyText(orgNames);
  const safePropertyIds = nonEmptyUuid(propertyIds);
  const safeLeaseIds = nonEmptyUuid(account.leaseIds ?? []);
  const safeUnitIds = nonEmptyUuid(account.unitIds ?? []);
  const safeSnapshotIds = nonEmptyUuid(account.snapshotIds ?? []);
  const safePoolIds = nonEmptyUuid(account.poolIds ?? []);
  const safeImportBatchIds = nonEmptyUuid(account.importBatchIds ?? []);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(safeUserIds)} or email in ${sql(safeEmails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(safeUserIds)} or email in ${sql(safeEmails)} or organization_id in ${sql(safeAllOrgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(safeAllOrgIds)} or name in ${sql(safeOrgNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(safePropertyIds)} or organization_id in ${sql(safeOrgIds)}) as property_count,
      (select count(*)::int from units where id in ${sql(safeUnitIds)} or property_id in ${sql(safePropertyIds)}) as unit_count,
      (select count(*)::int from leases where id in ${sql(safeLeaseIds)} or property_id in ${sql(safePropertyIds)}) as lease_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(safeOrgIds)}) as subscription_count,
      (select count(*)::int from reconciliation_snapshots where id in ${sql(safeSnapshotIds)} or organization_id in ${sql(safeOrgIds)}) as snapshot_count,
      (select count(*)::int from import_batches where id in ${sql(safeImportBatchIds)} or organization_id in ${sql(safeOrgIds)}) as import_batch_count,
      (select count(*)::int from gl_entries where property_id in ${sql(safePropertyIds)} or import_batch_id in ${sql(safeImportBatchIds)}) as gl_entry_count,
      (select count(*)::int from expense_pools where id in ${sql(safePoolIds)} or property_id in ${sql(safePropertyIds)}) as pool_count,
      (select count(*)::int from pool_mappings where expense_pool_id in ${sql(safePoolIds)}) as pool_mapping_count,
      (select count(*)::int from audit_credits where organization_id in ${sql(safeOrgIds)}) as credit_count,
      (select count(*)::int from credit_consumption_log where organization_id in ${sql(safeOrgIds)}) as credit_consumption_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(safeAllOrgIds)} or user_id in ${sql(safeUserIds)}) as legal_acceptance_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(safeAllOrgIds)} or user_id in ${sql(safeUserIds)} or email in ${sql(safeEmails)}) as signup_email_count,
      (select count(*)::int from audit_log where organization_id in ${sql(safeAllOrgIds)} or changed_by in ${sql(safeUserIds)}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.unit_count === 0, "cleanup left units");
  assert(row.lease_count === 0, "cleanup left leases");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(row.snapshot_count === 0, "cleanup left snapshots");
  assert(row.import_batch_count === 0, "cleanup left import batches");
  assert(row.gl_entry_count === 0, "cleanup left GL entries");
  assert(row.pool_count === 0, "cleanup left expense pools");
  assert(row.pool_mapping_count === 0, "cleanup left pool mappings");
  assert(row.credit_count === 0, "cleanup left audit credits");
  assert(row.credit_consumption_count === 0, "cleanup left credit consumption");
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.signup_email_count === 0, "cleanup left signup email events");
  assert(row.audit_log_count === 0, "cleanup left audit log rows");
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
  return body.access_token;
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
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
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

async function expectZip(url, options = {}) {
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
    const text = await response.text();
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("application/zip"), "ZIP content-type mismatch");
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const entryBytes = unzipSync(bytes);
  return {
    contentDisposition,
    entries: Object.keys(entryBytes).sort(),
    entryBytes,
  };
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

function assertPdfEntry(entryBytes, entryName) {
  const bytes = entryBytes[entryName];
  assert(bytes, `missing PDF entry ${entryName}`);
  assert(bytes.byteLength > 500, `${entryName} too small`);
  const start = strFromU8(bytes.slice(0, 5));
  const tail = strFromU8(bytes.slice(Math.max(bytes.byteLength - 64, 0)));
  assert(start === "%PDF-", `${entryName} missing PDF header`);
  assert(tail.includes("%%EOF"), `${entryName} missing PDF EOF marker`);
  return normalizePdfText(extractPdfText(bytes));
}

function assertPdfTextContains(text, expectedValues, label) {
  for (const expected of expectedValues) {
    assert(
      text.includes(normalizePdfText(expected)),
      `${label} missing ${expected}; extracted=${text.slice(0, 1000)}`,
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
    let dataStart = streamIndex + streamMarker.length;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (buffer[dataStart] === 0x0a) {
      dataStart += 1;
    }
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

function normalizePdfText(text) {
  return String(text)
    .replace(/\u2014|â€”/gu, "-")
    .replace(/\u00a7|Â§/gu, "§")
    .replace(/\s+/gu, " ")
    .trim();
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message}: expected ${expectedJson}, received ${actualJson}`,
  );
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  const actualKeys = Object.keys(actual).sort();
  const sortedExpected = [...expectedKeys].sort();
  assertJsonEqual(actualKeys, sortedExpected, `${label} keys mismatch`);
}

function stableJson(value) {
  return JSON.stringify(value);
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

function nonEmptyUuid(values) {
  return nonEmpty(values, "00000000-0000-4000-8000-000000000000");
}

function nonEmptyText(values) {
  return nonEmpty(values, "__tax_protest_e2e_none__");
}

function nonEmpty(values, sentinel) {
  const clean = [...new Set((values ?? []).filter(Boolean))];
  return clean.length > 0 ? clean : [sentinel];
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (
          /token|password|refresh|authorization|apikey|api_key|secret/iu.test(
            key,
          )
        ) {
          return [key, "[REDACTED]"];
        }
        return [key, redactSensitiveJson(entry)];
      }),
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
