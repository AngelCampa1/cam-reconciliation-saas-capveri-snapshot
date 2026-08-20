/**
 * PostgreSQL adapter for CapEx repository.
 */
import type {
  CapExRepository,
  CapExFlagRow,
  UpsertFlagInput,
  ReviewFlagInput,
  ReviewFlagsInput,
  ReviewFlagsResult,
  GlEntryAmountRow,
} from "../../domain/capex/repository";
import type { Disposition } from "../../domain/capex/classifier";
import type { PostgresExecutor } from "./postgres";

/** Chunk an array into slices of at most `size`. */
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

type ExistsRow = { exists: boolean };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

export class PostgresCapExRepository implements CapExRepository {
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

  async listGlEntries(input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
  }): Promise<
    Array<{
      id: string;
      amount: string;
      account_code: string | null;
      account_description: string | null;
      vendor_name: string | null;
      description: string | null;
      transaction_date: string;
    }>
  > {
    const result = await this.executor.query<{
      id: string;
      amount: string;
      account_code: string | null;
      account_description: string | null;
      vendor_name: string | null;
      description: string | null;
      transaction_date: string;
    }>(
      [
        "select gl_entries.id,",
        "gl_entries.amount::text as amount,",
        "gl_entries.account_code,",
        "gl_entries.account_description,",
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
      [input.propertyId, input.periodYear, input.organizationId],
    );
    return result.rows;
  }

  async upsertFlags(flags: UpsertFlagInput[]): Promise<void> {
    if (flags.length === 0) return;

    // Build a multi-row insert with parameterized values
    const paramGroups: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const f of flags) {
      paramGroups.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
      );
      params.push(
        f.organization_id,
        f.gl_entry_id,
        f.property_id,
        f.period_year,
        f.flag_reason,
        f.rule_name,
        f.confidence_score,
        f.matched_pattern,
        f.disposition,
        f.classifier_version,
      );
    }

    await this.executor.query(
      [
        "insert into capex_flags",
        "(organization_id, gl_entry_id, property_id, period_year,",
        " flag_reason, rule_name, confidence_score, matched_pattern,",
        " disposition, classifier_version)",
        `values ${paramGroups.join(", ")}`,
        "on conflict (gl_entry_id, rule_name) do update set",
        " flag_reason = excluded.flag_reason,",
        " confidence_score = excluded.confidence_score,",
        " matched_pattern = excluded.matched_pattern,",
        " classifier_version = excluded.classifier_version",
      ].join(" "),
      params,
    );
  }

  async listFlags(input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
    disposition?: Disposition | null;
  }): Promise<CapExFlagRow[]> {
    const params: unknown[] = [
      input.organizationId,
      input.propertyId,
      input.periodYear,
    ];
    let dispositionClause = "";
    if (input.disposition != null) {
      params.push(input.disposition);
      dispositionClause = `and disposition = $${params.length}`;
    }

    const result = await this.executor.query<CapExFlagRow>(
      [
        "select id, organization_id, gl_entry_id, property_id, period_year,",
        " flag_reason, rule_name, confidence_score::text as confidence_score,",
        " matched_pattern, disposition,",
        " reviewed_at::text as reviewed_at,",
        " reviewed_by_user_id::text as reviewed_by_user_id,",
        " review_note,",
        " classifier_version,",
        " created_at::text as created_at",
        "from capex_flags",
        "where organization_id = $1",
        "and property_id = $2",
        "and period_year = $3",
        dispositionClause,
        "order by created_at desc",
      ]
        .filter(Boolean)
        .join(" "),
      params,
    );
    return result.rows;
  }

  async reviewFlag(input: ReviewFlagInput): Promise<CapExFlagRow | null> {
    const result = await this.executor.query<CapExFlagRow>(
      [
        "update capex_flags",
        "set disposition = $1,",
        " reviewed_at = $2,",
        " reviewed_by_user_id = $3,",
        " review_note = $4",
        "where id = $5 and organization_id = $6",
        "returning",
        " id, organization_id, gl_entry_id, property_id, period_year,",
        " flag_reason, rule_name, confidence_score::text as confidence_score,",
        " matched_pattern, disposition,",
        " reviewed_at::text as reviewed_at,",
        " reviewed_by_user_id::text as reviewed_by_user_id,",
        " review_note,",
        " classifier_version,",
        " created_at::text as created_at",
      ].join(" "),
      [
        input.disposition,
        input.reviewedAt,
        input.reviewedByUserId,
        input.reviewNote,
        input.flagId,
        input.organizationId,
      ],
    );
    return result.rows[0] ?? null;
  }

  async reviewFlags(input: ReviewFlagsInput): Promise<ReviewFlagsResult> {
    if (input.flagIds.length === 0) {
      return { status: "reviewed", flags: [] };
    }

    const uniqueFlagIds = [...new Set(input.flagIds)];

    return this.executor.transaction(async (executor) => {
      const foundResult = await executor.query<{ id: string }>(
        [
          "select id::text as id",
          "from capex_flags",
          "where organization_id = $1",
          "and id = any($2::uuid[])",
          "for update",
        ].join(" "),
        [input.organizationId, uniqueFlagIds],
      );
      const foundIds = new Set(foundResult.rows.map((row) => row.id));
      const missingFlagIds = input.flagIds.filter((id) => !foundIds.has(id));

      if (missingFlagIds.length > 0) {
        return { status: "not_found", missingFlagIds };
      }

      const updateResult = await executor.query<CapExFlagRow>(
        [
          "update capex_flags",
          "set disposition = $1,",
          " reviewed_at = $2,",
          " reviewed_by_user_id = $3,",
          " review_note = $4",
          "where organization_id = $5",
          "and id = any($6::uuid[])",
          "returning",
          " id, organization_id, gl_entry_id, property_id, period_year,",
          " flag_reason, rule_name, confidence_score::text as confidence_score,",
          " matched_pattern, disposition,",
          " reviewed_at::text as reviewed_at,",
          " reviewed_by_user_id::text as reviewed_by_user_id,",
          " review_note,",
          " classifier_version,",
          " created_at::text as created_at",
        ].join(" "),
        [
          input.disposition,
          input.reviewedAt,
          input.reviewedByUserId,
          input.reviewNote,
          input.organizationId,
          uniqueFlagIds,
        ],
      );
      const updatedById = new Map(
        updateResult.rows.map((row) => [row.id, row] as const),
      );
      const updateMissingFlagIds = input.flagIds.filter(
        (id) => !updatedById.has(id),
      );

      if (updateMissingFlagIds.length > 0) {
        throw new Error(
          `Failed to update locked CapEx flags: ${updateMissingFlagIds.join(", ")}`,
        );
      }

      return {
        status: "reviewed",
        flags: input.flagIds.map((id) => updatedById.get(id)!),
      };
    });
  }

  async findFlagIds(input: {
    flagIds: string[];
    organizationId: string;
  }): Promise<string[]> {
    if (input.flagIds.length === 0) return [];
    const result = await this.executor.query<{ id: string }>(
      [
        "select id::text as id",
        "from capex_flags",
        "where organization_id = $1",
        "and id = any($2::uuid[])",
      ].join(" "),
      [input.organizationId, input.flagIds],
    );
    return result.rows.map((r) => r.id);
  }

  async listGlEntryAmounts(input: {
    entryIds: string[];
    organizationId: string;
  }): Promise<GlEntryAmountRow[]> {
    if (input.entryIds.length === 0) return [];

    // Chunk to avoid HTTP 414 / oversized queries (same class as BUG-09)
    const results: GlEntryAmountRow[] = [];
    for (const chunk of chunks(input.entryIds, 500)) {
      const r = await this.executor.query<GlEntryAmountRow>(
        [
          "select gl_entries.id::text as id,",
          " gl_entries.amount::text as amount",
          "from gl_entries",
          "join properties on properties.id = gl_entries.property_id",
          "where gl_entries.id = any($1::uuid[])",
          "and properties.organization_id = $2",
        ].join(" "),
        [chunk, input.organizationId],
      );
      results.push(...r.rows);
    }
    return results;
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
