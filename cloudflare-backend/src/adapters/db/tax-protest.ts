/**
 * PostgreSQL adapter for TaxProtestRepository.
 *
 * All queries include explicit organization_id WHERE clauses (NO RLS session).
 * Mirrors backend/app/api/v1/tax_protest.py GET /deadlines and POST /generate.
 */

import Decimal from "decimal.js";
import { normalizeCalculationTrace } from "./calculation-trace";
import type { GlPool } from "../../domain/tax-protest/gl-category-csv";
import type {
  TaxProtestLeaseContext,
  TaxProtestOrgContext,
  TaxProtestPriorSnapshotRow,
  TaxProtestPropertyContext,
  TaxProtestPropertyRow,
  TaxProtestRepository,
  TaxProtestSnapshotRow,
} from "../../domain/tax-protest/repository";
import type { PostgresExecutor } from "./postgres";

// ── Raw DB row types ──────────────────────────────────────────────────────────

type PropertyDbRow = {
  id: string;
  name: string | null;
  state: string | null;
  tax_protest_county: string | null;
  tax_protest_deadline_override: string | null;
};

type SnapshotDbRow = {
  id: string;
  organization_id: string;
  property_id: string;
  lease_id: string | null;
  status: string;
  total_recovery: string;
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  period_start_date: string;
  period_end_date: string;
  calculation_trace: unknown;
};

type LeaseDbRow = {
  tenant_name: string | null;
};

type PropertyContextDbRow = {
  id: string;
  name: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  tax_protest_county: string | null;
  tax_protest_deadline_override: string | null;
};

type OrgDbRow = {
  name: string | null;
};

type PriorSnapshotDbRow = {
  id: string;
  total_recovery: string;
  period_start_date: string;
  period_end_date: string;
};

type PoolDbRow = {
  id: string;
  name: string | null;
  pool_type: string | null;
};

type MappingDbRow = {
  expense_pool_id: string;
  gl_account_pattern: string;
  allocation_percentage: string | null;
};

type GlEntryDbRow = {
  account_code: string | null;
  account_description: string | null;
  amount: string;
};

type SubscriptionDbRow = {
  status: string;
  billing_model: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | Date | null;
};

type AuditCreditExistsRow = {
  exists: boolean;
};

// ── Repository implementation ─────────────────────────────────────────────────

export class PostgresTaxProtestRepository implements TaxProtestRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async listPropertiesForDeadlines(
    organizationId: string,
  ): Promise<TaxProtestPropertyRow[]> {
    const result = await this.executor.query<PropertyDbRow>(
      [
        "select id::text as id, coalesce(name, '') as name, state,",
        "  tax_protest_county, tax_protest_deadline_override::text as tax_protest_deadline_override",
        "from properties",
        "where organization_id = $1",
        "order by name asc",
      ].join(" "),
      [organizationId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      state: row.state,
      taxProtestCounty: row.tax_protest_county,
      taxProtestDeadlineOverride: row.tax_protest_deadline_override,
    }));
  }

  async getSnapshotForGenerate(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<TaxProtestSnapshotRow | null> {
    const result = await this.executor.query<SnapshotDbRow>(
      [
        "select id::text, organization_id::text, property_id::text, lease_id::text,",
        "  status, total_recovery::text, total_operating_expenses::text,",
        "  grossed_up_expenses::text, base_year_amount::text,",
        "  tenant_share_before_cap::text, tenant_share_after_cap::text,",
        "  admin_fee::text, period_start_date::text, period_end_date::text,",
        "  calculation_trace",
        "from reconciliation_snapshots",
        "where id = $1 and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.snapshotId, input.organizationId],
    );

    const row = result.rows[0];
    if (!row) return null;

    const trace = normalizeCalculationTrace(row.calculation_trace);

    return {
      id: row.id,
      organization_id: row.organization_id,
      property_id: row.property_id,
      lease_id: row.lease_id,
      status: row.status,
      total_recovery: row.total_recovery,
      total_operating_expenses: row.total_operating_expenses,
      grossed_up_expenses: row.grossed_up_expenses,
      base_year_amount: row.base_year_amount,
      tenant_share_before_cap: row.tenant_share_before_cap,
      tenant_share_after_cap: row.tenant_share_after_cap,
      admin_fee: row.admin_fee,
      period_start_date: row.period_start_date,
      period_end_date: row.period_end_date,
      calculation_trace: trace,
    };
  }

  async loadExportContext(input: {
    leaseId: string | null;
    propertyId: string;
    organizationId: string;
  }): Promise<{
    lease: TaxProtestLeaseContext;
    property: TaxProtestPropertyContext;
    org: TaxProtestOrgContext;
  }> {
    // Lease
    let lease: TaxProtestLeaseContext = { tenant_name: "" };
    if (input.leaseId) {
      // Defense-in-depth: scope the lease read by organization via its property,
      // mirroring the org-scoped property query below. `leaseId` already arrives
      // from the org-verified snapshot (`getSnapshotForGenerate` filters by
      // organization_id, and snapshots only ever store org-owned lease ids), so
      // this join returns the same row for legitimate data — it just guarantees a
      // foreign-org lease id can never leak a tenant name through this path.
      const leaseResult = await this.executor.query<LeaseDbRow>(
        [
          "select leases.tenant_name from leases",
          "join properties on properties.id = leases.property_id",
          "where leases.id = $1 and properties.organization_id = $2",
          "limit 1",
        ].join(" "),
        [input.leaseId, input.organizationId],
      );
      const leaseRow = leaseResult.rows[0];
      if (leaseRow) {
        lease = { tenant_name: leaseRow.tenant_name ?? "" };
      }
    }

    // Property (org-scoped)
    const propResult = await this.executor.query<PropertyContextDbRow>(
      [
        "select id::text, name, address_line1, city, state, postal_code,",
        "  tax_protest_county, tax_protest_deadline_override::text as tax_protest_deadline_override",
        "from properties",
        "where id = $1 and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    const propRow = propResult.rows[0] ?? null;
    let address = "";
    if (propRow) {
      const parts: string[] = [];
      if (propRow.address_line1) parts.push(propRow.address_line1);
      if (propRow.city && propRow.state) {
        const cityState = `${propRow.city}, ${propRow.state}`;
        if (propRow.postal_code) {
          parts.push(`${cityState} ${propRow.postal_code}`);
        } else {
          parts.push(cityState);
        }
      }
      address = parts.filter(Boolean).join(", ");
    }
    const property: TaxProtestPropertyContext = {
      id: propRow?.id ?? input.propertyId,
      name: propRow?.name ?? "",
      address,
      state: propRow?.state ?? null,
      taxProtestCounty: propRow?.tax_protest_county ?? null,
      taxProtestDeadlineOverride:
        propRow?.tax_protest_deadline_override ?? null,
    };

    // Org
    const orgResult = await this.executor.query<OrgDbRow>(
      "select name from organizations where id = $1 limit 1",
      [input.organizationId],
    );
    const orgRow = orgResult.rows[0];
    const org: TaxProtestOrgContext = { name: orgRow?.name ?? "Organization" };

    return { lease, property, org };
  }

  async fetchPoolDetails(input: {
    propertyId: string;
    organizationId: string;
    year: number;
  }): Promise<GlPool[]> {
    // Fetch pools (org-scoped via property)
    const poolsResult = await this.executor.query<PoolDbRow>(
      [
        "select ep.id::text as id, ep.name, ep.pool_type",
        "from expense_pools ep",
        "join properties p on p.id = ep.property_id",
        "where ep.property_id = $1 and p.organization_id = $2",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    const pools = poolsResult.rows;
    if (pools.length === 0) return [];

    const poolIds = pools.map((p) => p.id);

    // Fetch mappings for these pools
    const mappingsResult = await this.executor.query<MappingDbRow>(
      [
        "select expense_pool_id::text as expense_pool_id,",
        "  gl_account_pattern, allocation_percentage::text as allocation_percentage",
        "from pool_mappings",
        `where expense_pool_id = any($1)`,
      ].join(" "),
      [poolIds],
    );
    const mappings = mappingsResult.rows;

    // Build mapping lookup: pool_id → list of mappings
    const poolMappings = new Map<string, MappingDbRow[]>();
    for (const pid of poolIds) poolMappings.set(pid, []);
    for (const m of mappings) {
      poolMappings.get(m.expense_pool_id)?.push(m);
    }

    // Fetch all GL entries for property + year (paginated via limit 10000)
    const glResult = await this.executor.query<GlEntryDbRow>(
      [
        "select ge.account_code, ge.account_description, ge.amount::text as amount",
        "from gl_entries ge",
        "join properties p on p.id = ge.property_id",
        "where ge.property_id = $1 and p.organization_id = $3 and ge.period_year = $2",
        "limit 10000",
      ].join(" "),
      [input.propertyId, input.year, input.organizationId],
    );
    const glEntries = glResult.rows;

    // Match GL entries to pools (mirrors Python fnmatch pattern)
    const poolItems = new Map<
      string,
      Array<{
        account_code: string;
        account_description: string;
        amount: string;
      }>
    >();
    for (const pid of poolIds) poolItems.set(pid, []);

    for (const entry of glEntries) {
      const code = entry.account_code ?? "";
      const amount = new Decimal(entry.amount || "0");
      const desc = entry.account_description ?? code;

      for (const pool of pools) {
        const poolMappingList = poolMappings.get(pool.id) ?? [];
        for (const mapping of poolMappingList) {
          const pattern = mapping.gl_account_pattern.replace(/%/g, "*");
          if (fnmatch(code, pattern)) {
            const alloc = new Decimal(mapping.allocation_percentage ?? "1");
            poolItems.get(pool.id)?.push({
              account_code: code,
              account_description: desc,
              amount: amount.times(alloc).toFixed(10, Decimal.ROUND_HALF_EVEN),
            });
            break;
          }
        }
      }
    }

    // Build result (skip pools with no matching entries)
    const result: GlPool[] = [];
    for (const pool of pools) {
      const items = poolItems.get(pool.id) ?? [];
      if (items.length === 0) continue;
      const poolTotal = items
        .reduce(
          (sum, item) => sum.plus(new Decimal(item.amount)),
          new Decimal(0),
        )
        .toFixed(10, Decimal.ROUND_HALF_EVEN);
      result.push({
        pool_name: pool.name ?? "",
        pool_type: pool.pool_type ?? "operating",
        pool_total: poolTotal,
        items: items.map((item) => ({
          account_code: item.account_code,
          account_description: item.account_description,
          amount: item.amount,
        })),
      });
    }
    return result;
  }

  async fetchPriorSnapshots(input: {
    propertyId: string;
    organizationId: string;
    year: number;
  }): Promise<TaxProtestPriorSnapshotRow[]> {
    const yearStart = `${input.year}-01-01`;
    const yearEnd = `${input.year}-12-31`;
    const result = await this.executor.query<PriorSnapshotDbRow>(
      [
        "select id::text, total_recovery::text, period_start_date::text, period_end_date::text",
        "from reconciliation_snapshots",
        "where organization_id = $1",
        "  and property_id = $2",
        "  and status = 'finalized'",
        "  and period_start_date >= $3",
        "  and period_end_date <= $4",
      ].join(" "),
      [input.organizationId, input.propertyId, yearStart, yearEnd],
    );
    return result.rows;
  }

  async hasTaxProtestAccess(organizationId: string): Promise<boolean> {
    // Mirrors has_feature_access(ctx, "tax_protest") — checks active/trialing
    // subscription (all tiers include tax_protest per FEATURE_TIERS) or
    // credit_pack with ever-purchased credits (backward compat).
    const subResult = await this.executor.query<SubscriptionDbRow>(
      [
        "select status, billing_model, stripe_subscription_id, current_period_end",
        "from subscriptions",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 1",
      ].join(" "),
      [organizationId],
    );
    const row = subResult.rows[0];
    if (!row) {
      // No subscription — fall back to credit pack check
      return this.hasPurchasedCredits(organizationId);
    }
    if (row.billing_model === "credit_pack") {
      return this.hasPurchasedCredits(organizationId);
    }
    const status = effectiveSubscriptionStatus(row);
    return status === "active" || status === "trialing";
  }

  private async hasPurchasedCredits(organizationId: string): Promise<boolean> {
    const result = await this.executor.query<AuditCreditExistsRow>(
      [
        "select exists (",
        "  select 1 from audit_credits",
        "  where organization_id = $1 and credits_purchased > 0",
        ") as exists",
      ].join(" "),
      [organizationId],
    );
    return result.rows[0]?.exists === true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveSubscriptionStatus(row: SubscriptionDbRow): string {
  // Canonical card-less-expired check, mirroring billing.ts/exports.ts: a
  // trialing row with no stripe_subscription_id whose current_period_end has
  // passed is an expired unpaid trial and resolves to "paused" (no access). Any
  // other status passes through unchanged, so entitlement here matches how every
  // other premium feature is gated (active|trialing only — no past_due grace).
  if (
    row.status !== "trialing" ||
    row.stripe_subscription_id ||
    !row.current_period_end
  ) {
    return row.status;
  }
  const periodEnd =
    row.current_period_end instanceof Date
      ? row.current_period_end
      : new Date(row.current_period_end);
  if (Number.isNaN(periodEnd.getTime())) return row.status;
  return periodEnd.getTime() < Date.now() ? "paused" : row.status;
}

/**
 * Minimal glob match supporting only `*` wildcard (mirrors Python fnmatch with
 * %-to-* substitution from _fetch_pool_details). Case-sensitive per Python fnmatch.
 */
function fnmatch(name: string, pattern: string): boolean {
  // Escape regex special chars except *, then replace * with .*
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "u").test(name);
}
