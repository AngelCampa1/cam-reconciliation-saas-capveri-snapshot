import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";

const DEFAULT_BASE_URL = "http://127.0.0.1:8831";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");

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
    fail(`local tools E2E always owns ${DEFAULT_BASE_URL}`);
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

  if (process.env.CI) fail("Refusing to run local tools E2E in CI.");
  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({ baseUrl, supabaseUrl, databaseUrl });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(await runOnce({ baseUrl, index }));
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
      `Local tools Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const boma = await postJson(
    input.baseUrl,
    "/api/v1/tools/boma-2024-calculator",
    {
      usable_sf: "100000",
      rentable_sf: "125000",
      balcony_sf: "1000",
      terrace_sf: "2000",
      outdoor_amenity_sf: "1000",
      annual_rent_per_sf: "35",
      cap_rate: "0.065",
    },
  );
  assertDeepEqual(boma, {
    load_factor: "1.2500",
    new_usable_sf: "104000.00",
    new_rentable_sf: "130000.00",
    hidden_sf: "5000.00",
    pct_increase: "4.0000",
    revenue_lift: "175000.00",
    asset_value_lift: "2692308",
  });

  const bomaDefaults = await postJson(
    input.baseUrl,
    "/api/v1/tools/boma-2024-calculator",
    {
      usable_sf: 50000,
      rentable_sf: 60000,
      annual_rent_per_sf: "40.25",
    },
  );
  assertDeepEqual(bomaDefaults, {
    load_factor: "1.2000",
    new_usable_sf: "50000.00",
    new_rentable_sf: "60000.00",
    hidden_sf: "0.00",
    pct_increase: "0.0000",
    revenue_lift: "0.00",
    asset_value_lift: "0",
  });

  const hcad = await postJson(
    input.baseUrl,
    "/api/v1/tools/hcad-tax-normalizer/calculate",
    {
      original_base_year_assessment: "1200000",
      retroactive_adjustment: "150000",
      current_year_tax: "1350000",
      pro_rata_pct: "0.0525",
      cap_rate: "0.05",
    },
  );
  assertDeepEqual(hcad, {
    adjusted_base_year: "1050000.00",
    original_passthrough: "7875.00",
    corrected_passthrough: "15750.00",
    recovery_delta: "7875.00",
    capped_corrected_passthrough: "8268.75",
    capped_recovery: "393.75",
    cap_was_applied: true,
  });

  const hcadUncapped = await postJson(
    input.baseUrl,
    "/api/v1/tools/hcad-tax-normalizer/calculate",
    {
      original_base_year_assessment: "1200000",
      retroactive_adjustment: "150000",
      current_year_tax: "1350000",
      pro_rata_pct: "0.0525",
    },
  );
  assertDeepEqual(hcadUncapped, {
    adjusted_base_year: "1050000.00",
    original_passthrough: "7875.00",
    corrected_passthrough: "15750.00",
    recovery_delta: "7875.00",
    capped_corrected_passthrough: null,
    capped_recovery: null,
    cap_was_applied: null,
  });

  const fixed = await postJson(
    input.baseUrl,
    "/api/v1/tools/fixed-cam-modeler",
    {
      years: [
        {
          year: 2026,
          total_operating_expenses: "1200000",
          rentable_sf: "100000",
        },
        {
          year: 2024,
          total_operating_expenses: "1000000",
          rentable_sf: "100000",
        },
        {
          year: 2025,
          total_operating_expenses: "1100000",
          rentable_sf: "100000",
        },
      ],
      fixed_cam_rate_per_sf: "8.50",
      annual_escalation_pct: "3",
      tenant_sqft: "5000",
      pro_rata_share: "5",
    },
  );
  assertDeepEqual(fixed, {
    years: expectedFixedCamYears(),
    total_traditional_recovery: "165000.00",
    total_fixed_cam_revenue: "131363.25",
    total_delta: "33636.75",
    avg_annual_delta: "11212.25",
  });

  const fractionalShare = await postJson(
    input.baseUrl,
    "/api/v1/tools/fixed-cam-modeler",
    {
      years: [
        {
          year: 2024,
          total_operating_expenses: "999999.99",
          rentable_sf: "123456.78",
        },
        {
          year: 2025,
          total_operating_expenses: "1000000.01",
          rentable_sf: "123456.78",
        },
        {
          year: 2026,
          total_operating_expenses: "1000000.02",
          rentable_sf: "123456.78",
        },
      ],
      fixed_cam_rate_per_sf: "7.125",
      annual_escalation_pct: "2.25",
      tenant_sqft: "4321.5",
      pro_rata_share: "3.3333",
    },
  );
  assertDeepEqual(fractionalShare, {
    years: [
      {
        year: 2024,
        total_operating_expenses: "999999.99",
        expense_per_sf: "8.10",
        traditional_recovery: "33333.00",
        fixed_cam_revenue: "30790.69",
        delta: "2542.31",
        cumulative_delta: "2542.31",
        escalated_rate_per_sf: "7.13",
      },
      {
        year: 2025,
        total_operating_expenses: "1000000.01",
        expense_per_sf: "8.10",
        traditional_recovery: "33333.00",
        fixed_cam_revenue: "31483.48",
        delta: "1849.52",
        cumulative_delta: "4391.83",
        escalated_rate_per_sf: "7.29",
      },
      {
        year: 2026,
        total_operating_expenses: "1000000.02",
        expense_per_sf: "8.10",
        traditional_recovery: "33333.00",
        fixed_cam_revenue: "32191.86",
        delta: "1141.14",
        cumulative_delta: "5532.97",
        escalated_rate_per_sf: "7.45",
      },
    ],
    total_traditional_recovery: "99999.00",
    total_fixed_cam_revenue: "94466.03",
    total_delta: "5532.97",
    avg_annual_delta: "1844.32",
  });

  await expectError(input.baseUrl, "/api/v1/tools/boma-2024-calculator", {
    status: 422,
    code: "invalid_tool_input",
    message: "rentable_sf must be >= usable_sf (load factor < 1 is invalid)",
    body: {
      usable_sf: "100000",
      rentable_sf: "90000",
      annual_rent_per_sf: "35",
    },
  });
  await expectError(input.baseUrl, "/api/v1/tools/boma-2024-calculator", {
    status: 422,
    code: "invalid_tool_input",
    message: "Input must be a finite decimal value",
    body: {
      usable_sf: "not-a-number",
      rentable_sf: "90000",
      annual_rent_per_sf: "35",
    },
  });
  await expectError(
    input.baseUrl,
    "/api/v1/tools/hcad-tax-normalizer/calculate",
    {
      status: 422,
      code: "validation_error",
      message:
        "retroactive_adjustment cannot exceed original_base_year_assessment",
      body: {
        original_base_year_assessment: "1000",
        retroactive_adjustment: "1001",
        current_year_tax: "2000",
        pro_rata_pct: "0.5",
      },
    },
  );
  await expectError(input.baseUrl, "/api/v1/tools/fixed-cam-modeler", {
    status: 422,
    code: "validation_error",
    message: "Array must contain at least 3 element(s)",
    body: {
      years: [
        { year: 2024, total_operating_expenses: "1000", rentable_sf: "100" },
        { year: 2025, total_operating_expenses: "1000", rentable_sf: "100" },
      ],
      fixed_cam_rate_per_sf: "1",
      annual_escalation_pct: "3",
      tenant_sqft: "100",
      pro_rata_share: "5",
    },
  });

  for (const path of [
    "/api/v1/tools/boma-2024-calculator",
    "/api/v1/tools/hcad-tax-normalizer/calculate",
    "/api/v1/tools/fixed-cam-modeler",
  ]) {
    await expectMalformedJson(input.baseUrl, path);
  }

  return {
    index: input.index,
    boma_hidden_sf: boma.hidden_sf,
    hcad_capped_recovery: hcad.capped_recovery,
    fixed_cam_total_delta: fixed.total_delta,
    fractional_share_delta: fractionalShare.total_delta,
  };
}

function expectedFixedCamYears() {
  return [
    {
      year: 2024,
      total_operating_expenses: "1000000.00",
      expense_per_sf: "10.00",
      traditional_recovery: "50000.00",
      fixed_cam_revenue: "42500.00",
      delta: "7500.00",
      cumulative_delta: "7500.00",
      escalated_rate_per_sf: "8.50",
    },
    {
      year: 2025,
      total_operating_expenses: "1100000.00",
      expense_per_sf: "11.00",
      traditional_recovery: "55000.00",
      fixed_cam_revenue: "43775.00",
      delta: "11225.00",
      cumulative_delta: "18725.00",
      escalated_rate_per_sf: "8.76",
    },
    {
      year: 2026,
      total_operating_expenses: "1200000.00",
      expense_per_sf: "12.00",
      traditional_recovery: "60000.00",
      fixed_cam_revenue: "45088.25",
      delta: "14911.75",
      cumulative_delta: "33636.75",
      escalated_rate_per_sf: "9.02",
    },
  ];
}

async function postJson(baseUrl, path, body) {
  return expectJson(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectError(baseUrl, path, input) {
  const body = await expectJson(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    status: input.status,
    body: JSON.stringify(input.body),
  });
  assertDeepEqual(body, {
    detail: input.message,
    error: { code: input.code, message: input.message },
  });
  return body;
}

async function expectMalformedJson(baseUrl, path) {
  const body = await expectJson(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    status: 400,
    body: "{ not valid json",
  });
  assertDeepEqual(body, {
    detail: "Request body must be valid JSON",
    error: {
      code: "invalid_json",
      message: "Request body must be valid JSON",
    },
  });
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  const text = await response.text();
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  const body = text ? parseJson(text, url) : null;
  return body;
}

function parseJson(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON response from ${url}, received: ${text.slice(0, 500)}`);
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
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-tools-e2e-"));
  const path = resolve(directory, ".dev.vars.local-tools-e2e");
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
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
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
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("database-url must be Postgres");
  }
  if (!isLoopbackHost(url.hostname))
    fail("database-url must point at loopback");
  if (url.port !== "54322") {
    fail("database-url must use the local Supabase Postgres port 54322");
  }
  if (url.pathname !== "/postgres") {
    fail("database-url must target the local Supabase postgres database");
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

function assertDeepEqual(actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `expected ${expectedJson}, got ${actualJson}`,
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
