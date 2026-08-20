import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  ActualBilledRepository,
  ReconciliationRecoveryRecord,
} from "../domain/actual-billed/repository";
import {
  type BatchFinalizeResult,
  type CalculationJobStatusRecord,
  type CreateCalculationJobResult,
  type EditableReconciliationField,
  type FinalizeSnapshotResult,
  type ReconciliationRepository,
  type ReconciliationSnapshotRecord,
  type SnapshotListFilters,
  type SnapshotListResult,
  type UpdateCellResult,
} from "../domain/reconciliation/repository";
import type { AppEnv } from "../env";
import { createReconciliationRoutes } from "../http/reconciliation-routes";
import type {
  ReconciliationResultsEmailInput,
  ReconciliationResultsEmailSender,
} from "../http/reconciliation-routes";
import type { AuthVariables } from "../middleware/auth";
import type {
  CalculationDataset,
  CalculationJobRecord,
  SnapshotDraft,
} from "../domain/reconciliation/calculator";
import type { ReconciliationQueueMessage } from "../queues/messages";
import type { QueueProducer } from "../queues/producers";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const SNAPSHOT_ID = "55555555-5555-4555-8555-555555555555";
const JOB_ID = "66666666-6666-4666-8666-666666666666";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryReconciliationRepository implements ReconciliationRepository {
  lastListInput: SnapshotListFilters | null = null;
  fullAccess = true;
  createCalculationJobResult: CreateCalculationJobResult = {
    state: "created",
    jobId: JOB_ID,
    organizationId: ORG_ID,
  };
  lastCreateCalculationJobInput: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    forceRecalculate: boolean;
  } | null = null;
  markEnqueueFailedInput: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
  } | null = null;
  workflowJob: CalculationJobRecord | null = null;
  running = false;
  completedSnapshotIds: string[] | null = null;
  insertedSnapshots: SnapshotDraft[] = [];
  job: CalculationJobStatusRecord | null = {
    job_id: JOB_ID,
    status: "completed",
    property_id: PROPERTY_ID,
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    total_leases: 2,
    processed_leases: 2,
    progress_percentage: 100,
    snapshot_ids: [SNAPSHOT_ID],
    error_message: null,
    potential_recovery_total: "1200.50",
    created_at: "2026-06-12T00:00:00Z",
    started_at: "2026-06-12T00:01:00Z",
    completed_at: "2026-06-12T00:02:00Z",
  };
  snapshot: ReconciliationSnapshotRecord | null = {
    id: SNAPSHOT_ID,
    organization_id: ORG_ID,
    property_id: PROPERTY_ID,
    lease_id: LEASE_ID,
    period_start_date: "2026-01-01",
    period_end_date: "2026-12-31",
    status: "draft",
    total_operating_expenses: "1000.00",
    admin_fee: "100.00",
    total_recovery: "1200.50",
    calculation_trace: [{ step: "tenant_share" }],
    manual_overrides: {},
    finalized_at: null,
    finalized_by_user_id: null,
    created_at: "2026-06-12T00:00:00Z",
  };
  getSnapshotError: Error | null = null;
  finalizeResult: FinalizeSnapshotResult = {
    state: "finalized",
    snapshot: {
      id: SNAPSHOT_ID,
      status: "finalized",
      finalized_at: "2026-06-12T12:00:00.000Z",
      finalized_by_user_id: USER_ID,
    },
  };
  batchFinalizeResult: BatchFinalizeResult = {
    state: "completed",
    total_attempted: 2,
    total_succeeded: 1,
    total_failed: 1,
    results: [
      { snapshot_id: SNAPSHOT_ID, success: true, error_message: null },
      {
        snapshot_id: "55555555-5555-4555-8555-555555555556",
        success: false,
        error_message: "Calculation trace is missing or empty",
      },
    ],
    message: "1 of 2 snapshots finalized successfully, 1 failed",
  };
  updateCellResult: UpdateCellResult | null = null;

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async createCalculationJob(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    forceRecalculate: boolean;
  }): Promise<CreateCalculationJobResult> {
    this.lastCreateCalculationJobInput = input;
    return this.createCalculationJobResult;
  }

  async markCalculationEnqueueFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<void> {
    this.markEnqueueFailedInput = input;
  }

  async getCalculationJob(): Promise<CalculationJobRecord | null> {
    return this.workflowJob;
  }

  async markCalculationRunning(): Promise<boolean> {
    this.running = true;
    return true;
  }

  async loadCalculationDataset(input: {
    job: CalculationJobRecord;
  }): Promise<CalculationDataset> {
    return calculationDataset(input.job);
  }

  async countDraftSnapshots(): Promise<number> {
    return 0;
  }

  async countFinalizedSnapshots(): Promise<number> {
    return 0;
  }

  async deleteDraftSnapshots(): Promise<void> {
    return undefined;
  }

  async insertCalculationSnapshots(input: {
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    this.insertedSnapshots = input.snapshots;
    return input.snapshots.map((snapshot) => snapshot.lease_id);
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
    if (input.forceRecalculate) {
      await this.deleteDraftSnapshots();
    }
    const ids = await this.insertCalculationSnapshots({
      snapshots: input.snapshots,
    });
    await this.completeCalculationJob({ snapshotIds: ids });
    return ids;
  }

  async markCalculationFailed(): Promise<void> {
    return undefined;
  }

  async markRunningCalculationFailed(): Promise<boolean> {
    return false;
  }

  async getJobStatus(input: {
    jobId: string;
    organizationId: string;
  }): Promise<CalculationJobStatusRecord | null> {
    return input.jobId === JOB_ID && input.organizationId === ORG_ID
      ? this.job
      : null;
  }

  async getSnapshot(input: {
    snapshotId: string;
    organizationId: string;
    includeTrace: boolean;
  }): Promise<ReconciliationSnapshotRecord | null> {
    if (this.getSnapshotError) {
      throw this.getSnapshotError;
    }
    if (input.snapshotId !== SNAPSHOT_ID || input.organizationId !== ORG_ID) {
      return null;
    }

    if (!this.snapshot) {
      return null;
    }

    return input.includeTrace
      ? this.snapshot
      : { ...this.snapshot, calculation_trace: [] };
  }

  async listSnapshots(input: SnapshotListFilters): Promise<SnapshotListResult> {
    this.lastListInput = input;

    return {
      items: [
        {
          id: SNAPSHOT_ID,
          property_id: PROPERTY_ID,
          lease_id: LEASE_ID,
          period_start_date: "2026-01-01",
          period_end_date: "2026-12-31",
          status: "draft",
          total_recovery: "1200.50",
          tenant_share_after_cap: "1100.50",
          admin_fee: "100.00",
          is_finalized: false,
          finalized_at: null,
          created_at: "2026-06-12T00:00:00Z",
          tenant_name: "Acme Retail",
          property_name: "Main Plaza",
        },
      ],
      total: 1,
      page: input.page,
      page_size: input.size,
    };
  }

  async finalizeSnapshot(): Promise<FinalizeSnapshotResult> {
    return this.finalizeResult;
  }

  async finalizeBatch(): Promise<BatchFinalizeResult> {
    return this.batchFinalizeResult;
  }

  async updateCell(input: {
    cellId: string;
    snapshotId: string;
    organizationId: string;
    fieldName: EditableReconciliationField;
    value: string;
    userId: string;
    updatedAt: string;
  }): Promise<UpdateCellResult> {
    if (this.updateCellResult) {
      return this.updateCellResult;
    }

    return {
      state: "updated",
      cell: {
        id: input.cellId,
        snapshot_id: input.snapshotId,
        field_name: input.fieldName,
        value: input.value,
        is_manual_override: true,
        updated_at: input.updatedAt,
        updated_by: input.userId,
      },
    };
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

class FakeQueueProducer implements QueueProducer {
  reconciliationMessages: ReconciliationQueueMessage[] = [];
  reconciliationError: Error | null = null;

  async enqueueExtraction(): Promise<void> {
    return undefined;
  }

  async enqueueReconciliation(
    message: ReconciliationQueueMessage,
  ): Promise<void> {
    if (this.reconciliationError) {
      throw this.reconciliationError;
    }
    this.reconciliationMessages.push(message);
  }

  async enqueueExport(): Promise<void> {
    return undefined;
  }

  async enqueueEmail(): Promise<void> {
    return undefined;
  }

  async enqueueAnalytics(): Promise<void> {
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

class MemoryResultsEmailSender implements ReconciliationResultsEmailSender {
  sends: ReconciliationResultsEmailInput[] = [];
  error: Error | null = null;

  async send(input: ReconciliationResultsEmailInput): Promise<boolean> {
    if (this.error) {
      throw this.error;
    }
    this.sends.push(input);
    return true;
  }
}

class MemoryBillingExposureRepository implements Pick<
  ActualBilledRepository,
  "loadBillingExposureDataset"
> {
  propertyExists = true;
  snapshots: ReconciliationRecoveryRecord[] = [
    { lease_id: LEASE_ID, total_recovery: "1200.50" },
  ];
  billedRows: Array<{ billed_amount: string }> = [];
  lastInput:
    | Parameters<ActualBilledRepository["loadBillingExposureDataset"]>[0]
    | null = null;

  async loadBillingExposureDataset(
    input: Parameters<ActualBilledRepository["loadBillingExposureDataset"]>[0],
  ): Promise<
    Awaited<ReturnType<ActualBilledRepository["loadBillingExposureDataset"]>>
  > {
    this.lastInput = input;
    return {
      propertyExists: this.propertyExists,
      snapshots: this.snapshots,
      billedRows: this.billedRows,
    };
  }
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "admin",
): AuthenticatedUserContext {
  const context: AuthenticatedUserContext = {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-12T00:00:00Z",
      updatedAt: "2026-06-12T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };

  if (role === "tenant") {
    context.tenantUser = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: USER_ID,
      organizationId: ORG_ID,
      contactName: "Tenant User",
      contactEmail: "tenant@example.test",
      createdAt: "2026-06-12T00:00:00Z",
    };
  }

  return context;
}

function createTestApp(
  options: {
    repository?: MemoryReconciliationRepository;
    queueProducer?: FakeQueueProducer;
    analytics?: MemoryAnalytics;
    resultsEmailSender?: MemoryResultsEmailSender;
    actualBilledRepository?: MemoryBillingExposureRepository;
    useDefaultResultsEmailSender?: boolean;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
) {
  const repository = options.repository ?? new MemoryReconciliationRepository();
  const queueProducer = options.queueProducer ?? new FakeQueueProducer();
  const analytics = options.analytics ?? new MemoryAnalytics();
  const resultsEmailSender =
    options.resultsEmailSender ?? new MemoryResultsEmailSender();
  const actualBilledRepository =
    options.actualBilledRepository ?? new MemoryBillingExposureRepository();
  const context = createAuthContext(options.role);
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createReconciliationRoutes({
      repository,
      actualBilledRepository,
      queueProducer,
      analytics,
      ...(options.useDefaultResultsEmailSender ? {} : { resultsEmailSender }),
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
      clock: () => new Date("2026-06-12T12:00:00.000Z"),
    }),
  );

  return {
    app,
    repository,
    actualBilledRepository,
    queueProducer,
    analytics,
    resultsEmailSender,
  };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    APP_BASE_URL: "https://app.capveri.test",
  } as unknown as AppEnv;
}

function cellId(fieldName = "total_recovery"): string {
  return globalThis.btoa(`${SNAPSHOT_ID}:${fieldName}`);
}

function calculationDataset(job: CalculationJobRecord): CalculationDataset {
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
        tenantName: "Acme Retail",
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
        id: "77777777-7777-4777-8777-777777777777",
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: "2026-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: "88888888-8888-4888-8888-888888888888",
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

describe("reconciliation routes", () => {
  it("creates calculation jobs and enqueues reconciliation work", async () => {
    const { app, repository, queueProducer } = createTestApp({
      role: "member",
    });
    const response = await app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          force_recalculate: true,
        }),
      },
      env(),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      job_id: JOB_ID,
      status: "pending",
      message: `Reconciliation calculation started. Use job_id ${JOB_ID} to check status.`,
    });
    expect(repository.lastCreateCalculationJobInput).toEqual({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      forceRecalculate: true,
    });
    expect(queueProducer.reconciliationMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        organizationId: ORG_ID,
      },
    ]);
    expect(repository.running).toBe(false);
    expect(repository.completedSnapshotIds).toBeNull();
  });

  it("runs the reconciliation queue inline only for local E2E environments", async () => {
    const repository = new MemoryReconciliationRepository();
    repository.workflowJob = {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "pending",
      forceRecalculate: true,
    };
    const { app, queueProducer } = createTestApp({
      repository,
      role: "member",
    });
    const response = await app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          force_recalculate: true,
        }),
      },
      {
        ...env(),
        LOCAL_E2E_INLINE_RECONCILIATION_QUEUE: "1",
      } as AppEnv,
    );

    expect(response.status).toBe(202);
    expect(queueProducer.reconciliationMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        organizationId: ORG_ID,
      },
    ]);
    expect(repository.running).toBe(true);
    expect(repository.insertedSnapshots).toHaveLength(1);
    expect(repository.completedSnapshotIds).toEqual([LEASE_ID]);
  });

  it("does not run the local inline reconciliation queue in production", async () => {
    const repository = new MemoryReconciliationRepository();
    repository.workflowJob = {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "pending",
      forceRecalculate: true,
    };
    const { app, queueProducer } = createTestApp({
      repository,
      role: "member",
    });
    const response = await app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          force_recalculate: true,
        }),
      },
      {
        ...env(),
        ENVIRONMENT: "production",
        LOCAL_E2E_INLINE_RECONCILIATION_QUEUE: "1",
      } as unknown as AppEnv,
    );

    expect(response.status).toBe(202);
    expect(queueProducer.reconciliationMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        organizationId: ORG_ID,
      },
    ]);
    expect(repository.running).toBe(false);
    expect(repository.completedSnapshotIds).toBeNull();
  });

  it("rejects calculation submission without full access", async () => {
    const repository = new MemoryReconciliationRepository();
    repository.fullAccess = false;
    const { app, queueProducer } = createTestApp({
      repository,
      role: "member",
    });
    const response = await app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
        }),
      },
      env(),
    );

    expect(response.status).toBe(402);
    expect(repository.lastCreateCalculationJobInput).toBeNull();
    expect(queueProducer.reconciliationMessages).toEqual([]);
  });

  it("returns property and active lease calculation submission errors", async () => {
    const missingProperty = new MemoryReconciliationRepository();
    missingProperty.createCalculationJobResult = {
      state: "property_not_found",
    };
    const noLeases = new MemoryReconciliationRepository();
    noLeases.createCalculationJobResult = { state: "no_active_leases" };
    const finalizedPeriod = new MemoryReconciliationRepository();
    finalizedPeriod.createCalculationJobResult = { state: "period_finalized" };

    const propertyResponse = await createTestApp({
      repository: missingProperty,
      role: "member",
    }).app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
        }),
      },
      env(),
    );
    const leaseResponse = await createTestApp({
      repository: noLeases,
      role: "member",
    }).app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
        }),
      },
      env(),
    );

    const finalizedResponse = await createTestApp({
      repository: finalizedPeriod,
      role: "member",
    }).app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          force_recalculate: true,
        }),
      },
      env(),
    );

    expect(propertyResponse.status).toBe(404);
    expect(leaseResponse.status).toBe(422);
    await expect(leaseResponse.json()).resolves.toMatchObject({
      detail: "no_active_leases_for_period",
    });
    expect(finalizedResponse.status).toBe(409);
    await expect(finalizedResponse.json()).resolves.toMatchObject({
      error: { code: "period_already_finalized" },
    });
  });

  it("rejects impossible calendar dates in the calculation period", async () => {
    // A shape-only regex accepted 2025-02-30 etc., which the driver's Date
    // coercion silently rolled forward before the ::date bind — shifting the
    // period denominator and every proration. `.date()` must reject these.
    const invalidDates = [
      "2025-02-30",
      "2025-13-01",
      "2025-04-31",
      "2025-00-05",
      "2025-1-1",
      "2025/01/01",
    ];
    for (const bad of invalidDates) {
      const { app, queueProducer } = createTestApp({ role: "member" });
      const response = await app.request(
        "/api/v1/reconciliation/calculate",
        {
          method: "POST",
          headers: {
            authorization: "Bearer valid-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            property_id: PROPERTY_ID,
            period_start: bad,
            period_end: "2026-12-31",
          }),
        },
        env(),
      );
      expect(response.status, `period_start=${bad}`).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "validation_error" },
      });
      expect(queueProducer.reconciliationMessages).toEqual([]);
    }
  });

  it("accepts real calendar dates including a leap day", async () => {
    const { app } = createTestApp({ role: "member" });
    const response = await app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2024-02-29",
          period_end: "2024-12-31",
        }),
      },
      env(),
    );
    expect(response.status).toBe(202);
  });

  it("marks calculation jobs failed when queue enqueue fails", async () => {
    const repository = new MemoryReconciliationRepository();
    const queueProducer = new FakeQueueProducer();
    queueProducer.reconciliationError = new Error("queue unavailable");
    const { app } = createTestApp({
      repository,
      queueProducer,
      role: "member",
    });
    const response = await app.request(
      "/api/v1/reconciliation/calculate",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
        }),
      },
      env(),
    );

    expect(response.status).toBe(500);
    expect(repository.markEnqueueFailedInput).toEqual({
      jobId: JOB_ID,
      organizationId: ORG_ID,
      errorMessage: "queue unavailable",
    });
  });

  it("returns calculation job status scoped to the authenticated org", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/reconciliation/jobs/${JOB_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job_id: JOB_ID,
      status: "completed",
      potential_recovery_total: "1200.50",
    });
  });

  it("lists snapshots with filters and pagination", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      [
        "/api/v1/reconciliation/snapshots",
        `?property_id=${PROPERTY_ID}`,
        "&is_finalized=false",
        "&sort_by=tenant_name",
        "&sort_order=asc",
        "&page=2",
        "&size=10",
      ].join(""),
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: SNAPSHOT_ID, tenant_name: "Acme Retail" }],
      total: 1,
      page: 2,
      page_size: 10,
    });
    expect(repository.lastListInput).toMatchObject({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      isFinalized: false,
      sortBy: "tenant_name",
      sortOrder: "asc",
      page: 2,
      size: 10,
    });
  });

  it("rejects a page beyond MAX_SAFE_INTEGER with 422 (no opaque OFFSET 500)", async () => {
    // A page >= 1e21 stringifies as exponent notation ("1e+21") that Postgres
    // cannot parse into OFFSET (22P02). The Zod ceiling fails it closed as 422.
    const { app } = createTestApp();
    const response = await app.request(
      "/api/v1/reconciliation/snapshots?page=999999999999999999999",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(422);
  });

  it("gets a snapshot and strips trace when include_trace is false", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}?include_trace=false`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: SNAPSHOT_ID,
      calculation_trace: [],
    });
  });

  it("finalizes a draft snapshot for admins", async () => {
    const { app, actualBilledRepository, analytics, resultsEmailSender } =
      createTestApp();
    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: SNAPSHOT_ID,
      status: "finalized",
      finalized_at: "2026-06-12T12:00:00.000Z",
      finalized_by_user_id: USER_ID,
      is_finalized: true,
      message: "Snapshot finalized successfully",
    });
    expect(analytics.captures).toEqual([
      {
        eventName: "reconciliation_finalized",
        organizationId: ORG_ID,
        properties: {
          snapshot_id: SNAPSHOT_ID,
          finalized_by_role: "admin",
          finalize_mode: "single",
        },
      },
    ]);
    expect(resultsEmailSender.sends).toEqual([
      {
        toEmail: "user@example.test",
        firstName: "Test",
        idempotencyKey: `reconciliation-finalized:snapshot:${SNAPSHOT_ID}`,
        propertyName: "Main Plaza",
        statementUrl: `https://app.capveri.test/properties/${PROPERTY_ID}/reconciliations?year=2026`,
        clean: true,
        metadata: {
          source: "capveri-reconciliation-finalize",
          mode: "single",
          snapshotId: SNAPSHOT_ID,
          organizationId: ORG_ID,
          userId: USER_ID,
        },
      },
    ]);
    expect(actualBilledRepository.lastInput).toEqual({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
  });

  it("adds exposure amounts to results email when billing comparison data exists", async () => {
    const actualBilledRepository = new MemoryBillingExposureRepository();
    actualBilledRepository.billedRows = [{ billed_amount: "1500.50" }];
    const { app, resultsEmailSender } = createTestApp({
      actualBilledRepository,
    });
    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    expect(resultsEmailSender.sends[0]?.billingExposure).toEqual({
      totalUnderbillExposure: "0",
      totalOverbillExposure: "300",
      totalBillingExposure: "300",
    });
  });

  it("omits exposure amounts when no exact-period billing comparison exists", async () => {
    const actualBilledRepository = new MemoryBillingExposureRepository();
    actualBilledRepository.billedRows = [];
    const { app, resultsEmailSender } = createTestApp({
      actualBilledRepository,
    });
    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    expect(resultsEmailSender.sends[0]).not.toHaveProperty("billingExposure");
  });

  it("keeps snapshot finalization successful when the results email send fails", async () => {
    const resultsEmailSender = new MemoryResultsEmailSender();
    resultsEmailSender.error = new Error("sequencer unavailable");
    const { app } = createTestApp({ resultsEmailSender });

    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: SNAPSHOT_ID,
      is_finalized: true,
    });
    expect(resultsEmailSender.sends).toEqual([]);
  });

  it("keeps snapshot finalization successful when the results email context lookup fails", async () => {
    const repository = new MemoryReconciliationRepository();
    repository.getSnapshotError = new Error("snapshot context unavailable");
    const { app, resultsEmailSender } = createTestApp({ repository });

    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: SNAPSHOT_ID,
      is_finalized: true,
    });
    expect(resultsEmailSender.sends).toEqual([]);
  });

  it("rejects snapshot finalization for non-admin users", async () => {
    const { app } = createTestApp({ role: "member" });
    const response = await app.request(
      `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
      { method: "POST", headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(403);
  });

  it("batch finalizes draft snapshots", async () => {
    const { app, analytics, resultsEmailSender } = createTestApp();
    const response = await app.request(
      "/api/v1/reconciliation/snapshots/finalize-batch",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: unknown[];
      total_attempted: number;
      total_succeeded: number;
      total_failed: number;
    };
    expect(body).toMatchObject({
      total_attempted: 2,
      total_succeeded: 1,
      total_failed: 1,
    });
    expect(body.results).toEqual(
      expect.arrayContaining([
        { snapshot_id: SNAPSHOT_ID, success: true, error_message: null },
      ]),
    );
    expect(analytics.captures).toEqual([
      {
        eventName: "reconciliation_finalized",
        organizationId: ORG_ID,
        properties: {
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          finalize_mode: "batch",
          total_attempted: 2,
          total_succeeded: 1,
          total_failed: 1,
        },
      },
    ]);
    expect(resultsEmailSender.sends).toEqual([
      {
        toEmail: "user@example.test",
        firstName: "Test",
        idempotencyKey: [
          "reconciliation-finalized",
          "batch",
          PROPERTY_ID,
          "2026-01-01",
          "2026-12-31",
        ].join(":"),
        propertyName: "Main Plaza",
        statementUrl: `https://app.capveri.test/properties/${PROPERTY_ID}/reconciliations?year=2026`,
        clean: true,
        metadata: {
          source: "capveri-reconciliation-finalize",
          mode: "batch",
          propertyId: PROPERTY_ID,
          periodStart: "2026-01-01",
          periodEnd: "2026-12-31",
          organizationId: ORG_ID,
          userId: USER_ID,
          totalSucceeded: "1",
        },
      },
    ]);
  });

  it("does not send a results email when batch finalization has no successes", async () => {
    const repository = new MemoryReconciliationRepository();
    repository.batchFinalizeResult = {
      state: "completed",
      total_attempted: 1,
      total_succeeded: 0,
      total_failed: 1,
      results: [
        {
          snapshot_id: SNAPSHOT_ID,
          success: false,
          error_message: "Calculation trace is missing or empty",
        },
      ],
      message: "0 of 1 snapshots finalized successfully, 1 failed",
    };
    const { app, resultsEmailSender } = createTestApp({ repository });

    const response = await app.request(
      "/api/v1/reconciliation/snapshots/finalize-batch",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total_succeeded: 0,
      total_failed: 1,
    });
    expect(resultsEmailSender.sends).toEqual([]);
  });

  it("posts finalized results emails to Sequencer with service token headers", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> =
      [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: "sent" }), { status: 201 });
    }) as typeof fetch;

    try {
      const { app } = createTestApp({
        useDefaultResultsEmailSender: true,
      });
      const response = await app.request(
        `/api/v1/reconciliation/snapshots/${SNAPSHOT_ID}/finalize`,
        { method: "POST", headers: { authorization: "Bearer valid-token" } },
        {
          ...env(),
          SEQUENCER_BASE_URL: "https://sequencer.test/",
          SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
          SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
        } as AppEnv,
      );

      expect(response.status).toBe(200);
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]?.url).toBe(
        "https://sequencer.test/api/v1/transactional",
      );
      expect(fetchCalls[0]?.init?.headers).toEqual({
        "content-type": "application/json",
        "CF-Access-Client-Id": "client-id",
        "CF-Access-Client-Secret": "client-secret",
        "Idempotency-Key": `reconciliation-finalized:snapshot:${SNAPSHOT_ID}`,
      });
      expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toMatchObject({
        email: "user@example.test",
        product: "capveri",
        template_slug: "transactional/capveri-statement-results",
        subject: "Your CAM statement holds up",
        idempotency_key: `reconciliation-finalized:snapshot:${SNAPSHOT_ID}`,
        first_name: "Test",
        data: {
          clean: true,
          propertyName: "Main Plaza",
          statementUrl: `https://app.capveri.test/properties/${PROPERTY_ID}/reconciliations?year=2026`,
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates editable draft snapshot cells", async () => {
    const { app } = createTestApp({ role: "member" });
    const encodedCellId = cellId();
    const response = await app.request(
      `/api/v1/reconciliation/cells/${encodedCellId}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "1250.00" }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: encodedCellId,
      snapshot_id: SNAPSHOT_ID,
      field_name: "total_recovery",
      value: "1250.00",
      is_manual_override: true,
      updated_at: "2026-06-12T12:00:00.000Z",
      updated_by: USER_ID,
    });
  });

  it("rejects sub-cent cell values that the NUMERIC(14,2) column would round", async () => {
    const { app } = createTestApp({ role: "member" });
    const response = await app.request(
      `/api/v1/reconciliation/cells/${cellId()}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "100.125" }),
      },
      env(),
    );

    expect(response.status).toBe(422);
  });

  it("rejects non-editable cell fields", async () => {
    const { app } = createTestApp({ role: "member" });
    const response = await app.request(
      `/api/v1/reconciliation/cells/${cellId("status")}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ value: "1" }),
      },
      env(),
    );

    expect(response.status).toBe(400);
  });
});
