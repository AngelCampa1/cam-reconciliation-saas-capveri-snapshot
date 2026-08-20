import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";

const DEFAULT_BASE_URL = "http://127.0.0.1:8827";
const DEFAULT_STUB_URL = "http://127.0.0.1:8828";
const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const RESEND_SECRET_BYTES = Buffer.from("local-resend-webhook-secret-32bytes");
const RESEND_WEBHOOK_SECRET = `whsec_${RESEND_SECRET_BYTES.toString("base64")}`;
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const RECEIVED_RESPONSE = { received: true };

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
    fail(`local Resend webhook E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const stubUrl = normalizedLocalUrl(
    args["stub-url"] ?? process.env.npm_config_stub_url ?? DEFAULT_STUB_URL,
    "stub-url",
  );

  if (process.env.CI) fail("Refusing to run local Resend webhook E2E in CI.");
  await assertPortAvailable(baseUrl);
  await assertPortAvailable(stubUrl);

  const stub = await startResendStub(stubUrl);
  const worker = await startWorkerServer({ baseUrl, stubUrl });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      stub.clear();
      runs.push(await runOnce({ baseUrl, stub, index }));
    }
    console.log(
      JSON.stringify(
        { ok: true, base_url: baseUrl, stub_url: stubUrl, repeat, runs },
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
      await stub.close();
    } catch (error) {
      closeError ??= error;
    }
  }
  if (runError && closeError) {
    console.error(
      `Local Resend webhook cleanup failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;

  await expectError(input.baseUrl, {
    status: 400,
    code: "missing_signature",
    message: "Missing svix-signature header",
    body: emailReceivedEvent({ subject: `Missing signature ${suffix}` }),
  });
  assert(input.stub.requests.length === 0, "missing signature called Resend");

  await postSignedEvent(input.baseUrl, emailReceivedEvent(), {
    signatureHeader: "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    status: 400,
    code: "invalid_signature",
    message: "Invalid webhook signature",
  });
  assert(input.stub.requests.length === 0, "invalid signature called Resend");

  await postSignedEvent(input.baseUrl, emailReceivedEvent(), {
    signatureHeader: "v0,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    status: 400,
    code: "malformed_signature",
    message: "No v1 signatures in svix-signature header",
  });
  assert(input.stub.requests.length === 0, "malformed signature called Resend");

  await postSignedEvent(input.baseUrl, emailReceivedEvent(), {
    timestamp: "not-a-number",
    status: 400,
    code: "malformed_signature",
    message: "Invalid svix-timestamp",
  });
  assert(input.stub.requests.length === 0, "malformed timestamp called Resend");

  await postSignedEvent(input.baseUrl, emailReceivedEvent(), {
    timestamp: Math.floor(Date.now() / 1000) - 400,
    status: 400,
    code: "stale_signature",
    message: "Svix signature is stale",
  });
  assert(input.stub.requests.length === 0, "stale signature called Resend");

  const beforeForward = input.stub.requests.length;
  const subject = `CAM question ${suffix}`;
  const forwardedResponse = await postSignedEvent(
    input.baseUrl,
    emailReceivedEvent({
      from: `tenant-${suffix}@example.com`,
      to: "support@capveri.com",
      subject,
      html: `<p>Hidden fee ${suffix}</p>`,
      text: `Hidden fee ${suffix}`,
    }),
  );
  assertDeepEqual(forwardedResponse, RECEIVED_RESPONSE, "forward response");
  const forwarded = await waitForStubRequest(input.stub, {
    start: beforeForward,
    predicate: (request) => request.path === "/resend/emails",
    message: "missing forwarded Resend email",
  });
  assertForwardedEmail(forwarded, {
    adminEmail: "admin@example.test",
    originalFrom: `tenant-${suffix}@example.com`,
    originalTo: "support@capveri.com",
    subject,
    text: `Hidden fee ${suffix}`,
  });

  const beforeNonCapveri = input.stub.requests.length;
  const nonCapveri = await postSignedEvent(
    input.baseUrl,
    emailReceivedEvent({ to: "support@example.com", subject: "external" }),
  );
  assertDeepEqual(nonCapveri, RECEIVED_RESPONSE, "non-CapVeri response");
  await expectNoStubRequest(input.stub, {
    start: beforeNonCapveri,
    message: "non-CapVeri recipient should not forward",
  });

  const beforeUnknown = input.stub.requests.length;
  const unknown = await postSignedEvent(input.baseUrl, {
    type: "email.bounced",
    data: {},
  });
  assertDeepEqual(unknown, RECEIVED_RESPONSE, "unknown event response");
  await expectNoStubRequest(input.stub, {
    start: beforeUnknown,
    message: "unknown event should not forward",
  });

  const beforeMalformed = input.stub.requests.length;
  await postSignedRaw(input.baseUrl, "not json {{{", {
    status: 400,
    code: "invalid_json",
    message: "Invalid JSON payload",
  });
  assert(
    input.stub.requests.length === beforeMalformed,
    "malformed JSON called Resend",
  );

  const beforeFailure = input.stub.requests.length;
  input.stub.failNextResend();
  const failedForward = await postSignedEvent(
    input.baseUrl,
    emailReceivedEvent({ subject: `Swallowed failure ${suffix}` }),
  );
  assertDeepEqual(failedForward, RECEIVED_RESPONSE, "failure response");
  await waitForStubRequest(input.stub, {
    start: beforeFailure,
    predicate: (request) =>
      request.path === "/resend/emails" &&
      request.body.subject ===
        "[Fwd: hello@capveri.com] Swallowed failure " + suffix,
    message: "missing swallowed failure Resend attempt",
  });

  return {
    index: input.index,
    forwarded_subject: subject,
    resend_calls: input.stub.requests.length,
  };
}

function emailReceivedEvent(overrides = {}) {
  return {
    type: "email.received",
    data: {
      from: "sender@example.com",
      to: "hello@capveri.com",
      subject: "Test inbound email",
      html: "<p>Hello</p>",
      text: "Hello",
      ...overrides,
    },
  };
}

async function postSignedEvent(baseUrl, event, options = {}) {
  return postSignedRaw(baseUrl, JSON.stringify(event), options);
}

async function postSignedRaw(baseUrl, rawBody, options = {}) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const svixId = options.svixId ?? `msg_${randomUUID()}`;
  const signature =
    options.signatureHeader ??
    `v1,${createHmac("sha256", RESEND_SECRET_BYTES)
      .update(`${svixId}.${timestamp}.${rawBody}`)
      .digest("base64")}`;
  const body = await expectJson(`${baseUrl}/api/v1/webhooks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": svixId,
      "svix-timestamp": String(timestamp),
      "svix-signature": signature,
    },
    status: options.status ?? 200,
    body: rawBody,
  });
  if (options.code) {
    assertDeepEqual(
      body,
      {
        detail: options.message,
        error: { code: options.code, message: options.message },
      },
      `${options.code} response`,
    );
  }
  return body;
}

async function expectError(baseUrl, input) {
  const body = await expectJson(`${baseUrl}/api/v1/webhooks/resend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    status: input.status,
    body: JSON.stringify(input.body),
  });
  assert(
    JSON.stringify(body) ===
      JSON.stringify({
        detail: input.message,
        error: { code: input.code, message: input.message },
      }),
    `expected ${input.code}, got ${JSON.stringify(body)}`,
  );
  return body;
}

function assertForwardedEmail(request, expected) {
  assert(request.method === "POST", "Resend method mismatch");
  assert(request.path === "/resend/emails", "Resend path mismatch");
  assert(
    String(request.headers["content-type"] ?? "").includes("application/json"),
    "Resend content-type mismatch",
  );
  assert(
    request.headers.authorization === "Bearer local-resend-key",
    "Resend authorization mismatch",
  );
  assertAllowedKeys(
    request.body,
    ["from", "to", "subject", "reply_to", "html", "text"],
    "forwarded email body",
  );
  assert(
    request.body.from === "CapVeri <local@capveri.local>",
    "from mismatch",
  );
  assert(request.body.to === expected.adminEmail, "admin recipient mismatch");
  assert(request.body.reply_to === expected.originalFrom, "reply_to mismatch");
  assert(
    request.body.subject ===
      `[Fwd: ${expected.originalTo}] ${expected.subject}`,
    "forwarded subject mismatch",
  );
  assert(
    String(request.body.text).includes(expected.text),
    "forwarded text missing original body",
  );
  assert(
    String(request.body.html).includes("&lt;p&gt;") === false,
    "original HTML should remain embedded",
  );
  assert(
    String(request.body.html).includes(expected.originalFrom),
    "forwarded HTML missing original sender",
  );
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

async function startResendStub(stubUrl) {
  const url = new URL(stubUrl);
  const requests = [];
  let waiter;
  let failNext = false;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    const body = text ? JSON.parse(text) : null;
    requests.push({
      method: request.method ?? "",
      path: new URL(request.url ?? "/", stubUrl).pathname,
      headers: request.headers,
      body,
    });
    waiter?.();
    if (failNext) {
      failNext = false;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "local resend failure" }));
      return;
    }
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
      failNext = false;
    },
    failNextResend: () => {
      failNext = true;
    },
    close: async () => {
      await new Promise((resolveClose) => server.close(resolveClose));
      await waitForPortClosed(stubUrl);
    },
    waitForChange: async () => {
      await new Promise((resolveWait) => {
        const timeout = setTimeout(resolveWait, 100);
        waiter = () => {
          clearTimeout(timeout);
          resolveWait();
        };
      });
      waiter = undefined;
    },
  };
}

async function waitForStubRequest(stub, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const request = stub.requests.slice(input.start).find(input.predicate);
    if (request) return request;
    await stub.waitForChange();
  }
  fail(input.message);
}

async function expectNoStubRequest(stub, input) {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (stub.requests.length > input.start) {
      fail(input.message);
    }
    await stub.waitForChange();
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
      `RESEND_WEBHOOK_SECRET:${RESEND_WEBHOOK_SECRET}`,
      "--var",
      "RESEND_API_KEY:local-resend-key",
      "--var",
      `RESEND_API_BASE_URL:${input.stubUrl}/resend`,
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
      "--var",
      "ADMIN_NOTIFICATION_EMAIL:admin@example.test",
      "--var",
      "DB_ACCESS_MODE:direct-postgres",
      "--var",
      `DATABASE_URL:${DATABASE_URL}`,
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
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-resend-webhook-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-resend-webhook-e2e");
  await writeFile(
    path,
    [
      "ENVIRONMENT=development",
      "NODE_ENV=development",
      "DB_ACCESS_MODE=direct-postgres",
      `DATABASE_URL=${DATABASE_URL}`,
      `RESEND_WEBHOOK_SECRET=${RESEND_WEBHOOK_SECRET}`,
      "RESEND_API_KEY=local-resend-key",
      `RESEND_API_BASE_URL=${input.stubUrl}/resend`,
      "RESEND_FROM_ADDRESS=CapVeri <local@capveri.local>",
      "ADMIN_NOTIFICATION_EMAIL=admin@example.test",
      "POSTHOG_PROJECT_API_KEY=",
      "POSTHOG_HOST=http://127.0.0.1:9",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
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
  env.DATABASE_URL = DATABASE_URL;
  env.RESEND_WEBHOOK_SECRET = RESEND_WEBHOOK_SECRET;
  env.RESEND_API_KEY = "local-resend-key";
  env.RESEND_API_BASE_URL = `${input.stubUrl}/resend`;
  env.RESEND_FROM_ADDRESS = "CapVeri <local@capveri.local>";
  env.ADMIN_NOTIFICATION_EMAIL = "admin@example.test";
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

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
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

function assertAllowedKeys(actual, expectedKeys, label) {
  assert(actual && typeof actual === "object", `${label} missing`);
  assertDeepEqual(
    Object.keys(actual).sort(),
    [...expectedKeys].sort(),
    `${label} keys`,
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
