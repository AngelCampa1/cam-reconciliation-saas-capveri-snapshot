import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8818";
const DEFAULT_STUB_URL = "http://127.0.0.1:8819";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPABASE_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const AUDIT_REQUEST_FIELDS = [
  "id",
  "name",
  "email",
  "company",
  "building_count",
  "phone",
  "portfolio_sqft",
  "current_system",
  "message",
  "source",
  "status",
  "notes",
  "estimated_recovery",
  "assigned_to",
  "organization_id",
  "contacted_at",
  "scheduled_at",
  "completed_at",
  "converted_at",
  "created_at",
  "updated_at",
];

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (process.env.CI) {
    fail("Refusing to run local audit-request E2E in CI.");
  }

  const args = parseArgs(process.argv.slice(2));
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local audit-request E2E always owns ${DEFAULT_BASE_URL}`);
  }
  if (args["stub-url"] || process.env.npm_config_stub_url) {
    fail(`local audit-request E2E always owns ${DEFAULT_STUB_URL}`);
  }
  if (
    args["start-worker"] === "false" ||
    process.env.npm_config_start_worker === "false"
  ) {
    fail("local audit-request E2E must start and own its Worker");
  }
  const baseUrl = DEFAULT_BASE_URL;
  const stubUrl = DEFAULT_STUB_URL;
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
  const stub = await startTurnstileStub(stubUrl);
  let worker;
  let runError;
  let closeError;
  try {
    worker = await startWorkerServer({ baseUrl, stubUrl });
    await waitForHealth(baseUrl);

    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          stub,
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
    for (const close of [
      worker ? () => worker.close() : undefined,
      () => stub.close(),
    ]) {
      if (!close) continue;
      try {
        await close();
      } catch (error) {
        closeError = error;
        if (runError) {
          console.error(
            `Local audit-request cleanup failed after scenario failure: ${errorMessage(error)}`,
          );
        }
      }
    }
  }

  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const emails = {
    primary: `audit-request-e2e-${suffix}@capveri.local`,
    rate: `audit-request-rate-${suffix}@capveri.local`,
    honeypot: `audit-request-honeypot-${suffix}@capveri.local`,
    fail: `audit-request-fail-${suffix}@capveri.local`,
  };
  const accounts = await seedAccounts(input, suffix);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const auditRequestIds = [];
  const start = input.stub.requests.length;
  let result;
  let runError;

  try {
    const created = await expectJson(`${input.baseUrl}/api/v1/audit-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      status: 201,
      body: JSON.stringify({
        name: "Local Audit Request Owner",
        email: emails.primary.toUpperCase(),
        company: `Local Audit Request Co ${suffix}`,
        building_count: 7,
        phone: "+1 555 0100",
        portfolio_sqft: 125000,
        current_system: "Spreadsheet",
        message: `Local audit request fixture ${suffix}`,
        source: "local-audit-requests-e2e",
        referral_code: `LOCAL-${input.index}`,
        turnstile_token: "pass-token",
      }),
    });
    auditRequestIds.push(created.id);
    const expectedPending = expectedAuditRequest({
      id: created.id,
      suffix,
      email: emails.primary,
    });
    assertAuditRequestContract(created, expectedPending, "created response");
    await assertAuditRequest(sql, expectedPending, "created DB row");

    await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/turnstile" &&
        request.body.includes("response=pass-token"),
      message: "Turnstile loopback success request missing.",
    });

    const verificationFailed = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        status: 403,
        body: JSON.stringify({
          name: "Local Failed",
          email: emails.fail,
          company: "Local Failed Co",
          building_count: 1,
          turnstile_token: "fail-token",
        }),
      },
    );
    assertErrorBody(
      verificationFailed,
      "verification_failed",
      "Verification failed. Please try again.",
      "turnstile failure",
    );
    await assertAuditRequestCount(sql, emails.fail, 0);

    const honeypot = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        status: 201,
        body: JSON.stringify({
          name: "Local Honeypot",
          email: emails.honeypot,
          company: "Local Honeypot Co",
          building_count: 2,
          company_website: "https://bot.example.com",
          turnstile_token: "pass-token",
        }),
      },
    );
    assertAuditRequestContract(
      honeypot,
      {
        id: honeypot.id,
        name: "Local Honeypot",
        email: emails.honeypot,
        company: "Local Honeypot Co",
        building_count: 2,
        phone: null,
        portfolio_sqft: null,
        current_system: null,
        message: null,
        source: null,
        status: "pending",
        notes: null,
        estimated_recovery: null,
        assigned_to: null,
        organization_id: null,
        contacted_at: null,
        scheduled_at: null,
        completed_at: null,
        converted_at: null,
      },
      "honeypot synthetic response",
    );
    await assertAuditRequestCount(sql, emails.honeypot, 0);
    assert(
      input.stub.requests
        .slice(start)
        .filter((request) => request.path === "/turnstile").length === 2,
      "honeypot should not call Turnstile",
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await expectJson(`${input.baseUrl}/api/v1/audit-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        status: 201,
        body: JSON.stringify({
          name: `Local Rate ${attempt}`,
          email: emails.rate,
          company: "Local Rate Co",
          building_count: 3,
          source: "local-audit-requests-e2e",
          turnstile_token: "pass-token",
        }),
      });
      auditRequestIds.push(row.id);
    }
    const rateLimited = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        status: 429,
        body: JSON.stringify({
          name: "Local Rate Blocked",
          email: emails.rate,
          company: "Local Rate Co",
          building_count: 3,
          turnstile_token: "pass-token",
        }),
      },
    );
    assertErrorBody(
      rateLimited,
      "rate_limit_exceeded",
      "Rate limit exceeded: maximum 3 audit requests per email per day",
      "rate limited response",
    );
    await assertAuditRequestCount(sql, emails.rate, 3);

    const ordinaryHeaders = jsonAuthHeaders(accounts.ordinary.accessToken);
    const adminHeaders = jsonAuthHeaders(accounts.platform.accessToken);
    const ordinaryList = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests`,
      {
        headers: ordinaryHeaders,
        status: 403,
      },
    );
    assertErrorBody(
      ordinaryList,
      "platform_admin_required",
      "platform_admin_required",
      "ordinary list response",
    );

    const pendingList = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests?status=pending&page=1&per_page=10`,
      { headers: adminHeaders, status: 200 },
    );
    assert(Array.isArray(pendingList), "admin list should return an array");
    const listed = pendingList.find((row) => row.id === created.id);
    assert(listed, "admin list did not include created audit request");
    assertAuditRequestContract(
      listed,
      expectedPending,
      "admin list audit request",
    );
    assertNoGeneratedEmailLeak(pendingList, accounts.ordinary.email);

    const detail = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/${created.id}`,
      { headers: adminHeaders, status: 200 },
    );
    assertAuditRequestContract(
      detail,
      expectedPending,
      "admin detail audit request",
    );
    const ordinaryDetail = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/${created.id}`,
      {
        headers: ordinaryHeaders,
        status: 403,
      },
    );
    assertErrorBody(
      ordinaryDetail,
      "platform_admin_required",
      "platform_admin_required",
      "ordinary detail response",
    );
    const invalidDetail = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/not-a-uuid`,
      {
        headers: adminHeaders,
        status: 400,
      },
    );
    assertErrorBody(
      invalidDetail,
      "validation_error",
      "Invalid UUID",
      "invalid UUID detail response",
    );

    const scheduled = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/${created.id}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        status: 200,
        body: JSON.stringify({
          status: "scheduled",
          notes: `Scheduled locally ${suffix}`,
          estimated_recovery: 45678,
          assigned_to: accounts.platform.userId,
        }),
      },
    );
    const expectedScheduled = {
      ...expectedPending,
      status: "scheduled",
      notes: `Scheduled locally ${suffix}`,
      estimated_recovery: 45678,
      assigned_to: accounts.platform.userId,
    };
    assertAuditRequestContract(
      scheduled,
      expectedScheduled,
      "scheduled response",
      { nonNullIsoFields: ["scheduled_at"] },
    );
    await assertAuditRequest(sql, expectedScheduled, "scheduled DB row", {
      nonNullIsoFields: ["scheduled_at"],
    });

    const ordinaryPatch = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/${created.id}`,
      {
        method: "PATCH",
        headers: ordinaryHeaders,
        status: 403,
        body: JSON.stringify({ status: "completed" }),
      },
    );
    assertErrorBody(
      ordinaryPatch,
      "platform_admin_required",
      "platform_admin_required",
      "ordinary patch response",
    );
    const emptyPatch = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/${created.id}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        status: 400,
        body: JSON.stringify({}),
      },
    );
    assertErrorBody(
      emptyPatch,
      "no_updates",
      "No updates provided",
      "empty patch response",
    );
    const missingPatch = await expectJson(
      `${input.baseUrl}/api/v1/audit-requests/${randomUUID()}`,
      {
        method: "PATCH",
        headers: adminHeaders,
        status: 404,
        body: JSON.stringify({ status: "contacted" }),
      },
    );
    assertErrorBody(
      missingPatch,
      "not_found",
      "Audit request not found",
      "missing patch response",
    );

    result = {
      index: input.index,
      created_id: created.id,
      primary_email: emails.primary,
      rate_limited_email: emails.rate,
      platform_admin_user_id: accounts.platform.userId,
      turnstile_calls: input.stub.requests
        .slice(start)
        .filter((request) => request.path === "/turnstile").length,
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];
    try {
      await cleanupGeneratedRows(sql, {
        auditRequestIds,
        emails: Object.values(emails),
        userIds: [accounts.platform.userId, accounts.ordinary.userId],
        orgIds: [
          accounts.platform.signupOrganizationId,
          accounts.ordinary.signupOrganizationId,
        ],
        orgNames: [
          accounts.platform.organizationName,
          accounts.ordinary.organizationName,
        ],
      });
      await assertCleanupComplete(sql, {
        auditRequestIds,
        emails: Object.values(emails),
        userIds: [accounts.platform.userId, accounts.ordinary.userId],
        orgIds: [
          accounts.platform.signupOrganizationId,
          accounts.ordinary.signupOrganizationId,
        ],
        orgNames: [
          accounts.platform.organizationName,
          accounts.ordinary.organizationName,
        ],
      });
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
          `Local audit-request row cleanup failed after scenario failure: ${cleanupMessage}`,
        );
      } else {
        fail(cleanupMessage);
      }
    }
  }

  if (runError) throw runError;
  if (result) return result;
  fail("Local audit-request E2E ended without returning a result.");
}

async function seedAccounts(input, suffix) {
  const created = [];
  try {
    const platform = await createLocalAuthUser(input, {
      email: `audit-request-platform-${suffix}@capveri.local`,
      password: `PlatformPass${input.index}Aa1!`,
      fullName: "Local Audit Request Platform Admin",
      organizationName: `Local Audit Request Platform ${suffix}`,
      role: "admin",
      isPlatformAdmin: true,
    });
    created.push(platform);
    const ordinary = await createLocalAuthUser(input, {
      email: `audit-request-ordinary-${suffix}@capveri.local`,
      password: `OrdinaryPass${input.index}Aa1!`,
      fullName: "Local Audit Request Ordinary",
      organizationName: `Local Audit Request Ordinary ${suffix}`,
      role: "owner",
      isPlatformAdmin: false,
    });
    created.push(ordinary);
    return { platform, ordinary };
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
  assert(typeof userId === "string" && userId !== "", "signup user id missing");

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
          is_platform_admin = ${user.isPlatformAdmin},
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
    signupOrganizationId: organizationId,
    accessToken,
  };
}

async function startTurnstileStub(baseUrl) {
  const url = new URL(baseUrl);
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const requestUrl = new URL(request.url ?? "/", baseUrl);
    requests.push({
      method: request.method ?? "GET",
      path: requestUrl.pathname,
      body,
      headers: request.headers,
    });

    response.setHeader("content-type", "application/json");
    if (requestUrl.pathname === "/turnstile") {
      response.end(JSON.stringify({ success: !body.includes("fail-token") }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "unhandled local audit stub path" }));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
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
      "TURNSTILE_SECRET_KEY:local-turnstile-secret",
      "--var",
      `TURNSTILE_SITEVERIFY_URL:${input.stubUrl}/turnstile`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
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
      if (child.pid) await killProcessTree(child.pid);
      await waitForPortClosed(input.baseUrl);
    },
  };
  try {
    await waitForHealth(input.baseUrl, () => output);
    if (childError) {
      fail(`wrangler dev failed to spawn\n${output.slice(-2000)}`);
    }
    if (child.exitCode !== null) {
      fail(
        `wrangler dev exited before health check completed\n${output.slice(-2000)}`,
      );
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
  fail(
    `Worker health check did not pass: ${lastError}\n${output().slice(-2000)}`,
  );
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
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} returned non-JSON ${response.status}: ${text.slice(0, 500)}`,
      );
    }
  }
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return body;
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

function expectedAuditRequest(input) {
  return {
    id: input.id,
    name: "Local Audit Request Owner",
    email: input.email,
    company: `Local Audit Request Co ${input.suffix}`,
    building_count: 7,
    phone: "+1 555 0100",
    portfolio_sqft: 125000,
    current_system: "Spreadsheet",
    message: `Local audit request fixture ${input.suffix}`,
    source: "local-audit-requests-e2e",
    status: "pending",
    notes: null,
    estimated_recovery: null,
    assigned_to: null,
    organization_id: null,
    contacted_at: null,
    scheduled_at: null,
    completed_at: null,
    converted_at: null,
  };
}

async function assertAuditRequest(sql, expected, label, options = {}) {
  const rows = await sql`
    select
      id::text,
      name,
      email,
      company,
      building_count::int,
      phone,
      portfolio_sqft::int,
      current_system,
      message,
      source,
      status::text,
      notes,
      estimated_recovery::int,
      assigned_to::text,
      organization_id::text,
      contacted_at::text,
      scheduled_at::text,
      completed_at::text,
      converted_at::text,
      created_at::text,
      updated_at::text
    from audit_requests
    where id = ${expected.id}
    limit 1
  `;
  const row = rows[0];
  assert(row, `${label} missing`);
  assertAuditRequestContract(row, expected, label, options);
}

function assertErrorBody(body, code, message, label) {
  assertJsonEqual(body, { detail: message, error: { code, message } }, label);
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertAuditRequestContract(actual, expected, label, options = {}) {
  assert(actual && typeof actual === "object", `${label} missing`);
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = [...AUDIT_REQUEST_FIELDS].sort();
  assert(
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
    `${label} field shape mismatch: ${actualKeys.join(",")}`,
  );

  const nonNullIsoFields = new Set(options.nonNullIsoFields ?? []);
  for (const field of AUDIT_REQUEST_FIELDS) {
    if (field === "created_at" || field === "updated_at") {
      assertIsoTimestamp(actual[field], `${label}.${field}`);
      continue;
    }
    if (nonNullIsoFields.has(field)) {
      assertIsoTimestamp(actual[field], `${label}.${field}`);
      continue;
    }
    assert(
      actual[field] === expected[field],
      `${label}.${field} mismatch: expected ${safeJson(expected[field])}, got ${safeJson(actual[field])}`,
    );
  }
}

function assertIsoTimestamp(value, label) {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(Date.parse(value)),
    `${label} should be an ISO timestamp`,
  );
}

async function assertAuditRequestCount(sql, email, expected) {
  const rows = await sql`
    select count(*)::int as count
    from audit_requests
    where email = ${email}
  `;
  assert(
    rows[0]?.count === expected,
    `audit request count mismatch for ${email}`,
  );
}

async function cleanupGeneratedRows(sql, input) {
  const ids = uniqueStrings(input.auditRequestIds);
  const emails = uniqueStrings(input.emails);
  const userIds = uniqueStrings(input.userIds);
  const orgIds = uniqueStrings(input.orgIds);
  const orgNames = uniqueStrings(input.orgNames);

  await sql`
    delete from audit_requests
    where ${ids.length > 0 ? sql`id in ${sql(ids)} or` : sql``}
          email in ${sql(emails)}
  `;
  await sql`
    delete from users
    where id in ${sql(userIds)}
       or email in ${sql(emails)}
       or organization_id in ${sql(orgIds)}
  `;
  await sql`
    delete from auth.users
    where id in ${sql(userIds)}
       or email in ${sql(emails)}
  `;
  await sql`
    delete from organizations
    where id in ${sql(orgIds)}
       or name in ${sql(orgNames)}
  `;
}

async function cleanupSeededAccounts(databaseUrl, accounts) {
  if (accounts.length === 0) return;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, {
      auditRequestIds: [],
      emails: accounts.map((account) => account.email),
      userIds: accounts.map((account) => account.userId),
      orgIds: accounts.map((account) => account.signupOrganizationId),
      orgNames: accounts.map((account) => account.organizationName),
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function assertCleanupComplete(sql, input) {
  const ids = uniqueStrings(input.auditRequestIds);
  const emails = uniqueStrings(input.emails);
  const userIds = uniqueStrings(input.userIds);
  const orgIds = uniqueStrings(input.orgIds);
  const orgNames = uniqueStrings(input.orgNames);
  const rows = await sql`
    select
      (select count(*)::int from audit_requests where ${ids.length > 0 ? sql`id in ${sql(ids)} or` : sql``} email in ${sql(emails)}) as audit_request_count,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_user_count,
      (select count(*)::int from auth.users where id in ${sql(userIds)}) as auth_user_count,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as org_count
  `;
  const row = rows[0];
  assert(row.audit_request_count === 0, "cleanup left audit requests");
  assert(row.public_user_count === 0, "cleanup left public users");
  assert(row.auth_user_count === 0, "cleanup left auth users");
  assert(row.org_count === 0, "cleanup left organizations");
}

function assertNoGeneratedEmailLeak(value, generatedEmail) {
  assert(
    !JSON.stringify(value).includes(generatedEmail),
    "ordinary user email leaked into platform list",
  );
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
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
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

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function uniqueStrings(values) {
  return [
    ...new Set(values.filter((value) => typeof value === "string" && value)),
  ];
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
