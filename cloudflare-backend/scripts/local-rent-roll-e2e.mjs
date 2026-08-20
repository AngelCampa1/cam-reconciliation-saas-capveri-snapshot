import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8836";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const PREVIEW_KEYS = [
  "success",
  "source_system",
  "property_metadata",
  "units",
  "row_count",
  "error_count",
  "total_units",
  "occupied_units",
  "errors",
  "warnings",
];
const METADATA_KEYS = ["name", "address_line1", "city", "state", "postal_code"];
const UNIT_KEYS = [
  "unit_number",
  "rentable_sqft",
  "usable_sqft",
  "floor",
  "tenant_name",
  "lease_start",
  "lease_end",
  "base_rent",
  "cam_share",
];
const IMPORT_KEYS = [
  "success",
  "property_id",
  "property_name",
  "units_created",
  "leases_created",
  "errors",
  "warnings",
];
const ERROR_RESPONSE_KEYS = ["detail", "error"];
const ERROR_KEYS = ["code", "message"];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local rent-roll E2E always owns ${DEFAULT_BASE_URL}`);
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
  if (process.env.CI) fail("Refusing to run local rent-roll E2E in CI.");

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
      `Local rent-roll cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
    );
  }
  if (runError) throw runError;
  if (postRunError) throw postRunError;
}

async function runOnce({ baseUrl, supabaseUrl, sql, account }) {
  const authHeaders = { authorization: `Bearer ${account.token}` };
  const scenarioResults = [];
  const negativePathResults = [];
  for (const scenario of rentRollScenarios()) {
    const preview = await postCsv({
      url: `${baseUrl}/api/v1/rent-roll/preview`,
      authHeaders,
      filename: `${scenario.slug}.csv`,
      csv: scenario.csv,
      status: 200,
    });
    assertPreviewResponse(preview, scenario);

    const importResult = await postCsv({
      url: `${baseUrl}/api/v1/rent-roll/import`,
      authHeaders,
      filename: `${scenario.slug}.csv`,
      csv: scenario.csv,
      status: 201,
      fields: {
        property_name: scenario.propertyName,
        address: scenario.addressLine1,
        city: scenario.city,
        state: scenario.state,
        postal_code: scenario.postalCode,
      },
    });
    assertImportResponse(importResult, scenario);
    account.propertyIds.push(importResult.property_id);

    const verified = await verifyImportedRentRoll(sql, {
      organizationId: account.organizationId,
      propertyId: importResult.property_id,
      scenario,
    });
    scenarioResults.push({
      slug: scenario.slug,
      property_id: importResult.property_id,
      preview_units: preview.total_units,
      imported_units: importResult.units_created,
      imported_leases: importResult.leases_created,
      total_rentable_sqft: verified.totalRentableSqft,
      total_usable_sqft: verified.totalUsableSqft,
      warnings: preview.warnings,
    });
  }

  const missingFileBody = await expectJson(
    `${baseUrl}/api/v1/rent-roll/preview`,
    {
      method: "POST",
      headers: authHeaders,
      body: new FormData(),
      status: 422,
    },
  );
  assertErrorResponse(
    missingFileBody,
    {
      detail: "file is required",
      error: {
        code: "missing_file",
        message: "file is required",
      },
    },
    "missing file preview error body",
  );
  negativePathResults.push({
    slug: "missing-file-preview",
    status: 422,
    code: "missing_file",
  });

  const emptyImportBody = await postCsv({
    url: `${baseUrl}/api/v1/rent-roll/import`,
    authHeaders,
    filename: "empty.csv",
    csv: "",
    status: 400,
  });
  assertErrorResponse(
    emptyImportBody,
    {
      detail: "File is empty or could not be read",
      error: {
        code: "rent_roll_parse_failed",
        message: "File is empty or could not be read",
      },
    },
    "empty import error body",
  );
  negativePathResults.push({
    slug: "empty-import",
    status: 400,
    code: "rent_roll_parse_failed",
  });

  const denialScenario = rentRollScenarios()[0];
  await updateUserRole(sql, account, "viewer");
  try {
    const viewerBody = await postCsv({
      url: `${baseUrl}/api/v1/rent-roll/import`,
      authHeaders,
      filename: "viewer-denied.csv",
      csv: denialScenario.csv,
      status: 403,
    });
    assertErrorResponse(
      viewerBody,
      {
        detail: "Insufficient permissions",
        error: {
          code: "insufficient_permissions",
          message: "Insufficient permissions",
        },
      },
      "viewer import error body",
    );
    negativePathResults.push({
      slug: "viewer-import",
      status: 403,
      code: "insufficient_permissions",
    });
  } finally {
    await updateUserRole(sql, account, "owner");
  }

  await updateSubscriptionStatus(sql, account, "paused");
  try {
    const subscriptionBody = await postCsv({
      url: `${baseUrl}/api/v1/rent-roll/import`,
      authHeaders,
      filename: "subscription-denied.csv",
      csv: denialScenario.csv,
      status: 402,
    });
    assertErrorResponse(
      subscriptionBody,
      {
        detail:
          "subscription_required: An active subscription or trial is required.",
        error: {
          code: "subscription_required",
          message:
            "subscription_required: An active subscription or trial is required.",
        },
      },
      "subscription import error body",
    );
    negativePathResults.push({
      slug: "subscription-import",
      status: 402,
      code: "subscription_required",
    });
  } finally {
    await updateSubscriptionStatus(sql, account, "active");
  }

  const excelForm = new FormData();
  excelForm.append(
    "file",
    new Blob(["not xlsx"], { type: "application/octet-stream" }),
    "rent-roll.xlsx",
  );
  const excelBody = await expectJson(`${baseUrl}/api/v1/rent-roll/preview`, {
    method: "POST",
    headers: authHeaders,
    body: excelForm,
    status: 415,
  });
  assertJsonEqual(
    excelBody,
    {
      detail:
        "Excel rent roll imports are not supported by the Cloudflare backend yet. Upload CSV.",
      error: {
        code: "unsupported_rent_roll_format",
        message:
          "Excel rent roll imports are not supported by the Cloudflare backend yet. Upload CSV.",
      },
    },
    "Excel preview error body",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: baseUrl,
        supabase_url: supabaseUrl,
        scenarios: scenarioResults,
        negative_paths: negativePathResults,
      },
      null,
      2,
    ),
  );
}

function rentRollScenarios() {
  return [
    {
      slug: "yardi-duplicate-invalid",
      sourceSystem: "yardi_rent_roll",
      propertyName: "Worker Yardi Plaza",
      addressLine1: "100 Yardi Way",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      expectedUnits: 3,
      expectedLeases: 2,
      expectedWarnings: [
        "Row 4: Duplicate unit number '100' - will be skipped",
        "Row 5: Missing or invalid rentable_sqft",
      ],
      expectedMetadata: {
        name: "Worker Yardi Plaza",
        address_line1: "100 Yardi Way",
        city: "Austin",
        state: "TX",
        postal_code: "78701",
      },
      totalRentableSqft: "3050.00",
      totalUsableSqft: "2745.00",
      commonAreaSqft: "305.00",
      expectedPreviewUnits: [
        {
          unit_number: "100",
          rentable_sqft: "1000.00",
          usable_sqft: "900.00",
          floor: 1,
          tenant_name: "Acme Retail",
          lease_start: "2026-01-01",
          lease_end: "2026-12-31",
          base_rent: "1200.00",
          cam_share: "0.0525",
        },
        {
          unit_number: "101",
          rentable_sqft: "800.00",
          usable_sqft: "720.00",
          floor: 1,
          tenant_name: null,
          lease_start: null,
          lease_end: null,
          base_rent: null,
          cam_share: null,
        },
        {
          unit_number: "102",
          rentable_sqft: "1250.00",
          usable_sqft: "1125.00",
          floor: 2,
          tenant_name: "North Clinic",
          lease_start: "2026-02-01",
          lease_end: "2029-01-31",
          base_rent: "2500.00",
          cam_share: "0.0650",
        },
      ],
      csv: [
        "Yardi Voyager Rent Roll Report",
        "Property: Worker Yardi Plaza",
        "Address: 100 Yardi Way, Austin, TX 78701",
        "",
        "Unit,Rentable Sqft,Usable Sqft,Floor,Tenant Name,Lease Start,Lease End,Monthly Rent,Pro Rata Share",
        "100,1000,900,1,Acme Retail,01/01/2026,12/31/2026,$1200.00,5.25%",
        "101,800,720,1,,,,0,",
        "102,1250,1125,2,North Clinic,02/01/2026,01/31/2029,$2500.00,6.50%",
        "100,1000,900,1,Duplicate Tenant,01/01/2026,12/31/2026,$1000,5%",
        "103,,700,1,Missing RSF,01/01/2026,12/31/2026,$900,4%",
      ].join("\n"),
    },
    {
      slug: "mri-quoted-money",
      sourceSystem: "mri_rent_roll",
      propertyName: "Worker MRI Center",
      addressLine1: "200 MRI Lane",
      city: "Chicago",
      state: "IL",
      postalCode: "60601",
      expectedUnits: 3,
      expectedLeases: 3,
      expectedWarnings: [],
      expectedMetadata: {
        name: "Worker MRI Center",
        address_line1: "200 MRI Lane",
        city: "Chicago",
        state: "IL",
        postal_code: "60601",
      },
      totalRentableSqft: "10500.50",
      totalUsableSqft: "9450.45",
      commonAreaSqft: "1050.05",
      expectedPreviewUnits: [
        {
          unit_number: "A-100",
          rentable_sqft: "3000.50",
          usable_sqft: "2700.45",
          floor: 1,
          tenant_name: "Atlas Labs",
          lease_start: "2026-03-01",
          lease_end: "2031-02-28",
          base_rent: "8250.40",
          cam_share: "0.2858",
        },
        {
          unit_number: "B-200",
          rentable_sqft: "4500.00",
          usable_sqft: "4050.00",
          floor: 2,
          tenant_name: "Bright Market",
          lease_start: "2026-04-01",
          lease_end: "2030-03-31",
          base_rent: "10000.00",
          cam_share: "0.4286",
        },
        {
          unit_number: "C-300",
          rentable_sqft: "3000.00",
          usable_sqft: "2700.00",
          floor: 3,
          tenant_name: "Core Fitness",
          lease_start: "2026-05-01",
          lease_end: "2030-04-30",
          base_rent: "9000.00",
          cam_share: "0.2857",
        },
      ],
      csv: [
        "MRI Software Rent Roll",
        "Property Name: Worker MRI Center",
        "Address: 200 MRI Lane",
        "City: Chicago",
        "State: IL",
        "Zip: 60601",
        "",
        "Suite,Suite SF,Usable SF,Floor,Tenant,Lease Start,Lease End,Base Rent,CAM %",
        'A-100,"3,000.50","2,700.45",1,Atlas Labs,03/01/2026,02/28/2031,"$8,250.40",28.575%',
        'B-200,4500,4050,2,Bright Market,04/01/2026,03/31/2030,"$10,000.00",42.855%',
        "C-300,3000,2700,3,Core Fitness,05/01/2026,04/30/2030,$9000.00,28.570%",
      ].join("\n"),
    },
    {
      slug: "generic-vacancy-missing-usable",
      sourceSystem: "generic_rent_roll",
      propertyName: "Worker Generic Offices",
      addressLine1: "300 Generic Road",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      expectedUnits: 4,
      expectedLeases: 2,
      expectedWarnings: [],
      expectedMetadata: {
        name: null,
        address_line1: null,
        city: null,
        state: null,
        postal_code: null,
      },
      totalRentableSqft: "6000.00",
      totalUsableSqft: "5400.00",
      commonAreaSqft: "600.00",
      expectedPreviewUnits: [
        {
          unit_number: "Suite 10",
          rentable_sqft: "1000.00",
          usable_sqft: null,
          floor: 1,
          tenant_name: "Tenant One",
          lease_start: "2026-01-01",
          lease_end: "2028-12-31",
          base_rent: "1500.00",
          cam_share: "0.1667",
        },
        {
          unit_number: "Suite 20",
          rentable_sqft: "1500.00",
          usable_sqft: null,
          floor: 2,
          tenant_name: null,
          lease_start: null,
          lease_end: null,
          base_rent: null,
          cam_share: null,
        },
        {
          unit_number: "Suite 30",
          rentable_sqft: "2000.00",
          usable_sqft: null,
          floor: 3,
          tenant_name: "Tenant Three",
          lease_start: "2026-06-01",
          lease_end: "2031-05-31",
          base_rent: "4200.00",
          cam_share: "0.3333",
        },
        {
          unit_number: "Suite 40",
          rentable_sqft: "1500.00",
          usable_sqft: null,
          floor: 4,
          tenant_name: null,
          lease_start: null,
          lease_end: null,
          base_rent: null,
          cam_share: null,
        },
      ],
      csv: [
        "Unit Number,RSF,Floor,Tenant,Start Date,End Date,Monthly Rent,Share",
        "Suite 10,1000,1,Tenant One,01/01/2026,12/31/2028,1500,16.6667%",
        "Suite 20,1500,2,,,,0,",
        "Suite 30,2000,3,Tenant Three,06/01/2026,05/31/2031,4200,33.3333%",
        "Suite 40,1500,4,,,,0,",
      ].join("\n"),
    },
    {
      slug: "generic-quoted-totals-invalid-date",
      sourceSystem: "generic_rent_roll",
      propertyName: "Worker Generic Mixed Inputs",
      addressLine1: "400 Parser Street",
      city: "Phoenix",
      state: "AZ",
      postalCode: "85004",
      expectedUnits: 3,
      expectedOccupiedUnits: 2,
      expectedLeases: 1,
      expectedWarnings: [
        "Row 3: Could not parse date '13/40/2026' in Lease Begins",
      ],
      expectedMetadata: {
        name: null,
        address_line1: null,
        city: null,
        state: null,
        postal_code: null,
      },
      totalRentableSqft: "4500.25",
      totalUsableSqft: "4050.23",
      commonAreaSqft: "450.02",
      expectedPreviewUnits: [
        {
          unit_number: "Suite 100",
          rentable_sqft: "1234.50",
          usable_sqft: "1111.05",
          floor: 1,
          tenant_name: "Comma, LLC",
          lease_start: "2026-01-15",
          lease_end: "2028-12-31",
          base_rent: "3210.55",
          cam_share: "0.2743",
        },
        {
          unit_number: "Suite 110",
          rentable_sqft: "1000.75",
          usable_sqft: "900.68",
          floor: 1,
          tenant_name: null,
          lease_start: null,
          lease_end: null,
          base_rent: null,
          cam_share: null,
        },
        {
          unit_number: "Suite 120",
          rentable_sqft: "2265.00",
          usable_sqft: "2038.50",
          floor: 2,
          tenant_name: "Date Problem",
          lease_start: null,
          lease_end: "2029-12-31",
          base_rent: "4500.00",
          cam_share: "0.5034",
        },
      ],
      csv: [
        "Unit Number,Rentable Area,Usable Area,Floor,Occupant,Lease Begins,Lease Expires,Base Rent,Recovery Percentage",
        '"Suite 100","1,234.50","1,111.05",1,"Comma, LLC",2026-01-15,2028-12-31,"$3,210.55",0.2743',
        "Suite 110,1000.75,900.68,1,,,,0,",
        "Suite 120,2265.00,2038.50,2,Date Problem,13/40/2026,12/31/2029,$4500,50.34%",
        "Grand Total,4500.25,4050.23,,,,,,",
      ].join("\n"),
    },
  ];
}

async function postCsv(input) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([input.csv], { type: "text/csv" }),
    input.filename,
  );

  for (const [key, value] of Object.entries(input.fields ?? {})) {
    form.append(key, value);
  }

  return expectJson(input.url, {
    method: "POST",
    headers: input.authHeaders,
    body: form,
    status: input.status,
  });
}

async function verifyImportedRentRoll(sql, input) {
  const propertyRows = await sql`
    select
      id,
      organization_id,
      name,
      address_line1,
      city,
      state,
      postal_code,
      total_rentable_sqft::text as total_rentable_sqft,
      total_usable_sqft::text as total_usable_sqft,
      common_area_sqft::text as common_area_sqft,
      target_occupancy::text as target_occupancy
    from properties
    where id = ${input.propertyId}
  `;
  const property = propertyRows[0];
  assert(property, `${input.scenario.slug} property row should exist`);
  assertJsonEqual(
    property,
    {
      id: input.propertyId,
      organization_id: input.organizationId,
      name: input.scenario.propertyName,
      address_line1: input.scenario.addressLine1,
      city: input.scenario.city,
      state: input.scenario.state,
      postal_code: input.scenario.postalCode,
      total_rentable_sqft: input.scenario.totalRentableSqft,
      total_usable_sqft: input.scenario.totalUsableSqft,
      common_area_sqft: input.scenario.commonAreaSqft,
      target_occupancy: "0.9500",
    },
    `${input.scenario.slug} property row`,
  );

  const countRows = await sql`
    select
      count(*)::int as units,
      count(*) filter (where status = 'occupied')::int as occupied_units
    from units
    where property_id = ${input.propertyId}
  `;
  assert(
    countRows[0]?.units === input.scenario.expectedUnits,
    `${input.scenario.slug} DB unit count mismatch`,
  );
  assert(
    countRows[0]?.occupied_units ===
      (input.scenario.expectedOccupiedUnits ?? input.scenario.expectedLeases),
    `${input.scenario.slug} DB occupied unit count mismatch`,
  );

  const leaseRows = await sql`
    select count(*)::int as leases
    from leases
    where property_id = ${input.propertyId}
      and recovery_profile->>'cap_type' = 'none'
      and recovery_profile->>'admin_fee_percentage' = '0'
  `;
  assert(
    leaseRows[0]?.leases === input.scenario.expectedLeases,
    `${input.scenario.slug} DB lease profile count mismatch`,
  );

  const unitRows = await sql`
    select
      id,
      unit_number,
      rentable_sqft::text as rentable_sqft,
      usable_sqft::text as usable_sqft,
      floor,
      status
    from units
    where property_id = ${input.propertyId}
    order by unit_number
  `;
  assertUnitRows(unitRows, input.scenario);

  const leaseRowsByUnit = await sql`
    select
      u.unit_number,
      l.tenant_name,
      l.start_date::text as start_date,
      l.end_date::text as end_date,
      l.status,
      l.recovery_profile
    from leases l
    join units u on u.id = l.unit_id
    where l.property_id = ${input.propertyId}
    order by u.unit_number
  `;
  assertLeaseRows(leaseRowsByUnit, input.scenario);

  return {
    totalRentableSqft: property.total_rentable_sqft,
    totalUsableSqft: property.total_usable_sqft,
  };
}

function assertPreviewResponse(actual, scenario) {
  assertExactKeys(actual, PREVIEW_KEYS, `${scenario.slug} preview`);
  assertExactKeys(
    actual.property_metadata,
    METADATA_KEYS,
    `${scenario.slug} metadata`,
  );
  assertJsonEqual(
    {
      success: actual.success,
      source_system: actual.source_system,
      property_metadata: actual.property_metadata,
      row_count: actual.row_count,
      error_count: actual.error_count,
      total_units: actual.total_units,
      occupied_units: actual.occupied_units,
      errors: actual.errors,
      warnings: normalizeWarnings(actual.warnings, scenario.expectedWarnings),
    },
    {
      success: true,
      source_system: scenario.sourceSystem,
      property_metadata: scenario.expectedMetadata,
      row_count: scenario.expectedUnits,
      error_count: scenario.expectedErrorCount ?? 0,
      total_units: scenario.expectedUnits,
      occupied_units: scenario.expectedOccupiedUnits ?? scenario.expectedLeases,
      errors: [],
      warnings: scenario.expectedWarnings,
    },
    `${scenario.slug} preview summary`,
  );
  assert(
    actual.units.length === scenario.expectedPreviewUnits.length,
    `${scenario.slug} preview unit count mismatch`,
  );
  for (
    let index = 0;
    index < scenario.expectedPreviewUnits.length;
    index += 1
  ) {
    const unit = actual.units[index];
    assertExactKeys(unit, UNIT_KEYS, `${scenario.slug} preview unit ${index}`);
    assertJsonEqual(
      unit,
      scenario.expectedPreviewUnits[index],
      `${scenario.slug} preview unit ${index}`,
    );
  }
}

function assertImportResponse(actual, scenario) {
  assertExactKeys(actual, IMPORT_KEYS, `${scenario.slug} import`);
  assertUuid(actual.property_id, `${scenario.slug} property_id`);
  assertJsonEqual(
    {
      success: actual.success,
      property_name: actual.property_name,
      units_created: actual.units_created,
      leases_created: actual.leases_created,
      errors: actual.errors,
      warnings: normalizeWarnings(actual.warnings, scenario.expectedWarnings),
    },
    {
      success: true,
      property_name: scenario.propertyName,
      units_created: scenario.expectedUnits,
      leases_created: scenario.expectedLeases,
      errors: [],
      warnings: scenario.expectedWarnings,
    },
    `${scenario.slug} import summary`,
  );
}

function assertUnitRows(actualRows, scenario) {
  const expectedRows = [...scenario.expectedPreviewUnits]
    .sort((left, right) => left.unit_number.localeCompare(right.unit_number))
    .map((unit) => ({
      unit_number: unit.unit_number,
      rentable_sqft: unit.rentable_sqft,
      usable_sqft:
        unit.usable_sqft ??
        (Number(unit.rentable_sqft).toFixed(2) === "0.00"
          ? "0.00"
          : (Number(unit.rentable_sqft) * 0.9).toFixed(2)),
      floor: unit.floor,
      status: unit.tenant_name ? "occupied" : "vacant",
    }));
  assert(
    actualRows.length === expectedRows.length,
    `${scenario.slug} unit row count mismatch`,
  );
  for (let index = 0; index < expectedRows.length; index += 1) {
    assertUuid(actualRows[index].id, `${scenario.slug} unit ${index} id`);
    assertJsonEqual(
      {
        unit_number: actualRows[index].unit_number,
        rentable_sqft: actualRows[index].rentable_sqft,
        usable_sqft: actualRows[index].usable_sqft,
        floor: actualRows[index].floor,
        status: actualRows[index].status,
      },
      expectedRows[index],
      `${scenario.slug} unit row ${index}`,
    );
  }
}

function assertLeaseRows(actualRows, scenario) {
  const expectedRows = [...scenario.expectedPreviewUnits]
    .filter((unit) => unit.tenant_name && unit.lease_start && unit.lease_end)
    .sort((left, right) => left.unit_number.localeCompare(right.unit_number))
    .map((unit) => ({
      unit_number: unit.unit_number,
      tenant_name: unit.tenant_name,
      start_date: unit.lease_start,
      end_date: unit.lease_end,
      status: "active",
      recovery_profile: {
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: unit.cam_share ?? "0",
        cap_type: "none",
        cap_rate: null,
        admin_fee_percentage: "0",
        management_fee_percentage: null,
        excluded_pools: [],
      },
    }));
  assert(
    actualRows.length === expectedRows.length,
    `${scenario.slug} lease row count mismatch`,
  );
  for (let index = 0; index < expectedRows.length; index += 1) {
    assertJsonEqual(
      {
        unit_number: actualRows[index].unit_number,
        tenant_name: actualRows[index].tenant_name,
        start_date: actualRows[index].start_date,
        end_date: actualRows[index].end_date,
        status: actualRows[index].status,
        recovery_profile: normalizeRecoveryProfile(
          actualRows[index].recovery_profile,
        ),
      },
      expectedRows[index],
      `${scenario.slug} lease row ${index}`,
    );
  }
}

function normalizeRecoveryProfile(profile) {
  return {
    base_year: profile?.base_year ?? null,
    base_year_amount: profile?.base_year_amount ?? null,
    gross_up_base_year: profile?.gross_up_base_year ?? false,
    pro_rata_share: profile?.pro_rata_share ?? "0",
    cap_type: profile?.cap_type ?? null,
    cap_rate: profile?.cap_rate ?? null,
    admin_fee_percentage: profile?.admin_fee_percentage ?? null,
    management_fee_percentage: profile?.management_fee_percentage ?? null,
    excluded_pools: Array.isArray(profile?.excluded_pools)
      ? profile.excluded_pools
      : [],
  };
}

function normalizeWarnings(actualWarnings, expectedWarnings) {
  assert(Array.isArray(actualWarnings), "warnings should be an array");
  assertJsonEqual(actualWarnings, expectedWarnings, "warnings");

  return actualWarnings;
}

function assertErrorResponse(actual, expected, label) {
  assertExactKeys(actual, ERROR_RESPONSE_KEYS, `${label} response`);
  assertExactKeys(actual.error, ERROR_KEYS, `${label} error`);
  assertJsonEqual(actual, expected, label);
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

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `rent-roll-e2e-${runId}@capveri.com`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
  const organizationId = randomUUID();
  const generated = {
    token: undefined,
    signupEmail,
    userId: "00000000-0000-4000-8000-000000000000",
    organizationId,
    organizationName: `Local Rent Roll E2E Org ${runId}`,
    signupOrganizationIds: [],
    signupOrganizationNames: [`${signupEmail.split("@")[0]}'s Organization`],
    propertyIds: [],
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
    const signupOrgRows = await sql`
      select u.organization_id, o.name
      from users u
      join organizations o on o.id = u.organization_id
      where u.id = ${userId}
      limit 1
    `;
    const signupOrgId = signupOrgRows[0]?.organization_id;
    if (typeof signupOrgId === "string") {
      generated.signupOrganizationIds.push(signupOrgId);
    }
    const signupOrgName = signupOrgRows[0]?.name;
    if (typeof signupOrgName === "string") {
      generated.signupOrganizationNames.push(signupOrgName);
    }

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
          values (${userId}, ${organizationId}, ${signupEmail}, 'Local Rent Roll E2E', 'owner')
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
      await assertCleanupComplete(sql, generated);
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
  const propertyIds = nonEmpty(input.propertyIds);
  const signupOrgIds = nonEmpty(input.signupOrganizationIds);
  const signupOrgNames = nonEmpty(
    input.signupOrganizationNames,
    "__local_rent_roll_e2e_none__",
  );
  const organizationIds = [input.organizationId, ...signupOrgIds];
  await sql.begin(async (transaction) => {
    await transaction`
      delete from reconciliation_snapshots
      where organization_id = ${input.organizationId}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from tenant_lease_links
      where lease_id in (
        select id from leases
        where property_id in ${transaction(propertyIds)}
      )
    `;
    await transaction`
      delete from leases
      where property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from units
      where property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from properties
      where organization_id = ${input.organizationId}
        or id in ${transaction(propertyIds)}
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
        or row_id in ${transaction([input.userId, ...organizationIds, ...propertyIds])}
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
        or name in ${transaction([input.organizationName, ...signupOrgNames])}
    `;
  });
}

async function assertCleanupComplete(sql, input) {
  const propertyIds = nonEmpty(input.propertyIds);
  const signupOrgIds = nonEmpty(input.signupOrganizationIds);
  const signupOrgNames = nonEmpty(
    input.signupOrganizationNames,
    "__local_rent_roll_e2e_none__",
  );
  const organizationIds = [input.organizationId, ...signupOrgIds];
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id = ${input.userId} or email = ${input.signupEmail}) as auth_users,
      (select count(*)::int from users where id = ${input.userId} or email = ${input.signupEmail} or organization_id in ${sql(organizationIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(organizationIds)} or name in ${sql([input.organizationName, ...signupOrgNames])}) as organizations,
      (select count(*)::int from subscriptions where organization_id in ${sql(organizationIds)}) as subscriptions,
      (select count(*)::int from properties where organization_id = ${input.organizationId} or id in ${sql(propertyIds)}) as properties,
      (select count(*)::int from units where property_id in ${sql(propertyIds)}) as units,
      (select count(*)::int from leases where property_id in ${sql(propertyIds)}) as leases,
      (select count(*)::int from reconciliation_snapshots where organization_id = ${input.organizationId} or property_id in ${sql(propertyIds)}) as reconciliation_snapshots,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(organizationIds)} or user_id = ${input.userId}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id in ${sql(organizationIds)} or user_id = ${input.userId} or email = ${input.signupEmail}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql(organizationIds)} or changed_by = ${input.userId}) as audit_log
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

async function updateUserRole(sql, account, role) {
  await sql`
    update users
    set role = ${role}, updated_at = now()
    where id = ${account.userId}
      and organization_id = ${account.organizationId}
  `;
}

async function updateSubscriptionStatus(sql, account, status) {
  const organizationStatus = status === "active" ? "active" : "suspended";
  await sql.begin(async (transaction) => {
    await transaction`
      update subscriptions
      set status = ${status}, updated_at = now()
      where organization_id = ${account.organizationId}
    `;
    await transaction`
      update organizations
      set subscription_status = ${organizationStatus}, updated_at = now()
      where id = ${account.organizationId}
    `;
  });
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-rent-roll-e2e-"));
  const path = resolve(directory, ".dev.vars.local-rent-roll-e2e");
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
