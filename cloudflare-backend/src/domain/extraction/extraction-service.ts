import type { ExtractionQueueMessage } from "../../queues/messages";

export const MAX_EXTRACTION_RETRIES = 3;
export const BASE_EXTRACTION_RETRY_DELAY_SECONDS = 60;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type ExtractionJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export type ExtractionJobRecord = {
  id: string;
  documentId: string;
  organizationId: string;
  status: ExtractionJobStatus;
  priority: number;
  retryCount: number;
  nextRetryAt?: string;
  documentStorageKey: string;
  resultData?: JsonObject;
};

export type ExtractionPipelineInput = {
  jobId: string;
  documentId: string;
  organizationId: string;
  documentStorageKey: string;
};

export type ExtractionPipelineResult = {
  tokensUsed: number;
  extractedFieldNames: string[];
  resultData?: JsonObject;
  documentExtractionResult?: JsonObject;
};

export type ExtractionJobRepository = {
  getJob(
    jobId: string,
    organizationId: string,
  ): Promise<ExtractionJobRecord | null>;
  getLatestJobByDocumentId(
    documentId: string,
    organizationId: string,
  ): Promise<ExtractionJobRecord | null>;
  markProcessing(
    jobId: string,
    organizationId: string,
    expectedStatus: ExtractionJobStatus,
  ): Promise<boolean>;
  markCompleted(
    jobId: string,
    organizationId: string,
    result: ExtractionCompletionUpdate,
  ): Promise<void>;
  markRetrying(
    jobId: string,
    organizationId: string,
    update: ExtractionRetryUpdate,
  ): Promise<void>;
  markFailed(
    jobId: string,
    organizationId: string,
    update: ExtractionFailureUpdate,
  ): Promise<void>;
  markDocumentFailed(
    documentId: string,
    organizationId: string,
    errorMessage: string,
  ): Promise<void>;
  // Atomically fail both the job and its document in one transaction. Mirrors
  // markCompleted's two-table write so a failure cannot leave the job 'failed'
  // while the document is stranded in 'processing' (which would block re-queue,
  // since queueExtraction only accepts pending/failed documents).
  markJobAndDocumentFailed(
    jobId: string,
    documentId: string,
    organizationId: string,
    errorMessage: string,
  ): Promise<void>;
};

export type ExtractionPipeline = {
  run(input: ExtractionPipelineInput): Promise<ExtractionPipelineResult>;
};

export type ExtractionCompletionUpdate = {
  tokensUsed: number;
  fields: string[];
  resultData?: JsonObject;
  documentExtractionResult?: JsonObject;
  readerJobId: string;
};

export type ExtractionRetryUpdate = {
  retryCount: number;
  nextRetryAt: string;
  errorMessage: string;
  delaySeconds: number;
};

export type ExtractionFailureUpdate = {
  errorMessage: string;
};

export type ExtractionServiceDependencies = {
  repository: ExtractionJobRepository;
  pipeline: ExtractionPipeline;
  clock?: () => Date;
};

export class ExtractionTransientError extends Error {
  override readonly name = "ExtractionTransientError";
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.originalError = originalError;
  }
}

export class ExtractionRetryScheduledError extends Error {
  override readonly name = "ExtractionRetryScheduledError";
  readonly originalError?: unknown;

  constructor(
    message: string,
    readonly delaySeconds: number,
    originalError?: unknown,
  ) {
    super(message);
    this.originalError = originalError;
  }
}

export function isTerminalExtractionStatus(
  status: ExtractionJobStatus,
): boolean {
  return status === "completed" || status === "failed";
}

export function getExtractionAttemptNumber(rawAttempts?: number): number {
  if (
    typeof rawAttempts !== "number" ||
    !Number.isInteger(rawAttempts) ||
    rawAttempts < 1
  ) {
    return 1;
  }

  return rawAttempts;
}

export function calculateExtractionRetryDelaySeconds(
  attemptNumber: number,
): number {
  const retriesAlreadyMade = Math.max(0, attemptNumber - 1);
  return BASE_EXTRACTION_RETRY_DELAY_SECONDS * 2 ** retriesAlreadyMade;
}

export function calculateNextRetryAt(now: Date, delaySeconds: number): string {
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

function calculateRetryClaimMissDelaySeconds(
  job: ExtractionJobRecord,
  now: Date,
): number {
  if (!job.nextRetryAt) {
    return BASE_EXTRACTION_RETRY_DELAY_SECONDS;
  }

  const retryAtTime = new Date(job.nextRetryAt).getTime();
  if (!Number.isFinite(retryAtTime)) {
    return BASE_EXTRACTION_RETRY_DELAY_SECONDS;
  }

  return Math.max(1, Math.ceil((retryAtTime - now.getTime()) / 1000));
}

export async function processExtractionQueueMessage(
  message: ExtractionQueueMessage,
  rawAttempts: number | undefined,
  dependencies: ExtractionServiceDependencies,
): Promise<void> {
  const job =
    (await dependencies.repository.getJob(
      message.jobId,
      message.organizationId,
    )) ??
    (await dependencies.repository.getLatestJobByDocumentId(
      message.documentId,
      message.organizationId,
    ));

  if (!job) {
    throw new ExtractionTransientError(
      `Extraction job not found: ${message.jobId}`,
    );
  }

  if (isTerminalExtractionStatus(job.status)) {
    return;
  }

  if (
    job.documentId !== message.documentId ||
    job.organizationId !== message.organizationId
  ) {
    return;
  }

  const attemptNumber = getExtractionAttemptNumber(rawAttempts);
  const claimed = await dependencies.repository.markProcessing(
    job.id,
    job.organizationId,
    job.status,
  );
  if (!claimed) {
    if (job.status === "retrying") {
      const now = dependencies.clock ? dependencies.clock() : new Date();
      const delaySeconds = calculateRetryClaimMissDelaySeconds(job, now);
      throw new ExtractionRetryScheduledError(
        "Extraction retry is not due yet",
        delaySeconds,
      );
    }
    return;
  }

  try {
    const result = await dependencies.pipeline.run({
      jobId: job.id,
      documentId: job.documentId,
      organizationId: job.organizationId,
      documentStorageKey: job.documentStorageKey,
    });

    const completionUpdate: ExtractionCompletionUpdate = {
      tokensUsed: result.tokensUsed,
      fields: result.extractedFieldNames,
      readerJobId: job.id,
    };
    if (result.resultData !== undefined) {
      completionUpdate.resultData = result.resultData;
    }
    if (result.documentExtractionResult !== undefined) {
      completionUpdate.documentExtractionResult =
        result.documentExtractionResult;
    }

    await dependencies.repository.markCompleted(
      job.id,
      job.organizationId,
      completionUpdate,
    );
  } catch (error) {
    if (
      error instanceof ExtractionTransientError &&
      attemptNumber <= MAX_EXTRACTION_RETRIES
    ) {
      const delaySeconds = calculateExtractionRetryDelaySeconds(attemptNumber);
      const now = dependencies.clock ? dependencies.clock() : new Date();

      await dependencies.repository.markRetrying(job.id, job.organizationId, {
        retryCount: attemptNumber,
        nextRetryAt: calculateNextRetryAt(now, delaySeconds),
        errorMessage: error.message,
        delaySeconds,
      });

      throw new ExtractionRetryScheduledError(
        error.message,
        delaySeconds,
        error,
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Extraction pipeline failed";
    await dependencies.repository.markJobAndDocumentFailed(
      job.id,
      job.documentId,
      job.organizationId,
      errorMessage,
    );

    if (error instanceof ExtractionTransientError) {
      throw error;
    }
  }
}
