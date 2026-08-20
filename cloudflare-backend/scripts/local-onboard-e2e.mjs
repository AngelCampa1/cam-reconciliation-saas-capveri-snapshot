import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8825";
const DEFAULT_RESEND_BASE_URL = "http://127.0.0.1:8826";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const UPGRADE_SUCCESS_RESPONSE = { success: true };

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
    fail(`local onboard E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const resendBaseUrl = normalizedLocalUrl(
    args["resend-base-url"] ??
      process.env.npm_config_resend_base_url ??
      DEFAULT_RESEND_BASE_URL,
    "resend-base-url",
  );
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

  if (process.env.CI) fail("Refusing to run local onboard E2E in CI.");
  await assertPortAvailable(baseUrl);
  await assertPortAvailable(resendBaseUrl);

  const resend = await startResendStub(resendBaseUrl);
  const worker = await startWorkerServer({
    baseUrl,
    resendBaseUrl,
    supabaseUrl,
    databaseUrl,
  });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      resend.clear();
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          anonKey,
          databaseUrl,
          resend,
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
      closeError ??= error;
    }
    try {
      await resend.close();
    } catch (error) {
      closeError ??= error;
    }
  }
  if (runError && closeError) {
    console.error(
      `Local onboard cleanup failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const generated = {
    orgIds: [],
    userIds: [],
    emails: [],
    orgNames: [],
  };
  let runError;
  let cleanupError;
  let result;

  try {
    await expectError(`${input.baseUrl}/api/v1/onboard/init`, {
      method: "POST",
      status: 401,
      code: "authorization_required",
      message: "Authorization header required",
    });

    const account = await createLocalAuthUser(input, {
      email: `local-onboard-${suffix}@capveri.local`,
      password: `OnboardPass${input.index}Aa1!`,
      fullName: `Local Onboard User ${suffix}`,
      organizationName: `Local Onboard Signup Org ${suffix}`,
    });
    generated.userIds.push(account.userId);
    generated.emails.push(account.email);
    generated.orgIds.push(account.signupOrganizationId);
    generated.orgNames.push(account.organizationName);

    await removePublicOnboardRows(sql, account);

    const init = await expectJson(`${input.baseUrl}/api/v1/onboard/init`, {
      method: "POST",
      headers: authHeaders(account.accessToken),
      status: 200,
    });
    assertOnboardInitResponse(init, {
      userId: account.userId,
      alreadyExisted: false,
      label: "first init response",
    });
    assert(
      init.organization_id !== account.signupOrganizationId,
      "init reused removed signup organization",
    );
    generated.orgIds.push(init.organization_id);

    await assertOnboardUser(sql, {
      userId: account.userId,
      organizationId: init.organization_id,
      email: `anon+${account.userId.slice(0, 8)}@placeholder.capveri.com`,
      organizationName: "Anonymous Org",
    });

    const repeatInit = await expectJson(
      `${input.baseUrl}/api/v1/onboard/init`,
      {
        method: "POST",
        headers: authHeaders(account.accessToken),
        status: 200,
      },
    );
    assertOnboardInitResponse(repeatInit, {
      userId: account.userId,
      organizationId: init.organization_id,
      alreadyExisted: true,
      label: "repeat init response",
    });

    await expectError(`${input.baseUrl}/api/v1/onboard/upgrade`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      status: 401,
      code: "authorization_required",
      message: "Authorization header required",
      includeDetail: false,
      body: JSON.stringify({ email: account.email }),
    });

    await expectError(`${input.baseUrl}/api/v1/onboard/upgrade`, {
      method: "PATCH",
      headers: jsonAuthHeaders(account.accessToken),
      status: 403,
      code: "email_mismatch",
      message: "Email must match the authenticated Supabase account",
      body: JSON.stringify({ email: `mismatch-${suffix}@capveri.local` }),
    });
    await assertOnboardUser(sql, {
      userId: account.userId,
      organizationId: init.organization_id,
      email: `anon+${account.userId.slice(0, 8)}@placeholder.capveri.com`,
      organizationName: "Anonymous Org",
    });
    assert(input.resend.requests.length === 0, "mismatch sent welcome email");

    const upgradedOrgName = `Local Onboard Upgraded Org ${suffix}`;
    generated.orgNames.push(upgradedOrgName);
    const upgrade = await expectJson(
      `${input.baseUrl}/api/v1/onboard/upgrade`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(account.accessToken),
        status: 200,
        body: JSON.stringify({
          email: `  ${account.email}  `,
          organization_name: `  ${upgradedOrgName}  `,
        }),
      },
    );
    assertDeepEqual(
      upgrade,
      UPGRADE_SUCCESS_RESPONSE,
      "upgrade success response",
    );
    await assertOnboardUser(sql, {
      userId: account.userId,
      organizationId: init.organization_id,
      email: account.email,
      organizationName: upgradedOrgName,
    });
    await input.resend.waitForRequests(1);
    assert(
      input.resend.requests.length === 1,
      `expected exactly one welcome email, got ${input.resend.requests.length}`,
    );
    assertWelcomeEmail(input.resend.requests[0], {
      email: account.email,
      organizationName: upgradedOrgName,
      dashboardUrl: `${input.baseUrl}/dashboard`,
    });
    await input.resend.expectNoNewRequests({
      start: 1,
      message: "upgrade sent duplicate welcome email",
    });

    result = {
      index: input.index,
      user_id: account.userId,
      organization_id: init.organization_id,
      welcome_email_count: input.resend.requests.length,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, generated);
      await assertCleanupComplete(sql, generated);
    } catch (error) {
      cleanupError ??= error;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  if (runError && cleanupError) {
    console.error(
      `Local onboard row cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function createLocalAuthUser(input, user) {
  const partial = {
    ...user,
    userId: "",
    signupOrganizationId: "",
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

    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    let organizationId;
    try {
      await sql`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = ${userId}`;
      const rows =
        await sql`select organization_id from users where id = ${userId} limit 1`;
      organizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }
    assert(
      typeof organizationId === "string" && organizationId !== "",
      "signup organization id missing",
    );
    partial.signupOrganizationId = organizationId;

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

    return {
      ...partial,
      signupOrganizationId: organizationId,
      accessToken,
    };
  } catch (error) {
    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupGeneratedRows(sql, {
        orgIds: [partial.signupOrganizationId],
        userIds: [partial.userId],
        emails: [partial.email],
        orgNames: [partial.organizationName],
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
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

async function removePublicOnboardRows(sql, account) {
  await sql.begin(async (transaction) => {
    await transaction`delete from signup_email_events where user_id = ${account.userId} or organization_id = ${account.signupOrganizationId}`;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`delete from legal_acceptances where user_id = ${account.userId} or organization_id = ${account.signupOrganizationId}`;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`delete from audit_log where changed_by = ${account.userId} or organization_id = ${account.signupOrganizationId}`;
    await transaction`delete from users where id = ${account.userId}`;
    await transaction`delete from organizations where id = ${account.signupOrganizationId}`;
  });
}

async function assertOnboardUser(sql, expected) {
  const rows = await sql`
    select u.id,
           u.organization_id,
           u.email,
           u.full_name,
           u.role,
           u.created_at,
           u.updated_at,
           o.name as organization_name,
           o.subscription_status,
           o.settings
    from users u
    join organizations o on o.id = u.organization_id
    where u.id = ${expected.userId}
    limit 1
  `;
  const row = rows[0];
  assert(row, "onboard user row missing");
  assert(
    row.organization_id === expected.organizationId,
    "organization mismatch",
  );
  assert(row.email === expected.email, `email mismatch: ${row.email}`);
  assert(row.full_name === null, `full name mismatch: ${row.full_name}`);
  assert(row.role === "owner", `role mismatch: ${row.role}`);
  assertIsoTimestamp(row.created_at, "user created_at");
  assertIsoTimestamp(row.updated_at, "user updated_at");
  assert(
    row.organization_name === expected.organizationName,
    `organization name mismatch: ${row.organization_name}`,
  );
  assert(
    row.subscription_status === "trial",
    `subscription status mismatch: ${row.subscription_status}`,
  );
  assertDeepEqual(row.settings, {}, "organization settings");
}

function assertWelcomeEmail(request, expected) {
  assert(request, "welcome email request missing");
  assert(request.method === "POST", "welcome email method mismatch");
  assert(request.path === "/emails", `unexpected Resend path: ${request.path}`);
  assert(
    String(request.headers["content-type"] ?? "").includes("application/json"),
    "welcome email content-type mismatch",
  );
  assert(
    request.headers.authorization === "Bearer local-resend-key",
    "welcome email authorization mismatch",
  );
  assertAllowedKeys(
    request.body,
    ["from", "to", "subject", "html", "text"],
    "welcome email body",
  );
  assert(
    request.body.from === "CapVeri <local@capveri.local>",
    "welcome email from mismatch",
  );
  assertDeepEqual(request.body.to, [expected.email], "welcome email to");
  assert(
    request.body.subject ===
      `Welcome to ${expected.organizationName} on CapVeri`,
    "welcome email subject mismatch",
  );
  const expectedText = [
    `Welcome to ${expected.organizationName} on CapVeri`,
    "Your CapVeri account is ready.",
    `Open CapVeri: ${expected.dashboardUrl}`,
  ].join("\n");
  assert(request.body.text === expectedText, "welcome email text mismatch");
  assert(
    String(request.body.html).includes(expected.organizationName),
    "welcome email HTML organization missing",
  );
  assert(
    String(request.body.html).includes(expected.dashboardUrl),
    "welcome email dashboard URL missing",
  );
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_onboard_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_onboard_e2e_none__");
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
  const emails = nonEmpty(input.emails, "__local_onboard_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_onboard_e2e_none__");
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
  assertDeepEqual(
    body,
    options.includeDetail === false
      ? { error: { code: options.code, message: options.message } }
      : {
          detail: options.message,
          error: { code: options.code, message: options.message },
        },
    `${options.code} response`,
  );
  return body;
}

async function startResendStub(baseUrl) {
  const url = new URL(baseUrl);
  const requests = [];
  let waiter;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    requests.push({
      method: request.method,
      path: new URL(request.url ?? "/", baseUrl).pathname,
      headers: request.headers,
      body,
    });
    waiter?.();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: `email_${requests.length}` }));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    clear: () => {
      requests.length = 0;
    },
    waitForRequests: async (count) => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (requests.length >= count) return;
        await new Promise((resolveWait) => {
          const timeout = setTimeout(resolveWait, 100);
          waiter = () => {
            clearTimeout(timeout);
            resolveWait();
          };
        });
        waiter = undefined;
      }
      fail(`timed out waiting for ${count} Resend requests`);
    },
    expectNoNewRequests: async (input) => {
      const deadline = Date.now() + 750;
      while (Date.now() < deadline) {
        if (requests.length > input.start) fail(input.message);
        await new Promise((resolveWait) => {
          const timeout = setTimeout(resolveWait, 100);
          waiter = () => {
            clearTimeout(timeout);
            resolveWait();
          };
        });
        waiter = undefined;
      }
    },
    close: async () => {
      await new Promise((resolveClose) => server.close(resolveClose));
      await waitForPortClosed(baseUrl);
    },
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
      "POSTHOG_PROJECT_API_KEY:",
      "--var",
      "POSTHOG_HOST:http://127.0.0.1:9",
      "--var",
      "RESEND_API_KEY:local-resend-key",
      "--var",
      `RESEND_API_BASE_URL:${input.resendBaseUrl}`,
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
      "--var",
      `APP_BASE_URL:${input.baseUrl}`,
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-onboard-e2e-"));
  const path = resolve(directory, ".dev.vars.local-onboard-e2e");
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
      "RESEND_API_KEY=local-resend-key",
      `RESEND_API_BASE_URL=${input.resendBaseUrl}`,
      "RESEND_FROM_ADDRESS=CapVeri <local@capveri.local>",
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

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} is not a UUID`,
  );
}

function assertOnboardInitResponse(actual, expected) {
  assertAllowedKeys(
    actual,
    ["organization_id", "user_id", "already_existed"],
    expected.label,
  );
  assert(actual.user_id === expected.userId, `${expected.label} user mismatch`);
  assertUuid(actual.organization_id, `${expected.label} organization_id`);
  if (expected.organizationId) {
    assert(
      actual.organization_id === expected.organizationId,
      `${expected.label} organization mismatch`,
    );
  }
  assert(
    actual.already_existed === expected.alreadyExisted,
    `${expected.label} already_existed mismatch`,
  );
}

function assertIsoTimestamp(value, label) {
  const text = value instanceof Date ? value.toISOString() : String(value);
  assert(!Number.isNaN(Date.parse(text)), `${label} is not parseable`);
}

function assertAllowedKeys(actual, expectedKeys, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertDeepEqual(
    Object.keys(actual).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
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
