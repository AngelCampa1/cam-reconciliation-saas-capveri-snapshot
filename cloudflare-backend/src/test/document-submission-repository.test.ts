import { describe, expect, it } from "vitest";
import { PostgresDocumentSubmissionRepository } from "../adapters/db/document-submissions";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import {
  InvalidDocumentStateError,
  LeaseFinalizedReferenceError,
} from "../domain/documents/submission";

const orgId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const leaseId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const jobId = "55555555-5555-4555-8555-555555555555";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

type ExecutorHandler = (
  sql: string,
  params: readonly unknown[],
) => QueryResult<unknown>;

function createExecutor(handler: ExecutorHandler): {
  executor: PostgresExecutor;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];
  const executor: PostgresExecutor = {
    async query<Row>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
      statements.push({ sql, params });

      return handler(sql, params) as QueryResult<Row>;
    },
    async transaction<Result>(
      operation: (transactionExecutor: PostgresExecutor) => Promise<Result>,
    ): Promise<Result> {
      statements.push({ sql: "begin", params: [] });

      try {
        const result = await operation(executor);
        statements.push({ sql: "commit", params: [] });

        return result;
      } catch (error) {
        statements.push({ sql: "rollback", params: [] });
        throw error;
      }
    },
  };

  return { executor, statements };
}

describe("PostgresDocumentSubmissionRepository", () => {
  it("creates document records after property and lease ownership checks", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from properties")) {
        return { rows: [{ id: propertyId }] };
      }

      if (sql.includes("from leases")) {
        return { rows: [{ id: leaseId }] };
      }

      if (sql.includes("insert into documents")) {
        return { rows: [{ id: documentId, status: "pending" }] };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.createDocument({
        organizationId: orgId,
        propertyId,
        filename: "lease.pdf",
        storageKey: `${orgId}/${propertyId}/lease.pdf`,
        storageBucket: "DOCUMENTS_BUCKET",
        contentType: "application/pdf",
        fileSizeBytes: 123,
        documentType: "lease",
        leaseId,
      }),
    ).resolves.toEqual({ id: documentId, status: "pending" });

    expect(statements.map((statement) => statement.sql)).toEqual([
      "begin",
      "select id from properties where id = $1 and organization_id = $2",
      [
        "select leases.id",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where leases.id = $1",
        "and leases.property_id = $2",
        "and properties.organization_id = $3",
      ].join(" "),
      [
        "insert into documents (",
        "organization_id, property_id, filename, storage_key, storage_bucket,",
        "content_type, file_size_bytes, document_type, status, lease_id",
        ") values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)",
        "returning id, status",
      ].join(" "),
      "commit",
    ]);
  });

  it("queues extraction by locking the org-scoped document before creating a job", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "pending",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
            },
          ],
        };
      }

      if (sql.includes("update documents")) {
        return { rows: [{ id: documentId }] };
      }

      if (sql.includes("insert into extraction_jobs")) {
        return {
          rows: [
            {
              id: jobId,
              documentId,
              organizationId: orgId,
              priority: 15,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.queueExtraction({
        documentId,
        organizationId: orgId,
        priority: 15,
      }),
    ).resolves.toEqual({
      documentId,
      jobId,
      organizationId: orgId,
      priority: 15,
    });

    expect(statements[1]?.sql).toContain("for update");
    expect(statements[1]?.params).toEqual([documentId, orgId]);
    expect(statements[2]?.sql).toContain("set status = 'processing'");
    expect(statements[3]?.sql).toContain("insert into extraction_jobs");
    expect(statements[3]?.params).toEqual([documentId, orgId, 15]);
  });

  it("lists organization documents with optional filters and FastAPI-compatible fields", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              propertyId,
              filename: "lease.pdf",
              contentType: "application/pdf",
              fileSizeBytes: "123",
              documentType: "lease",
              status: "pending",
              errorMessage: null,
              createdAt: "2026-06-12T00:00:00Z",
              updatedAt: "2026-06-12T00:00:01Z",
              processedAt: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.listDocuments({
        organizationId: orgId,
        propertyId,
        status: "pending",
        skip: 5,
        limit: 10,
      }),
    ).resolves.toEqual([
      {
        id: documentId,
        organizationId: orgId,
        propertyId,
        filename: "lease.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 123,
        documentType: "lease",
        status: "pending",
        errorMessage: null,
        createdAt: "2026-06-12T00:00:00Z",
        updatedAt: "2026-06-12T00:00:01Z",
        processedAt: null,
      },
    ]);

    expect(statements[0]?.sql).toContain("where organization_id = $1");
    expect(statements[0]?.sql).toContain("and property_id = $4");
    expect(statements[0]?.sql).toContain("and status = $5");
    expect(statements[0]?.sql).toContain("order by created_at desc");
    expect(statements[0]?.sql).toContain("limit $2 offset $3");
    expect(statements[0]?.params).toEqual([
      orgId,
      10,
      5,
      propertyId,
      "pending",
    ]);
  });

  it("loads one document by id and organization", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              propertyId,
              filename: "lease.pdf",
              contentType: "application/pdf",
              fileSizeBytes: 123,
              documentType: "lease",
              status: "pending",
              errorMessage: null,
              createdAt: "2026-06-12T00:00:00Z",
              updatedAt: "2026-06-12T00:00:01Z",
              processedAt: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.getDocument({ documentId, organizationId: orgId }),
    ).resolves.toMatchObject({
      id: documentId,
      organizationId: orgId,
      propertyId,
      filename: "lease.pdf",
      status: "pending",
    });
    expect(statements[0]?.sql).toContain(
      "where id = $1 and organization_id = $2",
    );
    expect(statements[0]?.params).toEqual([documentId, orgId]);
  });

  it.each([
    "pending",
    "failed",
    "ready_for_review",
    "rejected",
    "verified",
  ] as const)(
    "deletes %s organization documents and returns the storage key",
    async (status) => {
      const { executor, statements } = createExecutor((sql) => {
        if (sql.includes("from documents") && sql.includes("for update")) {
          return {
            rows: [
              {
                id: documentId,
                organizationId: orgId,
                documentType: "lease",
                status,
                storageKey: `${orgId}/${propertyId}/lease.pdf`,
                propertyId,
                leaseId,
                extractionResult: null,
              },
            ],
          };
        }

        if (sql.startsWith("delete from documents")) {
          return { rows: [{ id: documentId }] };
        }

        if (sql.includes("from reconciliation_snapshots")) {
          return { rows: [{ totalCount: "0" }] };
        }

        return { rows: [] };
      });
      const repository = new PostgresDocumentSubmissionRepository(executor);

      await expect(
        repository.deleteDocument({ documentId, organizationId: orgId }),
      ).resolves.toEqual({ storageKey: `${orgId}/${propertyId}/lease.pdf` });

      expect(statements[1]?.sql).toContain("for update");
      expect(statements[2]?.sql).toContain("pg_advisory_xact_lock");
      expect(statements[2]?.params).toEqual([
        "capveri:financial-evidence",
        `${orgId}:${propertyId}`,
      ]);
      expect(statements[3]?.sql).toContain("from reconciliation_snapshots");
      expect(statements[3]?.sql).toContain("and status = 'finalized'");
      expect(statements[3]?.params).toEqual([leaseId, orgId]);
      expect(statements[4]?.sql).toContain("delete from documents");
      expect(statements[4]?.sql).toContain("returning id");
      expect(statements[4]?.params).toEqual([documentId, orgId]);
    },
  );

  it("rejects linked document deletion before deleting storage when finalized snapshots reference the lease", async () => {
    let storageDeleted = false;
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "verified",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              propertyId,
              leaseId,
              extractionResult: null,
            },
          ],
        };
      }

      if (sql.includes("from reconciliation_snapshots")) {
        return { rows: [{ totalCount: "2" }] };
      }

      if (sql.startsWith("delete from documents")) {
        throw new Error("document delete should not run");
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.deleteDocument({
        documentId,
        organizationId: orgId,
        beforeDeleteStorage: async () => {
          storageDeleted = true;
        },
      }),
    ).rejects.toBeInstanceOf(LeaseFinalizedReferenceError);

    expect(storageDeleted).toBe(false);
    expect(
      statements.some((statement) =>
        statement.sql.startsWith("delete from documents"),
      ),
    ).toBe(false);
    expect(statements[2]?.sql).toContain("pg_advisory_xact_lock");
    expect(statements[3]?.sql).toContain("from reconciliation_snapshots");
  });

  it("deletes unlinked documents without checking finalized lease snapshots", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "other",
              status: "verified",
              storageKey: `${orgId}/${propertyId}/invoice.pdf`,
              propertyId,
              leaseId: null,
              extractionResult: null,
            },
          ],
        };
      }

      if (sql.startsWith("delete from documents")) {
        return { rows: [{ id: documentId }] };
      }

      if (sql.includes("from reconciliation_snapshots")) {
        throw new Error("finalized snapshot check should not run");
      }

      if (sql.includes("pg_advisory_xact_lock")) {
        throw new Error("financial evidence lock should not run");
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.deleteDocument({ documentId, organizationId: orgId }),
    ).resolves.toEqual({ storageKey: `${orgId}/${propertyId}/invoice.pdf` });

    expect(
      statements.some((statement) =>
        statement.sql.includes("pg_advisory_xact_lock"),
      ),
    ).toBe(false);
    expect(
      statements.some((statement) =>
        statement.sql.includes("from reconciliation_snapshots"),
      ),
    ).toBe(false);
    expect(statements[2]?.sql).toContain("delete from documents");
    expect(statements[2]?.params).toEqual([documentId, orgId]);
  });

  it("rejects deletion for documents that are already processing", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "processing",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              propertyId,
              leaseId,
              extractionResult: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.deleteDocument({ documentId, organizationId: orgId }),
    ).rejects.toThrow(
      "Cannot delete document with status 'processing'. Processing documents must finish or fail before deletion.",
    );

    expect(statements.map((statement) => statement.sql)).toEqual([
      "begin",
      [
        'select id, organization_id as "organizationId",',
        'document_type as "documentType", status, storage_key as "storageKey",',
        'property_id as "propertyId", lease_id as "leaseId",',
        'extraction_result as "extractionResult"',
        "from documents",
        "where id = $1 and organization_id = $2",
        "for update",
      ].join(" "),
      "rollback",
    ]);
  });

  it.each([
    {
      description: "non-lease document types",
      documentType: "rent_roll",
      status: "pending",
      storageKey: `${orgId}/${propertyId}/lease.pdf`,
      message:
        "Extraction workflow is only available for lease or amendment documents",
    },
    {
      description: "documents without storage keys",
      documentType: "lease",
      status: "pending",
      storageKey: null,
      message: "Document missing object storage location information",
    },
    {
      description: "documents already processing",
      documentType: "lease",
      status: "processing",
      storageKey: `${orgId}/${propertyId}/lease.pdf`,
      message:
        "Document must be in PENDING or FAILED status. Current status: processing",
    },
  ])(
    "rejects $description before updating document state",
    async ({ documentType, status, storageKey, message }) => {
      const { executor, statements } = createExecutor((sql) => {
        if (sql.includes("from documents") && sql.includes("for update")) {
          return {
            rows: [
              {
                id: documentId,
                organizationId: orgId,
                documentType,
                status,
                storageKey,
              },
            ],
          };
        }

        return { rows: [] };
      });
      const repository = new PostgresDocumentSubmissionRepository(executor);

      await expect(
        repository.queueExtraction({
          documentId,
          organizationId: orgId,
          priority: 5,
        }),
      ).rejects.toThrow(new InvalidDocumentStateError(message));

      expect(statements.map((statement) => statement.sql)).toEqual([
        "begin",
        [
          'select id, organization_id as "organizationId",',
          'document_type as "documentType", status, storage_key as "storageKey",',
          'property_id as "propertyId", lease_id as "leaseId",',
          'extraction_result as "extractionResult"',
          "from documents",
          "where id = $1 and organization_id = $2",
          "for update",
        ].join(" "),
        "rollback",
      ]);
    },
  );

  it("marks pending jobs and processing documents failed after queue send failure", async () => {
    const { executor, statements } = createExecutor(() => ({ rows: [] }));
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await repository.markExtractionEnqueueFailed({
      documentId,
      jobId,
      organizationId: orgId,
      errorMessage: "queue unavailable",
    });

    expect(statements[1]?.sql).toContain("update extraction_jobs");
    expect(statements[1]?.sql).toContain("and status = 'pending'");
    expect(statements[1]?.params).toEqual([
      jobId,
      documentId,
      orgId,
      "queue unavailable",
    ]);
    expect(statements[2]?.sql).toContain("update documents");
    expect(statements[2]?.sql).toContain("and status = 'processing'");
    expect(statements[2]?.params).toEqual([
      documentId,
      orgId,
      "queue unavailable",
    ]);
  });

  it("grants full access for active subscriptions and rejects expired card-less trials", async () => {
    const active = createExecutor((sql) => {
      if (sql.includes("from subscriptions")) {
        return {
          rows: [
            {
              status: "active",
              billingModel: "subscription",
              stripeSubscriptionId: "sub_active",
              currentPeriodEnd: "2026-07-12T00:00:00Z",
            },
          ],
        };
      }

      return { rows: [] };
    });
    const expiredTrial = createExecutor((sql) => {
      if (sql.includes("from subscriptions")) {
        return {
          rows: [
            {
              status: "trialing",
              billingModel: "subscription",
              stripeSubscriptionId: null,
              currentPeriodEnd: "2000-01-01T00:00:00Z",
            },
          ],
        };
      }

      return { rows: [] };
    });

    await expect(
      new PostgresDocumentSubmissionRepository(active.executor).hasFullAccess(
        orgId,
      ),
    ).resolves.toBe(true);
    await expect(
      new PostgresDocumentSubmissionRepository(
        expiredTrial.executor,
      ).hasFullAccess(orgId),
    ).resolves.toBe(false);
  });

  it("records AI extraction feature usage through the database upsert helper", async () => {
    const { executor, statements } = createExecutor(() => ({ rows: [] }));
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await repository.recordFeatureUse({
      organizationId: orgId,
      featureKey: "ai_lease_extraction",
    });

    expect(statements[0]).toEqual({
      sql: "select public.upsert_feature_use($1, $2)",
      params: [orgId, "ai_lease_extraction"],
    });
  });

  it("loads extraction job status by job and organization", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from extraction_jobs")) {
        return {
          rows: [
            {
              id: jobId,
              documentId,
              organizationId: orgId,
              status: "completed",
              priority: 5,
              retryCount: 1,
              errorMessage: null,
              resultData: { fields: ["base_year"] },
              createdAt: "2026-06-12T00:00:00Z",
              startedAt: "2026-06-12T00:00:01Z",
              completedAt: "2026-06-12T00:00:05Z",
              nextRetryAt: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.getExtractionJob({ jobId, organizationId: orgId }),
    ).resolves.toEqual({
      id: jobId,
      documentId,
      organizationId: orgId,
      status: "completed",
      priority: 5,
      retryCount: 1,
      errorMessage: null,
      resultData: { fields: ["base_year"] },
      createdAt: "2026-06-12T00:00:00Z",
      startedAt: "2026-06-12T00:00:01Z",
      completedAt: "2026-06-12T00:00:05Z",
      nextRetryAt: null,
    });
    expect(statements[0]?.sql).toContain(
      "where id = $1 and organization_id = $2",
    );
    expect(statements[0]?.params).toEqual([jobId, orgId]);
  });

  it("marks failed extraction jobs retrying with exponential backoff", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from extraction_jobs") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: jobId,
              documentId,
              organizationId: orgId,
              status: "failed",
              priority: 5,
              retryCount: 1,
              errorMessage: "OpenRouter timeout",
              resultData: null,
              createdAt: "2026-06-12T00:00:00Z",
              startedAt: "2026-06-12T00:00:01Z",
              completedAt: "2026-06-12T00:00:05Z",
              nextRetryAt: null,
            },
          ],
        };
      }

      if (sql.startsWith("update extraction_jobs")) {
        return {
          rows: [
            {
              id: jobId,
              documentId,
              organizationId: orgId,
              status: "retrying",
              priority: 5,
              retryCount: 2,
              errorMessage: null,
              resultData: null,
              createdAt: "2026-06-12T00:00:00Z",
              startedAt: "2026-06-12T00:00:01Z",
              completedAt: "2026-06-12T00:00:05Z",
              nextRetryAt: "2026-06-12T00:02:00.000Z",
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.retryExtractionJob({ jobId, organizationId: orgId }),
    ).resolves.toMatchObject({
      job: {
        id: jobId,
        status: "retrying",
        retryCount: 2,
      },
      delaySeconds: 120,
      previousRetryCount: 1,
    });

    expect(statements[1]?.sql).toContain("for update");
    expect(statements[2]?.sql).toContain("status = 'retrying'");
    expect(statements[2]?.sql).toContain("retry_count = $3");
    expect(statements[2]?.params[0]).toBe(jobId);
    expect(statements[2]?.params[1]).toBe(orgId);
    expect(statements[2]?.params[2]).toBe(2);
  });

  it("rejects manual retry for non-failed or exhausted extraction jobs", async () => {
    const { executor } = createExecutor((sql) => {
      if (sql.includes("from extraction_jobs") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: jobId,
              documentId,
              organizationId: orgId,
              status: "failed",
              priority: 5,
              retryCount: 3,
              errorMessage: "OpenRouter timeout",
              resultData: null,
              createdAt: "2026-06-12T00:00:00Z",
              startedAt: "2026-06-12T00:00:01Z",
              completedAt: "2026-06-12T00:00:05Z",
              nextRetryAt: null,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.retryExtractionJob({ jobId, organizationId: orgId }),
    ).rejects.toThrow(
      `Job ${jobId} cannot be retried: status=failed, retry_count=3`,
    );
  });

  it("restores retrying jobs to failed when queue delivery cannot be scheduled", async () => {
    const { executor, statements } = createExecutor(() => ({ rows: [] }));
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await repository.markRetryEnqueueFailed({
      jobId,
      organizationId: orgId,
      errorMessage: "queue unavailable",
      retryCount: 1,
    });

    expect(statements[0]?.sql).toContain("set status = 'failed'");
    expect(statements[0]?.sql).toContain("retry_count = $3");
    expect(statements[0]?.sql).toContain("next_retry_at = null");
    expect(statements[0]?.sql).toContain("and status = 'retrying'");
    expect(statements[0]?.params).toEqual([
      jobId,
      orgId,
      1,
      "queue unavailable",
    ]);
  });

  it("lists extraction documents with org, type, status, and pagination filters", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("count(*) over()")) {
        return {
          rows: [
            {
              id: documentId,
              filename: "lease.pdf",
              status: "ready_for_review",
              createdAt: "2026-06-12T00:00:00Z",
              processedAt: "2026-06-12T00:00:05Z",
              verifiedAt: null,
              extractionResult: JSON.stringify({
                confidence_scores: { base_year: 0.8 },
              }),
              totalCount: "7",
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.listExtractions({
        organizationId: orgId,
        status: "ready_for_review",
        page: 2,
        pageSize: 3,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: documentId,
          filename: "lease.pdf",
          status: "ready_for_review",
          createdAt: "2026-06-12T00:00:00Z",
          processedAt: "2026-06-12T00:00:05Z",
          verifiedAt: null,
          extractionResult: { confidence_scores: { base_year: 0.8 } },
        },
      ],
      total: 7,
      page: 2,
      pageSize: 3,
      hasNext: true,
    });

    expect(statements[0]?.sql).toContain("where organization_id = $1");
    expect(statements[0]?.sql).toContain(
      "and document_type in ('lease', 'amendment')",
    );
    expect(statements[0]?.sql).toContain("and status = $4");
    expect(statements[0]?.sql).toContain("order by created_at desc");
    expect(statements[0]?.sql).toContain("limit $2 offset $3");
    expect(statements[0]?.params).toEqual([orgId, 3, 3, "ready_for_review"]);
  });

  it("loads extraction detail by document and organization", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("storage_bucket")) {
        return {
          rows: [
            {
              id: documentId,
              filename: "lease.pdf",
              status: "ready_for_review",
              storageBucket: "DOCUMENTS_BUCKET",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              contentType: "application/pdf",
              fileSizeBytes: 123,
              documentType: "lease",
              extractionResult: JSON.stringify({
                profile: { tenant_name: "Tenant A" },
              }),
              createdAt: "2026-06-12T00:00:00Z",
              processedAt: "2026-06-12T00:00:05Z",
              verifiedAt: null,
              verifiedBy: null,
              propertyId,
              leaseId,
              editHistory: JSON.stringify([{ field: "tenant_name" }]),
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.getExtractionDetail({
        documentId,
        organizationId: orgId,
      }),
    ).resolves.toEqual({
      id: documentId,
      filename: "lease.pdf",
      status: "ready_for_review",
      storageBucket: "DOCUMENTS_BUCKET",
      storageKey: `${orgId}/${propertyId}/lease.pdf`,
      contentType: "application/pdf",
      fileSizeBytes: 123,
      extractionResult: { profile: { tenant_name: "Tenant A" } },
      createdAt: "2026-06-12T00:00:00Z",
      processedAt: "2026-06-12T00:00:05Z",
      verifiedAt: null,
      verifiedBy: null,
      propertyId,
      leaseId,
      editHistory: [{ field: "tenant_name" }],
    });

    expect(statements[0]?.sql).toContain(
      "where id = $1 and organization_id = $2",
    );
    expect(statements[0]?.params).toEqual([documentId, orgId]);
  });

  it("saves extraction drafts by merging with the existing extraction result", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "ready_for_review",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              propertyId,
              leaseId,
              extractionResult: { profile: { tenant_name: "Tenant A" } },
            },
          ],
        };
      }

      if (sql.includes("set extraction_result")) {
        return { rows: [{ id: documentId }] };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await repository.saveExtractionDraft({
      documentId,
      organizationId: orgId,
      profile: { tenant_name: "Tenant B" },
    });

    expect(statements[2]?.sql).toContain("set extraction_result = $3::jsonb");
    expect(statements[2]?.params[2]).toMatchObject({
      profile: { tenant_name: "Tenant A" },
      draft_profile: { tenant_name: "Tenant B" },
    });
  });

  it.each(["pending", "processing", "failed", "rejected", "verified"] as const)(
    "rejects draft saves for %s documents",
    async (status) => {
      const { executor } = createExecutor((sql) => {
        if (sql.includes("from documents") && sql.includes("for update")) {
          return {
            rows: [
              {
                id: documentId,
                organizationId: orgId,
                documentType: "lease",
                status,
                storageKey: `${orgId}/${propertyId}/lease.pdf`,
                propertyId,
                leaseId,
                extractionResult: { profile: { tenant_name: "Tenant A" } },
              },
            ],
          };
        }

        return { rows: [] };
      });
      const repository = new PostgresDocumentSubmissionRepository(executor);

      await expect(
        repository.saveExtractionDraft({
          documentId,
          organizationId: orgId,
          profile: { tenant_name: "Tenant B" },
        }),
      ).rejects.toThrow(InvalidDocumentStateError);
    },
  );

  it("approves extraction by updating the lease and marking the document verified", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "ready_for_review",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              propertyId,
              leaseId: null,
              extractionResult: null,
            },
          ],
        };
      }

      if (sql.includes("from leases") && sql.includes("join properties")) {
        return { rows: [{ id: leaseId }] };
      }

      if (sql.includes("from reconciliation_snapshots")) {
        return { rows: [{ totalCount: "0" }] };
      }

      if (sql.startsWith("update leases")) {
        return { rows: [{ id: leaseId }] };
      }

      if (sql.startsWith("update documents")) {
        return { rows: [{ id: documentId }] };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.approveExtraction({
        documentId,
        organizationId: orgId,
        userId: "99999999-9999-4999-8999-999999999999",
        profile: { base_year: 2024 },
        editHistory: [{ field: "base_year", new_value: "2024" }],
        leaseId,
      }),
    ).resolves.toEqual({ leaseId });

    expect(statements[3]?.sql).toContain("pg_advisory_xact_lock");
    expect(statements[3]?.params).toEqual([
      "capveri:financial-evidence",
      `${orgId}:${propertyId}`,
    ]);
    expect(statements[4]?.sql).toContain("from reconciliation_snapshots");
    expect(statements[4]?.params).toEqual([leaseId, orgId]);
    expect(statements[5]?.sql).toContain("set recovery_profile = $3::jsonb");
    expect(statements[5]?.params).toEqual([
      leaseId,
      propertyId,
      { base_year: 2024 },
    ]);
    expect(statements[6]?.sql).toContain("status = 'verified'");
    expect(statements[6]?.sql).toContain("lease_id = $5");
  });

  it("rejects approval before updating leases when finalized snapshots reference the lease", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "ready_for_review",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              propertyId,
              leaseId,
              extractionResult: null,
            },
          ],
        };
      }

      if (sql.includes("from leases") && sql.includes("join properties")) {
        return { rows: [{ id: leaseId }] };
      }

      if (sql.includes("from reconciliation_snapshots")) {
        return { rows: [{ totalCount: "1" }] };
      }

      if (sql.startsWith("update leases")) {
        throw new Error("lease update should not run");
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.approveExtraction({
        documentId,
        organizationId: orgId,
        userId: "99999999-9999-4999-8999-999999999999",
        profile: { base_year: 2024 },
        editHistory: [{ field: "base_year", new_value: "2024" }],
      }),
    ).rejects.toBeInstanceOf(LeaseFinalizedReferenceError);

    expect(
      statements.some((statement) => statement.sql.startsWith("update leases")),
    ).toBe(false);
    expect(
      statements.some((statement) =>
        statement.sql.startsWith("update documents"),
      ),
    ).toBe(false);
  });

  it.each(["pending", "processing", "failed", "rejected", "verified"] as const)(
    "rejects approval for %s documents",
    async (status) => {
      const { executor } = createExecutor((sql) => {
        if (sql.includes("from documents") && sql.includes("for update")) {
          return {
            rows: [
              {
                id: documentId,
                organizationId: orgId,
                documentType: "lease",
                status,
                storageKey: `${orgId}/${propertyId}/lease.pdf`,
                propertyId,
                leaseId,
                extractionResult: { profile: { tenant_name: "Tenant A" } },
              },
            ],
          };
        }

        return { rows: [] };
      });
      const repository = new PostgresDocumentSubmissionRepository(executor);

      await expect(
        repository.approveExtraction({
          documentId,
          organizationId: orgId,
          userId: "99999999-9999-4999-8999-999999999999",
          profile: { base_year: 2024 },
          editHistory: [],
        }),
      ).rejects.toThrow(InvalidDocumentStateError);
    },
  );

  it("rejects extraction and creates retry jobs inside one transaction", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("from documents") && sql.includes("for update")) {
        return {
          rows: [
            {
              id: documentId,
              organizationId: orgId,
              documentType: "lease",
              status: "ready_for_review",
              storageKey: `${orgId}/${propertyId}/lease.pdf`,
              propertyId,
              leaseId,
              extractionResult: null,
            },
          ],
        };
      }

      if (sql.startsWith("update documents")) {
        return { rows: [{ id: documentId }] };
      }

      if (sql.includes("insert into extraction_jobs")) {
        return {
          rows: [
            {
              id: jobId,
              documentId,
              organizationId: orgId,
              priority: 5,
            },
          ],
        };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.rejectExtraction({
        documentId,
        organizationId: orgId,
        userId: "99999999-9999-4999-8999-999999999999",
        reason: "poor_ocr_quality",
        notes: "Missing page",
        requeue: true,
        priority: 5,
      }),
    ).resolves.toEqual({
      message: `Extraction rejected and queued for retry. Job ID: ${jobId}`,
      submission: {
        documentId,
        jobId,
        organizationId: orgId,
        priority: 5,
      },
    });

    expect(statements[2]?.sql).toContain("status = $3");
    expect(statements[2]?.params).toEqual([
      documentId,
      orgId,
      "processing",
      "Rejected: poor_ocr_quality. Notes: Missing page",
      "99999999-9999-4999-8999-999999999999",
      "poor_ocr_quality",
      "Missing page",
    ]);
    expect(statements[3]?.sql).toContain("insert into extraction_jobs");
  });

  it.each(["pending", "processing", "failed", "rejected", "verified"] as const)(
    "rejects rejection requests for %s documents",
    async (status) => {
      const { executor } = createExecutor((sql) => {
        if (sql.includes("from documents") && sql.includes("for update")) {
          return {
            rows: [
              {
                id: documentId,
                organizationId: orgId,
                documentType: "lease",
                status,
                storageKey: `${orgId}/${propertyId}/lease.pdf`,
                propertyId,
                leaseId,
                extractionResult: { profile: { tenant_name: "Tenant A" } },
              },
            ],
          };
        }

        return { rows: [] };
      });
      const repository = new PostgresDocumentSubmissionRepository(executor);

      await expect(
        repository.rejectExtraction({
          documentId,
          organizationId: orgId,
          userId: "99999999-9999-4999-8999-999999999999",
          reason: "poor_ocr_quality",
          notes: null,
          requeue: true,
          priority: 5,
        }),
      ).rejects.toThrow(InvalidDocumentStateError);
    },
  );

  it("counts empty extraction list pages with the same org and type filters", async () => {
    const { executor, statements } = createExecutor((sql) => {
      if (sql.includes("count(*) over()")) {
        return { rows: [] };
      }

      if (sql.startsWith("select count(*) as total")) {
        return { rows: [{ total: "4" }] };
      }

      return { rows: [] };
    });
    const repository = new PostgresDocumentSubmissionRepository(executor);

    await expect(
      repository.listExtractions({
        organizationId: orgId,
        page: 3,
        pageSize: 2,
      }),
    ).resolves.toEqual({
      items: [],
      total: 4,
      page: 3,
      pageSize: 2,
      hasNext: false,
    });

    expect(statements[0]?.params).toEqual([orgId, 2, 4]);
    expect(statements[1]?.sql).toContain("select count(*) as total");
    expect(statements[1]?.sql).toContain(
      "and document_type in ('lease', 'amendment')",
    );
    expect(statements[1]?.params).toEqual([orgId]);
  });
});
