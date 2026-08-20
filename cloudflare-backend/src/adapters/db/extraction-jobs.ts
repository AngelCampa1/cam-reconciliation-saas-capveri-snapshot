import type {
  ExtractionCompletionUpdate,
  ExtractionFailureUpdate,
  ExtractionJobRecord,
  ExtractionJobRepository,
  ExtractionJobStatus,
  ExtractionRetryUpdate,
  JsonObject,
} from "../../domain/extraction/extraction-service";
import type { PostgresExecutor } from "./postgres";

export const DOCUMENT_ERROR_MESSAGE_MAX_LENGTH = 2000;

type ExtractionJobRow = {
  id: string;
  documentId: string;
  organizationId: string;
  status: ExtractionJobStatus;
  priority: number;
  retryCount: number;
  nextRetryAt: string | null;
  resultData: JsonObject | null;
  documentStorageKey: string | null;
};

export class PostgresExtractionJobRepository implements ExtractionJobRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getJob(
    jobId: string,
    organizationId: string,
  ): Promise<ExtractionJobRecord | null> {
    const result = await this.executor.query<ExtractionJobRow>(
      [
        'select jobs.id, jobs.document_id as "documentId",',
        'jobs.organization_id as "organizationId", jobs.status,',
        'jobs.priority, jobs.retry_count as "retryCount",',
        'jobs.next_retry_at as "nextRetryAt",',
        'jobs.result_data as "resultData",',
        'documents.storage_key as "documentStorageKey"',
        "from extraction_jobs jobs",
        "join documents on documents.id = jobs.document_id",
        "and documents.organization_id = jobs.organization_id",
        "where jobs.id = $1",
        "and jobs.organization_id = $2",
      ].join(" "),
      [jobId, organizationId],
    );
    return extractionJobRecordFromRow(result.rows[0]);
  }

  async getLatestJobByDocumentId(
    documentId: string,
    organizationId: string,
  ): Promise<ExtractionJobRecord | null> {
    const result = await this.executor.query<ExtractionJobRow>(
      [
        'select jobs.id, jobs.document_id as "documentId",',
        'jobs.organization_id as "organizationId", jobs.status,',
        'jobs.priority, jobs.retry_count as "retryCount",',
        'jobs.next_retry_at as "nextRetryAt",',
        'jobs.result_data as "resultData",',
        'documents.storage_key as "documentStorageKey"',
        "from extraction_jobs jobs",
        "join documents on documents.id = jobs.document_id",
        "and documents.organization_id = jobs.organization_id",
        "where jobs.document_id = $1",
        "and jobs.organization_id = $2",
        "order by jobs.created_at desc, jobs.id desc",
        "limit 1",
      ].join(" "),
      [documentId, organizationId],
    );

    return extractionJobRecordFromRow(result.rows[0]);
  }

  async markProcessing(
    jobId: string,
    organizationId: string,
    expectedStatus: ExtractionJobStatus,
  ): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update extraction_jobs",
        "set status = 'processing',",
        "started_at = coalesce(started_at, now()),",
        "error_message = null",
        "where id = $1",
        "and organization_id = $2",
        "and (",
        "(status = 'pending' and $3 = 'pending')",
        "or",
        "(status = 'retrying' and $3 = 'retrying' and next_retry_at <= now())",
        ")",
        "returning id",
      ].join(" "),
      [jobId, organizationId, expectedStatus],
    );
    return result.rows.length > 0;
  }

  async markCompleted(
    jobId: string,
    organizationId: string,
    result: ExtractionCompletionUpdate,
  ): Promise<void> {
    await this.executor.transaction(async (executor) => {
      const updated = await executor.query<{ documentId: string }>(
        [
          "update extraction_jobs",
          "set status = 'completed',",
          "result_data = coalesce(result_data, '{}'::jsonb) || $3::jsonb,",
          "completed_at = now(),",
          "next_retry_at = null,",
          "error_message = null",
          "where id = $1",
          "and organization_id = $2",
          "and status in ('processing', 'retrying')",
          'returning document_id as "documentId"',
        ].join(" "),
        [jobId, organizationId, buildCompletionResultData(result)],
      );

      const documentId = updated.rows[0]?.documentId;
      if (!documentId) {
        return;
      }

      // Only flip the document and write its extraction_result when the pipeline
      // produced a payload. A completion without one (e.g. a non-pipeline
      // fallback path) must not clobber a previously stored extraction_result
      // with an empty object — this mirrors the Python worker, which writes the
      // document row only when there is a result to persist.
      if (result.documentExtractionResult === undefined) {
        return;
      }

      await executor.query(
        [
          "update documents",
          "set status = 'ready_for_review',",
          "reader_job_id = $2,",
          "extraction_result = $3::jsonb,",
          "processed_at = now(),",
          "updated_at = now()",
          "where id = $1",
          "and organization_id = $4",
        ].join(" "),
        // postgres.js JSON-encodes a plain object exactly once for a jsonb bind
        // param; do NOT pre-stringify or it double-encodes into a jsonb string
        // scalar. (Verified via live E2E: raw object -> structured jsonb;
        // JSON.stringify(...) -> jsonb "string".)
        [
          documentId,
          result.readerJobId,
          result.documentExtractionResult,
          organizationId,
        ],
      );
    });
  }

  async markRetrying(
    jobId: string,
    organizationId: string,
    update: ExtractionRetryUpdate,
  ): Promise<void> {
    await this.executor.query(
      [
        "update extraction_jobs",
        "set status = 'retrying',",
        "retry_count = $2,",
        "next_retry_at = $3::timestamptz,",
        "error_message = $4",
        "where id = $1",
        "and organization_id = $5",
        "and status in ('processing', 'retrying')",
      ].join(" "),
      [
        jobId,
        update.retryCount,
        update.nextRetryAt,
        truncateDocumentErrorMessage(update.errorMessage),
        organizationId,
      ],
    );
  }

  async markFailed(
    jobId: string,
    organizationId: string,
    update: ExtractionFailureUpdate,
  ): Promise<void> {
    await this.executor.query(
      [
        "update extraction_jobs",
        "set status = 'failed',",
        "error_message = $2,",
        "completed_at = now(),",
        "next_retry_at = null",
        "where id = $1",
        "and organization_id = $3",
        "and status in ('pending', 'processing', 'retrying')",
      ].join(" "),
      [
        jobId,
        truncateDocumentErrorMessage(update.errorMessage),
        organizationId,
      ],
    );
  }

  async markDocumentFailed(
    documentId: string,
    organizationId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.executor.query(
      [
        "update documents",
        "set status = 'failed',",
        "error_message = $2,",
        "updated_at = now()",
        "where id = $1",
        "and organization_id = $3",
      ].join(" "),
      [documentId, truncateDocumentErrorMessage(errorMessage), organizationId],
    );
  }

  async markJobAndDocumentFailed(
    jobId: string,
    documentId: string,
    organizationId: string,
    errorMessage: string,
  ): Promise<void> {
    // Single transaction so the job and its document fail together (or not at
    // all). Mirrors markCompleted: the job update keeps its status guard
    // (no-op on an already-terminal job), and the document update only runs if
    // that guarded job update matched a retryable job.
    const truncatedError = truncateDocumentErrorMessage(errorMessage);
    await this.executor.transaction(async (executor) => {
      const jobResult = await executor.query<{ id: string }>(
        [
          "update extraction_jobs",
          "set status = 'failed',",
          "error_message = $2,",
          "completed_at = now(),",
          "next_retry_at = null",
          "where id = $1",
          "and organization_id = $3",
          "and status in ('pending', 'processing', 'retrying')",
          "returning id",
        ].join(" "),
        [jobId, truncatedError, organizationId],
      );
      if (jobResult.rows.length === 0) {
        return;
      }

      await executor.query(
        [
          "update documents",
          "set status = 'failed',",
          "error_message = $2,",
          "updated_at = now()",
          "where id = $1",
          "and organization_id = $3",
        ].join(" "),
        [documentId, truncatedError, organizationId],
      );
    });
  }
}

function extractionJobRecordFromRow(
  row: ExtractionJobRow | undefined,
): ExtractionJobRecord | null {
  if (!row || !row.documentStorageKey) {
    return null;
  }

  const job: ExtractionJobRecord = {
    id: row.id,
    documentId: row.documentId,
    organizationId: row.organizationId,
    status: row.status,
    priority: row.priority,
    retryCount: row.retryCount,
    documentStorageKey: row.documentStorageKey,
  };
  if (row.resultData !== null) {
    job.resultData = row.resultData;
  }
  if (row.nextRetryAt !== null && row.nextRetryAt !== undefined) {
    job.nextRetryAt = new Date(row.nextRetryAt).toISOString();
  }

  return job;
}

export function truncateDocumentErrorMessage(errorMessage: string): string {
  return errorMessage.slice(0, DOCUMENT_ERROR_MESSAGE_MAX_LENGTH);
}

export function buildCompletionResultData(
  result: ExtractionCompletionUpdate,
): JsonObject {
  return {
    ...(result.resultData ?? {}),
    tokens_used: result.tokensUsed,
    fields: result.fields,
  };
}
