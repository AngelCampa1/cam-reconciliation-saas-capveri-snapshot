import type { QueueHandlers } from "../queues/consumers";
import {
  processExtractionQueueMessage,
  type ExtractionServiceDependencies,
} from "../domain/extraction/extraction-service";

export function createLeaseExtractionQueueHandlers(
  dependencies: ExtractionServiceDependencies,
): Pick<QueueHandlers, "extraction"> {
  return {
    async extraction(message, rawMessage) {
      await processExtractionQueueMessage(
        message,
        rawMessage.attempts,
        dependencies,
      );
    },
  };
}
