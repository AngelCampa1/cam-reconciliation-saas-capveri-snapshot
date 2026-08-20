import { describe, expect, it, vi } from "vitest";
import {
  GAP_FILLER_PROMPTS,
  OpenRouterExtractionGapFiller,
  parseGapFillJson,
} from "../adapters/ai/extraction-gap-filler";
import {
  OpenRouterValidationReprompter,
  buildValidationReprompt,
  parseValidationRepromptJson,
} from "../adapters/ai/validation-reprompt";
import {
  JUDGE_SYSTEM_PROMPT,
  MAX_JUDGE_EXTRACTION_JSON_CHARS,
  MAX_JUDGE_USER_MESSAGE_CHARS,
  OpenRouterExtractionJudge,
  buildJudgeUserMessage,
  parseJudgeResponse,
} from "../adapters/ai/extraction-judge";
import {
  LEASE_NATIVE_PDF_EXTRACTION_PROMPT,
  MAX_NATIVE_PDF_EXTRACTION_BYTES,
  OpenRouterNativePdfExtractionPipeline,
  buildDocumentExtractionResult,
  buildPipelineResultData,
  filenameFromStorageKey,
  parseExtractionJson,
} from "../adapters/ai/native-pdf-extraction-pipeline";
import {
  DEFAULT_EXTRACTION_SYSTEM_PROMPT,
  DEFAULT_OPENROUTER_PROVIDER_CONFIG,
  DOCUMENT_TRUNCATION_NOTICE,
  OpenRouterApiError,
  OpenRouterClient,
  buildDocumentTextContent,
  buildOpenRouterPayload,
  bytesToBase64,
  createOpenRouterClient,
  parseOpenRouterResponse,
  truncateDocument,
} from "../adapters/ai/openrouter";
import type { AppEnv } from "../env";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import {
  ExtractionRetryScheduledError,
  ExtractionTransientError,
  processExtractionQueueMessage,
  type ExtractionCompletionUpdate,
  type ExtractionFailureUpdate,
  type ExtractionJobRecord,
  type ExtractionJobRepository,
  type ExtractionPipeline,
  type ExtractionPipelineInput,
  type ExtractionRetryUpdate,
} from "../domain/extraction/extraction-service";
import {
  consumeQueueMessage,
  type QueueConsumerMessage,
} from "../queues/consumers";
import type { ExtractionQueueMessage } from "../queues/messages";
import { createLeaseExtractionQueueHandlers } from "../workflows/lease-extraction";

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

const orgId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";

const queueMessage: ExtractionQueueMessage = {
  version: 1,
  jobId,
  documentId,
  organizationId: orgId,
  priority: 5,
};

type RepositoryCall =
  | { method: "getJob"; jobId: string; organizationId: string }
  | {
      method: "getLatestJobByDocumentId";
      documentId: string;
      organizationId: string;
    }
  | {
      method: "markProcessing";
      jobId: string;
      organizationId: string;
      expectedStatus: ExtractionJobRecord["status"];
    }
  | {
      method: "markCompleted";
      jobId: string;
      organizationId: string;
      update: ExtractionCompletionUpdate;
    }
  | {
      method: "markRetrying";
      jobId: string;
      organizationId: string;
      update: ExtractionRetryUpdate;
    }
  | {
      method: "markFailed";
      jobId: string;
      organizationId: string;
      update: ExtractionFailureUpdate;
    }
  | {
      method: "markDocumentFailed";
      documentId: string;
      organizationId: string;
      errorMessage: string;
    }
  | {
      method: "markJobAndDocumentFailed";
      jobId: string;
      documentId: string;
      organizationId: string;
      errorMessage: string;
    };

function createJob(
  overrides: Partial<ExtractionJobRecord> = {},
): ExtractionJobRecord {
  return {
    id: jobId,
    documentId,
    organizationId: orgId,
    status: "pending",
    priority: 5,
    retryCount: 0,
    documentStorageKey: "documents/org/property/lease.pdf",
    ...overrides,
  };
}

function createRepository(
  job: ExtractionJobRecord | null,
  fallbackJob: ExtractionJobRecord | null = null,
  markProcessingResult = true,
): {
  repository: ExtractionJobRepository;
  calls: RepositoryCall[];
} {
  const calls: RepositoryCall[] = [];
  return {
    calls,
    repository: {
      async getJob(requestedJobId, requestedOrganizationId) {
        calls.push({
          method: "getJob",
          jobId: requestedJobId,
          organizationId: requestedOrganizationId,
        });
        return job;
      },
      async getLatestJobByDocumentId(
        requestedDocumentId,
        requestedOrganizationId,
      ) {
        calls.push({
          method: "getLatestJobByDocumentId",
          documentId: requestedDocumentId,
          organizationId: requestedOrganizationId,
        });
        return fallbackJob;
      },
      async markProcessing(
        processingJobId,
        processingOrganizationId,
        expectedStatus,
      ) {
        calls.push({
          method: "markProcessing",
          jobId: processingJobId,
          organizationId: processingOrganizationId,
          expectedStatus,
        });
        return markProcessingResult;
      },
      async markCompleted(completedJobId, completedOrganizationId, update) {
        calls.push({
          method: "markCompleted",
          jobId: completedJobId,
          organizationId: completedOrganizationId,
          update,
        });
      },
      async markRetrying(retryingJobId, retryingOrganizationId, update) {
        calls.push({
          method: "markRetrying",
          jobId: retryingJobId,
          organizationId: retryingOrganizationId,
          update,
        });
      },
      async markFailed(failedJobId, failedOrganizationId, update) {
        calls.push({
          method: "markFailed",
          jobId: failedJobId,
          organizationId: failedOrganizationId,
          update,
        });
      },
      async markDocumentFailed(
        failedDocumentId,
        failedOrganizationId,
        errorMessage,
      ) {
        calls.push({
          method: "markDocumentFailed",
          documentId: failedDocumentId,
          organizationId: failedOrganizationId,
          errorMessage,
        });
      },
      async markJobAndDocumentFailed(
        failedJobId,
        failedDocumentId,
        failedOrganizationId,
        errorMessage,
      ) {
        calls.push({
          method: "markJobAndDocumentFailed",
          jobId: failedJobId,
          documentId: failedDocumentId,
          organizationId: failedOrganizationId,
          errorMessage,
        });
      },
    },
  };
}

function createFakeQueueMessage(
  body: unknown,
  attempts?: number,
): QueueConsumerMessage & {
  acked: boolean;
  retried: boolean;
  retryOptions?: QueueRetryOptions;
} {
  const base: QueueConsumerMessage & {
    acked: boolean;
    retried: boolean;
    retryOptions?: QueueRetryOptions;
  } = {
    body,
    acked: false,
    retried: false,
    ack() {
      this.acked = true;
    },
    retry(options?: QueueRetryOptions) {
      this.retried = true;
      if (options !== undefined) {
        this.retryOptions = options;
      }
    },
  };

  if (attempts === undefined) {
    return base;
  }

  return {
    ...base,
    attempts,
  };
}

describe("lease extraction workflow", () => {
  it("marks a pending job processing and completed after pipeline success", async () => {
    const { repository, calls } = createRepository(createJob());
    const pipelineInputs: ExtractionPipelineInput[] = [];
    const pipeline: ExtractionPipeline = {
      async run(input) {
        pipelineInputs.push(input);
        return {
          tokensUsed: 321,
          extractedFieldNames: ["tenant_name", "pro_rata_share"],
          resultData: { pipeline: "dual-extract" },
        };
      },
    };

    await processExtractionQueueMessage(queueMessage, 1, {
      repository,
      pipeline,
    });

    expect(pipelineInputs).toEqual([
      {
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "documents/org/property/lease.pdf",
      },
    ]);
    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId,
        organizationId: orgId,
        expectedStatus: "pending",
      },
      {
        method: "markCompleted",
        jobId,
        organizationId: orgId,
        update: {
          tokensUsed: 321,
          fields: ["tenant_name", "pro_rata_share"],
          resultData: { pipeline: "dual-extract" },
          readerJobId: jobId,
        },
      },
    ]);
  });

  it("does not mutate a job when queued context mismatches", async () => {
    const jobDocumentId = "55555555-5555-4555-8555-555555555555";
    const { repository, calls } = createRepository(
      createJob({
        documentId: jobDocumentId,
        organizationId: "44444444-4444-4444-8444-444444444444",
      }),
    );
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await processExtractionQueueMessage(queueMessage, 1, {
      repository,
      pipeline,
    });

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([{ method: "getJob", jobId, organizationId: orgId }]);
  });

  it("falls back to the latest document job when the queued job id is stale", async () => {
    const fallbackJobId = "55555555-5555-4555-8555-555555555555";
    const { repository, calls } = createRepository(
      null,
      createJob({ id: fallbackJobId }),
    );
    const pipelineInputs: ExtractionPipelineInput[] = [];
    const pipeline: ExtractionPipeline = {
      async run(input) {
        pipelineInputs.push(input);
        return {
          tokensUsed: 111,
          extractedFieldNames: ["tenant_name"],
        };
      },
    };

    await processExtractionQueueMessage(queueMessage, 1, {
      repository,
      pipeline,
    });

    expect(pipelineInputs).toEqual([
      {
        jobId: fallbackJobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "documents/org/property/lease.pdf",
      },
    ]);
    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      { method: "getLatestJobByDocumentId", documentId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId: fallbackJobId,
        organizationId: orgId,
        expectedStatus: "pending",
      },
      {
        method: "markCompleted",
        jobId: fallbackJobId,
        organizationId: orgId,
        update: {
          tokensUsed: 111,
          fields: ["tenant_name"],
          readerJobId: fallbackJobId,
        },
      },
    ]);
  });

  it("does not mutate a fallback job when organization context mismatches", async () => {
    const fallbackJobId = "55555555-5555-4555-8555-555555555555";
    const { repository, calls } = createRepository(
      null,
      createJob({
        id: fallbackJobId,
        organizationId: "44444444-4444-4444-8444-444444444444",
      }),
    );
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await processExtractionQueueMessage(queueMessage, 1, {
      repository,
      pipeline,
    });

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      { method: "getLatestJobByDocumentId", documentId, organizationId: orgId },
    ]);
  });

  it("acknowledges terminal jobs idempotently", async () => {
    const { repository, calls } = createRepository(
      createJob({ status: "completed" }),
    );
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await processExtractionQueueMessage(queueMessage, 1, {
      repository,
      pipeline,
    });

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([{ method: "getJob", jobId, organizationId: orgId }]);
  });

  it("acknowledges terminal jobs before stale queued context can fail documents", async () => {
    const { repository, calls } = createRepository(
      createJob({
        status: "completed",
        documentId: "55555555-5555-4555-8555-555555555555",
        organizationId: "44444444-4444-4444-8444-444444444444",
      }),
    );
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await processExtractionQueueMessage(queueMessage, 1, {
      repository,
      pipeline,
    });

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([{ method: "getJob", jobId, organizationId: orgId }]);
  });

  it("does not rerun the pipeline when a processing job redelivery loses the claim", async () => {
    const { repository, calls } = createRepository(
      createJob({ status: "processing" }),
      null,
      false,
    );
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await processExtractionQueueMessage(queueMessage, 2, {
      repository,
      pipeline,
    });

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId,
        organizationId: orgId,
        expectedStatus: "processing",
      },
    ]);
  });

  it("reschedules the queue message when a retrying job claim misses before backoff is due", async () => {
    const { repository, calls } = createRepository(
      createJob({
        status: "retrying",
        retryCount: 1,
        nextRetryAt: "2026-06-12T12:02:00.000Z",
      }),
      null,
      false,
    );
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await expect(
      processExtractionQueueMessage(queueMessage, 2, {
        repository,
        pipeline,
        clock: () => new Date("2026-06-12T12:00:30.000Z"),
      }),
    ).rejects.toMatchObject({
      delaySeconds: 90,
    });

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId,
        organizationId: orgId,
        expectedStatus: "retrying",
      },
    ]);
  });

  it("requests queue retry instead of ack when a retrying job claim misses before backoff is due", async () => {
    const { repository } = createRepository(
      createJob({
        status: "retrying",
        retryCount: 1,
        nextRetryAt: "2026-06-12T12:02:00.000Z",
      }),
      null,
      false,
    );
    const rawMessage = createFakeQueueMessage(queueMessage, 2);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        run: vi.fn(),
      },
      clock: () => new Date("2026-06-12T12:00:30.000Z"),
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      handler,
      {
        env: {} as AppEnv,
        executionContext: {} as ExecutionContext,
        queue: "capveri-extraction-dev",
        metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
      },
      () => {
        throw new Error("message is valid");
      },
    );

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toEqual({ delaySeconds: 90 });
  });

  it("requests queue retry instead of ack when a retrying job has no retry timestamp", async () => {
    const { repository } = createRepository(
      createJob({ status: "retrying", retryCount: 1 }),
      null,
      false,
    );
    const rawMessage = createFakeQueueMessage(queueMessage, 2);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        run: vi.fn(),
      },
      clock: () => new Date("2026-06-12T12:00:30.000Z"),
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      handler,
      {
        env: {} as AppEnv,
        executionContext: {} as ExecutionContext,
        queue: "capveri-extraction-dev",
        metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
      },
      () => {
        throw new Error("message is valid");
      },
    );

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toEqual({ delaySeconds: 60 });
  });

  it("marks transient failures retrying and throws so the queue retries", async () => {
    const { repository, calls } = createRepository(createJob());
    const pipeline: ExtractionPipeline = {
      async run() {
        throw new ExtractionTransientError("OpenRouter rate limited");
      },
    };

    await expect(
      processExtractionQueueMessage(queueMessage, 2, {
        repository,
        pipeline,
        clock: () => new Date("2026-06-12T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(ExtractionRetryScheduledError);

    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId,
        organizationId: orgId,
        expectedStatus: "pending",
      },
      {
        method: "markRetrying",
        jobId,
        organizationId: orgId,
        update: {
          retryCount: 2,
          nextRetryAt: "2026-06-12T12:02:00.000Z",
          errorMessage: "OpenRouter rate limited",
          delaySeconds: 120,
        },
      },
    ]);
  });

  it("marks the document failed after the max transient retry attempt", async () => {
    const { repository, calls } = createRepository(createJob());
    const pipeline: ExtractionPipeline = {
      async run() {
        throw new ExtractionTransientError("R2 read failed");
      },
    };

    await expect(
      processExtractionQueueMessage(queueMessage, 4, {
        repository,
        pipeline,
      }),
    ).rejects.toBeInstanceOf(ExtractionTransientError);

    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId,
        organizationId: orgId,
        expectedStatus: "pending",
      },
      {
        method: "markJobAndDocumentFailed",
        jobId,
        documentId,
        organizationId: orgId,
        errorMessage: "R2 read failed",
      },
    ]);
  });

  it("marks permanent pipeline failures failed without throwing for queue retry", async () => {
    const { repository, calls } = createRepository(createJob());
    const pipeline: ExtractionPipeline = {
      async run() {
        throw new Error("Invalid extraction payload");
      },
    };

    await expect(
      processExtractionQueueMessage(queueMessage, 1, {
        repository,
        pipeline,
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      {
        method: "markProcessing",
        jobId,
        organizationId: orgId,
        expectedStatus: "pending",
      },
      {
        method: "markJobAndDocumentFailed",
        jobId,
        documentId,
        organizationId: orgId,
        errorMessage: "Invalid extraction payload",
      },
    ]);
  });

  it("treats missing jobs after fallback as transient queue failures", async () => {
    const { repository, calls } = createRepository(null);
    const pipeline: ExtractionPipeline = {
      run: vi.fn(),
    };

    await expect(
      processExtractionQueueMessage(queueMessage, 1, {
        repository,
        pipeline,
      }),
    ).rejects.toBeInstanceOf(ExtractionTransientError);

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(calls).toEqual([
      { method: "getJob", jobId, organizationId: orgId },
      { method: "getLatestJobByDocumentId", documentId, organizationId: orgId },
    ]);
  });

  it("requests queue retry instead of ack when the job is missing after fallback", async () => {
    const { repository } = createRepository(null);
    const rawMessage = createFakeQueueMessage(queueMessage, 1);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        run: vi.fn(),
      },
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      handler,
      {
        env: {} as AppEnv,
        executionContext: {} as ExecutionContext,
        queue: "capveri-extraction-dev",
        metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
      },
      () => {
        throw new Error("message is valid");
      },
    );

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toBeUndefined();
  });

  it("integrates with the queue consumer retry path for scheduled retries", async () => {
    const { repository } = createRepository(createJob());
    const rawMessage = createFakeQueueMessage(queueMessage, 1);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        async run() {
          throw new ExtractionTransientError("Postgres unavailable");
        },
      },
      clock: () => new Date("2026-06-12T12:00:00.000Z"),
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      handler,
      {
        env: {} as AppEnv,
        executionContext: {} as ExecutionContext,
        queue: "capveri-extraction-dev",
        metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
      },
      () => {
        throw new Error("message is valid");
      },
    );

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toEqual({ delaySeconds: 60 });
  });

  it("preserves scheduled retry delay options on later transient attempts", async () => {
    const { repository } = createRepository(createJob());
    const rawMessage = createFakeQueueMessage(queueMessage, 2);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        async run() {
          throw new ExtractionTransientError("OpenRouter unavailable");
        },
      },
      clock: () => new Date("2026-06-12T12:00:00.000Z"),
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      handler,
      {
        env: {} as AppEnv,
        executionContext: {} as ExecutionContext,
        queue: "capveri-extraction-dev",
        metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
      },
      () => {
        throw new Error("message is valid");
      },
    );

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toEqual({ delaySeconds: 120 });
  });

  it("schedules best-effort exception telemetry without blocking the retry", async () => {
    const { repository } = createRepository(createJob());
    const rawMessage = createFakeQueueMessage(queueMessage, 2);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        async run() {
          throw new ExtractionTransientError("OpenRouter unavailable");
        },
      },
      clock: () => new Date("2026-06-12T12:00:00.000Z"),
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    const waitUntil = vi.fn();

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      handler,
      {
        env: {} as AppEnv,
        executionContext: { waitUntil } as unknown as ExecutionContext,
        queue: "capveri-extraction-dev",
        metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
      },
      () => {
        throw new Error("message is valid");
      },
    );

    // Exception telemetry is scheduled on the execution context (best-effort)...
    expect(waitUntil).toHaveBeenCalledTimes(1);
    // ...and the critical retry still happens with the scheduled delay.
    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toEqual({ delaySeconds: 120 });
  });

  it("still retries the job when best-effort telemetry throws", async () => {
    const { repository } = createRepository(createJob());
    const rawMessage = createFakeQueueMessage(queueMessage, 2);
    const handlers = createLeaseExtractionQueueHandlers({
      repository,
      pipeline: {
        async run() {
          throw new ExtractionTransientError("OpenRouter unavailable");
        },
      },
      clock: () => new Date("2026-06-12T12:00:00.000Z"),
    });
    const handler = handlers.extraction;
    if (!handler) {
      throw new Error("extraction handler was not registered");
    }

    const waitUntil = vi.fn(() => {
      throw new Error("execution context is torn down");
    });

    // A throwing waitUntil must NOT propagate out of the consumer (which would
    // abort the rest of the batch) nor skip the retry.
    await expect(
      consumeQueueMessage(
        "extraction",
        rawMessage,
        handler,
        {
          env: {} as AppEnv,
          executionContext: { waitUntil } as unknown as ExecutionContext,
          queue: "capveri-extraction-dev",
          metadata: { metrics: { backlogBytes: 0, backlogCount: 1 } },
        },
        () => {
          throw new Error("message is valid");
        },
      ),
    ).resolves.toBeUndefined();

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(rawMessage.retryOptions).toEqual({ delaySeconds: 120 });
  });
});

describe("OpenRouter adapter boundary", () => {
  it("builds OpenRouter payloads with fallback models and provider routing", () => {
    expect(
      buildOpenRouterPayload({
        model: "z-ai/glm-5.1",
        temperature: 0,
        messages: [{ role: "user", content: "judge this" }],
        fallbackModels: ["openai/gpt-5.4-mini"],
        provider: { sort: "latency", only: ["openai"] },
      }),
    ).toEqual({
      model: "z-ai/glm-5.1",
      temperature: 0,
      messages: [{ role: "user", content: "judge this" }],
      provider: { sort: "latency", only: ["openai"] },
      models: ["z-ai/glm-5.1", "openai/gpt-5.4-mini"],
    });
  });

  it("parses token usage and strips thinking tags", () => {
    expect(
      parseOpenRouterResponse({
        choices: [
          {
            message: {
              content: '<think>private chain</think>\n{"ok":true}',
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
        model: "z-ai/glm-5.1",
      }),
    ).toEqual({
      content: '{"ok":true}',
      tokensUsed: 14,
      model: "z-ai/glm-5.1",
    });
  });

  it("rejects malformed OpenRouter success responses", () => {
    expect(() => parseOpenRouterResponse({ choices: [] })).toThrow(
      OpenRouterApiError,
    );
    expect(() =>
      parseOpenRouterResponse({
        choices: [{ message: { content: "" } }],
      }),
    ).toThrow(OpenRouterApiError);
    expect(() =>
      parseOpenRouterResponse({
        choices: [{ message: { content: "   " } }],
      }),
    ).toThrow(OpenRouterApiError);
    expect(() =>
      parseOpenRouterResponse({
        choices: [{ message: { content: "<think>private</think>" } }],
      }),
    ).toThrow(OpenRouterApiError);
  });

  it("wraps text extraction with prompt-delimited document text", async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({
        choices: [{ message: { content: '{"tenant":"Acme"}' } }],
        usage: { total_tokens: 42 },
        model: "z-ai/glm-5.1",
      });
    };
    const client = new OpenRouterClient(
      "test-key",
      fetcher,
      "https://openrouter.test/api/v1",
      "https://www.capveri.com",
    );

    await expect(
      client.extractText({
        prompt: "Extract CAM fields.",
        documentText: "abcdefghijklmnopqrstuvwxyz",
        maxDocumentChars: 6,
        model: "z-ai/glm-5.1",
        fallbackModels: ["openai/gpt-5.4-mini"],
      }),
    ).resolves.toEqual({
      content: '{"tenant":"Acme"}',
      tokensUsed: 42,
      model: "z-ai/glm-5.1",
    });

    expect(requests).toHaveLength(1);
    await expect(requests[0]?.json()).resolves.toMatchObject({
      model: "z-ai/glm-5.1",
      temperature: 0,
      messages: [
        { role: "system", content: DEFAULT_EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract CAM fields.\n\n<document_text>\nabcdef\n\n${DOCUMENT_TRUNCATION_NOTICE}\n</document_text>`,
        },
      ],
      provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
      response_format: { type: "json_object" },
      models: ["z-ai/glm-5.1", "openai/gpt-5.4-mini"],
    });
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer test-key");
    expect(requests[0]?.headers.get("HTTP-Referer")).toBe(
      "https://www.capveri.com",
    );
    expect(requests[0]?.signal.aborted).toBe(false);
  });

  it("invokes the fetcher without binding `this` to the client", async () => {
    // Regression: the Workers runtime's global `fetch` throws
    // "Illegal invocation" when called as a method (`this.fetcher(...)`), which
    // bound `this` to the OpenRouterClient instance and broke every queue-driven
    // extraction in production. A non-arrow fetcher records its `this` so we can
    // assert the call is `this`-free. (Arrow fetchers — used by the other tests —
    // ignore `this`, so they could never catch this.)
    const seenThis: unknown[] = [];
    const fetcher = function (this: unknown): Promise<Response> {
      seenThis.push(this);
      return Promise.resolve(
        Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { total_tokens: 1 },
        }),
      );
    } as unknown as typeof fetch;
    const client = new OpenRouterClient("test-key", fetcher);

    await expect(
      client.requestJson({ content: "judge this", model: "z-ai/glm-5.1" }),
    ).resolves.toMatchObject({ content: '{"ok":true}' });

    expect(seenThis).toEqual([undefined]);
  });

  it("wraps PDF extraction with a native OpenRouter file data URL", async () => {
    const requestBodies: unknown[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        choices: [{ message: { content: '{"lease":"ok"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
        model: "google/gemini-3-flash-preview",
      });
    };
    const client = new OpenRouterClient("test-key", fetcher);

    await expect(
      client.extractPdf({
        prompt: "Extract from this PDF.",
        pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        filename: "lease.pdf",
        model: "google/gemini-3-flash-preview",
      }),
    ).resolves.toEqual({
      content: '{"lease":"ok"}',
      tokensUsed: 25,
      model: "google/gemini-3-flash-preview",
    });

    expect(requestBodies).toEqual([
      {
        model: "google/gemini-3-flash-preview",
        temperature: 0,
        messages: [
          { role: "system", content: DEFAULT_EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract from this PDF." },
              {
                type: "file",
                file: {
                  filename: "lease.pdf",
                  file_data: "data:application/pdf;base64,JVBERg==",
                },
              },
            ],
          },
        ],
        provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
        response_format: { type: "json_object" },
      },
    ]);
  });

  it("uses Workers-compatible base64 and text helper boundaries", () => {
    expect(bytesToBase64(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe(
      "AAEC/f7/",
    );
    expect(buildDocumentTextContent("Prompt", "abcdef", 3)).toBe(
      `Prompt\n\n<document_text>\nabc\n\n${DOCUMENT_TRUNCATION_NOTICE}\n</document_text>`,
    );
    expect(buildDocumentTextContent("Prompt", "abcdef", -1)).toContain(
      "abcdef",
    );
  });

  it("truncates text extraction input at page boundaries like the Python backend", () => {
    const longDocument = `${"a".repeat(85)}--- PAGE 2\n${"b".repeat(40)}`;

    expect(truncateDocument(longDocument, 100)).toBe(
      `${"a".repeat(85)}\n\n${DOCUMENT_TRUNCATION_NOTICE}`,
    );
    expect(truncateDocument("abcdef", 10)).toBe("abcdef");
    expect(truncateDocument("abcdef", 3)).toBe(
      `abc\n\n${DOCUMENT_TRUNCATION_NOTICE}`,
    );
  });

  it("creates env-backed clients without exposing the OpenRouter secret", async () => {
    const requests: Request[] = [];
    const client = createOpenRouterClient(
      {
        OPENROUTER_API_KEY: " test-key ",
        OPENROUTER_BASE_URL: " https://openrouter.test/api/v1 ",
        OPENROUTER_APP_URL: " https://www.capveri.com ",
      },
      async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({
          choices: [{ message: { content: "ok" } }],
          usage: { total_tokens: 1 },
        });
      },
    );

    await client.chat({
      model: "z-ai/glm-5.1",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(requests[0]?.url).toBe(
      "https://openrouter.test/api/v1/chat/completions",
    );
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer test-key");
  });

  it("rejects env-backed clients without an OpenRouter secret", () => {
    expect(() => createOpenRouterClient({})).toThrow(OpenRouterApiError);
  });

  it("builds extraction model config from backend defaults and env overrides", () => {
    expect(createExtractionModelConfig({})).toEqual({
      primary: {
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
      },
      sibling: {
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "openai/gpt-5.4-mini",
        ],
      },
      judge: {
        model: "z-ai/glm-5.1",
        fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
      },
      gapFiller: {
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
      },
      validationReprompt: {
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
      },
      crossDoc: {
        model: "z-ai/glm-5.1",
        fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
      },
      glAnalysis: {
        model: "z-ai/glm-5.1",
        fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
      },
      poolMatching: {
        model: "moonshotai/kimi-k2.6",
        fallbackModels: [
          "openai/gpt-5.4-mini",
          "google/gemini-3-flash-preview",
        ],
      },
      maxDocumentChars: 100_000,
    });

    expect(
      createExtractionModelConfig({
        EXTRACTION_PRIMARY_MODEL: "custom/primary",
        EXTRACTION_PRIMARY_FALLBACK: "custom/fallback",
        EXTRACTION_PRIMARY_FALLBACK_2: " ",
        EXTRACTION_MAX_DOCUMENT_CHARS: "2500",
      }),
    ).toMatchObject({
      primary: {
        model: "custom/primary",
        fallbackModels: ["custom/fallback", "moonshotai/kimi-k2.6"],
      },
      maxDocumentChars: 2500,
    });
  });
});

describe("OpenRouter extraction gap filler", () => {
  it("pins cap_type prompt to lowercase schema values", () => {
    expect(GAP_FILLER_PROMPTS.cap_type).toContain(
      '{"cap_type": "non_cumulative"}',
    );
    expect(GAP_FILLER_PROMPTS.cap_type).toContain("lowercase schema values");
    expect(GAP_FILLER_PROMPTS.cap_type).toContain("LESSER_OF");
    expect(GAP_FILLER_PROMPTS.cap_type).toContain("Do not return uppercase");
  });

  it("fills missing critical fields without overwriting present values", async () => {
    const requests: Array<{
      model: string;
      prompt: string;
      temperature: number | undefined;
    }> = [];
    const gapFiller = new OpenRouterExtractionGapFiller(
      {
        async extractPdf(request) {
          requests.push({
            model: request.model,
            prompt: request.prompt,
            temperature: request.temperature,
          });
          const field = request.prompt.includes('"cap_type"')
            ? "cap_type"
            : "cap_rate";
          return {
            content:
              field === "cap_type"
                ? '{"cap_type":"non_cumulative"}'
                : '{"cap_rate":"0.05"}',
            tokensUsed: 7,
            model: request.model,
          };
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      gapFiller.fillMissingFields(
        {
          pro_rata_share: "0.125",
          cap_type: null,
          cap_rate: null,
          base_year: 2024,
          base_year_amount: "12.00",
        },
        pdfBytes,
        "lease.pdf",
      ),
    ).resolves.toMatchObject({
      extraction: {
        pro_rata_share: "0.125",
        cap_type: "non_cumulative",
        cap_rate: "0.05",
        base_year: 2024,
        base_year_amount: "12.00",
      },
      missingFields: ["cap_type", "cap_rate"],
      filledFields: ["cap_type", "cap_rate"],
      modelUsed: "google/gemini-3.1-flash-lite",
      tokensUsed: 14,
      durationMs: expect.any(Number),
    });
    expect(requests).toEqual([
      {
        model: "google/gemini-3.1-flash-lite",
        prompt: expect.stringContaining('"cap_type"'),
        temperature: 0,
      },
      {
        model: "google/gemini-3.1-flash-lite",
        prompt: expect.stringContaining('"cap_rate"'),
        temperature: 0,
      },
    ]);
  });

  it("fails open for individual gap-fill field errors", async () => {
    const gapFiller = new OpenRouterExtractionGapFiller(
      {
        async extractPdf(request) {
          if (request.prompt.includes('"cap_type"')) {
            throw new OpenRouterApiError("OpenRouter unavailable", 503);
          }

          return {
            content: '{"cap_rate":"0.05"}',
            tokensUsed: 7,
            model: request.model,
          };
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      gapFiller.fillMissingFields(
        {
          pro_rata_share: "0.125",
          cap_type: null,
          cap_rate: null,
          base_year: 2024,
          base_year_amount: "12.00",
        },
        pdfBytes,
        "lease.pdf",
      ),
    ).resolves.toMatchObject({
      extraction: {
        pro_rata_share: "0.125",
        cap_type: null,
        cap_rate: "0.05",
        base_year: 2024,
        base_year_amount: "12.00",
      },
      missingFields: ["cap_type", "cap_rate"],
      filledFields: ["cap_rate"],
      tokensUsed: 7,
      attempts: [
        {
          field: "cap_type",
          ok: false,
          filled: false,
          model: "google/gemini-3.1-flash-lite",
          tokensUsed: 0,
          durationMs: expect.any(Number),
          error: "OpenRouter unavailable",
        },
        {
          field: "cap_rate",
          ok: true,
          filled: true,
          model: "google/gemini-3.1-flash-lite",
          tokensUsed: 7,
          durationMs: expect.any(Number),
          extracted: { cap_rate: "0.05" },
        },
      ],
    });
  });

  it("preserves returned tokens when gap-fill response parsing fails", async () => {
    const gapFiller = new OpenRouterExtractionGapFiller(
      {
        async extractPdf(request) {
          return {
            content: request.prompt.includes('"cap_type"')
              ? "not json"
              : '{"cap_rate":"0.05"}',
            tokensUsed: 9,
            model: request.model,
          };
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      gapFiller.fillMissingFields(
        {
          pro_rata_share: "0.125",
          cap_type: null,
          cap_rate: null,
          base_year: 2024,
          base_year_amount: "12.00",
        },
        pdfBytes,
        "lease.pdf",
      ),
    ).resolves.toMatchObject({
      extraction: {
        pro_rata_share: "0.125",
        cap_type: null,
        cap_rate: "0.05",
        base_year: 2024,
        base_year_amount: "12.00",
      },
      filledFields: ["cap_rate"],
      tokensUsed: 18,
      attempts: [
        {
          field: "cap_type",
          ok: false,
          filled: false,
          tokensUsed: 9,
          error: "Gap-fill response did not contain a JSON object",
        },
        {
          field: "cap_rate",
          ok: true,
          filled: true,
          tokensUsed: 9,
        },
      ],
    });
  });

  it("rejects non-object gap-fill responses", () => {
    expect(() => parseGapFillJson("[1,2,3]")).toThrow(
      "Gap-fill response did not contain a JSON object",
    );
    expect(() => parseGapFillJson('{"cap_rate":"0.05"}')).not.toThrow();
  });
});

describe("OpenRouter validation re-prompt", () => {
  it("skips OpenRouter when cap fields are already consistent", async () => {
    const reprompter = new OpenRouterValidationReprompter(
      {
        async extractPdf() {
          throw new Error("should not call validation re-prompt");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      reprompter.repromptInvalidFields(
        { cap_type: "non_cumulative", cap_rate: "0.05" },
        pdfBytes,
        "lease.pdf",
      ),
    ).resolves.toMatchObject({
      extraction: { cap_type: "non_cumulative", cap_rate: "0.05" },
      attempted: false,
      attempts: [],
      initialErrors: [],
      modelUsed: "google/gemini-3.1-flash-lite",
      tokensUsed: 0,
      durationMs: expect.any(Number),
    });
  });

  it("reconciles cap_type and cap_rate together and overwrites inconsistent values", async () => {
    const requests: Array<{
      model: string;
      fallbackModels?: string[];
      temperature: number | undefined;
      prompt: string;
    }> = [];
    const reprompter = new OpenRouterValidationReprompter(
      {
        async extractPdf(request) {
          const call: {
            model: string;
            fallbackModels?: string[];
            temperature: number | undefined;
            prompt: string;
          } = {
            model: request.model,
            temperature: request.temperature,
            prompt: request.prompt,
          };
          if (request.fallbackModels !== undefined) {
            call.fallbackModels = request.fallbackModels;
          }
          requests.push(call);
          return {
            content:
              '{"cap_type":"non_cumulative","cap_rate":"0.05","tenant_name":"Ignored"}',
            tokensUsed: 11,
            model: request.model,
          };
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      reprompter.repromptInvalidFields(
        { tenant_name: "Acme", cap_type: "none", cap_rate: "0.05" },
        pdfBytes,
        "lease.pdf",
      ),
    ).resolves.toMatchObject({
      extraction: {
        tenant_name: "Acme",
        cap_type: "non_cumulative",
        cap_rate: "0.05",
      },
      attempted: true,
      initialErrors: [
        {
          field: "cap_type",
          message: expect.stringContaining("Cap type is required"),
          value: "none",
        },
      ],
      tokensUsed: 11,
      attempts: [
        {
          ok: true,
          invalidFields: ["cap_type"],
          reconcileFields: ["cap_rate", "cap_type"],
          patchedFields: ["cap_type", "cap_rate"],
          model: "google/gemini-3.1-flash-lite",
          tokensUsed: 11,
          durationMs: expect.any(Number),
        },
      ],
    });
    expect(requests).toEqual([
      {
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
        temperature: 0,
        prompt: expect.stringContaining('"cap_type": ...'),
      },
    ]);
  });

  it("fails open and preserves tokens when validation re-prompt parsing fails", async () => {
    const reprompter = new OpenRouterValidationReprompter(
      {
        async extractPdf(request) {
          return {
            content: "not json",
            tokensUsed: 13,
            model: request.model,
          };
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      reprompter.repromptInvalidFields(
        { cap_type: "none", cap_rate: "0.05" },
        pdfBytes,
        "lease.pdf",
      ),
    ).resolves.toMatchObject({
      extraction: { cap_type: "none", cap_rate: "0.05" },
      attempted: true,
      tokensUsed: 13,
      attempts: [
        {
          ok: false,
          invalidFields: ["cap_type"],
          reconcileFields: ["cap_rate", "cap_type"],
          patchedFields: [],
          model: "google/gemini-3.1-flash-lite",
          tokensUsed: 13,
          error: "Validation re-prompt response did not contain a JSON object",
        },
      ],
    });
  });

  it("builds cap reconciliation prompts and rejects non-object responses", () => {
    expect(
      buildValidationReprompt(["cap_type"], ["Cap type is required"]),
    ).toContain('"cap_rate": ...');
    expect(() => parseValidationRepromptJson("[1,2,3]")).toThrow(
      "Validation re-prompt response did not contain a JSON object",
    );
    expect(() =>
      parseValidationRepromptJson('{"cap_type":"none","cap_rate":null}'),
    ).not.toThrow();
  });
});

describe("OpenRouter extraction judge", () => {
  it("pins cap_type enum guidance for live judge arbitration", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain(
      "none, non_cumulative, cumulative, and cumulative_compounding",
    );
    expect(JUDGE_SYSTEM_PROMPT).toContain("Never choose legacy labels");
    expect(JUDGE_SYSTEM_PROMPT).toContain("LESSER_OF");
  });

  it("builds compact judge payloads without extraction audit metadata", () => {
    const message = JSON.parse(
      buildJudgeUserMessage(
        [
          {
            field: "cap_rate",
            primaryValue: 5,
            siblingValue: 7,
          },
        ],
        { cap_rate: 5, extractions: [{ field: "cap_rate" }] },
        { cap_rate: 7, extractions: [{ field: "cap_rate" }] },
      ),
    ) as Record<string, unknown>;

    expect(message).toEqual({
      disagreements: [
        { field: "cap_rate", primary_value: 5, sibling_value: 7 },
      ],
      primary_extraction: { cap_rate: 5 },
      sibling_extraction: { cap_rate: 7 },
    });
  });

  it("parses judge verdicts and normalizes chosen values", () => {
    expect(
      parseJudgeResponse(
        JSON.stringify({
          verdicts: [
            {
              field: "cap_rate",
              verdict: "sibling_wins",
              chosen_value: 7,
              rationale: "Sibling has page support.",
            },
            {
              field: "base_year",
              verdict: "bad-value",
            },
            "ignored",
          ],
        }),
        2,
        "z-ai/glm-5.1",
        31,
      ),
    ).toEqual({
      verdicts: [
        {
          field: "cap_rate",
          verdict: "sibling_wins",
          chosenValue: 7,
          rationale: "Sibling has page support.",
        },
        {
          field: "base_year",
          verdict: "trust_neither",
        },
      ],
      fieldsJudged: 2,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 31,
      durationMs: 0,
    });
  });

  it("extracts judge JSON from fenced responses with surrounding prose", () => {
    expect(
      parseJudgeResponse(
        'Here is the verdict:\n```json\n{"verdicts":[{"field":"cap_rate","verdict":"primary_wins"}]}\n```',
        1,
        "z-ai/glm-5.1",
        11,
      ),
    ).toEqual({
      verdicts: [
        {
          field: "cap_rate",
          verdict: "primary_wins",
        },
      ],
      fieldsJudged: 1,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 11,
      durationMs: 0,
    });
  });

  it("preserves judge telemetry when response parsing fails", () => {
    expect(parseJudgeResponse("not json", 3, "z-ai/glm-5.1", 19)).toEqual({
      verdicts: [
        {
          field: "_judge_error",
          verdict: "trust_neither",
          rationale:
            "OpenRouter judge response could not be parsed: Judge response did not contain a JSON object",
        },
      ],
      fieldsJudged: 3,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 19,
      durationMs: 0,
    });
  });

  it("records judge response shape failures as explicit telemetry", () => {
    expect(
      parseJudgeResponse(
        JSON.stringify({ message: "missing verdicts" }),
        2,
        "z-ai/glm-5.1",
        17,
      ),
    ).toEqual({
      verdicts: [
        {
          field: "_judge_error",
          verdict: "trust_neither",
          rationale: "OpenRouter judge response did not include verdicts",
        },
      ],
      fieldsJudged: 2,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 17,
      durationMs: 0,
    });

    expect(
      parseJudgeResponse(
        JSON.stringify({
          verdicts: ["not an object", { verdict: "primary_wins" }],
        }),
        2,
        "z-ai/glm-5.1",
        18,
      ),
    ).toEqual({
      verdicts: [
        {
          field: "_judge_error",
          verdict: "trust_neither",
          rationale: "OpenRouter judge response did not include valid verdicts",
        },
      ],
      fieldsJudged: 2,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 18,
      durationMs: 0,
    });
  });

  it("fails open when the judge request fails", async () => {
    const judge = new OpenRouterExtractionJudge(
      {
        async requestJson() {
          throw new OpenRouterApiError("OpenRouter unavailable", 503);
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      judge.judge({ cap_rate: 5 }, { cap_rate: 7 }),
    ).resolves.toEqual({
      verdicts: [
        {
          field: "_judge_error",
          verdict: "trust_neither",
          rationale: "OpenRouter judge request failed with 503",
        },
      ],
      fieldsJudged: 1,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 0,
      durationMs: expect.any(Number),
    });
  });

  it("skips OpenRouter when extractors agree", async () => {
    const judge = new OpenRouterExtractionJudge(
      {
        async requestJson() {
          throw new Error("should not call judge for matching extractions");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      judge.judge({ cap_rate: 5 }, { cap_rate: "5.00000000001" }),
    ).resolves.toEqual({
      verdicts: [],
      fieldsJudged: 0,
      modelUsed: "",
      tokensUsed: 0,
      durationMs: 0,
    });
  });

  it("bounds large extraction payloads sent to the judge", () => {
    const message = JSON.parse(
      buildJudgeUserMessage(
        [
          {
            field: "cap_rate",
            primaryValue: 5,
            siblingValue: 7,
          },
        ],
        {
          cap_rate: 5,
          lease_text: "x".repeat(MAX_JUDGE_EXTRACTION_JSON_CHARS + 1),
        },
        { cap_rate: 7 },
      ),
    ) as {
      primary_extraction: {
        _truncated?: boolean;
        _preview?: string;
      };
    };

    expect(message.primary_extraction._truncated).toBe(true);
    expect(message.primary_extraction._preview?.length).toBeLessThanOrEqual(
      MAX_JUDGE_EXTRACTION_JSON_CHARS,
    );
    expect(
      JSON.stringify(message.primary_extraction).length,
    ).toBeLessThanOrEqual(MAX_JUDGE_EXTRACTION_JSON_CHARS);
  });

  it("bounds large disagreement values sent to the judge", () => {
    const message = JSON.parse(
      buildJudgeUserMessage(
        [
          {
            field: "lease_text",
            primaryValue: "x".repeat(MAX_JUDGE_EXTRACTION_JSON_CHARS + 1),
            siblingValue: "short",
          },
        ],
        { lease_text: "x".repeat(MAX_JUDGE_EXTRACTION_JSON_CHARS + 1) },
        { lease_text: "short" },
      ),
    ) as {
      disagreements: Array<{
        primary_value: { _truncated?: boolean; _preview?: string };
      }>;
    };

    expect(message.disagreements[0]?.primary_value._truncated).toBe(true);
    expect(
      message.disagreements[0]?.primary_value._preview?.length,
    ).toBeLessThanOrEqual(MAX_JUDGE_EXTRACTION_JSON_CHARS);
    expect(
      JSON.stringify(message.disagreements[0]?.primary_value).length,
    ).toBeLessThanOrEqual(MAX_JUDGE_EXTRACTION_JSON_CHARS);
  });

  it("bounds aggregate judge payload size across many disagreements", () => {
    const diff = Array.from({ length: 100 }, (_, index) => ({
      field: `field_${index}`,
      primaryValue: "x".repeat(2_000),
      siblingValue: "y".repeat(2_000),
    }));
    const message = buildJudgeUserMessage(diff, {}, {});
    const parsed = JSON.parse(message) as {
      disagreements: Array<{ field: string }>;
    };

    expect(message.length).toBeLessThanOrEqual(MAX_JUDGE_USER_MESSAGE_CHARS);
    expect(parsed.disagreements.at(-1)?.field).toBe("_truncated");
  });

  it("keeps aggregate judge payload under the cap when the truncation marker would not fit", () => {
    const diff = Array.from({ length: 1_018 }, (_, index) => ({
      field: `field_${index}`,
      primaryValue: "a",
      siblingValue: "b",
    }));
    const message = buildJudgeUserMessage(diff, {}, {});
    const parsed = JSON.parse(message) as {
      disagreements: Array<{ field: string }>;
    };

    expect(message.length).toBeLessThanOrEqual(MAX_JUDGE_USER_MESSAGE_CHARS);
    expect(parsed.disagreements.length).toBeLessThan(diff.length);
  });

  it("bounds judge payload size after JSON escaping expands previews", () => {
    const escapedText = '\\"'.repeat(MAX_JUDGE_EXTRACTION_JSON_CHARS);
    const message = buildJudgeUserMessage(
      [
        {
          field: "cap_rate",
          primaryValue: 5,
          siblingValue: 7,
        },
      ],
      { lease_text: escapedText },
      { lease_text: escapedText },
    );
    const parsed = JSON.parse(message) as {
      primary_extraction: {
        _truncated?: boolean;
        _preview?: string;
      };
      sibling_extraction: {
        _truncated?: boolean;
        _preview?: string;
      };
    };

    expect(message.length).toBeLessThanOrEqual(MAX_JUDGE_USER_MESSAGE_CHARS);
    expect(parsed.primary_extraction._truncated).toBe(true);
    expect(parsed.sibling_extraction._truncated).toBe(true);
    expect(
      JSON.stringify(parsed.primary_extraction).length,
    ).toBeLessThanOrEqual(MAX_JUDGE_EXTRACTION_JSON_CHARS);
    expect(
      JSON.stringify(parsed.sibling_extraction).length,
    ).toBeLessThanOrEqual(MAX_JUDGE_EXTRACTION_JSON_CHARS);
  });

  it("records judge request failure telemetry for network-style errors", async () => {
    const judge = new OpenRouterExtractionJudge(
      {
        async requestJson() {
          throw new TypeError("fetch failed");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      judge.judge({ cap_rate: 5 }, { cap_rate: 7 }),
    ).resolves.toEqual({
      verdicts: [
        {
          field: "_judge_error",
          verdict: "trust_neither",
          rationale: "OpenRouter judge request failed: fetch failed",
        },
      ],
      fieldsJudged: 1,
      modelUsed: "z-ai/glm-5.1",
      tokensUsed: 0,
      durationMs: expect.any(Number),
    });
  });
});

describe("native PDF extraction pipeline", () => {
  it("runs primary and sibling extraction from R2 bytes and merges results", async () => {
    const storageReads: string[] = [];
    const snapshots: Array<{ stage: string; data: unknown }> = [];
    const auditEvents: Array<{
      stage: string;
      model: string;
      tokensUsed: number;
      outcome: string;
    }> = [];
    const calls: Array<{
      filename: string;
      model: string;
      fallbackModels?: string[];
      pdfBytes: Uint8Array;
    }> = [];
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf(content) {
          return content[0] === 0x25 && content[1] === 0x50;
        },
        validateFileSize() {
          return true;
        },
        putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes(key) {
          storageReads.push(key);
          return pdfBytes;
        },
        async headDocument(key) {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key,
            etag: "etag-1",
            size: pdfBytes.byteLength,
            contentType: "application/pdf",
          };
        },
        deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf(request) {
          const call: {
            filename: string;
            model: string;
            fallbackModels?: string[];
            pdfBytes: Uint8Array;
          } = {
            filename: request.filename,
            model: request.model,
            pdfBytes: request.pdfBytes,
          };
          if (request.fallbackModels !== undefined) {
            call.fallbackModels = request.fallbackModels;
          }
          calls.push(call);
          // The initial dual extraction uses LEASE_NATIVE_PDF_EXTRACTION_PROMPT,
          // whose JSON schema lists every recovery-profile field (including
          // cap_type/cap_rate/base_year_amount). Route it before the per-field
          // gap-fill branches so the schema text does not masquerade as a
          // gap-fill request.
          if (
            request.prompt.includes("expert commercial real estate analyst")
          ) {
            const content =
              request.fallbackModels?.includes("openai/gpt-5.4-mini") === true
                ? '{"tenant_name":"Acme","pro_rata_share":"12.5%","base_year":2024}'
                : '{"tenant_name":"Acme","pro_rata_share":"12.5%"}';
            return {
              content,
              tokensUsed: 55,
              model: request.model,
            };
          }
          if (request.prompt.includes("A previous extraction")) {
            return {
              content: '{"cap_type":"non_cumulative","cap_rate":"0.05"}',
              tokensUsed: 11,
              model: request.model,
            };
          }
          if (request.prompt.includes('"cap_type"')) {
            return {
              content: '{"cap_type":"none"}',
              tokensUsed: 7,
              model: request.model,
            };
          }
          if (request.prompt.includes('"cap_rate"')) {
            return {
              content: '{"cap_rate":"0.05"}',
              tokensUsed: 7,
              model: request.model,
            };
          }
          if (request.prompt.includes('"base_year_amount"')) {
            return {
              content: '{"base_year_amount":null}',
              tokensUsed: 7,
              model: request.model,
            };
          }
          const content =
            request.fallbackModels?.includes("openai/gpt-5.4-mini") === true
              ? '{"tenant_name":"Acme","pro_rata_share":"12.5%","base_year":2024}'
              : '{"tenant_name":"Acme","pro_rata_share":"12.5%"}';
          return {
            content,
            tokensUsed: 55,
            model: request.model,
          };
        },
        async requestJson(request) {
          const call: {
            filename: string;
            model: string;
            fallbackModels?: string[];
            pdfBytes: Uint8Array;
          } = {
            filename: "judge-request",
            model: request.model,
            pdfBytes: new Uint8Array(),
          };
          if (request.fallbackModels !== undefined) {
            call.fallbackModels = request.fallbackModels;
          }
          calls.push(call);
          return {
            content: JSON.stringify({
              verdicts: [
                {
                  field: "base_year",
                  verdict: "sibling_wins",
                  chosen_value: 2024,
                },
              ],
            }),
            tokensUsed: 13,
            model: "z-ai/glm-5.1",
          };
        },
      },
      createExtractionModelConfig({}),
      {
        persistence: {
          forensicStore: {
            async writeJson(_documentId, stage, data) {
              snapshots.push({ stage, data });
              return { ok: true, key: `${stage}.json` };
            },
          },
          auditEvents: {
            async emit(event) {
              auditEvents.push({
                stage: event.stage,
                model: event.model,
                tokensUsed: event.tokensUsed,
                outcome: event.outcome,
              });
              return { ok: true };
            },
          },
        },
      },
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/org/property/acme-lease.pdf",
      }),
    ).resolves.toEqual({
      tokensUsed: 155,
      extractedFieldNames: [
        "tenant_name",
        "pro_rata_share",
        "base_year",
        "cap_type",
        "cap_rate",
      ],
      resultData: {
        pipeline: "cloudflare-openrouter-dual-native-pdf-v1",
        extraction: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
          cap_type: "non_cumulative",
          cap_rate: "0.05",
        },
        dual_extraction: {
          primaryJson: {
            tenant_name: "Acme",
            pro_rata_share: "12.5%",
          },
          siblingJson: {
            tenant_name: "Acme",
            pro_rata_share: "12.5%",
            base_year: 2024,
          },
          primaryModel: "google/gemini-3.1-flash-lite",
          siblingModel: "google/gemini-3.1-flash-lite",
          primaryTokens: 55,
          siblingTokens: 55,
          primaryFailed: false,
          siblingFailed: false,
          judgeModel: "z-ai/glm-5.1",
          judgeTokens: 13,
          judgeDurationMs: expect.any(Number),
          fieldsJudged: 1,
          judgeVerdicts: [
            {
              field: "base_year",
              verdict: "sibling_wins",
              chosenValue: 2024,
            },
          ],
          primaryDurationMs: expect.any(Number),
          siblingDurationMs: expect.any(Number),
        },
        gap_filler: {
          missingFields: ["cap_type", "cap_rate", "base_year_amount"],
          filledFields: ["cap_type", "cap_rate"],
          model: "google/gemini-3.1-flash-lite",
          tokensUsed: 21,
          durationMs: expect.any(Number),
          attempts: [
            {
              field: "cap_type",
              ok: true,
              filled: true,
              model: "google/gemini-3.1-flash-lite",
              tokensUsed: 7,
              durationMs: expect.any(Number),
            },
            {
              field: "cap_rate",
              ok: true,
              filled: true,
              model: "google/gemini-3.1-flash-lite",
              tokensUsed: 7,
              durationMs: expect.any(Number),
            },
            {
              field: "base_year_amount",
              ok: true,
              filled: false,
              model: "google/gemini-3.1-flash-lite",
              tokensUsed: 7,
              durationMs: expect.any(Number),
            },
          ],
        },
        validation_reprompt: {
          attempted: true,
          initialErrors: [
            {
              field: "cap_type",
              message: expect.stringContaining("Cap type is required"),
              value: "none",
            },
          ],
          model: "google/gemini-3.1-flash-lite",
          tokensUsed: 11,
          durationMs: expect.any(Number),
          attempts: [
            {
              ok: true,
              invalidFields: ["cap_type"],
              reconcileFields: ["cap_rate", "cap_type"],
              patchedFields: ["cap_type", "cap_rate"],
              model: "google/gemini-3.1-flash-lite",
              tokensUsed: 11,
              durationMs: expect.any(Number),
            },
          ],
        },
      },
      documentExtractionResult: {
        profile: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
          cap_type: "non_cumulative",
          cap_rate: "0.05",
        },
        confidence_scores: {},
        source_references: [],
        _meta: {
          pipeline: "dual-extract",
          provider: "openrouter",
          primary_model: "google/gemini-3.1-flash-lite",
          sibling_model: "google/gemini-3.1-flash-lite",
          reader_job_id: jobId,
          tokens_used: 155,
        },
      },
    });
    expect(storageReads).toEqual(["leases/org/property/acme-lease.pdf"]);
    expect(snapshots).toMatchObject([
      {
        stage: "extract_primary",
        data: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
        },
      },
      {
        stage: "extract_sibling",
        data: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
        },
      },
      {
        stage: "judge_input",
        data: {
          primary_json: {
            tenant_name: "Acme",
            pro_rata_share: "12.5%",
          },
          sibling_json: {
            tenant_name: "Acme",
            pro_rata_share: "12.5%",
            base_year: 2024,
          },
        },
      },
      {
        stage: "judge_output",
        data: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
        },
      },
      {
        stage: "gap_filler",
        data: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
          cap_type: "none",
          cap_rate: "0.05",
        },
      },
      {
        stage: "validation_reprompt",
        data: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
          cap_type: "non_cumulative",
          cap_rate: "0.05",
        },
      },
      {
        stage: "merged",
        data: {
          tenant_name: "Acme",
          pro_rata_share: "12.5%",
          base_year: 2024,
          cap_type: "non_cumulative",
          cap_rate: "0.05",
        },
      },
    ]);
    expect(auditEvents).toMatchObject([
      {
        stage: "extract_primary",
        model: "google/gemini-3.1-flash-lite",
        tokensUsed: 55,
        outcome: "success",
      },
      {
        stage: "extract_sibling",
        model: "google/gemini-3.1-flash-lite",
        tokensUsed: 55,
        outcome: "success",
      },
      {
        stage: "judge",
        model: "z-ai/glm-5.1",
        tokensUsed: 13,
        outcome: "success",
      },
      {
        stage: "merge",
        model: "",
        tokensUsed: 0,
        outcome: "success",
      },
      {
        stage: "gap_filler",
        model: "gap-fill:cap_type,cap_rate,base_year_amount",
        tokensUsed: 21,
        outcome: "success",
      },
      {
        stage: "validation_reprompt",
        model: "google/gemini-3.1-flash-lite",
        tokensUsed: 11,
        outcome: "success",
      },
    ]);
    expect(calls).toEqual([
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
        pdfBytes,
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "openai/gpt-5.4-mini",
        ],
        pdfBytes,
      },
      {
        filename: "judge-request",
        model: "z-ai/glm-5.1",
        fallbackModels: ["openai/gpt-5.4-mini", "moonshotai/kimi-k2.6"],
        pdfBytes: new Uint8Array(),
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
        pdfBytes,
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
        pdfBytes,
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
        pdfBytes,
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
        pdfBytes,
      },
    ]);
  });

  it("falls back when the stable extraction model returns non-JSON", async () => {
    const calls: Array<{
      filename: string;
      model: string;
      fallbackModels?: string[];
    }> = [];
    let stableModelAttempts = 0;
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf(content) {
          return content[0] === 0x25 && content[1] === 0x50;
        },
        validateFileSize() {
          return true;
        },
        async putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes() {
          return pdfBytes;
        },
        async headDocument() {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key: "leases/org/property/acme-lease.pdf",
            etag: "etag",
            size: pdfBytes.byteLength,
            contentType: "application/pdf",
          };
        },
        async deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf(request) {
          const call: {
            filename: string;
            model: string;
            fallbackModels?: string[];
          } = {
            filename: request.filename,
            model: request.model,
          };
          if (request.fallbackModels !== undefined) {
            call.fallbackModels = request.fallbackModels;
          }
          calls.push(call);

          if (request.model === "google/gemini-3.1-flash-lite") {
            stableModelAttempts += 1;
            return {
              content: stableModelAttempts === 1 ? "not json" : "[]",
              tokensUsed: 5,
              model: request.model,
            };
          }

          return {
            content:
              '{"tenant_name":"Acme","pro_rata_share":"0.125","base_year":2024,"base_year_amount":"12.00","cap_type":"non_cumulative","cap_rate":"0.05"}',
            tokensUsed: 55,
            model: request.model,
          };
        },
        async requestJson() {
          return {
            content: '{"verdicts":[]}',
            tokensUsed: 0,
            model: "z-ai/glm-5.1",
          };
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/org/property/acme-lease.pdf",
      }),
    ).resolves.toMatchObject({
      resultData: {
        extraction: {
          tenant_name: "Acme",
          pro_rata_share: "0.125",
          base_year: 2024,
          base_year_amount: "12.00",
          cap_type: "non_cumulative",
          cap_rate: "0.05",
        },
        dual_extraction: {
          primaryModel: "google/gemini-3-flash-preview",
          siblingModel: "google/gemini-3-flash-preview",
          primaryTokens: 60,
          siblingTokens: 60,
          primaryFailed: false,
          siblingFailed: false,
        },
      },
    });

    expect(calls).toEqual([
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "moonshotai/kimi-k2.6",
        ],
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3.1-flash-lite",
        fallbackModels: [
          "google/gemini-3-flash-preview",
          "openai/gpt-5.4-mini",
        ],
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3-flash-preview",
        fallbackModels: ["moonshotai/kimi-k2.6"],
      },
      {
        filename: "acme-lease.pdf",
        model: "google/gemini-3-flash-preview",
        fallbackModels: ["openai/gpt-5.4-mini"],
      },
    ]);
  });

  it("continues extraction when forensic or audit persistence throws", async () => {
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf() {
          return true;
        },
        validateFileSize() {
          return true;
        },
        putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes() {
          return pdfBytes;
        },
        async headDocument(key) {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key,
            etag: "etag-1",
            size: pdfBytes.byteLength,
            contentType: "application/pdf",
          };
        },
        deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf(request) {
          return {
            content: JSON.stringify({
              tenant_name: "Acme",
              pro_rata_share: "0.125",
              cap_type: "non_cumulative",
              cap_rate: "0.05",
              base_year: 2024,
              base_year_amount: "12.00",
            }),
            tokensUsed: 55,
            model: request.model,
          };
        },
        async requestJson() {
          throw new Error("should not call judge when extractions match");
        },
      },
      createExtractionModelConfig({}),
      {
        persistence: {
          forensicStore: {
            async writeJson() {
              throw new Error("R2 forensic unavailable");
            },
          },
          auditEvents: {
            async emit() {
              throw new Error("audit DB unavailable");
            },
          },
        },
      },
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/org/property/acme-lease.pdf",
      }),
    ).resolves.toMatchObject({
      tokensUsed: 110,
      resultData: {
        extraction: {
          tenant_name: "Acme",
          pro_rata_share: "0.125",
          cap_type: "non_cumulative",
          cap_rate: "0.05",
          base_year: 2024,
          base_year_amount: "12.00",
        },
      },
    });
  });

  it("treats missing R2 document bytes as transient extraction failures", async () => {
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf() {
          return true;
        },
        validateFileSize() {
          return true;
        },
        putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes() {
          return undefined;
        },
        async headDocument() {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key: "leases/missing.pdf",
            etag: "etag-1",
            size: pdfBytes.byteLength,
            contentType: "application/pdf",
          };
        },
        deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf() {
          throw new Error("should not call OpenRouter");
        },
        async requestJson() {
          throw new Error("should not call judge");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/missing.pdf",
      }),
    ).rejects.toBeInstanceOf(ExtractionTransientError);
  });

  it("rejects oversized PDFs before reading bytes or building base64 payloads", async () => {
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf() {
          return true;
        },
        validateFileSize() {
          return true;
        },
        putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes() {
          throw new Error("should not read oversized document");
        },
        async headDocument() {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key: "leases/huge.pdf",
            etag: "etag-1",
            size: MAX_NATIVE_PDF_EXTRACTION_BYTES + 1,
            contentType: "application/pdf",
          };
        },
        deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf() {
          throw new Error("should not call OpenRouter");
        },
        async requestJson() {
          throw new Error("should not call judge");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/huge.pdf",
      }),
    ).rejects.toThrow("Document exceeds native PDF extraction size limit");
  });

  it("rejects invalid PDF bytes before extraction, judge, or gap-fill calls", async () => {
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf() {
          return false;
        },
        validateFileSize() {
          return true;
        },
        putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes() {
          return new Uint8Array([0x00, 0x01]);
        },
        async headDocument() {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key: "leases/not-a-pdf.pdf",
            etag: "etag-1",
            size: 2,
            contentType: "application/pdf",
          };
        },
        deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf() {
          throw new Error("should not call OpenRouter");
        },
        async requestJson() {
          throw new Error("should not call judge");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/not-a-pdf.pdf",
      }),
    ).rejects.toThrow("Document content must be a PDF");
  });

  it("classifies OpenRouter 429 and 5xx failures as transient when both extractors fail", async () => {
    const pipeline = new OpenRouterNativePdfExtractionPipeline(
      {
        generateStorageKey() {
          throw new Error("not used");
        },
        validatePdf() {
          return true;
        },
        validateFileSize() {
          return true;
        },
        putDocument() {
          throw new Error("not used");
        },
        async getDocumentBytes() {
          return pdfBytes;
        },
        async headDocument() {
          return {
            bucket: "DOCUMENTS_BUCKET",
            key: "leases/rate-limited.pdf",
            etag: "etag-1",
            size: pdfBytes.byteLength,
            contentType: "application/pdf",
          };
        },
        deleteDocument() {
          throw new Error("not used");
        },
      },
      {
        async extractPdf() {
          throw new OpenRouterApiError(
            "OpenRouter request failed with 429",
            429,
          );
        },
        async requestJson() {
          throw new Error("should not call judge");
        },
      },
      createExtractionModelConfig({}),
    );

    await expect(
      pipeline.run({
        jobId,
        documentId,
        organizationId: orgId,
        documentStorageKey: "leases/rate-limited.pdf",
      }),
    ).rejects.toBeInstanceOf(ExtractionTransientError);
  });

  it("rejects non-JSON extraction responses before completing the job", () => {
    expect(() => parseExtractionJson("not json")).toThrow(
      "OpenRouter extraction response did not contain a JSON object",
    );
    expect(() => parseExtractionJson("[1,2,3]")).toThrow(
      "OpenRouter extraction response did not contain a JSON object",
    );
    expect(() => parseExtractionJson('[{"tenant_name":"Acme"}]')).toThrow(
      "OpenRouter extraction response did not contain a JSON object",
    );
    expect(filenameFromStorageKey("org/property/lease.pdf")).toBe("lease.pdf");
    expect(
      buildPipelineResultData(
        { tenant_name: "Acme" },
        {
          primaryJson: { tenant_name: "Acme" },
          siblingJson: {},
          primaryModel: "primary",
          siblingModel: "sibling",
          primaryTokens: 1,
          siblingTokens: 0,
          primaryDurationMs: 1,
          siblingDurationMs: 0,
          primaryFailed: false,
          siblingFailed: true,
          judgeModel: "",
          judgeTokens: 0,
          fieldsJudged: 0,
        },
      ),
    ).toEqual({
      pipeline: "cloudflare-openrouter-dual-native-pdf-v1",
      extraction: { tenant_name: "Acme" },
      dual_extraction: {
        primaryJson: { tenant_name: "Acme" },
        siblingJson: {},
        primaryModel: "primary",
        siblingModel: "sibling",
        primaryTokens: 1,
        siblingTokens: 0,
        primaryDurationMs: 1,
        siblingDurationMs: 0,
        primaryFailed: false,
        siblingFailed: true,
        judgeModel: "",
        judgeTokens: 0,
        fieldsJudged: 0,
      },
    });
  });
});

describe("LEASE_NATIVE_PDF_EXTRACTION_PROMPT", () => {
  it("requests the recovery-profile fields the frontend consumes", () => {
    for (const field of [
      "base_year",
      "base_year_amount",
      "gross_up_base_year",
      "pro_rata_share",
      "cap_type",
      "cap_rate",
      "admin_fee_percentage",
      "management_fee_percentage",
      "excluded_pools",
      "accounting_basis",
    ]) {
      expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).toContain(`"${field}"`);
    }
  });

  it("requests the per-field extractions[] audit array with confidence and bounding boxes", () => {
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).toContain('"extractions"');
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).toContain('"confidence"');
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).toContain('"source_text"');
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).toContain('"bounding_box"');
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).toContain("0-100");
  });

  it("drops the old tenant-directory fields that the recovery profile does not use", () => {
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).not.toContain("landlord_name");
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).not.toContain("payment_terms");
    expect(LEASE_NATIVE_PDF_EXTRACTION_PROMPT).not.toContain("audit_rights");
  });
});

describe("buildDocumentExtractionResult", () => {
  it("maps audit confidence to 0-1, exposes boundingBox, and strips extractions from the profile", () => {
    const payload = buildDocumentExtractionResult(
      {
        pro_rata_share: "0.125",
        cap_type: "non_cumulative",
        cap_rate: "0.05",
        extractions: [
          {
            field: "pro_rata_share",
            value: "12.5%",
            source_text: "Tenant's pro rata share is 12.5%.",
            confidence: 95,
            page: 3,
            bounding_box: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 },
          },
          {
            field: "cap_rate",
            value: "5% annual cap",
            source_text: "Controllable expenses capped at 5% annually.",
            confidence: 70,
            page: null,
            bounding_box: null,
          },
        ],
      },
      {
        tokensUsed: 321,
        readerJobId: jobId,
        primaryModel: "google/gemini-3.1-flash-lite",
        siblingModel: "google/gemini-3.1-flash-lite",
      },
    );

    expect(payload.profile).toEqual({
      pro_rata_share: "0.125",
      cap_type: "non_cumulative",
      cap_rate: "0.05",
    });
    expect(payload.confidence_scores).toEqual({
      pro_rata_share: 0.95,
      cap_rate: 0.7,
    });
    expect(payload.source_references).toEqual([
      {
        field: "pro_rata_share",
        value: "12.5%",
        text: "Tenant's pro rata share is 12.5%.",
        source_text: "Tenant's pro rata share is 12.5%.",
        confidence: 0.95,
        page: 3,
        boundingBox: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 },
      },
      {
        field: "cap_rate",
        value: "5% annual cap",
        text: "Controllable expenses capped at 5% annually.",
        source_text: "Controllable expenses capped at 5% annually.",
        confidence: 0.7,
        page: null,
        boundingBox: null,
      },
    ]);
    expect(payload._meta).toEqual({
      pipeline: "dual-extract",
      provider: "openrouter",
      primary_model: "google/gemini-3.1-flash-lite",
      sibling_model: "google/gemini-3.1-flash-lite",
      reader_job_id: jobId,
      tokens_used: 321,
    });
  });

  it("coerces stringified audit confidence to a 0-1 score (Pydantic int parity)", () => {
    // Weaker fallback models occasionally emit confidence as a string. The
    // Python pipeline coerces it via a Pydantic int field; the port must too,
    // rather than collapsing it to 0.
    const payload = buildDocumentExtractionResult(
      {
        pro_rata_share: "0.125",
        extractions: [
          {
            field: "pro_rata_share",
            value: "12.5%",
            source_text: "Tenant's pro rata share is 12.5%.",
            confidence: "95",
            page: 1,
            bounding_box: null,
          },
        ],
      },
      {
        tokensUsed: 10,
        readerJobId: jobId,
        primaryModel: "primary",
        siblingModel: "sibling",
      },
    );

    expect(payload.confidence_scores).toEqual({ pro_rata_share: 0.95 });
  });

  it("yields empty confidence and reference maps when no audit array is present", () => {
    const payload = buildDocumentExtractionResult(
      { pro_rata_share: "0.05" },
      {
        tokensUsed: 0,
        readerJobId: jobId,
        primaryModel: "primary",
        siblingModel: "sibling",
      },
    );

    expect(payload.profile).toEqual({ pro_rata_share: "0.05" });
    expect(payload.confidence_scores).toEqual({});
    expect(payload.source_references).toEqual([]);
  });
});
