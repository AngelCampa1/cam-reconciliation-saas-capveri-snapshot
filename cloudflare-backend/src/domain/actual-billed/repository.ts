export type ActualBilledInsert = {
  tenantName: string;
  billedAmount: string;
  sourceType: string;
  poolId: string | null;
  suite: string | null;
};

export type ActualBilledRecord = {
  id: string;
  organization_id: string;
  property_id: string;
  period_start_date: string;
  period_end_date: string;
  tenant_name: string;
  billed_amount: string;
  source_type: string;
  lease_id: string | null;
  pool_id: string | null;
};

export type ReconciliationRecoveryRecord = {
  lease_id: string | null;
  total_recovery: string;
};

export type LeaseTenantRecord = {
  id: string;
  tenant_name: string | null;
};

export type LeakageSummaryDataset = {
  propertyIds: string[];
  finalizedSnapshots: Array<{ property_id: string; total_recovery: string }>;
  draftSnapshots: Array<{ property_id: string; total_recovery: string }>;
  billedRows: Array<{ property_id: string; billed_amount: string }>;
};

export type BillingExposureDataset = {
  propertyExists: boolean;
  snapshots: ReconciliationRecoveryRecord[];
  billedRows: Array<{ billed_amount: string }>;
};

export type ManualBillingResult =
  | { state: "created"; record: ActualBilledRecord }
  | { state: "property_not_found" }
  | { state: "period_finalized" }
  | { state: "pool_not_found" };

export type UploadBillingResult =
  | {
      state: "created";
      insertedCount: number;
      rows: Array<{
        id: string;
        tenantName: string;
        billedAmount: string;
        suite: string | null;
        leaseId: string | null;
      }>;
    }
  | { state: "property_not_found" }
  | { state: "period_finalized" };

export type DeleteBillingResult =
  | { state: "deleted"; deletedCount: number }
  | { state: "property_not_found" }
  | { state: "period_finalized" };

export type UpdateBillingMatchesResult =
  | { state: "updated"; updatedCount: number }
  | { state: "property_not_found" }
  | { state: "period_finalized" }
  | { state: "invalid_match" };

export type ActualBilledRepository = {
  createUploadRows(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    rows: ActualBilledInsert[];
  }): Promise<UploadBillingResult>;
  createManualEntry(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    totalBilled: string;
    poolId: string | null;
  }): Promise<ManualBillingResult>;
  listBilledAmounts(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ActualBilledRecord[] | null>;
  deleteBilledAmounts(input: {
    organizationId: string;
    propertyId: string;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<DeleteBillingResult>;
  updateBilledRowMatches(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    matches: Array<{ billedRowId: string; leaseId: string }>;
  }): Promise<UpdateBillingMatchesResult>;
  loadLeakageDataset(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    includeDrafts: boolean;
  }): Promise<{
    propertyExists: boolean;
    snapshots: ReconciliationRecoveryRecord[];
    hasImportBatches: boolean;
    billedRows: Array<{ tenant_name: string | null; billed_amount: string }>;
    leases: LeaseTenantRecord[];
  }>;
  loadBillingExposureDataset(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<BillingExposureDataset>;
  loadLeakageSummaryDataset(
    organizationId: string,
  ): Promise<LeakageSummaryDataset>;
};
