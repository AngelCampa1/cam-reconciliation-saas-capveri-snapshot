import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8847";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const SUPABASE_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const PERIOD_YEAR = 2026;
const UUID_SENTINEL = "00000000-0000-4000-8000-000000000000";
const TEXT_SENTINEL = "__local_capex_e2e_none__";
const CLASSIFY_RESPONSE_KEYS = [
  "flags_created",
  "gl_entries_scanned",
  "period_year",
  "property_id",
];
const SUMMARY_KEYS = [
  "confirmed_capex",
  "dismissed",
  "pending",
  "total",
  "total_flagged_amount",
];
const FLAG_ROW_KEYS = [
  "account_code",
  "account_description",
  "amount",
  "classifier_version",
  "confidence_score",
  "created_at",
  "description",
  "disposition",
  "flag_reason",
  "gl_entry_id",
  "id",
  "matched_pattern",
  "organization_id",
  "period_year",
  "property_id",
  "review_note",
  "reviewed_at",
  "reviewed_by_user_id",
  "rule_name",
  "transaction_date",
  "vendor_name",
];
const DB_FLAG_ROW_KEYS = FLAG_ROW_KEYS.filter(
  (key) =>
    ![
      "account_code",
      "account_description",
      "amount",
      "description",
      "transaction_date",
      "vendor_name",
    ].includes(key),
);

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) {
    fail("Refusing to run local CapEx E2E in CI.");
  }

  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local CapEx E2E always owns ${DEFAULT_BASE_URL}`);
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
      `Local CapEx Worker close failed after scenario failure: ${errorMessage(closeError)}`,
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
  const classifyBody = {
    property_id: account.visiblePropertyId,
    period_year: PERIOD_YEAR,
  };
  let runError;
  let cleanupError;
  let result;

  try {
    const classify = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-classify`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify(classifyBody),
      },
    );
    assertClassifyResponse(classify, {
      propertyId: account.visiblePropertyId,
      flagsCreated: 9,
      glEntriesScanned: 7,
    });
    assert(classify.gl_entries_scanned === 7, "GL scan count mismatch");
    assert(classify.flags_created === 9, "created flag count mismatch");

    const flagsAfterFirstRun = await loadFlags(sql, account);
    assert(flagsAfterFirstRun.length === 9, "DB flag count mismatch");
    assertRuleSet(flagsAfterFirstRun);
    assertExactFlagContracts(flagsAfterFirstRun, account, "DB flags");
    assertNoLeakage(flagsAfterFirstRun, account);

    const repeatClassify = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-classify`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify(classifyBody),
      },
    );
    assertClassifyResponse(repeatClassify, {
      propertyId: account.visiblePropertyId,
      flagsCreated: 9,
      glEntriesScanned: 7,
    });
    assert(
      repeatClassify.flags_created === 9,
      "repeat created flag count mismatch",
    );
    const flagsAfterRepeat = await loadFlags(sql, account);
    assert(
      flagsAfterRepeat.length === 9,
      "classification should be idempotent",
    );

    const viewerClassify = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-classify`,
      {
        method: "POST",
        headers: viewerHeaders,
        status: 403,
        body: JSON.stringify(classifyBody),
      },
    );
    assertPermissionError(viewerClassify, "viewer classify error");
    const noAccessClassify = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-classify`,
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
    assertSubscriptionError(noAccessClassify, "no-access classify error");
    const hiddenClassify = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-classify`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          property_id: account.hiddenPropertyId,
          period_year: PERIOD_YEAR,
        }),
      },
    );
    assertClassifyResponse(hiddenClassify, {
      propertyId: account.hiddenPropertyId,
      flagsCreated: 0,
      glEntriesScanned: 0,
    });
    assert(
      hiddenClassify.gl_entries_scanned === 0 &&
        hiddenClassify.flags_created === 0,
      "owner should not scan hidden org property",
    );

    const listed = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(listed.length === 9, "list flag count mismatch");
    assertListedFlagRows(listed, account, "listed flags");
    assertRuleSet(listed);
    assertExactFlagContracts(listed, account, "listed flags");
    assertNoLeakage(listed, account);

    const hiddenList = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: hiddenHeaders, status: 200 },
    );
    assert(hiddenList.length === 0, "hidden org saw visible flags");

    const pending = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${account.visiblePropertyId}/${PERIOD_YEAR}?disposition=pending`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(pending.length === 9, "pending filter mismatch");
    assertListedFlagRows(pending, account, "pending flags");

    const initialSummary = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-summary/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertExactKeys(initialSummary, SUMMARY_KEYS, "initial summary");
    assertSummary(initialSummary, {
      total: 9,
      pending: 9,
      confirmed: 0,
      dismissed: 0,
      totalFlaggedAmount: "260000.00",
    });

    const flagByRule = new Map(listed.map((flag) => [flag.rule_name, flag]));
    const confirmed = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${flagByRule.get("account_code_prefix").id}/review`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          disposition: "confirmed_capex",
          review_note: "Asset account confirmed in local E2E",
        }),
      },
    );
    assertFlagRowShape(confirmed, account, "confirmed review row");
    assert(
      confirmed.disposition === "confirmed_capex",
      "single review disposition mismatch",
    );
    assert(
      confirmed.reviewed_by_user_id === account.owner.userId,
      "review user mismatch",
    );

    const viewerReview = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${flagByRule.get("amount_threshold").id}/review`,
      {
        method: "POST",
        headers: viewerHeaders,
        status: 403,
        body: JSON.stringify({ disposition: "dismissed" }),
      },
    );
    assertPermissionError(viewerReview, "viewer review error");
    const noAccessReview = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${flagByRule.get("amount_threshold").id}/review`,
      {
        method: "POST",
        headers: noAccessHeaders,
        status: 402,
        body: JSON.stringify({ disposition: "dismissed" }),
      },
    );
    assertSubscriptionError(noAccessReview, "no-access review error");
    const hiddenReview = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${account.hiddenFlagId}/review`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({ disposition: "dismissed" }),
      },
    );
    assertCapexNotFoundError(
      hiddenReview,
      `CapEx flag ${account.hiddenFlagId} not found`,
      "hidden review error",
    );

    const dismissTargets = listed
      .filter((flag) => flag.rule_name !== "account_code_prefix")
      .map((flag) => flag.id);
    const mixedBulkFailure = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/bulk-review`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 404,
        body: JSON.stringify({
          flag_ids: [...dismissTargets, account.hiddenFlagId],
          disposition: "dismissed",
          review_note: "This mixed-org request must not partially mutate",
        }),
      },
    );
    assert(
      mixedBulkFailure?.error?.code === "capex_flag_not_found",
      "mixed bulk error code mismatch",
    );
    assertCapexNotFoundError(
      mixedBulkFailure,
      `CapEx flag(s) not found: ${account.hiddenFlagId}`,
      "mixed bulk error",
    );
    const afterMixedBulkFailure = await loadFlags(sql, account);
    const afterMixedBulkById = new Map(
      afterMixedBulkFailure.map((flag) => [flag.id, flag]),
    );
    for (const flagId of dismissTargets) {
      const flag = afterMixedBulkById.get(flagId);
      assert(flag, `mixed bulk removed visible flag ${flagId}`);
      assert(
        flag.disposition === "pending",
        `mixed bulk partially mutated visible flag ${flagId}`,
      );
      assert(
        flag.reviewed_at === null &&
          flag.reviewed_by_user_id === null &&
          flag.review_note === null,
        `mixed bulk wrote review metadata for visible flag ${flagId}`,
      );
    }

    const bulk = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/bulk-review`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          flag_ids: dismissTargets,
          disposition: "dismissed",
          review_note: "Batch dismissed in local E2E",
        }),
      },
    );
    assert(bulk.length === 8, "bulk review count mismatch");
    assertListedFlagRows(bulk, account, "bulk review rows");
    assert(
      bulk.every((flag) => flag.disposition === "dismissed"),
      "bulk review disposition mismatch",
    );

    const dismissed = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-flags/${account.visiblePropertyId}/${PERIOD_YEAR}?disposition=dismissed`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(dismissed.length === 8, "dismissed filter mismatch");
    assertListedFlagRows(dismissed, account, "dismissed flags");

    const finalSummary = await expectJson(
      `${input.baseUrl}/api/v1/analysis/capex-summary/${account.visiblePropertyId}/${PERIOD_YEAR}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertExactKeys(finalSummary, SUMMARY_KEYS, "final summary");
    assertSummary(finalSummary, {
      total: 9,
      pending: 0,
      confirmed: 1,
      dismissed: 8,
      totalFlaggedAmount: "260000.00",
    });

    await assertDbReviewState(sql, account);

    result = {
      index: input.index,
      organization_id: account.owner.organizationId,
      property_id: account.visiblePropertyId,
      flags: 9,
      total_flagged_amount: finalSummary.total_flagged_amount,
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
      `Local CapEx cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
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
    hiddenImportBatchId: randomUUID(),
    noAccessImportBatchId: randomUUID(),
    glIds: {
      highAmount: randomUUID(),
      keyword: randomUUID(),
      assetCode: randomUUID(),
      vendor: randomUUID(),
      combo: randomUUID(),
      credit: randomUUID(),
      quiet: randomUUID(),
      hidden: randomUUID(),
      noAccess: randomUUID(),
    },
    hiddenFlagId: randomUUID(),
  };
  const names = {
    visibleProperty: `Local CapEx Tower ${suffix}`,
    hiddenProperty: `HIDDEN-CAPEX-PROPERTY-${suffix}`,
    noAccessProperty: `Local CapEx No Access ${suffix}`,
    hiddenVendor: `HIDDEN-CAPEX-VENDOR-${suffix}`,
  };
  const ownerEmail = `capex-e2e-owner-${suffix}@capveri.local`;
  const viewerEmail = `capex-e2e-viewer-${suffix}@capveri.local`;
  const hiddenEmail = `capex-e2e-hidden-${suffix}@capveri.local`;
  const noAccessEmail = `capex-e2e-no-access-${suffix}@capveri.local`;
  const ownerOrganizationName = `Local CapEx Org ${suffix}`;
  const viewerOrganizationName = `Local CapEx Viewer Org ${suffix}`;
  const hiddenOrganizationName = `Local CapEx Hidden Org ${suffix}`;
  const noAccessOrganizationName = `Local CapEx No Access Org ${suffix}`;
  const created = [];
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });

  try {
    const owner = await createLocalAuthUser(input, {
      email: ownerEmail,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local CapEx Owner",
      organizationName: ownerOrganizationName,
      role: "owner",
    });
    created.push(owner);

    const viewer = await createLocalAuthUser(input, {
      email: viewerEmail,
      password: `ViewerPass${input.index}A1!`,
      fullName: "Local CapEx Viewer",
      organizationName: viewerOrganizationName,
      role: "viewer",
      effectiveOrganizationId: owner.organizationId,
    });
    created.push(viewer);

    const hidden = await createLocalAuthUser(input, {
      email: hiddenEmail,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local CapEx Hidden Owner",
      organizationName: hiddenOrganizationName,
      role: "owner",
    });
    created.push(hidden);

    const noAccess = await createLocalAuthUser(input, {
      email: noAccessEmail,
      password: `NoAccessPass${input.index}A1!`,
      fullName: "Local CapEx No Access Owner",
      organizationName: noAccessOrganizationName,
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
        name: names.visibleProperty,
      });
      await insertProperty(transaction, {
        id: ids.hiddenPropertyId,
        organizationId: hidden.organizationId,
        name: names.hiddenProperty,
      });
      await insertProperty(transaction, {
        id: ids.noAccessPropertyId,
        organizationId: noAccess.organizationId,
        name: names.noAccessProperty,
      });
      await insertImportBatch(transaction, {
        id: ids.visibleImportBatchId,
        organizationId: owner.organizationId,
        propertyId: ids.visiblePropertyId,
        fileName: `capex-visible-${suffix}.csv`,
        hashMarker: `visible-${suffix}`,
        rowCount: 7,
      });
      await insertImportBatch(transaction, {
        id: ids.hiddenImportBatchId,
        organizationId: hidden.organizationId,
        propertyId: ids.hiddenPropertyId,
        fileName: `capex-hidden-${suffix}.csv`,
        hashMarker: `hidden-${suffix}`,
        rowCount: 1,
      });
      await insertImportBatch(transaction, {
        id: ids.noAccessImportBatchId,
        organizationId: noAccess.organizationId,
        propertyId: ids.noAccessPropertyId,
        fileName: `capex-no-access-${suffix}.csv`,
        hashMarker: `no-access-${suffix}`,
        rowCount: 1,
      });
      await insertGlEntries(transaction, ids, names);
      await transaction`
        insert into capex_flags (
          id, organization_id, gl_entry_id, property_id, period_year,
          flag_reason, rule_name, confidence_score, matched_pattern,
          disposition, classifier_version
        )
        values (
          ${ids.hiddenFlagId}, ${hidden.organizationId}, ${ids.glIds.hidden},
          ${ids.hiddenPropertyId}, ${PERIOD_YEAR}, 'Hidden seeded flag',
          'amount_threshold', 0.85, null, 'pending', '1.0'
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
        emails: [ownerEmail, viewerEmail, hiddenEmail, noAccessEmail],
        organizationNames: [
          ownerOrganizationName,
          viewerOrganizationName,
          hiddenOrganizationName,
          noAccessOrganizationName,
        ],
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
        set role = ${user.role},
            full_name = ${user.fullName},
            organization_id = coalesce(${user.effectiveOrganizationId ?? null}, organization_id),
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
        email: user.email,
        password: user.password,
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
      ...user,
      userId,
      organizationId: user.effectiveOrganizationId ?? organizationId,
      signupOrganizationId: organizationId,
      accessToken,
    };
  } catch (error) {
    await cleanupPartialAuthUser(input.databaseUrl, {
      ...user,
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
      hiddenImportBatchId: UUID_SENTINEL,
      noAccessImportBatchId: UUID_SENTINEL,
      glIds: {},
      hiddenFlagId: UUID_SENTINEL,
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

async function insertProperty(sql, input) {
  await sql`
    insert into properties (
      id, organization_id, name, address_line1, city, state, postal_code,
      total_rentable_sqft, total_usable_sqft, common_area_sqft, target_occupancy
    )
    values (
      ${input.id}, ${input.organizationId}, ${input.name}, '100 CapEx Way',
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
      ${input.fileName}, ${shaLike(input.hashMarker)}, 'generic', 'completed',
      ${input.rowCount}, 0, '[]'::jsonb
    )
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
      (${ids.glIds.highAmount}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6400', 'Major repair reserve', 150000.00, '2026-01-15', ${PERIOD_YEAR}, 1, 'Metro Maintenance', 'Large one-time equipment work', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.keyword}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6410', 'Tenant improvement allowance', 9000.00, '2026-02-15', ${PERIOD_YEAR}, 2, 'Interior Build LLC', 'Tenant improvement reimbursement', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.assetCode}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '1510', 'Building asset additions', 5000.00, '2026-03-15', ${PERIOD_YEAR}, 3, 'Asset Ledger', 'Capitalized building asset', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.vendor}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6420', 'Roof maintenance', 7000.00, '2026-04-15', ${PERIOD_YEAR}, 4, 'Summit Roofing LLC', 'Roof patch service', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.combo}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6430', 'Renovation project', 15000.00, '2026-05-15', ${PERIOD_YEAR}, 5, 'Buildout Crew', 'Lobby renovation project', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.credit}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6440', 'Equipment replacement credit', -74000.00, '2026-06-15', ${PERIOD_YEAR}, 6, 'Credit Vendor', 'Replacement credit memo', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.quiet}, ${ids.visibleImportBatchId}, ${ids.visiblePropertyId}, '6450', 'Monthly janitorial', 3500.00, '2026-07-15', ${PERIOD_YEAR}, 7, 'Clean Co', 'Recurring janitorial service', ${sql.json({ local_capex_e2e: true })}),
      (${ids.glIds.hidden}, ${ids.hiddenImportBatchId}, ${ids.hiddenPropertyId}, '6999', 'Hidden capex replacement', 99999.00, '2026-01-15', ${PERIOD_YEAR}, 1, ${names.hiddenVendor}, ${names.hiddenProperty}, ${sql.json({ local_capex_e2e: true, hidden: true })}),
      (${ids.glIds.noAccess}, ${ids.noAccessImportBatchId}, ${ids.noAccessPropertyId}, '6998', 'No access replacement', 30000.00, '2026-01-15', ${PERIOD_YEAR}, 1, 'No Access Vendor', 'No access fixture', ${sql.json({ local_capex_e2e: true })})
  `;
}

async function loadFlags(sql, account) {
  return sql`
    select id::text as id, organization_id::text as organization_id,
      gl_entry_id::text as gl_entry_id, property_id::text as property_id,
      period_year, flag_reason, rule_name, confidence_score::text as confidence_score,
      matched_pattern, disposition, reviewed_at::text as reviewed_at,
      reviewed_by_user_id::text as reviewed_by_user_id, review_note,
      classifier_version, created_at::text as created_at
    from capex_flags
    where organization_id = ${account.owner.organizationId}
      and property_id = ${account.visiblePropertyId}
      and period_year = ${PERIOD_YEAR}
    order by rule_name, gl_entry_id
  `;
}

async function assertDbReviewState(sql, account) {
  const rows = await sql`
    select disposition, count(*)::int as count
    from capex_flags
    where organization_id = ${account.owner.organizationId}
      and property_id = ${account.visiblePropertyId}
      and period_year = ${PERIOD_YEAR}
    group by disposition
  `;
  const counts = Object.fromEntries(
    rows.map((row) => [row.disposition, row.count]),
  );
  assert(counts.confirmed_capex === 1, "DB confirmed count mismatch");
  assert(counts.dismissed === 8, "DB dismissed count mismatch");
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-capex-e2e-"));
  const path = resolve(directory, ".dev.vars.local-capex-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-capex-e2e-signing-secret",
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
      account.hiddenImportBatchId,
      account.noAccessImportBatchId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const glEntryIds = nonEmpty(
    Object.values(account.glIds ?? {}),
    UUID_SENTINEL,
  );
  const flagIds = nonEmpty([account.hiddenFlagId], UUID_SENTINEL);
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
    ...glEntryIds,
    ...flagIds,
  ]);

  await sql.begin(async (transaction) => {
    await transaction`
      delete from capex_flags
      where id in ${transaction(flagIds)}
         or organization_id in ${transaction(orgIds)}
         or property_id in ${transaction(propertyIds)}
         or gl_entry_id in ${transaction(glEntryIds)}
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
      account.hiddenImportBatchId,
      account.noAccessImportBatchId,
    ].filter(Boolean),
    UUID_SENTINEL,
  );
  const glEntryIds = nonEmpty(
    Object.values(account.glIds ?? {}),
    UUID_SENTINEL,
  );
  const flagIds = nonEmpty([account.hiddenFlagId], UUID_SENTINEL);
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
    ...glEntryIds,
    ...flagIds,
  ]);

  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_user_count,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_user_count,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as org_count,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(orgIds)} or name in ${sql(propertyNames)}) as property_count,
      (select count(*)::int from import_batches where id in ${sql(importBatchIds)} or organization_id in ${sql(orgIds)}) as import_batch_count,
      (select count(*)::int from gl_entries where id in ${sql(glEntryIds)} or import_batch_id in ${sql(importBatchIds)} or property_id in ${sql(propertyIds)}) as gl_entry_count,
      (select count(*)::int from capex_flags where id in ${sql(flagIds)} or organization_id in ${sql(orgIds)} or property_id in ${sql(propertyIds)} or gl_entry_id in ${sql(glEntryIds)}) as capex_flag_count,
      (select count(*)::int from subscriptions where organization_id in ${sql(orgIds)}) as subscription_count,
      (select count(*)::int from audit_credits where organization_id in ${sql(orgIds)}) as audit_credit_count,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_event_count,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptance_count,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)} or row_id in ${sql(nonEmpty(rowIds, UUID_SENTINEL))}) as audit_log_count
  `;
  const row = rows[0];
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.org_count === 0, "cleanup left organizations");
  assert(row.property_count === 0, "cleanup left properties");
  assert(row.import_batch_count === 0, "cleanup left import batches");
  assert(row.gl_entry_count === 0, "cleanup left GL entries");
  assert(row.capex_flag_count === 0, "cleanup left CapEx flags");
  assert(row.subscription_count === 0, "cleanup left subscriptions");
  assert(row.audit_credit_count === 0, "cleanup left audit credits");
  assert(
    row.signup_email_event_count === 0,
    "cleanup left signup email events",
  );
  assert(row.legal_acceptance_count === 0, "cleanup left legal acceptances");
  assert(row.audit_log_count === 0, "cleanup left audit logs");
}

function assertRuleSet(flags) {
  const rules = new Set(flags.map((flag) => flag.rule_name));
  for (const expected of [
    "amount_threshold",
    "account_keyword",
    "account_code_prefix",
    "vendor_pattern",
    "amount_keyword_combo",
  ]) {
    assert(rules.has(expected), `missing rule ${expected}`);
  }
  assert(
    flags.filter((flag) => flag.rule_name === "amount_threshold").length === 2,
    "amount_threshold should fire for debit and credit",
  );
  assert(
    flags.filter((flag) => flag.rule_name === "account_keyword").length === 3,
    "account_keyword should fire for keyword, combo, and credit",
  );
  assert(
    flags.filter((flag) => flag.rule_name === "amount_keyword_combo").length ===
      2,
    "amount_keyword_combo should fire for combo and credit",
  );
}

function assertExactFlagContracts(flags, account, label) {
  const withEntryFields = flags.some((flag) =>
    Object.prototype.hasOwnProperty.call(flag, "account_code"),
  );
  for (const flag of flags) {
    assertFlagRowShape(flag, account, label, { withEntryFields });
  }

  const byEntryAndRule = new Map(
    flags.map((flag) => [`${flag.gl_entry_id}::${flag.rule_name}`, flag]),
  );
  const expected = [
    {
      glEntryId: account.glIds.highAmount,
      ruleName: "amount_threshold",
      confidence: "0.85",
      matchedPattern: null,
      reasonIncludes: "$150,000.00",
    },
    {
      glEntryId: account.glIds.keyword,
      ruleName: "account_keyword",
      confidence: "0.90",
      matchedPattern: "tenant improvement",
      reasonIncludes: "tenant improvement",
    },
    {
      glEntryId: account.glIds.assetCode,
      ruleName: "account_code_prefix",
      confidence: "0.75",
      matchedPattern: "15*",
      reasonIncludes: "1510",
    },
    {
      glEntryId: account.glIds.vendor,
      ruleName: "vendor_pattern",
      confidence: "0.55",
      matchedPattern: "roofing",
      reasonIncludes: "Summit Roofing LLC",
    },
    {
      glEntryId: account.glIds.combo,
      ruleName: "account_keyword",
      confidence: "0.65",
      matchedPattern: "renovation",
      reasonIncludes: "renovation",
    },
    {
      glEntryId: account.glIds.combo,
      ruleName: "amount_keyword_combo",
      confidence: "0.80",
      matchedPattern: "renovation",
      reasonIncludes: "$15,000.00",
    },
    {
      glEntryId: account.glIds.credit,
      ruleName: "amount_threshold",
      confidence: "0.60",
      matchedPattern: null,
      reasonIncludes: "$74,000.00",
    },
    {
      glEntryId: account.glIds.credit,
      ruleName: "account_keyword",
      confidence: "0.65",
      matchedPattern: "replacement",
      reasonIncludes: "replacement",
    },
    {
      glEntryId: account.glIds.credit,
      ruleName: "amount_keyword_combo",
      confidence: "0.80",
      matchedPattern: "replacement",
      reasonIncludes: "$74,000.00",
    },
  ];

  assert(
    byEntryAndRule.size === expected.length,
    `${label} exact flag count mismatch`,
  );
  for (const contract of expected) {
    const key = `${contract.glEntryId}::${contract.ruleName}`;
    const flag = byEntryAndRule.get(key);
    assert(flag, `${label} missing ${key}`);
    assert(
      normalizedConfidence(flag) === contract.confidence,
      `${label} confidence mismatch for ${key}: ${safeJson(flag)}`,
    );
    assert(
      (flag.matched_pattern ?? null) === contract.matchedPattern,
      `${label} matched pattern mismatch for ${key}: ${safeJson(flag)}`,
    );
    assert(
      String(flag.flag_reason ?? flag.reason ?? "").includes(
        contract.reasonIncludes,
      ),
      `${label} reason mismatch for ${key}: ${safeJson(flag)}`,
    );
  }

  for (const excludedGlId of [
    account.glIds.quiet,
    account.glIds.hidden,
    account.glIds.noAccess,
  ]) {
    assert(
      !flags.some((flag) => flag.gl_entry_id === excludedGlId),
      `${label} should not include GL entry ${excludedGlId}`,
    );
  }
}

function normalizedConfidence(flag) {
  const raw = flag.confidence_score ?? flag.confidence;
  return Number(raw).toFixed(2);
}

function assertClassifyResponse(response, expected) {
  assertExactKeys(response, CLASSIFY_RESPONSE_KEYS, "classify response");
  assert(
    response.property_id === expected.propertyId,
    "classify property_id mismatch",
  );
  assert(response.period_year === PERIOD_YEAR, "classify year mismatch");
  assert(
    response.flags_created === expected.flagsCreated,
    "classify flags_created mismatch",
  );
  assert(
    response.gl_entries_scanned === expected.glEntriesScanned,
    "classify gl_entries_scanned mismatch",
  );
}

function assertListedFlagRows(flags, account, label) {
  for (const flag of flags) {
    assertFlagRowShape(flag, account, label);
  }
}

function assertFlagRowShape(flag, account, label, options = {}) {
  assert(flag && typeof flag === "object", `${label} flag missing`);
  assertExactKeys(
    flag,
    options.withEntryFields ? FLAG_ROW_KEYS : DB_FLAG_ROW_KEYS,
    `${label} flag`,
  );
  assertUuid(flag.id, `${label}.id`);
  assertUuid(flag.organization_id, `${label}.organization_id`);
  assert(
    flag.organization_id === account.owner.organizationId,
    `${label}.organization_id mismatch`,
  );
  assertUuid(flag.gl_entry_id, `${label}.gl_entry_id`);
  assertUuid(flag.property_id, `${label}.property_id`);
  assert(
    flag.property_id === account.visiblePropertyId,
    `${label}.property_id mismatch`,
  );
  assert(flag.period_year === PERIOD_YEAR, `${label}.period_year mismatch`);
  assert(typeof flag.flag_reason === "string", `${label}.flag_reason missing`);
  assert(typeof flag.rule_name === "string", `${label}.rule_name missing`);
  assert(
    Number.isFinite(Number(flag.confidence_score)),
    `${label}.confidence_score invalid`,
  );
  assert(
    flag.matched_pattern === null || typeof flag.matched_pattern === "string",
    `${label}.matched_pattern invalid`,
  );
  assert(
    ["pending", "confirmed_capex", "dismissed"].includes(flag.disposition),
    `${label}.disposition invalid`,
  );
  if (flag.reviewed_at !== null) {
    assertParseableTimestamp(flag.reviewed_at, `${label}.reviewed_at`);
  }
  if (flag.reviewed_by_user_id !== null) {
    assertUuid(flag.reviewed_by_user_id, `${label}.reviewed_by_user_id`);
  }
  assert(
    flag.review_note === null || typeof flag.review_note === "string",
    `${label}.review_note invalid`,
  );
  assert(
    flag.classifier_version === "1.0",
    `${label}.classifier_version mismatch`,
  );
  assertParseableTimestamp(flag.created_at, `${label}.created_at`);
  if (options.withEntryFields) {
    assert(
      flag.account_code === null || typeof flag.account_code === "string",
      `${label}.account_code invalid`,
    );
    assert(
      flag.account_description === null ||
        typeof flag.account_description === "string",
      `${label}.account_description invalid`,
    );
    assert(
      flag.vendor_name === null || typeof flag.vendor_name === "string",
      `${label}.vendor_name invalid`,
    );
    assert(typeof flag.amount === "string", `${label}.amount missing`);
    assert(
      flag.description === null || typeof flag.description === "string",
      `${label}.description invalid`,
    );
    assertDateString(flag.transaction_date, `${label}.transaction_date`);
  }
}

function assertSummary(summary, expected) {
  assertExactKeys(summary, SUMMARY_KEYS, "summary");
  assert(summary.total === expected.total, "summary total mismatch");
  assert(summary.pending === expected.pending, "summary pending mismatch");
  assert(
    summary.confirmed_capex === expected.confirmed,
    "summary confirmed mismatch",
  );
  assert(
    summary.dismissed === expected.dismissed,
    "summary dismissed mismatch",
  );
  assert(
    summary.total_flagged_amount === expected.totalFlaggedAmount,
    `summary amount mismatch: ${summary.total_flagged_amount}`,
  );
}

function assertNoLeakage(value, account) {
  const text = safeJson(value);
  for (const hidden of [
    account.names.hiddenProperty,
    account.names.hiddenVendor,
    account.glIds.hidden,
  ]) {
    assert(!text.includes(hidden), `response leaked hidden marker ${hidden}`);
  }
}

function assertPermissionError(body, label) {
  assertJsonEqual(
    body,
    {
      detail: "Insufficient permissions",
      error: {
        code: "insufficient_permissions",
        message: "Insufficient permissions",
      },
    },
    label,
  );
}

function assertSubscriptionError(body, label) {
  assertJsonEqual(
    body,
    {
      detail:
        "subscription_required: An active subscription or trial is required.",
      error: {
        code: "subscription_required",
        message:
          "subscription_required: An active subscription or trial is required.",
      },
    },
    label,
  );
}

function assertCapexNotFoundError(body, message, label) {
  assertJsonEqual(
    body,
    {
      detail: message,
      error: { code: "capex_flag_not_found", message },
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

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} should be a UUID: ${safeJson(value)}`,
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
    `${label} should be parseable timestamp: ${value}`,
  );
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
    maybeReportHasFullAccessBug(
      response,
      body,
      fetchOptions.method ?? "GET",
      url,
    );
    fail(
      `${fetchOptions.method ?? "GET"} ${redactSensitiveUrl(url)} returned ${response.status}, expected ${status}: ${safeJson(redactSensitiveJson(body))}`,
    );
  }
  return body;
}

function maybeReportHasFullAccessBug(response, body, method, url) {
  const text = safeJson(body);
  if (
    response.status === 500 &&
    /has_full_access|function .* does not exist/iu.test(text)
  ) {
    fail(
      `PRODUCTION BUG: ${method} ${redactSensitiveUrl(url)} returned 500 while checking public.has_full_access($1). Response: ${text}`,
    );
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
  if (url.username || url.password) {
    fail(`${label} must not include credentials`);
  }
  if (!isLoopbackHost(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  if (!url.port) fail(`${label} must include an explicit loopback port`);
  if (label === "supabase-url" && url.port !== "54321") {
    fail("supabase-url must point at local Supabase API on port 54321");
  }
  if (label === "supabase-url" && url.pathname !== "/") {
    fail("supabase-url must not include a path");
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
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  if (!isLoopbackHost(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must point at local Supabase Postgres on port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must use the local Supabase /postgres database");
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

function assert(condition, message) {
  if (!condition) fail(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
