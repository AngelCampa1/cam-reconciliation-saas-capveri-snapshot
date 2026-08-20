import type { AppEnv } from "../env";
import {
  assertQueueMessageSize,
  analyticsQueueMessageSchema,
  emailQueueMessageSchema,
  exportQueueMessageSchema,
  extractionQueueMessageSchema,
  reconciliationQueueMessageSchema,
  type AnalyticsQueueMessage,
  type EmailQueueMessage,
  type ExportQueueMessage,
  type ExtractionQueueMessage,
  type QueueName,
  type ReconciliationQueueMessage,
} from "./messages";

export type QueueProducer = {
  enqueueExtraction(
    message: ExtractionQueueMessage,
    options?: QueueSendOptions,
  ): Promise<void>;
  enqueueReconciliation(message: ReconciliationQueueMessage): Promise<void>;
  enqueueExport(message: ExportQueueMessage): Promise<void>;
  enqueueEmail(message: EmailQueueMessage): Promise<void>;
  enqueueAnalytics(message: AnalyticsQueueMessage): Promise<void>;
};

export function createQueueProducer(env: AppEnv): QueueProducer {
  return new CloudflareQueueProducer(env);
}

class CloudflareQueueProducer implements QueueProducer {
  constructor(private readonly env: AppEnv) {}

  enqueueExtraction(
    message: ExtractionQueueMessage,
    options?: QueueSendOptions,
  ): Promise<void> {
    return sendValidated(
      "extraction",
      this.env.EXTRACTION_QUEUE,
      extractionQueueMessageSchema.parse(message),
      options,
    );
  }

  enqueueReconciliation(message: ReconciliationQueueMessage): Promise<void> {
    return sendValidated(
      "reconciliation",
      this.env.RECONCILIATION_QUEUE,
      reconciliationQueueMessageSchema.parse(message),
    );
  }

  enqueueExport(message: ExportQueueMessage): Promise<void> {
    return sendValidated(
      "export",
      this.env.EXPORT_QUEUE,
      exportQueueMessageSchema.parse(message),
    );
  }

  enqueueEmail(message: EmailQueueMessage): Promise<void> {
    return sendValidated(
      "email",
      this.env.EMAIL_QUEUE,
      emailQueueMessageSchema.parse(message),
    );
  }

  enqueueAnalytics(message: AnalyticsQueueMessage): Promise<void> {
    return sendValidated(
      "analytics",
      this.env.ANALYTICS_QUEUE,
      analyticsQueueMessageSchema.parse(message),
    );
  }
}

async function sendValidated<Message>(
  queueName: QueueName,
  queue: Queue<Message>,
  message: Message,
  options?: QueueSendOptions,
): Promise<void> {
  assertQueueMessageSize(queueName, message);
  await queue.send(message, options);
}
