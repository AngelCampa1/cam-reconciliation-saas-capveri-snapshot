import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8829";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");

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
    fail(`local bootstrap/organization E2E always owns ${DEFAULT_BASE_URL}`);
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
    ])) ??
    LOCAL_ANON_KEY;

  if (process.env.CI)
    fail("Refusing to run local bootstrap/organization E2E in CI.");
  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({ baseUrl, supabaseUrl, anonKey, databaseUrl, index }),
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
    try {
      await worker.close();
    } catch (error) {
      closeError = error;
    }
  }

  if (runError && closeError) {
    console.error(
      `Local bootstrap/organization Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const seeded = await seedScenario({ ...input, sql });
  let runError;
  let cleanupError;
  let result;

  try {
    const ownerHeaders = authHeaders(seeded.owner.accessToken);
    const adminHeaders = authHeaders(seeded.admin.accessToken);

    const dashboard = await expectJson(`${input.baseUrl}/api/v1/dashboard`, {
      headers: ownerHeaders,
    });
    assertDashboardContract(dashboard, seeded);

    const leakage = await expectJson(
      `${input.baseUrl}/api/v1/dashboard/leakage-summary`,
      { headers: ownerHeaders },
    );
    assertLeakageContract(leakage, seeded);

    const usage = await expectJson(
      `${input.baseUrl}/api/v1/organization/usage`,
      { headers: adminHeaders },
    );
    assertExactObject(usage, { properties: 1, users: 2 }, "organization usage");

    const initialSettings = await expectJson(
      `${input.baseUrl}/api/v1/organization/settings`,
      { headers: ownerHeaders },
    );
    assertSettingsContract(
      initialSettings,
      seeded.owner.organizationId,
      {
        timezone: "America/Chicago",
        default_currency: "USD",
        fiscal_year_end_month: 12,
        contact_name: "Existing Contact",
        contact_title: null,
        contact_company: null,
        contact_phone: null,
        contact_email: null,
        contact_address: null,
      },
      "initial settings",
    );

    await expectError(`${input.baseUrl}/api/v1/organization/settings`, {
      method: "PATCH",
      headers: jsonAuthHeaders(seeded.admin.accessToken),
      status: 403,
      code: "insufficient_permissions",
      body: JSON.stringify({ timezone: "America/Denver" }),
    });

    const updatedSettings = await expectJson(
      `${input.baseUrl}/api/v1/organization/settings`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(seeded.owner.accessToken),
        body: JSON.stringify({
          timezone: "America/Denver",
          default_currency: "CAD",
          fiscal_year_end_month: 6,
          contact_name: null,
          contact_phone: "555-0199",
        }),
      },
    );
    assertSettingsContract(
      updatedSettings,
      seeded.owner.organizationId,
      {
        timezone: "America/Denver",
        default_currency: "CAD",
        fiscal_year_end_month: 6,
        contact_name: "Existing Contact",
        contact_title: null,
        contact_company: null,
        contact_phone: "555-0199",
        contact_email: null,
        contact_address: null,
      },
      "updated settings",
    );
    await assertSettingsPreserved(sql, seeded.owner.organizationId);

    await expectError(`${input.baseUrl}/api/v1/organization/settings`, {
      method: "PATCH",
      headers: jsonAuthHeaders(seeded.owner.accessToken),
      status: 422,
      code: "validation_error",
      body: JSON.stringify({ fiscal_year_end_month: 13 }),
    });

    result = {
      index: input.index,
      organization_id: seeded.owner.organizationId,
      property_id: seeded.propertyId,
      finalized_recovery: dashboard.total_recovery_finalized,
      statement_exposure: leakage.total_billing_exposure,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, seeded.generated);
      await assertCleanupComplete(sql, seeded.generated);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (runError && cleanupError) {
    console.error(
      `Local bootstrap/organization cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedScenario(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const owner = await createLocalAuthUser(input, {
    email: `bootstrap-org-owner-${suffix}@capveri.local`,
    password: `OwnerPass${input.index}Aa1!`,
    fullName: `Local Bootstrap Owner ${suffix}`,
    organizationName: `Local Bootstrap Owner Org ${suffix}`,
    role: "owner",
  });
  const admin = await createLocalAuthUser(input, {
    email: `bootstrap-org-admin-${suffix}@capveri.local`,
    password: `AdminPass${input.index}Aa1!`,
    fullName: `Local Bootstrap Admin ${suffix}`,
    organizationName: `Local Bootstrap Admin Org ${suffix}`,
    role: "admin",
  });
  const hidden = await createLocalAuthUser(input, {
    email: `bootstrap-org-hidden-${suffix}@capveri.local`,
    password: `HiddenPass${input.index}Aa1!`,
    fullName: `Local Bootstrap Hidden ${suffix}`,
    organizationName: `Local Bootstrap Hidden Org ${suffix}`,
    role: "owner",
  });

  const ids = {
    propertyId: randomUUID(),
    unitAId: randomUUID(),
    unitBId: randomUUID(),
    leaseAId: randomUUID(),
    leaseBId: randomUUID(),
    importBatchId: randomUUID(),
    documentId: randomUUID(),
    finalizedSnapshotId: randomUUID(),
    draftSnapshotId: randomUUID(),
    billedId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    hiddenUnitId: randomUUID(),
    hiddenLeaseId: randomUUID(),
    hiddenSnapshotId: randomUUID(),
    hiddenBilledId: randomUUID(),
  };
  const propertyName = `Local Bootstrap Property ${suffix}`;
  const hiddenMarker = `HIDDEN Bootstrap ${suffix}`;
  const documentFilename = `bootstrap-review-${suffix}.pdf`;

  try {
    await input.sql.begin(async (transaction) => {
      await transaction`
        update users
        set organization_id = ${owner.organizationId}, role = 'admin', updated_at = now()
        where id = ${admin.userId}
      `;
      admin.organizationId = owner.organizationId;
      await transaction`
        update organizations
        set settings = ${transaction.json({
          timezone: "America/Chicago",
          default_currency: "USD",
          fiscal_year_end_month: 12,
          contact_name: "Existing Contact",
          billing_activation: {
            plan_id: "reconcile",
            billing_period: "annual",
            unit_count: 2,
            building_count: 1,
            selected_at: "2026-06-19T00:00:00.000Z",
          },
        })}
        where id = ${owner.organizationId}
      `;
      await transaction`
        insert into properties (
          id, organization_id, name, address_line1, city, state, postal_code,
          total_rentable_sqft, total_usable_sqft, common_area_sqft, created_at
        )
        values
          (${ids.propertyId}, ${owner.organizationId}, ${propertyName}, '100 Local Way', 'Houston', 'TX', '77002', 50000, 45000, 5000, '2026-06-20T12:00:00Z'::timestamptz),
          (${ids.hiddenPropertyId}, ${hidden.organizationId}, ${hiddenMarker}, '900 Hidden Way', 'Dallas', 'TX', '75201', 10000, 9000, 1000, '2026-06-20T12:40:00Z'::timestamptz)
      `;
      await transaction`
        insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
        values
          (${ids.unitAId}, ${ids.propertyId}, 'A-100', 10000, 9000, 1, 'occupied'),
          (${ids.unitBId}, ${ids.propertyId}, 'B-200', 8000, 7200, 2, 'occupied'),
          (${ids.hiddenUnitId}, ${ids.hiddenPropertyId}, 'H-100', 1000, 900, 1, 'occupied')
      `;
      await transaction`
        insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile, created_at)
        values
          (${ids.leaseAId}, ${ids.propertyId}, ${ids.unitAId}, 'Anchor Tenant', '2025-01-01'::date, '2025-12-31'::date, 'active', '{}'::jsonb, '2026-06-20T12:10:00Z'::timestamptz),
          (${ids.leaseBId}, ${ids.propertyId}, ${ids.unitBId}, 'Draft Tenant', '2025-01-01'::date, '2025-12-31'::date, 'active', '{}'::jsonb, '2026-06-20T12:20:00Z'::timestamptz),
          (${ids.hiddenLeaseId}, ${ids.hiddenPropertyId}, ${ids.hiddenUnitId}, ${hiddenMarker}, '2025-01-01'::date, '2025-12-31'::date, 'active', '{}'::jsonb, '2026-06-20T12:50:00Z'::timestamptz)
      `;
      await transaction`
        insert into import_batches (id, organization_id, property_id, file_name, file_hash, source_system, status, row_count)
        values (${ids.importBatchId}, ${owner.organizationId}, ${ids.propertyId}, ${`bootstrap-gl-${suffix}.csv`}, repeat('c', 64), 'generic', 'completed', 3)
      `;
      await transaction`
        insert into gl_entries (
          import_batch_id, property_id, account_code, account_description, amount,
          transaction_date, period_year, period_month, vendor_name, description, raw_row_data
        )
        values
          (${ids.importBatchId}, ${ids.propertyId}, '6000', 'Cleaning', 1000, '2025-03-01', 2025, 3, 'Clean Co', 'Cleaning', ${transaction.json({ source: "bootstrap-org-e2e" })}),
          (${ids.importBatchId}, ${ids.propertyId}, '7000', 'Utilities', 2000, '2025-04-01', 2025, 4, 'Utility Co', 'Utilities', ${transaction.json({ source: "bootstrap-org-e2e" })}),
          (${ids.importBatchId}, ${ids.propertyId}, '8000', 'Repairs', 3000, '2025-05-01', 2025, 5, 'Repair Co', 'Repairs', ${transaction.json({ source: "bootstrap-org-e2e" })})
      `;
      await transaction`
        insert into documents (
          id, organization_id, property_id, filename, storage_key, storage_bucket,
          content_type, file_size_bytes, document_type, status, created_at
        )
        values (
          ${ids.documentId}, ${owner.organizationId}, ${ids.propertyId}, ${documentFilename},
          ${`local-bootstrap/${suffix}.pdf`}, 'local-e2e', 'application/pdf', 1024, 'lease',
          'ready_for_review', '2026-06-20T12:30:00Z'::timestamptz
        )
      `;
      await transaction`
        insert into reconciliation_snapshots (
          id, organization_id, property_id, lease_id, period_start_date, period_end_date,
          status, total_operating_expenses, grossed_up_expenses, base_year_amount,
          tenant_share_before_cap, tenant_share_after_cap, admin_fee, total_recovery,
          pool_breakdowns, calculation_trace, finalized_at, finalized_by_user_id, created_at
        )
        values
          (${ids.finalizedSnapshotId}, ${owner.organizationId}, ${ids.propertyId}, ${ids.leaseAId}, '2025-01-01'::date, '2025-12-31'::date, 'finalized', 10000, 10000, 0, 1250, 1250, 0, 1250, '[]'::jsonb, '[]'::jsonb, now(), ${owner.userId}, '2026-06-20T12:35:00Z'::timestamptz),
          (${ids.draftSnapshotId}, ${owner.organizationId}, ${ids.propertyId}, ${ids.leaseBId}, '2025-01-01'::date, '2025-12-31'::date, 'draft', 10000, 10000, 0, 300, 300, 0, 300, '[]'::jsonb, '[]'::jsonb, null, null, '2026-06-20T12:36:00Z'::timestamptz),
          (${ids.hiddenSnapshotId}, ${hidden.organizationId}, ${ids.hiddenPropertyId}, ${ids.hiddenLeaseId}, '2025-01-01'::date, '2025-12-31'::date, 'finalized', 10000, 10000, 0, 9999, 9999, 0, 9999, '[]'::jsonb, '[]'::jsonb, now(), ${hidden.userId}, '2026-06-20T12:55:00Z'::timestamptz)
      `;
      await transaction`
        insert into actual_billed_amounts (
          id, organization_id, property_id, period_start_date, period_end_date,
          tenant_name, billed_amount, source_type
        )
        values
          (${ids.billedId}, ${owner.organizationId}, ${ids.propertyId}, '2025-01-01'::date, '2025-12-31'::date, 'Anchor Tenant', 800.00, 'manual'),
          (${ids.hiddenBilledId}, ${hidden.organizationId}, ${ids.hiddenPropertyId}, '2025-01-01'::date, '2025-12-31'::date, ${hiddenMarker}, 1.00, 'manual')
      `;
    });
  } catch (error) {
    await cleanupGeneratedRows(
      input.sql,
      generatedRows({ owner, admin, hidden }, ids),
    );
    throw error;
  }

  return {
    owner,
    admin,
    hidden,
    propertyName,
    hiddenMarker,
    documentFilename,
    ...ids,
    generated: generatedRows({ owner, admin, hidden }, ids),
  };
}

function generatedRows(accounts, ids) {
  return {
    orgIds: [
      accounts.owner.signupOrganizationId,
      accounts.admin.signupOrganizationId,
      accounts.hidden.signupOrganizationId,
    ],
    userIds: [
      accounts.owner.userId,
      accounts.admin.userId,
      accounts.hidden.userId,
    ],
    emails: [accounts.owner.email, accounts.admin.email, accounts.hidden.email],
    orgNames: [
      accounts.owner.organizationName,
      accounts.admin.organizationName,
      accounts.hidden.organizationName,
    ],
    propertyIds: [ids.propertyId, ids.hiddenPropertyId],
    unitIds: [ids.unitAId, ids.unitBId, ids.hiddenUnitId],
    leaseIds: [ids.leaseAId, ids.leaseBId, ids.hiddenLeaseId],
    importBatchIds: [ids.importBatchId],
    documentIds: [ids.documentId],
    snapshotIds: [
      ids.finalizedSnapshotId,
      ids.draftSnapshotId,
      ids.hiddenSnapshotId,
    ],
    billedIds: [ids.billedId, ids.hiddenBilledId],
  };
}

async function createLocalAuthUser(input, user) {
  const partial = {
    ...user,
    userId: "",
    signupOrganizationId: "",
    organizationId: "",
    accessToken: "",
  };
  try {
    const response = await fetch(
      new URL("/auth/v1/signup", input.supabaseUrl),
      {
        method: "POST",
        headers: { apikey: input.anonKey, "content-type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          data: {
            full_name: user.fullName,
            organization_name: user.organizationName,
          },
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      fail(`Supabase signup failed: ${JSON.stringify(redactSensitive(body))}`);
    const userId = body.user?.id;
    assert(
      typeof userId === "string" && userId !== "",
      "signup user id missing",
    );
    partial.userId = userId;
    await input.sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
    await input.sql`update users set role = ${user.role}, full_name = ${user.fullName}, updated_at = now() where id = ${userId}`;
    const rows =
      await input.sql`select organization_id from users where id = ${userId} limit 1`;
    const organizationId = rows[0]?.organization_id;
    assert(
      typeof organizationId === "string" && organizationId !== "",
      "signup organization id missing",
    );
    partial.signupOrganizationId = organizationId;
    partial.organizationId = organizationId;
    const accessToken =
      body.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: user.email,
        password: user.password,
      }));
    assert(
      typeof accessToken === "string" && accessToken !== "",
      "access token missing",
    );
    partial.accessToken = accessToken;
    return partial;
  } catch (error) {
    await cleanupGeneratedRows(input.sql, {
      orgIds: [partial.signupOrganizationId],
      userIds: [partial.userId],
      emails: [partial.email],
      orgNames: [partial.organizationName],
      propertyIds: [],
      unitIds: [],
      leaseIds: [],
      importBatchIds: [],
      documentIds: [],
      snapshotIds: [],
      billedIds: [],
    });
    throw error;
  }
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

async function assertSettingsPreserved(sql, organizationId) {
  const rows =
    await sql`select settings from organizations where id = ${organizationId}`;
  const settings = rows[0]?.settings;
  assert(
    settings?.billing_activation?.plan_id === "reconcile",
    "billing_activation settings were not preserved",
  );
  assert(
    settings?.billing_activation?.billing_period === "annual",
    "billing_activation billing period was not preserved",
  );
  assert(
    settings?.billing_activation?.unit_count === 2,
    "billing_activation unit count was not preserved",
  );
  assert(
    settings?.billing_activation?.building_count === 1,
    "billing_activation building count was not preserved",
  );
  assert(
    settings?.billing_activation?.selected_at === "2026-06-19T00:00:00.000Z",
    "billing_activation selected_at was not preserved",
  );
}

function assertDashboardContract(dashboard, seeded) {
  assertExactKeys(
    dashboard,
    [
      "property_count",
      "unit_count",
      "lease_count",
      "gl_entry_count",
      "pending_reconciliations",
      "pending_verifications",
      "recent_properties",
      "recent_activity",
      "total_recovery_finalized",
      "alerts",
    ],
    "dashboard",
  );
  assertExactObject(
    {
      property_count: dashboard.property_count,
      unit_count: dashboard.unit_count,
      lease_count: dashboard.lease_count,
      gl_entry_count: dashboard.gl_entry_count,
      pending_reconciliations: dashboard.pending_reconciliations,
      pending_verifications: dashboard.pending_verifications,
      total_recovery_finalized: dashboard.total_recovery_finalized,
    },
    {
      property_count: 1,
      unit_count: 2,
      lease_count: 2,
      gl_entry_count: 3,
      pending_reconciliations: 1,
      pending_verifications: 1,
      total_recovery_finalized: "1250.00",
    },
    "dashboard counts",
  );
  assertNoHiddenLeak(dashboard, seeded);
  assertRecentProperties(dashboard.recent_properties, seeded);
  assertRecentActivity(dashboard.recent_activity, seeded);
  assertAlerts(dashboard.alerts);
}

function assertRecentProperties(recentProperties, seeded) {
  assert(Array.isArray(recentProperties), "recent_properties is not an array");
  assert(recentProperties.length === 1, "recent_properties count mismatch");
  assertExactObject(
    recentProperties[0],
    {
      id: seeded.propertyId,
      name: seeded.propertyName,
      unit_count: 2,
      last_reconciliation: "Draft (2026-06-20)",
    },
    "recent property",
  );
}

function assertRecentActivity(recentActivity, seeded) {
  assert(Array.isArray(recentActivity), "recent_activity is not an array");
  assert(recentActivity.length === 4, "recent_activity count mismatch");
  const byId = new Map(
    recentActivity.map((activity) => [activity.id, activity]),
  );
  const expected = [
    {
      id: seeded.documentId,
      type: "upload",
      title: "Document uploaded",
      description: seeded.documentFilename,
      timestamp: "2026-06-20T12:30:00.000Z",
      href: "/extractions",
    },
    {
      id: seeded.leaseBId,
      type: "lease",
      title: "Lease added",
      description: "Draft Tenant",
      timestamp: "2026-06-20T12:20:00.000Z",
      href: `/properties/${seeded.propertyId}`,
    },
    {
      id: seeded.leaseAId,
      type: "lease",
      title: "Lease added",
      description: "Anchor Tenant",
      timestamp: "2026-06-20T12:10:00.000Z",
      href: `/properties/${seeded.propertyId}`,
    },
    {
      id: seeded.propertyId,
      type: "property",
      title: "Property added",
      description: seeded.propertyName,
      timestamp: "2026-06-20T12:00:00.000Z",
      href: `/properties/${seeded.propertyId}`,
    },
  ];
  expected.forEach((expectedActivity, index) => {
    const actual = byId.get(expectedActivity.id);
    assert(actual, `missing recent activity ${expectedActivity.id}`);
    assertActivityRecord(
      actual,
      expectedActivity,
      `recent activity ${index + 1}`,
    );
  });
  assert(
    byId.size === expected.length,
    `recent_activity had unexpected ids: ${recentActivity.map((activity) => activity.id).join(",")}`,
  );
  assert(
    recentActivity.map((activity) => activity.id).join(",") ===
      expected.map((activity) => activity.id).join(","),
    "recent_activity order mismatch",
  );
}

function assertActivityRecord(actual, expected, label) {
  assertExactKeys(
    actual,
    ["id", "type", "title", "description", "timestamp", "href"],
    label,
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (key === "timestamp") {
      assertSameInstant(actual[key], expectedValue, `${label} timestamp`);
      continue;
    }
    assert(
      actual[key] === expectedValue,
      `${label} ${key} mismatch: expected ${expectedValue}, got ${actual[key]}`,
    );
  }
}

function assertAlerts(alerts) {
  assert(Array.isArray(alerts), "alerts is not an array");
  assert(alerts.length === 1, "alerts count mismatch");
  assertExactObject(
    alerts[0],
    {
      id: "pending-verifications",
      type: "warning",
      title: "Documents need review",
      description: "1 document(s) awaiting verification.",
      href: "/extractions",
      count: 1,
    },
    "pending verification alert",
  );
}

function assertLeakageContract(leakage, seeded) {
  assertExactObject(
    leakage,
    {
      total_recovery_opportunity: "450.00",
      properties_with_leakage: 1,
      total_underbill_exposure: "450.00",
      total_overbill_exposure: "0",
      total_billing_exposure: "450.00",
      properties_with_underbill: 1,
      properties_with_overbill: 0,
      properties_with_billing_exposure: 1,
      has_billing_data: true,
      draft_recovery: "300.00",
      draft_property_count: 1,
    },
    "leakage summary",
  );
  assertNoHiddenLeak(leakage, seeded);
}

function assertSettingsContract(actual, organizationId, expected, label) {
  assertExactObject(
    actual,
    {
      organization_id: organizationId,
      timezone: expected.timezone,
      default_currency: expected.default_currency,
      fiscal_year_end_month: expected.fiscal_year_end_month,
      contact_name: expected.contact_name,
      contact_title: expected.contact_title,
      contact_company: expected.contact_company,
      contact_phone: expected.contact_phone,
      contact_email: expected.contact_email,
      contact_address: expected.contact_address,
    },
    label,
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

function assertSameInstant(actual, expected, label) {
  assert(
    typeof actual === "string" && Number.isFinite(Date.parse(actual)),
    `${label} actual is not a timestamp`,
  );
  assert(
    typeof expected === "string" && Number.isFinite(Date.parse(expected)),
    `${label} expected is not a timestamp`,
  );
  assert(
    Date.parse(actual) === Date.parse(expected),
    `${label} mismatch: expected ${expected}, got ${actual}`,
  );
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_bootstrap_org_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_bootstrap_org_e2e_none__");
  const propertyIds = nonEmpty(input.propertyIds);
  const unitIds = nonEmpty(input.unitIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const importBatchIds = nonEmpty(input.importBatchIds);
  const documentIds = nonEmpty(input.documentIds);
  const snapshotIds = nonEmpty(input.snapshotIds);
  const billedIds = nonEmpty(input.billedIds);
  await sql.begin(async (transaction) => {
    await transaction`delete from actual_billed_amounts where id in ${transaction(billedIds)} or property_id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from reconciliation_snapshots where id in ${transaction(snapshotIds)} or property_id in ${transaction(propertyIds)} or lease_id in ${transaction(leaseIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from documents where id in ${transaction(documentIds)} or property_id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from gl_entries where import_batch_id in ${transaction(importBatchIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from import_batches where id in ${transaction(importBatchIds)} or property_id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from leases where id in ${transaction(leaseIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from units where id in ${transaction(unitIds)} or property_id in ${transaction(propertyIds)}`;
    await transaction`delete from properties where id in ${transaction(propertyIds)} or organization_id in ${transaction(orgIds)}`;
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

async function assertCleanupComplete(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_bootstrap_org_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_bootstrap_org_e2e_none__");
  const propertyIds = nonEmpty(input.propertyIds);
  const leaseIds = nonEmpty(input.leaseIds);
  const importBatchIds = nonEmpty(input.importBatchIds);
  const documentIds = nonEmpty(input.documentIds);
  const snapshotIds = nonEmpty(input.snapshotIds);
  const billedIds = nonEmpty(input.billedIds);
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as properties,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)}) as leases,
      (select count(*)::int from import_batches where id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as import_batches,
      (select count(*)::int from gl_entries where import_batch_id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as gl_entries,
      (select count(*)::int from documents where id in ${sql(documentIds)} or property_id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as documents,
      (select count(*)::int from reconciliation_snapshots where id in ${sql(snapshotIds)} or property_id in ${sql(propertyIds)} or lease_id in ${sql(leaseIds)} or organization_id in ${sql(orgIds)}) as snapshots,
      (select count(*)::int from actual_billed_amounts where id in ${sql(billedIds)} or property_id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as billed,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
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

async function expectError(url, options) {
  const body = await expectJson(url, options);
  assert(
    body?.error?.code === options.code,
    `expected error code ${options.code}, got ${JSON.stringify(body)}`,
  );
  return body;
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
    if (code !== null && code !== 0)
      output += `\nwrangler dev exited with ${code}`;
  });
  const handle = {
    close: async () => {
      try {
        if (child.exitCode === null) {
          if (child.pid) await killProcessTree(child.pid);
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
    resolve(tmpdir(), "capveri-bootstrap-org-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-bootstrap-organization-e2e");
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
  let response;
  try {
    response = await fetch(`${baseUrl}/health`);
  } catch {
    return;
  }
  if (response.ok) fail(`${baseUrl} is already serving /health`);
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

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonAuthHeaders(token) {
  return { ...authHeaders(token), "content-type": "application/json" };
}

function assertNoHiddenLeak(value, seeded) {
  const serialized = JSON.stringify(value);
  for (const marker of [
    seeded.hiddenMarker,
    seeded.hidden.organizationId,
    seeded.hidden.userId,
    seeded.hiddenPropertyId,
    seeded.hiddenUnitId,
    seeded.hiddenLeaseId,
    seeded.hiddenSnapshotId,
    seeded.hiddenBilledId,
  ]) {
    assert(
      !serialized.includes(marker),
      `response leaked hidden marker ${marker}`,
    );
  }
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

function normalizedLocalUrl(rawUrl, label) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:") fail(`${label} must use http`);
  if (!isLoopbackHost(url.hostname)) fail(`${label} must point at loopback`);
  if (!url.port) fail(`${label} must include a port`);
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
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
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    fail("database-url must be Postgres");
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322")
    fail("database-url must use the local Supabase Postgres port 54322");
  if (url.pathname !== "/postgres")
    fail("database-url must target the local Supabase postgres database");
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

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(values.filter((value) => typeof value === "string" && value)),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function redactSensitive(value) {
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
