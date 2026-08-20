import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clearTimeout } from "node:timers";
import { TextDecoder } from "node:util";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

// End-to-end AI-CS round-trip harness. Drives the REAL request flow with no
// internal mocking: browser -> CapVeri BFF /api/v1/ai-cs/sign -> ventora
// ai-cs-worker /v1/sessions|/v1/chat|/v1/escalations -> signed app-context fetch
// back into the CapVeri backend -> OpenRouter (the only external boundary, called
// for real with ZDR). Seeds one Supabase landlord, exercises the happy path, a
// beginner Q&A eval, and worker/BFF boundary security checks, then cleans up
// every seeded row and asserts zero remain.

const BACKEND_BASE_URL = "http://127.0.0.1:8824";
const WORKER_BASE_URL = "http://127.0.0.1:8833";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const ALLOWED_ORIGIN = "https://app.capveri.com";
const APP_ID = "capveri";

const BACKEND_WRANGLER_BIN = resolve(
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
// The ventora monorepo is a sibling checkout of this repo under a shared
// parent directory. Allow an override but default to that layout.
const WORKER_DIR =
  process.env.AI_CS_WORKER_DIR ??
  resolve(__dirname, "..", "..", "..", "ventora-platform", "packages", "ai-cs-worker");
const WORKER_WRANGLER_BIN = resolve(
  WORKER_DIR,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

// Shared HMAC secrets the two workers must agree on. These are throwaway local
// test values, not production secrets.
const CLIENT_ASSERTION_SECRET = "local-ai-cs-assertion-secret";
const CONTEXT_SECRET = "local-ai-cs-context-secret";

const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";

const BEGINNER_QUESTIONS = [
  "I've never used this. What is CapVeri and what do I do first?",
  "How do I run a CAM reconciliation?",
  "Where do I upload my rent roll?",
];

// Words that would betray internal jargon / codenames leaking into a user answer.
const FORBIDDEN_JARGON = [
  "anti-integration",
  "operation sovereign wedge",
  "sovereign wedge",
  "tofu",
  "mofu",
  "bofu",
  "lead magnet",
  "buyer persona",
  "nurture sequence",
];

// Real ERP-integration brand names the assistant must never claim CapVeri
// connects to (file imports only).
const FORBIDDEN_INTEGRATIONS = ["yardi", "mri", "realpage"];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) fail("Refusing to run local AI-CS round-trip E2E in CI.");

  const supabaseUrl = DEFAULT_SUPABASE_URL;
  const databaseUrl = normalizedLocalDatabaseUrl(
    process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ])) ??
    LOCAL_ANON_KEY;

  await assertWorkerSourcePresent();
  await assertPortAvailable(BACKEND_BASE_URL);
  await assertPortAvailable(WORKER_BASE_URL);

  const backend = await startBackendWorker({ databaseUrl, supabaseUrl });
  let worker;
  let runError;
  const closeErrors = [];
  try {
    worker = await startCsWorker();
    const summary = await runScenario({
      supabaseUrl,
      databaseUrl,
      anonKey,
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    runError = error;
  } finally {
    if (worker) {
      try {
        await worker.close();
      } catch (error) {
        closeErrors.push(`worker close: ${errorMessage(error)}`);
      }
    }
    try {
      await backend.close();
    } catch (error) {
      closeErrors.push(`backend close: ${errorMessage(error)}`);
    }
  }
  if (runError && closeErrors.length > 0) {
    console.error(`Cleanup errors after failure: ${closeErrors.join("; ")}`);
  }
  if (runError) throw runError;
  if (closeErrors.length > 0) fail(closeErrors.join("; "));
}

async function runScenario(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let runError;
  let cleanupError;
  let summary;
  try {
    summary = await exerciseRoundTrip(account);
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, account.generated);
      await assertCleanupComplete(sql, account.generated);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  if (runError && cleanupError) {
    console.error(
      `Cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return summary;
}

async function exerciseRoundTrip(account) {
  // 1. Create a session via the real BFF-sign -> worker handshake.
  const sessionBody = { appId: APP_ID, userId: account.userId };
  const sessionId = await createSession(account, sessionBody);

  // 2. Beginner Q&A eval over the real OpenRouter primary model.
  const evals = [];
  let currentPath = "/reconciliations";
  for (const question of BEGINNER_QUESTIONS) {
    const answer = await runChatTurn({
      account,
      sessionId,
      message: question,
      currentPath,
    });
    assertBeginnerAnswer(question, answer);
    evals.push({
      question,
      answer_chars: answer.text.length,
      delta_events: answer.deltaCount,
      saw_done: answer.sawDone,
      excerpt: excerpt(answer.text, 320),
    });
    // Vary the screen so currentPath grounding is exercised across turns.
    currentPath = "/properties";
  }

  // 3. Escalation: HTTP 202 with a queued receipt.
  const escalation = await requestEscalation({
    account,
    sessionId,
    reason: "needs_human",
    message: "I want to confirm my reconciliation totals with a person.",
  });
  assert(
    escalation.status === "queued" &&
      typeof escalation.escalationId === "string" &&
      escalation.escalationId.length > 0,
    `escalation receipt malformed: ${safeJson(escalation)}`,
  );

  // 4. Boundary / security checks.
  const security = await runSecurityChecks(account, sessionId);

  return {
    ok: true,
    backend_base_url: BACKEND_BASE_URL,
    worker_base_url: WORKER_BASE_URL,
    user_id: account.userId,
    organization_id: account.organizationId,
    session_id: sessionId,
    escalation_id: escalation.escalationId,
    evals,
    security,
  };
}

async function createSession(account, sessionBody) {
  const assertion = await signWithBff(account, {
    method: "POST",
    path: "/v1/sessions",
    body: sessionBody,
  });
  const response = await workerFetch("/v1/sessions", {
    account,
    assertion,
    body: sessionBody,
    expectStatus: 201,
  });
  const json = await response.json();
  assert(
    typeof json.sessionId === "string" && json.sessionId.length > 0,
    `session create returned no sessionId: ${safeJson(json)}`,
  );
  return json.sessionId;
}

async function runChatTurn({ account, sessionId, message, currentPath }) {
  const body = { appId: APP_ID, userId: account.userId, sessionId, message };
  if (currentPath !== undefined) body.currentPath = currentPath;
  const assertion = await signWithBff(account, {
    method: "POST",
    path: "/v1/chat",
    body,
  });
  const response = await workerFetch("/v1/chat", {
    account,
    assertion,
    body,
    expectStatus: 200,
  });
  const contentType = response.headers.get("content-type") ?? "";
  assert(
    contentType.includes("text/event-stream"),
    `chat response is not an SSE stream: ${contentType}`,
  );
  return consumeChatStream(response);
}

// Stream the SSE body, reassembling message.delta tokens and confirming the
// stream closes cleanly with a message.done. Asserting on the live stream (not a
// buffered body) verifies the worker actually streams tokens end to end.
async function consumeChatStream(response) {
  const reader = response.body?.getReader();
  assert(Boolean(reader), "chat SSE response had no readable body");
  const decoder = new TextDecoder();
  let raw = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();

  let text = "";
  let deltaCount = 0;
  let sawDone = false;
  let sawError = false;
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!eventLine || !dataLine) continue;
    const event = eventLine.slice("event:".length).trim();
    let data;
    try {
      data = JSON.parse(dataLine.slice("data:".length).trim());
    } catch {
      continue;
    }
    if (event === "message.delta" && typeof data.delta === "string") {
      text += data.delta;
      deltaCount += 1;
    } else if (event === "message.done") {
      sawDone = true;
    } else if (event === "error") {
      sawError = true;
    }
  }
  assert(!sawError, "chat stream emitted an error event");
  assert(sawDone, "chat stream did not complete with message.done");
  return { text: text.trim(), deltaCount, sawDone };
}

async function requestEscalation({ account, sessionId, reason, message }) {
  const body = { appId: APP_ID, userId: account.userId, sessionId, reason, message };
  const assertion = await signWithBff(account, {
    method: "POST",
    path: "/v1/escalations",
    body,
  });
  const response = await workerFetch("/v1/escalations", {
    account,
    assertion,
    body,
    expectStatus: 202,
  });
  return response.json();
}

async function runSecurityChecks(account, sessionId) {
  // (a) Worker rejects a /v1/chat whose userId does not own the session. The
  // assertion is validly signed for the tampered body, so this proves the worker
  // re-checks body ownership against the session (not just the signature).
  const foreignUserId = randomUUID();
  const foreignBody = {
    appId: APP_ID,
    userId: foreignUserId,
    sessionId,
    message: "Whose data is this?",
  };
  // BFF would refuse to sign a userId != actor; mint the assertion directly so
  // we isolate the WORKER's session-ownership guard rather than the BFF's.
  const foreignAssertion = await mintAssertion({
    method: "POST",
    path: "/v1/chat",
    body: foreignBody,
  });
  const ownerMismatch = await workerFetch("/v1/chat", {
    account,
    assertion: foreignAssertion,
    body: foreignBody,
    expectStatus: 401,
  });
  await ownerMismatch.text();

  // (b) Worker rejects a tampered assertion (signature does not match the body).
  const validBody = {
    appId: APP_ID,
    userId: account.userId,
    sessionId,
    message: "ping",
  };
  const tamperedAssertion = await mintAssertion({
    method: "POST",
    path: "/v1/chat",
    body: validBody,
    secretOverride: "wrong-assertion-secret",
  });
  const tampered = await workerFetch("/v1/chat", {
    account,
    assertion: tamperedAssertion,
    body: validBody,
    expectStatus: 401,
  });
  await tampered.text();

  // (c) BFF refuses to sign a non-allow-listed worker path.
  const forbidden = await fetch(`${BACKEND_BASE_URL}/api/v1/ai-cs/sign`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${account.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      method: "POST",
      path: "/v1/admin",
      body: { appId: APP_ID, userId: account.userId },
    }),
  });
  const forbiddenBody = await forbidden.json().catch(() => ({}));
  assert(
    forbidden.status === 403 &&
      (forbiddenBody?.error?.code ?? forbiddenBody?.code) === "path_not_allowed",
    `BFF did not refuse non-allowlisted path: ${forbidden.status} ${safeJson(forbiddenBody)}`,
  );

  return {
    worker_rejects_owner_mismatch: true,
    worker_rejects_tampered_assertion: true,
    bff_refuses_unlisted_path: true,
  };
}

function assertBeginnerAnswer(question, answer) {
  assert(
    answer.text.length >= 40,
    `answer to "${question}" too short (${answer.text.length} chars): ${answer.text}`,
  );
  assert(
    answer.deltaCount >= 1,
    `answer to "${question}" streamed no delta events`,
  );
  const lower = answer.text.toLowerCase();
  for (const phrase of FORBIDDEN_JARGON) {
    assert(
      !lower.includes(phrase),
      `answer to "${question}" leaked internal jargon "${phrase}": ${answer.text}`,
    );
  }
  // The assistant must not claim a live ERP integration. Allow the brand name
  // only when it is explicitly negated (e.g. "no Yardi integration").
  for (const brand of FORBIDDEN_INTEGRATIONS) {
    if (!lower.includes(brand)) continue;
    const negated = new RegExp(
      `\\b(no|not|without|don't|do not|cannot|can't|no need)\\b[^.]{0,40}\\b${brand}\\b|\\b${brand}\\b[^.]{0,40}\\b(not|isn't|aren't|no integration|import)`,
      "iu",
    );
    assert(
      negated.test(answer.text),
      `answer to "${question}" claims a "${brand}" integration that does not exist: ${answer.text}`,
    );
  }
  // Grounding: the answer should reference real CapVeri navigation/workflow
  // concepts present in the signed context, not generic filler.
  const groundingTerms = [
    "reconcil",
    "rent roll",
    "lease",
    "cam",
    "property",
    "properties",
    "upload",
    "import",
    "expense",
    "pool",
  ];
  assert(
    groundingTerms.some((term) => lower.includes(term)),
    `answer to "${question}" is not grounded in CapVeri concepts: ${answer.text}`,
  );
}

// ---- BFF signing + worker calls ------------------------------------------

async function signWithBff(account, { method, path, body }) {
  const response = await fetch(`${BACKEND_BASE_URL}/api/v1/ai-cs/sign`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${account.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ method, path, body }),
  });
  if (!response.ok) {
    const text = await response.text();
    fail(
      `BFF /ai-cs/sign for ${path} returned ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  const json = await response.json();
  assert(
    typeof json.timestamp === "string" &&
      typeof json.nonce === "string" &&
      typeof json.signature === "string",
    `BFF /ai-cs/sign returned malformed assertion: ${safeJson(json)}`,
  );
  return { timestamp: json.timestamp, nonce: json.nonce, signature: json.signature };
}

// Mint an assertion locally (bypassing the BFF) so security checks can craft
// bodies the BFF would refuse to sign. Mirrors the BFF's signing contract.
async function mintAssertion({ method, path, body, secretOverride }) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID().replace(/-/gu, "");
  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method,
    path,
    body,
  });
  const signature = signHmacPayload(payload, secretOverride ?? CLIENT_ASSERTION_SECRET);
  return { timestamp, nonce, signature };
}

async function workerFetch(path, { account, assertion, body, expectStatus }) {
  const response = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${account.accessToken}`,
      "content-type": "application/json",
      origin: ALLOWED_ORIGIN,
      "x-ventora-client": "capveri-app",
      "X-Ventora-Timestamp": assertion.timestamp,
      "X-Ventora-Nonce": assertion.nonce,
      "X-Ventora-Signature": assertion.signature,
    },
    body: JSON.stringify(body),
  });
  if (response.status !== expectStatus) {
    const text = await response.text();
    fail(
      `worker POST ${path} returned ${response.status}, expected ${expectStatus}: ${text.slice(0, 500)}`,
    );
  }
  return response;
}

// ---- HMAC (mirrors signing.ts / contracts stableJson) --------------------

async function buildHmacPayload(input) {
  const bodyHash = sha256Hex(stableJson(input.body));
  return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${
    input.path
  }.${bodyHash}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function signHmacPayload(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(sortStable(value));
}

function sortStable(value) {
  if (Array.isArray(value)) return value.map(sortStable);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) sorted[key] = sortStable(value[key]);
    }
    return sorted;
  }
  return value;
}

// ---- Supabase seed + cleanup (mirrors local-ai-context-e2e.mjs) ----------

async function seedAccount(input) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  return createLocalAuthUser(input, {
    email: `ai-cs-roundtrip-${suffix}@capveri.local`,
    password: "AiCsRoundtripPassAa1!",
    fullName: `Local AI-CS Roundtrip ${suffix}`,
    organizationName: `Local AI-CS Roundtrip Org ${suffix}`,
    role: "owner",
  });
}

async function createLocalAuthUser(input, user) {
  const partial = {
    ...user,
    userId: "",
    organizationId: "",
    accessToken: "",
    generated: {
      orgIds: [],
      userIds: [],
      emails: [user.email],
      orgNames: [user.organizationName],
    },
  };
  try {
    const response = await fetch(new URL("/auth/v1/signup", input.supabaseUrl), {
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
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
    const userId = body.user?.id;
    assert(typeof userId === "string" && userId !== "", "signup user id missing");
    partial.userId = userId;
    partial.generated.userIds.push(userId);
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    let organizationId;
    try {
      await sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
      await sql`update users set role = ${user.role}, full_name = ${user.fullName}, updated_at = now() where id = ${userId}`;
      const rows =
        await sql`select organization_id from users where id = ${userId} limit 1`;
      organizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }
    assert(
      typeof organizationId === "string" && organizationId !== "",
      "organization id missing",
    );
    partial.organizationId = organizationId;
    partial.generated.orgIds.push(organizationId);
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
    await cleanupSeededAccounts(input.databaseUrl, partial.generated);
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

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_ai_cs_roundtrip_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_ai_cs_roundtrip_none__");
  await sql.begin(async (transaction) => {
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
  const emails = nonEmpty(input.emails, "__local_ai_cs_roundtrip_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_ai_cs_roundtrip_none__");
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function cleanupSeededAccounts(databaseUrl, generated) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, generated);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---- Worker process orchestration ----------------------------------------

async function startBackendWorker(input) {
  const port = new URL(BACKEND_BASE_URL).port;
  const env = { ...process.env };
  for (const key of [
    "AUTH_JWT_AUDIENCE",
    "AUTH_JWT_ISSUER",
    "POSTGREST_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "HYPERDRIVE",
  ]) {
    delete env[key];
  }
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  return startWranglerDev({
    label: "backend",
    bin: BACKEND_WRANGLER_BIN,
    cwd: process.cwd(),
    baseUrl: BACKEND_BASE_URL,
    env,
    args: [
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      port,
      "--local",
      "--show-interactive-dev-session",
      "false",
      "--var",
      `AI_CS_CLIENT_ASSERTION_SECRET:${CLIENT_ASSERTION_SECRET}`,
      "--var",
      `AI_CS_CONTEXT_SECRET:${CONTEXT_SECRET}`,
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
    ],
  });
}

async function startCsWorker() {
  const port = new URL(WORKER_BASE_URL).port;
  const backendPort = new URL(BACKEND_BASE_URL).port;
  const contextEndpoints = JSON.stringify({
    [APP_ID]: `http://127.0.0.1:${backendPort}/api/v1/ai-cs/app-context`,
  });
  const env = { ...process.env };
  // Force the worker into a dev mode that permits a localhost context endpoint.
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  return startWranglerDev({
    label: "ai-cs-worker",
    bin: WORKER_WRANGLER_BIN,
    cwd: WORKER_DIR,
    baseUrl: WORKER_BASE_URL,
    env,
    args: [
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      port,
      "--local",
      "--show-interactive-dev-session",
      "false",
      // Rely on .dev.vars for OPENROUTER_API_KEY + model IDs (pass-through).
      "--var",
      `AI_CS_CLIENT_ASSERTION_SECRET:${CLIENT_ASSERTION_SECRET}`,
      "--var",
      `AI_CS_CONTEXT_SECRET:${CONTEXT_SECRET}`,
      "--var",
      `AI_CS_CONTEXT_ENDPOINTS:${contextEndpoints}`,
      "--var",
      `AI_CS_ALLOWED_ORIGINS:${ALLOWED_ORIGIN}`,
      "--var",
      "ENVIRONMENT:development",
    ],
  });
}

async function startWranglerDev(input) {
  const child = spawn(process.execPath, [input.bin, ...input.args], {
    cwd: input.cwd,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  const record = (chunk) => {
    output += chunk.toString();
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  let childError;
  child.once("error", (error) => {
    childError = error;
    output += `\n${input.label} spawn error: ${errorMessage(error)}`;
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0)
      output += `\n${input.label} wrangler dev exited with ${code}`;
  });
  const handle = {
    close: async () => {
      if (child.pid) await killProcessTree(child.pid);
      await waitForPortClosed(input.baseUrl);
    },
  };
  try {
    await waitForHealth(input.baseUrl, () => output, input.label);
    if (childError) fail(`${input.label} failed to spawn\n${output.slice(-2000)}`);
    if (child.exitCode !== null)
      fail(`${input.label} exited before health\n${output.slice(-2000)}`);
    return handle;
  } catch (error) {
    try {
      await handle.close();
    } catch (closeError) {
      console.error(
        `${input.label} cleanup failed after startup failure: ${errorMessage(closeError)}`,
      );
    }
    throw error;
  }
}

async function assertWorkerSourcePresent() {
  try {
    await readFile(resolve(WORKER_DIR, "wrangler.toml"), "utf8");
  } catch {
    fail(`ai-cs-worker not found at ${WORKER_DIR}`);
  }
  try {
    await readFile(WORKER_WRANGLER_BIN, "utf8");
  } catch {
    fail(
      `ai-cs-worker wrangler not installed; run npm install in ${WORKER_DIR}`,
    );
  }
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

async function waitForHealth(baseUrl, output, label) {
  const deadline = Date.now() + 90_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        await response.text();
        return;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  fail(`${label} health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForPortClosed(baseUrl) {
  const url = new URL(baseUrl);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  // Do not hard-fail close on a lingering port; report it so a failure in the
  // scenario is still the surfaced error.
  console.error(`${baseUrl} still accepts TCP connections after close`);
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

// ---- helpers --------------------------------------------------------------

function normalizedLocalDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    fail("database-url must be Postgres");
  if (!isLoopbackHost(url.hostname)) fail("database-url must point at loopback");
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

function excerpt(text, max) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}...`;
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

function assert(condition, message) {
  if (!condition) fail(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
