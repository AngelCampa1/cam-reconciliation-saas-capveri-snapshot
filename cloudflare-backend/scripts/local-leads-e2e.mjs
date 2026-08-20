import http from "node:http";
import { Buffer } from "node:buffer";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { devNull, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify, TextDecoder } from "node:util";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8853";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_STUB_URL = "http://127.0.0.1:8854";
const DEFAULT_LEAD_MAGNETS_BUCKET = "capveri-lead-magnets";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const PDF_ASSET = {
  slug: "cam-reconciliation-checklist",
  key: "lead-magnets/2026-06-25/cam-reconciliation-checklist.pdf",
  bytes: "%PDF-1.4\n% local leads e2e pdf\n%%EOF\n",
};
const XLSX_ASSET = {
  slug: "cam-reconciliation-excel",
  key: "lead-magnets/2026-06-25/cam-reconciliation-excel.xlsx",
  bytes: "local leads e2e xlsx bytes\n",
};
const CALCULATOR_ASSET = {
  slug: "boma-2024-calculator",
  displayName: "BOMA 2024 Calculator",
};
const CONTENT_SUCCESS_RESPONSE = {
  success: true,
  message: "Check your email for the download link",
};
const CALCULATOR_SUCCESS_RESPONSE = {
  unlocked: true,
  message: "Results unlocked.",
};
const PLG_SUCCESS_RESPONSE = {
  success: true,
  message: "Your reconciliation results are saved - check your email.",
};
const execFileAsync = promisify(execFile);

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
    fail(`local leads E2E always owns ${DEFAULT_BASE_URL}`);
  }
  const baseUrl = DEFAULT_BASE_URL;
  const databaseUrl = normalizedLocalDatabaseUrl(
    args["database-url"] ??
      process.env.npm_config_database_url ??
      process.env.DATABASE_URL ??
      (await readEnvValue(resolve(".dev.vars"), ["DATABASE_URL"])) ??
      DEFAULT_DATABASE_URL,
  );
  const supabaseUrl = normalizedLocalSupabaseUrl(
    args["supabase-url"] ??
      process.env.npm_config_supabase_url ??
      process.env.SUPABASE_URL ??
      DEFAULT_SUPABASE_URL,
  );
  if (args["stub-url"] || process.env.npm_config_stub_url) {
    fail(`local leads E2E always owns ${DEFAULT_STUB_URL}`);
  }
  const stubUrl = DEFAULT_STUB_URL;
  if (
    args["lead-magnets-bucket"] ||
    process.env.npm_config_lead_magnets_bucket
  ) {
    fail(`local leads E2E always uses ${DEFAULT_LEAD_MAGNETS_BUCKET}`);
  }
  const leadMagnetsBucket = DEFAULT_LEAD_MAGNETS_BUCKET;
  if (process.env.CI) {
    fail("Refusing to run local leads E2E in CI.");
  }
  assertSafeR2Key(PDF_ASSET.key);
  assertSafeR2Key(XLSX_ASSET.key);

  await assertPortAvailable(baseUrl);
  await assertPortAvailable(stubUrl);
  const stub = await startExternalStub(stubUrl);
  let worker;
  const leadMagnetSnapshot = [];
  let runError;
  try {
    await seedLeadMagnetObjects(leadMagnetsBucket, leadMagnetSnapshot);
    worker = await startWorkerServer({
      baseUrl,
      databaseUrl,
      supabaseUrl,
      stubUrl,
    });

    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          databaseUrl,
          stubUrl,
          stub,
          index,
        }),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          stub_url: stubUrl,
          repeat,
          runs,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    runError = error;
  }
  let cleanupError;
  try {
    await cleanupHarness(leadMagnetsBucket, stub, worker, leadMagnetSnapshot);
  } catch (error) {
    cleanupError = error;
  }
  if (runError) {
    if (cleanupError) {
      console.error(
        `Cleanup failed after scenario failure: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
    throw runError;
  }
  if (cleanupError) throw cleanupError;
}

async function cleanupHarness(leadMagnetsBucket, stub, worker, snapshot) {
  let cleanupError;
  if (worker) {
    try {
      await worker.close();
    } catch (error) {
      cleanupError = error;
    }
  }
  try {
    await cleanupLeadMagnetObjects(leadMagnetsBucket, snapshot);
  } catch (error) {
    cleanupError ??= error;
  }
  try {
    await stub.close();
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) throw cleanupError;
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
      `APP_BASE_URL:${input.baseUrl}`,
      "--var",
      `MARKETING_BASE_URL:${input.baseUrl}`,
      "--var",
      `POSTHOG_HOST:${input.stubUrl}`,
      "--var",
      `RESEND_API_BASE_URL:${input.stubUrl}`,
      "--var",
      `TURNSTILE_SITEVERIFY_URL:${input.stubUrl}/turnstile`,
      "--var",
      `SEQUENCER_BASE_URL:${input.stubUrl}`,
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
          await new Promise((resolveClose) => {
            const timeout = setTimeout(resolveClose, 5000);
            child.once("exit", () => {
              globalThis.clearTimeout(timeout);
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
    await handle.close();
    throw error;
  }
}

async function createWorkerEnvFile(input) {
  const directory = await mkdtemp(resolve(tmpdir(), "capveri-leads-e2e-"));
  const path = resolve(directory, ".dev.vars.local-leads-e2e");
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
      `MARKETING_BASE_URL=${input.baseUrl}`,
      `POSTHOG_HOST=${input.stubUrl}`,
      "POSTHOG_PROJECT_API_KEY=local-leads-e2e-posthog-key",
      `RESEND_API_BASE_URL=${input.stubUrl}`,
      "RESEND_API_KEY=local-leads-e2e-resend-key",
      "RESEND_FROM_ADDRESS=Local Leads <leads@capveri.local>",
      `TURNSTILE_SITEVERIFY_URL=${input.stubUrl}/turnstile`,
      "TURNSTILE_SECRET_KEY=local-leads-e2e-turnstile-secret",
      `SEQUENCER_BASE_URL=${input.stubUrl}`,
      "SEQUENCER_CF_ACCESS_CLIENT_ID=local-leads-e2e-client-id",
      "SEQUENCER_CF_ACCESS_CLIENT_SECRET=local-leads-e2e-client-secret",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-leads-e2e-document-secret",
      "UNSUBSCRIBE_HMAC_SECRET=local-leads-e2e-unsubscribe-secret",
      "OPENROUTER_API_KEY=",
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
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
  env.APP_BASE_URL = input.baseUrl;
  env.MARKETING_BASE_URL = input.baseUrl;
  env.POSTHOG_HOST = input.stubUrl;
  env.POSTHOG_PROJECT_API_KEY = "local-leads-e2e-posthog-key";
  env.RESEND_API_BASE_URL = input.stubUrl;
  env.RESEND_API_KEY = "local-leads-e2e-resend-key";
  env.RESEND_FROM_ADDRESS = "Local Leads <leads@capveri.local>";
  env.TURNSTILE_SITEVERIFY_URL = `${input.stubUrl}/turnstile`;
  env.TURNSTILE_SECRET_KEY = "local-leads-e2e-turnstile-secret";
  env.SEQUENCER_BASE_URL = input.stubUrl;
  env.SEQUENCER_CF_ACCESS_CLIENT_ID = "local-leads-e2e-client-id";
  env.SEQUENCER_CF_ACCESS_CLIENT_SECRET = "local-leads-e2e-client-secret";
  env.DOCUMENT_ACCESS_SIGNING_SECRET = "local-leads-e2e-document-secret";
  env.UNSUBSCRIBE_HMAC_SECRET = "local-leads-e2e-unsubscribe-secret";
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

async function runOnce(input) {
  const suffix = `${Date.now()}-${input.index}-${randomUUID().slice(0, 8)}`;
  const contentEmail = `leads-e2e-content-${suffix}@capveri.local`;
  const suppressedEmail = `leads-e2e-suppressed-${suffix}@capveri.local`;
  const calculatorEmail = `leads-e2e-calculator-${suffix}@capveri.local`;
  const plgEmail = `leads-e2e-plg-${suffix}@capveri.local`;
  const emails = [contentEmail, suppressedEmail, calculatorEmail, plgEmail];
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const start = input.stub.requests.length;
  let runError;
  let cleanupError;
  let closeError;
  let result;

  try {
    const content = await expectJson(
      `${input.baseUrl}/api/v1/leads/content-download`,
      {
        method: "POST",
        headers: jsonHeaders(),
        status: 200,
        body: JSON.stringify({
          first_name: "Local",
          email: contentEmail,
          company: "Local Leads E2E",
          asset_slug: PDF_ASSET.slug,
          source: "local_e2e",
          turnstile_token: "local-turnstile-token",
          utm_source: "local",
        }),
      },
    );
    assertJsonEqual(content, CONTENT_SUCCESS_RESPONSE, "content response");
    await assertLeadCount(sql, {
      email: contentEmail,
      assetSlug: PDF_ASSET.slug,
      expected: 1,
    });
    const contentLead = await findLead(sql, {
      email: contentEmail,
      assetSlug: PDF_ASSET.slug,
    });
    assertLeadRow(
      contentLead,
      {
        first_name: "Local",
        email: contentEmail,
        company: "Local Leads E2E",
        asset_slug: PDF_ASSET.slug,
        source: "local_e2e",
        utm_source: "local",
        utm_medium: null,
        utm_campaign: null,
        unsubscribed_at: null,
      },
      "content lead row",
    );

    const emailPayload = await waitForResendPayload(input.stub, {
      start,
      toEmail: contentEmail,
    });
    const downloadUrl = extractDownloadUrl(emailPayload);
    const unsubscribeUrl = extractUnsubscribeUrl(emailPayload);
    assertContentDownloadEmailContract(emailPayload, {
      toEmail: contentEmail,
      firstName: "Local",
      assetName: "CAM Reconciliation Review Checklist",
      downloadUrl,
      unsubscribeUrl,
      registerUrl: `${input.baseUrl}/auth/register`,
    });
    const download = await expectBytes(downloadUrl, { status: 200 });
    assert(
      download.contentType === "application/pdf",
      "download content-type mismatch",
    );
    assert(
      download.contentDisposition ===
        'attachment; filename="cam-reconciliation-checklist.pdf"',
      "download filename mismatch",
    );
    assert(
      decode(download.bytes) === PDF_ASSET.bytes,
      "download bytes did not match seeded R2 object",
    );
    const contentPostHog = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/capture/" &&
        request.json?.event === "lead_form_submit" &&
        request.json?.properties?.asset_slug === PDF_ASSET.slug,
      message: "PostHog loopback lead_form_submit call missing.",
    });
    assertPostHogLeadEvent(contentPostHog, {
      event: "lead_form_submit",
      email: contentEmail,
      properties: {
        lead_id: contentLead.id,
        lead_type: "content_download",
        asset_slug: PDF_ASSET.slug,
        asset_format: "pdf",
        source: "local_e2e",
        utm_source: "local",
        utm_medium: null,
        utm_campaign: null,
      },
    });
    const contentEnrollment = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/api/v1/enrollments" &&
        request.json?.email === contentEmail &&
        request.json?.sequence_slug === "capveri-nurture-value-1",
      message: "Sequencer loopback content enrollment call missing.",
    });
    assertSequencerEnrollment(contentEnrollment, {
      email: contentEmail,
      sequenceSlug: "capveri-nurture-value-1",
      source: `content:${contentLead.id}:nurture`,
      properties: {
        assetSlug: PDF_ASSET.slug,
        assetName: "CAM Reconciliation Review Checklist",
        source: "local_e2e",
        utmSource: "local",
        utmMedium: null,
        utmCampaign: null,
      },
    });

    const rateLimited = await expectJson(
      `${input.baseUrl}/api/v1/leads/content-download`,
      {
        method: "POST",
        headers: jsonHeaders(),
        status: 429,
        body: JSON.stringify({
          first_name: "Local",
          email: contentEmail,
          asset_slug: PDF_ASSET.slug,
          turnstile_token: "local-turnstile-token",
        }),
      },
    );
    assertJsonEqual(
      rateLimited,
      {
        detail:
          "You have already requested this download. Check your email for the link.",
        error: {
          code: "rate_limit_exceeded",
          message:
            "You have already requested this download. Check your email for the link.",
        },
      },
      "rate limit response",
    );

    const suppressedInitial = await expectJson(
      `${input.baseUrl}/api/v1/leads/content-download`,
      {
        method: "POST",
        headers: jsonHeaders(),
        status: 200,
        body: JSON.stringify({
          first_name: "Suppress",
          email: suppressedEmail,
          asset_slug: XLSX_ASSET.slug,
          source: "local_e2e",
          turnstile_token: "local-turnstile-token",
        }),
      },
    );
    assertJsonEqual(
      suppressedInitial,
      CONTENT_SUCCESS_RESPONSE,
      "suppressed initial response",
    );
    await assertLeadCount(sql, {
      email: suppressedEmail,
      assetSlug: XLSX_ASSET.slug,
      expected: 1,
    });
    const suppressedEmailPayload = await waitForResendPayload(input.stub, {
      start,
      toEmail: suppressedEmail,
    });
    const suppressedUnsubscribeUrl = extractUnsubscribeUrl(
      suppressedEmailPayload,
    );
    const unsubscribe = await expectJson(
      toLocalUnsubscribeUrl(input.baseUrl, suppressedUnsubscribeUrl),
      {
        method: "POST",
        status: 200,
      },
    );
    assertJsonEqual(
      unsubscribe,
      {
        success: true,
        message:
          "You've been unsubscribed. You won't receive further marketing emails.",
      },
      "unsubscribe response",
    );
    await assertSuppression(sql, suppressedEmail);
    const suppressedLeadAfterUnsubscribe = await findLead(sql, {
      email: suppressedEmail,
      assetSlug: XLSX_ASSET.slug,
    });
    assertLeadRow(
      suppressedLeadAfterUnsubscribe,
      {
        first_name: "Suppress",
        email: suppressedEmail,
        company: null,
        asset_slug: XLSX_ASSET.slug,
        source: "local_e2e",
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
      },
      "suppressed lead row",
      { requireUnsubscribed: true },
    );
    const suppressedRequestCount = input.stub.requests.length;

    const suppressedRepeat = await expectJson(
      `${input.baseUrl}/api/v1/leads/content-download`,
      {
        method: "POST",
        headers: jsonHeaders(),
        status: 200,
        body: JSON.stringify({
          first_name: "Suppress",
          email: suppressedEmail,
          asset_slug: XLSX_ASSET.slug,
          source: "local_e2e",
          turnstile_token: "local-turnstile-token",
        }),
      },
    );
    assertJsonEqual(
      suppressedRepeat,
      CONTENT_SUCCESS_RESPONSE,
      "suppressed repeat response",
    );
    await assertLeadCount(sql, {
      email: suppressedEmail,
      assetSlug: XLSX_ASSET.slug,
      expected: 1,
    });
    await assertNoStubRequest(input.stub, {
      start: suppressedRequestCount,
      durationMs: 1500,
      predicate: (request) =>
        request.path === "/emails" &&
        Array.isArray(request.json?.to) &&
        request.json.to.includes(suppressedEmail),
      message: "suppressed lead re-submit sent another download email",
    });

    const calculator = await expectJson(
      `${input.baseUrl}/api/v1/leads/calculator-unlock`,
      {
        method: "POST",
        headers: jsonHeaders(),
        status: 200,
        body: JSON.stringify({
          first_name: "Calc",
          email: calculatorEmail,
          slug: CALCULATOR_ASSET.slug,
          source: "local_e2e_calculator",
          turnstile_token: "local-turnstile-token",
        }),
      },
    );
    assertJsonEqual(
      calculator,
      CALCULATOR_SUCCESS_RESPONSE,
      "calculator response",
    );
    const calculatorLead = await findLead(sql, {
      email: calculatorEmail,
      assetSlug: CALCULATOR_ASSET.slug,
    });
    assertLeadRow(
      calculatorLead,
      {
        first_name: "Calc",
        email: calculatorEmail,
        company: null,
        asset_slug: CALCULATOR_ASSET.slug,
        source: "local_e2e_calculator",
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        unsubscribed_at: null,
      },
      "calculator lead row",
    );
    const calculatorPostHog = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/capture/" &&
        request.json?.event === "calculator_unlock_completed" &&
        request.json?.properties?.asset_slug === CALCULATOR_ASSET.slug,
      message: "PostHog calculator_unlock_completed call missing.",
    });
    assertPostHogLeadEvent(calculatorPostHog, {
      event: "calculator_unlock_completed",
      email: calculatorEmail,
      properties: {
        lead_id: calculatorLead.id,
        lead_type: "calculator_unlock",
        asset_slug: CALCULATOR_ASSET.slug,
        source: "local_e2e_calculator",
      },
    });
    const calculatorEnrollment = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/api/v1/enrollments" &&
        request.json?.email === calculatorEmail &&
        request.json?.source === `calculator:${calculatorLead.id}:nurture`,
      message: "Sequencer loopback calculator enrollment call missing.",
    });
    assertSequencerEnrollment(calculatorEnrollment, {
      email: calculatorEmail,
      sequenceSlug: "capveri-nurture-value-1",
      source: `calculator:${calculatorLead.id}:nurture`,
      properties: {
        assetSlug: CALCULATOR_ASSET.slug,
        assetName: CALCULATOR_ASSET.displayName,
        source: "local_e2e_calculator",
      },
    });

    const plg = await expectJson(`${input.baseUrl}/api/v1/leads/plg-signup`, {
      method: "POST",
      headers: jsonHeaders(),
      status: 200,
      body: JSON.stringify({
        first_name: "PLG",
        email: plgEmail,
        organization_name: "Local Leads PLG",
        leakage_amount: "75000",
        utm_source: "local",
        utm_campaign: "local-leads-e2e",
        turnstile_token: "local-turnstile-token",
      }),
    });
    assertJsonEqual(plg, PLG_SUCCESS_RESPONSE, "PLG response");
    await assertLeadCount(sql, {
      email: plgEmail,
      assetSlug: "plg_free_audit",
      expected: 1,
    });
    const plgLead = await findLead(sql, {
      email: plgEmail,
      assetSlug: "plg_free_audit",
    });
    assertLeadRow(
      plgLead,
      {
        first_name: "PLG",
        email: plgEmail,
        company: "Local Leads PLG",
        asset_slug: "plg_free_audit",
        source: null,
        utm_source: "local",
        utm_medium: null,
        utm_campaign: "local-leads-e2e",
        unsubscribed_at: null,
      },
      "PLG lead row",
    );
    const plgPostHog = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/capture/" &&
        request.json?.event === "plg_signup_lead_captured" &&
        request.json?.properties?.asset_slug === "plg_free_audit",
      message:
        "PostHog loopback call missing; restart Worker with POSTHOG_PROJECT_API_KEY and POSTHOG_HOST pointing at the local stub.",
    });
    assertPostHogLeadEvent(plgPostHog, {
      event: "plg_signup_lead_captured",
      email: plgEmail,
      properties: {
        lead_id: plgLead.id,
        lead_type: "plg_free_audit",
        asset_slug: "plg_free_audit",
        leakage_amount_bucket: "50k-100k",
        utm_source: "local",
        utm_campaign: "local-leads-e2e",
      },
    });
    const plgSequencer = await waitForStubRequest(input.stub, {
      start,
      predicate: (request) =>
        request.path === "/api/v1/events" &&
        request.json?.email === plgEmail &&
        request.json?.event === "signup_completed",
      message:
        "Sequencer loopback call missing; restart Worker with SEQUENCER_BASE_URL, SEQUENCER_CF_ACCESS_CLIENT_ID, and SEQUENCER_CF_ACCESS_CLIENT_SECRET pointing at the local stub.",
    });
    assertSequencerEvent(plgSequencer, {
      email: plgEmail,
      event: "signup_completed",
      idempotencyKey: `signup_completed:capveri:lead:${plgLead.id}`,
      properties: {
        lead_id: plgLead.id,
        source: "plg_free_audit",
        asset_slug: "plg_free_audit",
        utm_source: "local",
        utm_campaign: "local-leads-e2e",
      },
    });
    assert(
      input.stub.requests
        .slice(start)
        .some((request) => request.path === "/turnstile"),
      "Turnstile loopback call missing; restart Worker with TURNSTILE_SITEVERIFY_URL pointing at the local stub.",
    );

    result = {
      index: input.index,
      content_email: contentEmail,
      suppressed_email: suppressedEmail,
      plg_email: plgEmail,
      stub_calls: input.stub.requests.length - start,
    };
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanupGeneratedRows(sql, emails);
      await assertCleanupComplete(sql, emails);
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError = error;
      }
    }
  }
  const postRunError = cleanupError ?? closeError;
  if (postRunError) {
    if (runError) {
      console.error(
        `Row cleanup failed after scenario failure: ${
          postRunError instanceof Error
            ? postRunError.message
            : String(postRunError)
        }`,
      );
    } else {
      throw postRunError;
    }
  }
  if (runError) throw runError;
  return result;
}

async function seedLeadMagnetObjects(bucket, snapshot) {
  const directory = resolve(".tmp", "local-leads-e2e");
  await mkdir(directory, { recursive: true });
  const files = [
    {
      asset: PDF_ASSET,
      path: join(directory, "cam-reconciliation-checklist.pdf"),
    },
    {
      asset: XLSX_ASSET,
      path: join(directory, "cam-reconciliation-excel.xlsx"),
    },
  ];
  try {
    for (const file of files) {
      snapshot.push({
        asset: file.asset,
        originalBytes: await getLocalR2ObjectBytes(
          bucket,
          file.asset.key,
          directory,
        ),
      });
      await writeFile(file.path, file.asset.bytes);
      await execFileAsync(
        process.execPath,
        [
          WRANGLER_BIN,
          "r2",
          "object",
          "put",
          `${bucket}/${file.asset.key}`,
          "--file",
          file.path,
          "--local",
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function cleanupLeadMagnetObjects(bucket, snapshot) {
  const records = snapshot;
  const directory = resolve(".tmp", "local-leads-e2e-restore");
  await mkdir(directory, { recursive: true });
  try {
    for (const record of records) {
      const key = record.asset.key;
      if (record.originalBytes === undefined) {
        await deleteLocalR2ObjectWithRetry(bucket, key);
        await assertLocalR2ObjectMissing(bucket, key);
        continue;
      }
      const path = join(directory, `${record.asset.slug}.restore`);
      await writeFile(path, record.originalBytes);
      await putLocalR2ObjectWithRetry(bucket, key, path);
      await assertLocalR2ObjectBytes(
        bucket,
        key,
        record.originalBytes,
        directory,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function getLocalR2ObjectBytes(bucket, key, directory) {
  const path = join(directory, `${key.replace(/[^a-z0-9._-]+/giu, "_")}.prior`);
  try {
    await execFileAsync(
      process.execPath,
      [
        WRANGLER_BIN,
        "r2",
        "object",
        "get",
        `${bucket}/${key}`,
        "--local",
        "--file",
        path,
      ],
      { cwd: process.cwd(), timeout: 30000, windowsHide: true },
    );
    return await readFile(path);
  } catch (error) {
    if (isMissingLocalR2Object(error)) return undefined;
    throw error;
  }
}

async function putLocalR2ObjectWithRetry(bucket, key, path) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await execFileAsync(
        process.execPath,
        [
          WRANGLER_BIN,
          "r2",
          "object",
          "put",
          `${bucket}/${key}`,
          "--file",
          path,
          "--local",
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWranglerR2Error(error)) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function assertLocalR2ObjectBytes(bucket, key, expectedBytes, directory) {
  const actualBytes = await getLocalR2ObjectBytes(bucket, key, directory);
  assert(actualBytes !== undefined, `local R2 object was not restored: ${key}`);
  assert(
    Buffer.compare(actualBytes, expectedBytes) === 0,
    `local R2 object restore mismatch: ${key}`,
  );
}

async function deleteLocalR2ObjectWithRetry(bucket, key) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await execFileAsync(
        process.execPath,
        [
          WRANGLER_BIN,
          "r2",
          "object",
          "delete",
          `${bucket}/${key}`,
          "--local",
          "--force",
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableWranglerR2Error(error)) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function assertLocalR2ObjectMissing(bucket, key) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await execFileAsync(
        process.execPath,
        [
          WRANGLER_BIN,
          "r2",
          "object",
          "get",
          `${bucket}/${key}`,
          "--local",
          "--file",
          devNull,
        ],
        { cwd: process.cwd(), timeout: 30000, windowsHide: true },
      );
      fail(`local R2 object still exists after cleanup: ${bucket}/${key}`);
    } catch (error) {
      if (isMissingLocalR2Object(error)) return;
      lastError = error;
      if (!isRetryableWranglerR2Error(error)) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

function isMissingLocalR2Object(error) {
  const text = wranglerErrorText(error);
  return text.includes("The specified key does not exist");
}

function isRetryableWranglerR2Error(error) {
  const text = wranglerErrorText(error);
  return (
    text.includes("SQLITE_BUSY") ||
    text.includes("database is locked") ||
    text.includes("internal error")
  );
}

function wranglerErrorText(error) {
  if (!error || typeof error !== "object") return String(error);
  const candidate = error;
  return `${candidate.message ?? ""}\n${candidate.stdout ?? ""}\n${candidate.stderr ?? ""}`;
}

async function cleanupGeneratedRows(sql, emails) {
  await sql.begin(async (transaction) => {
    await transaction`
      delete from content_leads
      where email in ${transaction(emails)}
    `;
    await transaction`
      delete from email_suppressions
      where email in ${transaction(emails)}
    `;
  });
}

async function assertCleanupComplete(sql, emails) {
  const rows = await sql`
    select
      (select count(*)::int from content_leads where email in ${sql(emails)}) as content_lead_count,
      (select count(*)::int from email_suppressions where email in ${sql(emails)}) as suppression_count
  `;
  assert(rows[0]?.content_lead_count === 0, "cleanup left content_leads rows");
  assert(
    rows[0]?.suppression_count === 0,
    "cleanup left email_suppressions rows",
  );
}

async function assertLeadCount(sql, input) {
  const rows = await sql`
    select count(*)::int as count
    from content_leads
    where email = ${input.email}
      and asset_slug = ${input.assetSlug}
  `;
  assert(
    rows[0]?.count === input.expected,
    `content_leads count mismatch for ${input.email}/${input.assetSlug}`,
  );
}

async function findLead(sql, input) {
  const rows = await sql`
    select
      id::text as id,
      first_name,
      email,
      company,
      asset_slug,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      unsubscribed_at::text as unsubscribed_at,
      created_at::text as created_at
    from content_leads
    where email = ${input.email}
      and asset_slug = ${input.assetSlug}
    order by created_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

function assertLeadRow(row, expected, label, options = {}) {
  assert(row && typeof row === "object", `${label} missing`);
  assertUuid(row.id, `${label}.id`);
  assert(
    row.first_name === expected.first_name,
    `${label}.first_name mismatch`,
  );
  assert(row.email === expected.email, `${label}.email mismatch`);
  assert(row.company === expected.company, `${label}.company mismatch`);
  assert(
    row.asset_slug === expected.asset_slug,
    `${label}.asset_slug mismatch`,
  );
  assert(row.source === expected.source, `${label}.source mismatch`);
  assert(
    row.utm_source === expected.utm_source,
    `${label}.utm_source mismatch`,
  );
  assert(
    row.utm_medium === expected.utm_medium,
    `${label}.utm_medium mismatch`,
  );
  assert(
    row.utm_campaign === expected.utm_campaign,
    `${label}.utm_campaign mismatch`,
  );
  if (options.requireUnsubscribed) {
    assert(row.unsubscribed_at !== null, `${label}.unsubscribed_at missing`);
    assertParseableTimestamp(row.unsubscribed_at, `${label}.unsubscribed_at`);
  } else if (expected.unsubscribed_at !== undefined) {
    assert(
      row.unsubscribed_at === expected.unsubscribed_at,
      `${label}.unsubscribed_at mismatch`,
    );
  }
  assertParseableTimestamp(row.created_at, `${label}.created_at`);
}

async function assertSuppression(sql, email) {
  const rows = await sql`
    select reason
    from email_suppressions
    where email = ${email}
    limit 1
  `;
  assert(rows[0]?.reason === "user_unsubscribe", "suppression row missing");
}

async function startExternalStub(baseUrl) {
  const url = new URL(baseUrl);
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const requestUrl = new URL(request.url ?? "/", baseUrl);
    let json = null;
    if (body && request.headers["content-type"]?.includes("application/json")) {
      json = JSON.parse(body);
    }
    requests.push({
      method: request.method ?? "GET",
      path: requestUrl.pathname,
      body,
      json,
      headers: request.headers,
    });

    response.setHeader("content-type", "application/json");
    if (requestUrl.pathname === "/turnstile") {
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (requestUrl.pathname === "/emails") {
      response.end(JSON.stringify({ id: `email_${requests.length}` }));
      return;
    }
    if (
      requestUrl.pathname === "/capture/" ||
      requestUrl.pathname === "/api/v1/events" ||
      requestUrl.pathname === "/api/v1/enrollments" ||
      requestUrl.pathname === "/api/v1/unsubscribe"
    ) {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "unhandled local leads stub path" }));
  });
  await new Promise((resolveListen) => {
    server.listen(Number(url.port), url.hostname, resolveListen);
  });
  return {
    requests,
    close: async () => {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
      await waitForPortClosed(baseUrl);
    },
  };
}

async function waitForResendPayload(stub, input) {
  const request = await waitForStubRequest(stub, {
    start: input.start,
    predicate: (candidate) =>
      candidate.path === "/emails" &&
      Array.isArray(candidate.json?.to) &&
      candidate.json.to.includes(input.toEmail),
    message:
      "Resend loopback email missing; restart Worker with RESEND_API_BASE_URL, RESEND_API_KEY, and RESEND_FROM_ADDRESS configured for the local stub.",
  });
  return request.json;
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

async function assertNoStubRequest(stub, input) {
  const deadline = Date.now() + input.durationMs;
  while (Date.now() < deadline) {
    const match = stub.requests.slice(input.start).find(input.predicate);
    if (match) fail(input.message);
    await sleep(100);
  }
}

function assertContentDownloadEmailContract(payload, input) {
  assert(
    payload?.from === "Local Leads <leads@capveri.local>",
    "content download email from mismatch",
  );
  assert(
    Array.isArray(payload?.to) &&
      payload.to.length === 1 &&
      payload.to[0] === input.toEmail,
    "content download email recipient mismatch",
  );
  assert(
    payload?.subject === `Your ${input.assetName} is ready`,
    "content download email subject mismatch",
  );
  assert(
    payload?.headers?.["List-Unsubscribe"] === `<${input.unsubscribeUrl}>`,
    "content download email List-Unsubscribe header mismatch",
  );
  assert(
    payload?.headers?.["List-Unsubscribe-Post"] ===
      "List-Unsubscribe=One-Click",
    "content download email one-click unsubscribe header mismatch",
  );

  const text = String(payload?.text ?? "");
  const html = String(payload?.html ?? "");
  for (const [label, value] of [
    ["first name", input.firstName],
    ["asset name", input.assetName],
    ["download URL", input.downloadUrl],
    ["unsubscribe URL", input.unsubscribeUrl],
    ["register URL", input.registerUrl],
  ]) {
    assert(
      text.includes(value),
      `content download email text missing ${label}`,
    );
    assert(
      html.includes(value) || html.includes(escapeHtmlMarker(value)),
      `content download email html missing ${label}`,
    );
  }
}

function assertPostHogLeadEvent(request, expected) {
  assert(request.method === "POST", "PostHog method mismatch");
  assert(request.path === "/capture/", "PostHog path mismatch");
  assert(
    request.json?.api_key === "local-leads-e2e-posthog-key",
    "PostHog API key mismatch",
  );
  assert(request.json?.event === expected.event, "PostHog event mismatch");
  assert(
    typeof request.json?.distinct_id === "string" &&
      request.json.distinct_id.startsWith("lead:capveri.local:"),
    "PostHog distinct_id mismatch",
  );
  assertLeadProperties(request.json?.properties, {
    lead_email_domain: "capveri.local",
    ...expected.properties,
  });
}

function assertSequencerEnrollment(request, expected) {
  assert(request.method === "POST", "Sequencer enrollment method mismatch");
  assert(
    request.path === "/api/v1/enrollments",
    "Sequencer enrollment path mismatch",
  );
  assertSequencerHeaders(request);
  assertJsonEqual(
    request.json,
    {
      email: expected.email,
      product: "capveri",
      sequence_slug: expected.sequenceSlug,
      source: expected.source,
      properties: expected.properties,
    },
    "Sequencer enrollment payload",
  );
}

function assertSequencerEvent(request, expected) {
  assert(request.method === "POST", "Sequencer event method mismatch");
  assert(request.path === "/api/v1/events", "Sequencer event path mismatch");
  assertSequencerHeaders(request);
  assert(
    request.headers["idempotency-key"] === expected.idempotencyKey,
    "Sequencer event idempotency key mismatch",
  );
  assertJsonEqual(
    request.json,
    {
      email: expected.email,
      product: "capveri",
      event: expected.event,
      properties: expected.properties,
    },
    "Sequencer event payload",
  );
}

function assertSequencerHeaders(request) {
  assert(
    request.headers["cf-access-client-id"] === "local-leads-e2e-client-id",
    "Sequencer CF Access client id mismatch",
  );
  assert(
    request.headers["cf-access-client-secret"] ===
      "local-leads-e2e-client-secret",
    "Sequencer CF Access client secret mismatch",
  );
}

function assertLeadProperties(actual, expected) {
  assert(actual && typeof actual === "object", "lead event properties missing");
  for (const [key, value] of Object.entries(expected)) {
    assert(
      actual[key] === value,
      `lead event property ${key} mismatch: expected ${safeJson(value)}, got ${safeJson(actual[key])}`,
    );
  }
}

function extractDownloadUrl(payload) {
  const text = `${payload?.text ?? ""}\n${payload?.html ?? ""}`;
  const match = text.match(
    /https?:\/\/[^\s"'<>]+\/api\/v1\/leads\/download\/[^\s"'<>]+/u,
  );
  if (match) return decodeHtmlEntities(match[0]);
  fail("Resend payload did not include a lead download URL.");
}

function extractUnsubscribeUrl(payload) {
  const text = `${payload?.text ?? ""}\n${payload?.html ?? ""}`;
  const match = text.match(/https?:\/\/[^\s"'<>]+\/unsubscribe\?e=[^\s"'<>]+/u);
  if (match) return decodeHtmlEntities(match[0]);
  fail("Resend payload did not include an unsubscribe URL.");
}

function toLocalUnsubscribeUrl(baseUrl, unsubscribeUrl) {
  const url = new URL(unsubscribeUrl);
  return `${baseUrl}/api/v1/leads/unsubscribe?${url.searchParams.toString()}`;
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

async function expectBytes(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(`${fetchOptions.method ?? "GET"} ${url} failed: ${error.message}`);
    },
  );
  if (response.status !== status) {
    const text = await response.text().catch(() => "");
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${text.slice(0, 500)}`,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
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
  if (url.username || url.password)
    fail(`${label} must not include credentials`);
  if (!isLoopbackHost(url.hostname)) {
    fail(`${label} must point at localhost or loopback`);
  }
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
  if (!isLoopbackHost(url.hostname)) {
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

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function assertSafeR2Key(key) {
  assert(
    key.startsWith("lead-magnets/"),
    `refusing non-lead-magnet key: ${key}`,
  );
  assert(!key.startsWith("/"), `refusing absolute key: ${key}`);
  assert(!key.includes("\\"), `refusing Windows-style key: ${key}`);
  assert(
    !key
      .split("/")
      .some((part) => part === "" || part === "." || part === ".."),
    `refusing unsafe key: ${key}`,
  );
}

function jsonHeaders() {
  return { "content-type": "application/json" };
}

function decode(bytes) {
  return new TextDecoder().decode(bytes);
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: expected ${expectedJson}, got ${actualJson}`,
  );
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      ),
    `${label} should be a UUID: ${safeJson(value)}`,
  );
}

function assertParseableTimestamp(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} missing`);
  assert(
    !Number.isNaN(Date.parse(value)),
    `${label} should be parseable timestamp: ${value}`,
  );
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function decodeHtmlEntities(value) {
  return value.replace(/&amp;/gu, "&");
}

function escapeHtmlMarker(value) {
  return value.replace(/&/gu, "&amp;");
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
  await killLoopbackPortOwner(Number(url.port));
  const retryDeadline = Date.now() + 3000;
  while (Date.now() < retryDeadline) {
    if (!(await canConnect(url.hostname, Number(url.port)))) return;
    await sleep(250);
  }
  fail(`${baseUrl} still accepts TCP connections after close`);
}

async function killLoopbackPortOwner(port) {
  if (process.platform !== "win32") return;
  await new Promise((resolveKill) => {
    const killer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference='SilentlyContinue'; " +
          `$port=${port}; ` +
          "Get-NetTCPConnection -LocalPort $port -State Listen | " +
          "Select-Object -ExpandProperty OwningProcess -Unique | " +
          "Where-Object { $_ -and $_ -ne $PID } | " +
          "ForEach-Object { Stop-Process -Id $_ -Force }",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("exit", resolveKill);
    killer.once("error", resolveKill);
  });
}

async function canConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = connect({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolveConnect(false);
    }, 500);
    socket.once("connect", () => {
      globalThis.clearTimeout(timeout);
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      globalThis.clearTimeout(timeout);
      resolveConnect(false);
    });
  });
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
