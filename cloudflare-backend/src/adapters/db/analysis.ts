import type {
  AnalysisRepository,
  ExpensePool,
  GlAnalysisResult,
  GlEntry,
  PoolMapping,
} from "../../domain/analysis/repository";
import type { PostgresExecutor } from "./postgres";

type PropertyNameRow = {
  name: string;
};

type YearRow = {
  year: number | string;
};

type ExistsRow = { exists: boolean };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

export class PostgresAnalysisRepository implements AnalysisRepository {
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

  async getPropertyName(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<string | null> {
    const result = await this.executor.query<PropertyNameRow>(
      [
        "select name",
        "from properties",
        "where id = $1 and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );

    return result.rows[0]?.name ?? null;
  }

  async listAvailableYears(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<number[]> {
    const result = await this.executor.query<YearRow>(
      [
        "select distinct extract(year from period_start_date)::int as year",
        "from reconciliation_snapshots",
        "where property_id = $1",
        "and organization_id = $2",
        "and status = 'finalized'",
        "order by year",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );

    return result.rows.map((row) => Number(row.year));
  }

  async listFinalizedSnapshotYears(input: {
    propertyId: string;
    years: number[];
    organizationId: string;
  }): Promise<number[]> {
    if (input.years.length === 0) {
      return [];
    }

    const result = await this.executor.query<YearRow>(
      [
        "select distinct extract(year from period_start_date)::int as year",
        "from reconciliation_snapshots",
        "where property_id = $1",
        "and organization_id = $2",
        "and status = 'finalized'",
        "and extract(year from period_start_date)::int = any($3::int[])",
        "order by year",
      ].join(" "),
      [input.propertyId, input.organizationId, input.years],
    );

    return result.rows.map((row) => Number(row.year));
  }

  async listExpensePools(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<ExpensePool[]> {
    const result = await this.executor.query<ExpensePool>(
      [
        "select expense_pools.id, expense_pools.name",
        "from expense_pools",
        "join properties on properties.id = expense_pools.property_id",
        "where expense_pools.property_id = $1",
        "and properties.organization_id = $2",
        "order by expense_pools.name, expense_pools.id",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );

    return result.rows;
  }

  async listPoolMappings(input: {
    poolIds: string[];
    organizationId: string;
  }): Promise<PoolMapping[]> {
    if (input.poolIds.length === 0) {
      return [];
    }

    const result = await this.executor.query<PoolMapping>(
      [
        "select pool_mappings.expense_pool_id,",
        "pool_mappings.gl_account_pattern,",
        "pool_mappings.allocation_percentage::text as allocation_percentage",
        "from pool_mappings",
        "join expense_pools on expense_pools.id = pool_mappings.expense_pool_id",
        "join properties on properties.id = expense_pools.property_id",
        "where pool_mappings.expense_pool_id = any($1::uuid[])",
        "and properties.organization_id = $2",
        "order by pool_mappings.priority desc, pool_mappings.id",
      ].join(" "),
      [input.poolIds, input.organizationId],
    );

    return result.rows;
  }

  async listGlEntries(input: {
    propertyId: string;
    year: number;
    organizationId: string;
  }): Promise<GlEntry[]> {
    const result = await this.executor.query<GlEntry>(
      [
        "select gl_entries.account_code,",
        "gl_entries.account_description,",
        "gl_entries.amount::text as amount,",
        "gl_entries.vendor_name,",
        "gl_entries.description,",
        "gl_entries.transaction_date::text as transaction_date",
        "from gl_entries",
        "join properties on properties.id = gl_entries.property_id",
        "where gl_entries.property_id = $1",
        "and gl_entries.period_year = $2",
        "and properties.organization_id = $3",
        "order by gl_entries.id",
      ].join(" "),
      [input.propertyId, input.year, input.organizationId],
    );

    return result.rows;
  }

  async recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void> {
    await this.executor.query("select public.upsert_feature_use($1, $2)", [
      input.organizationId,
      input.featureKey,
    ]);
  }

  async listExpensePoolsWithType(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<Array<{ name: string; type: string }>> {
    const result = await this.executor.query<{ name: string; type: string }>(
      [
        "select expense_pools.name, expense_pools.pool_type as type",
        "from expense_pools",
        "join properties on properties.id = expense_pools.property_id",
        "where expense_pools.property_id = $1",
        "and properties.organization_id = $2",
        "order by expense_pools.name, expense_pools.id",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    return result.rows;
  }

  async insertGlAnalysisResult(input: {
    organizationId: string;
    propertyId: string;
    periodYear: number;
    analysisMarkdown: string;
    tokenInput: number;
    tokenOutput: number;
    ranAt: string;
    ranByUserId: string;
  }): Promise<GlAnalysisResult> {
    const result = await this.executor.query<GlAnalysisResult>(
      [
        "insert into gl_analysis_results",
        "(organization_id, property_id, period_year, analysis_markdown,",
        "token_input, token_output, ran_at, ran_by_user_id)",
        "values ($1, $2, $3, $4, $5, $6, $7, $8)",
        "returning",
        "id, organization_id, property_id, period_year, analysis_markdown,",
        "token_input, token_output,",
        "ran_at::text as ran_at,",
        "ran_by_user_id,",
        "dismissed_at::text as dismissed_at,",
        "dismissed_by_user_id,",
        "created_at::text as created_at",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.periodYear,
        input.analysisMarkdown,
        input.tokenInput,
        input.tokenOutput,
        input.ranAt,
        input.ranByUserId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(
        "GL analysis insert returned no rows — RLS may have blocked the write",
      );
    }
    return row;
  }

  async getLatestGlAnalysis(input: {
    organizationId: string;
    propertyId: string;
    periodYear: number;
  }): Promise<GlAnalysisResult | null> {
    const result = await this.executor.query<GlAnalysisResult>(
      [
        "select",
        "id, organization_id, property_id, period_year, analysis_markdown,",
        "token_input, token_output,",
        "ran_at::text as ran_at,",
        "ran_by_user_id,",
        "dismissed_at::text as dismissed_at,",
        "dismissed_by_user_id,",
        "created_at::text as created_at",
        "from gl_analysis_results",
        "where organization_id = $1",
        "and property_id = $2",
        "and period_year = $3",
        "and dismissed_at is null",
        "order by ran_at desc",
        "limit 1",
      ].join(" "),
      [input.organizationId, input.propertyId, input.periodYear],
    );
    return result.rows[0] ?? null;
  }

  async dismissGlAnalysis(input: {
    organizationId: string;
    analysisId: string;
    dismissedAt: string;
    dismissedByUserId: string;
  }): Promise<GlAnalysisResult> {
    const result = await this.executor.query<GlAnalysisResult>(
      [
        "update gl_analysis_results",
        "set dismissed_at = $1, dismissed_by_user_id = $2",
        "where id = $3 and organization_id = $4",
        "and dismissed_at is null",
        "returning",
        "id, organization_id, property_id, period_year, analysis_markdown,",
        "token_input, token_output,",
        "ran_at::text as ran_at,",
        "ran_by_user_id,",
        "dismissed_at::text as dismissed_at,",
        "dismissed_by_user_id,",
        "created_at::text as created_at",
      ].join(" "),
      [
        input.dismissedAt,
        input.dismissedByUserId,
        input.analysisId,
        input.organizationId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ValueError(`Analysis ${input.analysisId} not found`);
    }
    return row;
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

class ValueError extends Error {
  override readonly name = "ValueError";
}
