import type {
  TenantDashboard,
  TenantEmailPreferences,
  TenantEmailPreferencesPatch,
  TenantLeaseDetail,
  TenantNotification,
  TenantPortalRepository,
  TenantStatementSummary,
  TenantUnitSummary,
} from "../../domain/tenant-portal/repository";
import type { PostgresExecutor } from "./postgres";

export class PostgresTenantPortalRepository implements TenantPortalRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getDashboard(input: {
    tenantUserId: string;
    organizationId: string;
  }): Promise<TenantDashboard> {
    const leaseIds = await this.getTenantLeaseIds(input.tenantUserId);
    if (leaseIds.length === 0) {
      return { leases: [], statements: [], unread_notifications: 0 };
    }

    const [leases, statements, unread] = await Promise.all([
      this.listLeaseDetails(leaseIds, input.organizationId),
      this.listStatementSummaries(leaseIds, input.organizationId),
      this.countUnreadNotifications(input.tenantUserId),
    ]);

    return {
      leases,
      statements,
      unread_notifications: unread,
    };
  }

  async listNotifications(input: {
    tenantUserId: string;
    unreadOnly: boolean;
    skip: number;
    limit: number;
  }): Promise<TenantNotification[]> {
    const clauses = ["tenant_user_id = $1"];
    if (input.unreadOnly) {
      clauses.push("read_at is null");
    }
    const result = await this.executor.query<TenantNotification>(
      [
        `select ${notificationColumns()}`,
        "from tenant_notifications",
        `where ${clauses.join(" and ")}`,
        "order by created_at desc, id desc",
        "offset $2",
        "limit $3",
      ].join(" "),
      [input.tenantUserId, input.skip, input.limit],
    );
    return result.rows;
  }

  async markNotificationRead(input: {
    tenantUserId: string;
    notificationId: string;
    readAt: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update tenant_notifications",
        "set read_at = $3",
        "where id = $1",
        "and tenant_user_id = $2",
        "and read_at is null",
        "returning id",
      ].join(" "),
      [input.notificationId, input.tenantUserId, input.readAt],
    );
    return result.rows.length > 0;
  }

  async markAllNotificationsRead(input: {
    tenantUserId: string;
    readAt: string;
  }): Promise<number> {
    const result = await this.executor.query<{ id: string }>(
      [
        "update tenant_notifications",
        "set read_at = $2",
        "where tenant_user_id = $1",
        "and read_at is null",
        "returning id",
      ].join(" "),
      [input.tenantUserId, input.readAt],
    );
    return result.rows.length;
  }

  async getEmailPreferences(input: {
    tenantUserId: string;
    timestamp: string;
  }): Promise<TenantEmailPreferences> {
    const result = await this.executor.query<TenantEmailPreferences>(
      [
        `select ${emailPreferenceColumns()}`,
        "from tenant_email_preferences",
        "where tenant_user_id = $1",
        "limit 1",
      ].join(" "),
      [input.tenantUserId],
    );
    return (
      result.rows[0] ?? {
        tenant_user_id: input.tenantUserId,
        new_statement_emails: true,
        dispute_update_emails: true,
        reminder_emails: true,
        marketing_emails: false,
        updated_at: input.timestamp,
      }
    );
  }

  async updateEmailPreferences(input: {
    tenantUserId: string;
    patch: TenantEmailPreferencesPatch;
    updatedAt: string;
  }): Promise<TenantEmailPreferences | null> {
    const current = await this.getEmailPreferences({
      tenantUserId: input.tenantUserId,
      timestamp: input.updatedAt,
    });
    const next: TenantEmailPreferences = {
      ...current,
      ...input.patch,
      updated_at: input.updatedAt,
    };
    const result = await this.executor.query<TenantEmailPreferences>(
      [
        "insert into tenant_email_preferences",
        "(tenant_user_id, new_statement_emails, dispute_update_emails, reminder_emails, marketing_emails, updated_at)",
        "values ($1, $2, $3, $4, $5, $6)",
        "on conflict (tenant_user_id) do update set",
        "new_statement_emails = excluded.new_statement_emails,",
        "dispute_update_emails = excluded.dispute_update_emails,",
        "reminder_emails = excluded.reminder_emails,",
        "marketing_emails = excluded.marketing_emails,",
        "updated_at = excluded.updated_at",
        `returning ${emailPreferenceColumns()}`,
      ].join(" "),
      [
        input.tenantUserId,
        next.new_statement_emails,
        next.dispute_update_emails,
        next.reminder_emails,
        next.marketing_emails,
        input.updatedAt,
      ],
    );
    return result.rows[0] ?? null;
  }

  private async getTenantLeaseIds(tenantUserId: string): Promise<string[]> {
    const result = await this.executor.query<{ lease_id: string }>(
      "select lease_id from tenant_lease_links where tenant_user_id = $1 order by created_at asc",
      [tenantUserId],
    );
    return result.rows.map((row) => row.lease_id);
  }

  private async listLeaseDetails(
    leaseIds: string[],
    organizationId: string,
  ): Promise<TenantLeaseDetail[]> {
    const result = await this.executor.query<LeaseDetailRow>(
      [
        "select leases.id, leases.start_date::text as start_date,",
        "leases.end_date::text as end_date, leases.recovery_profile,",
        "properties.id as property_id, properties.name as property_name,",
        "properties.address_line1, properties.city, properties.state, properties.postal_code,",
        "units.id as unit_id, units.unit_number, units.rentable_sqft::text as rentable_sqft",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "left join units on units.id = leases.unit_id",
        "where leases.id = any($1::uuid[])",
        "and properties.organization_id = $2",
        "order by properties.name asc, leases.start_date asc, leases.id asc",
      ].join(" "),
      [leaseIds, organizationId],
    );
    return result.rows.map(leaseDetailFromRow);
  }

  private async listStatementSummaries(
    leaseIds: string[],
    organizationId: string,
  ): Promise<TenantStatementSummary[]> {
    const snapshots = await this.executor.query<StatementRow>(
      [
        "select reconciliation_snapshots.id,",
        "reconciliation_snapshots.period_start_date::text as period_start,",
        "reconciliation_snapshots.period_end_date::text as period_end,",
        "reconciliation_snapshots.tenant_share_after_cap::text as tenant_share,",
        "reconciliation_snapshots.status as snapshot_status,",
        "reconciliation_snapshots.created_at::text as created_at,",
        "reconciliation_snapshots.property_id, properties.name as property_name",
        "from reconciliation_snapshots",
        "left join properties on properties.id = reconciliation_snapshots.property_id",
        "where reconciliation_snapshots.lease_id = any($1::uuid[])",
        "and reconciliation_snapshots.organization_id = $2",
        "and reconciliation_snapshots.status = 'finalized'",
        "order by reconciliation_snapshots.created_at desc, reconciliation_snapshots.id desc",
        "limit 10",
      ].join(" "),
      [leaseIds, organizationId],
    );
    if (snapshots.rows.length === 0) {
      return [];
    }
    const snapshotIds = snapshots.rows.map((row) => row.id);
    const disputes = await this.executor.query<{ statement_id: string }>(
      [
        "select distinct statement_id",
        "from disputes",
        "where statement_id = any($1::uuid[])",
        // disputes.status is the `disputestatus` enum; cast to text so it can be
        // compared against the text[] parameter (enum = text has no operator).
        "and status::text = any($2::text[])",
      ].join(" "),
      [snapshotIds, ["open", "under_review"]],
    );
    const disputed = new Set(disputes.rows.map((row) => row.statement_id));
    return snapshots.rows.map((row) => ({
      id: row.id,
      property_name: row.property_name ?? "Property",
      period_start: row.period_start,
      period_end: row.period_end,
      tenant_share: row.tenant_share,
      status: disputed.has(row.id) ? "disputed" : "pending",
      pdf_url:
        row.snapshot_status === "finalized"
          ? `/api/v1/tenant/statements/${row.id}/pdf`
          : null,
      created_at: row.created_at.slice(0, 10),
    }));
  }

  private async countUnreadNotifications(
    tenantUserId: string,
  ): Promise<number> {
    const result = await this.executor.query<{ count: string }>(
      [
        "select count(*)::text as count",
        "from tenant_notifications",
        "where tenant_user_id = $1",
        "and read_at is null",
      ].join(" "),
      [tenantUserId],
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
}

type LeaseDetailRow = {
  id: string;
  start_date: string;
  end_date: string;
  recovery_profile: unknown;
  property_id: string;
  property_name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  unit_id: string | null;
  unit_number: string | null;
  rentable_sqft: string | null;
};

type StatementRow = {
  id: string;
  period_start: string;
  period_end: string;
  tenant_share: string;
  snapshot_status: string;
  created_at: string;
  property_id: string | null;
  property_name: string | null;
};

function leaseDetailFromRow(row: LeaseDetailRow): TenantLeaseDetail {
  const recoveryProfile =
    typeof row.recovery_profile === "object" && row.recovery_profile !== null
      ? (row.recovery_profile as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    property: {
      id: row.property_id,
      name: row.property_name,
      address: propertyAddress(row),
    },
    unit:
      row.unit_id && row.unit_number && row.rentable_sqft
        ? ({
            id: row.unit_id,
            unit_number: row.unit_number,
            rentable_sqft: row.rentable_sqft,
          } satisfies TenantUnitSummary)
        : null,
    start_date: row.start_date,
    end_date: row.end_date,
    pro_rata_share: stringFromJson(recoveryProfile.pro_rata_share, "0"),
    base_year: numberFromJson(recoveryProfile.base_year),
  };
}

function propertyAddress(row: LeaseDetailRow): string {
  const cityState =
    row.city && row.state
      ? `${row.city}, ${row.state}${row.postal_code ? ` ${row.postal_code}` : ""}`
      : null;
  return [row.address_line1, cityState].filter(Boolean).join(", ");
}

function stringFromJson(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function numberFromJson(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function notificationColumns(): string {
  return [
    "id, tenant_user_id, notification_type, title, message, link_url,",
    "related_entity_id, read_at::text as read_at, created_at::text as created_at",
  ].join(" ");
}

function emailPreferenceColumns(): string {
  return [
    "tenant_user_id, new_statement_emails, dispute_update_emails,",
    "reminder_emails, marketing_emails, updated_at::text as updated_at",
  ].join(" ");
}
