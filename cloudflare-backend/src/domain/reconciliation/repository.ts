import type {
  CalculationDataset,
  CalculationJobRecord,
  SnapshotDraft,
} from "./calculator";
import type {
  FinalizedSnapshotRow as CapBankSnapshotRow,
  LeaseCapProfile,
} from "./cap-bank-ledger";

export const reconciliationStatuses = ["draft", "finalized"] as const;
export type ReconciliationStatus = (typeof reconciliationStatuses)[number];

export const calculationJobStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type CalculationJobStatus = (typeof calculationJobStatuses)[number];

export const editableReconciliationFields = [
  "total_operating_expenses",
  "grossed_up_expenses",
  "base_year_amount",
  "tenant_share_before_cap",
  "tenant_share_after_cap",
  "admin_fee",
  "total_recovery",
] as const;
export type EditableReconciliationField =
  (typeof editableReconciliationFields)[number];

export type CalculationJobStatusRecord = {
  job_id: string;
  status: CalculationJobStatus;
  property_id: string;
  period_start: string;
  period_end: string;
  total_leases: number | null;
  processed_leases: number;
  progress_percentage: number | null;
  snapshot_ids: string[];
  error_message: string | null;
  potential_recovery_total: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type ReconciliationSnapshotRecord = {
  id: string;
  organization_id: string;
  property_id: string;
  lease_id: string;
  period_start_date: string;
  period_end_date: string;
  status: ReconciliationStatus;
  total_operating_expenses?: string | number | null;
  grossed_up_expenses?: string | number | null;
  base_year_amount?: string | number | null;
  tenant_share_before_cap?: string | number | null;
  tenant_share_after_cap?: string | number | null;
  admin_fee: string | number | null;
  total_recovery: string | number;
  calculation_trace: unknown[] | null;
  manual_overrides?: Record<string, unknown> | null;
  pool_breakdowns?: unknown[] | null;
  finalized_at: string | null;
  finalized_by_user_id?: string | null;
  created_at: string | null;
  [key: string]: unknown;
};

export type ReconciliationSnapshotSummaryRecord = {
  id: string;
  property_id: string;
  lease_id: string;
  period_start_date: string;
  period_end_date: string;
  status: ReconciliationStatus;
  total_recovery: string | number;
  tenant_share_after_cap: string | number | null;
  admin_fee: string | number | null;
  is_finalized: boolean;
  finalized_at: string | null;
  created_at: string | null;
  tenant_name: string | null;
  property_name: string | null;
};

export type SnapshotListFilters = {
  organizationId: string;
  propertyId?: string;
  leaseId?: string;
  periodStart?: string;
  periodEnd?: string;
  isFinalized?: boolean;
  sortBy: "created_at" | "tenant_name" | "total_recovery";
  sortOrder: "asc" | "desc";
  page: number;
  size: number;
};

export type SnapshotListResult = {
  items: ReconciliationSnapshotSummaryRecord[];
  total: number;
  page: number;
  page_size: number;
};

export type FinalizeSnapshotResult =
  | { state: "not_found" }
  | { state: "already_finalized" }
  | { state: "missing_trace" }
  | { state: "conflict" }
  | {
      state: "finalized";
      snapshot: {
        id: string;
        status: ReconciliationStatus;
        finalized_at: string;
        finalized_by_user_id: string;
      };
    };

export type FinalizedSnapshotRecord = Extract<
  FinalizeSnapshotResult,
  { state: "finalized" }
>["snapshot"];

export type BatchFinalizeResultItem = {
  snapshot_id: string;
  success: boolean;
  error_message: string | null;
};

export type BatchFinalizeResult =
  | { state: "not_found" }
  | {
      state: "completed";
      total_attempted: number;
      total_succeeded: number;
      total_failed: number;
      results: BatchFinalizeResultItem[];
      message: string;
    };

export type UpdateCellResult =
  | { state: "not_found" }
  | { state: "finalized" }
  | { state: "conflict" }
  | {
      state: "updated";
      cell: {
        id: string;
        snapshot_id: string;
        field_name: EditableReconciliationField;
        value: string;
        is_manual_override: true;
        updated_at: string;
        updated_by: string;
      };
    };

export type CreateCalculationJobResult =
  | { state: "property_not_found" }
  | { state: "no_active_leases" }
  | { state: "period_finalized" }
  | { state: "created"; jobId: string; organizationId: string };

export type ReconciliationRepository = {
  hasFullAccess(organizationId: string): Promise<boolean>;
  createCalculationJob(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    forceRecalculate: boolean;
  }): Promise<CreateCalculationJobResult>;
  markCalculationEnqueueFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<void>;
  getCalculationJob(input: {
    jobId: string;
    organizationId: string;
  }): Promise<CalculationJobRecord | null>;
  markCalculationRunning(input: {
    jobId: string;
    organizationId: string;
  }): Promise<boolean>;
  loadCalculationDataset(input: {
    job: CalculationJobRecord;
  }): Promise<CalculationDataset>;
  countDraftSnapshots(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<number>;
  countFinalizedSnapshots(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<number>;
  deleteDraftSnapshots(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<void>;
  insertCalculationSnapshots(input: {
    jobId: string;
    organizationId: string;
    snapshots: SnapshotDraft[];
  }): Promise<string[]>;
  completeCalculationJob(input: {
    jobId: string;
    organizationId: string;
    snapshotIds: string[];
  }): Promise<void>;
  persistCalculationResults(input: {
    jobId: string;
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    forceRecalculate: boolean;
    snapshots: SnapshotDraft[];
  }): Promise<string[]>;
  markCalculationFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
    errorDetails: unknown;
  }): Promise<void>;
  markRunningCalculationFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
    errorDetails: unknown;
  }): Promise<boolean>;
  getJobStatus(input: {
    jobId: string;
    organizationId: string;
  }): Promise<CalculationJobStatusRecord | null>;
  getSnapshot(input: {
    snapshotId: string;
    organizationId: string;
    includeTrace: boolean;
  }): Promise<ReconciliationSnapshotRecord | null>;
  listSnapshots(input: SnapshotListFilters): Promise<SnapshotListResult>;
  finalizeSnapshot(input: {
    snapshotId: string;
    organizationId: string;
    userId: string;
    finalizedAt: string;
  }): Promise<FinalizeSnapshotResult>;
  finalizeBatch(input: {
    propertyId: string;
    organizationId: string;
    userId: string;
    periodStart: string;
    periodEnd: string;
    finalizedAt: string;
  }): Promise<BatchFinalizeResult>;
  updateCell(input: {
    cellId: string;
    snapshotId: string;
    organizationId: string;
    fieldName: EditableReconciliationField;
    value: string;
    userId: string;
    updatedAt: string;
  }): Promise<UpdateCellResult>;
  getLeaseCapProfile(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseCapProfile | null>;
  listFinalizedSnapshotsForLease(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<CapBankSnapshotRow[]>;
  recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void>;
};
