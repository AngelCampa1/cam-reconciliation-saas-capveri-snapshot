import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8839";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-12-31";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const COMPARISON_KEYS = [
  "match_count",
  "overcharge_count",
  "period_end",
  "period_start",
  "property_id",
  "tenants",
  "tolerance",
  "total_actual_charged",
  "total_capveri_correct",
  "total_net_variance",
  "total_overcharge",
  "total_undercharge",
  "undercharge_count",
];
const RUN_SUMMARY_KEYS = [
  ...COMPARISON_KEYS.filter((key) => key !== "tenants"),
  "created_at",
  "created_by",
  "id",
  "source",
];
const STORED_RUN_KEYS = [...RUN_SUMMARY_KEYS, "findings"];
const TENANT_KEYS = [
  "abs_variance",
  "actual_charged",
  "capveri_correct",
  "direction",
  "lease_id",
  "pool_breakdowns",
  "tenant_name",
  "variance",
  "variance_pct",
];
const POOL_BREAKDOWN_KEYS = [
  "abs_variance",
  "actual_charged",
  "capveri_correct",
  "direction",
  "pool_id",
  "pool_name",
  "variance",
  "variance_pct",
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
    fail(`local comparison E2E always owns ${DEFAULT_BASE_URL}`);
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
    fail("Refusing to run local comparison E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let closeError;

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
    try {
      await worker.close();
    } catch (error) {
      closeError = error;
    }
  }

  if (runError && closeError) {
    console.error(
      `Local comparison Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedDisposableLocalAccount(input);
  const authHeaders = {
    authorization: `Bearer ${account.token}`,
    "content-type": "application/json",
  };
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let result;
  let runError;
  let cleanupError;
  let closeError;

  try {
    const actual = await expectJson(
      `${input.baseUrl}/api/v1/comparison/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
      { headers: authHeaders, status: 200 },
    );
    assertComparison(actual, {
      propertyId: account.propertyId,
      totalCorrect: "1900",
      totalActual: "1975",
      netVariance: "75",
      totalOvercharge: "275",
      totalUndercharge: "200",
      overchargeCount: 2,
      underchargeCount: 1,
      matchCount: 0,
    });
    assertTenant(actual, {
      leaseId: "name::Shared Tenant",
      tenantName: "Shared Tenant",
      correct: "1000",
      charged: "1200",
      variance: "200",
      direction: "overcharge",
      variancePct: "20.00",
    });
    assertTenant(actual, {
      leaseId: account.soloLeaseId,
      tenantName: "Solo Tenant",
      correct: "900",
      charged: "700",
      variance: "-200",
      direction: "undercharge",
      variancePct: "-22.22",
      poolId: account.camPoolId,
      poolVariance: "-200",
      poolAbsVariance: "200",
    });
    assertTenant(actual, {
      leaseId: `id::${account.blankBilledId}`,
      tenantName: "Unidentified charge",
      correct: "0",
      charged: "75",
      variance: "75",
      direction: "overcharge",
      variancePct: null,
    });

    const actualWithDrafts = await expectJson(
      `${input.baseUrl}/api/v1/comparison/${account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}&include_drafts=true`,
      { headers: authHeaders, status: 200 },
    );
    assertComparison(actualWithDrafts, {
      propertyId: account.propertyId,
      totalCorrect: "2200",
      totalActual: "1975",
      netVariance: "-225",
      totalOvercharge: "275",
      totalUndercharge: "500",
      overchargeCount: 2,
      underchargeCount: 2,
      matchCount: 0,
    });
    assertTenant(actualWithDrafts, {
      leaseId: account.draftLeaseId,
      tenantName: "Draft Tenant",
      correct: "300",
      charged: "0",
      variance: "-300",
      direction: "undercharge",
      variancePct: "-100.00",
    });

    const explicit = await expectJson(
      `${input.baseUrl}/api/v1/comparison/${account.propertyId}`,
      {
        method: "POST",
        headers: authHeaders,
        status: 200,
        body: JSON.stringify({
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          charges: [
            { tenant_name: "Shared Tenant", amount: "1000.00" },
            {
              tenant_name: "Solo Tenant",
              pool_id: account.camPoolId,
              amount: "920.00",
            },
            { tenant_name: "Extra Tenant", amount: "50.00" },
          ],
        }),
      },
    );
    assertComparison(explicit, {
      propertyId: account.propertyId,
      totalCorrect: "1900",
      totalActual: "1970",
      netVariance: "70",
      totalOvercharge: "70",
      totalUndercharge: "0",
      overchargeCount: 2,
      underchargeCount: 0,
      matchCount: 1,
    });
    assertTenant(explicit, {
      leaseId: "name::Extra Tenant",
      tenantName: "Extra Tenant",
      correct: "0",
      charged: "50",
      variance: "50",
      direction: "overcharge",
      variancePct: null,
    });

    const stored = await expectJson(
      `${input.baseUrl}/api/v1/comparison/${account.propertyId}/runs`,
      {
        method: "POST",
        headers: authHeaders,
        status: 201,
        body: JSON.stringify({
          period_start: PERIOD_START,
          period_end: PERIOD_END,
          charges: null,
        }),
      },
    );
    assertStoredRun(stored, {
      propertyId: account.propertyId,
      totalCorrect: "1900",
      totalActual: "1975",
      netVariance: "75",
      totalOvercharge: "275",
      totalUndercharge: "200",
      overchargeCount: 2,
      underchargeCount: 1,
      matchCount: 0,
      source: "actual_billed",
      createdBy: account.userId,
      findingCount: 3,
    });
    assertTenant(
      { tenants: stored.findings },
      { leaseId: "name::Shared Tenant" },
    );
    assertTenant(
      { tenants: stored.findings },
      { leaseId: `id::${account.blankBilledId}` },
    );

    const list = await expectJson(
      `${input.baseUrl}/api/v1/comparison/${account.propertyId}/runs?limit=5&offset=0`,
      { headers: authHeaders, status: 200 },
    );
    assert(Array.isArray(list), "comparison run list should be an array");
    assert(list.length === 1, "comparison run list length mismatch");
    assertRunSummary(list[0], {
      propertyId: account.propertyId,
      totalCorrect: "1900",
      totalActual: "1975",
      netVariance: "75",
      totalOvercharge: "275",
      totalUndercharge: "200",
      overchargeCount: 2,
      underchargeCount: 1,
      matchCount: 0,
      source: "actual_billed",
      createdBy: account.userId,
    });
    assert(list[0].id === stored.id, "stored run missing from list");

    const fetched = await expectJson(
      `${input.baseUrl}/api/v1/comparison/runs/${stored.id}`,
      { headers: authHeaders, status: 200 },
    );
    assertStoredRun(fetched, {
      propertyId: account.propertyId,
      totalCorrect: "1900",
      totalActual: "1975",
      netVariance: "75",
      totalOvercharge: "275",
      totalUndercharge: "200",
      overchargeCount: 2,
      underchargeCount: 1,
      matchCount: 0,
      source: "actual_billed",
      createdBy: account.userId,
      findingCount: 3,
    });
    assert(fetched.id === stored.id, "fetched run id mismatch");
    assertExactJson(fetched.findings, stored.findings, "fetched findings");

    await assertComparisonNegativePaths({
      baseUrl: input.baseUrl,
      authHeaders,
      account,
      runId: stored.id,
    });

    const hidden = await expectJson(
      `${input.baseUrl}/api/v1/comparison/${account.otherPropertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}`,
      { headers: authHeaders, status: 200 },
    );
    assertComparison(hidden, {
      propertyId: account.otherPropertyId,
      totalCorrect: "0",
      totalActual: "0",
      netVariance: "0",
      totalOvercharge: "0",
      totalUndercharge: "0",
      overchargeCount: 0,
      underchargeCount: 0,
      matchCount: 0,
    });
    assert(hidden.tenants.length === 0, "cross-org comparison leaked tenants");

    const dbRun = await verifyStoredRun(sql, {
      organizationId: account.organizationId,
      runId: stored.id,
    });

    result = {
      run: input.index + 1,
      organization_id: account.organizationId,
      property_id: account.propertyId,
      comparison_run_id: stored.id,
      total_net_variance: actual.total_net_variance,
      stored_findings: dbRun.finding_count,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupDisposableLocalAccount(sql, account);
      await assertCleanupComplete(sql, account);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError ??= error;
      }
    }
  }

  const postRunError = cleanupError ?? closeError;
  if (runError && postRunError) {
    console.error(
      `Local comparison cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
    );
  }
  if (runError) throw runError;
  if (postRunError) throw postRunError;
  if (result) return result;
  fail("Local comparison E2E ended without returning a result.");
}

async function verifyStoredRun(sql, input) {
  const rows = await sql`
    select
      comparison_runs.source,
      comparison_runs.total_net_variance::text,
      count(comparison_findings.id)::int as finding_count,
      bool_or(comparison_findings.lease_id = 'name::Shared Tenant') as has_shared_name,
      bool_or(comparison_findings.lease_id like 'id::%') as has_blank_id
    from comparison_runs
    left join comparison_findings
      on comparison_findings.comparison_run_id = comparison_runs.id
    where comparison_runs.id = ${input.runId}
      and comparison_runs.organization_id = ${input.organizationId}
    group by comparison_runs.id
  `;
  const row = rows[0];
  assert(row, "stored comparison run should exist in DB");
  assert(row.source === "actual_billed", "DB comparison source mismatch");
  assert(row.total_net_variance === "75.00", "DB net variance mismatch");
  assert(row.finding_count === 3, "DB finding count mismatch");
  assert(
    row.has_shared_name === true,
    "DB synthetic duplicate-name finding missing",
  );
  assert(
    row.has_blank_id === true,
    "DB synthetic blank billed finding missing",
  );
  return row;
}

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `comparison-e2e-${runId}@capveri.com`;
  const signupOrganizationName = `${signupEmail.split("@")[0]}'s Organization`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
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

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const propertyId = randomUUID();
  const otherPropertyId = randomUUID();
  const sharedUnitAId = randomUUID();
  const sharedUnitBId = randomUUID();
  const soloUnitId = randomUUID();
  const draftUnitId = randomUUID();
  const otherUnitId = randomUUID();
  const sharedLeaseAId = randomUUID();
  const sharedLeaseBId = randomUUID();
  const soloLeaseId = randomUUID();
  const draftLeaseId = randomUUID();
  const otherLeaseId = randomUUID();
  const camPoolId = randomUUID();
  const taxPoolId = randomUUID();
  const blankBilledId = randomUUID();
  const organizationName = `Local Comparison E2E Org ${runId}`;
  const otherOrganizationName = `Local Comparison Hidden Org ${runId}`;
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let signupOrganizationId;

  try {
    await sql
      .begin(async (transaction) => {
        const signupUsers = await transaction`
          select organization_id
          from users
          where id = ${userId}
        `;
        signupOrganizationId = signupUsers[0]?.organization_id ?? undefined;
        await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id = ${userId}
        `;
        await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values
            (${organizationId}, ${organizationName}, 'active', '{}'::jsonb),
            (${otherOrganizationId}, ${otherOrganizationName}, 'active', '{}'::jsonb)
        `;
        await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${userId}, ${organizationId}, ${signupEmail}, 'Local Comparison E2E', 'owner')
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
          values
            (${propertyId}, ${organizationId}, 'Comparison E2E Property', '300 Compare Way', 'Austin', 'TX', '78701', 60000, 54000, 6000, 0.95),
            (${otherPropertyId}, ${otherOrganizationId}, 'Hidden Comparison Property', '900 Hidden Way', 'Austin', 'TX', '78701', 20000, 18000, 2000, 0.95)
        `;
        await transaction`
          insert into expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target)
          values
            (${camPoolId}, ${propertyId}, 'CAM', 'operating', true, 0.95),
            (${taxPoolId}, ${propertyId}, 'Tax', 'tax', false, null)
        `;
        await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${sharedUnitAId}, ${propertyId}, 'S-100', 10000, 9000, 1, 'occupied'),
            (${sharedUnitBId}, ${propertyId}, 'S-200', 10000, 9000, 2, 'occupied'),
            (${soloUnitId}, ${propertyId}, 'SO-100', 12000, 10800, 3, 'occupied'),
            (${draftUnitId}, ${propertyId}, 'D-100', 8000, 7200, 4, 'occupied'),
            (${otherUnitId}, ${otherPropertyId}, 'H-100', 5000, 4500, 1, 'occupied')
        `;
        await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (${sharedLeaseAId}, ${propertyId}, ${sharedUnitAId}, 'Shared Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${sharedLeaseBId}, ${propertyId}, ${sharedUnitBId}, 'Shared Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${soloLeaseId}, ${propertyId}, ${soloUnitId}, 'Solo Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${draftLeaseId}, ${propertyId}, ${draftUnitId}, 'Draft Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${otherLeaseId}, ${otherPropertyId}, ${otherUnitId}, 'Hidden Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb)
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
            pool_breakdowns,
            calculation_trace,
            finalized_at,
            finalized_by_user_id
          )
          values
            (${randomUUID()}, ${organizationId}, ${propertyId}, ${sharedLeaseAId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 10000, 10000, 0, 600, 600, 0, 600, '[{"pool_name":"CAM","total_recovery":"400"},{"pool_name":"Tax","total_recovery":"200"}]'::jsonb, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${organizationId}, ${propertyId}, ${sharedLeaseBId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 10000, 10000, 0, 400, 400, 0, 400, '[{"pool_name":"CAM","total_recovery":"400"}]'::jsonb, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${organizationId}, ${propertyId}, ${soloLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 10000, 10000, 0, 900, 900, 0, 900, '[{"pool_name":"CAM","total_recovery":"900"}]'::jsonb, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${organizationId}, ${propertyId}, ${draftLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'draft', 10000, 10000, 0, 300, 300, 0, 300, '[{"pool_name":"CAM","total_recovery":"300"}]'::jsonb, '[]'::jsonb, null, null),
            (${randomUUID()}, ${otherOrganizationId}, ${otherPropertyId}, ${otherLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 10000, 10000, 0, 999, 999, 0, 999, '[{"pool_name":"CAM","total_recovery":"999"}]'::jsonb, '[]'::jsonb, now(), null)
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
            pool_id,
            source_type
          )
          values
            (${randomUUID()}, ${organizationId}, ${propertyId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'Shared Tenant', 1200.00, null, 'manual'),
            (${randomUUID()}, ${organizationId}, ${propertyId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'Solo Tenant', 700.00, ${camPoolId}, 'manual'),
            (${blankBilledId}, ${organizationId}, ${propertyId}, ${PERIOD_START}::date, ${PERIOD_END}::date, '', 75.00, null, 'manual'),
            (${randomUUID()}, ${otherOrganizationId}, ${otherPropertyId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'Hidden Tenant', 8888.00, null, 'manual')
        `;
      })
      .catch(async (error) => {
        await cleanupDisposableLocalAccount(sql, {
          userId,
          organizationId,
          otherOrganizationId,
          organizationName,
          otherOrganizationName,
          signupOrganizationId,
          signupOrganizationName,
          propertyId,
          otherPropertyId,
        });
        await assertCleanupComplete(sql, {
          userId,
          organizationId,
          otherOrganizationId,
          organizationName,
          otherOrganizationName,
          signupOrganizationId,
          signupOrganizationName,
          propertyId,
          otherPropertyId,
        });
        fail(
          `Failed to seed local comparison E2E records: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  } finally {
    await sql.end({ timeout: 5 });
  }

  const account = {
    organizationId,
    otherOrganizationId,
    organizationName,
    otherOrganizationName,
    signupOrganizationId,
    signupOrganizationName,
    propertyId,
    otherPropertyId,
    soloLeaseId,
    draftLeaseId,
    camPoolId,
    blankBilledId,
    userId,
  };
  const token =
    signupBody.session?.access_token ??
    (await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: signupEmail,
      password: signupPassword,
    }));
  if (!token) {
    const cleanupSql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupDisposableLocalAccount(cleanupSql, account);
      await assertCleanupComplete(cleanupSql, account);
    } finally {
      await cleanupSql.end({ timeout: 5 });
    }
    fail("Local Supabase signup seed could not mint a password token.");
  }

  return {
    ...account,
    token,
  };
}

async function cleanupDisposableLocalAccount(sql, account) {
  await sql`
    delete from comparison_findings
    where comparison_run_id in (
      select id
      from comparison_runs
      where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
    )
  `;
  await sql`
    delete from comparison_runs
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from actual_billed_amounts
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from reconciliation_snapshots
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from leases
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from units
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from expense_pools
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from properties
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from subscriptions
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from signup_email_events
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"}
       or user_id = ${account.userId}
  `;
  await sql`
    delete from legal_acceptances
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"}
       or user_id = ${account.userId}
  `;
  await sql`
    delete from audit_log
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"}
       or changed_by = ${account.userId}
  `;
  await sql`
    delete from users
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or id = ${account.userId}
  `;
  await sql`
    delete from organizations
    where id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  if (account.signupOrganizationId) {
    await sql`
      delete from organizations
      where id = ${account.signupOrganizationId}
    `;
  }
  if (account.signupOrganizationName) {
    await sql`
      delete from organizations
      where name = ${account.signupOrganizationName}
        and not exists (
          select 1
          from users
          where users.organization_id = organizations.id
        )
    `;
  }
  await sql`
    delete from auth.users
    where id = ${account.userId}
  `;
}

async function assertCleanupComplete(sql, account) {
  const rows = await sql`
    select
      (select count(*)::int from comparison_findings where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as comparison_findings,
      (select count(*)::int from comparison_runs where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as comparison_runs,
      (select count(*)::int from actual_billed_amounts where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as actual_billed_amounts,
      (select count(*)::int from reconciliation_snapshots where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as reconciliation_snapshots,
      (select count(*)::int from leases where property_id in (${account.propertyId}, ${account.otherPropertyId})) as leases,
      (select count(*)::int from units where property_id in (${account.propertyId}, ${account.otherPropertyId})) as units,
      (select count(*)::int from expense_pools where property_id in (${account.propertyId}, ${account.otherPropertyId})) as expense_pools,
      (select count(*)::int from properties where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as properties,
      (select count(*)::int from subscriptions where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as subscriptions,
      (select count(*)::int from signup_email_events where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or user_id = ${account.userId}) as signup_email_events,
      (select count(*)::int from legal_acceptances where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or user_id = ${account.userId}) as legal_acceptances,
      (select count(*)::int from audit_log where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or changed_by = ${account.userId}) as audit_log,
      (select count(*)::int from users where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or id = ${account.userId}) as public_users,
      (select count(*)::int from organizations where id in (${account.organizationId}, ${account.otherOrganizationId}) or id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or name in (${account.organizationName}, ${account.otherOrganizationName}, ${account.signupOrganizationName ?? "__comparison_e2e_no_signup_org__"})) as organizations,
      (select count(*)::int from auth.users where id = ${account.userId}) as auth_users
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

function assertComparison(body, expected) {
  assertExactKeys(body, COMPARISON_KEYS, "comparison response");
  assert(
    body.property_id === expected.propertyId,
    "comparison property mismatch",
  );
  assert(
    body.period_start === PERIOD_START,
    "comparison period start mismatch",
  );
  assert(body.period_end === PERIOD_END, "comparison period end mismatch");
  assert(body.tolerance === "0.01", "comparison tolerance mismatch");
  assert(Array.isArray(body.tenants), "comparison tenants should be an array");
  assert(
    body.total_capveri_correct === expected.totalCorrect,
    `total correct mismatch: ${body.total_capveri_correct}`,
  );
  assert(
    body.total_actual_charged === expected.totalActual,
    `total actual mismatch: ${body.total_actual_charged}`,
  );
  assert(
    body.total_net_variance === expected.netVariance,
    `net variance mismatch: ${body.total_net_variance}`,
  );
  assert(
    body.total_overcharge === expected.totalOvercharge,
    `overcharge total mismatch: ${body.total_overcharge}`,
  );
  assert(
    body.total_undercharge === expected.totalUndercharge,
    `undercharge total mismatch: ${body.total_undercharge}`,
  );
  assert(
    body.overcharge_count === expected.overchargeCount,
    `overcharge count mismatch: ${body.overcharge_count}`,
  );
  assert(
    body.undercharge_count === expected.underchargeCount,
    `undercharge count mismatch: ${body.undercharge_count}`,
  );
  assert(
    body.match_count === expected.matchCount,
    `match count mismatch: ${body.match_count}`,
  );
}

function assertRunSummary(run, expected) {
  assertExactKeys(run, RUN_SUMMARY_KEYS, "comparison run summary");
  assertUuid(run.id, "comparison run id");
  assertIsoTimestamp(run.created_at, "comparison run created_at");
  assert(run.source === expected.source, "comparison run source mismatch");
  assert(
    run.created_by === expected.createdBy,
    "comparison run creator mismatch",
  );
  assertComparison(comparisonFieldsFromRun(run), expected);
}

function assertStoredRun(run, expected) {
  assertExactKeys(run, STORED_RUN_KEYS, "stored comparison run");
  assertRunSummary(runSummaryFromStoredRun(run), expected);
  assert(
    Array.isArray(run.findings),
    "stored comparison run findings should be an array",
  );
  assert(
    run.findings.length === expected.findingCount,
    "stored comparison run finding count mismatch",
  );
}

async function assertComparisonNegativePaths(input) {
  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/comparison/${input.account.propertyId}?period_start=${PERIOD_END}&period_end=${PERIOD_START}`,
        { headers: input.authHeaders, status: 400 },
      ),
    {
      detail: "period_start must be before period_end",
      error: {
        code: "invalid_period",
        message: "period_start must be before period_end",
      },
    },
    "comparison invalid period",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/comparison/${input.account.propertyId}`,
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
    "comparison missing period",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/comparison/${input.account.propertyId}?period_start=${PERIOD_START}&period_end=${PERIOD_END}&tolerance=-0.01`,
        { headers: input.authHeaders, status: 422 },
      ),
    {
      detail: "request: Expected non-negative decimal string",
      error: {
        code: "validation_error",
        message: "request: Expected non-negative decimal string",
      },
    },
    "comparison negative tolerance",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/comparison/${input.account.propertyId}/runs?limit=0&offset=0`,
        { headers: input.authHeaders, status: 422 },
      ),
    {
      detail: "limit is invalid",
      error: {
        code: "invalid_query_parameter",
        message: "limit is invalid",
      },
    },
    "comparison invalid limit",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/comparison/${input.account.propertyId}`,
        {
          method: "POST",
          headers: input.authHeaders,
          status: 400,
          body: "{not-json",
        },
      ),
    {
      detail: "Request body must be valid JSON",
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON",
      },
    },
    "comparison malformed json",
  );

  await expectError(
    () =>
      expectJson(
        `${input.baseUrl}/api/v1/comparison/runs/00000000-0000-4000-8000-000000000001`,
        { headers: input.authHeaders, status: 404 },
      ),
    {
      detail: "Comparison run not found",
      error: {
        code: "comparison_run_not_found",
        message: "Comparison run not found",
      },
    },
    "comparison missing run",
  );
}

function assertTenant(body, expected) {
  const tenants = body.tenants;
  assert(Array.isArray(tenants), "expected comparison tenants array");
  const tenant = tenants.find(
    (candidate) => candidate.lease_id === expected.leaseId,
  );
  assert(tenant, `missing tenant ${expected.leaseId}`);
  assertExactKeys(tenant, TENANT_KEYS, `tenant ${expected.leaseId}`);
  if (expected.tenantName !== undefined) {
    assert(tenant.tenant_name === expected.tenantName, "tenant name mismatch");
  }
  if (expected.correct !== undefined) {
    assert(
      tenant.capveri_correct === expected.correct,
      "tenant correct mismatch",
    );
  }
  if (expected.charged !== undefined) {
    assert(
      tenant.actual_charged === expected.charged,
      "tenant charged mismatch",
    );
  }
  if (expected.variance !== undefined) {
    assert(tenant.variance === expected.variance, "tenant variance mismatch");
  }
  if (expected.direction !== undefined) {
    assert(
      tenant.direction === expected.direction,
      "tenant direction mismatch",
    );
  }
  if (expected.variancePct !== undefined) {
    assert(tenant.variance_pct === expected.variancePct, "tenant pct mismatch");
  }
  if (expected.poolId !== undefined) {
    const pool = tenant.pool_breakdowns?.find(
      (candidate) => candidate.pool_id === expected.poolId,
    );
    assert(pool, "tenant pool breakdown missing");
    assertExactKeys(pool, POOL_BREAKDOWN_KEYS, "tenant pool breakdown");
    assert(pool.pool_name === "CAM", "tenant pool name mismatch");
    assert(pool.capveri_correct === expected.correct, "pool correct mismatch");
    assert(pool.actual_charged === expected.charged, "pool charged mismatch");
    assert(pool.variance === expected.poolVariance, "pool variance mismatch");
    assert(pool.direction === expected.direction, "pool direction mismatch");
    assert(pool.abs_variance === expected.poolAbsVariance, "pool abs mismatch");
    assert(pool.variance_pct === expected.variancePct, "pool pct mismatch");
  } else {
    assert(
      tenant.pool_breakdowns === null || Array.isArray(tenant.pool_breakdowns),
      "tenant pool breakdown shape mismatch",
    );
  }
}

function comparisonFieldsFromRun(run) {
  return {
    property_id: run.property_id,
    period_start: run.period_start,
    period_end: run.period_end,
    tolerance: run.tolerance,
    tenants: [],
    total_capveri_correct: run.total_capveri_correct,
    total_actual_charged: run.total_actual_charged,
    total_net_variance: run.total_net_variance,
    total_overcharge: run.total_overcharge,
    total_undercharge: run.total_undercharge,
    overcharge_count: run.overcharge_count,
    undercharge_count: run.undercharge_count,
    match_count: run.match_count,
  };
}

function runSummaryFromStoredRun(run) {
  return Object.fromEntries(RUN_SUMMARY_KEYS.map((key) => [key, run[key]]));
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-comparison-e2e-"));
  const path = resolve(directory, ".dev.vars.local-comparison-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-comparison-e2e-signing-secret",
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
    await delay(500);
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await delay(250);
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }
    const trimmed = arg.slice(2);
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex >= 0) {
      parsed[trimmed.slice(0, equalsIndex)] = trimmed.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[trimmed] = next;
      index += 1;
    } else {
      parsed[trimmed] = "true";
    }
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
  return url.origin;
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
  return rawUrl;
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

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} should be a UUID`,
  );
}

function assertIsoTimestamp(value, label) {
  assert(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label} should be a parseable timestamp`,
  );
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
