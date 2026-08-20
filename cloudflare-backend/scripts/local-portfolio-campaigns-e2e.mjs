import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8840";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const PERIOD_YEAR = 2026;
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-12-31";
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
    fail(`local portfolio/campaigns E2E always owns ${DEFAULT_BASE_URL}`);
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
    fail("Refusing to run local portfolio/campaigns E2E in CI.");
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
      `Local portfolio/campaigns Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedDisposableLocalAccount(input);
  const authHeaders = { authorization: `Bearer ${account.token}` };
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let result;
  let runError;

  try {
    const portfolio = await expectJson(
      `${input.baseUrl}/api/v1/portfolio/summary`,
      {
        headers: authHeaders,
        status: 200,
      },
    );
    assertPortfolioSummaryContract(portfolio, account);

    const campaigns = await expectJson(
      `${input.baseUrl}/api/v1/campaigns?year=${PERIOD_YEAR}`,
      { headers: authHeaders, status: 200 },
    );
    const [campaignA] = assertCampaignListContract(campaigns, account, {
      campaignAStatus: "finalized",
      campaignAAudit: {
        submitted_for_review_at: null,
        approved_at: null,
        sent_at: null,
      },
    });

    const submit = await expectJson(
      `${input.baseUrl}/api/v1/campaigns/${account.campaignAId}/submit-for-review`,
      { method: "POST", headers: authHeaders, status: 200 },
    );
    assertTransitionResponse(submit, account, "in_review", "submit");

    const approve = await expectJson(
      `${input.baseUrl}/api/v1/campaigns/${account.campaignAId}/approve`,
      { method: "POST", headers: authHeaders, status: 200 },
    );
    assertTransitionResponse(approve, account, "approved", "approve");

    const sent = await expectJson(
      `${input.baseUrl}/api/v1/campaigns/${account.campaignAId}/mark-sent`,
      { method: "POST", headers: authHeaders, status: 200 },
    );
    assertTransitionResponse(sent, account, "sent", "sent");

    const invalidTransition = await expectJson(
      `${input.baseUrl}/api/v1/campaigns/${account.campaignAId}/submit-for-review`,
      { method: "POST", headers: authHeaders, status: 409 },
    );
    assertTransitionErrorResponse(
      invalidTransition,
      "sent",
      "in_review",
      "invalid sent-to-review transition",
    );

    const afterTransitions = await expectJson(
      `${input.baseUrl}/api/v1/campaigns?year=${PERIOD_YEAR}`,
      { headers: authHeaders, status: 200 },
    );
    const transitionedCampaigns = assertCampaignListContract(
      afterTransitions,
      account,
      {
        campaignAStatus: "sent",
        campaignAAudit: {
          submitted_for_review_at: submit.transitioned_at,
          approved_at: approve.transitioned_at,
          sent_at: sent.transitioned_at,
        },
      },
    );

    const dbCampaign = await verifyCampaignRows(
      sql,
      account,
      transitionedCampaigns,
    );

    result = {
      run: input.index + 1,
      organization_id: account.organizationId,
      property_a_id: account.propertyAId,
      property_b_id: account.propertyBId,
      campaign_a_id: account.campaignAId,
      portfolio_total_leakage: portfolio.total_leakage,
      campaign_a_final_status: dbCampaign.status,
      campaign_a_total_recovery: campaignA.total_recovery,
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];
    try {
      await cleanupDisposableLocalAccount(sql, account);
      await assertCleanupComplete(sql, account);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      const cleanupMessage = cleanupErrors.map(errorMessage).join("; ");
      if (runError) {
        console.error(
          `Local portfolio/campaigns cleanup failed after scenario failure: ${cleanupMessage}`,
        );
      } else {
        fail(cleanupMessage);
      }
    }
  }

  if (runError) throw runError;
  if (result) return result;
  fail("Local portfolio/campaigns E2E ended without returning a result.");
}

async function cleanupDisposableLocalAccount(sql, account) {
  await sql`
    delete from reconciliation_campaigns
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
    where property_id in (${account.propertyAId}, ${account.propertyBId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from units
    where property_id in (${account.propertyAId}, ${account.propertyBId}, ${account.otherPropertyId})
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
      (select count(*)::int from reconciliation_campaigns where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as reconciliation_campaigns,
      (select count(*)::int from actual_billed_amounts where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as actual_billed_amounts,
      (select count(*)::int from reconciliation_snapshots where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as reconciliation_snapshots,
      (select count(*)::int from leases where property_id in (${account.propertyAId}, ${account.propertyBId}, ${account.otherPropertyId})) as leases,
      (select count(*)::int from units where property_id in (${account.propertyAId}, ${account.propertyBId}, ${account.otherPropertyId})) as units,
      (select count(*)::int from properties where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as properties,
      (select count(*)::int from subscriptions where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as subscriptions,
      (select count(*)::int from signup_email_events where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or user_id = ${account.userId}) as signup_email_events,
      (select count(*)::int from legal_acceptances where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or user_id = ${account.userId}) as legal_acceptances,
      (select count(*)::int from audit_log where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or changed_by = ${account.userId}) as audit_log,
      (select count(*)::int from users where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or id = ${account.userId}) as public_users,
      (select count(*)::int from organizations where id in (${account.organizationId}, ${account.otherOrganizationId}) or id = ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"} or name in (${account.organizationName}, ${account.otherOrganizationName}, ${account.signupOrganizationName ?? "__portfolio_campaigns_e2e_no_signup_org__"})) as organizations,
      (select count(*)::int from auth.users where id = ${account.userId}) as auth_users
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

function assertPortfolioSummaryContract(portfolio, account) {
  assertExactKeys(
    portfolio,
    [
      "period_year",
      "total_recoverable_cam",
      "total_leakage",
      "recovery_rate",
      "properties_with_leakage",
      "has_billing_data",
      "total_recovery_all_years",
      "properties",
    ],
    "portfolio summary",
  );
  assert(
    portfolio.period_year === PERIOD_YEAR,
    "portfolio latest year mismatch",
  );
  assert(
    portfolio.total_recoverable_cam === "1700",
    "portfolio recoverable CAM mismatch",
  );
  assert(portfolio.total_leakage === "800", "portfolio leakage mismatch");
  assert(
    portfolio.properties_with_leakage === 2,
    "portfolio leakage property count mismatch",
  );
  assert(
    portfolio.has_billing_data === true,
    "portfolio billing flag mismatch",
  );
  assert(
    portfolio.total_recovery_all_years === "2500",
    "portfolio all-years total mismatch",
  );
  assertClose(
    portfolio.recovery_rate,
    52.94117647058824,
    "portfolio recovery rate mismatch",
  );
  assertNoHiddenPortfolioMarkers(portfolio, account);
  assert(Array.isArray(portfolio.properties), "portfolio properties not array");
  assert(
    portfolio.properties.length === 2,
    "portfolio property count mismatch",
  );
  assertPortfolioPropertyRecord(
    portfolio.properties[0],
    {
      property_id: account.propertyBId,
      property_name: "Portfolio Campaign Beta",
      total_recoverable: "500",
      total_billed: "0",
      leakage: "500",
      recovery_rate: 0,
    },
    "portfolio property B",
  );
  assertPortfolioPropertyRecord(
    portfolio.properties[1],
    {
      property_id: account.propertyAId,
      property_name: "Portfolio Campaign Alpha",
      total_recoverable: "1200",
      total_billed: "900",
      leakage: "300",
      recovery_rate: 75,
    },
    "portfolio property A",
  );
}

function assertPortfolioPropertyRecord(actual, expected, label) {
  assertExactKeys(
    actual,
    [
      "property_id",
      "property_name",
      "total_recoverable",
      "total_billed",
      "leakage",
      "recovery_rate",
    ],
    label,
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    assert(
      actual[key] === expectedValue,
      `${label} ${key} mismatch: expected ${expectedValue}, got ${actual[key]}`,
    );
  }
}

function assertCampaignListContract(campaigns, account, options) {
  assert(Array.isArray(campaigns), "campaign list is not an array");
  assert(campaigns.length === 2, "campaign list count mismatch");
  assertNoHiddenPortfolioMarkers(campaigns, account);
  const expected = [
    {
      id: account.campaignAId,
      property_id: account.propertyAId,
      property_name: "Portfolio Campaign Alpha",
      period_year: PERIOD_YEAR,
      status: options.campaignAStatus,
      tenant_count: 3,
      finalized_tenant_count: 2,
      total_recovery: "1600",
      finalized_at: "present",
      submitted_for_review_at: options.campaignAAudit.submitted_for_review_at,
      approved_at: options.campaignAAudit.approved_at,
      sent_at: options.campaignAAudit.sent_at,
      updated_at: "present",
    },
    {
      id: account.campaignBId,
      property_id: account.propertyBId,
      property_name: "Portfolio Campaign Beta",
      period_year: PERIOD_YEAR,
      status: "draft",
      tenant_count: 1,
      finalized_tenant_count: 1,
      total_recovery: "500",
      finalized_at: null,
      submitted_for_review_at: null,
      approved_at: null,
      sent_at: null,
      updated_at: "present",
    },
  ];

  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const normalized = expected.map((expectedCampaign, index) => {
    const actual = byId.get(expectedCampaign.id);
    assert(actual, `missing campaign ${expectedCampaign.id}`);
    assertCampaignRecord(actual, expectedCampaign, `campaign ${index + 1}`);
    return actual;
  });
  assert(
    byId.size === expected.length,
    `campaign list contained unexpected ids: ${campaigns.map((campaign) => campaign.id).join(",")}`,
  );
  return normalized;
}

function assertCampaignRecord(actual, expected, label) {
  assertExactKeys(
    actual,
    [
      "id",
      "property_id",
      "property_name",
      "period_year",
      "status",
      "tenant_count",
      "finalized_tenant_count",
      "total_recovery",
      "finalized_at",
      "submitted_for_review_at",
      "approved_at",
      "sent_at",
      "updated_at",
    ],
    label,
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue === "present") {
      assertTimestampString(actual[key], `${label} ${key}`);
      continue;
    }
    if (
      key === "submitted_for_review_at" ||
      key === "approved_at" ||
      key === "sent_at"
    ) {
      if (expectedValue === null) {
        assert(actual[key] === null, `${label} ${key} should be null`);
      } else {
        assertSameInstant(actual[key], expectedValue, `${label} ${key}`);
      }
      continue;
    }
    assert(
      actual[key] === expectedValue,
      `${label} ${key} mismatch: expected ${expectedValue}, got ${actual[key]}`,
    );
  }
}

function assertTransitionResponse(actual, account, status, label) {
  assertExactKeys(
    actual,
    ["id", "status", "transitioned_at", "transitioned_by_user_id"],
    `${label} transition`,
  );
  assert(actual.id === account.campaignAId, `${label} transition id mismatch`);
  assert(actual.status === status, `${label} transition status mismatch`);
  assertTimestampString(
    actual.transitioned_at,
    `${label} transition timestamp`,
  );
  assert(
    actual.transitioned_by_user_id === account.userId,
    `${label} transition user mismatch`,
  );
}

function assertTransitionErrorResponse(
  actual,
  currentStatus,
  targetStatus,
  label,
) {
  const allowedList = currentStatus === "sent" ? "none" : "[]";
  const message =
    `Cannot transition campaign from '${currentStatus}' to '${targetStatus}'. ` +
    `Allowed transitions from '${currentStatus}': ${allowedList}.`;
  assertExactKeys(actual, ["detail"], label);
  assert(actual.detail === message, `${label} detail mismatch`);
}

async function verifyCampaignRows(sql, account, campaignRows) {
  const rows = await sql`
    select
      id,
      property_id,
      period_year,
      status,
      finalized_at::text as finalized_at,
      submitted_for_review_at::text as submitted_for_review_at,
      submitted_for_review_by_user_id,
      approved_at::text as approved_at,
      approved_by_user_id,
      sent_at::text as sent_at,
      sent_by_user_id,
      updated_at::text as updated_at
    from reconciliation_campaigns
    where organization_id = ${account.organizationId}
      and id in (${account.campaignAId}, ${account.campaignBId})
    order by updated_at desc
  `;
  assert(rows.length === 2, "campaign DB row count mismatch");
  const dbRowsById = new Map(rows.map((row) => [row.id, row]));

  for (const apiRow of campaignRows) {
    const dbRow = dbRowsById.get(apiRow.id);
    assert(dbRow, `missing DB campaign row ${apiRow.id}`);
    for (const key of ["id", "property_id", "period_year", "status"]) {
      assert(
        dbRow[key] === apiRow[key],
        `campaign DB/API ${key} mismatch: expected ${apiRow[key]}, got ${dbRow[key]}`,
      );
    }
    for (const key of [
      "finalized_at",
      "submitted_for_review_at",
      "approved_at",
      "sent_at",
      "updated_at",
    ]) {
      if (apiRow[key] === null) {
        assert(dbRow[key] === null, `campaign DB/API ${key} should be null`);
      } else {
        assertSameInstant(dbRow[key], apiRow[key], `campaign DB/API ${key}`);
      }
    }
  }

  const row = dbRowsById.get(account.campaignAId);
  assert(row, "campaign A DB row missing");
  assert(row.status === "sent", "campaign DB status mismatch");
  assertTimestampString(row.submitted_for_review_at, "campaign submitted_at");
  assert(
    row.submitted_for_review_by_user_id === account.userId,
    "campaign submitted user mismatch",
  );
  assertTimestampString(row.approved_at, "campaign approved_at");
  assert(
    row.approved_by_user_id === account.userId,
    "campaign approved user mismatch",
  );
  assertTimestampString(row.sent_at, "campaign sent_at");
  assert(row.sent_by_user_id === account.userId, "campaign sent user mismatch");
  return row;
}

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `portfolio-campaigns-e2e-${runId}@capveri.com`;
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
  const propertyAId = randomUUID();
  const propertyBId = randomUUID();
  const otherPropertyId = randomUUID();
  const unitA1Id = randomUUID();
  const unitA2Id = randomUUID();
  const unitA3Id = randomUUID();
  const unitBId = randomUUID();
  const otherUnitId = randomUUID();
  const leaseA1Id = randomUUID();
  const leaseA2Id = randomUUID();
  const leaseA3Id = randomUUID();
  const leaseBId = randomUUID();
  const otherLeaseId = randomUUID();
  const campaignAId = randomUUID();
  const campaignBId = randomUUID();
  const otherCampaignId = randomUUID();
  const organizationName = `Local Portfolio Campaigns E2E Org ${runId}`;
  const otherOrganizationName = `Local Portfolio Campaigns Hidden Org ${runId}`;
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
          values (${userId}, ${organizationId}, ${signupEmail}, 'Local Portfolio Campaigns E2E', 'owner')
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
            (${propertyAId}, ${organizationId}, 'Portfolio Campaign Alpha', '100 Portfolio Way', 'Denver', 'CO', '80202', 50000, 45000, 5000, 0.95),
            (${propertyBId}, ${organizationId}, 'Portfolio Campaign Beta', '200 Portfolio Way', 'Denver', 'CO', '80202', 30000, 27000, 3000, 0.95),
            (${otherPropertyId}, ${otherOrganizationId}, 'Hidden Portfolio Property', '900 Hidden Way', 'Denver', 'CO', '80202', 25000, 22500, 2500, 0.95)
        `;
        await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${unitA1Id}, ${propertyAId}, 'A-100', 10000, 9000, 1, 'occupied'),
            (${unitA2Id}, ${propertyAId}, 'A-200', 15000, 13500, 2, 'occupied'),
            (${unitA3Id}, ${propertyAId}, 'A-300', 5000, 4500, 3, 'occupied'),
            (${unitBId}, ${propertyBId}, 'B-100', 7500, 6750, 1, 'occupied'),
            (${otherUnitId}, ${otherPropertyId}, 'H-100', 5000, 4500, 1, 'occupied')
        `;
        await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (${leaseA1Id}, ${propertyAId}, ${unitA1Id}, 'Alpha Retail', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${leaseA2Id}, ${propertyAId}, ${unitA2Id}, 'Beta Office', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${leaseA3Id}, ${propertyAId}, ${unitA3Id}, 'Gamma Draft', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${leaseBId}, ${propertyBId}, ${unitBId}, 'Delta Clinic', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
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
            calculation_trace,
            finalized_at,
            finalized_by_user_id
          )
          values
            (${randomUUID()}, ${organizationId}, ${propertyAId}, ${leaseA1Id}, '2025-01-01'::date, '2025-12-31'::date, 'finalized', 10000, 10000, 0, 800, 800, 0, 800, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${organizationId}, ${propertyAId}, ${leaseA1Id}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 10000, 10000, 0, 500, 500, 0, 500, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${organizationId}, ${propertyAId}, ${leaseA2Id}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 20000, 20000, 0, 700, 700, 0, 700, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${organizationId}, ${propertyAId}, ${leaseA3Id}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'draft', 4000, 4000, 0, 400, 400, 0, 400, '[]'::jsonb, null, null),
            (${randomUUID()}, ${organizationId}, ${propertyBId}, ${leaseBId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 9000, 9000, 0, 500, 500, 0, 500, '[]'::jsonb, now(), ${userId}),
            (${randomUUID()}, ${otherOrganizationId}, ${otherPropertyId}, ${otherLeaseId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'finalized', 9999, 9999, 0, 9999, 9999, 0, 9999, '[]'::jsonb, now(), null)
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
          values
            (${randomUUID()}, ${organizationId}, ${propertyAId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'Alpha Retail', 900.00, 'manual'),
            (${randomUUID()}, ${otherOrganizationId}, ${otherPropertyId}, ${PERIOD_START}::date, ${PERIOD_END}::date, 'Hidden Tenant', 8888.88, 'manual')
        `;
        await transaction`
          insert into reconciliation_campaigns (
            id,
            organization_id,
            property_id,
            period_year,
            status,
            finalized_at,
            finalized_by_user_id,
            updated_at
          )
          values
            (${campaignAId}, ${organizationId}, ${propertyAId}, ${PERIOD_YEAR}, 'finalized', now(), ${userId}, '2026-06-20T12:00:00Z'::timestamptz),
            (${campaignBId}, ${organizationId}, ${propertyBId}, ${PERIOD_YEAR}, 'draft', null, null, '2026-06-20T11:00:00Z'::timestamptz),
            (${otherCampaignId}, ${otherOrganizationId}, ${otherPropertyId}, ${PERIOD_YEAR}, 'finalized', now(), null, '2026-06-20T13:00:00Z'::timestamptz)
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
          propertyAId,
          propertyBId,
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
          propertyAId,
          propertyBId,
          otherPropertyId,
        });
        fail(
          `Failed to seed local portfolio/campaigns E2E records: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  } finally {
    await sql.end({ timeout: 5 });
  }

  let token;
  let tokenError;
  try {
    token =
      signupBody.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: signupEmail,
        password: signupPassword,
      }));
  } catch (error) {
    tokenError = error;
  }
  if (!token || tokenError) {
    const cleanupSql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupDisposableLocalAccount(cleanupSql, {
        userId,
        organizationId,
        otherOrganizationId,
        organizationName,
        otherOrganizationName,
        signupOrganizationId,
        signupOrganizationName,
        propertyAId,
        propertyBId,
        otherPropertyId,
      });
      await assertCleanupComplete(cleanupSql, {
        userId,
        organizationId,
        otherOrganizationId,
        organizationName,
        otherOrganizationName,
        signupOrganizationId,
        signupOrganizationName,
        propertyAId,
        propertyBId,
        otherPropertyId,
      });
    } finally {
      await cleanupSql.end({ timeout: 5 });
    }
    if (tokenError) throw tokenError;
    fail("Local Supabase signup seed could not mint a password token.");
  }

  return {
    token,
    organizationId,
    otherOrganizationId,
    organizationName,
    otherOrganizationName,
    signupOrganizationId,
    signupOrganizationName,
    propertyAId,
    propertyBId,
    otherPropertyId,
    campaignAId,
    campaignBId,
    otherCampaignId,
    userId,
  };
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
    resolve(tmpdir(), "capveri-portfolio-campaigns-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-portfolio-campaigns-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-portfolio-campaigns-e2e-signing-secret",
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

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertClose(actual, expected, message) {
  assert(
    typeof actual === "number" && Math.abs(actual - expected) <= 0.000001,
    `${message}: expected ${expected}, got ${actual}`,
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

function assertNoHiddenPortfolioMarkers(value, account) {
  const serialized = safeJson(value);
  for (const marker of [
    account.otherOrganizationId,
    account.otherPropertyId,
    account.otherCampaignId,
    account.otherOrganizationName,
    "Hidden Portfolio Property",
    "Hidden Tenant",
  ]) {
    assert(
      !serialized.includes(marker),
      `portfolio/campaign response leaked hidden marker ${marker}`,
    );
  }
}

function assertTimestampString(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `${label} is not a valid timestamp`);
}

function assertSameInstant(actual, expected, label) {
  if (actual === null || expected === null) {
    assert(actual === expected, `${label} null mismatch`);
    return;
  }
  assertTimestampString(actual, `${label} actual`);
  assertTimestampString(expected, `${label} expected`);
  assert(
    Date.parse(actual) === Date.parse(expected),
    `${label} mismatch: expected ${expected}, got ${actual}`,
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
