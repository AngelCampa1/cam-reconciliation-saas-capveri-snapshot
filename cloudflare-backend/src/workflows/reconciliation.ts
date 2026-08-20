import { calculateReconciliationSnapshots } from "../domain/reconciliation/calculator";
import type { ReconciliationRepository } from "../domain/reconciliation/repository";
import type { QueueConsumerMessage, QueueHandlers } from "../queues/consumers";
import type { ReconciliationQueueMessage } from "../queues/messages";
import type { AppEnv } from "../env";
import type { ServerAnalytics } from "../adapters/analytics/posthog";

export function createReconciliationQueueHandlers(dependencies: {
  repository: ReconciliationRepository;
  analytics?: ServerAnalytics;
  env?: AppEnv;
}): QueueHandlers {
  const runner = new ReconciliationJobRunner(
    dependencies.repository,
    dependencies.analytics,
    dependencies.env,
  );

  return {
    reconciliation: (message, rawMessage) => runner.run(message, rawMessage),
  };
}

class ReconciliationJobRunner {
  constructor(
    private readonly repository: ReconciliationRepository,
    private readonly analytics?: ServerAnalytics,
    private readonly env?: AppEnv,
  ) {}

  async run(
    message: ReconciliationQueueMessage,
    rawMessage?: QueueConsumerMessage,
  ): Promise<void> {
    const job = await this.repository.getCalculationJob({
      jobId: message.jobId,
      organizationId: message.organizationId,
    });

    if (!job) {
      return;
    }

    if (job.status !== "pending") {
      if (job.status === "running" && isRedelivery(rawMessage)) {
        await this.repository.markRunningCalculationFailed({
          jobId: job.id,
          organizationId: job.organizationId,
          errorMessage:
            "Reconciliation job was redelivered while still running; marking failed so it can be retried.",
          errorDetails: {
            type: "QueueRedelivery",
            attempts: rawMessage?.attempts ?? null,
            message:
              "The queue redelivered this job after it had already been claimed as running.",
          },
        });
      }

      return;
    }

    const claimed = await this.repository.markCalculationRunning({
      jobId: job.id,
      organizationId: job.organizationId,
    });

    if (!claimed) {
      return;
    }

    try {
      const draftCount = await this.repository.countDraftSnapshots({
        propertyId: job.propertyId,
        organizationId: job.organizationId,
        periodStart: job.periodStart,
        periodEnd: job.periodEnd,
      });

      if (draftCount > 0 && !job.forceRecalculate) {
        throw new Error(
          "Draft reconciliation snapshots already exist for this property and period. Use force_recalculate=true to delete existing drafts and recalculate.",
        );
      }

      // Defense-in-depth: the calculate route rejects finalized periods at job
      // creation, but a job created before the period was finalized could still
      // run after. A finalized snapshot is an immutable audit record; never
      // recalculate over it (force_recalculate only deletes drafts).
      const finalizedCount = await this.repository.countFinalizedSnapshots({
        propertyId: job.propertyId,
        organizationId: job.organizationId,
        periodStart: job.periodStart,
        periodEnd: job.periodEnd,
      });

      if (finalizedCount > 0) {
        throw new Error(
          "A finalized reconciliation snapshot already exists for this property and period. Finalized snapshots are immutable and cannot be recalculated.",
        );
      }

      const dataset = await this.repository.loadCalculationDataset({ job });
      const snapshots = await calculateReconciliationSnapshots(dataset);

      // Delete superseded drafts (force_recalculate), insert the computed
      // snapshots, and mark the job completed atomically in one transaction so
      // a mid-write failure never leaves an incomplete subset of draft
      // snapshots behind. Compute happens BEFORE the transaction opens to keep
      // it short; deleting drafts after the dataset load is safe because the
      // dataset never reads current-period drafts.
      const snapshotIds = await this.repository.persistCalculationResults({
        jobId: job.id,
        organizationId: job.organizationId,
        propertyId: job.propertyId,
        periodStart: job.periodStart,
        periodEnd: job.periodEnd,
        forceRecalculate: job.forceRecalculate,
        snapshots,
      });
      await captureReconciliationEvent(this.analytics, this.env, {
        eventName: "reconciliation_calculation_completed",
        organizationId: job.organizationId,
        properties: {
          job_id: job.id,
          property_id: job.propertyId,
          period_start: job.periodStart,
          period_end: job.periodEnd,
          force_recalculate: job.forceRecalculate,
          snapshot_count: snapshotIds.length,
        },
      });
    } catch (error) {
      await this.repository.markCalculationFailed({
        jobId: job.id,
        organizationId: job.organizationId,
        errorMessage: errorMessage(error),
        errorDetails: {
          type: error instanceof Error ? error.name : typeof error,
          message: errorMessage(error),
        },
      });
      throw error;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRedelivery(rawMessage: QueueConsumerMessage | undefined): boolean {
  return (rawMessage?.attempts ?? 1) > 1;
}

async function captureReconciliationEvent(
  analytics: ServerAnalytics | undefined,
  env: AppEnv | undefined,
  input: {
    eventName: string;
    organizationId: string;
    properties: Record<string, unknown>;
  },
): Promise<void> {
  if (!analytics || !env) {
    return;
  }

  try {
    await analytics.capture(env, input);
  } catch {
    return;
  }
}
