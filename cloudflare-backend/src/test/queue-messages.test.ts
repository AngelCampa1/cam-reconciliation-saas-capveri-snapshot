import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AppEnv } from "../env";
import {
  consumeQueueMessage,
  dispatchQueueBatch,
  queueNameFromCloudflareQueue,
  reportInvalidQueueMessage,
  type QueueConsumerMessage,
  type QueueHandlerContext,
  type QueueInvalidMessage,
} from "../queues/consumers";
import { createQueueProducer, type QueueProducer } from "../queues/producers";
import {
  analyticsQueueMessageSchema,
  emailQueueMessageSchema,
  extractionQueueMessageSchema,
  MAX_QUEUE_MESSAGE_BYTES,
  parseQueueMessage,
  QueueMessageSizeError,
  queueMessageByteLength,
  reconciliationQueueMessageSchema,
} from "../queues/messages";

const orgId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const exportId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const eventId = "66666666-6666-4666-8666-666666666666";
const sentryDsn = "https://public@example.ingest.sentry.io/12345";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

class FakeQueue<Message> {
  readonly sent: Message[] = [];

  async send(message: Message): Promise<void> {
    this.sent.push(message);
  }
}

function createFakeQueueMessage(body: unknown): QueueConsumerMessage & {
  acked: boolean;
  retried: boolean;
} {
  return {
    body,
    acked: false,
    retried: false,
    ack() {
      this.acked = true;
    },
    retry() {
      this.retried = true;
    },
  };
}

function createFakeBatch(
  queue: string,
  messages: QueueConsumerMessage[],
): MessageBatch<unknown> & { retriedAll: boolean; ackedAll: boolean } {
  return {
    queue,
    messages: messages as Message<unknown>[],
    metadata: {
      metrics: {
        backlogCount: messages.length,
        backlogBytes: 0,
      },
    },
    retriedAll: false,
    ackedAll: false,
    retryAll() {
      this.retriedAll = true;
    },
    ackAll() {
      this.ackedAll = true;
    },
  } as MessageBatch<unknown> & { retriedAll: boolean; ackedAll: boolean };
}

function createHandlerContext(
  queue = "capveri-extraction-dev",
): QueueHandlerContext {
  return {
    env: {} as AppEnv,
    executionContext: {
      waitUntil(promise: Promise<unknown>) {
        void promise;
      },
      passThroughOnException() {},
    } as ExecutionContext,
    queue,
    metadata: {
      metrics: {
        backlogCount: 0,
        backlogBytes: 0,
      },
    },
  };
}

function createProducerFixture(): {
  producer: QueueProducer;
  extractionQueue: FakeQueue<unknown>;
  reconciliationQueue: FakeQueue<unknown>;
  emailQueue: FakeQueue<unknown>;
  analyticsQueue: FakeQueue<unknown>;
  exportQueue: FakeQueue<unknown>;
} {
  const extractionQueue = new FakeQueue();
  const reconciliationQueue = new FakeQueue();
  const exportQueue = new FakeQueue();
  const emailQueue = new FakeQueue();
  const analyticsQueue = new FakeQueue();
  const producer = createQueueProducer({
    EXTRACTION_QUEUE: extractionQueue as unknown as AppEnv["EXTRACTION_QUEUE"],
    RECONCILIATION_QUEUE:
      reconciliationQueue as unknown as AppEnv["RECONCILIATION_QUEUE"],
    EXPORT_QUEUE: exportQueue as unknown as AppEnv["EXPORT_QUEUE"],
    EMAIL_QUEUE: emailQueue as unknown as AppEnv["EMAIL_QUEUE"],
    ANALYTICS_QUEUE: analyticsQueue as unknown as AppEnv["ANALYTICS_QUEUE"],
  } as AppEnv);

  return {
    producer,
    extractionQueue,
    reconciliationQueue,
    emailQueue,
    analyticsQueue,
    exportQueue,
  };
}

describe("queue message contracts", () => {
  it("accepts compact ID-only extraction messages", () => {
    const message = extractionQueueMessageSchema.parse({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 5,
    });

    expect(queueMessageByteLength(message)).toBeLessThan(
      MAX_QUEUE_MESSAGE_BYTES,
    );
  });

  it("rejects unknown versions and unexpected payload fields", () => {
    expect(() =>
      extractionQueueMessageSchema.parse({
        version: 2,
        jobId,
        documentId,
        organizationId: orgId,
        priority: 5,
      }),
    ).toThrow();
    expect(() =>
      reconciliationQueueMessageSchema.parse({
        version: 1,
        jobId,
        organizationId: orgId,
        fileBytes: "x",
      }),
    ).toThrow();
  });

  it("rejects raw bytes in queue payloads by schema", () => {
    expect(() =>
      emailQueueMessageSchema.parse({
        version: 1,
        messageId,
        recipient: "tenant@example.test",
        template: "welcome",
        data: "x".repeat(1024),
      }),
    ).toThrow();
    expect(() =>
      analyticsQueueMessageSchema.parse({
        version: 1,
        eventId,
        eventName: "document_uploaded",
        propertiesR2Key: "org-a/../payload.json",
      }),
    ).toThrow();
  });

  it("rejects messages over the 64 KB Queue operation boundary", () => {
    expect(() =>
      parseQueueMessage("analytics", {
        version: 1,
        eventId,
        eventName: "x".repeat(MAX_QUEUE_MESSAGE_BYTES),
      }),
    ).toThrow(QueueMessageSizeError);
  });
});

describe("queue producers", () => {
  it("validates and sends messages to the correct Cloudflare Queue bindings", async () => {
    const {
      producer,
      extractionQueue,
      reconciliationQueue,
      exportQueue,
      emailQueue,
      analyticsQueue,
    } = createProducerFixture();

    await producer.enqueueExtraction({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 3,
    });
    await producer.enqueueReconciliation({
      version: 1,
      jobId,
      organizationId: orgId,
    });
    await producer.enqueueExport({
      version: 1,
      jobId,
      exportId,
      organizationId: orgId,
      artifactR2Key: "exports/org-a/export.pdf",
    });
    await producer.enqueueEmail({
      version: 1,
      messageId,
      organizationId: orgId,
      recipient: "owner@example.test",
      template: "welcome",
      dataR2Key: "email/welcome/payload.json",
    });
    await producer.enqueueAnalytics({
      version: 1,
      eventId,
      organizationId: orgId,
      eventName: "signup_completed",
      propertiesR2Key: "analytics/signup/event.json",
    });

    expect(extractionQueue.sent).toHaveLength(1);
    expect(reconciliationQueue.sent).toHaveLength(1);
    expect(exportQueue.sent).toHaveLength(1);
    expect(emailQueue.sent).toHaveLength(1);
    expect(analyticsQueue.sent).toHaveLength(1);
  });
});

describe("queue consumers", () => {
  it("maps Cloudflare queue names to internal queue contracts", () => {
    expect(queueNameFromCloudflareQueue("capveri-extraction")).toBe(
      "extraction",
    );
    expect(queueNameFromCloudflareQueue("capveri-reconciliation-staging")).toBe(
      "reconciliation",
    );
    expect(queueNameFromCloudflareQueue("capveri-unknown")).toBeUndefined();
  });

  it("does not map dead-letter queues to their source contract", () => {
    // A -dlq name shares a keyword with its source queue; it must resolve to
    // undefined so a misrouted DLQ batch is treated as an unknown queue rather
    // than run through the source handler.
    expect(
      queueNameFromCloudflareQueue("capveri-extraction-dlq"),
    ).toBeUndefined();
    expect(
      queueNameFromCloudflareQueue("capveri-reconciliation-dlq"),
    ).toBeUndefined();
  });

  it("passes valid messages to handlers and acknowledges them", async () => {
    const rawMessage = createFakeQueueMessage({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 1,
    });
    const handled: unknown[] = [];
    const invalid: QueueInvalidMessage[] = [];

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      (message) => {
        handled.push(message);
      },
      createHandlerContext(),
      (message) => {
        invalid.push(message);
      },
    );

    expect(handled).toHaveLength(1);
    expect(invalid).toEqual([]);
    expect(rawMessage.acked).toBe(true);
    expect(rawMessage.retried).toBe(false);
  });

  it("dispatches Cloudflare message batches to registered handlers", async () => {
    const rawMessage = createFakeQueueMessage({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 1,
    });
    const batch = createFakeBatch("capveri-extraction-dev", [rawMessage]);
    const handled: unknown[] = [];

    await dispatchQueueBatch(batch, {} as AppEnv, {} as ExecutionContext, {
      extraction(message, _rawMessage, context) {
        handled.push(message);
        expect(context.queue).toBe("capveri-extraction-dev");
      },
    });

    expect(handled).toHaveLength(1);
    expect(rawMessage.acked).toBe(true);
    expect(rawMessage.retried).toBe(false);
  });

  it("retries batches from unknown Cloudflare queues and warns", async () => {
    const batch = createFakeBatch("capveri-unknown-dev", [
      createFakeQueueMessage({}),
    ]);
    const warnings: Error[] = [];
    const originalReportError = globalThis.reportError;
    globalThis.reportError = (error: unknown) => {
      if (error instanceof Error) {
        warnings.push(error);
      }
    };

    try {
      await dispatchQueueBatch(batch, {} as AppEnv, {} as ExecutionContext);
    } finally {
      globalThis.reportError = originalReportError;
    }

    expect(batch.retriedAll).toBe(true);
    expect(batch.ackedAll).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0]?.message ?? "{}")).toMatchObject({
      level: "warn",
      event: "queue_unknown_name",
      queue: "capveri-unknown-dev",
      messageCount: 1,
    });
  });

  it("retries and warns when no domain handler is registered yet", async () => {
    const rawMessage = createFakeQueueMessage({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 1,
    });
    const batch = createFakeBatch("capveri-extraction-dev", [rawMessage]);
    const warnings: Error[] = [];
    const originalReportError = globalThis.reportError;
    globalThis.reportError = (error: unknown) => {
      if (error instanceof Error) {
        warnings.push(error);
      }
    };

    try {
      await dispatchQueueBatch(batch, {} as AppEnv, {} as ExecutionContext);
    } finally {
      globalThis.reportError = originalReportError;
    }

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0]?.message ?? "{}")).toMatchObject({
      level: "warn",
      event: "queue_missing_handler",
      queueName: "extraction",
    });
  });

  it("has a concrete structured invalid-message reporter", () => {
    const calls: Error[] = [];
    const originalReportError = globalThis.reportError;
    globalThis.reportError = (error: unknown) => {
      if (error instanceof Error) {
        calls.push(error);
      }
    };

    try {
      reportInvalidQueueMessage({
        queueName: "extraction",
        reason: "schema",
        detail: "version: Invalid literal value",
        receivedAt: "2026-06-12T00:00:00.000Z",
      });
    } finally {
      globalThis.reportError = originalReportError;
    }

    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.message ?? "{}")).toMatchObject({
      level: "warn",
      event: "queue_invalid_message",
      queueName: "extraction",
      reason: "schema",
    });
  });

  it("reports invalid messages and acknowledges them without retry loops", async () => {
    const rawMessage = createFakeQueueMessage({
      version: 9,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 1,
    });
    const invalid: QueueInvalidMessage[] = [];

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      () => {
        throw new Error("handler should not run");
      },
      createHandlerContext(),
      (message) => {
        invalid.push(message);
      },
    );

    expect(invalid).toMatchObject([
      { queueName: "extraction", reason: "schema" },
    ]);
    expect(rawMessage.acked).toBe(true);
    expect(rawMessage.retried).toBe(false);
  });

  it("retries valid messages when the handler fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const rawMessage = createFakeQueueMessage({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 1,
    });

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      () => {
        throw new Error("transient failure");
      },
      {
        ...createHandlerContext(),
        env: {
          SENTRY_DSN: sentryDsn,
          ENVIRONMENT: "development",
          APP_VERSION: "0.1.0",
        } as unknown as AppEnv,
      },
      () => {
        throw new Error("invalid handler should not run");
      },
    );

    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "\"operation\":\"worker.queue_handler\"",
    );
  });

  it("does not treat handler validation errors as invalid queue payloads", async () => {
    const rawMessage = createFakeQueueMessage({
      version: 1,
      jobId,
      documentId,
      organizationId: orgId,
      priority: 1,
    });
    const invalid: QueueInvalidMessage[] = [];

    await consumeQueueMessage(
      "extraction",
      rawMessage,
      () => {
        z.object({ required: z.string() }).parse({});
      },
      createHandlerContext(),
      (message) => {
        invalid.push(message);
      },
    );

    expect(invalid).toEqual([]);
    expect(rawMessage.acked).toBe(false);
    expect(rawMessage.retried).toBe(true);
  });
});
