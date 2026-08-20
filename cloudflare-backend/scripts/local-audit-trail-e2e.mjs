import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8820";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTk4MzgxMjk5Nn0.pYYP0f4LU8wBnLuQPIBKWhLHBP9qosdn9T46eqJfmD4";
const AUDIT_ENVELOPE_KEYS = [
  "items",
  "total",
  "page",
  "page_size",
  "total_pages",
  "has_next",
  "has_previous",
];
const AUDIT_ITEM_KEYS = [
  "id",
  "table_name",
  "operation",
  "row_id",
  "old_data",
  "new_data",
  "changed_by",
  "changed_at",
  "organization_id",
  "session_info",
];
const SESSION_INFO = { source: "local-audit-trail-e2e" };

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
    fail(`local audit trail E2E always owns ${DEFAULT_BASE_URL}`);
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

  if (process.env.CI) fail("Refusing to run local audit trail E2E in CI.");
  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl });

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
      `Local audit trail Worker close failed after scenario failure: ${errorMessage(closeError)}`,
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
    const hiddenHeaders = jsonAuthHeaders(account.hidden.accessToken);

    const seeded = await seedAuditRows(sql, account);
    account.generated.auditIds.push(...seeded.auditIds);
    const visibleRows = expectedVisibleAuditRows(seeded, account);
    const hiddenRow = expectedHiddenAuditRow(seeded, account);

    await expectError(`${input.baseUrl}/api/v1/audit-trail`, {
      headers: memberHeaders,
      status: 403,
      code: "insufficient_permissions",
    });

    const pageOne = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?page=1&page_size=2`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(pageOne, {
      total: 3,
      page: 1,
      pageSize: 2,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false,
      label: "audit page one",
    });
    assertAuditItems(pageOne.items, [visibleRows.delete, visibleRows.gl]);
    assertNoLeakage(pageOne, account.hiddenMarker);

    const pageTwo = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?page=2&page_size=2`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(pageTwo, {
      total: 3,
      page: 2,
      pageSize: 2,
      totalPages: 2,
      hasNext: false,
      hasPrevious: true,
      label: "audit page two",
    });
    assertAuditItems(pageTwo.items, [visibleRows.update]);
    assertNoLeakage(pageTwo, account.hiddenMarker);

    const tableFilter = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?table_name=leases&page_size=10`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(tableFilter, {
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      label: "table filter",
    });
    assertAuditItems(tableFilter.items, [
      visibleRows.delete,
      visibleRows.update,
    ]);
    assertNoLeakage(tableFilter, account.hiddenMarker);

    const operationFilter = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?operation=insert&page_size=10`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(operationFilter, {
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      label: "operation filter",
    });
    assertAuditItems(operationFilter.items, [visibleRows.gl]);
    assertNoLeakage(operationFilter, account.hiddenMarker);

    const rowFilter = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?row_id=${seeded.leaseRowId}&changed_by=${account.owner.userId}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(rowFilter, {
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      label: "row/changed_by filter",
    });
    assertAuditItems(rowFilter.items, [visibleRows.update]);
    assertNoLeakage(rowFilter, account.hiddenMarker);

    const changedByNegative = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?row_id=${seeded.leaseRowId}&changed_by=${account.member.userId}`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(changedByNegative, {
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
      label: "changed_by negative filter",
    });
    assertAuditItems(changedByNegative.items, []);
    assertNoLeakage(changedByNegative, account.hiddenMarker);

    const dateFilter = await expectJson(
      `${input.baseUrl}/api/v1/audit-trail?start_date=2026-01-02&end_date=2026-01-02&page_size=10`,
      { headers: ownerHeaders, status: 200 },
    );
    assertAuditEnvelope(dateFilter, {
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      label: "date filter",
    });
    assertAuditItems(dateFilter.items, [visibleRows.gl]);
    assertNoLeakage(dateFilter, account.hiddenMarker);

    await expectError(`${input.baseUrl}/api/v1/audit-trail?row_id=not-a-uuid`, {
      headers: ownerHeaders,
      status: 400,
      code: "validation_error",
    });

    const hiddenList = await expectJson(`${input.baseUrl}/api/v1/audit-trail`, {
      headers: hiddenHeaders,
      status: 200,
    });
    assertAuditEnvelope(hiddenList, {
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
      label: "hidden owner list",
    });
    assertAuditItems(hiddenList.items, [hiddenRow]);
    assert(
      stableJson(hiddenList).includes(account.hiddenMarker),
      "hidden owner cannot see own marker",
    );
    assertNoVisibleLeakage(hiddenList, account);

    result = {
      index: input.index,
      organization_id: account.owner.organizationId,
      owner_user_id: account.owner.userId,
      visible_audit_rows: 3,
      hidden_audit_rows: 1,
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
      `Local audit trail cleanup failed after scenario failure: ${errorMessage(cleanupError)}`,
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
      email: `audit-trail-owner-${suffix}@capveri.local`,
      password: `OwnerPass${input.index}Aa1!`,
      fullName: `Local Audit Trail Owner ${suffix}`,
      organizationName: `Local Audit Trail Org ${suffix}`,
      role: "owner",
    });
    created.push(owner);
    const member = await createLocalAuthUser(input, {
      email: `audit-trail-member-${suffix}@capveri.local`,
      password: `MemberPass${input.index}Aa1!`,
      fullName: `Local Audit Trail Member ${suffix}`,
      organizationName: `Local Audit Trail Member Org ${suffix}`,
      role: "member",
    });
    created.push(member);
    const hidden = await createLocalAuthUser(input, {
      email: `audit-trail-hidden-${suffix}@capveri.local`,
      password: `HiddenPass${input.index}Aa1!`,
      fullName: `Local Audit Trail Hidden ${suffix}`,
      organizationName: `Local Audit Trail Hidden Org ${suffix}`,
      role: "owner",
    });
    created.push(hidden);

    const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        update users
        set organization_id = ${owner.organizationId}, role = 'member', updated_at = now()
        where id = ${member.userId}
      `;
      member.organizationId = owner.organizationId;
    } finally {
      await sql.end({ timeout: 5 });
    }

    return {
      owner,
      member,
      hidden,
      hiddenMarker: `HIDDEN-AUDIT-TRAIL-${suffix}`,
      generated: {
        orgIds: [
          owner.signupOrganizationId,
          member.signupOrganizationId,
          hidden.signupOrganizationId,
        ],
        userIds: [owner.userId, member.userId, hidden.userId],
        emails: [owner.email, member.email, hidden.email],
        orgNames: [
          owner.organizationName,
          member.organizationName,
          hidden.organizationName,
        ],
        auditIds: [],
      },
    };
  } catch (error) {
    await cleanupSeededAccounts(input.databaseUrl, created);
    throw error;
  }
}

async function seedAuditRows(sql, account) {
  const leaseRowId = randomUUID();
  const glRowId = randomUUID();
  const deleteRowId = randomUUID();
  const hiddenRowId = randomUUID();
  const rows = await sql`
    insert into audit_log (
      table_name, operation, row_id, old_data, new_data, changed_by,
      changed_at, organization_id, session_info
    )
    values
      ('leases', 'UPDATE', ${leaseRowId}, ${sql.json({ tenant: "Before" })}, ${sql.json({ tenant: "After" })}, ${account.owner.userId}, '2026-01-01T12:00:00Z', ${account.owner.organizationId}, ${sql.json({ source: "local-audit-trail-e2e" })}),
      ('gl_entries', 'INSERT', ${glRowId}, null, ${sql.json({ amount: 125, marker: "visible" })}, ${account.owner.userId}, '2026-01-02T12:00:00Z', ${account.owner.organizationId}, ${sql.json({ source: "local-audit-trail-e2e" })}),
      ('leases', 'DELETE', ${deleteRowId}, ${sql.json({ tenant: "Removed" })}, null, ${account.member.userId}, '2026-01-03T12:00:00Z', ${account.owner.organizationId}, ${sql.json({ source: "local-audit-trail-e2e" })}),
      ('leases', 'UPDATE', ${hiddenRowId}, ${sql.json({ marker: account.hiddenMarker })}, ${sql.json({ marker: account.hiddenMarker })}, ${account.hidden.userId}, '2026-01-04T12:00:00Z', ${account.hidden.organizationId}, ${sql.json({ source: "local-audit-trail-e2e" })})
    returning id::text
  `;
  return {
    leaseRowId,
    glRowId,
    deleteRowId,
    hiddenRowId,
    auditIds: rows.map((row) => row.id),
  };
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
    return { ...partial, signupOrganizationId: organizationId, organizationId };
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

async function cleanupGeneratedRows(sql, input) {
  const auditIds = nonEmpty(input.auditIds, "-1");
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_audit_trail_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_audit_trail_e2e_none__");
  await sql.begin(async (transaction) => {
    await transaction`delete from audit_log where id::text in ${transaction(auditIds)} or organization_id in ${transaction(orgIds)} or changed_by in ${transaction(userIds)}`;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`delete from legal_acceptances where organization_id in ${transaction(orgIds)} or user_id in ${transaction(userIds)}`;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`delete from users where id in ${transaction(userIds)} or email in ${transaction(emails)} or organization_id in ${transaction(orgIds)}`;
    await transaction`delete from auth.users where id in ${transaction(userIds)} or email in ${transaction(emails)}`;
    await transaction`delete from organizations where id in ${transaction(orgIds)} or name in ${transaction(orgNames)}`;
  });
}

async function assertCleanupComplete(sql, input) {
  const auditIds = nonEmpty(input.auditIds, "-1");
  const orgIds = nonEmpty(input.orgIds);
  const userIds = nonEmpty(input.userIds);
  const emails = nonEmpty(input.emails, "__local_audit_trail_e2e_none__");
  const orgNames = nonEmpty(input.orgNames, "__local_audit_trail_e2e_none__");
  const rows = await sql`
    select
      (select count(*)::int from audit_log where id::text in ${sql(auditIds)} or organization_id in ${sql(orgIds)} or changed_by in ${sql(userIds)}) as audit_log,
      (select count(*)::int from auth.users where id in ${sql(userIds)} or email in ${sql(emails)}) as auth_users,
      (select count(*)::int from users where id in ${sql(userIds)} or email in ${sql(emails)} or organization_id in ${sql(orgIds)}) as public_users,
      (select count(*)::int from organizations where id in ${sql(orgIds)} or name in ${sql(orgNames)}) as orgs,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(orgIds)} or user_id in ${sql(userIds)}) as legal_acceptances
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
      auditIds: [],
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
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
      fail(
        `wrangler dev exited before health check completed\n${output.slice(-2000)}`,
      );
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

async function assertPortAvailable(baseUrl) {
  let response;
  try {
    response = await fetch(`${baseUrl}/health`);
  } catch {
    return;
  }
  if (response.ok) {
    fail(`${baseUrl} is already serving /health; stop the existing Worker.`);
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

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) =>
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`),
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
    `expected ${options.code}, got ${stableJson(body)}`,
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

function assertNoLeakage(value, marker) {
  assert(
    !stableJson(value).includes(marker),
    `hidden marker leaked: ${marker}`,
  );
}

function assertAuditEnvelope(page, expected) {
  assertExactKeys(page, AUDIT_ENVELOPE_KEYS, `${expected.label} envelope`);
  assert(page.total === expected.total, `${expected.label} total mismatch`);
  assert(page.page === expected.page, `${expected.label} page mismatch`);
  assert(
    page.page_size === expected.pageSize,
    `${expected.label} page_size mismatch`,
  );
  assert(
    page.total_pages === expected.totalPages,
    `${expected.label} total_pages mismatch`,
  );
  assert(
    page.has_next === expected.hasNext,
    `${expected.label} has_next mismatch`,
  );
  assert(
    page.has_previous === expected.hasPrevious,
    `${expected.label} has_previous mismatch`,
  );
}

function assertAuditItems(items, expected) {
  assert(items.length === expected.length, "audit item count mismatch");
  for (let index = 0; index < expected.length; index += 1) {
    const item = items[index];
    const expectedItem = expected[index];
    assertExactKeys(item, AUDIT_ITEM_KEYS, `audit item ${index}`);
    assert(
      stableJson(item) === stableJson(expectedItem),
      `audit item ${index} mismatch: expected ${stableJson(expectedItem)}, got ${stableJson(item)}`,
    );
  }
}

function expectedVisibleAuditRows(seeded, account) {
  return {
    delete: {
      id: Number(seeded.auditIds[2]),
      table_name: "leases",
      operation: "DELETE",
      row_id: seeded.deleteRowId,
      old_data: { tenant: "Removed" },
      new_data: null,
      changed_by: account.member.userId,
      changed_at: "2026-01-03 12:00:00+00",
      organization_id: account.owner.organizationId,
      session_info: SESSION_INFO,
    },
    gl: {
      id: Number(seeded.auditIds[1]),
      table_name: "gl_entries",
      operation: "INSERT",
      row_id: seeded.glRowId,
      old_data: null,
      new_data: { amount: 125, marker: "visible" },
      changed_by: account.owner.userId,
      changed_at: "2026-01-02 12:00:00+00",
      organization_id: account.owner.organizationId,
      session_info: SESSION_INFO,
    },
    update: {
      id: Number(seeded.auditIds[0]),
      table_name: "leases",
      operation: "UPDATE",
      row_id: seeded.leaseRowId,
      old_data: { tenant: "Before" },
      new_data: { tenant: "After" },
      changed_by: account.owner.userId,
      changed_at: "2026-01-01 12:00:00+00",
      organization_id: account.owner.organizationId,
      session_info: SESSION_INFO,
    },
  };
}

function expectedHiddenAuditRow(seeded, account) {
  return {
    id: Number(seeded.auditIds[3]),
    table_name: "leases",
    operation: "UPDATE",
    row_id: seeded.hiddenRowId,
    old_data: { marker: account.hiddenMarker },
    new_data: { marker: account.hiddenMarker },
    changed_by: account.hidden.userId,
    changed_at: "2026-01-04 12:00:00+00",
    organization_id: account.hidden.organizationId,
    session_info: SESSION_INFO,
  };
}

function assertExactKeys(actual, expectedKeys, label) {
  assert(
    actual && typeof actual === "object" && !Array.isArray(actual),
    `${label} should be an object`,
  );
  const actualKeys = Object.keys(actual).sort();
  const sortedExpected = [...expectedKeys].sort();
  assert(
    stableJson(actualKeys) === stableJson(sortedExpected),
    `${label} keys mismatch: expected ${stableJson(sortedExpected)}, got ${stableJson(actualKeys)}`,
  );
}

function assertNoVisibleLeakage(value, account) {
  const serialized = stableJson(value);
  for (const leaked of [
    account.owner.organizationId,
    account.owner.userId,
    account.member.userId,
  ]) {
    assert(!serialized.includes(leaked), `visible id leaked: ${leaked}`);
  }
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
