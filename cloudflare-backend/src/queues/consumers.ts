import { ZodError } from "zod";
import type { AppEnv } from "../env";
import { captureWorkerException } from "../platform/sentry";
import {
  parseQueueMessage,
  QueueMessageSizeError,
  type QueueMessageByName,
  type QueueName,
} from "./messages";

export type QueueInvalidMessage = {
  queueName: QueueName;
  reason: "schema" | "size";
  detail: string;
  receivedAt: string;
};

export type QueueConsumerMessage = {
  body: unknown;
  readonly attempts?: number;
  ack(): void;
  retry(options?: QueueRetryOptions): void;
};

export type QueueInvalidMessageHandler = (
  invalidMessage: QueueInvalidMessage,
  message: QueueConsumerMessage,
) => void | Promise<void>;

export type QueueMessageHandler<Name extends QueueName> = (
  message: QueueMessageByName[Name],
  rawMessage: QueueConsumerMessage,
  context: QueueHandlerContext,
) => void | Promise<void>;

export type QueueHandlers = Partial<{
  [Name in QueueName]: QueueMessageHandler<Name>;
}>;

export type QueueHandlerContext = {
  env: AppEnv;
  executionContext: ExecutionContext;
  queue: string;
  metadata: MessageBatchMetadata;
};

export function queueNameFromCloudflareQueue(
  queue: string,
): QueueName | undefined {
  // Dead-letter queues share a keyword prefix with their source queue
  // (capveri-extraction-dlq includes "extraction"). This worker is never wired
  // as a DLQ consumer, but guard so a future misconfiguration surfaces as an
  // unknown queue (loud warn + retryAll) instead of silently processing a
  // poison message through the source handler.
  if (queue.endsWith("-dlq")) {
    return undefined;
  }

  if (queue.includes("extraction")) {
    return "extraction";
  }

  if (queue.includes("reconciliation")) {
    return "reconciliation";
  }

  if (queue.includes("export")) {
    return "export";
  }

  if (queue.includes("email")) {
    return "email";
  }

  if (queue.includes("analytics")) {
    return "analytics";
  }

  return undefined;
}

export function reportInvalidQueueMessage(
  invalidMessage: QueueInvalidMessage,
): void {
  globalThis.reportError(
    new Error(
      JSON.stringify({
        level: "warn",
        event: "queue_invalid_message",
        ...invalidMessage,
      }),
    ),
  );
}

function warnQueueDelivery(
  event: string,
  detail: Record<string, unknown>,
): void {
  globalThis.reportError(
    new Error(JSON.stringify({ level: "warn", event, ...detail })),
  );
}

export async function dispatchQueueBatch(
  batch: MessageBatch<unknown>,
  env: AppEnv,
  executionContext: ExecutionContext,
  handlers: QueueHandlers = {},
  onInvalidMessage: QueueInvalidMessageHandler = reportInvalidQueueMessage,
): Promise<void> {
  const queueName = queueNameFromCloudflareQueue(batch.queue);

  if (!queueName) {
    // An unrecognized queue is wired to this consumer but has no name mapping
    // — a deploy/config skew. Retry (not ack) so the messages survive to the
    // DLQ instead of being silently dropped, but surface a warning so the
    // misconfiguration is observable rather than retrying invisibly forever.
    warnQueueDelivery("queue_unknown_name", {
      queue: batch.queue,
      messageCount: batch.messages.length,
    });
    batch.retryAll();
    return;
  }

  for (const message of batch.messages) {
    await consumeKnownQueueMessage(
      queueName,
      message,
      {
        env,
        executionContext,
        queue: batch.queue,
        metadata: batch.metadata,
      },
      handlers,
      onInvalidMessage,
    );
  }
}

export async function consumeQueueMessage<Name extends QueueName>(
  queueName: Name,
  rawMessage: QueueConsumerMessage,
  handler: QueueMessageHandler<Name>,
  context: QueueHandlerContext,
  onInvalidMessage: QueueInvalidMessageHandler,
): Promise<void> {
  let parsedMessage: QueueMessageByName[Name];

  try {
    parsedMessage = parseQueueMessage(queueName, rawMessage.body);
  } catch (error) {
    if (error instanceof ZodError) {
      await onInvalidMessage(
        {
          queueName,
          reason: "schema",
          detail: error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
          receivedAt: new Date().toISOString(),
        },
        rawMessage,
      );
      rawMessage.ack();
      return;
    }

    if (error instanceof QueueMessageSizeError) {
      await onInvalidMessage(
        {
          queueName,
          reason: "size",
          detail: error.message,
          receivedAt: new Date().toISOString(),
        },
        rawMessage,
      );
      rawMessage.ack();
      return;
    }

    throw error;
  }

  try {
    await handler(parsedMessage, rawMessage, context);
    rawMessage.ack();
  } catch (error) {
    // Requesting the retry is the critical action for a durable job queue —
    // it must run before (and regardless of) best-effort exception telemetry.
    // If captureWorkerException / waitUntil ever throws (e.g. a malformed
    // execution context), a telemetry hiccup must not skip the retry or escape
    // this consumer and abort the rest of the batch, silently dropping the job.
    rawMessage.retry(getQueueRetryOptions(error));
    try {
      context.executionContext.waitUntil(
        captureWorkerException(context.env, error, {
          operation: "worker.queue_handler",
          statusCode: 500,
          path: context.queue,
          method: "QUEUE",
        }),
      );
    } catch {
      // Telemetry is best-effort; the retry above is what guarantees the job
      // is not lost.
    }
  }
}

function getQueueRetryOptions(error: unknown): QueueRetryOptions | undefined {
  if (typeof error === "object" && error !== null && "delaySeconds" in error) {
    const delaySeconds = error.delaySeconds;
    if (
      typeof delaySeconds === "number" &&
      Number.isInteger(delaySeconds) &&
      delaySeconds > 0
    ) {
      return { delaySeconds };
    }
  }

  return undefined;
}

async function consumeKnownQueueMessage(
  queueName: QueueName,
  rawMessage: QueueConsumerMessage,
  context: QueueHandlerContext,
  handlers: QueueHandlers,
  onInvalidMessage: QueueInvalidMessageHandler,
): Promise<void> {
  // A missing handler means the message type's consumer is not registered in
  // this deployment (e.g. a producer shipped ahead of its consumer). Retry so
  // the message survives to the DLQ rather than being dropped, but warn so the
  // gap is visible instead of retrying silently.
  const warnMissingHandler = (): void => {
    warnQueueDelivery("queue_missing_handler", {
      queue: context.queue,
      queueName,
    });
    rawMessage.retry();
  };

  switch (queueName) {
    case "extraction":
      if (!handlers.extraction) {
        warnMissingHandler();
        return;
      }
      await consumeQueueMessage(
        "extraction",
        rawMessage,
        handlers.extraction,
        context,
        onInvalidMessage,
      );
      return;
    case "reconciliation":
      if (!handlers.reconciliation) {
        warnMissingHandler();
        return;
      }
      await consumeQueueMessage(
        "reconciliation",
        rawMessage,
        handlers.reconciliation,
        context,
        onInvalidMessage,
      );
      return;
    case "export":
      if (!handlers.export) {
        warnMissingHandler();
        return;
      }
      await consumeQueueMessage(
        "export",
        rawMessage,
        handlers.export,
        context,
        onInvalidMessage,
      );
      return;
    case "email":
      if (!handlers.email) {
        warnMissingHandler();
        return;
      }
      await consumeQueueMessage(
        "email",
        rawMessage,
        handlers.email,
        context,
        onInvalidMessage,
      );
      return;
    case "analytics":
      if (!handlers.analytics) {
        warnMissingHandler();
        return;
      }
      await consumeQueueMessage(
        "analytics",
        rawMessage,
        handlers.analytics,
        context,
        onInvalidMessage,
      );
      return;
  }
}
