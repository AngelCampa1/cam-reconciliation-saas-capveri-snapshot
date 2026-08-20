import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { URLSearchParams } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:8821";
const DEFAULT_STUB_URL = "http://127.0.0.1:8822";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const SUCCESS_RESPONSE = {
  success: true,
  message: "Your message has been received. We'll be in touch within 24 hours.",
};

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
    fail(`local contact request E2E always owns ${DEFAULT_BASE_URL}`);
  }
  if (args["stub-url"] || process.env.npm_config_stub_url) {
    fail(`local contact request E2E always owns ${DEFAULT_STUB_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const stubUrl = DEFAULT_STUB_URL;
  if (process.env.CI) fail("Refusing to run local contact request E2E in CI.");
  await assertPortAvailable(baseUrl);
  const stub = await startProviderStub(stubUrl);
  const worker = await startWorkerServer({ baseUrl, stubUrl });
  let runError;
  let closeError;
  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
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
    for (const close of [() => worker.close(), () => stub.close()]) {
      try {
        await close();
      } catch (error) {
        closeError = error;
        if (runError) {
          console.error(
            `Local contact request cleanup failed after scenario failure: ${errorMessage(error)}`,
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
  const email = `contact-e2e-${suffix}@capveri.local`;
  const rateEmail = `contact-rate-${suffix}@capveri.local`;
  const failEmail = `contact-resend-fail-${suffix}@capveri.local`;
  const startCount = input.stub.requests.length;

  const success = await submit(input.baseUrl, {
    email: email.toUpperCase(),
    inquiry_type: "demo",
    name: "Local Contact",
  });
  assertDeepEqual(success, SUCCESS_RESPONSE, "success response");
  const successTurnstile = await waitForStubRequest(input.stub, {
    start: startCount,
    predicate: (request) =>
      request.path === "/turnstile" && request.body.response === "good-token",
    message: "missing success Turnstile call",
  });
  assertProviderRequest(successTurnstile, {
    path: "/turnstile",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    authorization: null,
    body: {
      secret: "local-turnstile-secret",
      response: "good-token",
      remoteip: "127.0.0.1",
    },
  });
  const successEmail = await waitForStubRequest(input.stub, {
    start: startCount,
    predicate: (request) =>
      request.path === "/resend/emails" &&
      request.body.reply_to?.[0] === email.toUpperCase(),
    message: "missing success Resend email",
  });
  assertProviderRequest(successEmail, {
    path: "/resend/emails",
    method: "POST",
    contentType: "application/json",
    authorization: "Bearer local-resend-key",
  });
  assertContactEmailContract(successEmail.body, {
    email: email.toUpperCase(),
    inquiryType: "demo",
    name: "Local Contact",
    company: "Local Co",
    phone: "555-0100",
    message: "Local contact request E2E",
  });

  const beforeHoneypot = input.stub.requests.length;
  const honeypot = await submit(input.baseUrl, {
    email: `bot-${suffix}@capveri.local`,
    company_website: "https://bot.example.test",
  });
  assertDeepEqual(honeypot, SUCCESS_RESPONSE, "honeypot response");
  await expectNoStubRequest(input.stub, {
    start: beforeHoneypot,
    predicate: (request) =>
      request.path === "/turnstile" || request.path === "/resend/emails",
    message: "honeypot should skip provider calls",
  });

  const badTurnstileStart = input.stub.requests.length;
  await expectError(input.baseUrl, {
    status: 403,
    code: "forbidden",
    message: "Verification failed. Please try again.",
    body: {
      email: `bad-turnstile-${suffix}@capveri.local`,
      turnstile_token: "bad-token",
    },
  });
  const badTurnstileCall = await waitForStubRequest(input.stub, {
    start: badTurnstileStart,
    predicate: (request) =>
      request.path === "/turnstile" && request.body.response === "bad-token",
    message: "missing bad Turnstile call",
  });
  assertProviderRequest(badTurnstileCall, {
    path: "/turnstile",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    authorization: null,
    body: {
      secret: "local-turnstile-secret",
      response: "bad-token",
    },
  });
  assert(
    !input.stub.requests.some(
      (request) =>
        request.path === "/resend/emails" &&
        request.body.reply_to?.[0] === `bad-turnstile-${suffix}@capveri.local`,
    ),
    "bad Turnstile should not send email",
  );

  const rateEmailUpper = rateEmail.toUpperCase();
  for (let count = 0; count < 3; count += 1) {
    const rateResponse = await submit(input.baseUrl, {
      email: rateEmailUpper,
      inquiry_type: "rate",
      name: `Rate ${count}`,
    });
    assertDeepEqual(rateResponse, SUCCESS_RESPONSE, `rate response ${count}`);
  }
  const beforeRateLimitReject = input.stub.requests.length;
  await expectError(input.baseUrl, {
    status: 429,
    code: "rate_limit_exceeded",
    message:
      "Rate limit exceeded: maximum 3 contact requests per email per day",
    body: { email: rateEmail, inquiry_type: "rate" },
  });
  await expectNoStubRequest(input.stub, {
    start: beforeRateLimitReject,
    predicate: (request) =>
      request.path === "/resend/emails" &&
      request.body.reply_to?.[0] === rateEmail,
    message: "rate-limited request should not send email",
  });

  const beforeFail = input.stub.requests.length;
  const resendFailure = await submit(input.baseUrl, {
    email: failEmail,
    inquiry_type: "resend-fail",
    name: "Resend Fail",
  });
  assertDeepEqual(resendFailure, SUCCESS_RESPONSE, "Resend failure response");
  await waitForStubRequest(input.stub, {
    start: beforeFail,
    predicate: (request) =>
      request.path === "/resend/emails" &&
      request.body.reply_to?.[0] === failEmail,
    message: "missing failing Resend call",
  });

  return {
    index: input.index,
    email,
    rate_limited_email: rateEmail,
    provider_calls: input.stub.requests.length - startCount,
  };
}

function assertContactEmailContract(body, input) {
  assertAllowedKeys(
    body,
    ["from", "to", "reply_to", "subject", "html", "text"],
    "contact email body",
  );
  assert(
    body.from === "CapVeri <local@capveri.local>",
    "contact email from mismatch",
  );
  assertDeepEqual(body.to, ["admin@example.test"], "contact email to");
  assertDeepEqual(body.reply_to, [input.email], "contact email reply_to");
  assert(
    body.subject === `New CapVeri contact request: ${input.inquiryType}`,
    "contact email subject mismatch",
  );

  const expectedText = [
    "New CapVeri contact request",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Inquiry type: ${input.inquiryType}`,
    `Company: ${input.company}`,
    `Phone: ${input.phone}`,
    `Message: ${input.message}`,
  ].join("\n");
  assert(body.text === expectedText, "contact email text body mismatch");

  for (const expected of [
    "New CapVeri contact request",
    input.name,
    input.email,
    input.inquiryType,
    input.company,
    input.phone,
    input.message,
  ]) {
    assert(
      String(body.html).includes(expected),
      `contact email HTML missing ${expected}`,
    );
  }
}

function assertProviderRequest(actual, expected) {
  assert(actual.path === expected.path, `${expected.path} path mismatch`);
  assert(actual.method === expected.method, `${expected.path} method mismatch`);
  assert(
    String(actual.headers["content-type"] ?? "").includes(expected.contentType),
    `${expected.path} content type mismatch`,
  );
  if (expected.authorization === null) {
    assert(
      actual.headers.authorization === undefined,
      `${expected.path} authorization should be absent`,
    );
  } else if (expected.authorization !== undefined) {
    assert(
      actual.headers.authorization === expected.authorization,
      `${expected.path} authorization mismatch`,
    );
  }
  if (expected.body) {
    for (const [key, value] of Object.entries(expected.body)) {
      assert(
        actual.body[key] === value,
        `${expected.path} body ${key} mismatch: expected ${value}, got ${actual.body[key]}`,
      );
    }
  }
}

async function submit(baseUrl, overrides = {}) {
  return expectJson(`${baseUrl}/api/v1/contact-requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "127.0.0.1",
    },
    status: 201,
    body: JSON.stringify({
      name: "Local Contact",
      email: `contact-${randomUUID()}@capveri.local`,
      inquiry_type: "demo",
      company: "Local Co",
      phone: "555-0100",
      message: "Local contact request E2E",
      turnstile_token: "good-token",
      ...overrides,
    }),
  });
}

async function expectError(baseUrl, input) {
  const body = await expectJson(`${baseUrl}/api/v1/contact-requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    status: input.status,
    body: JSON.stringify({
      name: "Local Contact",
      email: `contact-${randomUUID()}@capveri.local`,
      inquiry_type: "demo",
      turnstile_token: "good-token",
      ...input.body,
    }),
  });
  assertDeepEqual(
    body,
    {
      detail: input.message,
      error: { code: input.code, message: input.message },
    },
    `${input.code} response`,
  );
  return body;
}

async function startProviderStub(stubUrl) {
  const url = new URL(stubUrl);
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    const body = parseRequestBody(text, request.headers["content-type"]);
    requests.push({
      method: request.method ?? "",
      path: new URL(request.url ?? "/", stubUrl).pathname,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key.toLowerCase(),
          Array.isArray(value) ? value.join(", ") : String(value),
        ]),
      ),
      body,
    });
    if (request.url?.startsWith("/turnstile")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: body.response !== "bad-token" }));
      return;
    }
    if (request.url?.startsWith("/resend/emails")) {
      if (body.reply_to?.[0]?.includes("resend-fail")) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "local resend failure" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: `email-${requests.length}` }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolveListen) => {
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    close: () =>
      new Promise((resolveClose, rejectClose) =>
        server.close((error) =>
          error ? rejectClose(error) : resolveClose(undefined),
        ),
      ),
  };
}

function parseRequestBody(text, contentType) {
  if (!text) return {};
  if (String(contentType ?? "").includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  return JSON.parse(text);
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
      "--var",
      `RESEND_API_BASE_URL:${input.stubUrl}/resend`,
      "--var",
      "RESEND_API_KEY:local-resend-key",
      "--var",
      "RESEND_FROM_ADDRESS:CapVeri <local@capveri.local>",
      "--var",
      "ADMIN_NOTIFICATION_EMAIL:admin@example.test",
    ],
    {
      cwd: process.cwd(),
      env: workerEnv(input.stubUrl),
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

function workerEnv(stubUrl) {
  const env = { ...process.env };
  env.ENVIRONMENT = "development";
  env.NODE_ENV = "development";
  env.TURNSTILE_SECRET_KEY = "local-turnstile-secret";
  env.TURNSTILE_SITEVERIFY_URL = `${stubUrl}/turnstile`;
  env.RESEND_API_BASE_URL = `${stubUrl}/resend`;
  env.RESEND_API_KEY = "local-resend-key";
  env.RESEND_FROM_ADDRESS = "CapVeri <local@capveri.local>";
  env.ADMIN_NOTIFICATION_EMAIL = "admin@example.test";
  return env;
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

async function waitForStubRequest(stub, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const match = stub.requests.slice(input.start).find(input.predicate);
    if (match) return match;
    await sleep(100);
  }
  fail(input.message);
}

async function expectNoStubRequest(stub, input) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const match = stub.requests.slice(input.start).find(input.predicate);
    if (match) {
      fail(`${input.message}: ${JSON.stringify(match)}`);
    }
    await sleep(100);
  }
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

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  const actualKeys = Object.keys(actual).sort();
  const expected = [...expectedKeys].sort();
  assertDeepEqual(actualKeys, expected, `${label} keys`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
