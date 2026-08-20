/**
 * Postgres adapter for the audit_requests table.
 *
 * All queries use parameterized PostgresExecutor.query<Row>(sql, params).
 * uuid and timestamp columns are cast to ::text so they serialize as plain
 * strings (no extra driver conversion needed).
 * Integer columns (building_count, portfolio_sqft, estimated_recovery) are
 * returned from Postgres as numbers via ::int cast.
 */

import type {
  AuditRequestRow,
  AuditRequestsRepository,
  CreateAuditRequestInput,
  ListAuditRequestsInput,
  UpdateAuditRequestFields,
} from "../../domain/audit-requests/repository";
import type { PostgresExecutor } from "./postgres";

// ── Raw DB row type ───────────────────────────────────────────────────────────

type AuditRequestDbRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  building_count: number;
  phone: string | null;
  portfolio_sqft: number | null;
  current_system: string | null;
  message: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  estimated_recovery: number | null;
  assigned_to: string | null;
  organization_id: string | null;
  contacted_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
};

type CountRow = { count: string };

// ── Column projection (all uuid/timestamp columns cast to ::text) ─────────────

const SELECT_COLS = `
  id::text,
  name,
  email,
  company,
  building_count::int,
  phone,
  portfolio_sqft::int,
  current_system,
  message,
  source,
  status,
  notes,
  estimated_recovery::int,
  assigned_to::text,
  organization_id::text,
  contacted_at::text,
  scheduled_at::text,
  completed_at::text,
  converted_at::text,
  created_at::text,
  updated_at::text
`.trim();

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: AuditRequestDbRow): AuditRequestRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    building_count:
      typeof row.building_count === "string"
        ? parseInt(row.building_count, 10)
        : row.building_count,
    phone: row.phone ?? null,
    portfolio_sqft:
      row.portfolio_sqft !== null && row.portfolio_sqft !== undefined
        ? typeof row.portfolio_sqft === "string"
          ? parseInt(row.portfolio_sqft, 10)
          : row.portfolio_sqft
        : null,
    current_system: row.current_system ?? null,
    message: row.message ?? null,
    source: row.source ?? null,
    status: row.status as AuditRequestRow["status"],
    notes: row.notes ?? null,
    estimated_recovery:
      row.estimated_recovery !== null && row.estimated_recovery !== undefined
        ? typeof row.estimated_recovery === "string"
          ? parseInt(row.estimated_recovery, 10)
          : row.estimated_recovery
        : null,
    assigned_to: row.assigned_to ?? null,
    organization_id: row.organization_id ?? null,
    contacted_at: row.contacted_at ?? null,
    scheduled_at: row.scheduled_at ?? null,
    completed_at: row.completed_at ?? null,
    converted_at: row.converted_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PostgresAuditRequestsRepository implements AuditRequestsRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async createAuditRequest(
    input: CreateAuditRequestInput,
  ): Promise<AuditRequestRow | null> {
    const result = await this.executor.query<AuditRequestDbRow>(
      `INSERT INTO audit_requests
         (name, email, company, building_count, phone, portfolio_sqft,
          current_system, message, source, referral_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${SELECT_COLS}`,
      [
        input.name,
        input.email,
        input.company,
        input.building_count,
        input.phone,
        input.portfolio_sqft,
        input.current_system,
        input.message,
        input.source,
        input.referral_code,
        input.status,
      ],
    );
    const row = result.rows[0];
    return row !== undefined ? mapRow(row) : null;
  }

  async countRecentByEmail(
    email: string,
    windowStartIso: string,
  ): Promise<number> {
    const result = await this.executor.query<CountRow>(
      `SELECT COUNT(*) AS count FROM audit_requests
       WHERE email = $1 AND created_at >= $2`,
      [email, windowStartIso],
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async listAuditRequests(
    input: ListAuditRequestsInput,
  ): Promise<AuditRequestRow[]> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];
    let idx = 1;

    if (input.statusFilter !== undefined) {
      whereClauses.push(`status = $${idx}`);
      params.push(input.statusFilter);
      idx++;
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    params.push(input.limit);
    params.push(input.offset);

    const result = await this.executor.query<AuditRequestDbRow>(
      `SELECT ${SELECT_COLS}
       FROM audit_requests
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    );
    return result.rows.map(mapRow);
  }

  async getAuditRequestById(id: string): Promise<AuditRequestRow | null> {
    const result = await this.executor.query<AuditRequestDbRow>(
      `SELECT ${SELECT_COLS} FROM audit_requests WHERE id = $1::uuid`,
      [id],
    );
    const row = result.rows[0];
    return row !== undefined ? mapRow(row) : null;
  }

  async updateAuditRequest(
    id: string,
    fields: UpdateAuditRequestFields,
  ): Promise<AuditRequestRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx}`);
      params.push(fields.status);
      idx++;
    }
    if (fields.contacted_at !== undefined) {
      setClauses.push(`contacted_at = $${idx}`);
      params.push(fields.contacted_at);
      idx++;
    }
    if (fields.scheduled_at !== undefined) {
      setClauses.push(`scheduled_at = $${idx}`);
      params.push(fields.scheduled_at);
      idx++;
    }
    if (fields.completed_at !== undefined) {
      setClauses.push(`completed_at = $${idx}`);
      params.push(fields.completed_at);
      idx++;
    }
    if (fields.converted_at !== undefined) {
      setClauses.push(`converted_at = $${idx}`);
      params.push(fields.converted_at);
      idx++;
    }
    if ("notes" in fields) {
      setClauses.push(`notes = $${idx}`);
      params.push(fields.notes ?? null);
      idx++;
    }
    if (fields.estimated_recovery !== undefined) {
      setClauses.push(`estimated_recovery = $${idx}`);
      params.push(fields.estimated_recovery);
      idx++;
    }
    if (fields.assigned_to !== undefined) {
      setClauses.push(`assigned_to = $${idx}::uuid`);
      params.push(fields.assigned_to);
      idx++;
    }

    if (setClauses.length === 0) {
      return null;
    }

    params.push(id);

    const result = await this.executor.query<AuditRequestDbRow>(
      `UPDATE audit_requests
       SET ${setClauses.join(", ")}
       WHERE id = $${idx}::uuid
       RETURNING ${SELECT_COLS}`,
      params,
    );
    const row = result.rows[0];
    return row !== undefined ? mapRow(row) : null;
  }
}
