import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8845";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const TERMS_VERSION = "2026-06-03";
const TERMS_HASH =
  "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const LOCAL_SUPABASE_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

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
    fail(`local auth lifecycle E2E always owns ${DEFAULT_BASE_URL}`);
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
    ])) ??
    LOCAL_ANON_KEY;
  const serviceRoleKey =
    args["supabase-service-role-key"] ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    createLocalServiceRoleJwt();

  if (process.env.CI) fail("Refusing to run local auth lifecycle E2E in CI.");
  await assertPortAvailable(baseUrl);
  await assertSupabaseServiceRole({ supabaseUrl, serviceRoleKey });
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
    serviceRoleKey,
  });
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
      `Local auth lifecycle Worker close failed after scenario failure: ${errorMessage(closeError)}`,
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
    const ownerHeaders = jsonAuthHeaders(account.owner.accessToken);
    const memberHeaders = jsonAuthHeaders(account.member.accessToken);

    const staleLegal = await expectJson(
      `${input.baseUrl}/api/v1/auth/legal-acceptance/current`,
      {
        method: "POST",
        headers: ownerHeaders,
        status: 422,
        body: JSON.stringify({
          accepted_terms: true,
          terms_version: "stale",
          terms_hash: TERMS_HASH,
        }),
      },
    );
    assertErrorBody(
      staleLegal,
      "invalid_legal_acceptance",
      "You must accept the current CapVeri Terms of Service.",
      "stale legal response",
    );
    const unauthenticatedWelcome = await expectJson(
      `${input.baseUrl}/api/v1/auth/welcome`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        status: 401,
        body: JSON.stringify(currentTermsAcceptance()),
      },
    );
    assertJsonEqual(
      unauthenticatedWelcome,
      {
        error: {
          code: "authorization_required",
          message: "Authorization header required",
        },
      },
      "unauthenticated welcome response",
    );

    const welcomeStartedAt = Date.now();
    const welcome = await expectJson(`${input.baseUrl}/api/v1/auth/welcome`, {
      method: "POST",
      headers: {
        ...ownerHeaders,
        "cf-connecting-ip": "127.0.0.1",
        "user-agent": "local-auth-lifecycle-e2e",
      },
      status: 200,
      body: JSON.stringify(currentTermsAcceptance()),
    });
    assert(Date.now() - welcomeStartedAt < 2000, "welcome response was slow");
    assertJsonEqual(welcome, { status: "ok" }, "welcome response");
    await waitForWelcomeSideEffects(sql, account);

    const legal = await expectJson(
      `${input.baseUrl}/api/v1/auth/legal-acceptance/current`,
      {
        method: "POST",
        headers: {
          ...ownerHeaders,
          "cf-connecting-ip": "127.0.0.1",
          "user-agent": "local-auth-lifecycle-e2e-legal",
        },
        status: 200,
        body: JSON.stringify(currentTermsAcceptance()),
      },
    );
    assertJsonEqual(legal, { status: "accepted" }, "legal response");
    await assertLegalAcceptance(sql, {
      userId: account.owner.userId,
      organizationId: account.owner.organizationId,
      source: "authenticated_legal_gate",
      userAgent: "local-auth-lifecycle-e2e-legal",
    });

    const ownerDeleteBlocked = await expectError(
      `${input.baseUrl}/api/v1/auth/account`,
      {
        method: "DELETE",
        headers: ownerHeaders,
        status: 400,
        code: "account_deletion_blocked",
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
    );
    assertErrorBody(
      ownerDeleteBlocked,
      "account_deletion_blocked",
      "This account is linked to legal acceptance history. Contact support so CapVeri can preserve audit history before deletion.",
      "owner deletion blocked response",
    );
    await assertUserStillExists(sql, account.owner.userId);
    await assertOrganizationSurvives(sql, account.owner.organizationId, {
      ownerUserId: account.owner.userId,
      adminUserId: account.admin.userId,
      memberUserId: account.member.userId,
    });

    const blockerId = randomUUID();
    account.generated.columnMappingIds.push(blockerId);
    await insertColumnMappingBlocker(sql, {
      id: blockerId,
      organizationId: account.owner.organizationId,
      createdBy: account.member.userId,
      name: `Local auth lifecycle blocker ${account.suffix}`,
    });
    const memberDeleteBlocked = await expectError(
      `${input.baseUrl}/api/v1/auth/account`,
      {
        method: "DELETE",
        headers: memberHeaders,
        status: 400,
        code: "account_deletion_blocked",
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
    );
    assertErrorBody(
      memberDeleteBlocked,
      "account_deletion_blocked",
      "This account is linked to column mappings. Contact support so CapVeri can preserve audit history before deletion.",
      "member deletion blocked response",
    );
    await assertUserStillExists(sql, account.member.userId);
    await deleteColumnMappingBlocker(sql, blockerId);
    account.generated.columnMappingIds =
      account.generated.columnMappingIds.filter((id) => id !== blockerId);

    const malformedDelete = await expectJson(
      `${input.baseUrl}/api/v1/auth/account`,
      {
        method: "DELETE",
        headers: memberHeaders,
        status: 422,
        body: JSON.stringify({ confirmation: "delete" }),
      },
    );
    assertErrorBody(
      malformedDelete,
      "validation_error",
      'confirmation: Invalid literal value, expected "DELETE"',
      "malformed deletion response",
    );
    await assertUserStillExists(sql, account.member.userId);

    const deleted = await expectJson(`${input.baseUrl}/api/v1/auth/account`, {
      method: "DELETE",
      headers: memberHeaders,
      status: 200,
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    assertJsonEqual(deleted, { status: "deleted" }, "delete response");
    await waitForDeletedUser(sql, account.member.userId);
    await assertOrganizationSurvives(sql, account.owner.organizationId, {
      ownerUserId: account.owner.userId,
      adminUserId: account.admin.userId,
      memberUserId: account.member.userId,
      memberDeleted: true,
    });

    result = {
      index: input.index,
      owner_user_id: account.owner.userId,
      deleted_member_user_id: account.member.userId,
      organization_id: account.owner.organizationId,
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
      `Local auth lifecycle cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
    );
  }
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function seedAccount(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const created = [];
  try {
    const owner = await createLocalAuthUser(input, {
      email: `auth-life-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}Aa1!`,
      fullName: `Local Auth Life Owner ${suffix}`,
      organizationName: `Local Auth Life Org ${suffix}`,
      role: "owner",
    });
    created.push(owner);
    const admin = await createLocalAuthUser(input, {
      email: `auth-life-admin-${suffix}@capveri.local`,
      password: `AdminPass${input.index}Aa1!`,
      fullName: `Local Auth Life Admin ${suffix}`,
      organizationName: `Local Auth Life Admin Org ${suffix}`,
      role: "admin",
    });
    created.push(admin);
    const member = await createLocalAuthUser(input, {
      email: `auth-life-member-${suffix}@capveri.local`,
      password: `MemberPass${input.index}Aa1!`,
      fullName: `Local Auth Life Member ${suffix}`,
      organizationName: `Local Auth Life Member Org ${suffix}`,
      role: "member",
    });
    created.push(member);

    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        update users
        set organization_id = ${owner.organizationId},
            role = case id when ${admin.userId} then 'admin' else 'member' end,
            updated_at = now()
        where id in (${admin.userId}, ${member.userId})
      `;
      admin.organizationId = owner.organizationId;
      member.organizationId = owner.organizationId;
    } finally {
      await sql.end({ timeout: 5 });
    }

    return {
      suffix,
      owner,
      admin,
      member,
      generated: {
        orgIds: [
          owner.signupOrganizationId,
          admin.signupOrganizationId,
          member.signupOrganizationId,
        ],
        userIds: [owner.userId, admin.userId, member.userId],
        emails: [owner.email, admin.email, member.email],
        orgNames: [
          owner.organizationName,
          admin.organizationName,
          member.organizationName,
        ],
        columnMappingIds: [],
      },
    };
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, created);
    throw error;
  }
}

async function createLocalAuthUser(input, user) {
  const partial = {
    ...user,
    userId: "",
    signupOrganizationId: "",
    organizationId: "",
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
      fail(`Supabase signup failed: ${safeJson(redactSensitiveJson(body))}`);
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
      await sql`update users set role = ${user.role}, full_name = ${user.fullName}, updated_at = now() where id = ${userId}`;
      const rows =
        await sql`select organization_id from users where id = ${userId} limit 1`;
      organizationId = rows[0]?.organization_id;
    } finally {
      await sql.end({ timeout: 5 });
    }
    if (typeof organizationId === "string") {
      partial.signupOrganizationId = organizationId;
      partial.organizationId = organizationId;
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
    partial.accessToken = accessToken;
    return {
      ...partial,
      signupOrganizationId: organizationId,
      organizationId,
    };
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, [partial]);
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
      `SUPABASE_SERVICE_ROLE_KEY:${input.serviceRoleKey}`,
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-auth-life-e2e-"));
  const path = resolve(directory, ".dev.vars.local-auth-lifecycle-e2e");
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
      `SUPABASE_SERVICE_ROLE_KEY=${input.serviceRoleKey}`,
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "RESEND_API_KEY=",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-auth-lifecycle-e2e-signing-secret",
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
  env.SUPABASE_SERVICE_ROLE_KEY = input.serviceRoleKey;
  return env;
}

async function assertSupabaseServiceRole(input) {
  const response = await fetch(
    new URL("/auth/v1/admin/users", input.supabaseUrl),
    {
      headers: {
        apikey: input.serviceRoleKey,
        authorization: `Bearer ${input.serviceRoleKey}`,
      },
    },
  ).catch((error) => {
    fail(`Local Supabase admin check failed: ${error.message}`);
  });
  if (!response.ok) {
    fail(`Local Supabase service role check returned ${response.status}`);
  }
}

function createLocalServiceRoleJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: "supabase",
    ref: "capveri",
    role: "service_role",
    iat: now,
    exp: now + 100 * 365 * 24 * 60 * 60,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", LOCAL_SUPABASE_JWT_SECRET)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
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

async function waitForWelcomeSideEffects(sql, account) {
  await poll(async () => {
    const rows = await sql`
      select
        (select count(*)::int from legal_acceptances where user_id = ${account.owner.userId} and organization_id = ${account.owner.organizationId} and source = 'owner_signup') as legal_count,
        (select count(*)::int from signup_email_events where user_id = ${account.owner.userId} and organization_id = ${account.owner.organizationId} and status = 'pending') as nurture_count
    `;
    return rows[0]?.legal_count === 1 && rows[0]?.nurture_count === 3;
  }, "welcome side effects");

  const rows = await sql`
    select email_type, email, organization_name, scheduled_at::text
    from signup_email_events
    where user_id = ${account.owner.userId}
    order by scheduled_at asc
  `;
  assert(
    rows.map((row) => row.email_type).join(",") ===
      "day_1_add_property,day_3_upload_gl,day_7_run_reconciliation",
    "nurture schedule mismatch",
  );
  assert(
    rows.every(
      (row) =>
        row.email === account.owner.email &&
        row.organization_name === account.owner.organizationName,
    ),
    "nurture metadata mismatch",
  );
}

async function assertLegalAcceptance(sql, input) {
  const rows = await sql`
    select count(*)::int as count
    from legal_acceptances
    where user_id = ${input.userId}
      and organization_id = ${input.organizationId}
      and document_version = ${TERMS_VERSION}
      and document_hash = ${TERMS_HASH}
      and source = ${input.source}
      and user_agent = ${input.userAgent}
  `;
  assert(rows[0]?.count === 1, `missing legal acceptance ${input.source}`);
}

async function assertUserStillExists(sql, userId) {
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id = ${userId}) as auth_count,
      (select count(*)::int from users where id = ${userId}) as public_count
  `;
  assert(rows[0]?.auth_count === 1, "auth user should still exist");
  assert(rows[0]?.public_count === 1, "public user should still exist");
}

async function assertOrganizationSurvives(sql, organizationId, input) {
  const rows = await sql`
    select
      (select count(*)::int from organizations where id = ${organizationId}) as org_count,
      (select role::text from users where id = ${input.ownerUserId}) as owner_role,
      (select role::text from users where id = ${input.adminUserId}) as admin_role,
      (select count(*)::int from users where id = ${input.memberUserId}) as member_count,
      (select count(*)::int from auth.users where id = ${input.memberUserId}) as member_auth_count
  `;
  const row = rows[0];
  assert(row?.org_count === 1, "organization should survive deletion checks");
  assert(
    row?.owner_role === "owner",
    "owner row should survive deletion checks",
  );
  assert(
    row?.admin_role === "admin",
    "admin row should survive deletion checks",
  );
  const expectedMemberCount = input.memberDeleted ? 0 : 1;
  assert(
    row?.member_count === expectedMemberCount,
    "member public row survival mismatch",
  );
  assert(
    row?.member_auth_count === expectedMemberCount,
    "member auth row survival mismatch",
  );
}

async function waitForDeletedUser(sql, userId) {
  await poll(async () => {
    const rows = await sql`
      select
        (select count(*)::int from auth.users where id = ${userId}) as auth_count,
        (select count(*)::int from users where id = ${userId}) as public_count
    `;
    return rows[0]?.auth_count === 0 && rows[0]?.public_count === 0;
  }, "deleted user cascade");
}

async function insertColumnMappingBlocker(sql, input) {
  await sql`
    insert into column_mappings (
      id,
      organization_id,
      name,
      description,
      source_system,
      mapping_config,
      created_by
    )
    values (
      ${input.id},
      ${input.organizationId},
      ${input.name},
      'Local auth lifecycle deletion blocker',
      'generic',
      ${sql.json({ account_code: "Account", amount: "Amount" })},
      ${input.createdBy}
    )
  `;
}

async function deleteColumnMappingBlocker(sql, id) {
  await sql`delete from column_mappings where id = ${id}`;
}

async function cleanupGeneratedRows(sql, input) {
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const columnMappingIds = nonEmpty(input.columnMappingIds);
  const emails = nonEmpty(input.emails, "__local_auth_lifecycle_e2e_none__");
  const orgNames = nonEmpty(
    input.orgNames,
    "__local_auth_lifecycle_e2e_none__",
  );
  await sql.begin(async (transaction) => {
    await transaction`delete from column_mappings where id in ${transaction(columnMappingIds)} or organization_id in ${transaction(orgIds)} or created_by in ${transaction(userIds)}`;
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
  const columnMappingIds = nonEmpty(input.columnMappingIds);
  const emails = nonEmpty(input.emails, "__local_auth_lifecycle_e2e_none__");
  const orgNames = nonEmpty(
    input.orgNames,
    "__local_auth_lifecycle_e2e_none__",
  );
  const rows = await sql`
    select
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances,
      (select count(*)::int from column_mappings where id in ${sql(columnMappingIds)} or organization_id in ${sql(orgIds)} or created_by in ${sql(userIds)}) as column_mappings,
      (select count(*)::int from signup_email_events where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)} or email in ${sql(emails)}) as signup_email_events,
      (select count(*)::int from audit_log where organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function cleanupSeededAccounts(databaseUrl, accounts) {
  if (accounts.length === 0) return;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await cleanupGeneratedRows(sql, {
      orgIds: accounts.map((item) => item.signupOrganizationId),
      userIds: accounts.map((item) => item.userId),
      emails: accounts.map((item) => item.email),
      orgNames: accounts.map((item) => item.organizationName),
      columnMappingIds: [],
    });
  } finally {
    await sql.end({ timeout: 5 });
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
  assert(
    body?.error?.code === options.code,
    `expected error code ${options.code}, got ${stableJson(body)}`,
  );
  return body;
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

async function poll(check, label) {
  const deadline = Date.now() + 5000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (lastError) throw lastError;
  fail(`Timed out waiting for ${label}`);
}

function currentTermsAcceptance() {
  return {
    accepted_terms: true,
    terms_version: TERMS_VERSION,
    terms_hash: TERMS_HASH,
  };
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(values.filter((value) => typeof value === "string" && value)),
  ];
  return unique.length > 0 ? unique : [sentinel];
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

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function stableJson(value) {
  return JSON.stringify(value);
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

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
