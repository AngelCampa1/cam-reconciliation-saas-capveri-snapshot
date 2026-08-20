/**
 * Domain types and repository interface for the exports sub-slice.
 */

import type { SnapshotForErp } from "./erp-formatters";
import type { SnapshotForPdf } from "./property-pdf";

// ── Audit log ─────────────────────────────────────────────────────────────────

export type AuditLogRow = {
  id: string;
  table_name: string;
  operation: string;
  row_id: string | null;
  old_data: string;
  new_data: string;
  changed_by: string | null;
  changed_at: string;
};

export type AuditLogQueryInput = {
  organizationId: string;
  startDate?: string;
  endDate?: string;
  tableName?: string;
  operation?: string;
  rowId?: string;
  changedBy?: string;
  limit: number;
};

// ── Export history ────────────────────────────────────────────────────────────

export type ExportHistoryRow = {
  id: string;
  organization_id: string;
  property_id: string;
  format: string;
  file_name: string;
  file_size: number | null;
  status: string;
  created_by_name: string | null;
  created_at: string;
  storage_path: string | null;
};

export type ExportHistoryListInput = {
  organizationId: string;
  propertyId: string;
  format?: string;
  page: number;
  pageSize: number;
};

export type ExportHistoryPage = {
  items: ExportHistoryRow[];
  total: number;
  page: number;
  page_size: number;
};

// ── PDF export context ────────────────────────────────────────────────────────

export type SnapshotPdfContext = {
  snapshot: SnapshotForPdf;
  lease: { tenant_name: string };
  property: { name: string; address?: string | null };
  organization: { name: string };
};

export type DemandLetterContext = {
  snapshot: {
    id: string;
    status: string;
    total_recovery: string;
    period_start_date: string;
    period_end_date: string;
    lease_id: string;
  };
  lease: { tenant_name: string };
  property: { address?: string | null };
};

// ── Repository interface ──────────────────────────────────────────────────────

export type ExportsRepository = {
  /**
   * Fetch a single finalized reconciliation snapshot with its related property
   * and lease data for ERP export. Returns null when not found or not finalized.
   */
  getSnapshotForErp(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<SnapshotForErp | null>;

  /**
   * List all finalized snapshots for a property whose period overlaps the given
   * date range. Returns [] when none found.
   */
  listSnapshotsForErpBatch(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SnapshotForErp[]>;

  /**
   * Verify that a property belongs to the given organization. Returns true when
   * it exists.
   */
  propertyBelongsToOrg(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean>;

  /**
   * Query audit log entries with optional filters. Results ordered by
   * changed_at DESC. Matches FastAPI's export_audit_log query.
   */
  queryAuditLog(input: AuditLogQueryInput): Promise<AuditLogRow[]>;

  /**
   * Return paginated export history for a property. Ordered by created_at DESC.
   * Matches FastAPI's export_history endpoint.
   */
  listExportHistory(input: ExportHistoryListInput): Promise<ExportHistoryPage>;

  /**
   * Fetch a snapshot with full PDF context (property, lease, org, calculation
   * trace) for PDF generation. Returns null when not found in org.
   */
  getSnapshotForPdf(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<SnapshotPdfContext | null>;

  /**
   * List finalized snapshots for a property/year for PDF preview generation.
   * Year range: period_start_date <= year_end AND period_end_date >= year_start.
   * Mirrors FastAPI _fetch_finalized_snapshots.
   */
  listSnapshotsForPropertyPdf(input: {
    organizationId: string;
    propertyId: string;
    yearStart: string;
    yearEnd: string;
    leaseId?: string;
  }): Promise<SnapshotPdfContext[]>;

  /**
   * Fetch the minimal snapshot context needed for demand letter generation.
   * Returns null when not found in org.
   */
  getDemandLetterContext(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<DemandLetterContext | null>;

  /**
   * Check whether the organization has full subscription access (billing gate).
   * Mirrors the pattern used in reconciliation and other routes.
   */
  hasFullAccess(organizationId: string): Promise<boolean>;

  /**
   * Insert a completed export into export_history and return its id.
   * storage_path MUST be in the scheme-prefixed form (e.g. "r2:<key>") for
   * new R2-backed exports; legacy Supabase rows have no prefix.
   */
  insertExportHistory(input: {
    organizationId: string;
    propertyId: string;
    format: string;
    fileName: string;
    fileSize: number;
    createdByName: string;
    storagePath: string;
  }): Promise<string>;

  /**
   * Fetch a single export_history row by id, org-scoped.
   * Returns null when not found.
   */
  getExportHistoryRow(input: {
    exportId: string;
    organizationId: string;
  }): Promise<ExportHistoryRow | null>;

  /**
   * Delete an org-scoped export_history row. If the row has storage_path,
   * beforeDeleteStorage is called while the row is locked so external storage
   * cleanup can fail before the database row is removed.
   */
  deleteExportHistory(input: {
    exportId: string;
    organizationId: string;
    beforeDeleteStorage?: (storagePath: string) => Promise<void>;
  }): Promise<ExportHistoryRow | null>;

  /**
   * List all finalized snapshots for a property and year for variance / board
   * PDF generation. Returns an array of lightweight snapshot rows with
   * total_recovery and property name. Org-scoped.
   *
   * Year range: period_start_date <= year_end AND period_end_date >= year_start
   * (same overlap logic as listSnapshotsForPropertyPdf).
   */
  listSnapshotsForYear(input: {
    organizationId: string;
    propertyId: string;
    yearStart: string;
    yearEnd: string;
  }): Promise<SnapshotSummary[]>;

  /**
   * Fetch a property's name, org-scoped. Returns null when not found.
   */
  getPropertyName(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyNameRow | null>;
};

// ── Lightweight snapshot summary for variance / board reports ─────────────────

export type SnapshotSummary = {
  id: string;
  lease_id: string;
  total_recovery: string;
  /** ISO date string YYYY-MM-DD */
  period_start_date: string;
};

export type PropertyNameRow = {
  id: string;
  name: string;
  org_name: string;
};
