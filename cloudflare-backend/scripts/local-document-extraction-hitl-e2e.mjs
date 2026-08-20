import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { clearTimeout } from "node:timers";
import { promisify } from "node:util";
import postgres from "postgres";

const DEFAULT_BASE_URL = "http://127.0.0.1:8841";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const PERIOD_START = "2026-01-01";
const PERIOD_END = "2026-12-31";
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
const SAMPLE_PDF = resolve(
  "..",
  "frontend",
  "e2e",
  "fixtures",
  "sample-lease.pdf",
);
const EXTRACTION_LIST_KEYS = [
  "has_next",
  "items",
  "page",
  "page_size",
  "total",
];
const EXTRACTION_LIST_ITEM_KEYS = [
  "average_confidence",
  "created_at",
  "filename",
  "id",
  "low_confidence_count",
  "processed_at",
  "status",
  "verified_at",
];
const EXTRACTION_DETAIL_KEYS = [
  "content_type",
  "created_at",
  "document_url",
  "edit_history",
  "extraction_result",
  "file_size_bytes",
  "filename",
  "id",
  "lease_id",
  "processed_at",
  "property_id",
  "status",
  "storage_bucket",
  "storage_key",
  "verified_at",
  "verified_by",
];
const DRAFT_RESPONSE = { success: true, message: "Draft saved successfully" };

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
  const pollCompletion =
    (args["poll-completion"] ?? process.env.npm_config_poll_completion) ===
    "true";
  const timeoutMs = parsePositiveInteger(
    args["timeout-ms"] ??
      process.env.npm_config_timeout_ms ??
      String(DEFAULT_TIMEOUT_MS),
    "timeout-ms",
  );
  if (args["base-url"] || process.env.npm_config_base_url) {
    fail(`local document extraction HITL E2E always owns ${DEFAULT_BASE_URL}`);
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
    ]));
  const openRouterApiKey =
    args["openrouter-api-key"] ??
    process.env.OPENROUTER_API_KEY ??
    (await readEnvValue(resolve(".dev.vars"), ["OPENROUTER_API_KEY"]));

  if (!anonKey) {
    fail("Missing local Supabase anon key.");
  }
  if (pollCompletion && !openRouterApiKey) {
    fail("Missing OPENROUTER_API_KEY for --poll-completion=true.");
  }
  if (process.env.CI) {
    fail("Refusing to run local document extraction HITL E2E in CI.");
  }

  await assertPortAvailable(baseUrl);
  const worker = await startWorkerServer({
    baseUrl,
    supabaseUrl,
    databaseUrl,
    pollCompletion,
    openRouterApiKey,
  });
  let runError;
  let closeError;

  try {
    const runs = [];
    for (let index = 0; index < repeat; index += 1) {
      runs.push(
        await runOnce({
          baseUrl,
          supabaseUrl,
          anonKey,
          databaseUrl,
          index,
          pollCompletion,
          timeoutMs,
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
          poll_completion: pollCompletion,
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
      `Local document extraction HITL Worker close failed after scenario failure: ${errorMessage(closeError)}`,
    );
  }
  if (runError) throw runError;
  if (closeError) throw closeError;
}

async function runOnce(input) {
  const account = await seedDisposableLocalAccount(input);
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  const authHeaders = { authorization: `Bearer ${account.token}` };
  const jsonHeaders = {
    ...authHeaders,
    "content-type": "application/json",
  };
  const uploadedDocumentIds = [];
  let result;
  let runError;

  try {
    const linkedUpload = await uploadLeasePdf(input.baseUrl, authHeaders, {
      propertyId: account.propertyId,
      leaseId: account.linkedLeaseId,
      filename: "Linked_HITL_Lease.pdf",
    });
    uploadedDocumentIds.push(linkedUpload.document_id);
    assert(linkedUpload.status === "pending", "linked upload status mismatch");

    const processResult = await expectJson(
      `${input.baseUrl}/api/v1/extractions/${linkedUpload.document_id}/process?priority=15`,
      { method: "POST", headers: jsonHeaders, status: 202 },
    );
    assert(processResult.status === "processing", "process status mismatch");
    assertUuid(processResult.job_id, "process job id");

    if (input.pollCompletion) {
      await pollJobTerminal({
        baseUrl: input.baseUrl,
        token: account.token,
        jobId: processResult.job_id,
        timeoutMs: input.timeoutMs,
      });
    } else {
      await makeReadyForReview(sql, {
        documentId: linkedUpload.document_id,
        organizationId: account.organizationId,
        profile: extractedProfile({
          proRataShare: "0.0625",
          capRate: "0.045",
          adminFee: "0.12",
        }),
        confidenceScores: {
          pro_rata_share: 0.98,
          cap_rate: 0.82,
          admin_fee_percentage: 0.61,
        },
        sourceText: "Tenant pays 6.25% with a 4.5% non-cumulative cap.",
      });
    }

    const list = await expectJson(
      `${input.baseUrl}/api/v1/extractions?status=ready_for_review&page=1&page_size=10`,
      { headers: authHeaders, status: 200 },
    );
    assertExtractionListEnvelope(
      list,
      { page: 1, pageSize: 10, minimumTotal: 1 },
      "ready-for-review list",
    );
    assert(
      list.items.some((item) => item.id === linkedUpload.document_id),
      "ready-for-review extraction missing from list",
    );
    const linkedListItem = list.items.find(
      (item) => item.id === linkedUpload.document_id,
    );
    assertExtractionListItem(
      linkedListItem,
      {
        id: linkedUpload.document_id,
        filename: "Linked_HITL_Lease.pdf",
        status: "ready_for_review",
        processed_at: "timestamp",
        verified_at: null,
      },
      "linked ready-for-review row",
    );
    if (input.pollCompletion) {
      assert(
        Number.isFinite(Number(linkedListItem.average_confidence)) &&
          Number(linkedListItem.average_confidence) > 0,
        "real average confidence should be populated",
      );
      assert(
        Number.isInteger(linkedListItem.low_confidence_count) &&
          linkedListItem.low_confidence_count >= 0,
        "real low confidence count should be populated",
      );
    } else {
      assertNear(
        linkedListItem.average_confidence,
        0.8033333333333333,
        "average confidence mismatch",
      );
      assert(
        linkedListItem.low_confidence_count === 1,
        "low confidence count mismatch",
      );
    }

    const detail = await expectJson(
      `${input.baseUrl}/api/v1/extractions/${linkedUpload.document_id}`,
      { headers: authHeaders, status: 200 },
    );
    assertExtractionDetail(
      detail,
      {
        id: linkedUpload.document_id,
        filename: "Linked_HITL_Lease.pdf",
        status: "ready_for_review",
        content_type: "application/pdf",
        file_size_bytes: detail.file_size_bytes,
        organization_id: account.organizationId,
        property_id: account.propertyId,
        lease_id: account.linkedLeaseId,
        processed_at: "timestamp",
        verified_at: null,
        verified_by: null,
      },
      "linked extraction detail",
    );
    const detailProfile = detail.extraction_result?.profile;
    if (input.pollCompletion) {
      assertLeaseProfileShape(detailProfile, linkedUpload.document_id);
      assertExtractionSourceReferences(
        detail.extraction_result,
        linkedUpload.document_id,
      );
      const telemetry = await assertExtractionAuditTelemetry({
        sql,
        documentId: linkedUpload.document_id,
        organizationId: account.organizationId,
      });
      detail.auditStages = telemetry.stages;
      const forensic = await assertForensicSnapshots(linkedUpload.document_id);
      detail.forensicStages = forensic.stages;
      detail.jobResultData = await assertExtractionJobResultData({
        sql,
        documentId: linkedUpload.document_id,
        organizationId: account.organizationId,
        detailProfile,
        auditStages: telemetry.stages,
        forensicStages: forensic.stages,
      });
      detail.featureUsage = await assertExtractionFeatureUsage({
        sql,
        organizationId: account.organizationId,
        expectedUsageCount: 1,
      });
    } else {
      assert(
        detailProfile.pro_rata_share === "0.0625",
        "detail profile mismatch",
      );
    }
    assert(
      typeof detail.document_url === "string" &&
        detail.document_url.includes("/api/v1/document-files/"),
      "signed document URL missing",
    );
    const fileResponse = await fetch(detail.document_url, {
      headers: { origin: "http://localhost:5173" },
    });
    assert(fileResponse.status === 200, "signed document fetch failed");
    assert(
      fileResponse.headers.get("content-type") === "application/pdf",
      "signed document content type mismatch",
    );
    assert(
      (await fileResponse.arrayBuffer()).byteLength > 100,
      "signed document bytes too small",
    );

    const draftResult = await expectJson(
      `${input.baseUrl}/api/v1/extractions/${linkedUpload.document_id}/draft`,
      {
        method: "PUT",
        headers: jsonHeaders,
        status: 200,
        body: JSON.stringify({
          profile: {
            ...detailProfile,
            pro_rata_share: "0.0640",
          },
        }),
      },
    );
    assertJsonEqual(draftResult, DRAFT_RESPONSE, "draft response");

    const originalProRataShare = String(detailProfile.pro_rata_share ?? "");
    const originalCapRate = String(detailProfile.cap_rate ?? "");
    const originalAdminFee = String(detailProfile.admin_fee_percentage ?? "");
    const approveProfile = {
      ...detailProfile,
      pro_rata_share: "0.0640",
      cap_rate: "0.0475",
      admin_fee_percentage: "0.10",
    };
    const approveResult = await expectJson(
      `${input.baseUrl}/api/v1/extractions/${linkedUpload.document_id}/approve`,
      {
        method: "PUT",
        headers: jsonHeaders,
        status: 200,
        body: JSON.stringify({
          profile: approveProfile,
          edit_history: [
            edit("pro_rata_share", originalProRataShare, "0.0640"),
            edit("cap_rate", originalCapRate, "0.0475"),
            edit("admin_fee_percentage", originalAdminFee, "0.10"),
          ],
        }),
      },
    );
    assertExactKeys(
      approveResult,
      ["lease_id", "success"],
      "approved linked response",
    );
    assert(approveResult.success === true, "approved linked success mismatch");
    assert(
      approveResult.lease_id === account.linkedLeaseId,
      "approved linked lease mismatch",
    );
    await verifyApprovedDocument(sql, {
      documentId: linkedUpload.document_id,
      organizationId: account.organizationId,
      leaseId: account.linkedLeaseId,
      userId: account.userId,
      proRataShare: "0.0640",
      capRate: "0.0475",
      editCount: 3,
    });

    const secondUpload = await uploadLeasePdf(input.baseUrl, authHeaders, {
      propertyId: account.propertyId,
      filename: "Unlinked_HITL_Lease.pdf",
    });
    uploadedDocumentIds.push(secondUpload.document_id);
    await makeReadyForReview(sql, {
      documentId: secondUpload.document_id,
      organizationId: account.organizationId,
      profile: extractedProfile({
        proRataShare: "0.0710",
        capRate: "0.0500",
        adminFee: "0.08",
      }),
      confidenceScores: { pro_rata_share: 0.91, cap_rate: 0.88 },
      sourceText: "Tenant share is 7.10% with a 5% cap.",
    });

    await expectJson(
      `${input.baseUrl}/api/v1/extractions/${secondUpload.document_id}/approve`,
      {
        method: "PUT",
        headers: jsonHeaders,
        status: 400,
        body: JSON.stringify({
          profile: extractedProfile({
            proRataShare: "0.0710",
            capRate: "0.0500",
            adminFee: "0.08",
          }),
          edit_history: [],
        }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/extractions/${secondUpload.document_id}/approve`,
      {
        method: "PUT",
        headers: jsonHeaders,
        status: 404,
        body: JSON.stringify({
          lease_id: account.otherLeaseId,
          profile: extractedProfile({
            proRataShare: "0.0710",
            capRate: "0.0500",
            adminFee: "0.08",
          }),
          edit_history: [],
        }),
      },
    );
    await expectJson(
      `${input.baseUrl}/api/v1/extractions/${secondUpload.document_id}/approve`,
      {
        method: "PUT",
        headers: jsonHeaders,
        status: 200,
        body: JSON.stringify({
          lease_id: account.unlinkedLeaseId,
          profile: extractedProfile({
            proRataShare: "0.0710",
            capRate: "0.0500",
            adminFee: "0.08",
          }),
          edit_history: [edit("lease_id", null, account.unlinkedLeaseId)],
        }),
      },
    );
    await verifyApprovedDocument(sql, {
      documentId: secondUpload.document_id,
      organizationId: account.organizationId,
      leaseId: account.unlinkedLeaseId,
      userId: account.userId,
      proRataShare: "0.0710",
      capRate: "0.0500",
      editCount: 1,
    });

    const rejectUpload = await uploadLeasePdf(input.baseUrl, authHeaders, {
      propertyId: account.propertyId,
      leaseId: account.rejectLeaseId,
      filename: "Rejected_HITL_Lease.pdf",
    });
    uploadedDocumentIds.push(rejectUpload.document_id);
    await makeReadyForReview(sql, {
      documentId: rejectUpload.document_id,
      organizationId: account.organizationId,
      profile: extractedProfile({
        proRataShare: "0.0300",
        capRate: "0.0300",
        adminFee: "0.05",
      }),
      confidenceScores: { pro_rata_share: 0.42 },
      sourceText: "OCR text is unclear.",
    });
    const rejectResult = await expectJson(
      `${input.baseUrl}/api/v1/extractions/${rejectUpload.document_id}/reject`,
      {
        method: "PUT",
        headers: jsonHeaders,
        status: 200,
        body: JSON.stringify({
          reason: "incorrect_extraction",
          notes: "Synthetic HITL rejection with requeue.",
          requeue: true,
        }),
      },
    );
    assertExactKeys(rejectResult, ["message", "success"], "reject response");
    assert(rejectResult.success === true, "reject success mismatch");
    assert(
      rejectResult.message.includes("queued for retry"),
      "reject requeue message mismatch",
    );
    await verifyRejectedRequeue(sql, {
      documentId: rejectUpload.document_id,
      organizationId: account.organizationId,
      userId: account.userId,
    });

    const hidden = await expectJson(
      `${input.baseUrl}/api/v1/extractions/${linkedUpload.document_id}`,
      {
        headers: {
          authorization: `Bearer ${account.otherToken}`,
        },
        status: 404,
      },
    );
    assert(
      hidden.error?.code === "document_not_found",
      "cross-org extraction detail should be hidden",
    );

    const summary = await verifyNoReadyForReviewLeak(sql, {
      organizationId: account.organizationId,
    });

    result = {
      run: input.index + 1,
      organization_id: account.organizationId,
      property_id: account.propertyId,
      approved_documents: summary.verified_count,
      processing_requeues: summary.processing_count,
      ...(input.pollCompletion
        ? {
            feature_usage: detail.featureUsage,
            forensic_stages: detail.forensicStages,
            pipeline: detail.jobResultData.pipeline,
          }
        : {}),
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];
    try {
      await cleanupForensicSnapshotObjects(uploadedDocumentIds);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await cleanupUploadedDocuments(sql, {
        baseUrl: input.baseUrl,
        authHeaders,
        documentIds: uploadedDocumentIds,
        organizationId: account.organizationId,
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await cleanupDisposableLocalAccount(sql, account);
      await assertCleanupComplete(sql, account);
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
          `Local document extraction HITL cleanup failed after scenario failure: ${cleanupMessage}`,
        );
      } else {
        fail(cleanupMessage);
      }
    }
  }

  if (runError) throw runError;
  if (result) return result;
  fail("Local document extraction HITL E2E ended without returning a result.");
}

async function uploadLeasePdf(baseUrl, authHeaders, input) {
  const form = new FormData();
  const bytes = await readFile(SAMPLE_PDF);
  form.set(
    "file",
    new Blob([bytes], { type: "application/pdf" }),
    input.filename,
  );
  const url = new URL("/api/v1/documents/upload", baseUrl);
  url.searchParams.set("property_id", input.propertyId);
  url.searchParams.set("document_type", "lease");
  if (input.leaseId) {
    url.searchParams.set("lease_id", input.leaseId);
  }
  return expectJson(url.toString(), {
    method: "POST",
    headers: authHeaders,
    status: 201,
    body: form,
  });
}

async function makeReadyForReview(sql, input) {
  const result = await sql`
    update documents
    set status = 'ready_for_review',
        extraction_result = ${JSON.stringify({
          profile: input.profile,
          confidence_scores: input.confidenceScores,
          source_references: [
            {
              field: "pro_rata_share",
              page: 1,
              text: input.sourceText,
              confidence: input.confidenceScores.pro_rata_share ?? 0.75,
              boundingBox: {
                page: 1,
                x: 0.15,
                y: 0.2,
                width: 0.3,
                height: 0.05,
              },
            },
          ],
        })}::jsonb,
        processed_at = now(),
        updated_at = now()
    where id = ${input.documentId}
      and organization_id = ${input.organizationId}
    returning id
  `;
  assert(result.length === 1, "failed to mark document ready for review");
  await sql`
    update extraction_jobs
    set status = 'completed',
        result_data = ${JSON.stringify({ profile: input.profile })}::jsonb,
        completed_at = now()
    where document_id = ${input.documentId}
      and organization_id = ${input.organizationId}
      and status in ('pending', 'processing', 'retrying')
  `;
}

async function verifyApprovedDocument(sql, input) {
  const rows = await sql`
    select
      documents.status,
      documents.lease_id,
      documents.verified_by,
      documents.verified_at is not null as has_verified_at,
      jsonb_typeof(documents.edit_history) as edit_history_type,
      case
        when jsonb_typeof(documents.edit_history) = 'array'
          then jsonb_array_length(documents.edit_history)
        else null
      end as edit_count,
      leases.recovery_profile->>'pro_rata_share' as pro_rata_share,
      leases.recovery_profile->>'cap_rate' as cap_rate
    from documents
    join leases on leases.id = ${input.leaseId}
    where documents.id = ${input.documentId}
      and documents.organization_id = ${input.organizationId}
  `;
  const row = rows[0];
  assert(row, "approved document missing");
  assert(row.status === "verified", "approved document status mismatch");
  assert(row.lease_id === input.leaseId, "approved document lease mismatch");
  assert(
    row.verified_by === input.userId,
    "approved document verifier mismatch",
  );
  assert(row.has_verified_at === true, "approved document verified_at missing");
  assert(
    row.edit_history_type === "array",
    `approved edit history should be array, got ${row.edit_history_type}`,
  );
  assert(
    row.edit_count === input.editCount,
    "approved edit history count mismatch",
  );
  assert(row.pro_rata_share === input.proRataShare, "lease pro rata mismatch");
  assert(row.cap_rate === input.capRate, "lease cap rate mismatch");
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

function assertLeaseProfileShape(profile, documentId) {
  assert(
    profile && typeof profile === "object" && !Array.isArray(profile),
    `extraction ${documentId} should include extraction_result.profile`,
  );
  assert(
    Number.isInteger(Number(profile.base_year)),
    `extraction ${documentId} base_year should be populated`,
  );
  for (const field of [
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
  ]) {
    assert(
      profile[field] !== undefined && profile[field] !== null,
      `extraction ${documentId} profile missing ${field}`,
    );
  }
  for (const field of ["pro_rata_share", "cap_rate", "admin_fee_percentage"]) {
    assert(
      Number.isFinite(Number(profile[field])),
      `extraction ${documentId} profile ${field} should be numeric, received ${safeJson(profile[field])}`,
    );
  }
  assert(
    typeof profile.cap_type === "string" && profile.cap_type.trim() !== "",
    `extraction ${documentId} profile cap_type should be populated`,
  );
}

function assertExtractionListEnvelope(list, expected, label) {
  assertExactKeys(list, EXTRACTION_LIST_KEYS, label);
  assert(Array.isArray(list.items), `${label}.items should be an array`);
  assert(list.page === expected.page, `${label}.page mismatch`);
  assert(list.page_size === expected.pageSize, `${label}.page_size mismatch`);
  assert(list.total >= expected.minimumTotal, `${label}.total too small`);
  assert(
    typeof list.has_next === "boolean",
    `${label}.has_next should be boolean`,
  );
}

function assertExtractionListItem(item, expected, label) {
  assertExactKeys(item, EXTRACTION_LIST_ITEM_KEYS, label);
  assertUuid(item.id, `${label}.id`);
  for (const key of ["id", "filename", "status"]) {
    assert(
      item[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(item[key])}`,
    );
  }
  assertParseableTimestamp(item.created_at, `${label}.created_at`);
  if (expected.processed_at === null) {
    assert(item.processed_at === null, `${label}.processed_at mismatch`);
  } else {
    assertParseableTimestamp(item.processed_at, `${label}.processed_at`);
  }
  if (expected.verified_at === null) {
    assert(item.verified_at === null, `${label}.verified_at mismatch`);
  } else {
    assertParseableTimestamp(item.verified_at, `${label}.verified_at`);
  }
  assert(
    typeof item.average_confidence === "number" ||
      item.average_confidence === null,
    `${label}.average_confidence shape mismatch`,
  );
  assert(
    Number.isInteger(item.low_confidence_count),
    `${label}.low_confidence_count shape mismatch`,
  );
}

function assertExtractionDetail(detail, expected, label) {
  assertExactKeys(detail, EXTRACTION_DETAIL_KEYS, label);
  assertUuid(detail.id, `${label}.id`);
  for (const key of [
    "id",
    "filename",
    "status",
    "content_type",
    "file_size_bytes",
    "property_id",
    "lease_id",
  ]) {
    assert(
      detail[key] === expected[key],
      `${label}.${key} mismatch: expected ${safeJson(expected[key])}, got ${safeJson(detail[key])}`,
    );
  }
  assert(
    detail.storage_bucket === "DOCUMENTS_BUCKET",
    `${label}.storage_bucket mismatch`,
  );
  assert(
    typeof detail.storage_key === "string" &&
      detail.storage_key.startsWith(
        `${expected.organization_id}/${expected.property_id}/`,
      ) &&
      detail.storage_key.endsWith(".pdf"),
    `${label}.storage_key mismatch`,
  );
  assert(
    typeof detail.document_url === "string" &&
      detail.document_url.includes(`/api/v1/document-files/${detail.id}`) &&
      detail.document_url.includes("signature="),
    `${label}.document_url mismatch`,
  );
  assertParseableTimestamp(detail.created_at, `${label}.created_at`);
  if (expected.processed_at === null) {
    assert(detail.processed_at === null, `${label}.processed_at mismatch`);
  } else {
    assertParseableTimestamp(detail.processed_at, `${label}.processed_at`);
  }
  if (expected.verified_at === null) {
    assert(detail.verified_at === null, `${label}.verified_at mismatch`);
  } else {
    assertParseableTimestamp(detail.verified_at, `${label}.verified_at`);
  }
  assert(
    detail.verified_by === expected.verified_by,
    `${label}.verified_by mismatch`,
  );
  assert(
    Array.isArray(detail.edit_history),
    `${label}.edit_history should be an array`,
  );
  assert(
    detail.extraction_result && typeof detail.extraction_result === "object",
    `${label}.extraction_result missing`,
  );
}

function assertExtractionSourceReferences(extractionResult, documentId) {
  const references = extractionResult?.source_references;
  assert(
    Array.isArray(references) && references.length > 0,
    `extraction ${documentId} should include source_references`,
  );
  const fields = new Set(
    references
      .filter((reference) => reference && typeof reference === "object")
      .map((reference) => String(reference.field)),
  );
  for (const field of ["pro_rata_share", "cap_rate"]) {
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
    const sourceText = reference.source_text ?? reference.text;
    assert(
      typeof sourceText === "string" && sourceText.trim().length >= 8,
      `extraction ${documentId} source reference ${safeJson(reference.field)} lacks source text`,
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
    assert(
      Number(row.duration_ms) >= 0,
      `extraction ${input.documentId} audit stage ${stage} should record duration`,
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
    select status, result_data
    from extraction_jobs
    where document_id = ${input.documentId}
      and organization_id = ${input.organizationId}
      and status = 'completed'
    order by completed_at desc nulls last, created_at desc
    limit 1
  `;
  const row = rows[0];
  assert(row, `completed extraction job missing for ${input.documentId}`);
  const resultData = parseJsonColumn(row.result_data);
  assert(
    resultData && typeof resultData === "object" && !Array.isArray(resultData),
    `completed extraction job result_data should be an object: ${safeJson(row.result_data)}`,
  );
  assert(
    resultData.pipeline === "cloudflare-openrouter-dual-native-pdf-v1",
    `unexpected extraction pipeline: ${safeJson(resultData.pipeline)}`,
  );
  assertProfileMatchesJobResult(resultData.extraction, input.detailProfile);
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

function assertProfileMatchesJobResult(extraction, detailProfile) {
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
      String(extraction[field] ?? "") === String(detailProfile?.[field] ?? ""),
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
    resolve(tmpdir(), "capveri-document-hitl-r2-get-"),
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

async function verifyRejectedRequeue(sql, input) {
  const rows = await sql`
    select
      documents.status,
      documents.rejected_by,
      documents.rejected_at is not null as has_rejected_at,
      documents.rejection_reason,
      count(extraction_jobs.id)::int as job_count,
      bool_or(extraction_jobs.status = 'pending') as has_pending_job
    from documents
    left join extraction_jobs on extraction_jobs.document_id = documents.id
    where documents.id = ${input.documentId}
      and documents.organization_id = ${input.organizationId}
    group by documents.id
  `;
  const row = rows[0];
  assert(row, "rejected document missing");
  assert(row.status === "processing", "requeued document status mismatch");
  assert(row.rejected_by === input.userId, "rejected_by mismatch");
  assert(row.has_rejected_at === true, "rejected_at missing");
  assert(
    row.rejection_reason === "incorrect_extraction",
    "rejection reason mismatch",
  );
  assert(row.job_count >= 1, "requeue job missing");
  assert(row.has_pending_job === true, "pending requeue job missing");
}

async function verifyNoReadyForReviewLeak(sql, input) {
  const rows = await sql`
    select
      count(*) filter (where status = 'verified')::int as verified_count,
      count(*) filter (where status = 'processing')::int as processing_count,
      count(*) filter (where status = 'ready_for_review')::int as ready_count
    from documents
    where organization_id = ${input.organizationId}
  `;
  const row = rows[0];
  assert(row.verified_count === 2, "verified document count mismatch");
  assert(row.processing_count === 1, "processing document count mismatch");
  assert(row.ready_count === 0, "ready-for-review rows should be drained");
  return row;
}

async function seedDisposableLocalAccount(input) {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const signupEmail = `document-hitl-e2e-${runId}@capveri.com`;
  const otherEmail = `document-hitl-hidden-${runId}@capveri.com`;
  const signupOrganizationName = `${signupEmail.split("@")[0]}'s Organization`;
  const otherSignupOrganizationName = `${otherEmail.split("@")[0]}'s Organization`;
  const signupPassword = `LocalE2E-${randomUUID()}!`;
  const otherPassword = `LocalE2E-${randomUUID()}!`;
  const signupBody = await signUpLocalUser({
    supabaseUrl: input.supabaseUrl,
    anonKey: input.anonKey,
    email: signupEmail,
    password: signupPassword,
  });
  let otherSignupBody;
  try {
    otherSignupBody = await signUpLocalUser({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      email: otherEmail,
      password: otherPassword,
    });
  } catch (error) {
    const cleanupSql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupSignupByEmail(cleanupSql, [
        { email: signupEmail, organizationName: signupOrganizationName },
        { email: otherEmail, organizationName: otherSignupOrganizationName },
      ]);
    } finally {
      await cleanupSql.end({ timeout: 5 });
    }
    throw error;
  }
  const userId = signupBody.user?.id;
  const otherUserId = otherSignupBody.user?.id;
  if (typeof userId !== "string" || typeof otherUserId !== "string") {
    fail("Local Supabase signup did not return expected user ids.");
  }

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const propertyId = randomUUID();
  const otherPropertyId = randomUUID();
  const linkedUnitId = randomUUID();
  const unlinkedUnitId = randomUUID();
  const rejectUnitId = randomUUID();
  const otherUnitId = randomUUID();
  const linkedLeaseId = randomUUID();
  const unlinkedLeaseId = randomUUID();
  const rejectLeaseId = randomUUID();
  const otherLeaseId = randomUUID();
  const organizationName = `Local Document HITL E2E Org ${runId}`;
  const otherOrganizationName = `Local Document HITL Hidden Org ${runId}`;
  const sql = postgres(input.databaseUrl, { max: 1, prepare: false });
  let signupOrganizationId;
  let otherSignupOrganizationId;

  const account = {
    organizationId,
    otherOrganizationId,
    organizationName,
    otherOrganizationName,
    signupOrganizationId,
    otherSignupOrganizationId,
    signupOrganizationName,
    otherSignupOrganizationName,
    propertyId,
    otherPropertyId,
    linkedLeaseId,
    unlinkedLeaseId,
    rejectLeaseId,
    otherLeaseId,
    userId,
    otherUserId,
  };

  try {
    await sql
      .begin(async (transaction) => {
        const signupUsers = await transaction`
          select id, organization_id
          from users
          where id in (${userId}, ${otherUserId})
        `;
        signupOrganizationId = signupUsers.find(
          (row) => row.id === userId,
        )?.organization_id;
        otherSignupOrganizationId = signupUsers.find(
          (row) => row.id === otherUserId,
        )?.organization_id;
        account.signupOrganizationId = signupOrganizationId;
        account.otherSignupOrganizationId = otherSignupOrganizationId;

        await transaction`
          update auth.users
          set email_confirmed_at = coalesce(email_confirmed_at, now())
          where id in (${userId}, ${otherUserId})
        `;
        await transaction`
          insert into organizations (id, name, subscription_status, settings)
          values
            (${organizationId}, ${organizationName}, 'active', '{}'::jsonb),
            (${otherOrganizationId}, ${otherOrganizationName}, 'active', '{}'::jsonb)
        `;
        await transaction`
          insert into users (id, organization_id, email, full_name, role)
          values
            (${userId}, ${organizationId}, ${signupEmail}, 'Local Document HITL E2E', 'owner'),
            (${otherUserId}, ${otherOrganizationId}, ${otherEmail}, 'Local Document HITL Hidden', 'owner')
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
          values
            (${organizationId}, 'professional', 'active', now(), now() + interval '30 days'),
            (${otherOrganizationId}, 'professional', 'active', now(), now() + interval '30 days')
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
          values
            (${propertyId}, ${organizationId}, 'Document HITL E2E Property', '400 Extract Way', 'Austin', 'TX', '78701', 50000, 45000, 5000, 0.95),
            (${otherPropertyId}, ${otherOrganizationId}, 'Hidden Document HITL Property', '901 Hidden Way', 'Austin', 'TX', '78701', 10000, 9000, 1000, 0.95)
        `;
        await transaction`
          insert into units (id, property_id, unit_number, rentable_sqft, usable_sqft, floor, status)
          values
            (${linkedUnitId}, ${propertyId}, 'H-100', 10000, 9000, 1, 'occupied'),
            (${unlinkedUnitId}, ${propertyId}, 'H-200', 11000, 9900, 2, 'occupied'),
            (${rejectUnitId}, ${propertyId}, 'H-300', 9000, 8100, 3, 'occupied'),
            (${otherUnitId}, ${otherPropertyId}, 'X-100', 5000, 4500, 1, 'occupied')
        `;
        await transaction`
          insert into leases (id, property_id, unit_id, tenant_name, start_date, end_date, status, recovery_profile)
          values
            (${linkedLeaseId}, ${propertyId}, ${linkedUnitId}, 'Linked HITL Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${unlinkedLeaseId}, ${propertyId}, ${unlinkedUnitId}, 'Unlinked HITL Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${rejectLeaseId}, ${propertyId}, ${rejectUnitId}, 'Rejected HITL Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb),
            (${otherLeaseId}, ${otherPropertyId}, ${otherUnitId}, 'Hidden HITL Tenant', ${PERIOD_START}::date, ${PERIOD_END}::date, 'active', '{}'::jsonb)
        `;
      })
      .catch(async (error) => {
        await cleanupDisposableLocalAccount(sql, account);
        await assertCleanupComplete(sql, account);
        fail(
          `Failed to seed local document extraction HITL records: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  } finally {
    await sql.end({ timeout: 5 });
  }

  let token;
  let otherToken;
  let tokenError;
  try {
    token =
      signupBody.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: signupEmail,
        password: signupPassword,
      }));
    otherToken =
      otherSignupBody.session?.access_token ??
      (await signInWithPassword({
        supabaseUrl: input.supabaseUrl,
        anonKey: input.anonKey,
        email: otherEmail,
        password: otherPassword,
      }));
  } catch (error) {
    tokenError = error;
  }

  if (!token || !otherToken || tokenError) {
    const cleanupSql = postgres(input.databaseUrl, { max: 1, prepare: false });
    try {
      await cleanupDisposableLocalAccount(cleanupSql, account);
      await assertCleanupComplete(cleanupSql, account);
    } finally {
      await cleanupSql.end({ timeout: 5 });
    }
    if (tokenError) throw tokenError;
    fail("Local Supabase signup seed could not mint password tokens.");
  }

  return { ...account, token, otherToken };
}

async function signUpLocalUser(input) {
  const signupUrl = new URL("/auth/v1/signup", input.supabaseUrl);
  const response = await fetch(signupUrl, {
    method: "POST",
    headers: {
      apikey: input.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`Local Supabase signup failed: ${safeJson(body)}`);
  }
  return body;
}

async function cleanupUploadedDocuments(sql, input) {
  if (input.documentIds.length === 0) {
    return;
  }

  await sql`
    update documents
    set status = 'failed',
        error_message = 'Local HITL E2E cleanup',
        updated_at = now()
    where id in ${sql(input.documentIds)}
      and organization_id = ${input.organizationId}
  `;

  const failures = [];
  for (const documentId of input.documentIds) {
    const response = await fetch(
      `${input.baseUrl}/api/v1/documents/${documentId}`,
      {
        method: "DELETE",
        headers: input.authHeaders,
      },
    ).catch((error) => error);

    if (response instanceof Error) {
      failures.push(`${documentId}: ${response.message}`);
      continue;
    }
    if (response.status !== 204) {
      const body = await response.text().catch(() => "");
      failures.push(`${documentId}: ${response.status} ${body.slice(0, 200)}`);
    }
  }

  if (failures.length > 0) {
    fail(`Failed to clean uploaded document objects: ${failures.join("; ")}`);
  }
}

async function cleanupDisposableLocalAccount(sql, account) {
  await sql`
    delete from extraction_jobs
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from audit_pipeline_events
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from ocr_results
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from feature_usage_events
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from documents
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from leases
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from units
    where property_id in (${account.propertyId}, ${account.otherPropertyId})
  `;
  await sql`
    delete from properties
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from subscriptions
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  await sql`
    delete from signup_email_events
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or organization_id in (
         ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"},
         ${account.otherSignupOrganizationId ?? "00000000-0000-4000-8000-000000000000"}
       )
       or user_id in (${account.userId}, ${account.otherUserId})
  `;
  await sql`
    delete from legal_acceptances
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or organization_id in (
         ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"},
         ${account.otherSignupOrganizationId ?? "00000000-0000-4000-8000-000000000000"}
       )
       or user_id in (${account.userId}, ${account.otherUserId})
  `;
  await sql`
    delete from audit_log
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or organization_id in (
         ${account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000"},
         ${account.otherSignupOrganizationId ?? "00000000-0000-4000-8000-000000000000"}
       )
       or changed_by in (${account.userId}, ${account.otherUserId})
  `;
  await sql`
    delete from users
    where organization_id in (${account.organizationId}, ${account.otherOrganizationId})
       or id in (${account.userId}, ${account.otherUserId})
  `;
  await sql`
    delete from organizations
    where id in (${account.organizationId}, ${account.otherOrganizationId})
  `;
  for (const id of [
    account.signupOrganizationId,
    account.otherSignupOrganizationId,
  ]) {
    if (id) {
      await sql`delete from organizations where id = ${id}`;
    }
  }
  for (const name of [
    account.signupOrganizationName,
    account.otherSignupOrganizationName,
  ]) {
    if (name) {
      await sql`
        delete from organizations
        where name = ${name}
          and not exists (
            select 1
            from users
            where users.organization_id = organizations.id
          )
      `;
    }
  }
  await sql`
    delete from auth.users
    where id in (${account.userId}, ${account.otherUserId})
  `;
}

async function assertCleanupComplete(sql, account) {
  const signupOrgA =
    account.signupOrganizationId ?? "00000000-0000-4000-8000-000000000000";
  const signupOrgB =
    account.otherSignupOrganizationId ?? "00000000-0000-4000-8000-000000000000";
  const signupNameA =
    account.signupOrganizationName ?? "__document_hitl_no_signup_org_a__";
  const signupNameB =
    account.otherSignupOrganizationName ?? "__document_hitl_no_signup_org_b__";
  const rows = await sql`
    select
      (select count(*)::int from extraction_jobs where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as extraction_jobs,
      (select count(*)::int from audit_pipeline_events where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as audit_pipeline_events,
      (select count(*)::int from ocr_results where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as ocr_results,
      (select count(*)::int from feature_usage_events where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as feature_usage_events,
      (select count(*)::int from documents where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or property_id in (${account.propertyId}, ${account.otherPropertyId})) as documents,
      (select count(*)::int from leases where property_id in (${account.propertyId}, ${account.otherPropertyId})) as leases,
      (select count(*)::int from units where property_id in (${account.propertyId}, ${account.otherPropertyId})) as units,
      (select count(*)::int from properties where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as properties,
      (select count(*)::int from subscriptions where organization_id in (${account.organizationId}, ${account.otherOrganizationId})) as subscriptions,
      (select count(*)::int from signup_email_events where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id in (${signupOrgA}, ${signupOrgB}) or user_id in (${account.userId}, ${account.otherUserId})) as signup_email_events,
      (select count(*)::int from legal_acceptances where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id in (${signupOrgA}, ${signupOrgB}) or user_id in (${account.userId}, ${account.otherUserId})) as legal_acceptances,
      (select count(*)::int from audit_log where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or organization_id in (${signupOrgA}, ${signupOrgB}) or changed_by in (${account.userId}, ${account.otherUserId})) as audit_log,
      (select count(*)::int from users where organization_id in (${account.organizationId}, ${account.otherOrganizationId}) or id in (${account.userId}, ${account.otherUserId})) as public_users,
      (select count(*)::int from organizations where id in (${account.organizationId}, ${account.otherOrganizationId}, ${signupOrgA}, ${signupOrgB}) or name in (${account.organizationName}, ${account.otherOrganizationName}, ${signupNameA}, ${signupNameB})) as organizations,
      (select count(*)::int from auth.users where id in (${account.userId}, ${account.otherUserId})) as auth_users
  `;
  for (const [key, value] of Object.entries(rows[0])) {
    assert(value === 0, `cleanup left ${key}: ${value}`);
  }
}

async function cleanupSignupByEmail(sql, signups) {
  const emails = signups.map((signup) => signup.email);
  const organizationNames = signups.map((signup) => signup.organizationName);
  const publicRows = await sql`
    select id, organization_id
    from users
    where email in ${sql(emails)}
  `;
  const authRows = await sql`
    select id
    from auth.users
    where email in ${sql(emails)}
  `;
  const userIds = [
    ...new Set([
      ...publicRows.map((row) => row.id),
      ...authRows.map((row) => row.id),
    ]),
  ];
  const organizationIds = publicRows
    .map((row) => row.organization_id)
    .filter((id) => typeof id === "string");

  if (organizationIds.length > 0 || userIds.length > 0) {
    const fallbackOrgIds =
      organizationIds.length > 0
        ? organizationIds
        : ["00000000-0000-4000-8000-000000000000"];
    const fallbackUserIds =
      userIds.length > 0 ? userIds : ["00000000-0000-4000-8000-000000000000"];
    await sql`
      delete from signup_email_events
      where organization_id in ${sql(fallbackOrgIds)}
         or user_id in ${sql(fallbackUserIds)}
    `;
    await sql`
      delete from legal_acceptances
      where organization_id in ${sql(fallbackOrgIds)}
         or user_id in ${sql(fallbackUserIds)}
    `;
    await sql`
      delete from audit_log
      where organization_id in ${sql(fallbackOrgIds)}
         or changed_by in ${sql(fallbackUserIds)}
    `;
  }

  if (userIds.length > 0) {
    await sql`delete from users where id in ${sql(userIds)}`;
    await sql`delete from auth.users where id in ${sql(userIds)}`;
  }
  if (organizationIds.length > 0) {
    await sql`
      delete from organizations
      where id in ${sql(organizationIds)}
        and not exists (
          select 1
          from users
          where users.organization_id = organizations.id
        )
    `;
  }
  await sql`
    delete from organizations
    where name in ${sql(organizationNames)}
      and not exists (
        select 1
        from users
        where users.organization_id = organizations.id
      )
  `;
}

function extractedProfile({ proRataShare, capRate, adminFee }) {
  return {
    base_year: 2024,
    base_year_amount: "125000.00",
    gross_up_base_year: true,
    pro_rata_share: proRataShare,
    cap_type: "non_cumulative",
    cap_rate: capRate,
    admin_fee_percentage: adminFee,
    management_fee_percentage: null,
    excluded_pools: ["capital"],
    rsf_measurement_standard: "2024",
    rsf_measurement_date: "2026-01-01",
    accounting_basis: "accrual",
    base_year_adjustments: [
      {
        service_name: "Security",
        imputed_amount: "2500.00",
        justification: "Explicit base-year adjustment in lease exhibit.",
      },
    ],
  };
}

function edit(field, oldValue, newValue) {
  return {
    field,
    old_value: oldValue,
    new_value: newValue,
    timestamp: new Date().toISOString(),
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
    resolve(tmpdir(), "capveri-document-hitl-e2e-"),
  );
  const path = resolve(directory, ".dev.vars.local-document-hitl-e2e");
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
      "DOCUMENT_ACCESS_SIGNING_SECRET=local-document-hitl-e2e-signing-secret",
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
  env.DOCUMENT_ACCESS_SIGNING_SECRET = "local-document-hitl-e2e-signing-secret";
  env.OPENROUTER_API_KEY = input.pollCompletion ? input.openRouterApiKey : "";
  env.LOCAL_E2E_INLINE_EXTRACTION_QUEUE = input.pollCompletion ? "1" : "";
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }
    const trimmed = arg.slice(2);
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex >= 0) {
      parsed[trimmed.slice(0, equalsIndex)] = trimmed.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[trimmed] = next;
      index += 1;
    } else {
      parsed[trimmed] = "true";
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
  return url.origin;
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
  return rawUrl;
}

async function expectJson(url, options = {}) {
  const { status = 200, headers = {}, ...fetchOptions } = options;
  const response = await fetch(url, { ...fetchOptions, headers }).catch(
    (error) => {
      fail(
        `${fetchOptions.method ?? "GET"} ${url} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    },
  );
  const text = await response.text();
  const body = parseJsonResponse(text, url);
  if (response.status !== status) {
    fail(
      `${fetchOptions.method ?? "GET"} ${url} returned ${response.status}, expected ${status}: ${safeJson(body)}`,
    );
  }
  return body;
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

function assertExactKeys(value, expectedKeys, label) {
  assert(value && typeof value === "object", `${label} missing`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assertJsonEqual(actual, expected, `${label} keys`);
}

function assertParseableTimestamp(value, label) {
  assert(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label} is not a timestamp: ${safeJson(value)}`,
  );
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
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    `${label} must be a UUID`,
  );
}

function assertNear(actual, expected, message) {
  assert(
    typeof actual === "number" && Math.abs(actual - expected) < 0.000000000001,
    `${message}: ${actual}`,
  );
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  throw new Error(message);
}
