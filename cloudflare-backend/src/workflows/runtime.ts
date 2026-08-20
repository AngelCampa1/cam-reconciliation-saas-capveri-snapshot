import { createOpenRouterClient } from "../adapters/ai/openrouter";
import { OpenRouterNativePdfExtractionPipeline } from "../adapters/ai/native-pdf-extraction-pipeline";
import { PostHogServerAnalytics } from "../adapters/analytics/posthog";
import { PostgresAuditPipelineEventRepository } from "../adapters/db/audit-pipeline-events";
import { PostgresExtractionJobRepository } from "../adapters/db/extraction-jobs";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { createDocumentStorage } from "../adapters/storage/documents";
import { R2ForensicJsonStore } from "../adapters/storage/forensic-store";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import type { AppEnv } from "../env";
import type { QueueHandlers } from "../queues/consumers";
import { createLeaseExtractionQueueHandlers } from "./lease-extraction";
import { createReconciliationQueueHandlers } from "./reconciliation";
import { PostgresReconciliationRepository } from "../adapters/db/reconciliation";

export function createRuntimeQueueHandlers(env: AppEnv): QueueHandlers {
  const executor = createDirectPostgresExecutor(env);
  const repository = new PostgresExtractionJobRepository(executor);
  const storage = createDocumentStorage(env);
  const client = createOpenRouterClient(env);
  const modelConfig = createExtractionModelConfig(env);
  const pipeline = new OpenRouterNativePdfExtractionPipeline(
    storage,
    client,
    modelConfig,
    {
      persistence: {
        forensicStore: new R2ForensicJsonStore(env.DOCUMENTS_BUCKET),
        auditEvents: new PostgresAuditPipelineEventRepository(executor),
      },
    },
  );

  return {
    ...createLeaseExtractionQueueHandlers({
      repository,
      pipeline,
    }),
    ...createReconciliationQueueHandlers({
      repository: new PostgresReconciliationRepository(executor),
      analytics: new PostHogServerAnalytics(),
      env,
    }),
  };
}
