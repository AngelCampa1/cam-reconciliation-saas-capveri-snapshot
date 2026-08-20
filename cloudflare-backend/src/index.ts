import { createApp } from "./app";
import type { AppEnv } from "./env";
import {
  dispatchQueueBatch,
  queueNameFromCloudflareQueue,
} from "./queues/consumers";
import { createRuntimeQueueHandlers } from "./workflows/runtime";
export { RateLimiterDurableObject } from "./platform/cloudflare";
export { AiContextNonceDurableObject } from "./platform/cloudflare";

const app = createApp();

export default {
  fetch(request, env, executionContext) {
    return app.fetch(request, env, executionContext);
  },
  queue(batch, env, executionContext) {
    const queueName = queueNameFromCloudflareQueue(batch.queue);
    const handlers =
      queueName === "extraction" || queueName === "reconciliation"
        ? createRuntimeQueueHandlers(env)
        : {};

    return dispatchQueueBatch(batch, env, executionContext, handlers);
  },
} satisfies ExportedHandler<AppEnv>;
