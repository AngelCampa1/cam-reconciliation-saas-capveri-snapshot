/**
 * PostgreSQL adapter for DenominatorChangeRepository — EP-18.
 *
 * All queries use explicit organization_id WHERE clauses (NO RLS session).
 * Mirrors the Supabase-SDK queries in
 * backend/app/services/analysis/denominator_change.py.
 */

import type {
  DenominatorChangeRepository,
  PropertyRow,
  SnapshotRow,
} from "../../domain/denominator-change/repository";
import type { PostgresExecutor } from "./postgres";

type SnapshotDbRow = {
  lease_id: string;
  total_recovery: string;
  period_start_date: string;
  period_end_date: string;
  lease_terms_snapshot: string | null;
};

type PropertyDbRow = {
  id: string;
  name: string | null;
  total_rentable_sqft: string | null;
};
type ExistsRow = { exists: boolean };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

export class PostgresDenominatorChangeRepository implements DenominatorChangeRepository {
  constructor(private readonly executor: PostgresExecutor) {}

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

    if (!row) {
      return this.hasPurchasedCredits(organizationId);
    }

    if (row.billingModel === "credit_pack") {
      return this.hasPurchasedCredits(organizationId);
    }

    const status = effectiveSubscriptionStatus(row);
    return status === "active" || status === "trialing";
  }

  async listFinalizedSnapshotsInPeriod(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SnapshotRow[]> {
    const result = await this.executor.query<SnapshotDbRow>(
      [
        "select",
        "  lease_id::text as lease_id,",
        "  coalesce(total_recovery, 0)::text as total_recovery,",
        "  period_start_date::text as period_start_date,",
        "  period_end_date::text as period_end_date,",
        "  lease_terms_snapshot",
        "from reconciliation_snapshots",
        "where property_id = $1",
        "  and organization_id = $2",
        "  and status = 'finalized'",
        "  and period_start_date >= $3::date",
        "  and period_end_date <= $4::date",
        "order by period_start_date asc, lease_id asc",
      ].join(" "),
      [
        input.propertyId,
        input.organizationId,
        input.periodStart,
        input.periodEnd,
      ],
    );
    return result.rows.map(mapSnapshotRow);
  }

  async listFinalizedSnapshotsBefore(input: {
    propertyId: string;
    organizationId: string;
    beforeDate: string;
  }): Promise<SnapshotRow[]> {
    const result = await this.executor.query<SnapshotDbRow>(
      [
        "select",
        "  lease_id::text as lease_id,",
        "  coalesce(total_recovery, 0)::text as total_recovery,",
        "  period_start_date::text as period_start_date,",
        "  period_end_date::text as period_end_date,",
        "  lease_terms_snapshot",
        "from reconciliation_snapshots",
        "where property_id = $1",
        "  and organization_id = $2",
        "  and status = 'finalized'",
        "  and period_end_date < $3::date",
        "order by period_end_date desc, lease_id asc",
      ].join(" "),
      [input.propertyId, input.organizationId, input.beforeDate],
    );
    return result.rows.map(mapSnapshotRow);
  }

  async getProperty(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyRow | null> {
    const result = await this.executor.query<PropertyDbRow>(
      [
        "select id, name, total_rentable_sqft::text as total_rentable_sqft",
        "from properties",
        "where id = $1 and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      total_rentable_sqft: row.total_rentable_sqft,
    };
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<ExistsRow>(
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

function mapSnapshotRow(row: SnapshotDbRow): SnapshotRow {
  let leaseTermsSnapshot: Record<string, unknown> | null = null;
  if (row.lease_terms_snapshot) {
    if (typeof row.lease_terms_snapshot === "object") {
      // postgres driver may already parse JSONB
      leaseTermsSnapshot = row.lease_terms_snapshot as Record<string, unknown>;
    } else if (typeof row.lease_terms_snapshot === "string") {
      try {
        leaseTermsSnapshot = JSON.parse(row.lease_terms_snapshot) as Record<
          string,
          unknown
        >;
      } catch {
        leaseTermsSnapshot = null;
      }
    }
  }
  return {
    lease_id: row.lease_id,
    total_recovery: row.total_recovery,
    period_start_date: row.period_start_date,
    period_end_date: row.period_end_date,
    lease_terms_snapshot: leaseTermsSnapshot,
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

  if (Number.isNaN(periodEnd.getTime())) {
    return row.status;
  }

  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}
