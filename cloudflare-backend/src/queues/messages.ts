import { z } from "zod";

export const MAX_QUEUE_MESSAGE_BYTES = 64 * 1024;

const uuidSchema = z.string().uuid();
const r2KeySchema = z
  .string()
  .min(1)
  .refine(
    (key) =>
      !key.startsWith("/") &&
      !key.endsWith("/") &&
      !key.includes("\\") &&
      key
        .split("/")
        .every(
          (segment) => segment !== "" && segment !== "." && segment !== "..",
        ),
    "R2 keys must be relative forward-slash object paths",
  );

export const extractionQueueMessageSchema = z
  .object({
    version: z.literal(1),
    jobId: uuidSchema,
    documentId: uuidSchema,
    organizationId: uuidSchema,
    priority: z.number().int().min(0).max(15),
  })
  .strict();

export const reconciliationQueueMessageSchema = z
  .object({
    version: z.literal(1),
    jobId: uuidSchema,
    organizationId: uuidSchema,
  })
  .strict();

export const exportQueueMessageSchema = z
  .object({
    version: z.literal(1),
    jobId: uuidSchema,
    exportId: uuidSchema,
    organizationId: uuidSchema,
    artifactR2Key: r2KeySchema.optional(),
  })
  .strict();

export const emailQueueMessageSchema = z
  .object({
    version: z.literal(1),
    messageId: uuidSchema,
    organizationId: uuidSchema.optional(),
    template: z.string().min(1),
    recipient: z.string().email(),
    dataR2Key: r2KeySchema.optional(),
  })
  .strict();

export const analyticsQueueMessageSchema = z
  .object({
    version: z.literal(1),
    eventId: uuidSchema,
    organizationId: uuidSchema.optional(),
    eventName: z.string().min(1),
    propertiesR2Key: r2KeySchema.optional(),
  })
  .strict();

export type ExtractionQueueMessage = z.infer<
  typeof extractionQueueMessageSchema
>;
export type ReconciliationQueueMessage = z.infer<
  typeof reconciliationQueueMessageSchema
>;
export type ExportQueueMessage = z.infer<typeof exportQueueMessageSchema>;
export type EmailQueueMessage = z.infer<typeof emailQueueMessageSchema>;
export type AnalyticsQueueMessage = z.infer<typeof analyticsQueueMessageSchema>;

export type QueueMessage =
  | ExtractionQueueMessage
  | ReconciliationQueueMessage
  | ExportQueueMessage
  | EmailQueueMessage
  | AnalyticsQueueMessage;

export type QueueName =
  | "extraction"
  | "reconciliation"
  | "export"
  | "email"
  | "analytics";

export const queueMessageSchemas = {
  extraction: extractionQueueMessageSchema,
  reconciliation: reconciliationQueueMessageSchema,
  export: exportQueueMessageSchema,
  email: emailQueueMessageSchema,
  analytics: analyticsQueueMessageSchema,
} as const;

export type QueueMessageByName = {
  extraction: ExtractionQueueMessage;
  reconciliation: ReconciliationQueueMessage;
  export: ExportQueueMessage;
  email: EmailQueueMessage;
  analytics: AnalyticsQueueMessage;
};

export class QueueMessageSizeError extends Error {
  constructor(
    readonly queueName: QueueName,
    readonly byteLength: number,
  ) {
    super(
      `Queue message for ${queueName} is ${byteLength} bytes, exceeding ${MAX_QUEUE_MESSAGE_BYTES}`,
    );
  }
}

export function queueMessageByteLength(message: unknown): number {
  return new TextEncoder().encode(JSON.stringify(message)).byteLength;
}

export function assertQueueMessageSize(
  queueName: QueueName,
  message: unknown,
): void {
  const byteLength = queueMessageByteLength(message);

  if (byteLength > MAX_QUEUE_MESSAGE_BYTES) {
    throw new QueueMessageSizeError(queueName, byteLength);
  }
}

export function parseQueueMessage<Name extends QueueName>(
  queueName: Name,
  body: unknown,
): QueueMessageByName[Name] {
  const schema = queueMessageSchemas[queueName];
  const message = schema.parse(body) as QueueMessageByName[Name];
  assertQueueMessageSize(queueName, message);

  return message;
}
