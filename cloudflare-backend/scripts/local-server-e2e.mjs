#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";

const DEFAULT_BASE_URL = "http://127.0.0.1:8859";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_VALID_UUID = "22222222-2222-4222-8222-222222222222";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const AUTH_REQUIRED_BODY = {
  error: {
    code: "authorization_required",
    message: "Authorization header required",
  },
};

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (
    args["base-url"] ||
    process.env.npm_config_base_url ||
    process.env.LOCAL_SERVER_BASE_URL
  ) {
    fail(`local server smoke always owns ${DEFAULT_BASE_URL}`);
  }
  const repeat = parsePositiveInteger(
    args.repeat ??
      process.env.npm_config_repeat ??
      process.env.LOCAL_SERVER_E2E_REPEAT ??
      "3",
    "repeat",
  );
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
      DEFAULT_DATABASE_URL,
  );

  if (process.env.CI) {
    fail("Refusing to run local server smoke in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let cleanupError;
  try {
    console.log(
      `probing ${baseUrl} (${repeat} pass${repeat === 1 ? "" : "es"})`,
    );
    for (let passNumber = 1; passNumber <= repeat; passNumber += 1) {
      await runSmokePass({ baseUrl, passNumber });
    }
    console.log("local server e2e smoke completed");
  } catch (error) {
    runError = error;
  }
  try {
    await worker.close();
  } catch (error) {
    cleanupError = error;
  }
  if (runError) {
    if (cleanupError) {
      console.error(
        `Worker cleanup failed after local server smoke failure: ${errorMessage(cleanupError)}`,
      );
    }
    throw runError;
  }
  if (cleanupError) throw cleanupError;
}

async function runSmokePass(input) {
  const health = await request(input.baseUrl, "/health");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, {
    status: "healthy",
    version: "0.1.0",
    environment: "development",
    runtime: "cloudflare-workers",
  });

  for (const route of authRequiredRoutes()) {
    await expectAuthRequired(input.baseUrl, route.path, route.init);
  }

  const uploadForm = new FormData();
  uploadForm.set(
    "file",
    new Blob(["%PDF-1.7\n% local smoke fixture\n"], {
      type: "application/pdf",
    }),
    "local-smoke.pdf",
  );
  await expectAuthRequired(
    input.baseUrl,
    `/api/v1/documents/upload?property_id=${OTHER_VALID_UUID}`,
    { method: "POST", body: uploadForm },
  );

  await expectCorsPreflight(input.baseUrl, "/api/v1/dashboard", {
    origin: "https://app.capveri.com",
    method: "GET",
    requestHeaders: "authorization,x-correlation-id",
    allowedHeaderPatterns: [/authorization/iu, /x-correlation-id/iu],
  });

  const blockedOrigin = await request(input.baseUrl, "/health", {
    headers: { Origin: "https://evil.example.com" },
  });
  assert.equal(blockedOrigin.response.status, 200);
  assert.notEqual(
    blockedOrigin.response.headers.get("access-control-allow-origin"),
    "https://evil.example.com",
  );

  await expectCorsPreflight(
    input.baseUrl,
    `/api/v1/document-files/${VALID_UUID}`,
    {
      origin: "http://localhost:5173",
      method: "GET",
      requestHeaders: "range",
      allowedHeaderPatterns: [/range/iu],
    },
  );
  await expectCorsPreflight(
    input.baseUrl,
    `/api/v1/extractions/${VALID_UUID}/process`,
    {
      origin: "https://app.capveri.com",
      method: "POST",
      requestHeaders: "authorization,content-type,x-correlation-id",
      allowedHeaderPatterns: [
        /authorization/iu,
        /content-type/iu,
        /x-correlation-id/iu,
      ],
    },
  );
  await expectCorsPreflight(
    input.baseUrl,
    `/api/v1/extractions/${VALID_UUID}/approve`,
    {
      origin: "https://app.capveri.com",
      method: "PUT",
      requestHeaders: "authorization,content-type,x-correlation-id",
      allowedHeaderPatterns: [
        /authorization/iu,
        /content-type/iu,
        /x-correlation-id/iu,
      ],
    },
  );

  console.log(`local server smoke pass ${input.passNumber} ok`);
}

function authRequiredRoutes() {
  return [
    { path: "/api/v1/documents" },
    { path: "/api/v1/extractions" },
    { path: `/api/v1/documents/${VALID_UUID}` },
    { path: `/api/v1/documents/${VALID_UUID}`, init: { method: "DELETE" } },
    { path: `/api/v1/extractions/${VALID_UUID}` },
    { path: `/api/v1/extractions/jobs/${VALID_UUID}` },
    {
      path: `/api/v1/extractions/jobs/${VALID_UUID}/retry`,
      init: { method: "POST" },
    },
    {
      path: `/api/v1/extractions/${VALID_UUID}/process?priority=15`,
      init: { method: "POST" },
    },
    {
      path: `/api/v1/extractions/${VALID_UUID}/draft`,
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { status: "needs_review" } }),
      },
    },
    {
      path: `/api/v1/extractions/${VALID_UUID}/approve`,
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    },
    {
      path: `/api/v1/extractions/${VALID_UUID}/reject`,
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "local smoke auth probe" }),
      },
    },
  ];
}

async function expectCorsPreflight(baseUrl, path, input) {
  const { response } = await request(baseUrl, path, {
    method: "OPTIONS",
    headers: {
      Origin: input.origin,
      "Access-Control-Request-Method": input.method,
      "Access-Control-Request-Headers": input.requestHeaders,
    },
  });
  assert.equal(response.status, 204, `${path} preflight status`);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    input.origin,
    `${path} preflight allow-origin`,
  );
  assert.equal(
    response.headers.get("access-control-allow-credentials"),
    "true",
    `${path} preflight allow-credentials`,
  );
  const allowHeaders =
    response.headers.get("access-control-allow-headers") ?? "";
  for (const pattern of input.allowedHeaderPatterns) {
    assert.match(allowHeaders, pattern, `${path} preflight allow-headers`);
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
  let childError;
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-server-e2e-"));
  const path = resolve(directory, ".dev.vars.local-server-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-server-e2e-signing-secret",
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

async function request(baseUrl, path, init) {
  const response = await fetch(new URL(path, baseUrl), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await readJson(response)
    : await response.text();

  return { body, response };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Expected JSON from ${response.url}, received status ${response.status}: ${text}`,
      { cause: error },
    );
  }
}

async function expectAuthRequired(baseUrl, path, init = {}) {
  const { body, response } = await request(baseUrl, path, init);

  assert.equal(response.status, 401, `${path} should require auth`);
  expectError(body, "authorization_required");
}

function expectError(body, code) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  if (code === "authorization_required") {
    assert.deepEqual(body, AUTH_REQUIRED_BODY);
    return;
  }
  assert.equal(body.error?.code, code);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
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
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith(`${name}=`));
    if (!line) continue;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
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
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!allowedHosts.has(url.hostname)) {
    fail("database-url must point at localhost or loopback");
  }
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
  }
  return url.toString();
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
      lastError = errorMessage(error);
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
