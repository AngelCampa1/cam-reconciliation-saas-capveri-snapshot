/**
 * Domain types and repository interface for the audit-trail query slice.
 *
 * The JSON API endpoint (GET /api/v1/audit-trail) returns full AuditLogEntry
 * rows with parsed JSONB columns, unlike the CSV export slice which uses a
 * python-repr serializer.
 */

// ── Row type returned to callers ──────────────────────────────────────────────

export type AuditLogEntry = {
  id: number;
  table_name: string;
  operation: string;
  row_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
  organization_id: string | null;
  session_info: Record<string, unknown> | null;
};

// ── Input type for list query ─────────────────────────────────────────────────

export type ListAuditLogInput = {
  organizationId: string;
  /** ISO date string e.g. "2026-01-01" — filter changed_at >= value */
  startDate?: string;
  /** ISO date string e.g. "2026-01-31" — filter changed_at <= "{value}T23:59:59.999999" */
  endDate?: string;
  tableName?: string;
  /** Already uppercased by caller */
  operation?: string;
  rowId?: string;
  changedBy?: string;
  page: number;
  pageSize: number;
};

export type ListAuditLogResult = {
  rows: AuditLogEntry[];
  total: number;
};

// ── Repository interface ──────────────────────────────────────────────────────

export type AuditTrailRepository = {
  listAuditLog(input: ListAuditLogInput): Promise<ListAuditLogResult>;
};
