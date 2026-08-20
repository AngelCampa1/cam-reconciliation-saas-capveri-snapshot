import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8823";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const SDR_SECRET = "local-ai-sdr-context-secret";
const CS_SECRET = "local-ai-cs-context-secret";
const EXPECTED_PRICING_FEATURES = [
  "CAM reconciliation",
  "Run lease-accurate CAM reconciliation without spreadsheet drift.",
  "Minimum subscription includes up to 25 active rentable units",
  "Audience: Commercial landlords and property managers",
  "Portfolio: Starts at $4,990/year for up to 25 rentable units",
];
const PUBLIC_CALENDAR_DOMAIN_PATTERN =
  /\b(?:https?:\/\/)?(?:[\w-]+\.)?(?:cal\.com|calendly\.com)\b/iu;
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";

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
    fail(`local AI context E2E always owns ${DEFAULT_BASE_URL}`);
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

  if (process.env.CI) fail("Refusing to run local AI context E2E in CI.");
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
      `Local AI context Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let runError;
  let cleanupError;
  let result;

  try {
    const sdrPath = "/api/v1/ai-sdr/product-context?productId=capveri";
    const sdrHeaders = await signedHeaders({
      path: sdrPath,
      secret: SDR_SECRET,
      body: { productId: "capveri" },
      nonce: `sdr-${input.index}-${randomUUID()}`,
    });
    const sdrResponse = await expectFetch(`${input.baseUrl}${sdrPath}`, {
      headers: sdrHeaders,
      status: 200,
    });
    const sdrBody = await sdrResponse.json();
    assertSdrContextContract(sdrBody, sdrResponse);
    assertNoPublicCalendarDomains(sdrBody, "SDR");
    await assertResponseSignature(sdrResponse, {
      path: sdrPath,
      secret: SDR_SECRET,
      body: sdrBody,
      label: "SDR",
    });

    await expectError(`${input.baseUrl}${sdrPath}`, {
      headers: sdrHeaders,
      status: 401,
      code: "invalid_signature",
    });

    const aliasPath = "/api/v1/ai-sdr/product-context?product_id=capveri";
    const alias = await expectJson(`${input.baseUrl}${aliasPath}`, {
      headers: await signedHeaders({
        path: aliasPath,
        secret: SDR_SECRET,
        body: { productId: "capveri" },
      }),
      status: 200,
    });
    assert(alias.productId === "capveri", "SDR alias product id mismatch");

    const badSdrSignature = await signedHeaders({
      path: sdrPath,
      secret: "wrong-secret",
      body: { productId: "capveri" },
    });
    await expectError(`${input.baseUrl}${sdrPath}`, {
      headers: badSdrSignature,
      status: 401,
      code: "invalid_signature",
    });

    const unknownSdrPath = "/api/v1/ai-sdr/product-context?productId=other";
    await expectError(`${input.baseUrl}${unknownSdrPath}`, {
      headers: await signedHeaders({
        path: unknownSdrPath,
        secret: SDR_SECRET,
        body: { productId: "other" },
      }),
      status: 404,
      code: "unknown_product",
    });

    const rawCurrentPath =
      "https://app.capveri.com/properties/33333333-3333-3333-3333-333333333333/reconciliations?token=secret";
    const csPath = `/api/v1/ai-cs/app-context?appId=capveri&userId=${account.userId}&currentPath=${encodeURIComponent(rawCurrentPath)}`;
    const csHeaders = {
      authorization: `Bearer ${account.accessToken}`,
      ...(await signedHeaders({
        path: csPath,
        secret: CS_SECRET,
        body: {
          appId: "capveri",
          userId: account.userId,
          currentPath: rawCurrentPath,
        },
        nonce: `cs-${input.index}-${randomUUID()}`,
      })),
    };
    const csResponse = await expectFetch(`${input.baseUrl}${csPath}`, {
      headers: csHeaders,
      status: 200,
    });
    const csBody = await csResponse.json();
    assertCsContextContract(csBody, csResponse);
    assertNoPublicCalendarDomains(csBody, "CS");
    await assertResponseSignature(csResponse, {
      path: csPath,
      secret: CS_SECRET,
      body: csBody,
      label: "CS",
    });

    await expectError(`${input.baseUrl}${csPath}`, {
      headers: csHeaders,
      status: 401,
      code: "invalid_signature",
    });

    const missingAuthHeaders = await signedHeaders({
      path: csPath,
      secret: CS_SECRET,
      body: {
        appId: "capveri",
        userId: account.userId,
        currentPath: rawCurrentPath,
      },
      nonce: `cs-missing-auth-${input.index}-${randomUUID()}`,
    });
    await expectError(`${input.baseUrl}${csPath}`, {
      headers: missingAuthHeaders,
      status: 401,
      code: "authorization_required",
    });

    const mismatchUserId = randomUUID();
    const mismatchPath = `/api/v1/ai-cs/app-context?appId=capveri&userId=${mismatchUserId}`;
    await expectError(`${input.baseUrl}${mismatchPath}`, {
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        ...(await signedHeaders({
          path: mismatchPath,
          secret: CS_SECRET,
          body: { appId: "capveri", userId: mismatchUserId },
        })),
      },
      status: 403,
      code: "user_context_mismatch",
    });

    const invalidCsPath = `/api/v1/ai-cs/app-context?appId=capveri&userId=${account.userId}`;
    await expectError(`${input.baseUrl}${invalidCsPath}`, {
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        ...(await signedHeaders({
          path: invalidCsPath,
          secret: "wrong-secret",
          body: { appId: "capveri", userId: account.userId },
        })),
      },
      status: 401,
      code: "invalid_signature",
    });

    result = {
      index: input.index,
      user_id: account.userId,
      organization_id: account.organizationId,
      sdr_sources: sdrBody.sources.length,
      cs_navigation_items: csBody.navigation.length,
    };
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
      `Local AI context cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  return createLocalAuthUser(input, {
    email: `ai-context-${suffix}@capveri.local`,
    password: `AiContextPass${input.index}Aa1!`,
    fullName: `Local AI Context ${suffix}`,
    organizationName: `Local AI Context Org ${suffix}`,
    role: "owner",
  });
}

async function createLocalAuthUser(input, user) {
  const partial = {
    ...user,
    userId: "",
    signupOrganizationId: "",
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
      fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
    const userId = body.user?.id;
    assert(
      typeof userId === "string" && userId !== "",
      "signup user id missing",
    );
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
    partial.signupOrganizationId = organizationId;
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
  const emails = nonEmpty(input.emails, "__local_ai_context_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_ai_context_e2e_none__");
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
  const emails = nonEmpty(input.emails, "__local_ai_context_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_ai_context_e2e_none__");
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

async function signedHeaders(input) {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? randomUUID().replace(/-/gu, "");
  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path: input.path,
    body: input.body,
  });
  return {
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": signHmacPayload(payload, input.secret),
  };
}

async function assertResponseSignature(response, input) {
  const timestamp = response.headers.get("x-ventora-timestamp");
  const nonce = response.headers.get("x-ventora-nonce");
  const signature = response.headers.get("x-ventora-signature");
  assert(Boolean(timestamp), `${input.label} response timestamp missing`);
  assert(Boolean(nonce), `${input.label} response nonce missing`);
  assert(Boolean(signature), `${input.label} response signature missing`);
  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path: input.path,
    body: input.body,
  });
  assert(
    signature === signHmacPayload(payload, input.secret),
    `${input.label} response signature mismatch`,
  );
  assert(
    response.headers.get("cache-control") === "private, max-age=300",
    `${input.label} cache-control mismatch`,
  );
}

function assertSdrContextContract(body, response) {
  assertCacheControl(response, "SDR");
  assert(body.productId === "capveri", "SDR product id mismatch");
  assert(body.name === "CapVeri", "SDR product name mismatch");
  assert(
    typeof body.description === "string" && body.description.includes("CAM"),
    "SDR description mismatch",
  );
  assert(Array.isArray(body.sources), "SDR sources should be an array");
  assert(body.sources[0]?.id === "pricing", "SDR first source mismatch");
  const compliance = body.sources.find(
    (source) => source.id === "compliance-claims",
  );
  assert(compliance, "SDR compliance source missing");
  assert(
    compliance.url === "https://www.capveri.com/sources",
    "SDR compliance source URL mismatch",
  );
  assert(
    body.sources.every((source) => !source.url.endsWith("/security")),
    "SDR source URL leaked /security",
  );
  const plan = body.plans?.[0];
  assert(plan, "SDR first pricing plan missing");
  assert(plan.defaultCadence === "year", "SDR default cadence mismatch");
  assert(
    typeof plan.ctaUrl === "string" && plan.ctaUrl.includes("offer=80OFF"),
    "SDR pricing CTA offer mismatch",
  );
  const features = plan.features ?? [];
  for (const feature of EXPECTED_PRICING_FEATURES) {
    assert(
      features.includes(feature),
      `SDR pricing feature missing: ${feature}`,
    );
  }
  assertMeetingLinks(body.meetingLinks, "SDR");
}

function assertCsContextContract(body, response) {
  assertCacheControl(response, "CS");
  assert(body.assistantId === "ai-cs", "CS assistant id mismatch");
  assert(body.appId === "capveri", "CS app id mismatch");
  assert(body.appName === "CapVeri", "CS app name mismatch");
  assert(body.authenticatedOnly === true, "CS authenticated flag mismatch");
  assert(
    body.currentPath ===
      "/properties/33333333-3333-3333-3333-333333333333/reconciliations",
    "CS currentPath sanitization mismatch",
  );
  assert(Array.isArray(body.navigation), "CS navigation should be an array");
  assert(body.navigation.length > 0, "CS navigation should not be empty");
  for (const [index, item] of body.navigation.entries()) {
    assert(
      typeof item.path === "string" && /^\/.+/u.test(item.path),
      `CS navigation ${index} path mismatch`,
    );
    assert(
      typeof item.label === "string" && item.label !== "",
      `CS navigation ${index} label missing`,
    );
  }
  assert(Array.isArray(body.workflow), "CS workflow should be an array");
  assert(
    body.workflow
      .slice(0, 2)
      .map((step) => step.id)
      .join(",") === "run-reconciliation,map-expense-pools",
    "CS reconciliation workflow ids mismatch",
  );
  assert(
    body.workflow[0]?.status === "current",
    "CS first workflow status mismatch",
  );
  assert(
    body.workflow[0]?.label === "Review and calculate CAM recovery",
    "CS first workflow label mismatch",
  );
  assert(
    body.workflow[0]?.path === "/reconciliations",
    "CS first workflow path mismatch",
  );
  assertMeetingLinks(body.meetingLinks, "CS");
}

function assertCacheControl(response, label) {
  assert(
    response.headers.get("cache-control") === "private, max-age=300",
    `${label} cache-control mismatch`,
  );
}

function assertMeetingLinks(links, label) {
  assert(Array.isArray(links), `${label} meeting links should be an array`);
  assert(
    links.length === 0,
    `${label} should not expose public meeting links`,
  );
}

function assertNoPublicCalendarDomains(body, label) {
  assert(
    !PUBLIC_CALENDAR_DOMAIN_PATTERN.test(JSON.stringify(body)),
    `${label} context leaked a public calendar domain`,
  );
}

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
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJson(entryValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function startWorkerServer(input) {
  const port = new URL(input.baseUrl).port;
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
      "--var",
      `AI_SDR_PRODUCT_CONTEXT_SECRET:${SDR_SECRET}`,
      "--var",
      `AI_CS_CONTEXT_SECRET:${CS_SECRET}`,
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
      if (child.exitCode === null) {
        if (child.pid) await killProcessTree(child.pid);
      } else if (child.pid) {
        await killProcessTree(child.pid);
      }
      await waitForPortClosed(input.baseUrl);
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

function workerEnv(input) {
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
  env.AI_SDR_PRODUCT_CONTEXT_SECRET = SDR_SECRET;
  env.AI_CS_CONTEXT_SECRET = CS_SECRET;
  env.DB_ACCESS_MODE = "direct-postgres";
  env.DB_PRODUCTION_BOUNDARY = "direct-postgres";
  env.DATABASE_URL = input.databaseUrl;
  env.SUPABASE_URL = input.supabaseUrl;
  env.AUTH_JWKS_URL = `${input.supabaseUrl}/auth/v1/.well-known/jwks.json`;
  return env;
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

async function waitForHealth(baseUrl, output = () => "") {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await expectJson(`${baseUrl}/health`, { status: 200 });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(500);
    }
  }
  fail(`Worker health check failed: ${lastError}\n${output().slice(-2000)}`);
}

async function expectFetch(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) =>
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`),
  );
  if (response.status !== status) {
    const text = await response.text();
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return response;
}

async function expectJson(url, options = {}) {
  const response = await expectFetch(url, options);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function expectError(url, options) {
  const body = await expectJson(url, options);
  const code = body?.error?.code ?? body?.code;
  assert(
    code === options.code,
    `expected error code ${options.code}, got ${JSON.stringify(body)}`,
  );
  return body;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
    if (inlineValue !== undefined) parsed[key] = inlineValue;
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) parsed[key] = "true";
      else {
        parsed[key] = next;
        index += 1;
      }
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
  if (url.port !== "54321")
    fail("supabase-url must use the local Supabase API port 54321");
  if (url.pathname !== "/") fail("supabase-url must not include a path");
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
