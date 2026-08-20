import http from "node:http";
import { Buffer, File } from "node:buffer";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { devNull, tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8809";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DEFAULT_STUB_URL = "http://127.0.0.1:8800";
const DEFAULT_DOCUMENTS_BUCKET = "capveri-documents-dev";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const IMAGE_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
]);
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const execFileAsync = promisify(execFile);
const FEEDBACK_RESPONSE_KEYS = [
  "created_at",
  "id",
  "message",
  "metadata",
  "organization_id",
  "page_url",
  "screenshot_url",
  "status",
  "type",
  "updated_at",
  "user_agent",
  "user_id",
];
const STATS_RESPONSE_KEYS = ["by_status", "by_type", "total"];
const SCREENSHOT_UPLOAD_KEYS = ["storage_path", "url"];
const OK_RESPONSE = { status: "ok" };

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
    fail(`local feedback E2E always owns ${DEFAULT_BASE_URL}`);
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
      DEFAULT_DATABASE_URL,
  );
  const stubUrl = normalizedLocalUrl(
    args["stub-url"] ?? process.env.npm_config_stub_url ?? DEFAULT_STUB_URL,
    "stub-url",
  );
  const documentsBucket =
    args["documents-bucket"] ??
    process.env.npm_config_documents_bucket ??
    DEFAULT_DOCUMENTS_BUCKET;
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    LOCAL_ANON_KEY;

  if (process.env.CI) fail("Refusing to run local feedback E2E in CI.");

  await assertPortAvailable(baseUrl);
  await assertPortAvailable(stubUrl);
  const stub = await startExternalStub(stubUrl);
  let worker;
  let runError;
  let closeError;
  try {
    worker = await startWorkerServer({
      baseUrl,
      stubUrl,
      supabaseUrl,
      databaseUrl,
    });

    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          databaseUrl,
          anonKey,
          documentsBucket,
          stub,
          index,
        }),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          stub_url: stubUrl,
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
      if (worker) await worker.close();
    } catch (error) {
      closeError = error;
    }
    try {
      await stub.close();
    } catch (error) {
      if (!closeError) closeError = error;
      else console.error(`Feedback stub close failed: ${errorMessage(error)}`);
    }
  }
  if (runError && closeError) {
    console.error(
      `Local feedback cleanup failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedFeedbackAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
  const viewerHeaders = jsonAuthHeaders(account.viewer.accessToken);
  const hiddenHeaders = jsonAuthHeaders(account.hidden.accessToken);
  const uploadedKeys = [];
  const feedbackIds = [];
  const start = input.stub.requests.length;

  try {
    const marketing = await expectJson(
      `${input.baseUrl}/api/v1/feedback/marketing`,
      {
        method: "POST",
        headers: {
          "cf-connecting-ip": "127.0.0.1",
          "content-type": "application/json",
        },
        status: 200,
        body: JSON.stringify({
          type: "general",
          message: `Local marketing feedback ${account.suffix}`,
          page_url: "/pricing",
          turnstile_token: "local-turnstile-token",
        }),
      },
    );
    assertDeepEqual(marketing, OK_RESPONSE, "marketing feedback response");
    await waitForStubRequest(input.stub, {
      start,
      predicate: (request) => request.path === "/turnstile",
      message: "Turnstile loopback request missing.",
    });
    const marketingEmail = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) => request.path === "/emails",
      message: "Marketing feedback email loopback request missing.",
    });
    assertFeedbackEmailContract(marketingEmail.json, {
      feedbackType: "general",
      message: `Local marketing feedback ${account.suffix}`,
      pageUrl: "/pricing",
      userEmail: "anonymous (marketing site)",
      userId: "n/a",
      organizationId: "n/a",
      screenshotUrl: "",
    });

    const upload = await uploadScreenshot(input.baseUrl, ownerHeaders);
    assertExactKeys(upload, SCREENSHOT_UPLOAD_KEYS, "screenshot upload");
    uploadedKeys.push(upload.storage_path);
    assert(
      upload.storage_path.startsWith(
        `feedback/${account.owner.organizationId}/`,
      ),
      "screenshot storage path was not org-scoped",
    );
    const file = await expectBytes(upload.url, { status: 200 });
    assert(
      file.contentType.includes("image/jpeg"),
      "screenshot content type mismatch",
    );
    assert(
      Buffer.compare(Buffer.from(file.bytes), IMAGE_BYTES) === 0,
      "screenshot bytes mismatch",
    );

    await expectBytes(tamperedScreenshotUrl(upload.url), { status: 403 });
    await expectBytes(expiredScreenshotUrl(upload.url), { status: 403 });

    const feedback = await createFeedback(input.baseUrl, ownerHeaders, {
      type: "bug",
      message: `Local screenshot feedback ${account.suffix}`,
      page_url: "/app/reconciliations",
      screenshot_url: upload.url,
      user_agent: "local-feedback-e2e",
      metadata: { viewport: "1440x900", local_run: true },
    });
    feedbackIds.push(feedback.id);
    assertFeedbackResponse(
      feedback,
      {
        id: feedback.id,
        user_id: account.owner.userId,
        organization_id: account.owner.organizationId,
        type: "bug",
        status: "new",
        message: `Local screenshot feedback ${account.suffix}`,
        page_url: "/app/reconciliations",
        user_agent: "local-feedback-e2e",
        metadata: { viewport: "1440x900", local_run: true },
      },
      "created feedback",
      { screenshotSignedUrl: true },
    );
    assert(feedback.status === "new", "created feedback status mismatch");
    assert(
      feedback.screenshot_url?.includes("/api/v1/feedback/screenshot-file?"),
      "created feedback did not return signed screenshot URL",
    );

    const dbFeedback = await findFeedback(sql, feedback.id);
    assertFeedbackDbRow(
      dbFeedback,
      {
        id: feedback.id,
        user_id: account.owner.userId,
        organization_id: account.owner.organizationId,
        type: "bug",
        status: "new",
        message: `Local screenshot feedback ${account.suffix}`,
        page_url: "/app/reconciliations",
        screenshot_url: upload.storage_path,
        user_agent: "local-feedback-e2e",
        metadata: { viewport: "1440x900", local_run: true },
      },
      "created feedback DB row",
    );
    assert(
      dbFeedback.organization_id === account.owner.organizationId,
      "feedback org mismatch",
    );
    assert(
      dbFeedback.screenshot_url === upload.storage_path,
      "feedback screenshot path mismatch",
    );

    const viewerList = await expectJson(`${input.baseUrl}/api/v1/feedback`, {
      headers: viewerHeaders,
      status: 403,
    });
    assertPermissionError(viewerList, "viewer list error");
    const viewerStats = await expectJson(
      `${input.baseUrl}/api/v1/feedback/stats/summary`,
      {
        headers: viewerHeaders,
        status: 403,
      },
    );
    assertPermissionError(viewerStats, "viewer stats error");
    const viewerDetail = await expectJson(
      `${input.baseUrl}/api/v1/feedback/${feedback.id}`,
      {
        headers: viewerHeaders,
        status: 403,
      },
    );
    assertPermissionError(viewerDetail, "viewer detail error");

    const list = await expectJson(
      `${input.baseUrl}/api/v1/feedback?type=bug&status=new&page=1&per_page=10`,
      { headers: ownerHeaders, status: 200 },
    );
    assert(Array.isArray(list), "admin feedback list should be an array");
    assert(list.length === 1, "admin filtered list count mismatch");
    assertFeedbackResponse(
      list[0],
      {
        ...feedback,
      },
      "admin list row",
      { screenshotSignedUrl: true },
    );

    const detail = await expectJson(
      `${input.baseUrl}/api/v1/feedback/${feedback.id}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertFeedbackResponse(
      detail,
      {
        ...feedback,
      },
      "admin detail",
      { screenshotSignedUrl: true },
    );
    assert(detail.id === feedback.id, "admin detail id mismatch");

    const stats = await expectJson(
      `${input.baseUrl}/api/v1/feedback/stats/summary`,
      {
        headers: ownerHeaders,
        status: 200,
      },
    );
    assertExactKeys(stats, STATS_RESPONSE_KEYS, "feedback stats");
    assert(stats.total >= 1, "feedback stats total missing");
    assert(stats.by_status?.new >= 1, "feedback stats status mismatch");
    assert(stats.by_type?.bug >= 1, "feedback stats type mismatch");

    const updated = await expectJson(
      `${input.baseUrl}/api/v1/feedback/${feedback.id}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        status: 200,
        body: JSON.stringify({
          status: "reviewed",
          metadata: { triage: "local-feedback-e2e" },
        }),
      },
    );
    assertFeedbackResponse(
      updated,
      {
        ...feedback,
        status: "reviewed",
        metadata: { triage: "local-feedback-e2e" },
        screenshot_url: upload.storage_path,
      },
      "updated feedback",
      { screenshotSignedUrl: false, allowUpdatedAtChange: true },
    );
    assert(updated.status === "reviewed", "feedback status update mismatch");
    await assertFeedbackStatus(sql, feedback.id, "reviewed");

    const mine = await expectJson(`${input.baseUrl}/api/v1/feedback/my`, {
      headers: ownerHeaders,
      status: 200,
    });
    assert(
      mine.some(
        (item) =>
          item.id === feedback.id &&
          item.screenshot_url === upload.storage_path,
      ),
      "my feedback missing row",
    );

    const crossOrgPath = await expectJson(`${input.baseUrl}/api/v1/feedback`, {
      method: "POST",
      headers: ownerHeaders,
      status: 400,
      body: JSON.stringify({
        type: "bug",
        message: `Cross org screenshot feedback ${account.suffix}`,
        page_url: "/app/reconciliations",
        screenshot_url: `feedback/${account.hidden.organizationId}/bad.jpeg`,
      }),
    });
    assertInvalidScreenshotPathError(crossOrgPath, "cross-org path error");
    const crossOrgSigned = await expectJson(
      `${input.baseUrl}/api/v1/feedback`,
      {
        method: "POST",
        headers: hiddenHeaders,
        status: 400,
        body: JSON.stringify({
          type: "bug",
          message: `Cross org signed screenshot feedback ${account.suffix}`,
          page_url: "/app/reconciliations",
          screenshot_url: upload.url,
        }),
      },
    );
    assertInvalidScreenshotError(crossOrgSigned, "cross-org signed URL error");

    for (let index = 0; index < 2; index += 1) {
      const extra = await createFeedback(input.baseUrl, ownerHeaders, {
        type: "general",
        message: `Local rate feedback ${index} ${account.suffix}`,
        page_url: "/app/dashboard",
        metadata: { local_run: true, index },
      });
      feedbackIds.push(extra.id);
      assertFeedbackResponse(
        extra,
        {
          id: extra.id,
          user_id: account.owner.userId,
          organization_id: account.owner.organizationId,
          type: "general",
          status: "new",
          message: `Local rate feedback ${index} ${account.suffix}`,
          page_url: "/app/dashboard",
          screenshot_url: null,
          user_agent: null,
          metadata: { local_run: true, index },
        },
        `extra feedback ${index}`,
      );
    }
    const rateLimited = await expectJson(`${input.baseUrl}/api/v1/feedback`, {
      method: "POST",
      headers: ownerHeaders,
      status: 429,
      body: JSON.stringify({
        type: "general",
        message: `Local over-limit feedback ${account.suffix}`,
        page_url: "/app/dashboard",
      }),
    });
    assertDeepEqual(
      rateLimited,
      {
        detail: "Rate limit exceeded. Maximum 3 submissions per hour.",
        error: {
          code: "rate_limit_exceeded",
          message: "Rate limit exceeded. Maximum 3 submissions per hour.",
        },
      },
      "feedback rate limit response",
    );

    return {
      index: input.index,
      organization_id: account.owner.organizationId,
      feedback_ids: feedbackIds,
      screenshot_keys: uploadedKeys,
      stub_calls: input.stub.requests.length - start,
    };
  } finally {
    try {
      await cleanupGeneratedRows(sql, {
        orgIds: account.cleanupOrganizationIds,
        userIds: account.cleanupUserIds,
        emails: account.cleanupEmails,
        orgNames: account.cleanupOrganizationNames,
        feedbackIds,
      });
      await cleanupR2Objects(input.documentsBucket, uploadedKeys);
      await assertCleanupComplete(sql, {
        orgIds: account.cleanupOrganizationIds,
        userIds: account.cleanupUserIds,
        emails: account.cleanupEmails,
        orgNames: account.cleanupOrganizationNames,
        feedbackIds,
      });
      await assertR2ObjectsMissing(input.documentsBucket, uploadedKeys);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

function assertFeedbackEmailContract(body, input) {
  assert(
    body.from === "CapVeri <local@capveri.local>",
    "feedback email from mismatch",
  );
  assertDeepEqual(
    body.to,
    ["admin-feedback-e2e@capveri.local"],
    "feedback email to",
  );
  assertDeepEqual(body.reply_to, [input.userEmail], "feedback email reply_to");
  assert(
    body.subject === `New CapVeri feedback: ${input.feedbackType}`,
    "feedback email subject mismatch",
  );

  const expectedText = [
    "New CapVeri feedback",
    `Type: ${input.feedbackType}`,
    `Message: ${input.message}`,
    `Page: ${input.pageUrl}`,
    `User email: ${input.userEmail}`,
    `User ID: ${input.userId}`,
    `Organization ID: ${input.organizationId}`,
    `Screenshot: ${input.screenshotUrl}`,
  ].join("\n");
  assert(
    body.text === expectedText,
    `feedback email text body mismatch: expected ${JSON.stringify(expectedText)}, got ${JSON.stringify(body.text)}`,
  );

  for (const expected of [
    "New CapVeri feedback",
    input.feedbackType,
    input.message,
    input.pageUrl,
    input.userEmail,
    input.userId,
    input.organizationId,
  ]) {
    assert(
      String(body.html).includes(expected),
      `feedback email HTML missing ${expected}`,
    );
  }
}

function assertFeedbackResponse(row, expected, label, options = {}) {
  assert(row && typeof row === "object", `${label} missing`);
  assertExactKeys(row, FEEDBACK_RESPONSE_KEYS, label);
  assertUuid(row.id, `${label}.id`);
  assert(row.id === expected.id, `${label}.id mismatch`);
  assertUuid(row.user_id, `${label}.user_id`);
  assert(row.user_id === expected.user_id, `${label}.user_id mismatch`);
  assertUuid(row.organization_id, `${label}.organization_id`);
  assert(
    row.organization_id === expected.organization_id,
    `${label}.organization_id mismatch`,
  );
  assert(row.type === expected.type, `${label}.type mismatch`);
  assert(row.status === expected.status, `${label}.status mismatch`);
  assert(row.message === expected.message, `${label}.message mismatch`);
  assert(row.page_url === expected.page_url, `${label}.page_url mismatch`);
  if (options.screenshotSignedUrl) {
    assert(
      typeof row.screenshot_url === "string" &&
        row.screenshot_url.includes("/api/v1/feedback/screenshot-file?") &&
        row.screenshot_url.includes("signature="),
      `${label}.screenshot_url should be a signed URL`,
    );
  } else {
    assert(
      row.screenshot_url === expected.screenshot_url,
      `${label}.screenshot_url mismatch`,
    );
  }
  assert(
    row.user_agent === expected.user_agent,
    `${label}.user_agent mismatch`,
  );
  assertDeepEqual(
    normalizeResponseMetadata(row.metadata, `${label}.metadata`),
    normalizeResponseMetadata(expected.metadata, `${label}.expected_metadata`),
    `${label}.metadata`,
  );
  assertParseableTimestamp(row.created_at, `${label}.created_at`);
  assertParseableTimestamp(row.updated_at, `${label}.updated_at`);
  if (!options.allowUpdatedAtChange && expected.updated_at !== undefined) {
    assert(
      row.updated_at === expected.updated_at,
      `${label}.updated_at mismatch`,
    );
  }
}

function assertFeedbackDbRow(row, expected, label) {
  assert(row && typeof row === "object", `${label} missing`);
  assertUuid(row.id, `${label}.id`);
  for (const key of [
    "id",
    "user_id",
    "organization_id",
    "type",
    "status",
    "message",
    "page_url",
    "screenshot_url",
    "user_agent",
  ]) {
    assert(
      row[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(row[key])}`,
    );
  }
  assertDeepEqual(
    normalizeResponseMetadata(row.metadata, `${label}.metadata`),
    expected.metadata,
    `${label}.metadata`,
  );
  assertParseableTimestamp(row.created_at, `${label}.created_at`);
  assertParseableTimestamp(row.updated_at, `${label}.updated_at`);
}

function normalizeResponseMetadata(value, label) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertPermissionError(body, label) {
  assertDeepEqual(
    body,
    {
      detail: "Admin privileges required",
      error: {
        code: "insufficient_permissions",
        message: "Admin privileges required",
      },
    },
    label,
  );
}

function assertInvalidScreenshotError(body, label) {
  assertDeepEqual(
    body,
    {
      detail:
        "Screenshot reference must be a current signed CapVeri feedback screenshot URL",
      error: {
        code: "invalid_screenshot_reference",
        message:
          "Screenshot reference must be a current signed CapVeri feedback screenshot URL",
      },
    },
    label,
  );
}

function assertInvalidScreenshotPathError(body, label) {
  assertDeepEqual(
    body,
    {
      detail: "Screenshot path is outside the current organization",
      error: {
        code: "invalid_screenshot_path",
        message: "Screenshot path is outside the current organization",
      },
    },
    label,
  );
}

function assertExactKeys(value, expectedKeys, label) {
  assert(value && typeof value === "object", `${label} missing`);
  assertDeepEqual(Object.keys(value).sort(), [...expectedKeys].sort(), label);
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

function assertParseableTimestamp(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  assert(
    !Number.isNaN(Date.parse(value)),
    `${label} should be parseable timestamp: ${value}`,
  );
}

async function seedFeedbackAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const created = [];

  try {
    const owner = await createLocalAuthUser(input, {
      email: `feedback-e2e-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}A1!`,
      fullName: "Local Feedback Owner",
      organizationName: `Local Feedback Owner Org ${suffix}`,
      role: "owner",
    });
    created.push(owner);

    const viewer = await createLocalAuthUser(input, {
      email: `feedback-e2e-viewer-${suffix}@capveri.local`,
      password: `ViewerPass${input.index}A1!`,
      fullName: "Local Feedback Viewer",
      organizationName: `Local Feedback Viewer Org ${suffix}`,
      role: "viewer",
      effectiveOrganizationId: owner.organizationId,
    });
    created.push(viewer);

    const hidden = await createLocalAuthUser(input, {
      email: `feedback-e2e-hidden-${suffix}@capveri.local`,
      password: `HiddenPass${input.index}A1!`,
      fullName: "Local Feedback Hidden",
      organizationName: `Local Feedback Hidden Org ${suffix}`,
      role: "owner",
    });
    created.push(hidden);

    return {
      suffix,
      owner,
      viewer,
      hidden,
      cleanupOrganizationIds: [
        owner.organizationId,
        viewer.organizationId,
        viewer.signupOrganizationId,
        hidden.organizationId,
      ],
      cleanupUserIds: [owner.userId, viewer.userId, hidden.userId],
      cleanupEmails: [owner.email, viewer.email, hidden.email],
      cleanupOrganizationNames: [
        owner.organizationName,
        viewer.organizationName,
        hidden.organizationName,
      ],
    };
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, created);
    throw error;
  }
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
    await sql`
      delete from users
      where email = ${user.email}
         or id = ${user.userId ?? null}
    `;
    await sql`
      delete from auth.users
      where email = ${user.email}
         or id = ${user.userId ?? null}
    `;
    await sql`
      delete from organizations
      where name = ${user.organizationName}
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function cleanupSeededAccounts(databaseUrl, accounts) {
  if (accounts.length === 0) return;

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, {
      orgIds: [
        ...new Set(
          accounts.flatMap((account) => [
            account.organizationId,
            account.signupOrganizationId,
          ]),
        ),
      ],
      userIds: accounts.map((account) => account.userId),
      emails: accounts.map((account) => account.email),
      orgNames: accounts.map((account) => account.organizationName),
      feedbackIds: [],
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function uploadScreenshot(baseUrl, headers) {
  const form = new FormData();
  form.set(
    "file",
    new File([IMAGE_BYTES], "feedback.jpg", { type: "image/jpeg" }),
  );
  return expectJson(`${baseUrl}/api/v1/feedback/screenshot`, {
    method: "POST",
    headers: { authorization: headers.authorization },
    status: 201,
    body: form,
  });
}

async function createFeedback(baseUrl, headers, body) {
  return expectJson(`${baseUrl}/api/v1/feedback`, {
    method: "POST",
    headers,
    status: 201,
    body: JSON.stringify(body),
  });
}

async function findFeedback(sql, feedbackId) {
  const rows = await sql`
    select
      id::text as id,
      user_id::text as user_id,
      organization_id::text as organization_id,
      type,
      status,
      message,
      page_url,
      screenshot_url,
      user_agent,
      metadata,
      created_at::text as created_at,
      updated_at::text as updated_at
    from feedback
    where id = ${feedbackId}
    limit 1
  `;
  const row = rows[0];
  assert(row, "feedback row missing");
  return row;
}

async function assertFeedbackStatus(sql, feedbackId, status) {
  const rows = await sql`
    select status
    from feedback
    where id = ${feedbackId}
    limit 1
  `;
  assert(rows[0]?.status === status, "feedback status DB mismatch");
}

async function cleanupGeneratedRows(sql, input) {
  if (input.feedbackIds.length > 0) {
    await sql`delete from feedback where id in ${sql(input.feedbackIds)}`;
  }
  await sql`
    delete from feedback
    where organization_id in ${sql(input.orgIds)}
       or user_id in ${sql(input.userIds)}
  `;
  await sql`
    delete from users
    where id in ${sql(input.userIds)}
       or email in ${sql(input.emails)}
       or organization_id in ${sql(input.orgIds)}
  `;
  await sql`
    delete from auth.users
    where id in ${sql(input.userIds)}
       or email in ${sql(input.emails)}
  `;
  await sql`
    delete from organizations
    where id in ${sql(input.orgIds)}
       or name in ${sql(input.orgNames)}
  `;
}

async function assertCleanupComplete(sql, input) {
  const rows = await sql`
    select
      (select count(*)::int from feedback where id in ${sql(input.feedbackIds)} or organization_id in ${sql(input.orgIds)} or user_id in ${sql(input.userIds)}) as feedback_count,
      (select count(*)::int from users where id in ${sql(input.userIds)} or email in ${sql(input.emails)} or organization_id in ${sql(input.orgIds)}) as public_user_count,
      (select count(*)::int from auth.users where id in ${sql(input.userIds)} or email in ${sql(input.emails)}) as auth_user_count,
      (select count(*)::int from organizations where id in ${sql(input.orgIds)} or name in ${sql(input.orgNames)}) as org_count
  `;
  const row = rows[0];
  assert(row.feedback_count === 0, "cleanup left feedback rows");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.org_count === 0, "cleanup left organizations");
}

async function cleanupR2Objects(bucket, keys) {
  for (const key of [...new Set(keys)].sort()) {
    assertSafeFeedbackKey(key);
    await deleteLocalR2ObjectWithRetry(bucket, key);
  }
}

async function assertR2ObjectsMissing(bucket, keys) {
  for (const key of [...new Set(keys)].sort()) {
    await assertLocalR2ObjectMissing(bucket, key);
  }
}

async function deleteLocalR2ObjectWithRetry(bucket, key) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await execFileAsync(
        process.execPath,
        [
          WRANGLER_BIN,
          "r2",
          "object",
          "delete",
          `${bucket}/${key}`,
          "--local",
          "--force",
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWranglerR2Error(error)) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function assertLocalR2ObjectMissing(bucket, key) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
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
          devNull,
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
      fail(`local R2 object still exists after cleanup: ${bucket}/${key}`);
    } catch (error) {
      if (isMissingLocalR2Object(error)) return;
      lastError = error;
      if (!isRetryableWranglerR2Error(error)) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function startExternalStub(baseUrl) {
  const url = new URL(baseUrl);
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const requestUrl = new URL(request.url ?? "/", baseUrl);
    let json = null;
    if (body && request.headers["content-type"]?.includes("application/json")) {
      json = JSON.parse(body);
    }
    requests.push({
      method: request.method ?? "GET",
      path: requestUrl.pathname,
      body,
      json,
      headers: request.headers,
    });

    response.setHeader("content-type", "application/json");
    if (requestUrl.pathname === "/turnstile") {
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (requestUrl.pathname === "/emails") {
      response.end(JSON.stringify({ id: `email_${requests.length}` }));
      return;
    }
    response.statusCode = 404;
    response.end(
      JSON.stringify({ error: "unhandled local feedback stub path" }),
    );
  });
  await new Promise((resolveListen) => {
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
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
      `APP_BASE_URL:${input.baseUrl}`,
      "--var",
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      "RESEND_API_KEY:local-feedback-e2e-resend-key",
      "--var",
      `RESEND_API_BASE_URL:${input.stubUrl}`,
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
      "--var",
      "ADMIN_NOTIFICATION_EMAIL:admin-feedback-e2e@capveri.local",
      "--var",
      `TURNSTILE_SITEVERIFY_URL:${input.stubUrl}/turnstile`,
      "--var",
      "TURNSTILE_SECRET_KEY:local-feedback-e2e-turnstile-secret",
      "--var",
      "DOCUMENT_ACCESS_SIGNING_SECRET:local-feedback-e2e-signing-secret",
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
        if (child.pid) await killProcessTree(child.pid);
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-feedback-e2e-"));
  const path = resolve(directory, ".dev.vars.local-feedback-e2e");
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
      `APP_BASE_URL=${input.baseUrl}`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "RESEND_API_KEY=local-feedback-e2e-resend-key",
      `RESEND_API_BASE_URL=${input.stubUrl}`,
      "RESEND_FROM_ADDRESS=CapVeri <local@capveri.local>",
      "ADMIN_NOTIFICATION_EMAIL=admin-feedback-e2e@capveri.local",
      `TURNSTILE_SITEVERIFY_URL=${input.stubUrl}/turnstile`,
      "TURNSTILE_SECRET_KEY=local-feedback-e2e-turnstile-secret",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-feedback-e2e-signing-secret",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
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
  env.APP_BASE_URL = input.baseUrl;
  env.POSTHOG_PROJECT_API_KEY = "";
  env.POSTHOG_HOST = "http://127.0.0.1:9";
  env.RESEND_API_KEY = "local-feedback-e2e-resend-key";
  env.RESEND_API_BASE_URL = input.stubUrl;
  env.RESEND_FROM_ADDRESS = "CapVeri <local@capveri.local>";
  env.ADMIN_NOTIFICATION_EMAIL = "admin-feedback-e2e@capveri.local";
  env.TURNSTILE_SITEVERIFY_URL = `${input.stubUrl}/turnstile`;
  env.TURNSTILE_SECRET_KEY = "local-feedback-e2e-turnstile-secret";
  env.DOCUMENT_ACCESS_SIGNING_SECRET = "local-feedback-e2e-signing-secret";
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
      globalThis.clearTimeout(timeout);
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      globalThis.clearTimeout(timeout);
      resolveConnect(false);
    });
  });
}

async function waitForStubRequest(stub, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const match = stub.requests.slice(input.start).find(input.predicate);
    if (match) return match;
    await sleep(100);
  }
  fail(input.message);
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
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "",
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
  if (!response.ok) return undefined;
  return body.access_token;
}

function tamperedScreenshotUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set("signature", "0".repeat(64));
  return url.toString();
}

function expiredScreenshotUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set("expires", "1");
  return url.toString();
}

function jsonAuthHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
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
    fail(`${label} must point at localhost or loopback`);
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
    fail("database-url must be a valid Postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must use postgres or postgresql");
  }
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at localhost or loopback");
  if (url.port !== "54322" || url.pathname !== "/postgres") {
    fail(
      "database-url must be the local Supabase Postgres database at postgresql://postgres:postgres@127.0.0.1:54322/postgres",
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

function assertSafeFeedbackKey(key) {
  assert(key.startsWith("feedback/"), `refusing non-feedback key: ${key}`);
  assert(!key.startsWith("/"), `refusing absolute key: ${key}`);
  assert(!key.includes("\\"), `refusing Windows-style key: ${key}`);
  assert(
    !key
      .split("/")
      .some((part) => part === "" || part === "." || part === ".."),
    `refusing unsafe key: ${key}`,
  );
}

function isMissingLocalR2Object(error) {
  return wranglerErrorText(error).includes("The specified key does not exist");
}

function isRetryableWranglerR2Error(error) {
  const text = wranglerErrorText(error);
  return (
    text.includes("SQLITE_BUSY") ||
    text.includes("database is locked") ||
    text.includes("internal error")
  );
}

function wranglerErrorText(error) {
  if (!error || typeof error !== "object") return String(error);
  return `${error.message ?? ""}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`;
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
