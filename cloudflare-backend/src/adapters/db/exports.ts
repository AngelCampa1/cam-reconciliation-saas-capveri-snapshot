/**
 * Postgres adapter for the exports sub-slice.
 * All queries use parameterized PostgresExecutor.query<Row>(sql, params).
 * Org-scoping is enforced via WHERE organization_id = $n on every query.
 */

import type { SnapshotForErp } from "../../domain/exports/erp-formatters";
import { toPythonReprOrEmpty } from "../../domain/exports/python-repr";
import { normalizeCalculationTrace } from "./calculation-trace";
import type {
  AuditLogQueryInput,
  AuditLogRow,
  DemandLetterContext,
  ExportHistoryListInput,
  ExportHistoryPage,
  ExportHistoryRow,
  ExportsRepository,
  PropertyNameRow,
  SnapshotPdfContext,
  SnapshotSummary,
} from "../../domain/exports/repository";
import type { PostgresExecutor } from "./postgres";

// ── raw DB row types ──────────────────────────────────────────────────────────

type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

type SnapshotPdfRow = {
  id: string;
  lease_id: string;
  period_start_date: string;
  period_end_date: string;
  total_recovery: string;
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  status: string;
  calculation_trace: unknown;
  tenant_name: string | null;
  property_name: string | null;
  property_address: string | null;
  org_name: string | null;
};

type SnapshotRow = {
  id: string;
  lease_id: string;
  period_start_date: string;
  period_end_date: string;
  total_recovery: string;
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  status: string;
  property_id: string;
  property_name: string | null;
  tenant_name: string | null;
};

type AuditRow = {
  id: string;
  table_name: string;
  operation: string;
  row_id: string | null;
  old_data: unknown;
  new_data: unknown;
  changed_by: string | null;
  changed_at: string;
};

type ExportHistoryDbRow = {
  id: string;
  organization_id: string;
  property_id: string;
  format: string;
  file_name: string;
  file_size: string | null;
  status: string;
  created_by_name: string | null;
  created_at: string;
  storage_path: string | null;
};

// ── mapper helpers ────────────────────────────────────────────────────────────

function snapshotFromRow(row: SnapshotRow): SnapshotForErp {
  return {
    id: row.id,
    lease_id: row.lease_id,
    period_start_date: row.period_start_date,
    period_end_date: row.period_end_date,
    total_recovery: row.total_recovery,
    total_operating_expenses: row.total_operating_expenses,
    grossed_up_expenses: row.grossed_up_expenses,
    base_year_amount: row.base_year_amount,
    tenant_share_before_cap: row.tenant_share_before_cap,
    tenant_share_after_cap: row.tenant_share_after_cap,
    admin_fee: row.admin_fee,
    status: row.status,
    properties:
      row.property_name !== null
        ? { id: row.property_id, name: row.property_name }
        : null,
    leases: row.tenant_name !== null ? { tenant_name: row.tenant_name } : null,
  };
}

function auditFromRow(row: AuditRow): AuditLogRow {
  return {
    id: String(row.id),
    table_name: row.table_name,
    operation: row.operation,
    row_id: row.row_id ?? null,
    old_data: toPythonReprOrEmpty(row.old_data),
    new_data: toPythonReprOrEmpty(row.new_data),
    changed_by: row.changed_by ?? null,
    changed_at: row.changed_at,
  };
}

function exportHistoryFromRow(row: ExportHistoryDbRow): ExportHistoryRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    property_id: row.property_id,
    format: row.format,
    file_name: row.file_name,
    file_size:
      row.file_size !== null ? Number.parseInt(row.file_size, 10) : null,
    status: row.status,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    storage_path: row.storage_path,
  };
}

// ── Snapshot SELECT fragment ──────────────────────────────────────────────────

const SNAPSHOT_SELECT = [
  "rs.id,",
  "rs.lease_id::text,",
  "rs.period_start_date::text,",
  "rs.period_end_date::text,",
  "coalesce(rs.total_recovery, 0)::text as total_recovery,",
  "coalesce(rs.total_operating_expenses, 0)::text as total_operating_expenses,",
  "coalesce(rs.grossed_up_expenses, 0)::text as grossed_up_expenses,",
  "coalesce(rs.base_year_amount, 0)::text as base_year_amount,",
  "coalesce(rs.tenant_share_before_cap, 0)::text as tenant_share_before_cap,",
  "coalesce(rs.tenant_share_after_cap, 0)::text as tenant_share_after_cap,",
  "coalesce(rs.admin_fee, 0)::text as admin_fee,",
  "rs.status,",
  "rs.property_id::text,",
  "p.name as property_name,",
  "l.tenant_name",
].join(" ");

// ── implementation ────────────────────────────────────────────────────────────

export class PostgresExportsRepository implements ExportsRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getSnapshotForErp(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<SnapshotForErp | null> {
    const result = await this.executor.query<SnapshotRow>(
      [
        `select ${SNAPSHOT_SELECT}`,
        "from reconciliation_snapshots rs",
        "join properties p on p.id = rs.property_id",
        "join leases l on l.id = rs.lease_id",
        "where rs.id = $1",
        "and rs.organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.snapshotId, input.organizationId],
    );
    const row = result.rows[0];
    return row ? snapshotFromRow(row) : null;
  }

  async listSnapshotsForErpBatch(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SnapshotForErp[]> {
    // Overlap: snapshot.period_start_date <= periodEnd
    //          AND snapshot.period_end_date >= periodStart
    // (mirrors FastAPI: .lte("period_start_date", period_end) + .gte("period_end_date", period_start))
    const result = await this.executor.query<SnapshotRow>(
      [
        `select ${SNAPSHOT_SELECT}`,
        "from reconciliation_snapshots rs",
        "join properties p on p.id = rs.property_id",
        "join leases l on l.id = rs.lease_id",
        "where rs.organization_id = $1",
        "and rs.property_id = $2",
        "and rs.status = 'finalized'",
        "and rs.period_start_date <= $3",
        "and rs.period_end_date >= $4",
        "order by rs.period_start_date asc, rs.id asc",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.periodEnd,
        input.periodStart,
      ],
    );
    return result.rows.map(snapshotFromRow);
  }

  async propertyBelongsToOrg(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      "select id from properties where id = $1 and organization_id = $2 limit 1",
      [input.propertyId, input.organizationId],
    );
    return result.rows.length > 0;
  }

  async queryAuditLog(input: AuditLogQueryInput): Promise<AuditLogRow[]> {
    const clauses: string[] = ["al.organization_id = $1"];
    const params: unknown[] = [input.organizationId];
    let idx = 2;

    if (input.startDate !== undefined) {
      clauses.push(`al.changed_at >= $${idx}`);
      params.push(input.startDate);
      idx++;
    }

    if (input.endDate !== undefined) {
      // FastAPI: include entire end date by appending max time
      // We replicate by using < next-day boundary or <= end-of-day via timestamp.
      // FastAPI does: datetime.combine(end_date, datetime.max.time()) as isoformat
      // We add one day and use < for equivalent inclusive coverage.
      clauses.push(`al.changed_at <= $${idx}`);
      params.push(input.endDate + "T23:59:59.999999");
      idx++;
    }

    if (input.tableName !== undefined) {
      clauses.push(`al.table_name = $${idx}`);
      params.push(input.tableName);
      idx++;
    }

    if (input.operation !== undefined) {
      clauses.push(`al.operation = $${idx}`);
      params.push(input.operation.toUpperCase());
      idx++;
    }

    if (input.rowId !== undefined) {
      clauses.push(`al.row_id = $${idx}`);
      params.push(input.rowId);
      idx++;
    }

    if (input.changedBy !== undefined) {
      clauses.push(`al.changed_by = $${idx}`);
      params.push(input.changedBy);
      idx++;
    }

    params.push(input.limit);
    const limitIdx = idx;

    const result = await this.executor.query<AuditRow>(
      [
        "select al.id::text, al.table_name, al.operation,",
        "al.row_id::text, al.old_data, al.new_data,",
        "al.changed_by::text, al.changed_at::text",
        "from audit_log al",
        `where ${clauses.join(" and ")}`,
        "order by al.changed_at desc",
        `limit $${limitIdx}`,
      ].join(" "),
      params,
    );

    return result.rows.map(auditFromRow);
  }

  async listExportHistory(
    input: ExportHistoryListInput,
  ): Promise<ExportHistoryPage> {
    const offset = (input.page - 1) * input.pageSize;

    const countClauses = ["organization_id = $1", "property_id = $2"];
    const countParams: unknown[] = [input.organizationId, input.propertyId];
    let idx = 3;

    if (input.format !== undefined) {
      countClauses.push(`format = $${idx}`);
      countParams.push(input.format);
      idx++;
    }

    // Count query
    const countResult = await this.executor.query<{ total: string }>(
      `select count(*)::text as total from export_history where ${countClauses.join(" and ")}`,
      countParams,
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

    // Data query
    const dataClauses = [...countClauses];
    const dataParams = [...countParams];

    dataParams.push(input.pageSize);
    const limitIdx = idx++;
    dataParams.push(offset);
    const offsetIdx = idx;

    const dataResult = await this.executor.query<ExportHistoryDbRow>(
      [
        "select id, organization_id, property_id::text, format, file_name,",
        "file_size::text, status, created_by_name,",
        "created_at::text, storage_path",
        "from export_history",
        `where ${dataClauses.join(" and ")}`,
        "order by created_at desc",
        `limit $${limitIdx}`,
        `offset $${offsetIdx}`,
      ].join(" "),
      dataParams,
    );

    return {
      items: dataResult.rows.map(exportHistoryFromRow),
      total,
      page: input.page,
      page_size: input.pageSize,
    };
  }

  async getSnapshotForPdf(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<SnapshotPdfContext | null> {
    const result = await this.executor.query<SnapshotPdfRow>(
      [
        "select rs.id, rs.lease_id::text, rs.period_start_date::text,",
        "rs.period_end_date::text,",
        "coalesce(rs.total_recovery, 0)::text as total_recovery,",
        "coalesce(rs.total_operating_expenses, 0)::text as total_operating_expenses,",
        "coalesce(rs.grossed_up_expenses, 0)::text as grossed_up_expenses,",
        "coalesce(rs.base_year_amount, 0)::text as base_year_amount,",
        "coalesce(rs.tenant_share_before_cap, 0)::text as tenant_share_before_cap,",
        "coalesce(rs.tenant_share_after_cap, 0)::text as tenant_share_after_cap,",
        "coalesce(rs.admin_fee, 0)::text as admin_fee,",
        "rs.status,",
        "rs.calculation_trace,",
        "l.tenant_name,",
        "p.name as property_name,",
        "concat_ws(', ',",
        "  nullif(p.address_line1, ''),",
        "  nullif(concat_ws(', ', nullif(p.city, ''), nullif(p.state, '')), ''),",
        "  nullif(p.postal_code, '')",
        ") as property_address,",
        "o.name as org_name",
        "from reconciliation_snapshots rs",
        "join leases l on l.id = rs.lease_id",
        "join properties p on p.id = rs.property_id",
        "join organizations o on o.id = rs.organization_id",
        "where rs.id = $1 and rs.organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.snapshotId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return snapshotPdfContextFromRow(row);
  }

  async listSnapshotsForPropertyPdf(input: {
    organizationId: string;
    propertyId: string;
    yearStart: string;
    yearEnd: string;
    leaseId?: string;
  }): Promise<SnapshotPdfContext[]> {
    const clauses: string[] = [
      "rs.organization_id = $1",
      "rs.property_id = $2",
      "rs.status = 'finalized'",
      "rs.period_start_date <= $3",
      "rs.period_end_date >= $4",
    ];
    const params: unknown[] = [
      input.organizationId,
      input.propertyId,
      input.yearEnd,
      input.yearStart,
    ];

    if (input.leaseId !== undefined) {
      clauses.push(`rs.lease_id = $${params.length + 1}`);
      params.push(input.leaseId);
    }

    const result = await this.executor.query<SnapshotPdfRow>(
      [
        "select rs.id, rs.lease_id::text, rs.period_start_date::text,",
        "rs.period_end_date::text,",
        "coalesce(rs.total_recovery, 0)::text as total_recovery,",
        "coalesce(rs.total_operating_expenses, 0)::text as total_operating_expenses,",
        "coalesce(rs.grossed_up_expenses, 0)::text as grossed_up_expenses,",
        "coalesce(rs.base_year_amount, 0)::text as base_year_amount,",
        "coalesce(rs.tenant_share_before_cap, 0)::text as tenant_share_before_cap,",
        "coalesce(rs.tenant_share_after_cap, 0)::text as tenant_share_after_cap,",
        "coalesce(rs.admin_fee, 0)::text as admin_fee,",
        "rs.status,",
        "rs.calculation_trace,",
        "l.tenant_name,",
        "p.name as property_name,",
        "concat_ws(', ',",
        "  nullif(p.address_line1, ''),",
        "  nullif(concat_ws(', ', nullif(p.city, ''), nullif(p.state, '')), ''),",
        "  nullif(p.postal_code, '')",
        ") as property_address,",
        "o.name as org_name",
        "from reconciliation_snapshots rs",
        "join leases l on l.id = rs.lease_id",
        "join properties p on p.id = rs.property_id",
        "join organizations o on o.id = rs.organization_id",
        `where ${clauses.join(" and ")}`,
        "order by rs.period_start_date asc, rs.id asc",
      ].join(" "),
      params,
    );
    return result.rows.map(snapshotPdfContextFromRow);
  }

  async getDemandLetterContext(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<DemandLetterContext | null> {
    type DemandRow = {
      id: string;
      status: string;
      total_recovery: string;
      period_start_date: string;
      period_end_date: string;
      lease_id: string;
      tenant_name: string | null;
      property_address: string | null;
    };

    const result = await this.executor.query<DemandRow>(
      [
        "select rs.id, rs.status,",
        "coalesce(rs.total_recovery, 0)::text as total_recovery,",
        "rs.period_start_date::text, rs.period_end_date::text,",
        "rs.lease_id::text,",
        "l.tenant_name,",
        "concat_ws(', ',",
        "  nullif(p.address_line1, ''),",
        "  nullif(concat_ws(', ', nullif(p.city, ''), nullif(p.state, '')), ''),",
        "  nullif(p.postal_code, '')",
        ") as property_address",
        "from reconciliation_snapshots rs",
        "join leases l on l.id = rs.lease_id",
        "join properties p on p.id = rs.property_id",
        "where rs.id = $1 and rs.organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.snapshotId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      snapshot: {
        id: row.id,
        status: row.status,
        total_recovery: row.total_recovery,
        period_start_date: row.period_start_date,
        period_end_date: row.period_end_date,
        lease_id: row.lease_id,
      },
      lease: { tenant_name: row.tenant_name ?? row.lease_id },
      property: { address: row.property_address },
    };
  }

  async insertExportHistory(input: {
    organizationId: string;
    propertyId: string;
    format: string;
    fileName: string;
    fileSize: number;
    createdByName: string;
    storagePath: string;
  }): Promise<string> {
    const result = await this.executor.query<{ id: string }>(
      [
        "insert into export_history",
        "(organization_id, property_id, format, file_name, file_size, status, created_by_name, storage_path)",
        "values ($1, $2, $3, $4, $5, 'completed', $6, $7)",
        "returning id::text",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.format,
        input.fileName,
        input.fileSize,
        input.createdByName,
        input.storagePath,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("export_history insert returned no row");
    }
    return row.id;
  }

  async getExportHistoryRow(input: {
    exportId: string;
    organizationId: string;
  }): Promise<
    import("../../domain/exports/repository").ExportHistoryRow | null
  > {
    const result = await this.executor.query<ExportHistoryDbRow>(
      [
        "select id, organization_id, property_id::text, format, file_name,",
        "file_size::text, status, created_by_name, created_at::text, storage_path",
        "from export_history",
        "where id = $1 and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.exportId, input.organizationId],
    );
    const row = result.rows[0];
    return row ? exportHistoryFromRow(row) : null;
  }

  async deleteExportHistory(input: {
    exportId: string;
    organizationId: string;
    beforeDeleteStorage?: (storagePath: string) => Promise<void>;
  }): Promise<ExportHistoryRow | null> {
    return this.executor.transaction(async (transaction) => {
      const result = await transaction.query<ExportHistoryDbRow>(
        [
          "select id, organization_id, property_id::text, format, file_name,",
          "file_size::text, status, created_by_name, created_at::text, storage_path",
          "from export_history",
          "where id = $1 and organization_id = $2",
          "for update",
        ].join(" "),
        [input.exportId, input.organizationId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const exportRow = exportHistoryFromRow(row);
      if (exportRow.storage_path) {
        await input.beforeDeleteStorage?.(exportRow.storage_path);
      }

      await transaction.query(
        "delete from export_history where id = $1 and organization_id = $2",
        [input.exportId, input.organizationId],
      );

      return exportRow;
    });
  }

  async listSnapshotsForYear(input: {
    organizationId: string;
    propertyId: string;
    yearStart: string;
    yearEnd: string;
  }): Promise<SnapshotSummary[]> {
    type SummaryRow = {
      id: string;
      lease_id: string;
      total_recovery: string;
      period_start_date: string;
    };
    const result = await this.executor.query<SummaryRow>(
      [
        "select rs.id, rs.lease_id::text,",
        "coalesce(rs.total_recovery, 0)::text as total_recovery,",
        "rs.period_start_date::text",
        "from reconciliation_snapshots rs",
        "where rs.organization_id = $1",
        "and rs.property_id = $2",
        "and rs.status = 'finalized'",
        "and rs.period_start_date <= $3",
        "and rs.period_end_date >= $4",
        "order by rs.period_start_date asc, rs.id asc",
      ].join(" "),
      [input.organizationId, input.propertyId, input.yearEnd, input.yearStart],
    );
    return result.rows.map((row) => ({
      id: row.id,
      lease_id: row.lease_id,
      total_recovery: row.total_recovery,
      period_start_date: row.period_start_date,
    }));
  }

  async getPropertyName(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyNameRow | null> {
    type PropRow = { id: string; name: string | null; org_name: string | null };
    const result = await this.executor.query<PropRow>(
      [
        "select p.id, p.name, o.name as org_name",
        "from properties p",
        "join organizations o on o.id = p.organization_id",
        "where p.id = $1 and p.organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name ?? "",
      org_name: row.org_name ?? "",
    };
  }

  async hasFullAccess(organizationId: string): Promise<boolean> {
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
      [organizationId],
    );
    const row = result.rows[0];
    if (!row) return this.hasPurchasedCredits(organizationId);
    if (row.billingModel === "credit_pack")
      return this.hasPurchasedCredits(organizationId);
    const status = effectiveSubscriptionStatus(row);
    return status === "active" || status === "trialing";
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{ exists: boolean }>(
      [
        "select exists (",
        "select 1 from audit_credits",
        "where organization_id = $1",
        "and credits_purchased > 0",
        ")",
      ].join(" "),
      [organizationId],
    );
    return result.rows[0]?.exists === true;
  }
}

// ── module-level helpers ──────────────────────────────────────────────────────

function snapshotPdfContextFromRow(row: SnapshotPdfRow): SnapshotPdfContext {
  const trace = normalizeCalculationTrace(row.calculation_trace);

  return {
    snapshot: {
      id: row.id,
      lease_id: row.lease_id,
      period_start_date: row.period_start_date,
      period_end_date: row.period_end_date,
      total_operating_expenses: row.total_operating_expenses,
      grossed_up_expenses: row.grossed_up_expenses,
      base_year_amount: row.base_year_amount,
      tenant_share_before_cap: row.tenant_share_before_cap,
      tenant_share_after_cap: row.tenant_share_after_cap,
      admin_fee: row.admin_fee,
      total_recovery: row.total_recovery,
      status: row.status,
      calculation_trace: trace,
    },
    lease: { tenant_name: row.tenant_name ?? "" },
    property: {
      name: row.property_name ?? "",
      address: row.property_address ?? null,
    },
    organization: { name: row.org_name ?? "" },
  };
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
  if (Number.isNaN(periodEnd.getTime())) return row.status;
  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}
