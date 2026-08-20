import { describe, expect, it } from "vitest";
import type {
  CalculationDataset,
  CalculationJobRecord,
  SnapshotDraft,
} from "../domain/reconciliation/calculator";
import type {
  CalculationJobStatusRecord,
  ReconciliationRepository,
} from "../domain/reconciliation/repository";
import type { AppEnv } from "../env";
import { createReconciliationQueueHandlers } from "../workflows/reconciliation";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const POOL_ID = "55555555-5555-4555-8555-555555555555";
const ENTRY_ID = "66666666-6666-4666-8666-666666666666";
const SNAPSHOT_ID = "77777777-7777-4777-8777-777777777777";

class MemoryRepository implements ReconciliationRepository {
  job: CalculationJobRecord | null = {
    id: JOB_ID,
    organizationId: ORG_ID,
    propertyId: PROPERTY_ID,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    status: "pending",
    forceRecalculate: false,
  };
  draftCount = 0;
  finalizedCount = 0;
  running = false;
  claimSucceeds = true;
  deletedDrafts = false;
  completedSnapshotIds: string[] | null = null;
  failedMessage: string | null = null;
  runningFailed = false;
  insertedSnapshots: SnapshotDraft[] = [];
  persistCalls = 0;

  async getCalculationJob(): Promise<CalculationJobRecord | null> {
    return this.job;
  }

  async markCalculationRunning(): Promise<boolean> {
    this.running = true;
    return this.claimSucceeds;
  }

  async loadCalculationDataset(input: {
    job: CalculationJobRecord;
  }): Promise<CalculationDataset> {
    return dataset(input.job);
  }

  async countDraftSnapshots(): Promise<number> {
    return this.draftCount;
  }

  async countFinalizedSnapshots(): Promise<number> {
    return this.finalizedCount;
  }

  async deleteDraftSnapshots(): Promise<void> {
    this.deletedDrafts = true;
  }

  async insertCalculationSnapshots(input: {
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    this.insertedSnapshots = input.snapshots;
    return [SNAPSHOT_ID];
  }

  async completeCalculationJob(input: {
    snapshotIds: string[];
  }): Promise<void> {
    this.completedSnapshotIds = input.snapshotIds;
  }

  async persistCalculationResults(input: {
    forceRecalculate: boolean;
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    this.persistCalls += 1;
    if (input.forceRecalculate) {
      await this.deleteDraftSnapshots();
    }
    const ids = await this.insertCalculationSnapshots({
      snapshots: input.snapshots,
    });
    await this.completeCalculationJob({ snapshotIds: ids });
    return ids;
  }

  async markCalculationFailed(input: { errorMessage: string }): Promise<void> {
    this.failedMessage = input.errorMessage;
  }

  async markRunningCalculationFailed(input: {
    errorMessage: string;
  }): Promise<boolean> {
    if (this.job?.status !== "running") {
      return false;
    }

    this.runningFailed = true;
    this.failedMessage = input.errorMessage;
    return true;
  }

  async hasFullAccess(): Promise<boolean> {
    return true;
  }

  async createCalculationJob(): Promise<never> {
    throw new Error("not used");
  }

  async markCalculationEnqueueFailed(): Promise<void> {
    return undefined;
  }

  async getJobStatus(): Promise<CalculationJobStatusRecord | null> {
    return null;
  }

  async getSnapshot(): Promise<null> {
    return null;
  }

  async listSnapshots(): Promise<never> {
    throw new Error("not used");
  }

  async finalizeSnapshot(): Promise<never> {
    throw new Error("not used");
  }

  async finalizeBatch(): Promise<never> {
    throw new Error("not used");
  }

  async updateCell(): Promise<never> {
    throw new Error("not used");
  }

  async getLeaseCapProfile(): Promise<null> {
    return null;
  }

  async listFinalizedSnapshotsForLease(): Promise<[]> {
    return [];
  }

  async recordFeatureUse(): Promise<void> {
    return undefined;
  }
}

class MemoryAnalytics {
  captures: Array<{
    eventName: string;
    organizationId: string;
    properties: Record<string, unknown>;
  }> = [];

  async capture(
    _env: AppEnv,
    input: {
      eventName: string;
      organizationId: string;
      properties?: Record<string, unknown>;
    },
  ): Promise<void> {
    this.captures.push({
      eventName: input.eventName,
      organizationId: input.organizationId,
      properties: input.properties ?? {},
    });
  }
}

describe("reconciliation queue workflow", () => {
  it("calculates draft snapshots and completes queued jobs", async () => {
    const repository = new MemoryRepository();
    const analytics = new MemoryAnalytics();
    const handler = createReconciliationQueueHandlers({
      repository,
      analytics,
      env: {} as AppEnv,
    }).reconciliation;

    await handler?.(
      { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
      {
        body: {},
        ack() {},
        retry() {},
      },
      queueContext(),
    );

    expect(repository.running).toBe(true);
    expect(repository.insertedSnapshots).toHaveLength(1);
    expect(repository.insertedSnapshots[0]).toMatchObject({
      lease_id: LEASE_ID,
      total_operating_expenses: "100000.00",
      grossed_up_expenses: "100000.00",
      tenant_share_before_cap: "10000.00",
      tenant_share_after_cap: "10000.00",
      admin_fee: "500.00",
      total_recovery: "10500.00",
      organization_id: ORG_ID,
    });
    expect(repository.completedSnapshotIds).toEqual([SNAPSHOT_ID]);
    expect(repository.failedMessage).toBeNull();
    // Insert + complete go through the single atomic persist method, not the
    // legacy three separate writes, so a mid-write failure cannot orphan a
    // partial set of draft snapshots.
    expect(repository.persistCalls).toBe(1);
    expect(analytics.captures).toEqual([
      {
        eventName: "reconciliation_calculation_completed",
        organizationId: ORG_ID,
        properties: {
          job_id: JOB_ID,
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          force_recalculate: false,
          snapshot_count: 1,
        },
      },
    ]);
  });

  it("deletes superseded drafts and persists atomically on force_recalculate", async () => {
    const repository = new MemoryRepository();
    repository.draftCount = 1;
    repository.job = {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "pending",
      forceRecalculate: true,
    };
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await handler?.(
      { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
      {
        body: {},
        ack() {},
        retry() {},
      },
      queueContext(),
    );

    // The draft delete now happens inside the single atomic persist call, not
    // as a separate pre-compute write.
    expect(repository.persistCalls).toBe(1);
    expect(repository.deletedDrafts).toBe(true);
    expect(repository.insertedSnapshots).toHaveLength(1);
    expect(repository.completedSnapshotIds).toEqual([SNAPSHOT_ID]);
    expect(repository.failedMessage).toBeNull();
  });

  it("fails pending jobs when draft snapshots already exist", async () => {
    const repository = new MemoryRepository();
    repository.draftCount = 1;
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await expect(
      handler?.(
        { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
        {
          body: {},
          ack() {},
          retry() {},
        },
        queueContext(),
      ),
    ).rejects.toThrow("Draft reconciliation snapshots already exist");

    expect(repository.insertedSnapshots).toEqual([]);
    expect(repository.completedSnapshotIds).toBeNull();
    expect(repository.failedMessage).toContain(
      "Draft reconciliation snapshots",
    );
  });

  it("fails pending jobs when a finalized snapshot already exists for the period", async () => {
    const repository = new MemoryRepository();
    repository.finalizedCount = 1;
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await expect(
      handler?.(
        { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
        {
          body: {},
          ack() {},
          retry() {},
        },
        queueContext(),
      ),
    ).rejects.toThrow("finalized reconciliation snapshot already exists");

    expect(repository.insertedSnapshots).toEqual([]);
    expect(repository.completedSnapshotIds).toBeNull();
    expect(repository.failedMessage).toContain(
      "finalized reconciliation snapshot",
    );
  });

  it("does not let force_recalculate delete or recalculate over a finalized period", async () => {
    const repository = new MemoryRepository();
    repository.finalizedCount = 1;
    repository.job = {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "pending",
      forceRecalculate: true,
    };
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await expect(
      handler?.(
        { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
        {
          body: {},
          ack() {},
          retry() {},
        },
        queueContext(),
      ),
    ).rejects.toThrow("finalized reconciliation snapshot already exists");

    expect(repository.deletedDrafts).toBe(false);
    expect(repository.insertedSnapshots).toEqual([]);
    expect(repository.completedSnapshotIds).toBeNull();
  });

  it("exits without work when another consumer already claimed the job", async () => {
    const repository = new MemoryRepository();
    repository.claimSucceeds = false;
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await handler?.(
      { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
      {
        body: {},
        ack() {},
        retry() {},
      },
      queueContext(),
    );

    expect(repository.insertedSnapshots).toEqual([]);
    expect(repository.completedSnapshotIds).toBeNull();
    expect(repository.failedMessage).toBeNull();
  });

  it("fails redelivered running jobs instead of silently acking them", async () => {
    const repository = new MemoryRepository();
    repository.job = {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "running",
      forceRecalculate: false,
    };
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await handler?.(
      { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
      {
        body: {},
        attempts: 2,
        ack() {},
        retry() {},
      },
      queueContext(),
    );

    expect(repository.running).toBe(false);
    expect(repository.runningFailed).toBe(true);
    expect(repository.failedMessage).toContain("redelivered");
    expect(repository.persistCalls).toBe(0);
    expect(repository.completedSnapshotIds).toBeNull();
  });

  it("leaves first-delivery running jobs alone", async () => {
    const repository = new MemoryRepository();
    repository.job = {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "running",
      forceRecalculate: false,
    };
    const handler = createReconciliationQueueHandlers({
      repository,
    }).reconciliation;

    await handler?.(
      { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
      {
        body: {},
        attempts: 1,
        ack() {},
        retry() {},
      },
      queueContext(),
    );

    expect(repository.running).toBe(false);
    expect(repository.runningFailed).toBe(false);
    expect(repository.failedMessage).toBeNull();
    expect(repository.persistCalls).toBe(0);
  });

  it.each(["completed", "failed"] as const)(
    "leaves redelivered %s jobs alone",
    async (status) => {
      const repository = new MemoryRepository();
      repository.job = {
        id: JOB_ID,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        status,
        forceRecalculate: false,
      };
      const handler = createReconciliationQueueHandlers({
        repository,
      }).reconciliation;

      await handler?.(
        { version: 1, jobId: JOB_ID, organizationId: ORG_ID },
        {
          body: {},
          attempts: 2,
          ack() {},
          retry() {},
        },
        queueContext(),
      );

      expect(repository.running).toBe(false);
      expect(repository.runningFailed).toBe(false);
      expect(repository.failedMessage).toBeNull();
      expect(repository.persistCalls).toBe(0);
    },
  );
});

function dataset(job: CalculationJobRecord): CalculationDataset {
  return {
    job,
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: "0.95",
    },
    leases: [
      {
        id: LEASE_ID,
        tenantName: "Acme",
        startDate: "2025-01-01",
        endDate: null,
        tenantSqft: "1000",
        recoveryProfile: {
          pro_rata_share: "0.10",
          admin_fee_percentage: "0.05",
          cap_type: "none",
          excluded_pools: [],
        },
        termVersionId: null,
        versionProRataShare: null,
        versionAdminFeePercentage: null,
        versionManagementFeePercentage: null,
        versionBaseYear: null,
        versionBaseYearAmount: null,
        versionCapType: null,
        versionCapRate: null,
        versionExcludedPools: null,
      },
    ],
    glEntries: [
      {
        id: ENTRY_ID,
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: "2026-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: POOL_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_ID,
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

function queueContext() {
  return {
    env: {} as never,
    executionContext: {} as never,
    queue: "capveri-reconciliation",
    metadata: {} as never,
  };
}
