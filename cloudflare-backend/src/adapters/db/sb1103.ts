/**
 * PostgreSQL adapter for Sb1103Repository.
 *
 * All queries include explicit organization_id WHERE clauses (NO RLS session).
 * Mirrors backend/app/api/v1/compliance.py + backend/app/services/compliance/sb1103_service.py.
 */

import {
  Sb1103StatusConflictError,
  type AlertRequestRow,
  type CreateSb1103Input,
  type GlEntryRow,
  type LeaseExportInfo,
  type LeaseSummary,
  type ListSb1103Input,
  type MarkExportedInput,
  type PropertyExportInfo,
  type PropertySummary,
  type Sb1103Repository,
  type Sb1103RequestRow,
  type UpdateSb1103Fields,
} from "../../domain/sb1103/repository";
import type { PostgresExecutor } from "./postgres";

type DbRow = {
  id: string;
  organization_id: string;
  property_id: string;
  lease_id: string;
  requested_by_name: string;
  requested_by_email: string;
  request_date: string | Date;
  response_deadline: string | Date;
  window_start_date: string | Date;
  window_end_date: string | Date;
  status: string;
  export_format: string | null;
  exported_at: string | Date | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CountRow = { count: string };
type ExistsRow = { exists: boolean };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};
type PropertyDbRow = { id: string; name: string | null };
type LeaseDbRow = {
  id: string;
  property_id: string;
  tenant_name: string | null;
};
type AlertDbRow = {
  id: string;
  property_id: string;
  lease_id: string;
  response_deadline: string;
  status: string;
};

function mapRow(row: DbRow): Sb1103RequestRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    property_id: row.property_id,
    lease_id: row.lease_id,
    requested_by_name: row.requested_by_name,
    requested_by_email: row.requested_by_email,
    request_date: toIsoDate(row.request_date),
    response_deadline: toIsoDate(row.response_deadline),
    window_start_date: toIsoDate(row.window_start_date),
    window_end_date: toIsoDate(row.window_end_date),
    status: row.status,
    export_format: row.export_format,
    exported_at: row.exported_at === null ? null : toIsoTimestamp(row.exported_at),
    notes: row.notes,
    created_at: toIsoTimestamp(row.created_at),
    updated_at: toIsoTimestamp(row.updated_at),
  };
}

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.includes("T") ? value.slice(0, 10) : value;
}

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class PostgresSb1103Repository implements Sb1103Repository {
  constructor(private readonly executor: PostgresExecutor) {}

  async hasFullAccess(orgId: string): Promise<boolean> {
    const result = await this.executor.query<SubscriptionEntitlementRow>(
      [
        'select status, billing_model as "billingModel",',
        'stripe_subscription_id as "stripeSubscriptionId",',
        'current_period_end as "currentPeriodEnd"',
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [orgId],
    );
    const row = result.rows[0];

    if (!row) {
      return this.hasPurchasedCredits(orgId);
    }

    if (row.billingModel === "credit_pack") {
      return this.hasPurchasedCredits(orgId);
    }

    const status = effectiveSubscriptionStatus(row);

    return status === "active" || status === "trialing";
  }

  async listRequests(input: ListSb1103Input): Promise<Sb1103RequestRow[]> {
    const conditions: string[] = ["organization_id = $1"];
    const params: unknown[] = [input.organizationId];
    let idx = 2;

    if (input.propertyId !== undefined) {
      conditions.push(`property_id = $${idx}::uuid`);
      params.push(input.propertyId);
      idx++;
    }
    if (input.status !== undefined) {
      conditions.push(`status = $${idx}::text`);
      params.push(input.status);
      idx++;
    }

    const where = conditions.join(" and ");
    const result = await this.executor.query<DbRow>(
      `select * from sb1103_requests where ${where} order by created_at desc`,
      params,
    );
    return result.rows.map(mapRow);
  }

  async countRequests(input: ListSb1103Input): Promise<number> {
    const conditions: string[] = ["organization_id = $1"];
    const params: unknown[] = [input.organizationId];
    let idx = 2;

    if (input.propertyId !== undefined) {
      conditions.push(`property_id = $${idx}::uuid`);
      params.push(input.propertyId);
      idx++;
    }
    if (input.status !== undefined) {
      conditions.push(`status = $${idx}::text`);
      params.push(input.status);
      idx++;
    }

    const where = conditions.join(" and ");
    const result = await this.executor.query<CountRow>(
      `select count(*)::text as count from sb1103_requests where ${where}`,
      params,
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async getRequestById(
    orgId: string,
    id: string,
  ): Promise<Sb1103RequestRow | null> {
    const result = await this.executor.query<DbRow>(
      "select * from sb1103_requests where id = $1::uuid and organization_id = $2 limit 1",
      [id, orgId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async createRequest(input: CreateSb1103Input): Promise<Sb1103RequestRow> {
    const result = await this.executor.query<DbRow>(
      [
        "insert into sb1103_requests",
        "  (organization_id, property_id, lease_id, requested_by_name, requested_by_email,",
        "   request_date, response_deadline, window_start_date, window_end_date,",
        "   status, notes)",
        "values",
        "  ($1, $2::uuid, $3::uuid, $4::text, $5::text,",
        "   $6::date, $7::date, $8::date, $9::date,",
        "   $10::text, $11::text)",
        "returning *",
      ].join(" "),
      [
        input.organization_id,
        input.property_id,
        input.lease_id,
        input.requested_by_name,
        input.requested_by_email,
        input.request_date,
        input.response_deadline,
        input.window_start_date,
        input.window_end_date,
        input.status,
        input.notes,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Insert into sb1103_requests returned no row");
    }
    return mapRow(row);
  }

  async updateRequest(
    orgId: string,
    id: string,
    fields: UpdateSb1103Fields,
  ): Promise<Sb1103RequestRow | null> {
    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;
    const blocksDeliveredRegression =
      fields.status !== undefined && fields.status !== "delivered";

    if (fields.status !== undefined) {
      setClauses.push(`status = $${idx}::text`);
      params.push(fields.status);
      idx++;
    }
    if (fields.notes !== undefined) {
      setClauses.push(`notes = $${idx}::text`);
      params.push(fields.notes);
      idx++;
    }

    params.push(id);
    const idParam = idx++;
    params.push(orgId);
    const orgParam = idx;
    const whereClauses = [
      `id = $${idParam}::uuid`,
      `organization_id = $${orgParam}`,
    ];
    if (blocksDeliveredRegression) {
      whereClauses.push("status != 'delivered'");
    }

    const result = await this.executor.query<DbRow>(
      `update sb1103_requests set ${setClauses.join(", ")} where ${whereClauses.join(" and ")} returning *`,
      params,
    );
    const row = result.rows[0];
    if (row) return mapRow(row);

    if (blocksDeliveredRegression) {
      const existing = await this.executor.query<{ status: string }>(
        "select status from sb1103_requests where id = $1::uuid and organization_id = $2 limit 1",
        [id, orgId],
      );
      if (existing.rows[0]?.status === "delivered") {
        throw new Sb1103StatusConflictError(
          "SB 1103 request status changed before update could be recorded.",
        );
      }
    }

    return null;
  }

  async deleteRequest(orgId: string, id: string): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      "delete from sb1103_requests where id = $1::uuid and organization_id = $2 returning id",
      [id, orgId],
    );
    return result.rows.length > 0;
  }

  async getPropertyById(
    orgId: string,
    propertyId: string,
  ): Promise<PropertySummary | null> {
    const result = await this.executor.query<PropertyDbRow>(
      "select id, coalesce(name, '') as name from properties where id = $1::uuid and organization_id = $2 limit 1",
      [propertyId, orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, name: row.name ?? "" };
  }

  async getLeaseById(
    orgId: string,
    leaseId: string,
  ): Promise<LeaseSummary | null> {
    const result = await this.executor.query<LeaseDbRow>(
      [
        "select leases.id, leases.property_id::text as property_id, leases.tenant_name",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where leases.id = $1::uuid",
        "and properties.organization_id = $2",
        "limit 1",
      ].join(" "),
      [leaseId, orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      property_id: row.property_id,
      tenant_name: row.tenant_name,
    };
  }

  async listDeadlineAlertRequests(
    orgId: string,
    cutoffDate: string,
  ): Promise<AlertRequestRow[]> {
    const result = await this.executor.query<AlertDbRow>(
      [
        "select id, property_id::text as property_id, lease_id::text as lease_id,",
        "  response_deadline::text as response_deadline, status",
        "from sb1103_requests",
        "where organization_id = $1",
        "  and response_deadline <= $2::date",
        "  and status <> 'delivered'",
        "order by response_deadline asc",
      ].join(" "),
      [orgId, cutoffDate],
    );
    return result.rows.map((r) => ({
      id: r.id,
      property_id: r.property_id,
      lease_id: r.lease_id,
      response_deadline: r.response_deadline,
      status: r.status,
    }));
  }

  async getPropertyNames(
    orgId: string,
    propertyIds: string[],
  ): Promise<Map<string, string>> {
    if (propertyIds.length === 0) return new Map();
    // Build $1, $2, ... placeholders starting after orgId ($1)
    const placeholders = propertyIds
      .map((_, i) => `$${i + 2}::uuid`)
      .join(", ");
    const result = await this.executor.query<{
      id: string;
      name: string | null;
    }>(
      `select id::text as id, coalesce(name, '') as name from properties where organization_id = $1 and id = any(array[${placeholders}])`,
      [orgId, ...propertyIds],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.id, row.name ?? "");
    }
    return map;
  }

  async getTenantNamesByLease(
    orgId: string,
    leaseIds: string[],
  ): Promise<Map<string, string>> {
    if (leaseIds.length === 0) return new Map();
    const placeholders = leaseIds.map((_, i) => `$${i + 2}::uuid`).join(", ");
    const result = await this.executor.query<{
      id: string;
      tenant_name: string | null;
    }>(
      [
        "select leases.id::text as id, leases.tenant_name",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where properties.organization_id = $1",
        `and leases.id = any(array[${placeholders}])`,
      ].join(" "),
      [orgId, ...leaseIds],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.id, row.tenant_name ?? "");
    }
    return map;
  }

  private async hasPurchasedCredits(orgId: string): Promise<boolean> {
    const result = await this.executor.query<ExistsRow>(
      [
        "select exists (",
        "select 1 from audit_credits",
        "where organization_id = $1",
        "and credits_purchased > 0",
        ")",
      ].join(" "),
      [orgId],
    );

    return result.rows[0]?.exists === true;
  }

  async getPropertyForExport(
    orgId: string,
    propertyId: string,
  ): Promise<PropertyExportInfo | null> {
    type Row = {
      id: string;
      name: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
    };
    const result = await this.executor.query<Row>(
      [
        "select id::text as id, name, address_line1, address_line2, city, state, postal_code",
        "from properties",
        "where id = $1::uuid and organization_id = $2",
        "limit 1",
      ].join(" "),
      [propertyId, orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name ?? "",
      address_line1: row.address_line1,
      address_line2: row.address_line2,
      city: row.city,
      state: row.state,
      postal_code: row.postal_code,
    };
  }

  async getLeaseForExport(
    orgId: string,
    leaseId: string,
  ): Promise<LeaseExportInfo | null> {
    type Row = {
      id: string;
      property_id: string;
      tenant_name: string | null;
      recovery_profile: Record<string, unknown> | null;
    };
    const result = await this.executor.query<Row>(
      [
        "select leases.id::text as id, leases.property_id::text as property_id,",
        "  leases.tenant_name, leases.recovery_profile",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where leases.id = $1::uuid",
        "and properties.organization_id = $2",
        "limit 1",
      ].join(" "),
      [leaseId, orgId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      property_id: row.property_id,
      tenant_name: row.tenant_name,
      recovery_profile: row.recovery_profile,
    };
  }

  async getGlEntriesForWindow(
    orgId: string,
    propertyId: string,
    windowStart: string,
    windowEnd: string,
  ): Promise<GlEntryRow[]> {
    type Row = {
      id: string;
      account_code: string;
      account_description: string;
      amount: string;
      transaction_date: string;
      vendor_name: string | null;
      description: string | null;
      import_batch_id: string;
    };
    const result = await this.executor.query<Row>(
      [
        "select gl_entries.id::text as id, gl_entries.account_code,",
        "  gl_entries.account_description, gl_entries.amount::text as amount,",
        "  gl_entries.transaction_date::text as transaction_date,",
        "  gl_entries.vendor_name, gl_entries.description,",
        "  gl_entries.import_batch_id::text as import_batch_id",
        "from gl_entries",
        "join properties on properties.id = gl_entries.property_id",
        "where gl_entries.property_id = $1::uuid",
        "  and properties.organization_id = $2",
        "  and transaction_date >= $3::date",
        "  and transaction_date <= $4::date",
        "order by transaction_date asc",
      ].join(" "),
      [propertyId, orgId, windowStart, windowEnd],
    );
    return result.rows.map((r) => ({
      id: r.id,
      account_code: r.account_code,
      account_description: r.account_description,
      amount: r.amount,
      transaction_date: r.transaction_date,
      vendor_name: r.vendor_name,
      description: r.description,
      import_batch_id: r.import_batch_id,
    }));
  }

  async markExported(input: MarkExportedInput): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update sb1103_requests",
        "set status = 'exported',",
        "    export_format = $1::text,",
        "    exported_at = $2::timestamptz,",
        "    updated_at = $2::timestamptz",
        "where id = $3::uuid and organization_id = $4",
        "  and status != 'delivered'",
        "returning id",
      ].join(" "),
      [input.format, input.exportedAt, input.id, input.orgId],
    );

    return result.rows.length === 1;
  }
}

function effectiveSubscriptionStatus(row: SubscriptionEntitlementRow): string {
  if (
    row.status !== "trialing" ||
    row.stripeSubscriptionId ||
    !row.currentPeriodEnd
  ) {
    return row.status;
  }

  const periodEnd =
    row.currentPeriodEnd instanceof Date
      ? row.currentPeriodEnd
      : new Date(row.currentPeriodEnd);

  if (Number.isNaN(periodEnd.getTime())) {
    return row.status;
  }

  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}
