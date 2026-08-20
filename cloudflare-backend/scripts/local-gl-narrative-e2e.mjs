import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8849";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const SUPABASE_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const PERIOD_YEAR = 2026;
const FEATURE_KEY = "ai_gl_narrative_analysis";
const UUID_SENTINEL = "00000000-0000-4000-8000-000000000000";
const TEXT_SENTINEL = "__local_gl_narrative_e2e_none__";
const POST_RESPONSE_KEYS = ["gl_entry_count", "result"];
const ANALYSIS_ROW_KEYS = [
  "analysis_markdown",
  "created_at",
  "dismissed_at",
  "dismissed_by_user_id",
  "id",
  "organization_id",
  "period_year",
  "property_id",
  "ran_at",
  "ran_by_user_id",
  "token_input",
  "token_output",
];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) {
    fail("Refusing to run local GL narrative E2E in CI.");
  }

  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local GL narrative E2E always owns ${DEFAULT_BASE_URL}`);
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
    fail("OPENROUTER_API_KEY is required for local GL narrative E2E");
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
      `Local GL narrative Worker close failed after scenario failure: ${errorMessage(closeError)}`,
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
  let analysisId;
  let runError;
  let cleanupError;
  let runResult;

  try {
    const created = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.visiblePropertyId,
          period_year: PERIOD_YEAR,
        }),
      },
    );

    assert(created && typeof created === "object", "POST body missing");
    assertExactKeys(created, POST_RESPONSE_KEYS, "POST body");
    assert(
      created.gl_entry_count === account.visibleGlEntryCount,
      "POST returned GL count outside visible seed",
    );
    const result = created.result;
    assertAnalysisRowShape(result, "POST result");
    analysisId = result.id;
    assert(
      result.organization_id === account.owner.organizationId,
      "analysis org mismatch",
    );
    assert(
      result.property_id === account.visiblePropertyId,
      "analysis property mismatch",
    );
    assert(result.period_year === PERIOD_YEAR, "analysis year mismatch");
    assert(result.token_input > 0, "token_input should be positive");
    assert(result.token_output === 0, "token_output should stay zero");
    assert(
      result.ran_by_user_id === account.owner.userId,
      "ran_by_user_id mismatch",
    );
    assertNonEmptyMarkdown(result.analysis_markdown);
    assertMarkdownContract(result.analysis_markdown);
    assertMarkdownCoverage(result.analysis_markdown, account);
    assert(result.dismissed_at === null, "POST result dismissed_at mismatch");
    assert(
      result.dismissed_by_user_id === null,
      "POST result dismissed_by_user_id mismatch",
    );

    const dbRow = await findAnalysis(sql, analysisId);
    assertAnalysisRowShape(dbRow, "DB analysis row");
    assertAnalysisRowParity(dbRow, result, "DB analysis row");
    assert(
      dbRow.organization_id === account.owner.organizationId,
      "DB analysis org mismatch",
    );
    assert(
      dbRow.property_id === account.visiblePropertyId,
      "DB analysis property mismatch",
    );
    assert(dbRow.period_year === PERIOD_YEAR, "DB analysis year mismatch");
    assert(
      dbRow.analysis_markdown === result.analysis_markdown,
      "persisted markdown mismatch",
    );
    assertHiddenMarkersAbsent(dbRow.analysis_markdown, account);

    const featureUse = await pollFeatureUse(sql, {
      organizationId: account.owner.organizationId,
      minUsageCount: 1,
    });
    assert(
      featureUse.feature_key === FEATURE_KEY,
      "feature usage key mismatch",
    );

    const latest = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAnalysisRowShape(latest, "GET latest row");
    assert(latest?.id === analysisId, "GET latest id mismatch");
    assertAnalysisRowParity(latest, dbRow, "GET latest row");

    const hiddenLatest = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: hiddenHeaders, status: 200 },
    );
    assert(hiddenLatest === null, "hidden owner saw visible analysis");

    const hiddenPost = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({
          property_id: account.hiddenPropertyId,
          period_year: PERIOD_YEAR,
        }),
      },
    );
    assertJsonEqual(
      hiddenPost,
      {
        detail: `Property ${account.hiddenPropertyId} not found`,
        error: {
          code: "property_not_found",
          message: `Property ${account.hiddenPropertyId} not found`,
        },
      },
      "hidden property POST error",
    );

    const viewerPost = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative`,
      {
        method: "POST",
        headers: viewerHeaders,
        status: 403,
        body: JSON.stringify({
          property_id: account.visiblePropertyId,
          period_year: PERIOD_YEAR,
        }),
      },
    );
    assertJsonEqual(
      viewerPost,
      {
        detail: "Insufficient permissions",
        error: {
          code: "insufficient_permissions",
          message: "Insufficient permissions",
        },
      },
      "viewer POST error",
    );

    const viewerDismiss = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative/${analysisId}/dismiss`,
      {
        method: "POST",
        headers: viewerHeaders,
        status: 403,
      },
    );
    assertJsonEqual(
      viewerDismiss,
      {
        detail: "Insufficient permissions",
        error: {
          code: "insufficient_permissions",
          message: "Insufficient permissions",
        },
      },
      "viewer dismiss error",
    );

    const noAccessPost = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({
          property_id: account.noAccessPropertyId,
          period_year: PERIOD_YEAR,
        }),
      },
    );
    assertJsonEqual(
      noAccessPost,
      {
        detail:
          "subscription_required: An active subscription or trial is required.",
        error: {
          code: "subscription_required",
          message:
            "subscription_required: An active subscription or trial is required.",
        },
      },
      "no-access POST error",
    );

    const dismissed = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative/${analysisId}/dismiss`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
      },
    );
    assertAnalysisRowShape(dismissed, "dismiss response");
    assert(dismissed.id === analysisId, "dismissed row id mismatch");
    assert(dismissed.dismissed_at !== null, "dismissed_at missing");
    assert(
      dismissed.dismissed_by_user_id === account.owner.userId,
      "dismissed_by_user_id mismatch",
    );
    assertAnalysisRowParity(
      {
        ...result,
        dismissed_at: dismissed.dismissed_at,
        dismissed_by_user_id: dismissed.dismissed_by_user_id,
      },
      dismissed,
      "dismiss response",
    );

    const dismissedDbRow = await findAnalysis(sql, analysisId);
    assertAnalysisRowShape(dismissedDbRow, "DB dismissed row");
    assertAnalysisRowParity(dismissedDbRow, dismissed, "DB dismissed row");
    assert(dismissedDbRow.dismissed_at !== null, "DB dismissed_at missing");
    assert(
      dismissedDbRow.dismissed_by_user_id === account.owner.userId,
      "DB dismissed_by_user_id mismatch",
    );

    const latestAfterDismiss = await expectJson(
      `${input.baseUrl}/api/v1/analysis/gl-narrative/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(
      latestAfterDismiss === null,
      "GET latest should be null after dismiss",
    );

    runResult = {
      index: input.index,
      organization_id: account.owner.organizationId,
      property_id: account.visiblePropertyId,
      analysis_id: analysisId,
      visible_gl_entry_count: account.visibleGlEntryCount,
      feature_usage_count: featureUse.usage_count,
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
      `Local GL narrative cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return runResult;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const ids = {
    visiblePropertyId: randomUUID(),
    hiddenPropertyId: randomUUID(),
    noAccessPropertyId: randomUUID(),
    visibleImportBatchId: randomUUID(),
    hiddenImportBatchId: randomUUID(),
    noAccessImportBatchId: randomUUID(),
    operatingPoolId: randomUUID(),
    capitalPoolId: randomUUID(),
    hiddenPoolId: randomUUID(),
    noAccessPoolId: randomUUID(),
  };
  const propertyName = `Local GL Narrative Tower ${suffix}`;
  const hiddenMarker = `HIDDEN-GL-LEAK-${suffix}`;
  const visibleMarkers = [
    "7100",
    "Metro Roof Systems",
    "HOU-02",
    "Parking Restore LLC",
    "Civic Janitorial",
    "Utility refund credit",
  ];
  const hiddenMarkers = [
    hiddenMarker,
    "Hidden Vendor Sentinel",
    "9999-HIDDEN",
    "Hidden property roof marker",
  ];
  const created = [];
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });

  try {
    const owner = await createLocalAuthUser(input, {
      created,
      email: `gl-narrative-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local GL Narrative Owner",
      organizationName: `Local GL Narrative Org ${suffix}`,
      role: "owner",
    });
    created.push(owner);

    const viewer = await createLocalAuthUser(input, {
      created,
      email: `gl-narrative-viewer-${suffix}@capveri.local`,
      password: `ViewerPass${input.index}A1!`,
      fullName: "Local GL Narrative Viewer",
      organizationName: `Local GL Narrative Viewer Org ${suffix}`,
      role: "viewer",
      effectiveOrganizationId: owner.organizationId,
    });
    created.push(viewer);

    const hidden = await createLocalAuthUser(input, {
      created,
      email: `gl-narrative-hidden-${suffix}@capveri.local`,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local GL Narrative Hidden Owner",
      organizationName: `Local GL Narrative Hidden Org ${suffix}`,
      role: "owner",
    });
    created.push(hidden);

    const noAccess = await createLocalAuthUser(input, {
      created,
      email: `gl-narrative-no-access-${suffix}@capveri.local`,
      password: `NoAccessPass${input.index}A1!`,
      fullName: "Local GL Narrative No Access Owner",
      organizationName: `Local GL Narrative No Access Org ${suffix}`,
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
      await insertProperty(transaction, {
        id: ids.visiblePropertyId,
        organizationId: owner.organizationId,
        name: propertyName,
        address: "100 Local GL Way",
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        organizationId: hidden.organizationId,
        name: `Hidden GL Narrative Plaza ${suffix}`,
        address: "200 Hidden GL Way",
      });
      await insertProperty(transaction, {
        id: ids.noAccessPropertyId,
        organizationId: noAccess.organizationId,
        name: `No Access GL Narrative Plaza ${suffix}`,
        address: "300 No Access GL Way",
      });
      await insertImportBatch(transaction, {
        id: ids.visibleImportBatchId,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        fileName: `gl-narrative-visible-${suffix}.csv`,
        fileHash: shaLike(`visible-${suffix}`),
        rowCount: 5,
      });
      await insertImportBatch(transaction, {
        id: ids.hiddenImportBatchId,
        organizationId: hidden.organizationId,
        propertyId: ids.hiddenPropertyId,
        fileName: `gl-narrative-hidden-${suffix}.csv`,
        fileHash: shaLike(`hidden-${suffix}`),
        rowCount: 2,
      });
      await insertImportBatch(transaction, {
        id: ids.noAccessImportBatchId,
        organizationId: noAccess.organizationId,
        propertyId: ids.noAccessPropertyId,
        fileName: `gl-narrative-no-access-${suffix}.csv`,
        fileHash: shaLike(`no-access-${suffix}`),
        rowCount: 1,
      });
      await transaction`
        insert into expense_pools (id, property_id, name, pool_type, is_gross_up_applicable, gross_up_target, description)
        values
          (${ids.operatingPoolId}, ${ids.visiblePropertyId}, 'Operating CAM', 'operating', true, 0.9500, 'Local GL narrative operating pool'),
          (${ids.capitalPoolId}, ${ids.visiblePropertyId}, 'Capital Review', 'capital', false, null, 'Local GL narrative capital review pool'),
          (${ids.hiddenPoolId}, ${ids.hiddenPropertyId}, 'Hidden Pool', 'operating', true, 0.9500, ${hiddenMarker}),
          (${ids.noAccessPoolId}, ${ids.noAccessPropertyId}, 'No Access Pool', 'operating', true, 0.9500, 'No access entitlement fixture')
      `;
      await transaction`
        insert into gl_entries (
          import_batch_id, property_id, account_code, account_description,
          amount, transaction_date, period_year, period_month,
          vendor_name, description, raw_row_data
        )
        values
          (${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '7100', 'Roof repairs and replacements', 42000.00, '2026-02-15', ${PERIOD_YEAR}, 2, 'Metro Roof Systems', 'Full roof replacement capital-like item for local GL narrative', ${transaction.json({ local_gl_narrative_e2e: suffix, marker: "roof" })}),
          (${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '7200', 'Parking lot repairs', 18500.00, '2026-05-21', ${PERIOD_YEAR}, 5, 'Parking Restore LLC', 'Parking lot resurfacing near west garage', ${transaction.json({ local_gl_narrative_e2e: suffix, marker: "parking" })}),
          (${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6100', 'Janitorial services', 3200.00, '2026-06-01', ${PERIOD_YEAR}, 6, 'Civic Janitorial', 'Normal monthly janitorial service', ${transaction.json({ local_gl_narrative_e2e: suffix, marker: "janitorial" })}),
          (${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6400', 'Utilities', -850.00, '2026-07-10', ${PERIOD_YEAR}, 7, 'Grid Utility Co', 'Utility refund credit from prior meter overpayment', ${transaction.json({ local_gl_narrative_e2e: suffix, marker: "refund" })}),
          (${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6999', 'Miscellaneous repairs', 2750.00, '2026-08-19', ${PERIOD_YEAR}, 8, 'HOU-02 Vendor Services', 'HOU-02 wrong property invoice should be reversed', ${transaction.json({ local_gl_narrative_e2e: suffix, marker: "wrong-property" })}),
          (${ids.hiddenImportBatchId}, ${ids.hiddenPropertyId}, '9999-HIDDEN', 'Hidden property roof marker', 99999.00, '2026-03-15', ${PERIOD_YEAR}, 3, 'Hidden Vendor Sentinel', ${hiddenMarker}, ${transaction.json({ local_gl_narrative_e2e: suffix, hidden: true })}),
          (${ids.hiddenImportBatchId}, ${ids.hiddenPropertyId}, '8888-HIDDEN', 'Hidden property utility marker', 88888.00, '2026-04-15', ${PERIOD_YEAR}, 4, 'Hidden Utility Sentinel', ${`Hidden property roof marker ${hiddenMarker}`}, ${transaction.json({ local_gl_narrative_e2e: suffix, hidden: true })}),
          (${ids.noAccessImportBatchId}, ${ids.noAccessPropertyId}, '6000', 'No access janitorial', 1200.00, '2026-01-15', ${PERIOD_YEAR}, 1, 'No Access Vendor', 'No access entitlement fixture', ${transaction.json({ local_gl_narrative_e2e: suffix, no_access: true })})
      `;
    });

    return {
      ...ids,
      suffix,
      owner,
      viewer,
      hidden,
      noAccess,
      propertyName,
      visibleMarkers,
      hiddenMarkers,
      visibleGlEntryCount: 5,
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
    await cleanupPartialSeed(sql, {
      ...ids,
      created,
    });
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
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

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.name}, ${input.address},
      'Houston', 'TX', '77002', 100000, 90000, 10000, 0.9500
    )
  `;
}

async function insertImportBatch(sql, input) {
  await sql`
    insert into import_batches (
      id, organization_id, property_id, file_name, file_hash,
      source_system, status, row_count, error_count, error_log
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.propertyId},
      ${input.fileName}, ${input.fileHash}, 'generic', 'completed',
      ${input.rowCount}, 0, '[]'::jsonb
    )
  `;
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
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-gl-narrative-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-gl-narrative-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-gl-narrative-e2e-signing-secret",
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

async function findAnalysis(sql, analysisId) {
  const rows = await sql`
    select
      id,
      organization_id,
      property_id,
      period_year,
      analysis_markdown,
      token_input,
      token_output,
      ran_at::text as ran_at,
      ran_by_user_id,
      dismissed_at::text as dismissed_at,
      dismissed_by_user_id,
      created_at::text as created_at
    from gl_analysis_results
    where id = ${analysisId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function pollFeatureUse(sql, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await sql`
      select feature_key, usage_count
      from feature_usage_events
      where organization_id = ${input.organizationId}
        and feature_key = ${FEATURE_KEY}
      limit 1
    `;
    const row = rows[0];
    if (row && row.usage_count >= input.minUsageCount) {
      return row;
    }
    await sleep(100);
  }
  fail("feature_usage_events row was not recorded");
}

async function cleanupPartialAuthUser(databaseUrl, user) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, {
      cleanupOrganizationIds: [],
      cleanupUserIds: user.userId ? [user.userId] : [],
      cleanupEmails: [user.email],
      cleanupOrganizationNames: [user.organizationName],
      visiblePropertyId: UUID_SENTINEL,
      hiddenPropertyId: UUID_SENTINEL,
      noAccessPropertyId: UUID_SENTINEL,
      visibleImportBatchId: UUID_SENTINEL,
      hiddenImportBatchId: UUID_SENTINEL,
      noAccessImportBatchId: UUID_SENTINEL,
      operatingPoolId: UUID_SENTINEL,
      capitalPoolId: UUID_SENTINEL,
      hiddenPoolId: UUID_SENTINEL,
      noAccessPoolId: UUID_SENTINEL,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function cleanupPartialSeed(sql, input) {
  await cleanupGeneratedRows(sql, {
    cleanupOrganizationIds: uniqueStrings(
      input.created.flatMap((account) => [
        account.organizationId,
        account.signupOrganizationId,
      ]),
    ),
    cleanupUserIds: input.created.map((account) => account.userId),
    cleanupEmails: input.created.map((account) => account.email),
    cleanupOrganizationNames: input.created.map(
      (account) => account.organizationName,
    ),
    visiblePropertyId: input.visiblePropertyId,
    hiddenPropertyId: input.hiddenPropertyId,
    noAccessPropertyId: input.noAccessPropertyId,
    visibleImportBatchId: input.visibleImportBatchId,
    hiddenImportBatchId: input.hiddenImportBatchId,
    noAccessImportBatchId: input.noAccessImportBatchId,
    operatingPoolId: input.operatingPoolId,
    capitalPoolId: input.capitalPoolId,
    hiddenPoolId: input.hiddenPoolId,
    noAccessPoolId: input.noAccessPoolId,
  });
}

async function cleanupGeneratedRows(sql, account) {
  const orgIds = nonEmpty(account.cleanupOrganizationIds, UUID_SENTINEL);
  const userIds = nonEmpty(account.cleanupUserIds, UUID_SENTINEL);
  const emails = nonEmpty(account.cleanupEmails, TEXT_SENTINEL);
  const orgNames = nonEmpty(account.cleanupOrganizationNames, TEXT_SENTINEL);
  const propertyIds = [
    account.visiblePropertyId,
    account.hiddenPropertyId,
    account.noAccessPropertyId,
  ].filter(Boolean);
  const importBatchIds = [
    account.visibleImportBatchId,
    account.hiddenImportBatchId,
    account.noAccessImportBatchId,
  ].filter(Boolean);
  const poolIds = [
    account.operatingPoolId,
    account.capitalPoolId,
    account.hiddenPoolId,
    account.noAccessPoolId,
  ].filter(Boolean);
  const rowIds = uniqueStrings([...propertyIds, ...importBatchIds, ...poolIds]);

  await sql.begin(async (transaction) => {
    await transaction`
      delete from feature_usage_events
      where organization_id in ${transaction(orgIds)}
        and feature_key = ${FEATURE_KEY}
    `;
    await transaction`
      delete from gl_analysis_results
      where organization_id in ${transaction(orgIds)}
         or property_id in ${transaction(nonEmpty(propertyIds, UUID_SENTINEL))}
    `;
    await transaction`
      delete from gl_entries
      where import_batch_id in ${transaction(nonEmpty(importBatchIds, UUID_SENTINEL))}
         or property_id in ${transaction(nonEmpty(propertyIds, UUID_SENTINEL))}
    `;
    await transaction`
      delete from expense_pools
      where id in ${transaction(nonEmpty(poolIds, UUID_SENTINEL))}
         or property_id in ${transaction(nonEmpty(propertyIds, UUID_SENTINEL))}
    `;
    await transaction`
      delete from import_batches
      where id in ${transaction(nonEmpty(importBatchIds, UUID_SENTINEL))}
         or organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from properties
      where id in ${transaction(nonEmpty(propertyIds, UUID_SENTINEL))}
         or organization_id in ${transaction(orgIds)}
    `;
    await transaction`
      delete from subscriptions
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
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(orgIds)}
         or changed_by in ${transaction(userIds)}
         or row_id in ${transaction(nonEmpty(rowIds, UUID_SENTINEL))}
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
      account.hiddenImportBatchId,
      account.noAccessImportBatchId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const poolIds = nonEmpty(
    [
      account.operatingPoolId,
      account.capitalPoolId,
      account.hiddenPoolId,
      account.noAccessPoolId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const rowIds = uniqueStrings([...propertyIds, ...importBatchIds, ...poolIds]);

  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)}) as property_count,
      (select count(*)::int from import_batches where id in ${sql(importBatchIds)} or organization_id in ${sql(orgIds)}) as import_batch_count,
      (select count(*)::int from gl_entries where import_batch_id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as gl_entry_count,
      (select count(*)::int from expense_pools where id in ${sql(poolIds)} or property_id in ${sql(propertyIds)}) as expense_pool_count,
      (select count(*)::int from gl_analysis_results where organization_id in ${sql(orgIds)} or property_id in ${sql(propertyIds)}) as gl_analysis_count,
      (select count(*)::int from feature_usage_events where organization_id in ${sql(orgIds)}) as feature_usage_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_event_count,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)} or row_id in ${sql(nonEmpty(rowIds, UUID_SENTINEL))}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.import_batch_count === 0, "cleanup left import batches");
  assert(row.gl_entry_count === 0, "cleanup left GL entries");
  assert(row.expense_pool_count === 0, "cleanup left expense pools");
  assert(row.gl_analysis_count === 0, "cleanup left GL analysis results");
  assert(row.feature_usage_count === 0, "cleanup left feature usage events");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
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
        `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = text ? parseJsonResponse(text, url) : null;
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

function assertAnalysisRowShape(row, label) {
  assert(row && typeof row === "object", `${label} missing`);
  assertExactKeys(row, ANALYSIS_ROW_KEYS, label);
  assertUuid(row.id, `${label}.id`);
  assertUuid(row.organization_id, `${label}.organization_id`);
  assertUuid(row.property_id, `${label}.property_id`);
  assert(
    row.period_year === PERIOD_YEAR,
    `${label}.period_year expected ${PERIOD_YEAR}`,
  );
  assertNonEmptyMarkdown(row.analysis_markdown);
  assert(
    Number.isSafeInteger(row.token_input) && row.token_input > 0,
    `${label}.token_input should be a positive integer`,
  );
  assert(row.token_output === 0, `${label}.token_output should be 0`);
  assertParseableIso(row.ran_at, `${label}.ran_at`);
  assertUuid(row.ran_by_user_id, `${label}.ran_by_user_id`);
  if (row.dismissed_at !== null) {
    assertParseableIso(row.dismissed_at, `${label}.dismissed_at`);
  }
  if (row.dismissed_by_user_id !== null) {
    assertUuid(row.dismissed_by_user_id, `${label}.dismissed_by_user_id`);
  }
  assertParseableIso(row.created_at, `${label}.created_at`);
}

function assertAnalysisRowParity(actual, expected, label) {
  for (const key of ANALYSIS_ROW_KEYS) {
    assert(
      actual[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(actual[key])}`,
    );
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assert(value && typeof value === "object", `${label} missing`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assertJsonEqual(actual, expected, `${label} keys`);
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
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  assert(
    !Number.isNaN(Date.parse(value)),
    `${label} should be parseable timestamp: ${value}`,
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

function assertNonEmptyMarkdown(markdown) {
  assert(typeof markdown === "string", "analysis markdown missing");
  assert(markdown.trim().length > 0, "analysis markdown empty");
}

function assertMarkdownContract(markdown) {
  const trimmed = markdown.trim();
  assert(
    trimmed.startsWith("## CAM GL Analysis"),
    `analysis markdown should start with CAM GL Analysis heading: ${markdown.slice(0, 200)}`,
  );
  assert(
    !trimmed.startsWith("{") && !trimmed.startsWith("["),
    "analysis markdown should not be wrapped in JSON",
  );
  assert(
    !markdown.includes("```"),
    "analysis markdown should not be wrapped in fenced code blocks",
  );

  const requiredHeadings = [
    "### CapEx/OpEx Classification Issues",
    "### CAM Audit Risks",
    "### Non-Recoverable Expense Flags",
    "### Entity Co-Mingling Flags",
    "### Recommendations",
    "### Summary",
  ];
  let previousIndex = -1;
  for (const heading of requiredHeadings) {
    const firstIndex = markdown.indexOf(heading);
    assert(firstIndex >= 0, `analysis markdown missing heading: ${heading}`);
    assert(
      markdown.indexOf(heading, firstIndex + heading.length) === -1,
      `analysis markdown repeated heading: ${heading}`,
    );
    assert(
      firstIndex > previousIndex,
      `analysis markdown heading out of order: ${heading}`,
    );
    previousIndex = firstIndex;
  }
}

function assertMarkdownCoverage(markdown, account) {
  const text = markdown.toLowerCase();
  assert(
    text.includes(account.propertyName.toLowerCase()),
    "analysis markdown title missed property name",
  );
  assert(
    text.includes(String(PERIOD_YEAR)),
    "analysis markdown title missed period year",
  );
  const materialCoverage = [
    {
      label: "roof replacement capital review",
      needles: ["7100", "roof", "replacement", "capital"],
    },
    {
      label: "parking resurfacing review",
      needles: ["7200", "parking", "resurfacing"],
    },
    {
      label: "utility refund credit",
      needles: ["6400", "credit"],
    },
    {
      label: "wrong-property anomaly",
      needles: ["6999", "hou-02", "wrong property", "reversed"],
    },
  ];
  for (const group of materialCoverage) {
    const missing = group.needles.filter((needle) => !text.includes(needle));
    assert(
      missing.length === 0,
      `analysis markdown missed ${group.label} cues (${missing.join(", ")}): ${markdown.slice(0, 1200)}`,
    );
  }
  assert(
    ["42000", "42,000", "$42,000"].some((needle) => text.includes(needle)),
    "analysis markdown missed roof replacement amount",
  );
  assert(
    ["2750", "2,750", "$2,750"].some((needle) => text.includes(needle)),
    "analysis markdown missed wrong-property amount",
  );
  assertHiddenMarkersAbsent(markdown, account);
}

function assertHiddenMarkersAbsent(markdown, account) {
  for (const marker of account.hiddenMarkers) {
    assert(!markdown.includes(marker), `analysis markdown leaked ${marker}`);
  }
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
  if (!isLoopbackHost(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  if (!url.port) fail(`${label} must include an explicit loopback port`);
  url.pathname = url.pathname.replace(/\/+$/u, "");
  if (
    label === "supabase-url" &&
    (url.port !== "54321" || (url.pathname !== "" && url.pathname !== "/"))
  ) {
    fail(
      "supabase-url must be the local Supabase API at http://127.0.0.1:54321",
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
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
  if (!isLoopbackHost(url.hostname)) {
    fail("database-url must point at localhost or loopback");
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
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value !== ""),
    ),
  ];
}

function nonEmpty(values, sentinel) {
  const unique = uniqueStrings(values);
  return unique.length > 0 ? unique : [sentinel];
}

function shaLike(value) {
  return Buffer.from(value).toString("hex").padEnd(64, "0").slice(0, 64);
}

function redactSensitiveUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.toString();
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
