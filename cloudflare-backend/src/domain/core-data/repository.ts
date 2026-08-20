export type JsonObject = Record<string, unknown>;

export type PropertyRecord = JsonObject & {
  id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
};

export type UnitRecord = JsonObject & {
  id: string;
  property_id: string;
  unit_number: string;
  created_at: string;
  updated_at: string;
};

export type LeaseRecord = JsonObject & {
  id: string;
  property_id: string;
  unit_id: string | null;
  tenant_name: string;
  start_date: string;
  end_date: string;
  status: string;
  recovery_profile: JsonObject;
  created_at: string;
  updated_at: string;
};

export type LeaseTermVersionRecord = JsonObject & {
  id: string;
  lease_id: string;
  version_number: number;
  effective_date: string;
  base_year: number | null;
  base_year_amount: string | null;
  gross_up_base_year: boolean;
  pro_rata_share: string;
  cap_type: string;
  cap_rate: string | null;
  admin_fee_percentage: string;
  management_fee_percentage: string | null;
  excluded_pools: string[];
  rsf_measurement_standard: string | null;
  rsf_measurement_date: string | null;
  amendment_reason: string | null;
  amendment_document_url: string | null;
  created_by: string | null;
  created_at: string;
};

export type LeaseTermVersionSummaryRecord = Pick<
  LeaseTermVersionRecord,
  | "id"
  | "version_number"
  | "effective_date"
  | "pro_rata_share"
  | "cap_type"
  | "amendment_reason"
  | "created_at"
>;

export type DeleteLeaseTermVersionResult =
  | { state: "deleted" }
  | { state: "not_found" }
  | { state: "finalized_reference"; finalizedSnapshotCount: number };

export type DeleteFinalizedEvidenceResult =
  | { state: "deleted" }
  | { state: "not_found" }
  | { state: "finalized_reference"; finalizedSnapshotCount: number };

export type UpdateLeaseRecoveryProfileResult =
  | { state: "updated"; lease: LeaseRecord }
  | { state: "not_found" }
  | { state: "finalized_reference"; finalizedSnapshotCount: number };

export type PageResult<Row> = {
  data: Row[];
  count: number;
};

export type CoreDataRepository = {
  hasFullAccess(organizationId: string): Promise<boolean>;
  listProperties(input: {
    organizationId: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PropertyRecord>>;
  getProperty(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyRecord | null>;
  createProperty(input: {
    organizationId: string;
    data: JsonObject;
  }): Promise<PropertyRecord>;
  updateProperty(input: {
    propertyId: string;
    organizationId: string;
    patch: JsonObject;
  }): Promise<PropertyRecord | null>;
  deleteProperty(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<DeleteFinalizedEvidenceResult>;
  listUnits(input: {
    propertyId: string;
    organizationId: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<UnitRecord> | null>;
  getUnit(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }): Promise<UnitRecord | null>;
  createUnit(input: {
    propertyId: string;
    data: JsonObject;
  }): Promise<UnitRecord>;
  updateUnit(input: {
    propertyId: string;
    unitId: string;
    patch: JsonObject;
  }): Promise<UnitRecord | null>;
  deleteUnit(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }): Promise<boolean>;
  listLeases(input: {
    organizationId: string;
    propertyId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<LeaseRecord>>;
  getLease(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseRecord | null>;
  createLease(input: { data: JsonObject }): Promise<LeaseRecord>;
  updateLease(input: {
    leaseId: string;
    organizationId: string;
    patch: JsonObject;
  }): Promise<LeaseRecord | null>;
  updateLeaseRecoveryProfile(input: {
    leaseId: string;
    organizationId: string;
    recoveryProfile: JsonObject;
  }): Promise<UpdateLeaseRecoveryProfileResult>;
  deleteLease(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<DeleteFinalizedEvidenceResult>;
  listLeaseTermVersions(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseTermVersionSummaryRecord[] | null>;
  getEffectiveLeaseTermVersion(input: {
    leaseId: string;
    organizationId: string;
    asOf: string;
  }): Promise<LeaseTermVersionRecord | null>;
  getLeaseTermVersion(input: {
    leaseId: string;
    versionId: string;
    organizationId: string;
  }): Promise<LeaseTermVersionRecord | null>;
  createLeaseTermVersion(input: {
    leaseId: string;
    organizationId: string;
    userId: string;
    data: JsonObject;
  }): Promise<LeaseTermVersionRecord | null>;
  deleteLeaseTermVersion(input: {
    leaseId: string;
    versionId: string;
    organizationId: string;
  }): Promise<DeleteLeaseTermVersionResult>;
  propertyExists(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean>;
  unitBelongsToProperty(input: {
    propertyId: string;
    unitId: string;
    organizationId: string;
  }): Promise<boolean>;
};

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("unique") || message.includes("duplicate");
}
