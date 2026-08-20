import type {
  ActivityItem,
  AlertItem,
  BootstrapRepository,
  DashboardSummary,
  LeakageSummaryResponse,
  PlanSelectionResponse,
  PropertySummary,
} from "../../domain/bootstrap/repository";
import type { PostgresExecutor } from "./postgres";

type SumRow = { total: string | number | null };
type DashboardCountsRow = {
  property_count: string | number | bigint;
  unit_count: string | number | bigint;
  lease_count: string | number | bigint;
  gl_entry_count: string | number | bigint;
  pending_reconciliations: string | number | bigint;
  pending_verifications: string | number | bigint;
};
type RecentPropertyRow = {
  id: string;
  name: string;
  unit_count: string | number | bigint;
  snapshot_status: string | null;
  snapshot_created_at: string | Date | null;
};
type ActivityRow = {
  id: string;
  type: ActivityItem["type"];
  title: string;
  description: string;
  timestamp: string | Date;
  href: string;
};
type LeakageRow = {
  total_recovery_opportunity: string | number | null;
  properties_with_leakage: string | number | bigint;
  total_underbill_exposure: string | number | null;
  total_overbill_exposure: string | number | null;
  total_billing_exposure: string | number | null;
  properties_with_underbill: string | number | bigint;
  properties_with_overbill: string | number | bigint;
  properties_with_billing_exposure: string | number | bigint;
  has_billing_data: boolean;
  draft_recovery: string | number | null;
  draft_property_count: string | number | bigint;
};
type OrganizationSettingsRow = { settings: unknown };
type SubscriptionRow = {
  status: string;
  billing_model: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | Date | null;
};

type BillingActivation = {
  plan_id?: unknown;
  billing_period?: unknown;
  unit_count?: unknown;
  building_count?: unknown;
  selected_at?: unknown;
};

export class PostgresBootstrapRepository implements BootstrapRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getDashboardSummary(organizationId: string): Promise<DashboardSummary> {
    const counts = await this.getDashboardCounts(organizationId);
    const [recentProperties, recentActivity, totalRecoveryFinalized] =
      await Promise.all([
        this.getRecentProperties(organizationId),
        this.getRecentActivity(organizationId),
        this.getFinalizedRecoveryTotal(organizationId),
      ]);

    return {
      property_count: counts.property_count,
      unit_count: counts.unit_count,
      lease_count: counts.lease_count,
      gl_entry_count: counts.gl_entry_count,
      pending_reconciliations: counts.pending_reconciliations,
      pending_verifications: counts.pending_verifications,
      recent_properties: recentProperties,
      recent_activity: recentActivity,
      total_recovery_finalized: totalRecoveryFinalized,
      alerts: buildAlerts(counts.property_count, counts.pending_verifications),
    };
  }

  async getLeakageSummary(
    organizationId: string,
  ): Promise<LeakageSummaryResponse> {
    const result = await this.executor.query<LeakageRow>(
      [
        "with org_properties as (",
        "select id from properties where organization_id = $1",
        "), finalized as (",
        "select property_id, coalesce(sum(total_recovery), 0) as calculated",
        "from reconciliation_snapshots",
        "where organization_id = $1 and status = 'finalized'",
        "and property_id in (select id from org_properties)",
        "group by property_id",
        "), drafts as (",
        "select property_id, coalesce(sum(total_recovery), 0) as draft_total",
        "from reconciliation_snapshots",
        "where organization_id = $1 and status = 'draft'",
        "and property_id in (select id from org_properties)",
        "group by property_id",
        "), billed as (",
        "select property_id, coalesce(sum(billed_amount), 0) as billed_total",
        "from actual_billed_amounts",
        "where organization_id = $1",
        "and property_id in (select id from org_properties)",
        "group by property_id",
        "), leakage as (",
        "select coalesce(finalized.calculated, 0) - coalesce(billed.billed_total, 0) as variance",
        "from org_properties",
        "left join finalized on finalized.property_id = org_properties.id",
        "left join billed on billed.property_id = org_properties.id",
        ")",
        "select",
        "coalesce(sum(greatest(leakage.variance, 0)), 0)::text as total_recovery_opportunity,",
        "count(*) filter (where leakage.variance > 0) as properties_with_leakage,",
        "coalesce(sum(greatest(leakage.variance, 0)), 0)::text as total_underbill_exposure,",
        "coalesce(sum(abs(least(leakage.variance, 0))), 0)::text as total_overbill_exposure,",
        "coalesce(sum(abs(leakage.variance)), 0)::text as total_billing_exposure,",
        "count(*) filter (where leakage.variance > 0) as properties_with_underbill,",
        "count(*) filter (where leakage.variance < 0) as properties_with_overbill,",
        "count(*) filter (where leakage.variance <> 0) as properties_with_billing_exposure,",
        "exists (select 1 from actual_billed_amounts where organization_id = $1) as has_billing_data,",
        "coalesce((select sum(draft_total) from drafts), 0)::text as draft_recovery,",
        "(select count(*) from drafts) as draft_property_count",
        "from leakage",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    return {
      total_recovery_opportunity: toMoneyString(
        row?.total_recovery_opportunity,
      ),
      properties_with_leakage: toCount(row?.properties_with_leakage ?? 0),
      total_underbill_exposure: toMoneyString(row?.total_underbill_exposure),
      total_overbill_exposure: toMoneyString(row?.total_overbill_exposure),
      total_billing_exposure: toMoneyString(row?.total_billing_exposure),
      properties_with_underbill: toCount(
        row?.properties_with_underbill ?? 0,
      ),
      properties_with_overbill: toCount(row?.properties_with_overbill ?? 0),
      properties_with_billing_exposure: toCount(
        row?.properties_with_billing_exposure ?? 0,
      ),
      has_billing_data: row?.has_billing_data === true,
      draft_recovery: toMoneyString(row?.draft_recovery),
      draft_property_count: toCount(row?.draft_property_count ?? 0),
    };
  }

  async getPlanSelection(
    organizationId: string,
  ): Promise<PlanSelectionResponse> {
    const [activation, subscription, hasPurchasedCredits] = await Promise.all([
      this.getBillingActivation(organizationId),
      this.getLatestSubscription(organizationId),
      this.hasPurchasedCredits(organizationId),
    ]);
    const effectiveStatus = subscription
      ? effectiveSubscriptionStatus(subscription)
      : null;
    const hasActiveAccess =
      effectiveStatus === "active" ||
      effectiveStatus === "trialing" ||
      hasPurchasedCredits;
    const hasPausedSubscription = effectiveStatus === "paused";

    return {
      plan_id:
        typeof activation?.plan_id === "string" ? activation.plan_id : null,
      billing_period: activation?.billing_period === "annual" ? "annual" : null,
      unit_count:
        typeof activation?.unit_count === "number"
          ? activation.unit_count
          : null,
      building_count:
        typeof activation?.building_count === "number"
          ? activation.building_count
          : null,
      selected_at:
        typeof activation?.selected_at === "string"
          ? activation.selected_at
          : null,
      checkout_required: !hasActiveAccess && !hasPausedSubscription,
      has_active_access: hasActiveAccess,
      has_paused_subscription: hasPausedSubscription,
      subscription_status: effectiveStatus,
      trial_days_remaining: trialDaysRemaining(subscription, effectiveStatus),
    };
  }

  private async getDashboardCounts(
    organizationId: string,
  ): Promise<
    Omit<
      DashboardSummary,
      | "recent_properties"
      | "recent_activity"
      | "total_recovery_finalized"
      | "alerts"
    >
  > {
    const result = await this.executor.query<DashboardCountsRow>(
      [
        "select",
        "(select count(*) from properties where organization_id = $1) as property_count,",
        "(select count(*) from units join properties on properties.id = units.property_id where properties.organization_id = $1) as unit_count,",
        "(select count(*) from leases join properties on properties.id = leases.property_id where properties.organization_id = $1) as lease_count,",
        "(select count(*) from gl_entries join properties on properties.id = gl_entries.property_id where properties.organization_id = $1) as gl_entry_count,",
        "(select count(*) from reconciliation_snapshots where organization_id = $1 and status = 'draft') as pending_reconciliations,",
        "(select count(*) from documents where organization_id = $1 and status = 'ready_for_review') as pending_verifications",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    return {
      property_count: toCount(row?.property_count ?? 0),
      unit_count: toCount(row?.unit_count ?? 0),
      lease_count: toCount(row?.lease_count ?? 0),
      gl_entry_count: toCount(row?.gl_entry_count ?? 0),
      pending_reconciliations: toCount(row?.pending_reconciliations ?? 0),
      pending_verifications: toCount(row?.pending_verifications ?? 0),
    };
  }

  private async getRecentProperties(
    organizationId: string,
  ): Promise<PropertySummary[]> {
    const result = await this.executor.query<RecentPropertyRow>(
      [
        "with recent as (",
        "select id, name, created_at",
        "from properties",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 5",
        "), latest_snapshots as (",
        "select distinct on (property_id) property_id, status, created_at",
        "from reconciliation_snapshots",
        "where organization_id = $1",
        "order by property_id, created_at desc",
        ")",
        "select recent.id, recent.name, count(units.id) as unit_count,",
        "latest_snapshots.status as snapshot_status,",
        "latest_snapshots.created_at as snapshot_created_at",
        "from recent",
        "left join units on units.property_id = recent.id",
        "left join latest_snapshots on latest_snapshots.property_id = recent.id",
        "group by recent.id, recent.name, recent.created_at, latest_snapshots.status, latest_snapshots.created_at",
        "order by recent.created_at desc",
      ].join(" "),
      [organizationId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      unit_count: toCount(row.unit_count),
      last_reconciliation: formatLastReconciliation(
        row.snapshot_status,
        row.snapshot_created_at,
      ),
    }));
  }

  private async getRecentActivity(
    organizationId: string,
  ): Promise<ActivityItem[]> {
    const result = await this.executor.query<ActivityRow>(
      [
        "(select id, 'property' as type, 'Property added' as title, name as description, created_at as timestamp, '/properties/' || id::text as href",
        "from properties",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 5)",
        "union all",
        "(select leases.id, 'lease' as type, 'Lease added' as title, leases.tenant_name as description, leases.created_at as timestamp, '/properties/' || leases.property_id::text as href",
        "from leases",
        "join properties on properties.id = leases.property_id",
        "where properties.organization_id = $1",
        "order by leases.created_at desc",
        "limit 5)",
        "union all",
        "(select id, 'upload' as type, 'Document uploaded' as title, filename as description, created_at as timestamp, '/extractions' as href",
        "from documents",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 5)",
        "order by timestamp desc",
        "limit 10",
      ].join(" "),
      [organizationId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      timestamp: toIsoTimestamp(row.timestamp),
      href: row.href,
    }));
  }

  private async getFinalizedRecoveryTotal(
    organizationId: string,
  ): Promise<string> {
    const result = await this.executor.query<SumRow>(
      [
        "select coalesce(sum(total_recovery), 0)::text as total",
        "from reconciliation_snapshots",
        "where organization_id = $1 and status = 'finalized'",
      ].join(" "),
      [organizationId],
    );

    return toMoneyString(result.rows[0]?.total);
  }

  private async getBillingActivation(
    organizationId: string,
  ): Promise<BillingActivation | null> {
    const result = await this.executor.query<OrganizationSettingsRow>(
      "select settings from organizations where id = $1",
      [organizationId],
    );
    const settings = result.rows[0]?.settings;

    if (!isRecord(settings)) {
      return null;
    }

    const activation = settings.billing_activation;
    return isRecord(activation) ? activation : null;
  }

  private async getLatestSubscription(
    organizationId: string,
  ): Promise<SubscriptionRow | null> {
    const result = await this.executor.query<SubscriptionRow>(
      [
        "select status::text as status, billing_model, stripe_subscription_id, current_period_end",
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0] ?? null;
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<{ exists: boolean }>(
      [
        "select exists (",
        "select 1 from audit_credits",
        "where organization_id = $1 and credits_purchased > 0",
        ")",
      ].join(" "),
      [organizationId],
    );

    return result.rows[0]?.exists === true;
  }
}

function buildAlerts(
  propertyCount: number,
  pendingVerifications: number,
): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (propertyCount === 0) {
    alerts.push({
      id: "no-properties",
      type: "action",
      title: "Add your first property",
      description: "Get started by adding a commercial property to manage.",
      href: "/properties/new",
    });
  }

  if (pendingVerifications > 0) {
    alerts.push({
      id: "pending-verifications",
      type: "warning",
      title: "Documents need review",
      description: `${pendingVerifications} document(s) awaiting verification.`,
      href: "/extractions",
      count: pendingVerifications,
    });
  }

  return alerts;
}

function formatLastReconciliation(
  status: string | null,
  createdAt: string | Date | null,
): string | null {
  if (!createdAt) {
    return null;
  }

  const date = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  const datePart = date.slice(0, 10);
  const label = status === "finalized" ? "Finalized" : "Draft";

  return datePart ? `${label} (${datePart})` : label;
}

function effectiveSubscriptionStatus(row: SubscriptionRow): string {
  if (
    row.status !== "trialing" ||
    row.stripe_subscription_id ||
    !row.current_period_end
  ) {
    return row.status;
  }

  const periodEnd = toDate(row.current_period_end);

  if (!periodEnd) {
    return row.status;
  }

  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}

function trialDaysRemaining(
  row: SubscriptionRow | null,
  effectiveStatus: string | null,
): number | null {
  if (
    !row ||
    effectiveStatus !== "trialing" ||
    row.status !== "trialing" ||
    row.stripe_subscription_id ||
    !row.current_period_end
  ) {
    return null;
  }

  const periodEnd = toDate(row.current_period_end);

  if (!periodEnd) {
    return 0;
  }

  const remainingMs = periodEnd.getTime() - Date.now();

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(remainingMs / 86_400_000));
}

function toCount(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value, 10);
}

function toMoneyString(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0";
  }

  return String(value);
}

function toIsoTimestamp(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
