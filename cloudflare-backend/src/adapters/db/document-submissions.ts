import {
  InvalidDocumentStateError,
  LeaseFinalizedReferenceError,
  NotFoundError,
  supportsLeaseExtraction,
  type ApproveExtractionInput,
  type ApproveExtractionResult,
  type CreateDocumentInput,
  type CreatedDocument,
  type DeleteDocumentResult,
  type DocumentListQuery,
  type DocumentRecord,
  type DocumentStatus,
  type DocumentSubmissionRepository,
  type DocumentType,
  type ExtractionDetail,
  type ExtractionJobStatus,
  type ExtractionListItem,
  type ExtractionListPage,
  type ExtractionListQuery,
  type ExtractionJobSummary,
  type ExtractionSubmission,
  type RejectExtractionInput,
  type RejectExtractionResult,
  type RetryExtractionJobResult,
  type SaveExtractionDraftInput,
} from "../../domain/documents/submission";
import { lockPropertyFinancialEvidence } from "./financial-evidence-lock";
import type { PostgresExecutor } from "./postgres";

type ExistingDocumentRow = {
  id: string;
  organizationId: string;
  documentType: DocumentType;
  status: DocumentStatus;
  storageKey: string | null;
  propertyId: string;
  leaseId: string | null;
  extractionResult: Record<string, unknown> | null;
};

type CreatedDocumentRow = {
  id: string;
  status: DocumentStatus;
};

type DocumentRecordRow = {
  id: string;
  organizationId: string;
  propertyId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number | string;
  documentType: DocumentType;
  status: DocumentStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  storageKey: string | null;
};

type CreatedJobRow = {
  id: string;
  documentId: string;
  organizationId: string;
  priority: number;
};

type ExtractionJobRow = {
  id: string;
  documentId: string;
  organizationId: string;
  status: ExtractionJobStatus;
  priority: number;
  retryCount: number;
  errorMessage: string | null;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
};

type ExtractionListRow = {
  id: string;
  filename: string;
  status: DocumentStatus;
  createdAt: string;
  processedAt: string | null;
  verifiedAt: string | null;
  extractionResult: Record<string, unknown> | null;
  totalCount: string | number;
};

type ExtractionDetailRow = {
  id: string;
  filename: string;
  status: DocumentStatus;
  storageBucket: string;
  storageKey: string;
  contentType: string;
  fileSizeBytes: number;
  documentType: DocumentType;
  extractionResult: Record<string, unknown> | null;
  createdAt: string;
  processedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  propertyId: string;
  leaseId: string | null;
  editHistory: Record<string, unknown>[] | null;
};

type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

export class PostgresDocumentSubmissionRepository implements DocumentSubmissionRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async hasFullAccess(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<SubscriptionEntitlementRow>(
      [
        'select status, billing_model as "billingModel",',
        'stripe_subscription_id as "stripeSubscriptionId",',
        'current_period_end as "currentPeriodEnd"',
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return this.hasPurchasedCredits(organizationId);
    }

    if (row.billingModel === "credit_pack") {
      return this.hasPurchasedCredits(organizationId);
    }

    return (
      effectiveSubscriptionStatus(row) === "active" ||
      effectiveSubscriptionStatus(row) === "trialing"
    );
  }

  async recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void> {
    await this.executor.query("select public.upsert_feature_use($1, $2)", [
      input.organizationId,
      input.featureKey,
    ]);
  }

  createDocument(input: CreateDocumentInput): Promise<CreatedDocument> {
    return this.executor.transaction(async (transaction) => {
      await assertPropertyExists(
        transaction,
        input.propertyId,
        input.organizationId,
      );

      if (input.leaseId) {
        await assertLeaseExists(
          transaction,
          input.leaseId,
          input.propertyId,
          input.organizationId,
        );
      }

      const result = await transaction.query<CreatedDocumentRow>(
        [
          "insert into documents (",
          "organization_id, property_id, filename, storage_key, storage_bucket,",
          "content_type, file_size_bytes, document_type, status, lease_id",
          ") values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)",
          "returning id, status",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.filename,
          input.storageKey,
          input.storageBucket,
          input.contentType,
          input.fileSizeBytes,
          input.documentType,
          input.leaseId ?? null,
        ],
      );
      const row = result.rows[0];

      if (!row) {
        throw new Error("Failed to create document record");
      }

      return row;
    });
  }

  async listDocuments(query: DocumentListQuery): Promise<DocumentRecord[]> {
    const params: unknown[] = [query.organizationId, query.limit, query.skip];
    const propertyFilter = query.propertyId
      ? `and property_id = $${params.length + 1}`
      : "";

    if (query.propertyId) {
      params.push(query.propertyId);
    }

    const statusFilter = query.status
      ? `and status = $${params.length + 1}`
      : "";

    if (query.status) {
      params.push(query.status);
    }

    const result = await this.executor.query<DocumentRecordRow>(
      [
        documentRecordSelectColumns(),
        "from documents",
        "where organization_id = $1",
        propertyFilter,
        statusFilter,
        "order by created_at desc",
        "limit $2 offset $3",
      ]
        .filter(Boolean)
        .join(" "),
      params,
    );

    return result.rows.map(toDocumentRecord);
  }

  async getDocument(input: {
    documentId: string;
    organizationId: string;
  }): Promise<DocumentRecord | null> {
    const result = await this.executor.query<DocumentRecordRow>(
      [
        documentRecordSelectColumns(),
        "from documents",
        "where id = $1 and organization_id = $2",
      ].join(" "),
      [input.documentId, input.organizationId],
    );
    const row = result.rows[0];

    return row ? toDocumentRecord(row) : null;
  }

  async deleteDocument(input: {
    documentId: string;
    organizationId: string;
    beforeDeleteStorage?: (storageKey: string) => Promise<void>;
  }): Promise<DeleteDocumentResult> {
    return this.executor.transaction(async (transaction) => {
      const document = await getDocumentForUpdate(
        transaction,
        input.documentId,
        input.organizationId,
      );

      if (document.status === "processing") {
        throw new InvalidDocumentStateError(
          `Cannot delete document with status '${document.status}'. Processing documents must finish or fail before deletion.`,
        );
      }

      if (document.leaseId) {
        await lockPropertyFinancialEvidence(transaction, {
          organizationId: input.organizationId,
          propertyId: document.propertyId,
        });

        const finalizedResult = await transaction.query<{
          totalCount: string | number | bigint;
        }>(
          [
            'select count(*) as "totalCount"',
            "from reconciliation_snapshots",
            "where lease_id = $1",
            "and organization_id = $2",
            "and status = 'finalized'",
          ].join(" "),
          [document.leaseId, input.organizationId],
        );
        const finalizedSnapshotCount = toCount(
          finalizedResult.rows[0]?.totalCount ?? 0,
        );
        if (finalizedSnapshotCount > 0) {
          throw new LeaseFinalizedReferenceError(
            document.leaseId,
            finalizedSnapshotCount,
          );
        }
      }

      if (document.storageKey) {
        await input.beforeDeleteStorage?.(document.storageKey);
      }

      const result = await transaction.query<{ id: string }>(
        [
          "delete from documents",
          "where id = $1 and organization_id = $2",
          "returning id",
        ].join(" "),
        [input.documentId, input.organizationId],
      );

      if (!result.rows[0]) {
        throw new NotFoundError("Document");
      }

      return { storageKey: document.storageKey };
    });
  }

  queueExtraction(input: {
    documentId: string;
    organizationId: string;
    priority: number;
  }): Promise<ExtractionSubmission> {
    return this.executor.transaction(async (transaction) => {
      const document = await getDocumentForUpdate(
        transaction,
        input.documentId,
        input.organizationId,
      );

      if (!supportsLeaseExtraction(document.documentType)) {
        throw new InvalidDocumentStateError(
          "Extraction workflow is only available for lease or amendment documents",
        );
      }

      if (!document.storageKey) {
        throw new InvalidDocumentStateError(
          "Document missing object storage location information",
        );
      }

      if (document.status !== "pending" && document.status !== "failed") {
        throw new InvalidDocumentStateError(
          `Document must be in PENDING or FAILED status. Current status: ${document.status}`,
        );
      }

      const update = await transaction.query<{ id: string }>(
        [
          "update documents",
          "set status = 'processing', error_message = null, updated_at = now()",
          "where id = $1 and organization_id = $2",
          "returning id",
        ].join(" "),
        [input.documentId, input.organizationId],
      );

      if (!update.rows[0]) {
        throw new NotFoundError("Document");
      }

      const job = await transaction.query<CreatedJobRow>(
        [
          "insert into extraction_jobs (document_id, organization_id, priority)",
          "values ($1, $2, $3)",
          'returning id, document_id as "documentId",',
          'organization_id as "organizationId", priority',
        ].join(" "),
        [input.documentId, input.organizationId, input.priority],
      );
      const row = job.rows[0];

      if (!row) {
        throw new Error("Failed to create extraction job");
      }

      return {
        documentId: row.documentId,
        jobId: row.id,
        organizationId: row.organizationId,
        priority: row.priority,
      };
    });
  }

  async getExtractionJob(input: {
    jobId: string;
    organizationId: string;
  }): Promise<ExtractionJobSummary | null> {
    const result = await this.executor.query<ExtractionJobRow>(
      [
        'select id, document_id as "documentId",',
        'organization_id as "organizationId", status, priority,',
        'retry_count as "retryCount", error_message as "errorMessage",',
        'result_data as "resultData", created_at as "createdAt",',
        'started_at as "startedAt", completed_at as "completedAt",',
        'next_retry_at as "nextRetryAt"',
        "from extraction_jobs",
        "where id = $1 and organization_id = $2",
      ].join(" "),
      [input.jobId, input.organizationId],
    );

    return result.rows[0] ?? null;
  }

  async retryExtractionJob(input: {
    jobId: string;
    organizationId: string;
  }): Promise<RetryExtractionJobResult | null> {
    return this.executor.transaction(async (transaction) => {
      const job = await getExtractionJobForUpdate(transaction, input);

      if (!job) {
        return null;
      }

      if (job.status !== "failed" || job.retryCount >= 3) {
        throw new InvalidDocumentStateError(
          `Job ${input.jobId} cannot be retried: status=${job.status}, retry_count=${job.retryCount}`,
        );
      }

      const delaySeconds = 60 * 2 ** job.retryCount;
      const nextRetryAt = new Date(
        Date.now() + delaySeconds * 1000,
      ).toISOString();
      const retryCount = job.retryCount + 1;
      const update = await transaction.query<ExtractionJobRow>(
        [
          "update extraction_jobs",
          "set status = 'retrying', retry_count = $3,",
          "next_retry_at = $4::timestamptz, error_message = null",
          "where id = $1 and organization_id = $2",
          'returning id, document_id as "documentId",',
          'organization_id as "organizationId", status, priority,',
          'retry_count as "retryCount", error_message as "errorMessage",',
          'result_data as "resultData", created_at as "createdAt",',
          'started_at as "startedAt", completed_at as "completedAt",',
          'next_retry_at as "nextRetryAt"',
        ].join(" "),
        [input.jobId, input.organizationId, retryCount, nextRetryAt],
      );
      const updatedJob = update.rows[0];

      if (!updatedJob) {
        throw new NotFoundError("Job");
      }

      return {
        job: updatedJob,
        delaySeconds,
        previousRetryCount: job.retryCount,
      };
    });
  }

  async markRetryEnqueueFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
    retryCount: number;
  }): Promise<void> {
    await this.executor.query(
      [
        "update extraction_jobs",
        "set status = 'failed',",
        "retry_count = $3,",
        "error_message = $4,",
        "next_retry_at = null",
        "where id = $1 and organization_id = $2",
        "and status = 'retrying'",
      ].join(" "),
      [
        input.jobId,
        input.organizationId,
        input.retryCount,
        truncateErrorMessage(input.errorMessage),
      ],
    );
  }

  async listExtractions(
    query: ExtractionListQuery,
  ): Promise<ExtractionListPage> {
    const offset = (query.page - 1) * query.pageSize;
    const params: unknown[] = [query.organizationId, query.pageSize, offset];
    const statusFilter = query.status ? "and status = $4" : "";

    if (query.status) {
      params.push(query.status);
    }

    const result = await this.executor.query<ExtractionListRow>(
      [
        'select id, filename, status, created_at as "createdAt",',
        'processed_at as "processedAt", verified_at as "verifiedAt",',
        'extraction_result as "extractionResult", count(*) over() as "totalCount"',
        "from documents",
        "where organization_id = $1",
        "and document_type in ('lease', 'amendment')",
        statusFilter,
        "order by created_at desc",
        "limit $2 offset $3",
      ]
        .filter(Boolean)
        .join(" "),
      params,
    );
    const total = result.rows[0]
      ? Number(result.rows[0].totalCount)
      : await this.countExtractions(query);

    return {
      items: result.rows.map(toExtractionListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasNext: offset + query.pageSize < total,
    };
  }

  async getExtractionDetail(input: {
    documentId: string;
    organizationId: string;
  }): Promise<ExtractionDetail | null> {
    const result = await this.executor.query<ExtractionDetailRow>(
      [
        'select id, filename, status, storage_bucket as "storageBucket",',
        'storage_key as "storageKey", content_type as "contentType",',
        'file_size_bytes as "fileSizeBytes", document_type as "documentType",',
        'extraction_result as "extractionResult", created_at as "createdAt",',
        'processed_at as "processedAt", verified_at as "verifiedAt",',
        'verified_by as "verifiedBy", property_id as "propertyId",',
        'lease_id as "leaseId", edit_history as "editHistory"',
        "from documents",
        "where id = $1 and organization_id = $2",
      ].join(" "),
      [input.documentId, input.organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    if (!supportsLeaseExtraction(row.documentType)) {
      throw new InvalidDocumentStateError(
        "Extraction workflow is only available for lease or amendment documents",
      );
    }

    if (!row.storageKey) {
      throw new InvalidDocumentStateError(
        "Document missing object storage location information",
      );
    }

    return toExtractionDetail(row);
  }

  async saveExtractionDraft(input: SaveExtractionDraftInput): Promise<void> {
    await this.executor.transaction(async (transaction) => {
      const document = await getDocumentForUpdate(
        transaction,
        input.documentId,
        input.organizationId,
      );

      ensureReadyForReviewDocument(document);

      const updatedResult = {
        ...(document.extractionResult ?? {}),
        draft_profile: input.profile,
        last_saved_at: new Date().toISOString(),
      };
      const result = await transaction.query<{ id: string }>(
        [
          "update documents",
          "set extraction_result = $3::jsonb, updated_at = now()",
          "where id = $1 and organization_id = $2",
          "returning id",
        ].join(" "),
        [input.documentId, input.organizationId, updatedResult],
      );

      if (!result.rows[0]) {
        throw new NotFoundError("Document");
      }
    });
  }

  async approveExtraction(
    input: ApproveExtractionInput,
  ): Promise<ApproveExtractionResult> {
    return this.executor.transaction(async (transaction) => {
      const document = await getDocumentForUpdate(
        transaction,
        input.documentId,
        input.organizationId,
      );

      ensureReadyForReviewDocument(document);

      const effectiveLeaseId = document.leaseId ?? input.leaseId;

      if (!effectiveLeaseId) {
        throw new InvalidDocumentStateError(
          "Document must be linked to a lease before approval",
        );
      }

      await assertLeaseExists(
        transaction,
        effectiveLeaseId,
        document.propertyId,
        input.organizationId,
      );

      await lockPropertyFinancialEvidence(transaction, {
        organizationId: input.organizationId,
        propertyId: document.propertyId,
      });

      const finalizedResult = await transaction.query<{
        totalCount: string | number | bigint;
      }>(
        [
          'select count(*) as "totalCount"',
          "from reconciliation_snapshots",
          "where lease_id = $1",
          "and organization_id = $2",
          "and status = 'finalized'",
        ].join(" "),
        [effectiveLeaseId, input.organizationId],
      );
      const finalizedSnapshotCount = toCount(
        finalizedResult.rows[0]?.totalCount ?? 0,
      );
      if (finalizedSnapshotCount > 0) {
        throw new LeaseFinalizedReferenceError(
          effectiveLeaseId,
          finalizedSnapshotCount,
        );
      }

      const lease = await transaction.query<{ id: string }>(
        [
          "update leases",
          "set recovery_profile = $3::jsonb, updated_at = now()",
          "where id = $1 and property_id = $2",
          "returning id",
        ].join(" "),
        [effectiveLeaseId, document.propertyId, input.profile],
      );

      if (!lease.rows[0]) {
        throw new NotFoundError("Lease");
      }

      const documentParams: unknown[] = [
        input.documentId,
        input.organizationId,
        input.userId,
        input.editHistory,
      ];
      const leaseUpdate = document.leaseId ? "" : ", lease_id = $5";

      if (!document.leaseId) {
        documentParams.push(effectiveLeaseId);
      }

      const update = await transaction.query<{ id: string }>(
        [
          "update documents",
          "set status = 'verified', verified_by = $3, verified_at = now(),",
          "edit_history = $4::jsonb, updated_at = now()",
          leaseUpdate,
          "where id = $1 and organization_id = $2",
          "returning id",
        ].join(" "),
        documentParams,
      );

      if (!update.rows[0]) {
        throw new Error("Failed to mark document as verified");
      }

      return { leaseId: effectiveLeaseId };
    });
  }

  async rejectExtraction(
    input: RejectExtractionInput,
  ): Promise<RejectExtractionResult> {
    return this.executor.transaction(async (transaction) => {
      const document = await getDocumentForUpdate(
        transaction,
        input.documentId,
        input.organizationId,
      );

      ensureReadyForReviewDocument(document);

      const status = input.requeue ? "processing" : "rejected";
      const errorMessage = `Rejected: ${input.reason}. Notes: ${input.notes ?? "None"}`;
      const update = await transaction.query<{ id: string }>(
        [
          "update documents",
          "set status = $3, error_message = $4, rejected_by = $5,",
          "rejected_at = now(), rejection_reason = $6, rejection_notes = $7,",
          "updated_at = now()",
          "where id = $1 and organization_id = $2",
          "returning id",
        ].join(" "),
        [
          input.documentId,
          input.organizationId,
          status,
          truncateErrorMessage(errorMessage),
          input.userId,
          input.reason,
          input.notes,
        ],
      );

      if (!update.rows[0]) {
        throw new Error("Failed to mark document as rejected");
      }

      if (!input.requeue) {
        return {
          message:
            "Extraction rejected successfully. Re-upload to retry with different settings.",
        };
      }

      const job = await transaction.query<CreatedJobRow>(
        [
          "insert into extraction_jobs (document_id, organization_id, priority)",
          "values ($1, $2, $3)",
          'returning id, document_id as "documentId",',
          'organization_id as "organizationId", priority',
        ].join(" "),
        [input.documentId, input.organizationId, input.priority],
      );
      const row = job.rows[0];

      if (!row) {
        throw new Error("Failed to create extraction job");
      }

      return {
        message: `Extraction rejected and queued for retry. Job ID: ${row.id}`,
        submission: {
          documentId: row.documentId,
          jobId: row.id,
          organizationId: row.organizationId,
          priority: row.priority,
        },
      };
    });
  }

  async markExtractionEnqueueFailed(input: {
    documentId: string;
    jobId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.executor.transaction(async (transaction) => {
      await transaction.query(
        [
          "update extraction_jobs",
          "set status = 'failed', error_message = $4, completed_at = now()",
          "where id = $1 and document_id = $2 and organization_id = $3",
          "and status = 'pending'",
        ].join(" "),
        [
          input.jobId,
          input.documentId,
          input.organizationId,
          truncateErrorMessage(input.errorMessage),
        ],
      );
      await transaction.query(
        [
          "update documents",
          "set status = 'failed', error_message = $3, updated_at = now()",
          "where id = $1 and organization_id = $2 and status = 'processing'",
        ].join(" "),
        [
          input.documentId,
          input.organizationId,
          truncateErrorMessage(input.errorMessage),
        ],
      );
    });
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{ exists: boolean }>(
      [
        "select exists (",
        "select 1 from audit_credits",
        "where organization_id = $1",
        "and credits_purchased > 0",
        ")",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0]?.exists === true;
  }

  private async countExtractions(query: ExtractionListQuery): Promise<number> {
    const params: unknown[] = [query.organizationId];
    const statusFilter = query.status ? "and status = $2" : "";

    if (query.status) {
      params.push(query.status);
    }

    const result = await this.executor.query<{ total: string | number }>(
      [
        "select count(*) as total",
        "from documents",
        "where organization_id = $1",
        "and document_type in ('lease', 'amendment')",
        statusFilter,
      ]
        .filter(Boolean)
        .join(" "),
      params,
    );

    return Number(result.rows[0]?.total ?? 0);
  }
}

function toExtractionListItem(row: ExtractionListRow): ExtractionListItem {
  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
    verifiedAt: row.verifiedAt,
    extractionResult: jsonRecordOrNull(row.extractionResult),
  };
}

function documentRecordSelectColumns(): string {
  return [
    'select id, organization_id as "organizationId",',
    'property_id as "propertyId", filename, storage_key as "storageKey",',
    'content_type as "contentType", file_size_bytes as "fileSizeBytes",',
    'document_type as "documentType", status,',
    'error_message as "errorMessage", created_at as "createdAt",',
    'updated_at as "updatedAt", processed_at as "processedAt"',
  ].join(" ");
}

function toDocumentRecord(row: DocumentRecordRow): DocumentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    filename: row.filename,
    storageKey: row.storageKey,
    contentType: row.contentType,
    fileSizeBytes: Number(row.fileSizeBytes),
    documentType: row.documentType,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    processedAt: row.processedAt,
  };
}

function toExtractionDetail(row: ExtractionDetailRow): ExtractionDetail {
  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    storageBucket: row.storageBucket,
    storageKey: row.storageKey,
    contentType: row.contentType,
    fileSizeBytes: row.fileSizeBytes,
    extractionResult: jsonRecordOrNull(row.extractionResult),
    createdAt: row.createdAt,
    processedAt: row.processedAt,
    verifiedAt: row.verifiedAt,
    verifiedBy: row.verifiedBy,
    propertyId: row.propertyId,
    leaseId: row.leaseId,
    editHistory: jsonArrayOrEmpty(row.editHistory),
  };
}

function ensureLeaseExtractionDocument(document: ExistingDocumentRow): void {
  if (!supportsLeaseExtraction(document.documentType)) {
    throw new InvalidDocumentStateError(
      "Extraction workflow is only available for lease or amendment documents",
    );
  }
}

function ensureReadyForReviewDocument(document: ExistingDocumentRow): void {
  ensureLeaseExtractionDocument(document);
  if (document.status !== "ready_for_review") {
    throw new InvalidDocumentStateError(
      `Document must be READY_FOR_REVIEW. Current status: ${document.status}`,
    );
  }
}

function jsonRecordOrNull(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

function jsonArrayOrEmpty(value: unknown): Record<string, unknown>[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function assertPropertyExists(
  executor: PostgresExecutor,
  propertyId: string,
  organizationId: string,
): Promise<void> {
  const result = await executor.query<{ id: string }>(
    "select id from properties where id = $1 and organization_id = $2",
    [propertyId, organizationId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError("Property");
  }
}

async function assertLeaseExists(
  executor: PostgresExecutor,
  leaseId: string,
  propertyId: string,
  organizationId: string,
): Promise<void> {
  const result = await executor.query<{ id: string }>(
    [
      "select leases.id",
      "from leases",
      "join properties on properties.id = leases.property_id",
      "where leases.id = $1",
      "and leases.property_id = $2",
      "and properties.organization_id = $3",
    ].join(" "),
    [leaseId, propertyId, organizationId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError("Lease");
  }
}

async function getDocumentForUpdate(
  executor: PostgresExecutor,
  documentId: string,
  organizationId: string,
): Promise<ExistingDocumentRow> {
  const result = await executor.query<ExistingDocumentRow>(
    [
      'select id, organization_id as "organizationId",',
      'document_type as "documentType", status, storage_key as "storageKey",',
      'property_id as "propertyId", lease_id as "leaseId",',
      'extraction_result as "extractionResult"',
      "from documents",
      "where id = $1 and organization_id = $2",
      "for update",
    ].join(" "),
    [documentId, organizationId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new NotFoundError("Document");
  }

  return row;
}

async function getExtractionJobForUpdate(
  executor: PostgresExecutor,
  input: { jobId: string; organizationId: string },
): Promise<ExtractionJobRow | null> {
  const result = await executor.query<ExtractionJobRow>(
    [
      'select id, document_id as "documentId",',
      'organization_id as "organizationId", status, priority,',
      'retry_count as "retryCount", error_message as "errorMessage",',
      'result_data as "resultData", created_at as "createdAt",',
      'started_at as "startedAt", completed_at as "completedAt",',
      'next_retry_at as "nextRetryAt"',
      "from extraction_jobs",
      "where id = $1 and organization_id = $2",
      "for update",
    ].join(" "),
    [input.jobId, input.organizationId],
  );

  return result.rows[0] ?? null;
}

function truncateErrorMessage(errorMessage: string): string {
  return errorMessage.slice(0, 2000);
}

function toCount(value: string | number | bigint): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function effectiveSubscriptionStatus(row: SubscriptionEntitlementRow): string {
  if (
    row.status !== "trialing" ||
    row.stripeSubscriptionId ||
    !row.currentPeriodEnd
  ) {
    return row.status;
  }

  const periodEnd =
    row.currentPeriodEnd instanceof Date
      ? row.currentPeriodEnd
      : new Date(row.currentPeriodEnd);

  if (Number.isNaN(periodEnd.getTime())) {
    return row.status;
  }

  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}
