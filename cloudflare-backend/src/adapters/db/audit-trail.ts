/**
 * Postgres adapter for the audit-trail query slice.
 *
 * All queries use parameterized PostgresExecutor.query<Row>(sql, params).
 * Org-scoping is enforced via WHERE organization_id = $1 on every query.
 * No RLS — direct Postgres executor only.
 *
 * JSONB columns (old_data, new_data, session_info) are returned as parsed
 * JSON objects; the postgres driver typically already parses JSONB, but we
 * apply a safe parse-or-null fallback identical to the denominator-change
 * adapter pattern.
 */

import type {
  AuditLogEntry,
  AuditTrailRepository,
  ListAuditLogInput,
  ListAuditLogResult,
} from "../../domain/audit-trail/repository";
import type { PostgresExecutor } from "./postgres";

// ── Raw DB row type ───────────────────────────────────────────────────────────

type AuditLogDbRow = {
  id: string | number;
  table_name: string;
  operation: string;
  row_id: string | null;
  old_data: unknown;
  new_data: unknown;
  changed_by: string | null;
  changed_at: string;
  organization_id: string | null;
  session_info: unknown;
};

type CountRow = { count: string };

// ── JSONB parse helper ────────────────────────────────────────────────────────

function parseJsonbOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    // postgres driver already parsed JSONB
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: AuditLogDbRow): AuditLogEntry {
  return {
    id: typeof row.id === "string" ? parseInt(row.id, 10) : row.id,
    table_name: row.table_name,
    operation: row.operation,
    row_id: row.row_id ?? null,
    old_data: parseJsonbOrNull(row.old_data),
    new_data: parseJsonbOrNull(row.new_data),
    changed_by: row.changed_by ?? null,
    changed_at: row.changed_at,
    organization_id: row.organization_id ?? null,
    session_info: parseJsonbOrNull(row.session_info),
  };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PostgresAuditTrailRepository implements AuditTrailRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async listAuditLog(input: ListAuditLogInput): Promise<ListAuditLogResult> {
    // Build shared WHERE clauses and params (index starts at 2; $1 = org id)
    const whereClauses: string[] = ["organization_id = $1"];
    const sharedParams: unknown[] = [input.organizationId];
    let idx = 2;

    if (input.startDate !== undefined) {
      whereClauses.push(`changed_at >= $${idx}`);
      sharedParams.push(input.startDate);
      idx++;
    }

    if (input.endDate !== undefined) {
      // Replicate Python: datetime.combine(end_date, datetime.max.time())
      whereClauses.push(`changed_at <= $${idx}`);
      sharedParams.push(`${input.endDate}T23:59:59.999999`);
      idx++;
    }

    if (input.tableName !== undefined) {
      whereClauses.push(`table_name = $${idx}`);
      sharedParams.push(input.tableName);
      idx++;
    }

    if (input.operation !== undefined) {
      whereClauses.push(`operation = $${idx}`);
      sharedParams.push(input.operation); // already uppercased by the route layer
      idx++;
    }

    if (input.rowId !== undefined) {
      whereClauses.push(`row_id = $${idx}`);
      sharedParams.push(input.rowId);
      idx++;
    }

    if (input.changedBy !== undefined) {
      whereClauses.push(`changed_by = $${idx}`);
      sharedParams.push(input.changedBy);
      idx++;
    }

    const whereClause = whereClauses.join(" AND ");

    // COUNT query — reuses same params
    const countResult = await this.executor.query<CountRow>(
      `SELECT COUNT(*) AS count FROM audit_log WHERE ${whereClause}`,
      sharedParams,
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    // Page query — appends LIMIT and OFFSET
    const offset = (input.page - 1) * input.pageSize;
    const pageParams = [...sharedParams, input.pageSize, offset];
    const limitIdx = idx;
    const offsetIdx = idx + 1;

    const pageResult = await this.executor.query<AuditLogDbRow>(
      [
        "SELECT id, table_name, operation,",
        "row_id::text, old_data, new_data,",
        "changed_by::text, changed_at::text,",
        "organization_id::text, session_info",
        "FROM audit_log",
        `WHERE ${whereClause}`,
        "ORDER BY changed_at DESC",
        `LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ].join(" "),
      pageParams,
    );

    return {
      rows: pageResult.rows.map(mapRow),
      total,
    };
  }
}
