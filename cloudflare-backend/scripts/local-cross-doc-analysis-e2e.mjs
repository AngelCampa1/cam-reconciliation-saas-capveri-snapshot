import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8850";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const SUPABASE_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const PERIOD_YEAR = 2026;
const UUID_SENTINEL = "00000000-0000-4000-8000-000000000000";
const TEXT_SENTINEL = "__local_cross_doc_e2e_none__";
const ANALYSIS_RESULT_KEYS = [
  "property_id",
  "period_year",
  "findings",
  "lease_term_overrides",
  "overall_risk_score",
  "analysis_summary",
  "documents_analyzed",
  "token_usage",
];
const ANALYSIS_ROW_KEYS = [
  "id",
  "property_id",
  "period_year",
  "status",
  "findings",
  "finding_decisions",
  "token_usage",
];
const DB_ANALYSIS_ROW_KEYS = [
  "id",
  "organization_id",
  "property_id",
  "period_year",
  "status",
  "findings",
  "finding_decisions",
  "token_usage",
];
const REVIEW_RESPONSE_KEYS = ["status", "decision"];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) {
    fail("Refusing to run local Cross-Doc E2E in CI.");
  }

  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local Cross-Doc E2E always owns ${DEFAULT_BASE_URL}`);
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
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    SUPABASE_LOCAL_ANON_KEY;
  const openRouterApiKey =
    process.env.OPENROUTER_API_KEY ??
    (await readEnvValue(resolve(".dev.vars"), ["OPENROUTER_API_KEY"]));
  if (!openRouterApiKey) {
    fail("OPENROUTER_API_KEY is required for local Cross-Doc E2E");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
    openRouterApiKey,
  });
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
          openrouter: "real call via local Worker env",
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
      `Local Cross-Doc Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
  const viewerHeaders = jsonAuthHeaders(account.viewer.accessToken);
  const hiddenHeaders = jsonAuthHeaders(account.hidden.accessToken);
  const noAccessHeaders = jsonAuthHeaders(account.noAccess.accessToken);
  let runError;
  let cleanupError;
  let result;

  try {
    await expectJson(
      `${input.baseUrl}/api/v1/organizations/${account.owner.organizationId}/auditor-config`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          market: "Houston local E2E market",
          typical_management_fee_pct: "0.0500",
          known_vendor_patterns: ["LOCAL-CROSS-DOC-VENDOR"],
          custom_rules: ["Flag management fee spikes above local policy."],
        }),
      },
    );
    await assertOrgConfig(sql, account);

    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.visiblePropertyId}/auditor-overrides`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          known_exceptions: ["Lobby project is approved for 2026."],
          special_instructions: ["Compare admin fee against lease profile."],
          suppressed_finding_categories: ["lease_nuance"],
        }),
      },
    );
    await assertPropertyOverrides(sql, account);

    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.visiblePropertyId}/auditor-overrides`,
      {
        method: "PATCH",
        headers: viewerHeaders,
        status: 403,
        body: JSON.stringify({ known_exceptions: [] }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.hiddenPropertyId}/auditor-overrides`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({ known_exceptions: [] }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/organizations/${account.noAccess.organizationId}/auditor-config`,
      {
        method: "PATCH",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({ market: "No Access" }),
      },
    );

    const created = await expectJsonWithRetry(
      `${input.baseUrl}/api/v1/properties/${account.visiblePropertyId}/cross-doc-analysis`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 201,
        body: JSON.stringify({ period_year: PERIOD_YEAR }),
      },
      2,
    );
    assertAnalysisResultShape(created, account, "created");
    assert(
      created.property_id === account.visiblePropertyId,
      "POST property mismatch",
    );
    assert(created.period_year === PERIOD_YEAR, "POST year mismatch");
    assert(
      Number.isFinite(created.token_usage) && created.token_usage > 0,
      "token usage missing",
    );
    assert(
      typeof created.analysis_summary === "string",
      "analysis summary missing",
    );
    assertCrossDocAnalysisContract(created, account, "created");
    assertNoLeakage(created, account);

    const latest = await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.visiblePropertyId}/cross-doc-analysis/${PERIOD_YEAR}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAnalysisRowShape(latest, account, "latest");
    assert(typeof latest.id === "string", "latest analysis id missing");
    assert(
      latest.property_id === account.visiblePropertyId,
      "latest property mismatch",
    );
    assert(latest.period_year === PERIOD_YEAR, "latest year mismatch");
    assert(latest.token_usage > 0, "latest token usage missing");
    assertCrossDocAnalysisContract(latest, account, "latest");
    assertNoLeakage(latest, account);

    const dbRow = await findAnalysis(sql, latest.id);
    assert(dbRow, "DB analysis row missing");
    assertAnalysisRowShape(dbRow, account, "db row");
    assertAnalysisRowParity(latest, dbRow);
    assert(
      dbRow.organization_id === account.owner.organizationId,
      "DB org mismatch",
    );
    assert(
      dbRow.property_id === account.visiblePropertyId,
      "DB property mismatch",
    );
    assert(dbRow.token_usage > 0, "DB token usage missing");
    assertCrossDocAnalysisContract(dbRow, account, "db row");
    assertNoLeakage(dbRow, account);

    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.visiblePropertyId}/cross-doc-analysis/${PERIOD_YEAR}`,
      { headers: hiddenHeaders, status: 404 },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.hiddenPropertyId}/cross-doc-analysis`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({ period_year: PERIOD_YEAR }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.visiblePropertyId}/cross-doc-analysis`,
      {
        method: "POST",
        headers: viewerHeaders,
        status: 403,
        body: JSON.stringify({ period_year: PERIOD_YEAR }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/properties/${account.noAccessPropertyId}/cross-doc-analysis`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({ period_year: PERIOD_YEAR }),
      },
    );

    const selectedManagementFeeFinding = findManagementFeeFinding(
      latest.findings,
    );
    const findingId = selectedManagementFeeFinding?.id;
    assert(
      findingId,
      `provider did not return a source-backed management-fee finding with a UUID id: ${safeJson(latest.findings)}`,
    );
    assertManagementFeeFindingEvidence(selectedManagementFeeFinding);
    const reviewed = await expectJson(
      `${input.baseUrl}/api/v1/cross-doc-analysis/${latest.id}/findings/${findingId}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          decision: "accepted",
          reason: "Accepted by local Cross-Doc E2E",
        }),
      },
    );
    assertExactKeys(reviewed, REVIEW_RESPONSE_KEYS, "review response");
    assertJsonEqual(
      reviewed,
      { status: "ok", decision: "accepted" },
      "review response",
    );
    assert(reviewed.decision === "accepted", "review decision mismatch");
    await assertFindingDecision(
      sql,
      latest.id,
      findingId,
      account.owner.userId,
      "Accepted by local Cross-Doc E2E",
    );

    await expectJson(
      `${input.baseUrl}/api/v1/cross-doc-analysis/${latest.id}/findings/${randomUUID()}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({
          decision: "dismissed",
          reason: "missing finding",
        }),
      },
    );

    await expectJson(
      `${input.baseUrl}/api/v1/cross-doc-analysis/${latest.id}/findings/${randomUUID()}`,
      {
        method: "PATCH",
        headers: viewerHeaders,
        status: 403,
        body: JSON.stringify({ decision: "dismissed", reason: "viewer" }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/cross-doc-analysis/${latest.id}/findings/${randomUUID()}`,
      {
        method: "PATCH",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({ decision: "dismissed", reason: "no access" }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/cross-doc-analysis/${account.hiddenAnalysisId}/findings/${randomUUID()}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({ decision: "dismissed", reason: "hidden org" }),
      },
    );

    result = {
      index: input.index,
      analysis_id: latest.id,
      token_usage: latest.token_usage,
      decision_finding_id: findingId,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      try {
        await cleanupGeneratedRows(sql, account);
        await assertCleanupComplete(sql, account);
      } catch (error) {
        cleanupError = error;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  if (runError && cleanupError) {
    console.error(
      `Local Cross-Doc row cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    visiblePropertyId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    noAccessPropertyId: randomUUID(),
    visibleImportBatchId: randomUUID(),
    priorImportBatchId: randomUUID(),
    hiddenImportBatchId: randomUUID(),
    noAccessImportBatchId: randomUUID(),
    visibleLeaseId: randomUUID(),
    hiddenLeaseId: randomUUID(),
    visibleDocumentId: randomUUID(),
    hiddenDocumentId: randomUUID(),
    operatingPoolId: randomUUID(),
    taxPoolId: randomUUID(),
    hiddenPoolId: randomUUID(),
    hiddenAnalysisId: randomUUID(),
    glIds: {
      mgmt: randomUUID(),
      repair: randomUUID(),
      tax: randomUUID(),
      priorMgmt: randomUUID(),
      priorTax: randomUUID(),
      hidden: randomUUID(),
      noAccess: randomUUID(),
    },
  };
  const names = {
    visibleProperty: `Local Cross Doc Tower ${suffix}`,
    hiddenProperty: `HIDDEN-CROSS-DOC-PROPERTY-${suffix}`,
    noAccessProperty: `Local Cross Doc No Access ${suffix}`,
    hiddenVendor: `HIDDEN-CROSS-DOC-VENDOR-${suffix}`,
  };
  const emails = {
    owner: `cross-doc-e2e-owner-${suffix}@capveri.local`,
    viewer: `cross-doc-e2e-viewer-${suffix}@capveri.local`,
    hidden: `cross-doc-e2e-hidden-${suffix}@capveri.local`,
    noAccess: `cross-doc-e2e-no-access-${suffix}@capveri.local`,
  };
  const orgNames = {
    owner: `Local Cross Doc Org ${suffix}`,
    viewer: `Local Cross Doc Viewer Org ${suffix}`,
    hidden: `Local Cross Doc Hidden Org ${suffix}`,
    noAccess: `Local Cross Doc No Access Org ${suffix}`,
  };
  const created = [];
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });

  try {
    const owner = await createLocalAuthUser(input, {
      created,
      email: emails.owner,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local Cross Doc Owner",
      organizationName: orgNames.owner,
      role: "owner",
    });
    created.push(owner);

    const viewer = await createLocalAuthUser(input, {
      created,
      email: emails.viewer,
      password: `ViewerPass${input.index}A1!`,
      fullName: "Local Cross Doc Viewer",
      organizationName: orgNames.viewer,
      role: "viewer",
      effectiveOrganizationId: owner.organizationId,
    });
    created.push(viewer);

    const hidden = await createLocalAuthUser(input, {
      created,
      email: emails.hidden,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local Cross Doc Hidden Owner",
      organizationName: orgNames.hidden,
      role: "owner",
    });
    created.push(hidden);

    const noAccess = await createLocalAuthUser(input, {
      created,
      email: emails.noAccess,
      password: `NoAccessPass${input.index}A1!`,
      fullName: "Local Cross Doc No Access Owner",
      organizationName: orgNames.noAccess,
      role: "owner",
    });
    created.push(noAccess);

    await sql.begin(async (transaction) => {
      await transaction`
        insert into subscriptions (organization_id, plan, status, current_period_start, current_period_end)
        values
          (${owner.organizationId}, 'professional', 'active', now(), now() + interval '30 days'),
          (${hidden.organizationId}, 'professional', 'active', now(), now() + interval '30 days')
      `;
      await insertProperty(
        transaction,
        ids.visiblePropertyId,
        owner.organizationId,
        names.visibleProperty,
      );
      await insertProperty(
        transaction,
        ids.hiddenPropertyId,
        hidden.organizationId,
        names.hiddenProperty,
      );
      await insertProperty(
        transaction,
        ids.noAccessPropertyId,
        noAccess.organizationId,
        names.noAccessProperty,
      );
      await insertLease(
        transaction,
        ids.visibleLeaseId,
        ids.visiblePropertyId,
        "Anchor Tenant",
      );
      await insertLease(
        transaction,
        ids.hiddenLeaseId,
        ids.hiddenPropertyId,
        "Hidden Tenant",
      );
      await insertDocument(transaction, {
        id: ids.visibleDocumentId,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        leaseId: ids.visibleLeaseId,
        suffix,
        marker: "visible",
      });
      await insertDocument(transaction, {
        id: ids.hiddenDocumentId,
        organizationId: hidden.organizationId,
        propertyId: ids.hiddenPropertyId,
        leaseId: ids.hiddenLeaseId,
        suffix,
        marker: "hidden",
      });
      await insertImportBatch(
        transaction,
        ids.visibleImportBatchId,
        owner.organizationId,
        ids.visiblePropertyId,
        `visible-${suffix}`,
        3,
      );
      await insertImportBatch(
        transaction,
        ids.priorImportBatchId,
        owner.organizationId,
        ids.visiblePropertyId,
        `prior-${suffix}`,
        2,
      );
      await insertImportBatch(
        transaction,
        ids.hiddenImportBatchId,
        hidden.organizationId,
        ids.hiddenPropertyId,
        `hidden-${suffix}`,
        1,
      );
      await insertImportBatch(
        transaction,
        ids.noAccessImportBatchId,
        noAccess.organizationId,
        ids.noAccessPropertyId,
        `no-access-${suffix}`,
        1,
      );
      await insertPoolsAndMappings(transaction, ids);
      await insertGlEntries(transaction, ids, names);
      await transaction`
        insert into actual_billed_amounts (
          organization_id, property_id, period_start_date, period_end_date,
          lease_id, tenant_name, billed_amount, source_type, import_batch_id
        )
        values (
          ${owner.organizationId}, ${ids.visiblePropertyId}, '2026-01-01', '2026-12-31',
          ${ids.visibleLeaseId}, 'Anchor Tenant', 42000.00, 'manual', ${ids.visibleImportBatchId}
        )
      `;
      await transaction`
        insert into cross_doc_analyses (
          id, organization_id, property_id, period_year, status, findings, finding_decisions, token_usage
        )
        values (
          ${ids.hiddenAnalysisId}, ${hidden.organizationId}, ${ids.hiddenPropertyId}, ${PERIOD_YEAR},
          'pending', ${transaction.json({ findings: [{ id: randomUUID(), title: names.hiddenProperty }] })},
          '{}'::jsonb, 1
        )
      `;
    });

    return {
      ...ids,
      names,
      owner,
      viewer,
      hidden,
      noAccess,
      cleanupOrganizationIds: uniqueStrings([
        owner.organizationId,
        viewer.organizationId,
        viewer.signupOrganizationId,
        hidden.organizationId,
        noAccess.organizationId,
      ]),
      cleanupUserIds: [
        owner.userId,
        viewer.userId,
        hidden.userId,
        noAccess.userId,
      ],
      cleanupEmails: [owner.email, viewer.email, hidden.email, noAccess.email],
      cleanupOrganizationNames: [
        owner.organizationName,
        viewer.organizationName,
        hidden.organizationName,
        noAccess.organizationName,
      ],
    };
  } catch (error) {
    await cleanupGeneratedRows(
      sql,
      partialAccount(ids, names, created, {
        emails: Object.values(emails),
        organizationNames: Object.values(orgNames),
      }),
    );
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function partialAccount(ids, names, created, expected) {
  return {
    ...ids,
    names,
    cleanupOrganizationIds: uniqueStrings(
      created.flatMap((account) => [
        account.organizationId,
        account.signupOrganizationId,
      ]),
    ),
    cleanupUserIds: created.map((account) => account.userId),
    cleanupEmails: uniqueStrings([
      ...created.map((account) => account.email),
      ...(expected?.emails ?? []),
    ]),
    cleanupOrganizationNames: uniqueStrings([
      ...created.map((account) => account.organizationName),
      ...(expected?.organizationNames ?? []),
    ]),
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
  const partial =
    typeof userId === "string" && userId !== ""
      ? {
          ...profile,
          userId,
          organizationId: undefined,
          signupOrganizationId: undefined,
          accessToken: undefined,
        }
      : null;
  if (partial) created?.push(partial);
  try {
    assert(
      typeof userId === "string" && userId !== "",
      "signup user id missing",
    );

    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    let organizationId;
    try {
      await sql`
        update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now())
        where id = ${userId}
      `;
      await sql`
        update users
        set role = ${profile.role},
            full_name = ${profile.fullName},
            organization_id = coalesce(${profile.effectiveOrganizationId ?? null}, organization_id),
            updated_at = now()
        where id = ${userId}
      `;
      const rows = await sql`
        select organization_id
        from users
        where id = ${userId}
        limit 1
      `;
      organizationId = rows[0]?.organization_id;
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

    return {
      ...profile,
      userId,
      organizationId: profile.effectiveOrganizationId ?? organizationId,
      signupOrganizationId: organizationId,
      accessToken,
    };
  } catch (error) {
    await cleanupPartialAuthUser(input.databaseUrl, {
      ...profile,
      userId: typeof userId === "string" ? userId : undefined,
    });
    throw error;
  }
}

async function cleanupPartialAuthUser(databaseUrl, user) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, {
      visiblePropertyId: UUID_SENTINEL,
      hiddenPropertyId: UUID_SENTINEL,
      noAccessPropertyId: UUID_SENTINEL,
      visibleImportBatchId: UUID_SENTINEL,
      priorImportBatchId: UUID_SENTINEL,
      hiddenImportBatchId: UUID_SENTINEL,
      noAccessImportBatchId: UUID_SENTINEL,
      visibleLeaseId: UUID_SENTINEL,
      hiddenLeaseId: UUID_SENTINEL,
      visibleDocumentId: UUID_SENTINEL,
      hiddenDocumentId: UUID_SENTINEL,
      operatingPoolId: UUID_SENTINEL,
      taxPoolId: UUID_SENTINEL,
      hiddenPoolId: UUID_SENTINEL,
      hiddenAnalysisId: UUID_SENTINEL,
      glIds: {},
      names: {},
      cleanupOrganizationIds: [],
      cleanupUserIds: user.userId ? [user.userId] : [],
      cleanupEmails: [user.email],
      cleanupOrganizationNames: [user.organizationName],
    });
  } finally {
    await sql.end({ timeout: 5 });
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
    try {
      await handle.close();
    } catch (closeError) {
      console.error(
        `Worker cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-cross-doc-e2e-"));
  const path = resolve(directory, ".dev.vars.local-cross-doc-e2e");
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
      `OPENROUTER_API_KEY=${input.openRouterApiKey}`,
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-cross-doc-e2e-signing-secret",
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
  env.OPENROUTER_API_KEY = input.openRouterApiKey;
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

async function insertProperty(sql, id, organizationId, name) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${id}, ${organizationId}, ${name}, '100 Cross Doc Way',
      'Houston', 'TX', '77002', 120000, 108000, 12000, 0.9400
    )
  `;
}

async function insertLease(sql, id, propertyId, tenantName) {
  await sql`
    insert into leases (
      id, property_id, tenant_name, start_date, end_date, status, recovery_profile
    )
    values (
      ${id}, ${propertyId}, ${tenantName}, '2024-01-01', '2028-12-31', 'active',
      ${sql.json({
        base_year: 2024,
        base_year_amount: "38000.00",
        gross_up_base_year: false,
        pro_rata_share: "0.25000000",
        cap_type: "none",
        cap_rate: null,
        admin_fee_percentage: "0.05000000",
        excluded_pools: [],
      })}
    )
  `;
}

async function insertDocument(sql, input) {
  await sql`
    insert into documents (
      id, organization_id, property_id, filename, storage_key, storage_bucket,
      content_type, file_size_bytes, document_type, status,
      extraction_result, processed_at, verified_at, lease_id
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.propertyId},
      ${`cross-doc-${input.marker}-${input.suffix}.pdf`},
      ${`local-cross-doc/${input.marker}/${input.suffix}.pdf`},
      'local-e2e', 'application/pdf', 2048, 'lease', 'completed',
      ${sql.json({ local_cross_doc_e2e: true })}, now(), now(), ${input.leaseId}
    )
  `;
}

async function insertImportBatch(
  sql,
  id,
  organizationId,
  propertyId,
  marker,
  rowCount,
) {
  await sql`
    insert into import_batches (
      id, organization_id, property_id, file_name, file_hash,
      source_system, status, row_count, error_count, error_log
    )
    values (
      ${id}, ${organizationId}, ${propertyId}, ${`cross-doc-${marker}.csv`},
      ${shaLike(marker)}, 'generic', 'completed', ${rowCount}, 0, '[]'::jsonb
    )
  `;
}

async function insertPoolsAndMappings(sql, ids) {
  await sql`
    insert into expense_pools (
      id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, description
    )
    values
      (${ids.operatingPoolId}, ${ids.visiblePropertyId}, 'Operating Expenses', 'operating', true, 0.9500, 'Local Cross-Doc operating pool'),
      (${ids.taxPoolId}, ${ids.visiblePropertyId}, 'Real Estate Taxes', 'tax', false, null, 'Local Cross-Doc tax pool'),
      (${ids.hiddenPoolId}, ${ids.hiddenPropertyId}, 'Hidden Expenses', 'operating', true, 0.9500, 'Hidden Cross-Doc pool')
  `;
  await sql`
    insert into pool_mappings (expense_pool_id, gl_account_pattern, allocation_percentage, priority)
    values
      (${ids.operatingPoolId}, '61%', 1.0000, 10),
      (${ids.taxPoolId}, '70%', 1.0000, 10),
      (${ids.hiddenPoolId}, '99%', 1.0000, 10)
  `;
}

async function insertGlEntries(sql, ids, names) {
  await sql`
    insert into gl_entries (
      id, import_batch_id, property_id, account_code, account_description,
      amount, transaction_date, period_year, period_month,
      vendor_name, description, raw_row_data
    )
    values
      (${ids.glIds.mgmt}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6100', 'Management fee', 18000.00, '2026-01-15', ${PERIOD_YEAR}, 1, 'LOCAL-CROSS-DOC-VENDOR Management', 'Management fee above expected ratio', ${sql.json({ local_cross_doc_e2e: true })}),
      (${ids.glIds.repair}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6110', 'Repairs and maintenance', 24000.00, '2026-02-15', ${PERIOD_YEAR}, 2, 'Metro Repair', 'Recoverable repair charge', ${sql.json({ local_cross_doc_e2e: true })}),
      (${ids.glIds.tax}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '7000', 'Real estate taxes', 36000.00, '2026-03-15', ${PERIOD_YEAR}, 3, 'County Tax Office', 'Tax bill', ${sql.json({ local_cross_doc_e2e: true })}),
      (${ids.glIds.priorMgmt}, ${ids.priorImportBatchId}, ${ids.visiblePropertyId}, '6100', 'Management fee', 12000.00, '2025-01-15', ${PERIOD_YEAR - 1}, 1, 'Prior Management', 'Prior year management fee', ${sql.json({ local_cross_doc_e2e: true })}),
      (${ids.glIds.priorTax}, ${ids.priorImportBatchId}, ${ids.visiblePropertyId}, '7000', 'Real estate taxes', 30000.00, '2025-03-15', ${PERIOD_YEAR - 1}, 3, 'Prior Tax Office', 'Prior year tax bill', ${sql.json({ local_cross_doc_e2e: true })}),
      (${ids.glIds.hidden}, ${ids.hiddenImportBatchId}, ${ids.hiddenPropertyId}, '9900', 'Hidden recoverable expense', 99999.00, '2026-01-15', ${PERIOD_YEAR}, 1, ${names.hiddenVendor}, ${names.hiddenProperty}, ${sql.json({ local_cross_doc_e2e: true, hidden: true })}),
      (${ids.glIds.noAccess}, ${ids.noAccessImportBatchId}, ${ids.noAccessPropertyId}, '6100', 'No access management', 5000.00, '2026-01-15', ${PERIOD_YEAR}, 1, 'No Access Vendor', 'No access fixture', ${sql.json({ local_cross_doc_e2e: true })})
  `;
}

async function assertOrgConfig(sql, account) {
  const rows = await sql`
    select auditor_config
    from organizations
    where id = ${account.owner.organizationId}
    limit 1
  `;
  const config = parseJsonColumn(rows[0]?.auditor_config);
  assert(
    config?.market === "Houston local E2E market",
    "org auditor config mismatch",
  );
}

async function assertPropertyOverrides(sql, account) {
  const rows = await sql`
    select auditor_overrides
    from properties
    where id = ${account.visiblePropertyId}
    limit 1
  `;
  const overrides = parseJsonColumn(rows[0]?.auditor_overrides);
  assert(
    Array.isArray(overrides?.special_instructions) &&
      overrides.special_instructions.includes(
        "Compare admin fee against lease profile.",
      ),
    "property auditor overrides mismatch",
  );
}

function parseJsonColumn(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

async function findAnalysis(sql, analysisId) {
  const rows = await sql`
    select id::text as id, organization_id::text as organization_id,
      property_id::text as property_id, period_year, status,
      findings, finding_decisions, token_usage
    from cross_doc_analyses
    where id = ${analysisId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function assertFindingDecision(
  sql,
  analysisId,
  findingId,
  userId,
  reason,
) {
  const row = await findAnalysis(sql, analysisId);
  const decisions = parseJsonColumn(row?.finding_decisions);
  const decision = decisions?.[findingId];
  assertExactKeys(
    decision,
    ["decision", "reason", "user_id", "decided_at"],
    "DB finding decision",
  );
  assert(
    decision?.decision === "accepted",
    `DB finding decision mismatch for ${findingId}: ${safeJson(decisions)}`,
  );
  assert(decision?.reason === reason, "DB finding decision reason mismatch");
  assert(decision?.user_id === userId, "DB finding decision user mismatch");
  assertParseableIso(decision?.decided_at, "DB finding decision decided_at");
}

async function cleanupGeneratedRows(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds, UUID_SENTINEL);
  const userIds = nonEmpty(account.cleanupUserIds, UUID_SENTINEL);
  const emails = nonEmpty(account.cleanupEmails, TEXT_SENTINEL);
  const orgNames = nonEmpty(account.cleanupOrganizationNames, TEXT_SENTINEL);
  const propertyIds = nonEmpty(
    [
      account.visiblePropertyId,
      account.hiddenPropertyId,
      account.noAccessPropertyId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const importBatchIds = nonEmpty(
    [
      account.visibleImportBatchId,
      account.priorImportBatchId,
      account.hiddenImportBatchId,
      account.noAccessImportBatchId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const leaseIds = nonEmpty(
    [account.visibleLeaseId, account.hiddenLeaseId].filter(Boolean),
    UUID_SENTINEL,
  );
  const documentIds = nonEmpty(
    [account.visibleDocumentId, account.hiddenDocumentId].filter(Boolean),
    UUID_SENTINEL,
  );
  const poolIds = nonEmpty(
    [account.operatingPoolId, account.taxPoolId, account.hiddenPoolId].filter(
      Boolean,
    ),
    UUID_SENTINEL,
  );
  const glEntryIds = nonEmpty(
    Object.values(account.glIds ?? {}),
    UUID_SENTINEL,
  );
  const propertyNames = nonEmpty(
    [
      account.names?.visibleProperty,
      account.names?.hiddenProperty,
      account.names?.noAccessProperty,
    ].filter(Boolean),
    TEXT_SENTINEL,
  );
  const rowIds = uniqueStrings([
    ...propertyIds,
    ...importBatchIds,
    ...leaseIds,
    ...documentIds,
    ...poolIds,
    ...glEntryIds,
    account.hiddenAnalysisId,
  ]);

  await sql.begin(async (transaction) => {
    await transaction`
      delete from cross_doc_analyses
      where organization_id in ${transaction(orgIds)}
         or property_id in ${transaction(propertyIds)}
         or id = ${account.hiddenAnalysisId ?? UUID_SENTINEL}
    `;
    await transaction`
      delete from actual_billed_amounts
      where organization_id in ${transaction(orgIds)}
         or property_id in ${transaction(propertyIds)}
         or lease_id in ${transaction(leaseIds)}
    `;
    await transaction`
      delete from pool_mappings
      where expense_pool_id in ${transaction(poolIds)}
    `;
    await transaction`
      delete from expense_pools
      where id in ${transaction(poolIds)}
         or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from documents
      where id in ${transaction(documentIds)}
         or organization_id in ${transaction(orgIds)}
         or property_id in ${transaction(propertyIds)}
         or lease_id in ${transaction(leaseIds)}
    `;
    await transaction`
      delete from gl_entries
      where id in ${transaction(glEntryIds)}
         or import_batch_id in ${transaction(importBatchIds)}
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
      delete from properties
      where id in ${transaction(propertyIds)}
         or organization_id in ${transaction(orgIds)}
         or name in ${transaction(propertyNames)}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from audit_credits
      where organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction(orgIds)}
         or user_id in ${transaction(userIds)}
         or email in ${transaction(emails)}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(orgIds)}
         or user_id in ${transaction(userIds)}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(orgIds)}
         or changed_by in ${transaction(userIds)}
         or row_id in ${transaction(nonEmpty(rowIds, UUID_SENTINEL))}
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
         or name in ${transaction(orgNames)}
    `;
  });
}

async function assertCleanupComplete(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds, UUID_SENTINEL);
  const userIds = nonEmpty(account.cleanupUserIds, UUID_SENTINEL);
  const emails = nonEmpty(account.cleanupEmails, TEXT_SENTINEL);
  const orgNames = nonEmpty(account.cleanupOrganizationNames, TEXT_SENTINEL);
  const propertyIds = nonEmpty(
    [
      account.visiblePropertyId,
      account.hiddenPropertyId,
      account.noAccessPropertyId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const importBatchIds = nonEmpty(
    [
      account.visibleImportBatchId,
      account.priorImportBatchId,
      account.hiddenImportBatchId,
      account.noAccessImportBatchId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const leaseIds = nonEmpty(
    [account.visibleLeaseId, account.hiddenLeaseId].filter(Boolean),
    UUID_SENTINEL,
  );
  const documentIds = nonEmpty(
    [account.visibleDocumentId, account.hiddenDocumentId].filter(Boolean),
    UUID_SENTINEL,
  );
  const poolIds = nonEmpty(
    [account.operatingPoolId, account.taxPoolId, account.hiddenPoolId].filter(
      Boolean,
    ),
    UUID_SENTINEL,
  );
  const glEntryIds = nonEmpty(
    Object.values(account.glIds ?? {}),
    UUID_SENTINEL,
  );
  const propertyNames = nonEmpty(
    [
      account.names?.visibleProperty,
      account.names?.hiddenProperty,
      account.names?.noAccessProperty,
    ].filter(Boolean),
    TEXT_SENTINEL,
  );

  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)} or name in ${sql(propertyNames)}) as property_count,
      (select count(*)::int from leases where id in ${sql(leaseIds)} or property_id in ${sql(propertyIds)}) as lease_count,
      (select count(*)::int from documents where id in ${sql(documentIds)} or organization_id in ${sql(orgIds)} or property_id in ${sql(propertyIds)} or lease_id in ${sql(leaseIds)}) as document_count,
      (select count(*)::int from import_batches where id in ${sql(importBatchIds)} or organization_id in ${sql(orgIds)}) as import_batch_count,
      (select count(*)::int from gl_entries where id in ${sql(glEntryIds)} or import_batch_id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as gl_entry_count,
      (select count(*)::int from expense_pools where id in ${sql(poolIds)} or property_id in ${sql(propertyIds)}) as expense_pool_count,
      (select count(*)::int from pool_mappings where expense_pool_id in ${sql(poolIds)}) as pool_mapping_count,
      (select count(*)::int from actual_billed_amounts where organization_id in ${sql(orgIds)} or property_id in ${sql(propertyIds)} or lease_id in ${sql(leaseIds)}) as actual_billed_count,
      (select count(*)::int from cross_doc_analyses where organization_id in ${sql(orgIds)} or property_id in ${sql(propertyIds)} or id = ${account.hiddenAnalysisId ?? UUID_SENTINEL}) as cross_doc_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(orgIds)}) as subscription_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_event_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptance_count,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.lease_count === 0, "cleanup left leases");
  assert(row.document_count === 0, "cleanup left documents");
  assert(row.import_batch_count === 0, "cleanup left import batches");
  assert(row.gl_entry_count === 0, "cleanup left GL entries");
  assert(row.expense_pool_count === 0, "cleanup left expense pools");
  assert(row.pool_mapping_count === 0, "cleanup left pool mappings");
  assert(row.actual_billed_count === 0, "cleanup left actual billed rows");
  assert(row.cross_doc_count === 0, "cleanup left Cross-Doc analyses");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.audit_log_count === 0, "cleanup left audit logs");
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = text ? parseJsonResponse(text, url) : null;
  if (response.status !== status) {
    maybeReportKnownBugs(response, body, fetchOptions.method ?? "GET", url);
    fail(
      `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

async function expectJsonWithRetry(url, options, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await expectJson(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function maybeReportKnownBugs(response, body, method, url) {
  const text = safeJson(body);
  if (
    response.status === 500 &&
    /has_full_access|function .* does not exist/iu.test(text)
  ) {
    fail(
      `PRODUCTION BUG: ${method} ${redactSensitiveUrl(url)} returned 500 while checking public.has_full_access($1). Response: ${text}`,
    );
  }
  if (
    response.status === 500 &&
    /pro_rata_share|base_year|column .* does not exist/iu.test(text)
  ) {
    fail(
      `PRODUCTION BUG: ${method} ${redactSensitiveUrl(url)} returned 500 while assembling lease recovery profile fields. Response: ${text}`,
    );
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function parseJsonResponse(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    fail(
      `Expected JSON from ${redactSensitiveUrl(url)}, received: ${text.slice(0, 500)}`,
    );
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
  if (!response.ok) return undefined;
  return body.access_token;
}

function findManagementFeeFinding(findingsBlob) {
  const normalized = parseJsonColumn(findingsBlob);
  const findings = Array.isArray(normalized?.findings)
    ? normalized.findings
    : [];
  for (const finding of findings) {
    if (
      typeof finding?.id === "string" &&
      isUuid(finding.id) &&
      isManagementFeeFinding(finding)
    ) {
      return finding;
    }
  }
  return undefined;
}

function assertCrossDocAnalysisContract(analysis, account, label) {
  const findingsBlob = normalizedCrossDocFindingsBlob(analysis);
  assert(
    findingsBlob && typeof findingsBlob === "object",
    `${label} findings should be a JSON object`,
  );
  assert(
    findingsBlob.property_id === account.visiblePropertyId,
    `${label} findings property_id mismatch`,
  );
  assert(
    findingsBlob.period_year === PERIOD_YEAR,
    `${label} findings period_year mismatch`,
  );
  assert(
    Array.isArray(findingsBlob.findings),
    `${label} findings array missing`,
  );
  assert(
    findingsBlob.findings.length > 0,
    `${label} should include at least one finding`,
  );
  assert(
    Array.isArray(findingsBlob.lease_term_overrides),
    `${label} lease_term_overrides should be an array`,
  );
  assert(
    Number.isFinite(Number(findingsBlob.overall_risk_score)) &&
      Number(findingsBlob.overall_risk_score) >= 0 &&
      Number(findingsBlob.overall_risk_score) <= 100,
    `${label} overall_risk_score should be 0-100`,
  );
  assert(
    typeof findingsBlob.analysis_summary === "string" &&
      findingsBlob.analysis_summary.trim().length >= 20,
    `${label} analysis_summary missing`,
  );
  if (analysis.analysis_summary !== undefined) {
    assert(
      analysis.analysis_summary === findingsBlob.analysis_summary,
      `${label} stored analysis_summary mismatch`,
    );
  }
  assert(
    findingsBlob.documents_analyzed &&
      Number(findingsBlob.documents_analyzed.leases) >= 1 &&
      Number(findingsBlob.documents_analyzed.gl_accounts) >= 3,
    `${label} documents_analyzed counts too low: ${safeJson(findingsBlob.documents_analyzed)}`,
  );
  const managementFinding = findManagementFeeFinding(findingsBlob);
  assert(
    managementFinding,
    `${label} missing source-backed management-fee finding`,
  );
  assertManagementFeeFindingEvidence(managementFinding);
  assertFindingsHaveStableShape(findingsBlob.findings, label);
}

function assertAnalysisResultShape(analysis, account, label) {
  assertExactKeys(analysis, ANALYSIS_RESULT_KEYS, label);
  assertJsonEqual(
    {
      property_id: analysis.property_id,
      period_year: analysis.period_year,
      token_usage_type: typeof analysis.token_usage,
      findings_is_array: Array.isArray(analysis.findings),
      lease_term_overrides_is_array: Array.isArray(
        analysis.lease_term_overrides,
      ),
      documents_analyzed_keys: Object.keys(analysis.documents_analyzed).sort(),
    },
    {
      property_id: account.visiblePropertyId,
      period_year: PERIOD_YEAR,
      token_usage_type: "number",
      findings_is_array: true,
      lease_term_overrides_is_array: true,
      documents_analyzed_keys: ["gl_accounts", "leases"],
    },
    `${label} result shape`,
  );
}

function assertAnalysisRowShape(row, account, label) {
  assertExactKeys(
    row,
    row.organization_id === undefined
      ? ANALYSIS_ROW_KEYS
      : DB_ANALYSIS_ROW_KEYS,
    label,
  );
  assertUuid(row.id, `${label} id`);
  assertJsonEqual(
    {
      property_id: row.property_id,
      period_year: row.period_year,
      status: row.status,
      finding_decisions: row.finding_decisions,
      token_usage_type: typeof row.token_usage,
    },
    {
      property_id: account.visiblePropertyId,
      period_year: PERIOD_YEAR,
      status: "pending",
      finding_decisions: {},
      token_usage_type: "number",
    },
    `${label} row summary`,
  );
}

function assertAnalysisRowParity(apiRow, dbRow) {
  assertJsonEqual(
    {
      id: apiRow.id,
      property_id: apiRow.property_id,
      period_year: apiRow.period_year,
      status: apiRow.status,
      findings: parseJsonColumn(apiRow.findings),
      finding_decisions: parseJsonColumn(apiRow.finding_decisions),
      token_usage: apiRow.token_usage,
    },
    {
      id: dbRow.id,
      property_id: dbRow.property_id,
      period_year: dbRow.period_year,
      status: dbRow.status,
      findings: parseJsonColumn(dbRow.findings),
      finding_decisions: parseJsonColumn(dbRow.finding_decisions),
      token_usage: dbRow.token_usage,
    },
    "latest API/DB analysis parity",
  );
}

function normalizedCrossDocFindingsBlob(analysis) {
  const parsedFindings = parseJsonColumn(analysis.findings);
  if (
    parsedFindings &&
    typeof parsedFindings === "object" &&
    !Array.isArray(parsedFindings) &&
    Array.isArray(parsedFindings.findings)
  ) {
    return parsedFindings;
  }
  return {
    property_id: analysis.property_id,
    period_year: analysis.period_year,
    findings: Array.isArray(parsedFindings) ? parsedFindings : [],
    lease_term_overrides: Array.isArray(analysis.lease_term_overrides)
      ? analysis.lease_term_overrides
      : [],
    overall_risk_score: analysis.overall_risk_score,
    analysis_summary: analysis.analysis_summary,
    documents_analyzed: analysis.documents_analyzed,
  };
}

function assertFindingsHaveStableShape(findings, label) {
  for (const [index, finding] of findings.entries()) {
    assert(
      typeof finding?.id === "string" && isUuid(finding.id),
      `${label} finding ${index} id should be UUID`,
    );
    assert(
      [
        "lease_nuance",
        "cross_doc_mismatch",
        "billing_anomaly",
        "term_override",
      ].includes(finding.category),
      `${label} finding ${index} category invalid: ${safeJson(finding.category)}`,
    );
    assert(
      ["info", "warning", "critical"].includes(finding.severity),
      `${label} finding ${index} severity invalid: ${safeJson(finding.severity)}`,
    );
    assert(
      typeof finding.title === "string" && finding.title.trim().length > 0,
      `${label} finding ${index} title missing`,
    );
    assert(
      typeof finding.detail === "string" && finding.detail.trim().length > 0,
      `${label} finding ${index} detail missing`,
    );
    assert(
      Array.isArray(finding.affected_leases),
      `${label} finding ${index} affected_leases should be an array`,
    );
    assert(
      Array.isArray(finding.affected_pools),
      `${label} finding ${index} affected_pools should be an array`,
    );
    assert(
      Array.isArray(finding.source_documents),
      `${label} finding ${index} source_documents should be an array`,
    );
  }
}

function assertManagementFeeFindingEvidence(finding) {
  assert(finding && typeof finding === "object", "management finding missing");
  assert(
    ["info", "warning", "critical"].includes(finding.severity),
    `management finding severity invalid: ${safeJson(finding.severity)}`,
  );
  assert(
    typeof finding.title === "string" && finding.title.trim().length >= 8,
    "management finding title missing",
  );
  assert(
    typeof finding.detail === "string" && finding.detail.trim().length >= 20,
    "management finding detail missing",
  );
  assert(
    Array.isArray(finding.source_documents) &&
      finding.source_documents.length > 0,
    `management finding missing source_documents: ${safeJson(finding)}`,
  );
  assert(
    finding.source_documents.some((source) => {
      const text = String(source).toLowerCase();
      return (
        text.includes("management") ||
        text.includes("gl") ||
        text.includes("lease") ||
        text.includes("auditor")
      );
    }),
    `management finding source_documents are not specific enough: ${safeJson(finding.source_documents)}`,
  );
  assert(
    finding.financial_impact_estimate !== undefined &&
      finding.financial_impact_estimate !== null,
    "management finding missing financial impact estimate",
  );
  const impact = Number(finding.financial_impact_estimate);
  assert(
    Number.isFinite(impact),
    `management finding financial impact should be numeric: ${safeJson(finding.financial_impact_estimate)}`,
  );
  if (
    finding.override_suggestion !== null &&
    finding.override_suggestion !== undefined
  ) {
    assert(
      typeof finding.override_suggestion === "object" &&
        !Array.isArray(finding.override_suggestion),
      "management finding override_suggestion should be object or null",
    );
  }
  if (finding.confidence !== undefined && finding.confidence !== null) {
    const confidence = Number(finding.confidence);
    assert(
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 100,
      `management finding confidence should be 0-100: ${safeJson(finding.confidence)}`,
    );
  }
}

function isManagementFeeFinding(finding) {
  const searchable = [
    finding.category,
    finding.title,
    finding.detail,
    finding.financial_impact_estimate,
    safeJson(finding.affected_pools),
    safeJson(finding.source_documents),
    safeJson(finding.override_suggestion),
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();
  return (
    searchable.includes("management") &&
    searchable.includes("fee") &&
    (searchable.includes("18000") ||
      searchable.includes("18,000") ||
      searchable.includes("spike") ||
      searchable.includes("above") ||
      searchable.includes("local-cross-doc-vendor"))
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
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
      .split(/\r?\n/u)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) continue;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, "");
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
  if (!isLoopbackHost(url.hostname))
    fail(`${label} must target localhost or loopback`);
  if (!url.port) fail(`${label} must include an explicit loopback port`);
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
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("database-url must be a valid URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    fail("database-url must use postgres/postgresql");
  }
  if (!isLoopbackHost(url.hostname)) {
    fail("database-url must target localhost or loopback");
  }
  if (url.port !== "54322" || url.pathname !== "/postgres") {
    fail(
      "database-url must target local Supabase Postgres on port 54322/postgres",
    );
  }
  return url.toString();
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function shaLike(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoLeakage(value, account) {
  const text = safeJson(value);
  for (const hidden of [
    account.names.hiddenProperty,
    account.names.hiddenVendor,
    account.hiddenPropertyId,
    account.glIds.hidden,
  ]) {
    assert(!text.includes(hidden), `response leaked hidden marker ${hidden}`);
  }
}

function nonEmpty(values, fallback) {
  const unique = uniqueStrings(values.filter(Boolean));
  return unique.length > 0 ? unique : [fallback];
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value !== ""),
    ),
  ];
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function redactSensitiveJson(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /token|password|secret|key/iu.test(key)
        ? "[redacted]"
        : redactSensitiveJson(entry),
    ]),
  );
}

function redactSensitiveUrl(url) {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (/token|password|secret|key/iu.test(key)) {
      parsed.searchParams.set(key, "[redacted]");
    }
  }
  return parsed.toString();
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  assertJsonEqual(
    Object.keys(actual).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertParseableIso(value, label) {
  assert(typeof value === "string", `${label} should be a string`);
  assert(!Number.isNaN(Date.parse(value)), `${label} should be parseable ISO`);
}

function assertUuid(value, label) {
  assert(isUuid(value), `${label} should be a UUID`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
