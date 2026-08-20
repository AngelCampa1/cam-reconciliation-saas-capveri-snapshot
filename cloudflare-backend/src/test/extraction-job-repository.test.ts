import { describe, expect, it } from "vitest";
import {
  buildCompletionResultData,
  DOCUMENT_ERROR_MESSAGE_MAX_LENGTH,
  PostgresExtractionJobRepository,
  truncateDocumentErrorMessage,
} from "../adapters/db/extraction-jobs";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type {
  ExtractionJobRecord,
  JsonObject,
} from "../domain/extraction/extraction-service";

const jobId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const orgId = "11111111-1111-4111-8111-111111111111";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

type ExtractionJobRow = {
  id: string;
  documentId: string;
  organizationId: string;
  documentOrganizationId: string;
  status: ExtractionJobRecord["status"];
  priority: number;
  retryCount: number;
  resultData: JsonObject | null;
  documentStorageKey: string | null;
};

function createExecutor(row: ExtractionJobRow | null): {
  executor: PostgresExecutor;
  statements: RecordedStatement[];
  transactionCalls: { count: number };
} {
  const statements: RecordedStatement[] = [];
  const transactionCalls = { count: 0 };

  return {
    statements,
    transactionCalls,
    executor: {
      async query<Row>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<{ rows: Row[] }> {
        statements.push({ sql, params });

        if (sql.includes("from extraction_jobs")) {
          if (
            row &&
            sql.includes("documents.organization_id = jobs.organization_id") &&
            row.documentOrganizationId !== row.organizationId
          ) {
            return { rows: [] };
          }
          return { rows: row ? [row as Row] : [] };
        }

        if (
          sql.includes("update extraction_jobs") &&
          sql.includes('returning document_id as "documentId"')
        ) {
          return { rows: row ? [{ documentId: row.documentId } as Row] : [] };
        }

        if (sql.includes("update extraction_jobs")) {
          return { rows: row ? [{ id: row.id } as Row] : [] };
        }

        return { rows: [] };
      },
      async transaction<Result>(
        operation: (executor: PostgresExecutor) => Promise<Result>,
      ): Promise<Result> {
        transactionCalls.count += 1;
        return operation(this);
      },
    },
  };
}

function createJobRow(
  overrides: Partial<ExtractionJobRow> = {},
): ExtractionJobRow {
  return {
    id: jobId,
    documentId,
    organizationId: orgId,
    documentOrganizationId: orgId,
    status: "pending",
    priority: 5,
    retryCount: 0,
    resultData: { task_id: "celery-old" },
    documentStorageKey: "documents/org/property/lease.pdf",
    ...overrides,
  };
}

describe("PostgresExtractionJobRepository", () => {
  it("loads extraction jobs with document R2 storage keys", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    await expect(repository.getJob(jobId, orgId)).resolves.toEqual({
      id: jobId,
      documentId,
      organizationId: orgId,
      status: "pending",
      priority: 5,
      retryCount: 0,
      documentStorageKey: "documents/org/property/lease.pdf",
      resultData: { task_id: "celery-old" },
    });

    expect(statements[0]?.sql).toContain("join documents");
    expect(statements[0]?.sql).toContain(
      'documents.storage_key as "documentStorageKey"',
    );
    expect(statements[0]?.sql).toContain(
      "and documents.organization_id = jobs.organization_id",
    );
    expect(statements[0]?.sql).toContain("and jobs.organization_id = $2");
    expect(statements[0]?.params).toEqual([jobId, orgId]);
  });

  it("loads the latest extraction job by document id for legacy queue payload fallback", async () => {
    const fallbackJobId = "55555555-5555-4555-8555-555555555555";
    const { executor, statements } = createExecutor(
      createJobRow({ id: fallbackJobId }),
    );
    const repository = new PostgresExtractionJobRepository(executor);

    await expect(
      repository.getLatestJobByDocumentId(documentId, orgId),
    ).resolves.toMatchObject({
      id: fallbackJobId,
      documentId,
      organizationId: orgId,
      documentStorageKey: "documents/org/property/lease.pdf",
    });

    expect(statements[0]?.sql).toContain("where jobs.document_id = $1");
    expect(statements[0]?.sql).toContain(
      "and documents.organization_id = jobs.organization_id",
    );
    expect(statements[0]?.sql).toContain("and jobs.organization_id = $2");
    expect(statements[0]?.sql).toContain(
      "order by jobs.created_at desc, jobs.id desc",
    );
    expect(statements[0]?.sql).toContain("limit 1");
    expect(statements[0]?.params).toEqual([documentId, orgId]);
  });

  it("returns null when the job or document storage key is missing", async () => {
    const missingJob = createExecutor(null);
    const missingStorageKey = createExecutor(
      createJobRow({ documentStorageKey: null }),
    );

    await expect(
      new PostgresExtractionJobRepository(missingJob.executor).getJob(
        jobId,
        orgId,
      ),
    ).resolves.toBeNull();
    await expect(
      new PostgresExtractionJobRepository(missingStorageKey.executor).getJob(
        jobId,
        orgId,
      ),
    ).resolves.toBeNull();
  });

  it("returns null when a job is linked to another organization's document", async () => {
    const mismatchedDocumentOrg = createExecutor(
      createJobRow({
        documentOrganizationId: "44444444-4444-4444-8444-444444444444",
      }),
    );
    const repository = new PostgresExtractionJobRepository(
      mismatchedDocumentOrg.executor,
    );

    await expect(repository.getJob(jobId, orgId)).resolves.toBeNull();
    await expect(
      repository.getLatestJobByDocumentId(documentId, orgId),
    ).resolves.toBeNull();
  });

  it("claims pending or retrying jobs for processing with a stable started_at timestamp", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    await expect(
      repository.markProcessing(jobId, orgId, "pending"),
    ).resolves.toBe(true);

    expect(statements[0]).toMatchObject({
      params: [jobId, orgId, "pending"],
    });
    expect(statements[0]?.sql).toContain("status = 'processing'");
    expect(statements[0]?.sql).toContain(
      "started_at = coalesce(started_at, now())",
    );
    expect(statements[0]?.sql).toContain("error_message = null");
    expect(statements[0]?.sql).toContain("and organization_id = $2");
    expect(statements[0]?.sql).toContain(
      "(status = 'pending' and $3 = 'pending')",
    );
    expect(statements[0]?.sql).toContain(
      "(status = 'retrying' and $3 = 'retrying' and next_retry_at <= now())",
    );
    expect(statements[0]?.sql).toContain("returning id");
  });

  it("returns false when processing claim does not match a claimable job", async () => {
    const { executor } = createExecutor(null);
    const repository = new PostgresExtractionJobRepository(executor);

    await expect(
      repository.markProcessing(jobId, orgId, "processing"),
    ).resolves.toBe(false);
  });

  it("marks jobs completed with token and field result data", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    const documentExtractionResult = {
      profile: { pro_rata_share: "0.125" },
      confidence_scores: { pro_rata_share: 0.95 },
      source_references: [],
      _meta: { pipeline: "dual-extract" },
    };

    await repository.markCompleted(jobId, orgId, {
      tokensUsed: 42,
      fields: ["tenant_name", "cap_type"],
      resultData: { pipeline: "dual-extract" },
      readerJobId: jobId,
      documentExtractionResult,
    });

    expect(statements[0]?.sql).toContain("update extraction_jobs");
    expect(statements[0]?.sql).toContain("status = 'completed'");
    expect(statements[0]?.sql).toContain(
      "result_data = coalesce(result_data, '{}'::jsonb) || $3::jsonb",
    );
    expect(statements[0]?.sql).toContain("completed_at = now()");
    expect(statements[0]?.sql).toContain("next_retry_at = null");
    expect(statements[0]?.sql).toContain(
      "and status in ('processing', 'retrying')",
    );
    expect(statements[0]?.sql).toContain("and organization_id = $2");
    expect(statements[0]?.sql).toContain(
      'returning document_id as "documentId"',
    );
    expect(statements[0]?.params).toEqual([
      jobId,
      orgId,
      {
        pipeline: "dual-extract",
        tokens_used: 42,
        fields: ["tenant_name", "cap_type"],
      },
    ]);

    // The documents row is updated in the same transaction so the frontend can
    // read the extraction result and the status flips out of "processing".
    expect(statements[1]?.sql).toContain("update documents");
    expect(statements[1]?.sql).toContain("status = 'ready_for_review'");
    expect(statements[1]?.sql).toContain("reader_job_id = $2");
    expect(statements[1]?.sql).toContain("extraction_result = $3::jsonb");
    expect(statements[1]?.sql).toContain("processed_at = now()");
    expect(statements[1]?.sql).toContain("updated_at = now()");
    expect(statements[1]?.sql).toContain("and organization_id = $4");
    // Raw object, NOT JSON.stringify: postgres.js serializes a plain object to
    // jsonb exactly once. Pre-stringifying double-encodes into a jsonb "string"
    // scalar (verified broken in live E2E).
    expect(statements[1]?.params).toEqual([
      documentId,
      jobId,
      documentExtractionResult,
      orgId,
    ]);
  });

  it("skips the documents update when the completion carries no extraction payload", async () => {
    // A completed job without a pipeline payload must not clobber a previously
    // stored documents.extraction_result with an empty object.
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    await repository.markCompleted(jobId, orgId, {
      tokensUsed: 0,
      fields: [],
      resultData: { pipeline: "dual-extract" },
      readerJobId: jobId,
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("update extraction_jobs");
  });

  it("skips the documents update when no extraction job row is affected", async () => {
    const { executor, statements } = createExecutor(null);
    const repository = new PostgresExtractionJobRepository(executor);

    await repository.markCompleted(jobId, orgId, {
      tokensUsed: 0,
      fields: [],
      resultData: {},
      readerJobId: jobId,
      documentExtractionResult: { profile: {} },
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("update extraction_jobs");
  });

  it("marks retrying jobs with backoff metadata", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    await repository.markRetrying(jobId, orgId, {
      retryCount: 2,
      nextRetryAt: "2026-06-12T12:02:00.000Z",
      errorMessage: "OpenRouter rate limited",
      delaySeconds: 120,
    });

    expect(statements[0]?.sql).toContain("status = 'retrying'");
    expect(statements[0]?.sql).toContain("retry_count = $2");
    expect(statements[0]?.sql).toContain("next_retry_at = $3::timestamptz");
    expect(statements[0]?.sql).toContain(
      "and status in ('processing', 'retrying')",
    );
    expect(statements[0]?.sql).toContain("and organization_id = $5");
    expect(statements[0]?.params).toEqual([
      jobId,
      2,
      "2026-06-12T12:02:00.000Z",
      "OpenRouter rate limited",
      orgId,
    ]);
  });

  it("marks jobs and documents failed consistently", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    await repository.markFailed(jobId, orgId, {
      errorMessage: "Invalid payload",
    });
    await repository.markDocumentFailed(documentId, orgId, "Invalid payload");

    expect(statements[0]?.sql).toContain("update extraction_jobs");
    expect(statements[0]?.sql).toContain("status = 'failed'");
    expect(statements[0]?.sql).toContain("completed_at = now()");
    expect(statements[0]?.sql).toContain(
      "and status in ('pending', 'processing', 'retrying')",
    );
    expect(statements[0]?.sql).toContain("and organization_id = $3");
    expect(statements[0]?.params).toEqual([jobId, "Invalid payload", orgId]);
    expect(statements[1]?.sql).toContain("update documents");
    expect(statements[1]?.sql).toContain("status = 'failed'");
    expect(statements[1]?.sql).toContain("updated_at = now()");
    expect(statements[1]?.sql).toContain("and organization_id = $3");
    expect(statements[1]?.params).toEqual([
      documentId,
      "Invalid payload",
      orgId,
    ]);
  });

  it("fails the job and its document atomically in one transaction", async () => {
    const { executor, statements, transactionCalls } =
      createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);

    await repository.markJobAndDocumentFailed(
      jobId,
      documentId,
      orgId,
      "Context mismatch",
    );

    // Both writes must run inside a single transaction so a failure can never
    // strand the job 'failed' while the document stays 'processing'.
    expect(transactionCalls.count).toBe(1);
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain("update extraction_jobs");
    expect(statements[0]?.sql).toContain("status = 'failed'");
    expect(statements[0]?.sql).toContain(
      "and status in ('pending', 'processing', 'retrying')",
    );
    expect(statements[0]?.sql).toContain("and organization_id = $3");
    expect(statements[0]?.sql).toContain("returning id");
    expect(statements[0]?.params).toEqual([jobId, "Context mismatch", orgId]);
    expect(statements[1]?.sql).toContain("update documents");
    expect(statements[1]?.sql).toContain("status = 'failed'");
    expect(statements[1]?.sql).toContain("and organization_id = $3");
    expect(statements[1]?.params).toEqual([
      documentId,
      "Context mismatch",
      orgId,
    ]);
  });

  it("does not fail the document when the job failure status guard matches no rows", async () => {
    const { executor, statements, transactionCalls } = createExecutor(null);
    const repository = new PostgresExtractionJobRepository(executor);

    await repository.markJobAndDocumentFailed(
      jobId,
      documentId,
      orgId,
      "Context mismatch",
    );

    expect(transactionCalls.count).toBe(1);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("update extraction_jobs");
    expect(statements[0]?.sql).toContain(
      "and status in ('pending', 'processing', 'retrying')",
    );
    expect(statements[0]?.sql).toContain("returning id");
  });

  it("truncates the error before the atomic job+document failure write", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);
    const longError = "x".repeat(DOCUMENT_ERROR_MESSAGE_MAX_LENGTH + 10);

    await repository.markJobAndDocumentFailed(
      jobId,
      documentId,
      orgId,
      longError,
    );

    expect(String(statements[0]?.params[1])).toHaveLength(
      DOCUMENT_ERROR_MESSAGE_MAX_LENGTH,
    );
    expect(String(statements[1]?.params[1])).toHaveLength(
      DOCUMENT_ERROR_MESSAGE_MAX_LENGTH,
    );
  });

  it("truncates long error messages before writing constrained columns", async () => {
    const { executor, statements } = createExecutor(createJobRow());
    const repository = new PostgresExtractionJobRepository(executor);
    const longError = "x".repeat(DOCUMENT_ERROR_MESSAGE_MAX_LENGTH + 10);

    await repository.markRetrying(jobId, orgId, {
      retryCount: 1,
      nextRetryAt: "2026-06-12T12:01:00.000Z",
      errorMessage: longError,
      delaySeconds: 60,
    });
    await repository.markFailed(jobId, orgId, { errorMessage: longError });
    await repository.markDocumentFailed(documentId, orgId, longError);

    expect(String(statements[0]?.params[3])).toHaveLength(
      DOCUMENT_ERROR_MESSAGE_MAX_LENGTH,
    );
    expect(String(statements[1]?.params[1])).toHaveLength(
      DOCUMENT_ERROR_MESSAGE_MAX_LENGTH,
    );
    expect(String(statements[2]?.params[1])).toHaveLength(
      DOCUMENT_ERROR_MESSAGE_MAX_LENGTH,
    );
  });
});

describe("buildCompletionResultData", () => {
  it("preserves pipeline result metadata while matching Python task summary fields", () => {
    expect(
      buildCompletionResultData({
        tokensUsed: 7,
        fields: ["base_year"],
        resultData: { pipeline: "dual-extract" },
        readerJobId: jobId,
      }),
    ).toEqual({
      pipeline: "dual-extract",
      tokens_used: 7,
      fields: ["base_year"],
    });
  });
});

describe("truncateDocumentErrorMessage", () => {
  it("preserves short messages and trims long provider failures", () => {
    expect(truncateDocumentErrorMessage("short")).toBe("short");
    expect(
      truncateDocumentErrorMessage(
        "x".repeat(DOCUMENT_ERROR_MESSAGE_MAX_LENGTH + 1),
      ),
    ).toHaveLength(DOCUMENT_ERROR_MESSAGE_MAX_LENGTH);
  });
});
