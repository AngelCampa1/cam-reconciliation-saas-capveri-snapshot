import type {
  CalculationDataset,
  CalculationExpensePoolRecord,
  CalculationGlEntryRecord,
  CalculationJobRecord,
  CalculationLeaseRecord,
  CalculationPoolAllocationRecord,
  CalculationPoolMappingRecord,
  CalculationPropertyRecord,
  SnapshotDraft,
  TenantCapHistoryRecord,
} from "../../domain/reconciliation/calculator";
import type {
  BatchFinalizeResult,
  BatchFinalizeResultItem,
  CalculationJobStatusRecord,
  CreateCalculationJobResult,
  EditableReconciliationField,
  FinalizedSnapshotRecord,
  FinalizeSnapshotResult,
  ReconciliationRepository,
  ReconciliationSnapshotRecord,
  ReconciliationSnapshotSummaryRecord,
  SnapshotListFilters,
  SnapshotListResult,
  UpdateCellResult,
} from "../../domain/reconciliation/repository";
import type {
  FinalizedSnapshotRow as CapBankSnapshotRow,
  LeaseCapProfile,
} from "../../domain/reconciliation/cap-bank-ledger";
import { lockPropertyFinancialEvidence } from "./financial-evidence-lock";
import type { PostgresExecutor } from "./postgres";
import Decimal from "decimal.js";

type CalculationJobRow = {
  id: string;
  status: CalculationJobStatusRecord["status"];
  property_id: string;
  period_start: string;
  period_end: string;
  total_leases: number | null;
  processed_leases: number | null;
  snapshot_ids: unknown;
  error_message: string | null;
  created_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
};
type CalculationJobRecordRow = {
  id: string;
  organization_id: string;
  property_id: string;
  period_start: string | Date;
  period_end: string | Date;
  status: string;
  force_recalculate: boolean;
};

type RecoveryTotalRow = { total: string | number | null };
type CountRow = { count: string | number | bigint };
type ExistsRow = { exists: boolean };
type IdRow = { id: string };
type CreatedJobRow = { id: string; organization_id: string };
type CreatedSnapshotRow = { id: string };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};
type SnapshotLockRow = {
  id: string;
  property_id: string;
  status: "draft" | "finalized";
  tenant_share_after_cap: string | number | null;
  admin_fee: string | number | null;
  total_recovery: string | number | null;
  calculation_trace: unknown;
  manual_overrides: unknown;
};
type FinalizedSnapshotRow = {
  id: string;
  status: "draft" | "finalized";
  finalized_at: string | Date;
  finalized_by_user_id: string;
};

const snapshotSummarySelect = [
  "reconciliation_snapshots.id",
  "reconciliation_snapshots.property_id",
  "reconciliation_snapshots.lease_id",
  "reconciliation_snapshots.period_start_date::text as period_start_date",
  "reconciliation_snapshots.period_end_date::text as period_end_date",
  "reconciliation_snapshots.status",
  "reconciliation_snapshots.total_recovery",
  "reconciliation_snapshots.tenant_share_after_cap",
  "reconciliation_snapshots.admin_fee",
  "(reconciliation_snapshots.status = 'finalized') as is_finalized",
  "reconciliation_snapshots.finalized_at",
  "reconciliation_snapshots.created_at",
  "leases.tenant_name",
  "properties.name as property_name",
].join(", ");

const sortableColumns = {
  created_at: "reconciliation_snapshots.created_at",
  tenant_name: "leases.tenant_name",
  total_recovery: "reconciliation_snapshots.total_recovery",
} satisfies Record<SnapshotListFilters["sortBy"], string>;

export class PostgresReconciliationRepository implements ReconciliationRepository {
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

  async createCalculationJob(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    forceRecalculate: boolean;
  }): Promise<CreateCalculationJobResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await propertyBelongsToOrganization(executor, input))) {
        return { state: "property_not_found" };
      }

      if (!(await hasActiveLeaseForPeriod(executor, input))) {
        return { state: "no_active_leases" };
      }

      // A finalized snapshot is an immutable audit record. Re-running a
      // calculation over an already-finalized period would create a second
      // finalized snapshot for the same (lease, period), double-counting it in
      // the cumulative-cap prior-amounts history. force_recalculate only
      // deletes DRAFTS, so it must not bypass this guard.
      if (await hasFinalizedSnapshotForPeriod(executor, input)) {
        return { state: "period_finalized" };
      }

      const jobResult = await executor.query<CreatedJobRow>(
        [
          "insert into calculation_jobs",
          "(organization_id, property_id, period_start, period_end, status, force_recalculate)",
          "values ($1, $2, $3::date, $4::date, 'pending', $5)",
          "returning id, organization_id",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
          input.forceRecalculate,
        ],
      );
      const job = jobResult.rows[0];

      if (!job) {
        throw new Error("Failed to create calculation job");
      }

      await upsertDraftCampaign(executor, input);

      return {
        state: "created",
        jobId: job.id,
        organizationId: job.organization_id,
      };
    });
  }

  async markCalculationEnqueueFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.executor.query(
      [
        "update calculation_jobs",
        "set status = 'failed', completed_at = now(), error_message = $3",
        "where id = $1",
        "and organization_id = $2",
        "and status = 'pending'",
      ].join(" "),
      [
        input.jobId,
        input.organizationId,
        truncateErrorMessage(input.errorMessage),
      ],
    );
  }

  async getCalculationJob(input: {
    jobId: string;
    organizationId: string;
  }): Promise<CalculationJobRecord | null> {
    const result = await this.executor.query<CalculationJobRecordRow>(
      [
        "select id, organization_id, property_id, period_start, period_end,",
        "status, force_recalculate",
        "from calculation_jobs",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [input.jobId, input.organizationId],
    );
    const row = result.rows[0];

    return row ? toCalculationJobRecord(row) : null;
  }

  async markCalculationRunning(input: {
    jobId: string;
    organizationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      [
        "update calculation_jobs",
        "set status = 'running', started_at = now(), error_message = null,",
        "error_details = null",
        "where id = $1",
        "and organization_id = $2",
        "and status = 'pending'",
        "returning id",
      ].join(" "),
      [input.jobId, input.organizationId],
    );

    return result.rows.length === 1;
  }

  async loadCalculationDataset(input: {
    job: CalculationJobRecord;
  }): Promise<CalculationDataset> {
    const [
      property,
      leases,
      glEntries,
      expensePools,
      poolMappings,
      poolAllocations,
      histories,
    ] = await Promise.all([
      this.loadCalculationProperty(input.job),
      this.loadCalculationLeases(input.job),
      this.loadCalculationGlEntries(input.job),
      this.loadCalculationExpensePools(input.job),
      this.loadCalculationPoolMappings(input.job),
      this.loadCalculationPoolAllocations(input.job),
      this.loadTenantCapHistories(input.job),
    ]);

    if (!property) {
      throw new Error("Calculation property not found");
    }

    return {
      job: input.job,
      property,
      leases,
      glEntries,
      expensePools,
      poolMappings,
      poolAllocations,
      capHistories: histories,
    };
  }

  async countDraftSnapshots(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<number> {
    return countDraftSnapshotsForPeriod(this.executor, input);
  }

  async countFinalizedSnapshots(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<number> {
    const result = await this.executor.query<CountRow>(
      [
        "select count(*) as count",
        "from reconciliation_snapshots",
        "where property_id = $1",
        "and organization_id = $2",
        "and period_start_date = $3::date",
        "and period_end_date = $4::date",
        "and status = 'finalized'",
      ].join(" "),
      [
        input.propertyId,
        input.organizationId,
        input.periodStart,
        input.periodEnd,
      ],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async deleteDraftSnapshots(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<void> {
    await deleteDraftSnapshotRows(this.executor, input);
  }

  async insertCalculationSnapshots(input: {
    jobId: string;
    organizationId: string;
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    return insertCalculationSnapshotRows(this.executor, input);
  }

  async completeCalculationJob(input: {
    jobId: string;
    organizationId: string;
    snapshotIds: string[];
  }): Promise<void> {
    await completeCalculationJobRow(this.executor, input);
  }

  // Atomically persist a finished calculation: delete superseded drafts (when
  // force_recalculate), insert the freshly-computed snapshots, and mark the job
  // completed — all inside ONE transaction. The previous code ran these as
  // three separate statements with no transaction, so a failure midway through
  // the per-snapshot insert loop left an INCOMPLETE subset of draft snapshots
  // committed while the job was marked failed. Those orphaned partial rows are
  // viewable and individually finalizable (billing tenants off an incomplete
  // reconciliation) and block a non-force retry via the draft-exists guard.
  // Wrapping the mutations makes the write all-or-nothing: either every
  // snapshot lands and the job completes, or nothing persists and the catch in
  // the queue runner marks the job failed with no orphans.
  async persistCalculationResults(input: {
    jobId: string;
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    forceRecalculate: boolean;
    snapshots: SnapshotDraft[];
  }): Promise<string[]> {
    return this.executor.transaction(async (executor) => {
      await lockRunningCalculationJob(executor, input);
      await lockPropertyFinancialEvidence(executor, input);
      if (await hasFinalizedSnapshotForPeriod(executor, input)) {
        throw new Error(
          "A finalized reconciliation snapshot already exists for this property and period. Finalized snapshots are immutable and cannot be recalculated.",
        );
      }

      if (
        !input.forceRecalculate &&
        (await countDraftSnapshotsForPeriod(executor, input)) > 0
      ) {
        throw new Error(
          "Draft reconciliation snapshots already exist for this property and period. Use force_recalculate=true to delete existing drafts and recalculate.",
        );
      }

      if (input.forceRecalculate) {
        await deleteDraftSnapshotRows(executor, {
          propertyId: input.propertyId,
          organizationId: input.organizationId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        });
      }

      const snapshotIds = await insertCalculationSnapshotRows(executor, {
        jobId: input.jobId,
        organizationId: input.organizationId,
        snapshots: input.snapshots,
      });

      await completeCalculationJobRow(executor, {
        jobId: input.jobId,
        organizationId: input.organizationId,
        snapshotIds,
      });

      return snapshotIds;
    });
  }

  async markCalculationFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
    errorDetails: unknown;
  }): Promise<void> {
    await this.executor.query(
      [
        "update calculation_jobs",
        "set status = 'failed', completed_at = now(),",
        "error_message = $3, error_details = $4::jsonb",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [
        input.jobId,
        input.organizationId,
        truncateErrorMessage(input.errorMessage),
        JSON.stringify(input.errorDetails),
      ],
    );
  }

  async markRunningCalculationFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
    errorDetails: unknown;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      [
        "update calculation_jobs",
        "set status = 'failed', completed_at = now(),",
        "error_message = $3, error_details = $4::jsonb",
        "where id = $1",
        "and organization_id = $2",
        "and status = 'running'",
        "returning id",
      ].join(" "),
      [
        input.jobId,
        input.organizationId,
        truncateErrorMessage(input.errorMessage),
        JSON.stringify(input.errorDetails),
      ],
    );

    return result.rows.length === 1;
  }

  async getJobStatus(input: {
    jobId: string;
    organizationId: string;
  }): Promise<CalculationJobStatusRecord | null> {
    const job = (
      await this.executor.query<CalculationJobRow>(
        [
          "select id, status, property_id, period_start::text, period_end::text,",
          "total_leases, coalesce(processed_leases, 0) as processed_leases,",
          "coalesce(snapshot_ids, '[]'::jsonb) as snapshot_ids,",
          "error_message, created_at, started_at, completed_at",
          "from calculation_jobs",
          "where id = $1",
          "and organization_id = $2",
        ].join(" "),
        [input.jobId, input.organizationId],
      )
    ).rows[0];

    if (!job) {
      return null;
    }

    const snapshotIds = normalizeSnapshotIds(job.snapshot_ids);
    const totalLeases = job.total_leases;
    const processedLeases = job.processed_leases ?? 0;
    const progressPercentage =
      totalLeases && totalLeases > 0
        ? Math.trunc((processedLeases / totalLeases) * 100)
        : null;
    const potentialRecoveryTotal =
      job.status === "completed" && snapshotIds.length > 0
        ? await this.sumSnapshotRecovery(snapshotIds, input.organizationId)
        : null;

    return {
      job_id: job.id,
      status: job.status,
      property_id: job.property_id,
      period_start: job.period_start,
      period_end: job.period_end,
      total_leases: totalLeases,
      processed_leases: processedLeases,
      progress_percentage: progressPercentage,
      snapshot_ids: snapshotIds,
      error_message: job.error_message,
      potential_recovery_total: potentialRecoveryTotal,
      created_at: serializeDateTime(job.created_at),
      started_at: serializeOptionalDateTime(job.started_at),
      completed_at: serializeOptionalDateTime(job.completed_at),
    };
  }

  async getSnapshot(input: {
    snapshotId: string;
    organizationId: string;
    includeTrace: boolean;
  }): Promise<ReconciliationSnapshotRecord | null> {
    const snapshot = (
      await this.executor.query<ReconciliationSnapshotRecord>(
        [
          "select *",
          "from reconciliation_snapshots",
          "where id = $1",
          "and organization_id = $2",
        ].join(" "),
        [input.snapshotId, input.organizationId],
      )
    ).rows[0];

    if (!snapshot) {
      return null;
    }

    const normalized = normalizeSnapshotJsonFields(snapshot);
    return input.includeTrace
      ? normalized
      : { ...normalized, calculation_trace: [] };
  }

  async listSnapshots(input: SnapshotListFilters): Promise<SnapshotListResult> {
    const where = buildSnapshotWhere(input);
    const total = await this.countSnapshots(where.sql, where.params);
    const offset = (input.page - 1) * input.size;
    const orderColumn = sortableColumns[input.sortBy];
    const result =
      await this.executor.query<ReconciliationSnapshotSummaryRecord>(
        [
          `select ${snapshotSummarySelect}`,
          "from reconciliation_snapshots",
          "join leases on leases.id = reconciliation_snapshots.lease_id",
          "join properties on properties.id = reconciliation_snapshots.property_id",
          where.sql,
          `order by ${orderColumn} ${input.sortOrder}, reconciliation_snapshots.id`,
          `limit $${where.params.length + 1}`,
          `offset $${where.params.length + 2}`,
        ].join(" "),
        [...where.params, input.size, offset],
      );

    return {
      items: result.rows,
      total,
      page: input.page,
      page_size: input.size,
    };
  }

  async finalizeSnapshot(input: {
    snapshotId: string;
    organizationId: string;
    userId: string;
    finalizedAt: string;
  }): Promise<FinalizeSnapshotResult> {
    return this.executor.transaction(async (executor) => {
      const snapshotScope = await getSnapshotFinancialEvidenceScope(
        executor,
        input,
      );

      if (!snapshotScope) {
        return { state: "not_found" };
      }

      await lockPropertyFinancialEvidence(executor, snapshotScope);

      const snapshot = await lockSnapshot(executor, input);

      if (!snapshot) {
        return { state: "not_found" };
      }

      if (snapshot.status === "finalized") {
        return { state: "already_finalized" };
      }

      if (!hasCalculationTrace(snapshot)) {
        return { state: "missing_trace" };
      }

      const finalized = await finalizeSnapshotById(executor, input);

      if (!finalized) {
        return { state: "conflict" };
      }

      return { state: "finalized", snapshot: finalized };
    });
  }

  async finalizeBatch(input: {
    propertyId: string;
    organizationId: string;
    userId: string;
    periodStart: string;
    periodEnd: string;
    finalizedAt: string;
  }): Promise<BatchFinalizeResult> {
    const result: BatchFinalizeResult = await this.executor.transaction(
      async (executor): Promise<BatchFinalizeResult> => {
        await lockPropertyFinancialEvidence(executor, input);

        const snapshots = (
          await executor.query<SnapshotLockRow>(
            [
              "select id, property_id, status, calculation_trace, manual_overrides",
              "from reconciliation_snapshots",
              "where property_id = $1",
              "and organization_id = $2",
              "and period_start_date = $3::date",
              "and period_end_date = $4::date",
              "and status = 'draft'",
              "order by id",
              "for update",
            ].join(" "),
            [
              input.propertyId,
              input.organizationId,
              input.periodStart,
              input.periodEnd,
            ],
          )
        ).rows;

        if (snapshots.length === 0) {
          return { state: "not_found" };
        }

        const results: BatchFinalizeResultItem[] = [];
        let succeeded = 0;
        let failed = 0;

        for (const snapshot of snapshots) {
          if (!hasCalculationTrace(snapshot)) {
            results.push({
              snapshot_id: snapshot.id,
              success: false,
              error_message: "Calculation trace is missing or empty",
            });
            failed += 1;
            continue;
          }

          const finalized = await finalizeSnapshotById(executor, {
            snapshotId: snapshot.id,
            organizationId: input.organizationId,
            userId: input.userId,
            finalizedAt: input.finalizedAt,
          });

          if (finalized) {
            results.push({
              snapshot_id: snapshot.id,
              success: true,
              error_message: null,
            });
            succeeded += 1;
          } else {
            results.push({
              snapshot_id: snapshot.id,
              success: false,
              error_message: "Snapshot was already finalized or not found",
            });
            failed += 1;
          }
        }

        const total = succeeded + failed;
        const message =
          failed === 0
            ? `All ${total} snapshots finalized successfully`
            : succeeded === 0
              ? `All ${total} snapshots failed to finalize`
              : `${succeeded} of ${total} snapshots finalized successfully, ${failed} failed`;

        // Flip the campaign to finalized inside the SAME transaction as the
        // snapshot finalization. The previous code ran this upsert AFTER the
        // transaction committed and swallowed any error as a warning, which
        // opened a data-integrity window: a Worker timeout or transient DB
        // error between the commit and the campaign upsert left snapshots
        // permanently finalized (immutable) while the campaign stayed 'draft'
        // forever — a desync that any campaign-status-gated logic (billing,
        // UI, analytics) would then read as wrong state, with no retry path.
        // The upsert is idempotent (insert ... on conflict do update), so it
        // is safe to run on the transactional executor; if it fails now, the
        // whole finalize rolls back atomically and can be retried. This also
        // matches the Python oracle, which finalizes snapshots and campaign in
        // a single commit.
        if (succeeded > 0) {
          await upsertFinalizedCampaign(executor, input);
        }

        return {
          state: "completed",
          total_attempted: total,
          total_succeeded: succeeded,
          total_failed: failed,
          results,
          message,
        };
      },
    );

    return result;
  }

  async updateCell(input: {
    cellId: string;
    snapshotId: string;
    organizationId: string;
    fieldName: EditableReconciliationField;
    value: string;
    userId: string;
    updatedAt: string;
  }): Promise<UpdateCellResult> {
    return this.executor.transaction(async (executor) => {
      const snapshot = await lockSnapshot(executor, input);

      if (!snapshot) {
        return { state: "not_found" };
      }

      if (snapshot.status === "finalized") {
        return { state: "finalized" };
      }

      const manualOverrides = {
        ...normalizeJsonObject(snapshot.manual_overrides),
        [input.fieldName]: {
          value: input.value,
          user_id: input.userId,
          timestamp: input.updatedAt,
        },
      };
      const dependentTotalRecovery = calculateDependentTotalRecovery(
        snapshot,
        manualOverrides,
        input,
      );
      const setClause =
        dependentTotalRecovery === null
          ? `set ${input.fieldName} = $3, manual_overrides = $4::jsonb`
          : `set ${input.fieldName} = $3, total_recovery = $5, manual_overrides = $4::jsonb`;
      const params =
        dependentTotalRecovery === null
          ? [
              input.snapshotId,
              input.organizationId,
              input.value,
              JSON.stringify(manualOverrides),
            ]
          : [
              input.snapshotId,
              input.organizationId,
              input.value,
              JSON.stringify(manualOverrides),
              dependentTotalRecovery,
            ];
      const result = await executor.query<{ id: string }>(
        [
          "update reconciliation_snapshots",
          setClause,
          "where id = $1",
          "and organization_id = $2",
          "and status = 'draft'",
          "returning id",
        ].join(" "),
        params,
      );

      if (!result.rows[0]) {
        return { state: "conflict" };
      }

      return {
        state: "updated",
        cell: {
          id: input.cellId,
          snapshot_id: input.snapshotId,
          field_name: input.fieldName,
          value: input.value,
          is_manual_override: true,
          updated_at: input.updatedAt,
          updated_by: input.userId,
        },
      };
    });
  }

  private async sumSnapshotRecovery(
    snapshotIds: string[],
    organizationId: string,
  ): Promise<string> {
    const result = await this.executor.query<RecoveryTotalRow>(
      [
        "select coalesce(sum(total_recovery), 0)::text as total",
        "from reconciliation_snapshots",
        "where id = any($1::uuid[])",
        "and organization_id = $2",
      ].join(" "),
      [snapshotIds, organizationId],
    );

    return String(result.rows[0]?.total ?? "0");
  }

  private async countSnapshots(
    whereSql: string,
    params: readonly unknown[],
  ): Promise<number> {
    const result = await this.executor.query<CountRow>(
      [
        "select count(*) as count",
        "from reconciliation_snapshots",
        "join leases on leases.id = reconciliation_snapshots.lease_id",
        "join properties on properties.id = reconciliation_snapshots.property_id",
        whereSql,
      ].join(" "),
      params,
    );

    return Number(result.rows[0]?.count ?? 0);
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

  private async loadCalculationProperty(
    job: CalculationJobRecord,
  ): Promise<CalculationPropertyRecord | null> {
    const result = await this.executor.query<CalculationPropertyRecord>(
      [
        'select id, total_rentable_sqft as "totalRentableSqft",',
        'target_occupancy as "targetOccupancy"',
        "from properties",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [job.propertyId, job.organizationId],
    );

    return result.rows[0] ?? null;
  }

  private async loadCalculationLeases(
    job: CalculationJobRecord,
  ): Promise<CalculationLeaseRecord[]> {
    const result = await this.executor.query<CalculationLeaseRecord>(
      [
        'select leases.id, leases.tenant_name as "tenantName",',
        // Cast date columns to text: the postgres driver decodes bare `date`
        // columns to JS Date objects (see serializeDateOnly), but the
        // reconciliation engine compares these as YYYY-MM-DD strings.
        'leases.start_date::text as "startDate", leases.end_date::text as "endDate",',
        'units.rentable_sqft as "tenantSqft",',
        'leases.recovery_profile as "recoveryProfile",',
        'term_versions.id as "termVersionId",',
        'term_versions.pro_rata_share as "versionProRataShare",',
        'term_versions.admin_fee_percentage as "versionAdminFeePercentage",',
        'term_versions.management_fee_percentage as "versionManagementFeePercentage",',
        'term_versions.base_year as "versionBaseYear",',
        'term_versions.base_year_amount as "versionBaseYearAmount",',
        'term_versions.cap_type as "versionCapType",',
        'term_versions.cap_rate as "versionCapRate",',
        'term_versions.excluded_pools as "versionExcludedPools"',
        "from leases",
        "left join units on units.id = leases.unit_id",
        "left join lateral (",
        "select * from lease_term_versions",
        "where lease_id = leases.id",
        "and effective_date <= $3::date",
        "order by effective_date desc",
        "limit 1",
        ") term_versions on true",
        "where leases.property_id = $1",
        // Defense-in-depth org scope. The reconciliation queue path runs on a
        // raw executor with no RLS session, so this app-layer filter is the sole
        // tenant-isolation guard. job.propertyId is already org-validated at job
        // creation, so this EXISTS never narrows a legitimate result; it self-
        // asserts the org invariant so a future property-reassignment bug cannot
        // leak another org's leases through a stale property_id.
        "and exists (select 1 from properties where properties.id = leases.property_id and properties.organization_id = $4)",
        "and leases.start_date <= $3::date",
        "and (leases.end_date is null or leases.end_date >= $2::date)",
        "order by leases.tenant_name, leases.id",
      ].join(" "),
      [job.propertyId, job.periodStart, job.periodEnd, job.organizationId],
    );

    return result.rows;
  }

  private async loadCalculationGlEntries(
    job: CalculationJobRecord,
  ): Promise<CalculationGlEntryRecord[]> {
    const result = await this.executor.query<CalculationGlEntryRecord>(
      [
        // Cast `amount` to text for the same driver-decode reason as the dates
        // below: porsager returns NUMERIC columns without a built-in JS parser,
        // and the downstream engine treats `amount` as a decimal string. The
        // ::text cast guarantees a precise string (matches every other GL read).
        'select id, account_code as "accountCode", amount::text as amount,',
        // Cast date columns to text: the postgres driver decodes bare `date`
        // columns to JS Date objects, and the engine's period filter compares
        // them as YYYY-MM-DD strings (a Date here silently drops every entry).
        'transaction_date::text as "transactionDate", accrual_date::text as "accrualDate"',
        "from gl_entries",
        "where property_id = $1",
        // Defense-in-depth org scope (raw executor / RLS bypassed on the queue
        // path). property_id is org-validated at job creation; this re-asserts it.
        "and exists (select 1 from properties where properties.id = gl_entries.property_id and properties.organization_id = $4)",
        "and (",
        "(transaction_date >= $2::date and transaction_date <= $3::date)",
        "or (accrual_date >= $2::date and accrual_date <= $3::date)",
        ")",
        "order by transaction_date, id",
      ].join(" "),
      [job.propertyId, job.periodStart, job.periodEnd, job.organizationId],
    );

    return result.rows;
  }

  private async loadCalculationExpensePools(
    job: CalculationJobRecord,
  ): Promise<CalculationExpensePoolRecord[]> {
    const result = await this.executor.query<CalculationExpensePoolRecord>(
      [
        'select id, name, pool_type as "poolType",',
        'is_gross_up_applicable as "isGrossUpApplicable",',
        'gross_up_target as "grossUpTarget"',
        "from expense_pools",
        "where property_id = $1",
        // Defense-in-depth org scope (raw executor / RLS bypassed on the queue
        // path). property_id is org-validated at job creation; this re-asserts it.
        "and exists (select 1 from properties where properties.id = expense_pools.property_id and properties.organization_id = $2)",
        "order by name",
      ].join(" "),
      [job.propertyId, job.organizationId],
    );

    return result.rows;
  }

  private async loadCalculationPoolMappings(
    job: CalculationJobRecord,
  ): Promise<CalculationPoolMappingRecord[]> {
    const result = await this.executor.query<CalculationPoolMappingRecord>(
      [
        'select pool_mappings.expense_pool_id as "expensePoolId",',
        'pool_mappings.gl_account_pattern as "glAccountPattern",',
        'pool_mappings.allocation_percentage as "allocationPercentage",',
        "pool_mappings.priority",
        "from pool_mappings",
        "join expense_pools on expense_pools.id = pool_mappings.expense_pool_id",
        "where expense_pools.property_id = $1",
        // Defense-in-depth org scope (raw executor / RLS bypassed on the queue
        // path). property_id is org-validated at job creation; this re-asserts it.
        "and exists (select 1 from properties where properties.id = expense_pools.property_id and properties.organization_id = $2)",
        "order by pool_mappings.priority desc",
      ].join(" "),
      [job.propertyId, job.organizationId],
    );

    return result.rows;
  }

  private async loadCalculationPoolAllocations(
    job: CalculationJobRecord,
  ): Promise<CalculationPoolAllocationRecord[]> {
    // Only percentage splits participate in reconciliation (oracle
    // build_split_allocations_from_pool_allocations filters allocation_type ==
    // "percentage"; the write path also rejects non-percentage for recon). The
    // numeric allocation_value is ::text-cast so Rate.parse gets a clean decimal
    // string. created_at order makes the target ordering deterministic.
    const result = await this.executor.query<CalculationPoolAllocationRecord>(
      [
        'select pool_allocations.source_pool_id as "sourcePoolId",',
        'pool_allocations.target_pool_id as "targetPoolId",',
        'pool_allocations.allocation_value::text as "allocationValue"',
        "from pool_allocations",
        "join expense_pools on expense_pools.id = pool_allocations.source_pool_id",
        "where expense_pools.property_id = $1",
        "and pool_allocations.allocation_type = 'percentage'",
        // Defense-in-depth org scope (raw executor / RLS bypassed on the queue
        // path). property_id is org-validated at job creation; this re-asserts it.
        "and exists (select 1 from properties where properties.id = expense_pools.property_id and properties.organization_id = $2)",
        "order by pool_allocations.created_at asc",
      ].join(" "),
      [job.propertyId, job.organizationId],
    );

    return result.rows;
  }

  private async loadTenantCapHistories(
    job: CalculationJobRecord,
  ): Promise<TenantCapHistoryRecord[]> {
    type CapHistoryRow = {
      leaseId: string;
      priorYearAmount: string | null;
      capBaseYearAmount: string | null;
      // json_agg returns a JSON array; the driver may decode it to a JS array or
      // hand it back as a string. normalizePriorAmounts handles both.
      priorAmounts: unknown;
    };
    const result = await this.executor.query<CapHistoryRow>(
      [
        'select lease_id as "leaseId",',
        "(array_agg(tenant_share_after_cap order by period_start_date desc))[1]::text",
        'as "priorYearAmount",',
        "(array_agg(tenant_share_after_cap order by period_start_date asc))[1]::text",
        'as "capBaseYearAmount",',
        // Full ordered list (oldest first) of prior finalized after-cap shares.
        // Mirrors the Python oracle's all_prior_amounts; cumulative caps need it
        // for the carry-forward bank and years_since_base (= length + 1).
        "json_agg(tenant_share_after_cap::text order by period_start_date asc)",
        'as "priorAmounts"',
        "from reconciliation_snapshots",
        "where property_id = $1",
        "and organization_id = $2",
        "and status = 'finalized'",
        "and period_start_date < $3::date",
        "group by lease_id",
      ].join(" "),
      [job.propertyId, job.organizationId, job.periodStart],
    );

    return result.rows.map((row) => ({
      leaseId: row.leaseId,
      priorYearAmount: row.priorYearAmount,
      capBaseYearAmount: row.capBaseYearAmount,
      priorAmounts: normalizePriorAmounts(row.priorAmounts),
    }));
  }

  async getLeaseCapProfile(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<LeaseCapProfile | null> {
    type LeaseRow = {
      id: string;
      tenant_name: string;
      recovery_profile: Record<string, unknown> | null;
    };
    const result = await this.executor.query<LeaseRow>(
      [
        "select id, tenant_name, recovery_profile",
        "from leases",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [input.leaseId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const rp = row.recovery_profile ?? {};
    return {
      leaseId: row.id,
      tenantName: String(row.tenant_name ?? ""),
      capType: String(rp["cap_type"] ?? "none"),
      capRate:
        rp["cap_rate"] !== null && rp["cap_rate"] !== undefined
          ? String(rp["cap_rate"])
          : null,
      capFixedAmount:
        rp["cap_fixed_amount"] !== null && rp["cap_fixed_amount"] !== undefined
          ? String(rp["cap_fixed_amount"])
          : null,
      baseYearAmount:
        rp["base_year_amount"] !== null && rp["base_year_amount"] !== undefined
          ? String(rp["base_year_amount"])
          : null,
    };
  }

  async listFinalizedSnapshotsForLease(input: {
    leaseId: string;
    organizationId: string;
  }): Promise<CapBankSnapshotRow[]> {
    const result = await this.executor.query<CapBankSnapshotRow>(
      [
        // Cast date/timestamp columns to text: the postgres driver decodes
        // bare `date`/`timestamp` columns to JS Date objects, but the cap-bank
        // ledger consumes these as strings (parseDate slices them).
        // Likewise cast the NUMERIC money column: the driver decodes bare
        // NUMERIC to a JS float, while the ledger reads tenant_share_before_cap
        // as a string (String(...) -> simulateCapBank). Casting keeps the
        // canonical 2dp string form regardless of driver decode; the sibling
        // lockSnapshot select already casts its money columns.
        "select id, tenant_share_before_cap::text as tenant_share_before_cap, period_start_date::text as period_start_date,",
        "period_end_date::text as period_end_date, finalized_at::text as finalized_at",
        "from reconciliation_snapshots",
        "where lease_id = $1",
        "and organization_id = $2",
        "and status = 'finalized'",
        "order by period_start_date asc",
      ].join(" "),
      [input.leaseId, input.organizationId],
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
}

async function lockSnapshot(
  executor: PostgresExecutor,
  input: { snapshotId: string; organizationId: string },
): Promise<SnapshotLockRow | null> {
  const result = await executor.query<SnapshotLockRow>(
    [
      "select id, property_id, status, tenant_share_after_cap::text, admin_fee::text, total_recovery::text, calculation_trace, manual_overrides",
      "from reconciliation_snapshots",
      "where id = $1",
      "and organization_id = $2",
      "for update",
    ].join(" "),
    [input.snapshotId, input.organizationId],
  );

  return result.rows[0] ?? null;
}

async function getSnapshotFinancialEvidenceScope(
  executor: PostgresExecutor,
  input: { snapshotId: string; organizationId: string },
): Promise<{ organizationId: string; propertyId: string } | null> {
  const result = await executor.query<{ property_id: string }>(
    [
      "select property_id",
      "from reconciliation_snapshots",
      "where id = $1",
      "and organization_id = $2",
    ].join(" "),
    [input.snapshotId, input.organizationId],
  );
  const row = result.rows[0];

  return row
    ? { organizationId: input.organizationId, propertyId: row.property_id }
    : null;
}

function calculateDependentTotalRecovery(
  snapshot: SnapshotLockRow,
  manualOverrides: Record<string, unknown>,
  input: {
    fieldName: EditableReconciliationField;
    value: string;
  },
): string | null {
  if (
    input.fieldName !== "admin_fee" &&
    input.fieldName !== "tenant_share_after_cap"
  ) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(manualOverrides, "total_recovery")) {
    return null;
  }

  const tenantShareAfterCap =
    input.fieldName === "tenant_share_after_cap"
      ? input.value
      : snapshot.tenant_share_after_cap;
  const adminFee =
    input.fieldName === "admin_fee" ? input.value : snapshot.admin_fee;

  // Round HALF_UP to match the calculation/billing layer (Money.roundDivide,
  // the cap engine, occupancy) that produces the non-override total_recovery.
  // A manual override may carry sub-cent precision (the route schema accepts
  // any decimals), so this sum can land on a half-cent; HALF_EVEN here would
  // under-bill by a cent versus the engine. Stay consistent — never diverge
  // the billed total from the engine's rounding convention.
  return new Decimal(tenantShareAfterCap ?? "0")
    .plus(new Decimal(adminFee ?? "0"))
    .toFixed(2, Decimal.ROUND_HALF_UP);
}

async function propertyBelongsToOrganization(
  executor: PostgresExecutor,
  input: { propertyId: string; organizationId: string },
): Promise<boolean> {
  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1 from properties",
      "where id = $1",
      "and organization_id = $2",
      ")",
    ].join(" "),
    [input.propertyId, input.organizationId],
  );

  return result.rows[0]?.exists === true;
}

async function hasActiveLeaseForPeriod(
  executor: PostgresExecutor,
  input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<boolean> {
  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1",
      "from leases",
      "join properties on properties.id = leases.property_id",
      "where leases.property_id = $1",
      "and properties.organization_id = $2",
      "and leases.start_date <= $4::date",
      "and (leases.end_date is null or leases.end_date >= $3::date)",
      ")",
    ].join(" "),
    [
      input.propertyId,
      input.organizationId,
      input.periodStart,
      input.periodEnd,
    ],
  );

  return result.rows[0]?.exists === true;
}

async function hasFinalizedSnapshotForPeriod(
  executor: PostgresExecutor,
  input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<boolean> {
  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1 from reconciliation_snapshots",
      "where property_id = $1",
      "and organization_id = $2",
      "and period_start_date = $3::date",
      "and period_end_date = $4::date",
      "and status = 'finalized'",
      ")",
    ].join(" "),
    [
      input.propertyId,
      input.organizationId,
      input.periodStart,
      input.periodEnd,
    ],
  );

  return result.rows[0]?.exists === true;
}

async function countDraftSnapshotsForPeriod(
  executor: PostgresExecutor,
  input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<number> {
  const result = await executor.query<CountRow>(
    [
      "select count(*) as count",
      "from reconciliation_snapshots",
      "where property_id = $1",
      "and organization_id = $2",
      "and period_start_date = $3::date",
      "and period_end_date = $4::date",
      "and status = 'draft'",
    ].join(" "),
    [
      input.propertyId,
      input.organizationId,
      input.periodStart,
      input.periodEnd,
    ],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function upsertDraftCampaign(
  executor: PostgresExecutor,
  input: {
    organizationId: string;
    propertyId: string;
    periodEnd: string;
  },
): Promise<void> {
  const year = Number.parseInt(input.periodEnd.slice(0, 4), 10);

  if (!Number.isInteger(year)) {
    return;
  }

  await executor.query(
    [
      "insert into reconciliation_campaigns",
      "(organization_id, property_id, period_year, status)",
      "values ($1, $2, $3, 'draft')",
      "on conflict (property_id, period_year) do nothing",
    ].join(" "),
    [input.organizationId, input.propertyId, year],
  );
}

async function deleteDraftSnapshotRows(
  executor: PostgresExecutor,
  input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  },
): Promise<void> {
  await executor.query(
    [
      "delete from reconciliation_snapshots",
      "where property_id = $1",
      "and organization_id = $2",
      "and period_start_date = $3::date",
      "and period_end_date = $4::date",
      "and status = 'draft'",
    ].join(" "),
    [
      input.propertyId,
      input.organizationId,
      input.periodStart,
      input.periodEnd,
    ],
  );
}

async function insertCalculationSnapshotRows(
  executor: PostgresExecutor,
  input: {
    jobId: string;
    organizationId: string;
    snapshots: SnapshotDraft[];
  },
): Promise<string[]> {
  const ids: string[] = [];
  for (const snapshot of input.snapshots) {
    const result = await executor.query<CreatedSnapshotRow>(
      [
        "insert into reconciliation_snapshots",
        "(",
        "property_id, lease_id, period_start_date, period_end_date, status,",
        "total_operating_expenses, grossed_up_expenses, base_year_amount,",
        "tenant_share_before_cap, tenant_share_after_cap, admin_fee,",
        "total_recovery, calculation_trace, engine_version, trace_checksum,",
        "pool_breakdowns, lease_terms_snapshot, term_version_id, organization_id",
        ")",
        "values (",
        "$1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11, $12,",
        "$13::jsonb, $14, $15, $16::jsonb, $17::jsonb, $18, $19",
        ")",
        "returning id",
      ].join(" "),
      [
        snapshot.property_id,
        snapshot.lease_id,
        snapshot.period_start_date,
        snapshot.period_end_date,
        snapshot.status,
        snapshot.total_operating_expenses,
        snapshot.grossed_up_expenses,
        snapshot.base_year_amount,
        snapshot.tenant_share_before_cap,
        snapshot.tenant_share_after_cap,
        snapshot.admin_fee,
        snapshot.total_recovery,
        JSON.stringify(snapshot.calculation_trace),
        snapshot.engine_version,
        snapshot.trace_checksum,
        JSON.stringify(snapshot.pool_breakdowns),
        JSON.stringify(snapshot.lease_terms_snapshot),
        snapshot.term_version_id,
        input.organizationId,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Failed to insert snapshot for job ${input.jobId}`);
    }
    ids.push(row.id);
  }

  return ids;
}

async function completeCalculationJobRow(
  executor: PostgresExecutor,
  input: {
    jobId: string;
    organizationId: string;
    snapshotIds: string[];
  },
): Promise<void> {
  const result = await executor.query<{ id: string }>(
    [
      "update calculation_jobs",
      "set status = 'completed', completed_at = now(),",
      "total_leases = $3, processed_leases = $3, snapshot_ids = $4::jsonb",
      "where id = $1",
      "and organization_id = $2",
      "and status = 'running'",
      "returning id",
    ].join(" "),
    [
      input.jobId,
      input.organizationId,
      input.snapshotIds.length,
      JSON.stringify(input.snapshotIds),
    ],
  );
  if (result.rows.length === 0) {
    throw new Error(
      "Calculation job is no longer running; refusing to complete stale reconciliation results.",
    );
  }
}

async function lockRunningCalculationJob(
  executor: PostgresExecutor,
  input: {
    jobId: string;
    organizationId: string;
  },
): Promise<void> {
  const result = await executor.query<{ id: string }>(
    [
      "select id",
      "from calculation_jobs",
      "where id = $1",
      "and organization_id = $2",
      "and status = 'running'",
      "for update",
    ].join(" "),
    [input.jobId, input.organizationId],
  );

  if (result.rows.length === 0) {
    throw new Error(
      "Calculation job is no longer running; refusing to persist stale reconciliation results.",
    );
  }
}

async function finalizeSnapshotById(
  executor: PostgresExecutor,
  input: {
    snapshotId: string;
    organizationId: string;
    userId: string;
    finalizedAt: string;
  },
): Promise<FinalizedSnapshotRecord | null> {
  const result = await executor.query<FinalizedSnapshotRow>(
    [
      "update reconciliation_snapshots",
      "set status = 'finalized', finalized_at = $3::timestamptz,",
      "finalized_by_user_id = $4",
      "where id = $1",
      "and organization_id = $2",
      "and status = 'draft'",
      "returning id, status, finalized_at, finalized_by_user_id",
    ].join(" "),
    [input.snapshotId, input.organizationId, input.finalizedAt, input.userId],
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    finalized_at: serializeDateTime(row.finalized_at),
    finalized_by_user_id: row.finalized_by_user_id,
  };
}

async function upsertFinalizedCampaign(
  executor: PostgresExecutor,
  input: {
    propertyId: string;
    organizationId: string;
    userId: string;
    periodEnd: string;
    finalizedAt: string;
  },
): Promise<void> {
  const year = Number.parseInt(input.periodEnd.slice(0, 4), 10);

  if (!Number.isInteger(year)) {
    return;
  }

  await executor.query(
    [
      "insert into reconciliation_campaigns",
      "(organization_id, property_id, period_year, status, finalized_at, finalized_by_user_id)",
      "values ($1, $2, $3, 'finalized', $4::timestamptz, $5)",
      "on conflict (property_id, period_year)",
      "do update set status = 'finalized', finalized_at = excluded.finalized_at,",
      "finalized_by_user_id = excluded.finalized_by_user_id",
      "where reconciliation_campaigns.status = 'draft'",
    ].join(" "),
    [
      input.organizationId,
      input.propertyId,
      year,
      input.finalizedAt,
      input.userId,
    ],
  );
}

function buildSnapshotWhere(input: SnapshotListFilters): {
  sql: string;
  params: unknown[];
} {
  const clauses = ["reconciliation_snapshots.organization_id = $1"];
  const params: unknown[] = [input.organizationId];

  if (input.propertyId) {
    params.push(input.propertyId);
    clauses.push(`reconciliation_snapshots.property_id = $${params.length}`);
  }

  if (input.leaseId) {
    params.push(input.leaseId);
    clauses.push(`reconciliation_snapshots.lease_id = $${params.length}`);
  }

  if (input.periodStart) {
    params.push(input.periodStart);
    clauses.push(
      `reconciliation_snapshots.period_start_date = $${params.length}::date`,
    );
  }

  if (input.periodEnd) {
    params.push(input.periodEnd);
    clauses.push(
      `reconciliation_snapshots.period_end_date = $${params.length}::date`,
    );
  }

  if (input.isFinalized !== undefined) {
    params.push(input.isFinalized ? "finalized" : "draft");
    clauses.push(`reconciliation_snapshots.status = $${params.length}`);
  }

  return { sql: `where ${clauses.join(" and ")}`, params };
}

function hasCalculationTrace(snapshot: {
  calculation_trace: unknown;
}): boolean {
  const trace = normalizeJsonArray(snapshot.calculation_trace);
  return Array.isArray(trace) && trace.length > 0;
}

function normalizeSnapshotJsonFields(
  snapshot: ReconciliationSnapshotRecord,
): ReconciliationSnapshotRecord {
  return {
    ...snapshot,
    calculation_trace: normalizeJsonArray(snapshot.calculation_trace),
    manual_overrides: normalizeJsonObject(snapshot.manual_overrides),
    // pool_breakdowns is a JSONB array like its siblings above. Depending on the
    // driver decode path it can come back as a JSON string; without this
    // coercion getSnapshot returns a string while calculation_trace /
    // manual_overrides return parsed values — an inconsistent contract, and a
    // consumer that does `pool_breakdowns.map(...)` would throw on the string.
    // normalizeJsonArray is idempotent (array passes through, string parses) and
    // preserves the meaningful NULL (aggregate-only snapshot) as null.
    pool_breakdowns: normalizeJsonArray(snapshot.pool_breakdowns),
    // getSnapshot uses `select *` (no ::text cast), so porsager hands back JS
    // Date objects for date/timestamptz columns. The record type declares these
    // as strings and downstream code does string ops on them (reconciliationUrl
    // does period_start_date.slice(0, 4) when building the finalize-email URL —
    // a Date there throws and the email is silently dropped). Coerce to the
    // declared string form so the contract holds regardless of driver decode.
    period_start_date: serializeDateOnly(snapshot.period_start_date),
    period_end_date: serializeDateOnly(snapshot.period_end_date),
    finalized_at: serializeOptionalDateTime(snapshot.finalized_at),
    created_at: serializeOptionalDateTime(snapshot.created_at),
  };
}

function normalizeSnapshotIds(value: unknown): string[] {
  const parsed = normalizeJsonArray(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === "string");
}

function normalizePriorAmounts(value: unknown): string[] {
  // json_agg over zero rows is NULL (the group only exists when rows exist, so
  // in practice this is always a non-empty array, but guard defensively). The
  // driver may decode the JSON array to a JS array or leave it as a string.
  const parsed = normalizeJsonArray(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item): item is string | number => item !== null)
    .map((item) => String(item));
}

function normalizeJsonArray(value: unknown): unknown[] | null {
  const parsed = typeof value === "string" ? parseJsonValue(value) : value;

  return Array.isArray(parsed) ? parsed : null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? parseJsonValue(value) : value;

  return isJsonObject(parsed) ? parsed : {};
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeOptionalDateTime(value: string | Date | null): string | null {
  return value === null ? null : serializeDateTime(value);
}

function serializeDateTime(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function toCalculationJobRecord(
  row: CalculationJobRecordRow,
): CalculationJobRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    periodStart: serializeDateOnly(row.period_start),
    periodEnd: serializeDateOnly(row.period_end),
    status: row.status,
    forceRecalculate: row.force_recalculate,
  };
}

function truncateErrorMessage(error: string): string {
  return error.slice(0, 2000);
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
