/**
 * SB 1103 domain types and repository interface.
 *
 * California SB 1103 (effective January 1, 2025) requires landlords to provide
 * Qualified Commercial Tenants (QCTs) with an itemized 18-month historical CAM
 * expense ledger within 30 days of a written request.
 */

// ── Row shape (mirrors sb1103_requests table) ─────────────────────────────────

export type Sb1103RequestRow = {
  id: string;
  organization_id: string;
  property_id: string;
  lease_id: string;
  requested_by_name: string;
  requested_by_email: string;
  /** YYYY-MM-DD */
  request_date: string;
  /** YYYY-MM-DD */
  response_deadline: string;
  /** YYYY-MM-DD */
  window_start_date: string;
  /** YYYY-MM-DD */
  window_end_date: string;
  status: string;
  export_format: string | null;
  exported_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ── Input types ───────────────────────────────────────────────────────────────

export type CreateSb1103Input = {
  organization_id: string;
  property_id: string;
  lease_id: string;
  requested_by_name: string;
  requested_by_email: string;
  /** YYYY-MM-DD */
  request_date: string;
  /** YYYY-MM-DD — auto-computed: request_date + 30 days */
  response_deadline: string;
  /** YYYY-MM-DD — auto-computed: request_date - 18 calendar months */
  window_start_date: string;
  /** YYYY-MM-DD — equals request_date */
  window_end_date: string;
  status: string;
  notes: string | null;
};

export type ListSb1103Input = {
  organizationId: string;
  propertyId?: string;
  status?: string;
};

export type UpdateSb1103Fields = {
  status?: string;
  notes?: string | null;
};

export class Sb1103StatusConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Sb1103StatusConflictError";
  }
}

// ── Lightweight validation helpers ────────────────────────────────────────────

export type PropertySummary = {
  id: string;
  name: string;
};

export type LeaseSummary = {
  id: string;
  property_id: string;
  tenant_name: string | null;
};

// ── Export support ────────────────────────────────────────────────────────────

export type PropertyExportInfo = {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export type LeaseExportInfo = {
  id: string;
  property_id: string;
  tenant_name: string | null;
  /** JSONB recovery_profile from the leases table */
  recovery_profile: Record<string, unknown> | null;
};

export type GlEntryRow = {
  id: string;
  account_code: string;
  account_description: string;
  amount: string; // numeric string from pg
  transaction_date: string; // YYYY-MM-DD
  vendor_name: string | null;
  description: string | null;
  import_batch_id: string;
};

export type MarkExportedInput = {
  orgId: string;
  id: string;
  format: string;
  exportedAt: string; // ISO timestamp
};

// ── Alert support ─────────────────────────────────────────────────────────────

export type AlertRequestRow = {
  id: string;
  property_id: string;
  lease_id: string;
  /** YYYY-MM-DD */
  response_deadline: string;
  status: string;
};

// ── Repository interface ──────────────────────────────────────────────────────

export interface Sb1103Repository {
  hasFullAccess(orgId: string): Promise<boolean>;

  listRequests(input: ListSb1103Input): Promise<Sb1103RequestRow[]>;
  countRequests(input: ListSb1103Input): Promise<number>;

  getRequestById(orgId: string, id: string): Promise<Sb1103RequestRow | null>;

  createRequest(input: CreateSb1103Input): Promise<Sb1103RequestRow>;

  updateRequest(
    orgId: string,
    id: string,
    fields: UpdateSb1103Fields,
  ): Promise<Sb1103RequestRow | null>;

  deleteRequest(orgId: string, id: string): Promise<boolean>;

  getPropertyById(
    orgId: string,
    propertyId: string,
  ): Promise<PropertySummary | null>;

  getLeaseById(orgId: string, leaseId: string): Promise<LeaseSummary | null>;

  /** Returns requests with response_deadline <= cutoffDate and status != 'delivered', ordered by response_deadline asc. */
  listDeadlineAlertRequests(
    orgId: string,
    cutoffDate: string,
  ): Promise<AlertRequestRow[]>;

  getPropertyNames(
    orgId: string,
    propertyIds: string[],
  ): Promise<Map<string, string>>;

  getTenantNamesByLease(
    orgId: string,
    leaseIds: string[],
  ): Promise<Map<string, string>>;

  /** Fetch property record for export (full address fields). Returns null if not found for orgId. */
  getPropertyForExport(
    orgId: string,
    propertyId: string,
  ): Promise<PropertyExportInfo | null>;

  /** Fetch lease with recovery_profile for export. Returns null if not found for orgId. */
  getLeaseForExport(
    orgId: string,
    leaseId: string,
  ): Promise<LeaseExportInfo | null>;

  /** Fetch GL entries for a property within the window, ordered by transaction_date asc. */
  getGlEntriesForWindow(
    orgId: string,
    propertyId: string,
    windowStart: string,
    windowEnd: string,
  ): Promise<GlEntryRow[]>;

  /** Update sb1103_requests status/export_format/exported_at unless it is already terminal delivered. */
  markExported(input: MarkExportedInput): Promise<boolean>;
}
