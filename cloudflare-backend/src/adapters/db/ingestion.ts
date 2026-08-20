import type { PostgresExecutor } from "./postgres";
import type {
  BatchDetailRecord,
  BatchListRecord,
  ColumnMappingListResult,
  ColumnMappingRecord,
  CreateColumnMappingResult,
  DateRangeRecord,
  DeleteBatchResult,
  ApplyMappingResult,
  GlEntryInsert,
  IngestionRepository,
  ApplyMappingPreflightResult,
  PreviewEntryRecord,
  PropertyImportListResult,
  PropertyImportRecord,
  RetryBatchResult,
  SourceSystem,
  UploadImportResult,
} from "../../domain/ingestion/repository";

type IdRow = { id: string };
type ExistsRow = { exists: boolean };
type BatchLockRow = { property_id: string; status: string };
type DuplicateBatchRow = { id: string; created_at: string | Date | null };
type MappingBatchLockRow = {
  property_id: string;
  status: string;
  source_system: string;
  file_hash: string;
};
type InsertedBatchRow = { id: string };
type CountRow = { total: string | number };
type SubscriptionEntitlementRow = {
  status: string;
  billingModel: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | Date | null;
};

const batchListFields = [
  "id",
  "file_name",
  "source_system",
  "status",
  "row_count",
  "error_count",
  "created_at",
].join(", ");

const batchDetailFields = [
  "id",
  "organization_id",
  "property_id",
  "file_name",
  "file_hash",
  "source_system",
  "status",
  "row_count",
  "error_count",
  "error_log",
  "created_at",
  "updated_at",
].join(", ");
const maxRowsPerGlInsert = 1_000;

export class PostgresIngestionRepository implements IngestionRepository {
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

  async listBatches(organizationId: string): Promise<BatchListRecord[]> {
    const result = await this.executor.query<BatchListRecord>(
      [
        `select ${batchListFields}`,
        "from import_batches",
        "where organization_id = $1",
        "order by created_at desc",
        "limit 100",
      ].join(" "),
      [organizationId],
    );

    return result.rows;
  }

  async uploadImport(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
    fileHash: string;
    sourceSystem: SourceSystem;
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<UploadImportResult> {
    try {
      return await this.runUploadImport(input);
    } catch (error) {
      // A concurrent duplicate upload can lose the race on the
      // (organization_id, property_id, file_hash) unique constraint. Postgres'
      // INSERT ... ON CONFLICT DO NOTHING does not fully shield against a
      // conflicting tuple inserted by a *concurrent* transaction: it can still
      // raise unique_violation (23505). That aborts the transaction, so the
      // in-transaction re-query cannot run. Translate it into the same clean
      // "duplicate" outcome a serial re-upload gets (a fresh query outside the
      // aborted transaction), instead of surfacing a generic 500.
      if (!isFileHashUniqueViolation(error)) {
        throw error;
      }

      const conflictingBatch = await findDuplicateBatch(this.executor, input);

      return {
        state: "duplicate",
        batchId: conflictingBatch?.id ?? "",
        importedAt: serializeOptionalDateTime(
          conflictingBatch?.created_at ?? null,
        ),
      };
    }
  }

  private async runUploadImport(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
    fileHash: string;
    sourceSystem: SourceSystem;
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<UploadImportResult> {
    return this.executor.transaction(async (executor) => {
      if (
        !(await propertyBelongsToOrganization(executor, {
          propertyId: input.propertyId,
          organizationId: input.organizationId,
        }))
      ) {
        return { state: "property_not_found" };
      }

      const duplicate = await findDuplicateBatch(executor, input);
      if (duplicate) {
        return {
          state: "duplicate",
          batchId: duplicate.id,
          importedAt: serializeOptionalDateTime(duplicate.created_at),
        };
      }

      const insertResult = await executor.query<InsertedBatchRow>(
        [
          "insert into import_batches",
          "(id, organization_id, property_id, file_name, file_hash, source_system, status)",
          "values ($1, $2, $3, $4, $5, $6, 'pending')",
          "on conflict (organization_id, property_id, file_hash) do nothing",
          "returning id",
        ].join(" "),
        [
          crypto.randomUUID(),
          input.organizationId,
          input.propertyId,
          input.fileName,
          input.fileHash,
          input.sourceSystem,
        ],
      );
      const batchId = insertResult.rows[0]?.id;

      if (!batchId) {
        const conflictingBatch = await findDuplicateBatch(executor, input);

        return {
          state: "duplicate",
          batchId: conflictingBatch?.id ?? "",
          importedAt: serializeOptionalDateTime(
            conflictingBatch?.created_at ?? null,
          ),
        };
      }

      if (input.sourceSystem !== "generic") {
        await completeBatchWithEntries(executor, {
          batchId,
          organizationId: input.organizationId,
          propertyId: input.propertyId,
          entries: input.entries,
          errorCount: input.errorCount,
        });
      }

      return {
        state: "uploaded",
        batchId,
        sourceSystem: input.sourceSystem,
        rowCount: input.sourceSystem === "generic" ? 0 : input.entries.length,
        errorCount: input.sourceSystem === "generic" ? 0 : input.errorCount,
      };
    });
  }

  async applyMapping(input: {
    batchId: string;
    organizationId: string;
    fileHash: string;
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<ApplyMappingResult> {
    return this.executor.transaction(async (executor) => {
      const batch = await lockMappingBatch(executor, input);

      if (!batch) {
        return { state: "not_found" };
      }

      if (batch.source_system !== "generic") {
        return { state: "invalid_source", sourceSystem: batch.source_system };
      }

      if (batch.status !== "pending") {
        return { state: "invalid_status", status: batch.status };
      }

      if (batch.file_hash !== input.fileHash) {
        return { state: "file_mismatch" };
      }

      await completeBatchWithEntries(executor, {
        batchId: input.batchId,
        organizationId: input.organizationId,
        propertyId: batch.property_id,
        entries: input.entries,
        errorCount: input.errorCount,
      });

      return {
        state: "completed",
        batchId: input.batchId,
        propertyId: batch.property_id,
        rowCount: input.entries.length,
        errorCount: input.errorCount,
      };
    });
  }

  async preflightApplyMapping(input: {
    batchId: string;
    organizationId: string;
    fileHash: string;
  }): Promise<ApplyMappingPreflightResult> {
    return this.executor.transaction(async (executor) => {
      const batch = await lockMappingBatch(executor, input);

      if (!batch) {
        return { state: "not_found" };
      }

      if (batch.source_system !== "generic") {
        return { state: "invalid_source", sourceSystem: batch.source_system };
      }

      if (batch.status !== "pending") {
        return { state: "invalid_status", status: batch.status };
      }

      if (batch.file_hash !== input.fileHash) {
        return { state: "file_mismatch" };
      }

      return { state: "ready", propertyId: batch.property_id };
    });
  }

  async listColumnMappings(input: {
    organizationId: string;
    sourceSystem?: SourceSystem;
    skip: number;
    limit: number;
  }): Promise<ColumnMappingListResult> {
    const params: unknown[] = [input.organizationId];
    const filters = ["organization_id = $1"];

    if (input.sourceSystem) {
      params.push(input.sourceSystem);
      filters.push(`source_system = $${params.length}`);
    }

    const countResult = await this.executor.query<CountRow>(
      [
        "select count(*)::int as total",
        "from column_mappings",
        `where ${filters.join(" and ")}`,
      ].join(" "),
      params,
    );
    params.push(input.limit, input.skip);
    const mappingsResult = await this.executor.query<ColumnMappingRecord>(
      [
        "select id, name, description, source_system, mapping_config, created_by,",
        "created_at, updated_at",
        "from column_mappings",
        `where ${filters.join(" and ")}`,
        "order by created_at desc",
        `limit $${params.length - 1}`,
        `offset $${params.length}`,
      ].join(" "),
      params,
    );

    return {
      mappings: mappingsResult.rows.map(normalizeColumnMapping),
      total: Number(countResult.rows[0]?.total ?? mappingsResult.rows.length),
    };
  }

  async createColumnMapping(input: {
    organizationId: string;
    userId: string;
    name: string;
    description: string | null;
    sourceSystem: SourceSystem;
    mappingConfig: Record<string, string>;
  }): Promise<CreateColumnMappingResult> {
    const result = await this.executor.query<ColumnMappingRecord>(
      [
        "insert into column_mappings",
        "(organization_id, name, description, source_system, mapping_config, created_by)",
        "values ($1, $2, $3, $4, $5::jsonb, $6)",
        "on conflict (organization_id, source_system, name) do nothing",
        "returning id, name, description, source_system, mapping_config, created_by,",
        "created_at, updated_at",
      ].join(" "),
      [
        input.organizationId,
        input.name,
        input.description,
        input.sourceSystem,
        JSON.stringify(input.mappingConfig),
        input.userId,
      ],
    );
    const mapping = result.rows[0];

    return mapping
      ? { state: "created", mapping: normalizeColumnMapping(mapping) }
      : { state: "duplicate" };
  }

  async getBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<BatchDetailRecord | null> {
    const result = await this.executor.query<BatchDetailRecord>(
      [
        `select ${batchDetailFields}`,
        "from import_batches",
        "where id = $1",
        "and organization_id = $2",
      ].join(" "),
      [input.batchId, input.organizationId],
    );

    return result.rows[0] ?? null;
  }

  async listPreviewEntries(input: {
    batchId: string;
    propertyId: string;
    organizationId: string;
  }): Promise<PreviewEntryRecord[]> {
    const result = await this.executor.query<PreviewEntryRecord>(
      [
        "select gl_entries.id, gl_entries.transaction_date,",
        "gl_entries.account_code, gl_entries.account_description,",
        "gl_entries.description, gl_entries.amount",
        "from gl_entries",
        "join import_batches on import_batches.id = gl_entries.import_batch_id",
        "where gl_entries.import_batch_id = $1",
        "and gl_entries.property_id = $2",
        "and import_batches.organization_id = $3",
        "and import_batches.property_id = gl_entries.property_id",
        "order by gl_entries.transaction_date, gl_entries.account_code, gl_entries.id",
        "limit 50",
      ].join(" "),
      [input.batchId, input.propertyId, input.organizationId],
    );

    return result.rows;
  }

  async retryBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<RetryBatchResult> {
    return this.executor.transaction(async (executor) => {
      const batch = await lockScopedBatch(executor, input);

      if (!batch) {
        return { state: "not_found" };
      }

      if (batch.status !== "failed") {
        return { state: "invalid_status", status: batch.status };
      }

      const scope = { ...input, propertyId: batch.property_id };

      if (await hasFinalizedScopedReconciliation(executor, scope)) {
        return { state: "finalized_reconciliation" };
      }

      const deletedCount = await deleteScopedGlEntries(executor, scope);

      await executor.query(
        [
          "delete from import_batches",
          "where id = $1",
          "and property_id = $2",
          "and organization_id = $3",
        ].join(" "),
        [input.batchId, batch.property_id, input.organizationId],
      );

      return { state: "retried", deletedGlEntryCount: deletedCount };
    });
  }

  async deleteBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<DeleteBatchResult> {
    return this.executor.transaction(async (executor) => {
      const batch = await lockScopedBatch(executor, input);

      if (!batch) {
        return { state: "not_found" };
      }

      const scope = { ...input, propertyId: batch.property_id };

      if (await hasFinalizedScopedReconciliation(executor, scope)) {
        return { state: "finalized_reconciliation" };
      }

      const deletedCount = await deleteScopedGlEntries(executor, scope);

      await executor.query(
        [
          "delete from import_batches",
          "where id = $1",
          "and property_id = $2",
          "and organization_id = $3",
        ].join(" "),
        [input.batchId, batch.property_id, input.organizationId],
      );

      return { state: "deleted", deletedGlEntryCount: deletedCount };
    });
  }

  async getGlDateRange(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<DateRangeRecord | null> {
    const result = await this.executor.query<DateRangeRecord>(
      [
        "select min(gl_entries.transaction_date)::text as min_date,",
        "max(gl_entries.transaction_date)::text as max_date",
        "from gl_entries",
        "join properties on properties.id = gl_entries.property_id",
        "where gl_entries.property_id = $1",
        "and properties.organization_id = $2",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    const row = result.rows[0];

    if (!row?.min_date || !row.max_date) {
      return null;
    }

    return row;
  }

  async listPropertyImports(input: {
    propertyId: string;
    organizationId: string;
    page: number;
    size: number;
    status?: string;
  }): Promise<PropertyImportListResult> {
    const offset = (input.page - 1) * input.size;
    const params: (string | number)[] = [
      input.propertyId,
      input.organizationId,
    ];

    const statusClause =
      input.status !== undefined &&
      input.status !== "" &&
      input.status.toLowerCase() !== "all"
        ? (() => {
            params.push(input.status.toLowerCase());
            return `and status = $${params.length}`;
          })()
        : "";

    params.push(input.size, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const countResult = await this.executor.query<{ total: string | number }>(
      [
        "select count(*) as total",
        "from import_batches",
        "where property_id = $1",
        "and organization_id = $2",
        statusClause,
      ]
        .filter(Boolean)
        .join(" "),
      params.slice(0, params.length - 2),
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await this.executor.query<PropertyImportRecord>(
      [
        // The import_batches table only has the legacy columns (file_name,
        // source_system, row_count, error_count). The canonical columns
        // (filename, parser_type, rows_processed, rows_failed, rows_imported)
        // and completed_at/error_message do not exist on the table, so they are
        // selected as NULL. mapImportBatchSummary applies the same fallbacks the
        // Python endpoint applied via dict.get() defaults.
        "select id,",
        "null::text as filename, file_name,",
        "status,",
        "null::text as parser_type, source_system,",
        "null::int as rows_processed, row_count,",
        "null::int as rows_failed, error_count,",
        "null::int as rows_imported,",
        "created_at,",
        "null::timestamptz as completed_at,",
        "null::text as error_message",
        "from import_batches",
        "where property_id = $1",
        "and organization_id = $2",
        statusClause,
        "order by created_at desc",
        `limit $${limitParam} offset $${offsetParam}`,
      ]
        .filter(Boolean)
        .join(" "),
      params,
    );

    return { imports: rows.rows, total };
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

const fileHashUniqueConstraint = "unique_file_per_property";

function isFileHashUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  const isUniqueViolation = candidate.code === "23505";
  const constraint =
    typeof candidate.constraint_name === "string"
      ? candidate.constraint_name
      : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";

  // Only treat this as a duplicate when the driver reports SQLSTATE 23505.
  // The message-substring check is a fallback for drivers that don't populate
  // constraint_name — but it must stay gated on the unique-violation code so a
  // non-constraint error whose text merely mentions the constraint isn't
  // silently reclassified as a duplicate (masking a real failure).
  return (
    isUniqueViolation &&
    (constraint === fileHashUniqueConstraint ||
      message.includes(fileHashUniqueConstraint))
  );
}

async function findDuplicateBatch(
  executor: PostgresExecutor,
  input: { organizationId: string; propertyId: string; fileHash: string },
): Promise<DuplicateBatchRow | null> {
  const result = await executor.query<DuplicateBatchRow>(
    [
      "select id, created_at",
      "from import_batches",
      "where organization_id = $1",
      "and property_id = $2",
      "and file_hash = $3",
      "and status in ('completed', 'processing', 'failed', 'pending')",
      "order by created_at asc",
      "limit 1",
    ].join(" "),
    [input.organizationId, input.propertyId, input.fileHash],
  );

  return result.rows[0] ?? null;
}

async function lockMappingBatch(
  executor: PostgresExecutor,
  input: { batchId: string; organizationId: string },
): Promise<MappingBatchLockRow | null> {
  const result = await executor.query<MappingBatchLockRow>(
    [
      "select property_id, status, source_system, file_hash",
      "from import_batches",
      "where id = $1",
      "and organization_id = $2",
      "for update",
    ].join(" "),
    [input.batchId, input.organizationId],
  );

  return result.rows[0] ?? null;
}

async function completeBatchWithEntries(
  executor: PostgresExecutor,
  input: {
    batchId: string;
    organizationId: string;
    propertyId: string;
    entries: GlEntryInsert[];
    errorCount: number;
  },
): Promise<void> {
  await executor.query(
    [
      "update import_batches",
      "set status = 'processing'",
      "where id = $1",
      "and organization_id = $2",
      "and property_id = $3",
    ].join(" "),
    [input.batchId, input.organizationId, input.propertyId],
  );

  if (input.entries.length > 0) {
    await insertGlEntries(executor, input);
  }

  await executor.query(
    [
      "update import_batches",
      "set status = 'completed', row_count = $4, error_count = $5, error_log = '[]'::jsonb",
      "where id = $1",
      "and organization_id = $2",
      "and property_id = $3",
    ].join(" "),
    [
      input.batchId,
      input.organizationId,
      input.propertyId,
      input.entries.length,
      input.errorCount,
    ],
  );
}

async function insertGlEntries(
  executor: PostgresExecutor,
  input: {
    batchId: string;
    propertyId: string;
    entries: GlEntryInsert[];
  },
): Promise<void> {
  for (
    let start = 0;
    start < input.entries.length;
    start += maxRowsPerGlInsert
  ) {
    await insertGlEntryChunk(executor, {
      batchId: input.batchId,
      propertyId: input.propertyId,
      entries: input.entries.slice(start, start + maxRowsPerGlInsert),
    });
  }
}

async function insertGlEntryChunk(
  executor: PostgresExecutor,
  input: {
    batchId: string;
    propertyId: string;
    entries: GlEntryInsert[];
  },
): Promise<void> {
  const values: unknown[] = [];
  const placeholders = input.entries.map((entry, index) => {
    const offset = index * 12;
    values.push(
      input.batchId,
      input.propertyId,
      entry.account_code,
      entry.account_description,
      entry.amount,
      entry.transaction_date,
      entry.period_year,
      entry.period_month,
      entry.vendor_name,
      entry.description,
      JSON.stringify(entry.raw_row_data),
      entry.accrual_date,
    );
    return [
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4},`,
      `$${offset + 5}::numeric, $${offset + 6}::date, $${offset + 7},`,
      `$${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}::jsonb,`,
      `$${offset + 12}::date)`,
    ].join(" ");
  });

  await executor.query(
    [
      "insert into gl_entries",
      "(import_batch_id, property_id, account_code, account_description, amount,",
      "transaction_date, period_year, period_month, vendor_name, description, raw_row_data,",
      "accrual_date)",
      `values ${placeholders.join(", ")}`,
    ].join(" "),
    values,
  );
}

async function lockScopedBatch(
  executor: PostgresExecutor,
  input: { batchId: string; organizationId: string },
): Promise<BatchLockRow | null> {
  const result = await executor.query<BatchLockRow>(
    [
      "select property_id, status",
      "from import_batches",
      "where id = $1",
      "and organization_id = $2",
      "for update",
    ].join(" "),
    [input.batchId, input.organizationId],
  );

  return result.rows[0] ?? null;
}

async function hasFinalizedScopedReconciliation(
  executor: PostgresExecutor,
  input: { batchId: string; propertyId: string; organizationId: string },
): Promise<boolean> {
  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1",
      "from gl_entries",
      "join import_batches on import_batches.id = gl_entries.import_batch_id",
      "join reconciliation_snapshots",
      "on reconciliation_snapshots.property_id = gl_entries.property_id",
      "and reconciliation_snapshots.organization_id = import_batches.organization_id",
      "where gl_entries.import_batch_id = $1",
      "and gl_entries.property_id = $2",
      "and import_batches.property_id = gl_entries.property_id",
      "and import_batches.organization_id = $3",
      "and reconciliation_snapshots.status = 'finalized'",
      ")",
    ].join(" "),
    [input.batchId, input.propertyId, input.organizationId],
  );

  return result.rows[0]?.exists === true;
}

async function deleteScopedGlEntries(
  executor: PostgresExecutor,
  input: { batchId: string; propertyId: string; organizationId: string },
): Promise<number> {
  const result = await executor.query<IdRow>(
    [
      "delete from gl_entries",
      "using import_batches",
      "where gl_entries.import_batch_id = import_batches.id",
      "and gl_entries.import_batch_id = $1",
      "and gl_entries.property_id = $2",
      "and import_batches.property_id = gl_entries.property_id",
      "and import_batches.organization_id = $3",
      "returning gl_entries.id",
    ].join(" "),
    [input.batchId, input.propertyId, input.organizationId],
  );

  return result.rows.length;
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

function serializeOptionalDateTime(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function normalizeColumnMapping(row: ColumnMappingRecord): ColumnMappingRecord {
  return {
    ...row,
    mapping_config: normalizeStringRecord(row.mapping_config),
    created_at: serializeDateTime(row.created_at),
    updated_at: serializeDateTime(row.updated_at),
  };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[0] === "string" && typeof entry[1] === "string",
  );

  return Object.fromEntries(entries);
}

function serializeDateTime(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
