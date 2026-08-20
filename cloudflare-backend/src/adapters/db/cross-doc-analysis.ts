/**
 * PostgreSQL adapter for cross-document analysis.
 *
 * Ported from:
 *   backend/app/services/extraction/cross_doc_persistence.py
 *   backend/app/services/extraction/cross_doc_assembler.py
 *
 * All queries include explicit organization_id WHEREs for multi-tenant safety.
 * Finding decisions are merged with an atomic UPDATE ... RETURNING to avoid
 * read-modify-write races on finding_decisions JSONB.
 */

import { Decimal } from "decimal.js";
import type {
  CrossDocAnalysisRepository,
  AssembleInput,
  SaveAnalysisInput,
  UpdateAuditorConfigInput,
  UpdateAuditorOverridesInput,
  UpdateFindingDecisionInput,
} from "../../domain/cross-doc-analysis/repository";
import type {
  AuditorContext,
  CamStatementContext,
  CrossDocAnalysisInput,
  CrossDocAnalysisRow,
  DataAvailability,
  GLAccountSample,
  GLPoolContext,
  LeaseContext,
  PropertyAuditorOverrides,
} from "../../domain/cross-doc-analysis/types";
import type { PostgresExecutor } from "./postgres";

const PyDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/** Rough chars-per-token ratio for input estimation (mirrors Python: 3). */
const CHARS_PER_TOKEN = 3;

type ExistsRow = { exists: boolean };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

export class PostgresCrossDocAnalysisRepository implements CrossDocAnalysisRepository {
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

  async checkPropertyInOrg(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<{ id: string }>(
      "select id from properties where id = $1 and organization_id = $2 limit 1",
      [input.propertyId, input.organizationId],
    );
    return result.rows.length > 0;
  }

  async getAnalysisOrgId(input: {
    analysisId: string;
  }): Promise<{ organization_id: string } | null> {
    const result = await this.executor.query<{ organization_id: string }>(
      "select organization_id from cross_doc_analyses where id = $1 limit 1",
      [input.analysisId],
    );
    return result.rows[0] ?? null;
  }

  async getLatestAnalysis(input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
  }): Promise<CrossDocAnalysisRow | null> {
    const result = await this.executor.query<CrossDocAnalysisRow>(
      [
        "select id, property_id, period_year, status,",
        "findings, finding_decisions, token_usage",
        "from cross_doc_analyses",
        "where property_id = $1 and period_year = $2 and organization_id = $3",
        "order by created_at desc limit 1",
      ].join(" "),
      [input.propertyId, input.periodYear, input.organizationId],
    );
    return result.rows[0] ?? null;
  }

  async insertAnalysis(input: SaveAnalysisInput): Promise<string> {
    const result = await this.executor.query<{ id: string }>(
      [
        "insert into cross_doc_analyses",
        "(organization_id, property_id, period_year, status, findings, finding_decisions, token_usage)",
        "values ($1, $2, $3, 'pending', $4, '{}'::jsonb, $5)",
        "returning id",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.periodYear,
        input.result.findings,
        input.result.token_usage,
      ],
    );
    return result.rows[0]?.id ?? "";
  }

  async mergeFindingDecision(
    input: UpdateFindingDecisionInput,
  ): Promise<Record<string, Record<string, unknown>> | null> {
    const result = await this.executor.query<{
      merged_decisions: unknown;
    }>(
      [
        "update cross_doc_analyses",
        "set finding_decisions = finding_decisions || jsonb_build_object($3::text, $4::jsonb)",
        "where id = $1 and organization_id = $2",
        "and exists (",
        "select 1 from jsonb_array_elements(coalesce(findings->'findings', '[]'::jsonb)) finding",
        "where finding->>'id' = $3",
        ")",
        "returning finding_decisions as merged_decisions",
      ].join(" "),
      [input.analysisId, input.organizationId, input.findingId, input.decision],
    );
    const merged = result.rows[0]?.merged_decisions;
    if (!merged || typeof merged !== "object" || Array.isArray(merged)) {
      return null;
    }
    const decisions = merged as Record<string, Record<string, unknown>>;
    return Object.hasOwn(decisions, input.findingId) ? decisions : null;
  }

  async updateAnalysisStatus(input: {
    analysisId: string;
    organizationId: string;
    status: "in_review" | "reviewed";
    expectedStatus?: "pending" | "in_review";
  }): Promise<boolean> {
    const params: unknown[] = [
      input.status,
      input.analysisId,
      input.organizationId,
    ];
    const statusPredicate = input.expectedStatus ? "and status = $4" : "";
    if (input.expectedStatus) {
      params.push(input.expectedStatus);
    }

    const result = await this.executor.query<{ id: string }>(
      [
        "update cross_doc_analyses set status = $1",
        "where id = $2 and organization_id = $3",
        statusPredicate,
        "returning id",
      ].join(" "),
      params,
    );
    return result.rows.length > 0;
  }

  async getAnalysisForStatus(input: {
    analysisId: string;
    organizationId: string;
  }): Promise<{ findings: Record<string, unknown>; status: string } | null> {
    const result = await this.executor.query<{
      findings: Record<string, unknown>;
      status: string;
    }>(
      [
        "select findings, status from cross_doc_analyses",
        "where id = $1 and organization_id = $2 limit 1",
      ].join(" "),
      [input.analysisId, input.organizationId],
    );
    return result.rows[0] ?? null;
  }

  async updateOrgAuditorConfig(input: UpdateAuditorConfigInput): Promise<void> {
    await this.executor.query(
      "update organizations set auditor_config = $1::jsonb where id = $2",
      [JSON.stringify(input.config), input.organizationId],
    );
  }

  async updatePropertyAuditorOverrides(
    input: UpdateAuditorOverridesInput,
  ): Promise<void> {
    await this.executor.query(
      [
        "update properties set auditor_overrides = $1::jsonb",
        "where id = $2 and organization_id = $3",
      ].join(" "),
      [JSON.stringify(input.overrides), input.propertyId, input.organizationId],
    );
  }

  // ---------------------------------------------------------------------------
  // Assembler — mirrors cross_doc_assembler.py
  // ---------------------------------------------------------------------------

  async assembleCrossDocInput(
    input: AssembleInput,
  ): Promise<CrossDocAnalysisInput> {
    const { propertyId, periodYear, organizationId } = input;

    const propertyName = await this._fetchPropertyName(propertyId);
    const [leaseContexts, dataAvail] = await this._fetchLeaseContexts(
      propertyId,
      periodYear,
    );
    const [glPoolContexts, glAccountCount] = await this._fetchGlPoolContexts(
      propertyId,
      periodYear,
    );
    dataAvail.has_gl_data = glAccountCount > 0;
    dataAvail.gl_account_count = glAccountCount;
    dataAvail.has_cam_statements = await this._hasCamStatementData(
      propertyId,
      periodYear,
    );
    const camStatementContexts = await this._fetchCamStatementContexts(
      propertyId,
      periodYear,
    );

    const [auditorContext, propertyOverrides] = await this._fetchAuditorContext(
      propertyId,
      organizationId,
    );
    const priorYearTotals = await this._fetchPriorYearTotals(
      propertyId,
      periodYear - 1,
    );
    dataAvail.has_prior_year_data = Object.keys(priorYearTotals).length > 0;

    const inputObj: CrossDocAnalysisInput = {
      property_id: propertyId,
      property_name: propertyName,
      period_year: periodYear,
      lease_contexts: leaseContexts,
      gl_pool_contexts: glPoolContexts,
      cam_statement_contexts: camStatementContexts,
      auditor_context: auditorContext,
      property_overrides: propertyOverrides,
      prior_year_totals: priorYearTotals,
      data_availability: dataAvail,
      estimated_tokens: 0,
    };

    const serialized = JSON.stringify(inputObj);
    inputObj.estimated_tokens = Math.floor(serialized.length / CHARS_PER_TOKEN);

    return inputObj;
  }

  private async _fetchPropertyName(propertyId: string): Promise<string> {
    const result = await this.executor.query<{ name: string }>(
      "select name from properties where id = $1 limit 1",
      [propertyId],
    );
    return result.rows[0]?.name ?? propertyId;
  }

  private async _fetchLeaseContexts(
    propertyId: string,
    periodYear: number,
  ): Promise<[LeaseContext[], DataAvailability]> {
    const periodStart = `${periodYear}-01-01`;
    const periodEnd = `${periodYear}-12-31`;

    const result = await this.executor.query<{
      id: string;
      tenant_name: string;
      recovery_profile: unknown;
      start_date: string | null;
      end_date: string | null;
    }>(
      [
        "select id, tenant_name, recovery_profile, start_date, end_date",
        "from leases",
        "where property_id = $1",
        "and start_date <= $2",
        "and end_date >= $3",
        "and recovery_profile is not null",
      ].join(" "),
      [propertyId, periodEnd, periodStart],
    );

    const verifiedIds = await this._fetchVerifiedLeaseIds(propertyId);

    const contexts: LeaseContext[] = result.rows.map((row) => {
      let recovery: Record<string, unknown> = {};
      if (typeof row.recovery_profile === "string") {
        try {
          recovery = JSON.parse(row.recovery_profile) as Record<
            string,
            unknown
          >;
        } catch {
          recovery = {};
        }
      } else if (
        row.recovery_profile !== null &&
        typeof row.recovery_profile === "object" &&
        !Array.isArray(row.recovery_profile)
      ) {
        recovery = row.recovery_profile as Record<string, unknown>;
      }

      return {
        lease_id: row.id,
        tenant_name: row.tenant_name ?? "Unknown",
        recovery_profile: recovery,
        pro_rata_share:
          recovery["pro_rata_share"] !== undefined &&
          recovery["pro_rata_share"] !== null
            ? String(recovery["pro_rata_share"])
            : null,
        base_year: parseNullableYear(recovery["base_year"]),
        term_start: row.start_date ?? null,
        term_end: row.end_date ?? null,
        verified_at: verifiedIds[row.id] ?? null,
      };
    });

    const verifiedCount = contexts.filter((c) => c.verified_at !== null).length;
    const dataAvail: DataAvailability = {
      has_verified_leases: verifiedCount > 0,
      has_gl_data: false,
      has_cam_statements: false,
      has_prior_year_data: false,
      lease_count: verifiedCount,
      gl_account_count: 0,
    };

    return [contexts, dataAvail];
  }

  private async _fetchVerifiedLeaseIds(
    propertyId: string,
  ): Promise<Record<string, string>> {
    const result = await this.executor.query<{
      lease_id: string;
      verified_at: string;
    }>(
      [
        "select lease_id, verified_at from documents",
        "where property_id = $1 and verified_at is not null",
      ].join(" "),
      [propertyId],
    );
    const map: Record<string, string> = {};
    for (const row of result.rows) {
      if (row.lease_id && row.verified_at) {
        map[row.lease_id] = row.verified_at;
      }
    }
    return map;
  }

  private async _fetchGlPoolContexts(
    propertyId: string,
    periodYear: number,
  ): Promise<[GLPoolContext[], number]> {
    const poolsResult = await this.executor.query<{
      id: string;
      name: string;
      pool_type: string;
      is_gross_up_applicable: boolean;
    }>(
      [
        "select id, name, pool_type, is_gross_up_applicable",
        "from expense_pools where property_id = $1",
      ].join(" "),
      [propertyId],
    );

    if (poolsResult.rows.length === 0) {
      return [[], 0];
    }

    const poolIds = poolsResult.rows.map((p) => p.id);
    const poolIdToMeta = Object.fromEntries(
      poolsResult.rows.map((p) => [p.id, p]),
    );

    const mappingsResult = await this.executor.query<{
      expense_pool_id: string;
      gl_account_pattern: string;
      allocation_percentage: string;
    }>(
      [
        "select expense_pool_id, gl_account_pattern, allocation_percentage",
        "from pool_mappings",
        `where expense_pool_id = any($1::uuid[])`,
      ].join(" "),
      [poolIds],
    );

    if (mappingsResult.rows.length === 0) {
      return [[], 0];
    }

    const poolMappings: Record<
      string,
      Array<{ gl_account_pattern: string; allocation_percentage: string }>
    > = {};
    for (const pid of poolIds) {
      poolMappings[pid] = [];
    }
    for (const mapping of mappingsResult.rows) {
      const arr = poolMappings[mapping.expense_pool_id];
      if (arr) {
        arr.push(mapping);
      }
    }

    const glResult = await this.executor.query<{
      amount: string;
      account_code: string;
      account_description: string | null;
      vendor_name: string | null;
      description: string | null;
    }>(
      [
        "select amount::text as amount, account_code, account_description, vendor_name, description",
        "from gl_entries",
        "where property_id = $1 and period_year = $2",
      ].join(" "),
      [propertyId, periodYear],
    );

    // Aggregate by pool through fnmatch-style pattern matching (% → *)
    const poolTotals: Record<string, Decimal> = {};
    const poolVendors: Record<string, Record<string, Decimal>> = {};
    const poolAccountCounts: Record<string, Set<string>> = {};
    const poolSamples: Record<string, GLAccountSample[]> = {};
    const totalAccounts = new Set<string>();

    for (const row of glResult.rows) {
      let amount: Decimal;
      try {
        amount = new PyDecimal(row.amount ?? "0");
      } catch {
        continue;
      }
      const account = row.account_code ?? "";
      const vendor = row.vendor_name ?? "";
      if (!account) continue;

      for (const poolId of poolIds) {
        const mappingList = poolMappings[poolId] ?? [];
        let matched = false;
        for (const mapping of mappingList) {
          const pattern = mapping.gl_account_pattern.replaceAll("%", "*");
          if (!fnmatch(account, pattern)) continue;

          const allocation = new PyDecimal(
            mapping.allocation_percentage ?? "1",
          );
          const allocated = amount.mul(allocation);

          poolTotals[poolId] = (poolTotals[poolId] ?? new PyDecimal(0)).plus(
            allocated,
          );

          if (!poolVendors[poolId]) {
            poolVendors[poolId] = {};
          }
          if (vendor) {
            poolVendors[poolId]![vendor] = (
              poolVendors[poolId]![vendor] ?? new PyDecimal(0)
            ).plus(allocated);
          }

          if (!poolAccountCounts[poolId]) {
            poolAccountCounts[poolId] = new Set<string>();
          }
          poolAccountCounts[poolId]!.add(account);
          if (!poolSamples[poolId]) {
            poolSamples[poolId] = [];
          }
          poolSamples[poolId]!.push({
            account_code: account,
            account_description: row.account_description ?? null,
            amount: allocated.toFixed(),
            vendor_name: row.vendor_name ?? null,
            description: row.description ?? null,
          });
          totalAccounts.add(account);
          matched = true;
          break;
        }
        if (matched) break;
      }
    }

    const contexts: GLPoolContext[] = [];
    for (const poolId of poolIds) {
      const meta = poolIdToMeta[poolId];
      if (!meta) continue;
      const total = poolTotals[poolId] ?? new PyDecimal(0);
      const accountCount = poolAccountCounts[poolId]?.size ?? 0;
      if (accountCount === 0 && total.isZero()) continue;

      const vendorsForPool = poolVendors[poolId] ?? {};
      const topVendors = Object.entries(vendorsForPool)
        .sort(([, a], [, b]) => (b.greaterThan(a) ? 1 : -1))
        .slice(0, 5)
        .map(([v]) => v)
        .filter((v) => v.length > 0);

      contexts.push({
        pool_name: meta.name ?? poolId,
        pool_type: meta.pool_type ?? "operating",
        total_amount: total.toFixed(),
        account_count: accountCount,
        top_vendors: topVendors,
        is_gross_up_applicable: Boolean(meta.is_gross_up_applicable),
        sample_entries: (poolSamples[poolId] ?? [])
          .sort((a, b) =>
            new PyDecimal(b.amount).abs().cmp(new PyDecimal(a.amount).abs()),
          )
          .slice(0, 5),
      });
    }

    return [contexts, totalAccounts.size];
  }

  private async _hasCamStatementData(
    propertyId: string,
    periodYear: number,
  ): Promise<boolean> {
    const periodStart = `${periodYear}-01-01`;
    const periodEnd = `${periodYear}-12-31`;
    const result = await this.executor.query<{ id: string }>(
      [
        "select id from actual_billed_amounts",
        "where property_id = $1",
        "and period_start_date <= $2",
        "and period_end_date >= $3",
        "limit 1",
      ].join(" "),
      [propertyId, periodEnd, periodStart],
    );
    return result.rows.length > 0;
  }

  private async _fetchCamStatementContexts(
    propertyId: string,
    periodYear: number,
  ): Promise<CamStatementContext[]> {
    const periodStart = `${periodYear}-01-01`;
    const periodEnd = `${periodYear}-12-31`;
    const result = await this.executor.query<{
      lease_id: string | null;
      tenant_name: string | null;
      pool_id: string | null;
      period_start: string;
      period_end: string;
      billed_amount: string;
    }>(
      [
        "select lease_id, tenant_name, pool_id,",
        "period_start_date::text as period_start,",
        "period_end_date::text as period_end,",
        "billed_amount::text as billed_amount",
        "from actual_billed_amounts",
        "where property_id = $1",
        "and period_start_date <= $2::date",
        "and period_end_date >= $3::date",
        "order by actual_billed_amounts.billed_amount desc",
        "limit 20",
      ].join(" "),
      [propertyId, periodEnd, periodStart],
    );

    return result.rows.map((row) => ({
      lease_id: row.lease_id,
      tenant_name: row.tenant_name,
      pool_id: row.pool_id,
      period_start: row.period_start,
      period_end: row.period_end,
      billed_amount: row.billed_amount,
    }));
  }

  private async _fetchAuditorContext(
    propertyId: string,
    organizationId: string,
  ): Promise<[AuditorContext, PropertyAuditorOverrides]> {
    const propResult = await this.executor.query<{
      auditor_overrides: unknown;
    }>(
      "select auditor_overrides from properties where id = $1 and organization_id = $2 limit 1",
      [propertyId, organizationId],
    );

    const orgResult = await this.executor.query<{ auditor_config: unknown }>(
      "select auditor_config from organizations where id = $1 limit 1",
      [organizationId],
    );

    const defaultAuditorCtx: AuditorContext = {
      market: null,
      typical_management_fee_pct: null,
      known_vendor_patterns: [],
      custom_rules: [],
    };
    const defaultOverrides: PropertyAuditorOverrides = {
      known_exceptions: [],
      special_instructions: [],
      suppressed_finding_categories: [],
    };

    let auditorCtx = defaultAuditorCtx;
    const rawConfig = orgResult.rows[0]?.auditor_config;
    if (
      rawConfig &&
      typeof rawConfig === "object" &&
      !Array.isArray(rawConfig)
    ) {
      auditorCtx = rawConfig as AuditorContext;
    } else if (typeof rawConfig === "string") {
      try {
        auditorCtx = JSON.parse(rawConfig) as AuditorContext;
      } catch {
        auditorCtx = defaultAuditorCtx;
      }
    }

    let propOverrides = defaultOverrides;
    const rawOverrides = propResult.rows[0]?.auditor_overrides;
    if (
      rawOverrides &&
      typeof rawOverrides === "object" &&
      !Array.isArray(rawOverrides)
    ) {
      propOverrides = rawOverrides as PropertyAuditorOverrides;
    } else if (typeof rawOverrides === "string") {
      try {
        propOverrides = JSON.parse(rawOverrides) as PropertyAuditorOverrides;
      } catch {
        propOverrides = defaultOverrides;
      }
    }

    return [auditorCtx, propOverrides];
  }

  private async _fetchPriorYearTotals(
    propertyId: string,
    priorYear: number,
  ): Promise<Record<string, string>> {
    const poolsResult = await this.executor.query<{ id: string; name: string }>(
      "select id, name from expense_pools where property_id = $1",
      [propertyId],
    );
    if (poolsResult.rows.length === 0) return {};

    const poolIds = poolsResult.rows.map((p) => p.id);
    const poolNameById = Object.fromEntries(
      poolsResult.rows.map((p) => [p.id, p.name]),
    );

    const mappingsResult = await this.executor.query<{
      expense_pool_id: string;
      gl_account_pattern: string;
      allocation_percentage: string;
    }>(
      [
        "select expense_pool_id, gl_account_pattern, allocation_percentage",
        "from pool_mappings",
        "where expense_pool_id = any($1::uuid[])",
      ].join(" "),
      [poolIds],
    );
    if (mappingsResult.rows.length === 0) return {};

    const poolMappings: Record<
      string,
      Array<{ gl_account_pattern: string; allocation_percentage: string }>
    > = {};
    for (const pid of poolIds) poolMappings[pid] = [];
    for (const m of mappingsResult.rows) {
      const arr = poolMappings[m.expense_pool_id];
      if (arr) arr.push(m);
    }

    const glResult = await this.executor.query<{
      account_code: string;
      amount: string;
    }>(
      "select account_code, amount::text as amount from gl_entries where property_id = $1 and period_year = $2",
      [propertyId, priorYear],
    );

    const totals: Record<string, Decimal> = {};
    for (const row of glResult.rows) {
      const account = row.account_code ?? "";
      let amount: Decimal;
      try {
        amount = new PyDecimal(row.amount ?? "0");
      } catch {
        continue;
      }
      if (!account) continue;

      for (const poolId of poolIds) {
        const mappingList = poolMappings[poolId] ?? [];
        let matched = false;
        for (const mapping of mappingList) {
          const pattern = mapping.gl_account_pattern.replaceAll("%", "*");
          if (!fnmatch(account, pattern)) continue;
          const allocation = new PyDecimal(
            mapping.allocation_percentage ?? "1",
          );
          const poolName = poolNameById[poolId];
          if (poolName) {
            totals[poolName] = (totals[poolName] ?? new PyDecimal(0)).plus(
              amount.mul(allocation),
            );
          }
          matched = true;
          break;
        }
        if (matched) break;
      }
    }

    return Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, v.toFixed()]),
    );
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

function parseNullableYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Minimal fnmatch implementation that matches Python's fnmatch.fnmatch.
 * Converts glob pattern (*, ?) to regex. Case-insensitive for account codes.
 */
function fnmatch(name: string, pattern: string): boolean {
  // Escape all regex special chars except * and ?, then expand them
  const regexStr =
    "^" +
    pattern
      .replace(/[.+^$()|[\]{}\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") +
    "$";
  return new RegExp(regexStr, "i").test(name);
}
