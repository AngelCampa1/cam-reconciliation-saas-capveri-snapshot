import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { promisify } from "node:util";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8838";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_EMAIL = "owner@acme.example.com";
const DEFAULT_PASSWORD = "TestPass123!";
const DEFAULT_PROPERTY_ID = "cccccccc-cccc-cccc-cccc-ccccccccc001";
const DEFAULT_TIMEOUT_MS = 180_000;
const DOCUMENTS_BUCKET_NAME = "capveri-documents-dev";
const AI_LEASE_EXTRACTION_FEATURE = "ai_lease_extraction";
const WRANGLER_BIN = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const execFileAsync = promisify(execFile);
const REQUIRED_FORENSIC_STAGES = [
  "extract_primary",
  "extract_sibling",
  "judge_input",
  "judge_output",
  "merged",
];
const ALL_FORENSIC_STAGES = [
  ...REQUIRED_FORENSIC_STAGES,
  "gap_filler",
  "validation_reprompt",
];

await main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local Worker auth E2E always owns ${DEFAULT_BASE_URL}`);
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
  const repeat = parsePositiveInteger(
    args.repeat ?? process.env.npm_config_repeat ?? "1",
    "repeat",
  );
  const pollCompletion =
    (args["poll-completion"] ?? process.env.npm_config_poll_completion) ===
    "true";
  const timeoutMs = parsePositiveInteger(
    args["timeout-ms"] ??
      process.env.npm_config_timeout_ms ??
      String(DEFAULT_TIMEOUT_MS),
    "timeout-ms",
  );
  const anonKey =
    args["supabase-anon-key"] ??
    process.env.SUPABASE_ANON_KEY ??
    (await readEnvValue(resolve("..", "frontend", ".env.test"), [
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ]));
  const openRouterApiKey =
    args["openrouter-api-key"] ??
    process.env.OPENROUTER_API_KEY ??
    (await readEnvValue(resolve(".dev.vars"), ["OPENROUTER_API_KEY"]));

  if (!anonKey) {
    fail(
      [
        "Missing local Supabase anon key.",
        "Set SUPABASE_ANON_KEY or pass --supabase-anon-key.",
      ].join(" "),
    );
  }
  if (process.env.CI) fail("Refusing to run local Worker auth E2E in CI.");
  if (pollCompletion && !openRouterApiKey) {
    fail("Missing OPENROUTER_API_KEY for --poll-completion=true.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
    pollCompletion,
    openRouterApiKey,
  });
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  let account;
  let runError;
  let cleanupError;
  let closeError;

  try {
    account = await resolveAccount({
      args,
      supabaseUrl,
      anonKey,
      databaseUrl,
    });
    await runOnce({
      baseUrl,
      sql,
      account,
      repeat,
      pollCompletion,
      timeoutMs,
    });
  } catch (error) {
    runError = error;
  } finally {
    try {
      if (account?.generated === true) {
        await cleanupUploadedDocumentObjects({
          baseUrl,
          sql,
          token: account.token,
          documentIds: account.documentIds,
        });
        await cleanupForensicSnapshotObjects(account.documentIds);
        await cleanupGeneratedRows(sql, account);
        await assertCleanupComplete(sql, account);
      }
    } catch (error) {
      cleanupError ??= error;
    } finally {
      try {
        await sql.end({ timeout: 5 });
      } catch (error) {
        closeError ??= error;
      } finally {
        try {
          await worker.close();
        } catch (error) {
          closeError ??= error;
        }
      }
    }
  }

  const postRunError = cleanupError ?? closeError;
  if (runError && postRunError) {
    console.error(
      `Local Worker auth cleanup failed after scenario failure: ${errorMessage(postRunError)}`,
    );
  }
  if (runError) throw runError;
  if (postRunError) throw postRunError;
}

async function resolveAccount(input) {
  const explicitCredentials =
    input.args.email !== undefined ||
    input.args.password !== undefined ||
    input.args["property-id"] !== undefined ||
    input.args["auto-seed"] === "false";

  if (explicitCredentials) {
    const email = input.args.email ?? DEFAULT_EMAIL;
    const password = input.args.password ?? DEFAULT_PASSWORD;
    const token = await signInWithPassword({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email,
      password,
    });
    if (!token) {
      fail(
        [
          "Supabase password sign-in failed and auto-seeding is disabled.",
          "Run `supabase db reset`, pass valid credentials, or omit explicit credentials.",
        ].join(" "),
      );
    }
    return {
      generated: false,
      token,
      propertyId: input.args["property-id"] ?? DEFAULT_PROPERTY_ID,
      documentIds: [],
      jobIds: [],
    };
  }

  return seedDisposableLocalAccount(input);
}

async function runOnce(input) {
  const authHeaders = {
    authorization: `Bearer ${input.account.token}`,
  };

  const initialDocuments = await expectJson(
    `${input.baseUrl}/api/v1/documents`,
    {
      status: 200,
      headers: authHeaders,
    },
  );
  assert(Array.isArray(initialDocuments), "documents list should be an array");

  const results = [];

  for (let index = 1; index <= input.repeat; index += 1) {
    const pdfBytes = await createLeasePdf(index);
    const form = new FormData();
    form.append(
      "file",
      new Blob([pdfBytes], { type: "application/pdf" }),
      `local-worker-e2e-${Date.now()}-${index}.pdf`,
    );

    const uploadUrl = new URL("/api/v1/documents/upload", input.baseUrl);
    uploadUrl.searchParams.set("property_id", input.account.propertyId);
    uploadUrl.searchParams.set("document_type", "lease");

    const upload = await expectJson(uploadUrl, {
      method: "POST",
      headers: authHeaders,
      body: form,
      status: 201,
    });
    assertUuid(upload.document_id, "upload.document_id");
    input.account.documentIds.push(upload.document_id);
    assert(
      upload.status === "pending",
      `uploaded document should start pending, received ${upload.status}`,
    );

    const document = await expectJson(
      `${input.baseUrl}/api/v1/documents/${upload.document_id}`,
      {
        headers: authHeaders,
        status: 200,
      },
    );
    assert(
      document.id === upload.document_id,
      "document detail should return the uploaded document",
    );
    assert(
      document.property_id === input.account.propertyId,
      "document detail should keep property scope",
    );

    const processUrl = new URL(
      `/api/v1/extractions/${upload.document_id}/process`,
      input.baseUrl,
    );
    processUrl.searchParams.set("priority", "15");
    const queued = await expectJson(processUrl, {
      method: "POST",
      headers: authHeaders,
      status: 202,
    });
    assert(queued.success === true, "process response should be successful");
    assertUuid(queued.job_id, "queued.job_id");
    input.account.jobIds.push(queued.job_id);

    const job = await expectJson(
      `${input.baseUrl}/api/v1/extractions/jobs/${queued.job_id}`,
      {
        headers: authHeaders,
        status: 200,
      },
    );
    assert(
      job.document_id === upload.document_id,
      "job should belong to uploaded document",
    );
    assert(
      ["pending", "processing", "completed", "failed", "retrying"].includes(
        job.status,
      ),
      `unexpected job status ${job.status}`,
    );

    results.push({
      documentId: upload.document_id,
      jobId: queued.job_id,
      status: job.status,
      pdfBytes: pdfBytes.byteLength,
    });
  }

  if (input.pollCompletion) {
    for (const result of results) {
      result.status = await pollJobTerminal({
        baseUrl: input.baseUrl,
        token: input.account.token,
        jobId: result.jobId,
        timeoutMs: input.timeoutMs,
      });
      assert(
        result.status === "completed",
        `expected completed extraction job, received ${result.status}`,
      );

      const extraction = await expectJson(
        `${input.baseUrl}/api/v1/extractions/${result.documentId}`,
        {
          headers: authHeaders,
          status: 200,
        },
      );
      assert(
        extraction.status === "ready_for_review" ||
          extraction.status === "completed" ||
          extraction.status === "verified",
        `unexpected extraction document status ${extraction.status}`,
      );
      const profile = extraction.extraction_result?.profile;
      assertLeaseProfile(profile, result.documentId);
      assertExtractionSourceReferences(
        extraction.extraction_result,
        result.documentId,
      );
      const auditTelemetry = await assertExtractionAuditTelemetry({
        sql: input.sql,
        documentId: result.documentId,
        organizationId: input.account.organizationId,
      });
      const forensicSnapshots = await assertForensicSnapshots(
        result.documentId,
      );
      const jobResultData = await assertExtractionJobResultData({
        sql: input.sql,
        documentId: result.documentId,
        organizationId: input.account.organizationId,
        profile,
        auditStages: auditTelemetry.stages,
        forensicStages: forensicSnapshots.stages,
      });
      assert(
        extraction.document_url &&
          String(extraction.document_url).startsWith(
            `${input.baseUrl}/api/v1/`,
          ),
        "extraction detail should include a signed local document URL",
      );
      const servedPdf = await expectPdfBytes(extraction.document_url, {
        expectedBytes: result.pdfBytes,
      });
      result.servedPdfBytes = servedPdf.byteLength;
      result.profile = {
        base_year: profile.base_year,
        pro_rata_share: profile.pro_rata_share,
        cap_type: profile.cap_type,
        cap_rate: profile.cap_rate,
        admin_fee_percentage: profile.admin_fee_percentage,
      };
      result.auditStages = auditTelemetry.stages;
      result.forensicStages = forensicSnapshots.stages;
      result.pipeline = jobResultData.pipeline;
    }
    const featureUsage = await assertExtractionFeatureUsage({
      sql: input.sql,
      organizationId: input.account.organizationId,
      expectedUsageCount: results.length,
    });
    for (const result of results) {
      result.featureUsage = featureUsage;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        base_url: input.baseUrl,
        documents_before: initialDocuments.length,
        runs: results,
        poll_completion: input.pollCompletion,
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      if (!parsed["base-url"] && /^https?:\/\//i.test(arg)) {
        parsed["base-url"] = arg;
        continue;
      }

      fail(`Unexpected argument: ${arg}`);
    }

    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);

    if (!key) {
      fail(`Invalid argument: ${arg}`);
    }

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

function normalizedLocalUrl(rawUrl, label) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }

  if (url.protocol !== "http:") {
    fail(`${label} must use http for local-only E2E`);
  }

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

    if (!line) {
      continue;
    }

    const value = line.slice(line.indexOf("=") + 1).trim();

    return value.replace(/^['"]|['"]$/g, "");
  }

  return undefined;
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

  if (!response.ok) {
    return undefined;
  }

  if (typeof body.access_token !== "string" || body.access_token === "") {
    fail("Supabase password sign-in did not return an access token.");
  }

  return body.access_token;
}

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `worker-e2e-${runId}@capveri.com`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
  const generated = {
    generated: true,
    token: undefined,
    signupEmail,
    userId: "00000000-0000-4000-8000-000000000000",
    organizationId: randomUUID(),
    organizationName: `Local Worker E2E Org ${runId}`,
    signupOrganizationIds: [],
    signupOrganizationNames: [`${signupEmail.split("@")[0]}'s Organization`],
    propertyId: randomUUID(),
    documentIds: [],
    jobIds: [],
  };
  const signupUrl = new URL("/auth/v1/signup", input.supabaseUrl);
  const signupResponse = await fetch(signupUrl, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: signupEmail,
      password: signupPassword,
    }),
  });
  const signupBody = await signupResponse.json().catch(() => ({}));

  if (!signupResponse.ok) {
    fail(`Local Supabase signup failed: ${safeJson(signupBody)}`);
  }

  const userId = signupBody.user?.id;

  if (typeof userId !== "string") {
    fail("Local Supabase signup did not return a user id.");
  }
  generated.userId = userId;

  const sql = postgres(normalizedLocalDatabaseUrl(input.databaseUrl), {
    max: 1,
    prepare: false,
  });

  try {
    const signupOrgRows = await sql`
      select u.organization_id, o.name
      from users u
      join organizations o on o.id = u.organization_id
      where u.id = ${userId}
      limit 1
    `;
    const signupOrg = signupOrgRows[0];
    if (typeof signupOrg?.organization_id === "string") {
      generated.signupOrganizationIds.push(signupOrg.organization_id);
    }
    if (typeof signupOrg?.name === "string") {
      generated.signupOrganizationNames.push(signupOrg.name);
    }

    await sql
      .begin(async (transaction) => {
        await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id = ${userId}
        `;
        await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values (${generated.organizationId}, ${generated.organizationName}, 'active', '{}'::jsonb)
        `;
        await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values (${userId}, ${generated.organizationId}, ${signupEmail}, 'Local Worker E2E', 'owner')
          on conflict (id) do update
          set organization_id = excluded.organization_id,
              email = excluded.email,
              full_name = excluded.full_name,
              role = excluded.role
        `;
        await transaction`
          insert into subscriptions (
            organization_id,
            plan,
            status,
            current_period_start,
            current_period_end
          )
          values (
            ${generated.organizationId},
            'professional',
            'active',
            now(),
            now() + interval '30 days'
          )
        `;
        await transaction`
          insert into properties (
            id,
            organization_id,
            name,
            address_line1,
            city,
            state,
            postal_code,
            total_rentable_sqft,
            total_usable_sqft,
            common_area_sqft,
            target_occupancy
          )
          values (
            ${generated.propertyId},
            ${generated.organizationId},
            'Local Worker E2E Tower',
            '100 Local Test Way',
            'Denver',
            'CO',
            '80202',
            100000,
            90000,
            10000,
            0.95
          )
        `;
      })
      .catch((error) => {
        throw new Error(
          `Failed to seed local Worker E2E records: ${errorMessage(error)}`,
          { cause: error },
        );
      });

    const token =
      signupBody.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: signupEmail,
        password: signupPassword,
      }));

    if (!token) {
      fail("Local Supabase signup seed could not mint a password token.");
    }
    generated.token = token;
  } catch (error) {
    let cleanupError;
    try {
      await cleanupGeneratedRows(sql, generated);
      await assertCleanupComplete(sql, generated);
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure;
    }
    if (cleanupError) {
      throw new Error(
        `${errorMessage(error)}; seed cleanup also failed: ${errorMessage(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }

  return generated;
}

async function cleanupGeneratedRows(sql, input) {
  const organizationIds = nonEmpty([
    input.organizationId,
    ...input.signupOrganizationIds,
  ]);
  const organizationNames = nonEmpty(
    [input.organizationName, ...input.signupOrganizationNames],
    "__local_worker_auth_e2e_none__",
  );
  const propertyIds = nonEmpty([input.propertyId]);
  const documentIds = nonEmpty(input.documentIds);
  const jobIds = nonEmpty(input.jobIds);

  await sql.begin(async (transaction) => {
    await transaction`
      delete from extraction_jobs
      where id in ${transaction(jobIds)}
        or document_id in ${transaction(documentIds)}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from audit_pipeline_events
      where document_id in ${transaction(documentIds)}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from ocr_results
      where document_id in ${transaction(documentIds)}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from documents
      where id in ${transaction(documentIds)}
        or organization_id in ${transaction(organizationIds)}
        or property_id in ${transaction(propertyIds)}
    `;
    await transaction`
      delete from properties
      where id in ${transaction(propertyIds)}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from feature_usage_events
      where organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from subscriptions
      where organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from signup_email_events
      where organization_id in ${transaction(organizationIds)}
        or user_id = ${input.userId}
        or email = ${input.signupEmail}
    `;
    await transaction`alter table legal_acceptances disable trigger legal_acceptances_append_only`;
    await transaction`
      delete from legal_acceptances
      where organization_id in ${transaction(organizationIds)}
        or user_id = ${input.userId}
    `;
    await transaction`alter table legal_acceptances enable trigger legal_acceptances_append_only`;
    await transaction`
      delete from audit_log
      where organization_id in ${transaction(organizationIds)}
        or changed_by = ${input.userId}
        or row_id in ${transaction([
          input.userId,
          ...organizationIds,
          ...propertyIds,
          ...documentIds,
          ...jobIds,
        ])}
    `;
    await transaction`
      delete from users
      where id = ${input.userId}
        or email = ${input.signupEmail}
        or organization_id in ${transaction(organizationIds)}
    `;
    await transaction`
      delete from auth.users
      where id = ${input.userId}
        or email = ${input.signupEmail}
    `;
    await transaction`
      delete from organizations
      where id in ${transaction(organizationIds)}
        or name in ${transaction(organizationNames)}
    `;
  });
}

async function assertCleanupComplete(sql, input) {
  const organizationIds = nonEmpty([
    input.organizationId,
    ...input.signupOrganizationIds,
  ]);
  const organizationNames = nonEmpty(
    [input.organizationName, ...input.signupOrganizationNames],
    "__local_worker_auth_e2e_none__",
  );
  const propertyIds = nonEmpty([input.propertyId]);
  const documentIds = nonEmpty(input.documentIds);
  const jobIds = nonEmpty(input.jobIds);

  const rows = await sql`
    select
      (select count(*)::int from extraction_jobs where id in ${sql(jobIds)} or document_id in ${sql(documentIds)} or organization_id in ${sql(organizationIds)}) as extraction_jobs,
      (select count(*)::int from audit_pipeline_events where document_id in ${sql(documentIds)} or organization_id in ${sql(organizationIds)}) as audit_pipeline_events,
      (select count(*)::int from ocr_results where document_id in ${sql(documentIds)} or organization_id in ${sql(organizationIds)}) as ocr_results,
      (select count(*)::int from documents where id in ${sql(documentIds)} or organization_id in ${sql(organizationIds)} or property_id in ${sql(propertyIds)}) as documents,
      (select count(*)::int from properties where id in ${sql(propertyIds)} or organization_id in ${sql(organizationIds)}) as properties,
      (select count(*)::int from feature_usage_events where organization_id in ${sql(organizationIds)}) as feature_usage_events,
      (select count(*)::int from subscriptions where organization_id in ${sql(organizationIds)}) as subscriptions,
      (select count(*)::int from signup_email_events where organization_id in ${sql(organizationIds)} or user_id = ${input.userId} or email = ${input.signupEmail}) as signup_email_events,
      (select count(*)::int from legal_acceptances where organization_id in ${sql(organizationIds)} or user_id = ${input.userId}) as legal_acceptances,
      (select count(*)::int from audit_log where organization_id in ${sql(organizationIds)} or changed_by = ${input.userId}) as audit_log,
      (select count(*)::int from users where id = ${input.userId} or email = ${input.signupEmail} or organization_id in ${sql(organizationIds)}) as public_users,
      (select count(*)::int from auth.users where id = ${input.userId} or email = ${input.signupEmail}) as auth_users,
      (select count(*)::int from organizations where id in ${sql(organizationIds)} or name in ${sql(organizationNames)}) as organizations
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function cleanupUploadedDocumentObjects(input) {
  if (input.documentIds.length === 0) return;
  await input.sql`
    update documents
    set status = 'failed',
        error_message = 'Local Worker auth E2E cleanup',
        updated_at = now()
    where id in ${input.sql(input.documentIds)}
  `;
  const headers = { authorization: `Bearer ${input.token}` };
  const failedDeletes = [];

  for (const documentId of input.documentIds) {
    const response = await fetch(
      `${input.baseUrl}/api/v1/documents/${documentId}`,
      {
        method: "DELETE",
        headers,
      },
    ).catch((error) => {
      failedDeletes.push(`${documentId}: ${errorMessage(error)}`);
      return undefined;
    });

    if (!response) continue;
    if (response.status !== 204 && response.status !== 404) {
      const body = await response.text().catch(() => "");
      failedDeletes.push(
        `${documentId}: DELETE returned ${response.status} ${body.slice(0, 500)}`,
      );
    }
  }

  if (failedDeletes.length > 0) {
    fail(`document object cleanup failed: ${failedDeletes.join("; ")}`);
  }
}

async function assertForensicSnapshots(documentId) {
  const parsedStages = [];
  for (const stage of ALL_FORENSIC_STAGES) {
    const key = forensicSnapshotKey(documentId, stage);
    const bytes = await getLocalR2ObjectBytes(DOCUMENTS_BUCKET_NAME, key);
    if (bytes === undefined && !REQUIRED_FORENSIC_STAGES.includes(stage)) {
      continue;
    }
    assert(
      bytes !== undefined,
      `missing forensic snapshot ${DOCUMENTS_BUCKET_NAME}/${key}`,
    );
    const text = bytes.toString("utf8");
    const parsed = parseJsonResponse(text, key);
    assert(
      parsed && typeof parsed === "object" && !Array.isArray(parsed),
      `forensic snapshot should be a JSON object: ${key}`,
    );
    parsedStages.push(stage);
  }
  return { stages: parsedStages };
}

async function cleanupForensicSnapshotObjects(documentIds) {
  if (documentIds.length === 0) return;
  const failures = [];
  for (const documentId of documentIds) {
    for (const stage of ALL_FORENSIC_STAGES) {
      const key = forensicSnapshotKey(documentId, stage);
      try {
        await deleteLocalR2ObjectIfPresent(DOCUMENTS_BUCKET_NAME, key);
        await assertLocalR2ObjectMissing(DOCUMENTS_BUCKET_NAME, key);
      } catch (error) {
        failures.push(`${key}: ${errorMessage(error)}`);
      }
    }
  }
  if (failures.length > 0) {
    fail(`forensic snapshot cleanup failed: ${failures.join("; ")}`);
  }
}

function forensicSnapshotKey(documentId, stage) {
  assertUuid(documentId, "forensic document id");
  assert(
    ALL_FORENSIC_STAGES.includes(stage),
    `unknown forensic snapshot stage: ${stage}`,
  );
  return `extractions/raw/${documentId}/${stage}.json`;
}

async function getLocalR2ObjectBytes(bucket, key) {
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-worker-auth-r2-get-"),
  );
  const path = resolve(directory, "object.bin");
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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function deleteLocalR2ObjectIfPresent(bucket, key) {
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
  } catch (error) {
    if (isMissingLocalR2Object(error)) return;
    throw error;
  }
}

async function assertLocalR2ObjectMissing(bucket, key) {
  const bytes = await getLocalR2ObjectBytes(bucket, key);
  assert(
    bytes === undefined,
    `local R2 object still exists after cleanup: ${bucket}/${key}`,
  );
}

function isMissingLocalR2Object(error) {
  const text = [
    error?.message,
    error?.stdout?.toString?.(),
    error?.stderr?.toString?.(),
  ]
    .filter(Boolean)
    .join("\n");
  return text.includes("The specified key does not exist");
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
  const directory = await mkdtemp(
    resolve(tmpdir(), "capveri-worker-auth-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-worker-auth-e2e");
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
      `OPENROUTER_API_KEY=${input.pollCompletion ? input.openRouterApiKey : ""}`,
      `LOCAL_E2E_INLINE_EXTRACTION_QUEUE=${input.pollCompletion ? "1" : ""}`,
      "STRIPE_SECRET_KEY=",
      "STRIPE_WEBHOOK_SECRET=",
      "RESEND_WEBHOOK_SECRET=",
      "TURNSTILE_SECRET_KEY=",
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-worker-auth-e2e-signing-secret",
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
  env.OPENROUTER_API_KEY = input.pollCompletion ? input.openRouterApiKey : "";
  env.LOCAL_E2E_INLINE_EXTRACTION_QUEUE = input.pollCompletion ? "1" : "";
  env.DOCUMENT_ACCESS_SIGNING_SECRET = "local-worker-auth-e2e-signing-secret";
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

async function createLeasePdf(index) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    `CapVeri local Worker E2E lease scenario ${index}`,
    "Tenant: Local Fixture Tenant LLC",
    "Premises: 10,000 rentable square feet",
    "Tenant share: 10.00%",
    "Base year: 2024",
    "CAM cap: non-cumulative 5% annual cap over controllable expenses",
    "Administrative fee: 15% of recoverable operating expenses",
  ];

  lines.forEach((line, lineIndex) => {
    page.drawText(line, {
      x: 72,
      y: 720 - lineIndex * 24,
      size: 12,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });
  });

  return pdf.save();
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  }).catch((error) => {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
  const text = await response.text();
  const body = parseJsonResponse(text, url);

  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(body)}`,
    );
  }

  return body;
}

async function expectPdfBytes(url, input) {
  const response = await fetch(url).catch((error) => {
    fail(
      `GET ${url} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });

  if (response.status !== 200) {
    fail(`GET ${url} returned ${response.status}, expected 200`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  assert(
    contentType.includes("application/pdf"),
    `signed document should serve PDF content, received ${contentType}`,
  );

  const bytes = new Uint8Array(await response.arrayBuffer());
  assert(
    bytes.byteLength === input.expectedBytes,
    `signed document byte length mismatch: expected ${input.expectedBytes}, received ${bytes.byteLength}`,
  );
  assert(
    bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46,
    "signed document bytes should begin with PDF magic bytes",
  );

  return bytes;
}

async function pollJobTerminal(input) {
  const deadline = Date.now() + input.timeoutMs;
  let lastStatus = "unknown";

  while (Date.now() < deadline) {
    const job = await expectJson(
      `${input.baseUrl}/api/v1/extractions/jobs/${input.jobId}`,
      {
        headers: { authorization: `Bearer ${input.token}` },
        status: 200,
      },
    );
    lastStatus = job.status;

    if (lastStatus === "completed" || lastStatus === "failed") {
      if (lastStatus === "failed") {
        fail(
          `Extraction job ${input.jobId} failed: ${job.error_message ?? "unknown error"}`,
        );
      }

      return lastStatus;
    }

    await delay(2_000);
  }

  fail(`Timed out waiting for job ${input.jobId}; last status ${lastStatus}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertUuid(value, label) {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    `${label} should be a UUID`,
  );
}

function assertLeaseProfile(profile, documentId) {
  assert(
    profile && typeof profile === "object" && !Array.isArray(profile),
    `extraction ${documentId} should include extraction_result.profile`,
  );
  assert(
    profile.base_year === 2024,
    `extraction ${documentId} base_year mismatch: ${safeJson(profile.base_year)}`,
  );
  assertDecimalEquals(
    profile.pro_rata_share,
    "0.1",
    `extraction ${documentId} pro_rata_share`,
  );
  assert(
    profile.cap_type === "non_cumulative",
    `extraction ${documentId} cap_type mismatch: ${safeJson(profile.cap_type)}`,
  );
  assertDecimalEquals(
    profile.cap_rate,
    "0.05",
    `extraction ${documentId} cap_rate`,
  );
  assertDecimalEquals(
    profile.admin_fee_percentage,
    "0.15",
    `extraction ${documentId} admin_fee_percentage`,
  );
}

function assertExtractionSourceReferences(extractionResult, documentId) {
  const references = extractionResult?.source_references;
  assert(
    Array.isArray(references),
    `extraction ${documentId} should include source_references`,
  );
  const fields = new Set(
    references
      .filter((reference) => reference && typeof reference === "object")
      .map((reference) => String(reference.field)),
  );
  for (const field of [
    "base_year",
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
  ]) {
    assert(
      fields.has(field),
      `extraction ${documentId} missing source reference for ${field}; actual fields: ${[
        ...fields,
      ].join(", ")}`,
    );
  }
  for (const reference of references) {
    if (!reference || typeof reference !== "object") continue;
    const confidence = Number(reference.confidence);
    assert(
      typeof reference.source_text === "string" &&
        reference.source_text.trim().length >= 8,
      `extraction ${documentId} source reference ${safeJson(reference.field)} lacks source_text`,
    );
    assert(
      Number.isFinite(confidence) && confidence > 0,
      `extraction ${documentId} source reference ${safeJson(reference.field)} lacks confidence`,
    );
  }
}

async function assertExtractionAuditTelemetry(input) {
  const rows = await input.sql`
    select stage, model, tokens_used, duration_ms, outcome
    from audit_pipeline_events
    where document_id = ${input.documentId}
      and organization_id = ${input.organizationId}
    order by created_at asc, stage asc
  `;
  const stages = rows.map((row) => row.stage);
  for (const stage of [
    "extract_primary",
    "extract_sibling",
    "judge",
    "merge",
  ]) {
    assert(
      stages.includes(stage),
      `extraction ${input.documentId} missing audit stage ${stage}; actual stages: ${stages.join(", ")}`,
    );
  }
  for (const stage of ["extract_primary", "extract_sibling"]) {
    const row = rows.find((candidate) => candidate.stage === stage);
    assert(
      row?.outcome === "success",
      `extraction ${input.documentId} audit stage ${stage} should succeed`,
    );
    assert(
      Number(row.tokens_used) > 0,
      `extraction ${input.documentId} audit stage ${stage} should record token usage`,
    );
    assert(
      typeof row.model === "string" && row.model.trim() !== "",
      `extraction ${input.documentId} audit stage ${stage} should record model`,
    );
  }
  const mergeRow = rows.find((candidate) => candidate.stage === "merge");
  assert(
    mergeRow?.outcome === "success",
    `extraction ${input.documentId} merge audit stage should succeed`,
  );
  return { stages };
}

async function assertExtractionJobResultData(input) {
  const rows = await input.sql`
    select result_data
    from extraction_jobs
    where document_id = ${input.documentId}
      and organization_id = ${input.organizationId}
      and status = 'completed'
    order by completed_at desc nulls last, created_at desc
    limit 1
  `;
  const resultData = parseJsonColumn(rows[0]?.result_data);
  assert(
    resultData && typeof resultData === "object" && !Array.isArray(resultData),
    `completed extraction job result_data missing for ${input.documentId}`,
  );
  assert(
    resultData.pipeline === "cloudflare-openrouter-dual-native-pdf-v1",
    `unexpected extraction pipeline: ${safeJson(resultData.pipeline)}`,
  );
  assertProfileMatchesJobResult(resultData.extraction, input.profile);
  assertDualExtractionTelemetry(resultData.dual_extraction);
  assertGapFillerTelemetry({
    telemetry: resultData.gap_filler,
    auditStages: input.auditStages,
    forensicStages: input.forensicStages,
  });
  assertValidationRepromptTelemetry({
    telemetry: resultData.validation_reprompt,
    auditStages: input.auditStages,
    forensicStages: input.forensicStages,
  });
  return {
    pipeline: resultData.pipeline,
  };
}

function assertProfileMatchesJobResult(extraction, profile) {
  assert(
    extraction && typeof extraction === "object" && !Array.isArray(extraction),
    "job result extraction should be an object",
  );
  for (const field of [
    "base_year",
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
  ]) {
    assert(
      String(extraction[field] ?? "") === String(profile?.[field] ?? ""),
      `job result extraction ${field} mismatch`,
    );
  }
}

function assertDualExtractionTelemetry(telemetry) {
  assert(
    telemetry && typeof telemetry === "object" && !Array.isArray(telemetry),
    "dual_extraction telemetry missing",
  );
  for (const [label, modelKey, tokensKey] of [
    ["primary", "primaryModel", "primaryTokens"],
    ["sibling", "siblingModel", "siblingTokens"],
  ]) {
    assert(
      typeof telemetry[modelKey] === "string" &&
        telemetry[modelKey].trim() !== "",
      `dual_extraction ${label} model missing`,
    );
    assert(
      Number(telemetry[tokensKey]) > 0,
      `dual_extraction ${label} token count missing`,
    );
  }
}

function assertGapFillerTelemetry(input) {
  const telemetry = input.telemetry;
  assert(
    telemetry && typeof telemetry === "object" && !Array.isArray(telemetry),
    "gap_filler telemetry missing",
  );
  for (const field of ["missingFields", "filledFields", "attempts"]) {
    assert(
      Array.isArray(telemetry[field]),
      `gap_filler ${field} should be an array`,
    );
  }
  assert(
    Number(telemetry.tokensUsed) >= 0,
    "gap_filler tokensUsed should be non-negative",
  );
  if (telemetry.missingFields.length > 0) {
    assert(
      input.auditStages.includes("gap_filler"),
      "gap_filler audit stage missing despite missing fields",
    );
    assert(
      input.forensicStages.includes("gap_filler"),
      "gap_filler forensic stage missing despite missing fields",
    );
  }
}

function assertValidationRepromptTelemetry(input) {
  const telemetry = input.telemetry;
  assert(
    telemetry && typeof telemetry === "object" && !Array.isArray(telemetry),
    "validation_reprompt telemetry missing",
  );
  assert(
    typeof telemetry.attempted === "boolean",
    "validation_reprompt attempted should be boolean",
  );
  for (const field of ["initialErrors", "attempts"]) {
    assert(
      Array.isArray(telemetry[field]),
      `validation_reprompt ${field} should be an array`,
    );
  }
  assert(
    Number(telemetry.tokensUsed) >= 0,
    "validation_reprompt tokensUsed should be non-negative",
  );
  if (Number(telemetry.tokensUsed) > 0) {
    assert(
      input.auditStages.includes("validation_reprompt"),
      "validation_reprompt audit stage missing despite token use",
    );
    assert(
      input.forensicStages.includes("validation_reprompt"),
      "validation_reprompt forensic stage missing despite token use",
    );
  }
}

async function assertExtractionFeatureUsage(input) {
  const rows = await input.sql`
    select feature_key, usage_count
    from feature_usage_events
    where organization_id = ${input.organizationId}
      and feature_key = ${AI_LEASE_EXTRACTION_FEATURE}
  `;
  assert(
    rows.length === 1,
    `expected one ${AI_LEASE_EXTRACTION_FEATURE} usage row for organization ${input.organizationId}, received ${rows.length}`,
  );
  const usageCount = Number(rows[0].usage_count);
  assert(
    Number.isInteger(usageCount) && usageCount >= input.expectedUsageCount,
    `${AI_LEASE_EXTRACTION_FEATURE} usage_count should be at least ${input.expectedUsageCount}, received ${safeJson(rows[0].usage_count)}`,
  );
  return {
    feature_key: rows[0].feature_key,
    usage_count: usageCount,
  };
}

function assertDecimalEquals(actual, expected, label) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  assert(
    Number.isFinite(actualNumber),
    `${label} should be numeric, received ${safeJson(actual)}`,
  );
  assert(
    Math.abs(actualNumber - expectedNumber) < 0.000001,
    `${label} mismatch: expected ${expected}, received ${safeJson(actual)}`,
  );
}

function parseJsonColumn(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function nonEmpty(values, sentinel = "00000000-0000-4000-8000-000000000000") {
  const unique = [
    ...new Set(
      (values ?? []).filter((value) => typeof value === "string" && value),
    ),
  ];
  return unique.length > 0 ? unique : [sentinel];
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseJsonResponse(text, url) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    fail(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`);
  }
}

function fail(message) {
  throw new Error(message);
}
