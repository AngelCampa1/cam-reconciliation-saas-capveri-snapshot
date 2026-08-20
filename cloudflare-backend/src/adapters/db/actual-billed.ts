import type {
  ActualBilledInsert,
  ActualBilledRecord,
  ActualBilledRepository,
  DeleteBillingResult,
  LeaseTenantRecord,
  ManualBillingResult,
  ReconciliationRecoveryRecord,
  UpdateBillingMatchesResult,
  UploadBillingResult,
} from "../../domain/actual-billed/repository";
import { lockPropertyFinancialEvidence } from "./financial-evidence-lock";
import {
  normalizeSuiteMatchValue,
  normalizeTenantMatchValue,
} from "./lease-match";
import type { PostgresExecutor } from "./postgres";

type ExistsRow = { exists: boolean };
type IdRow = { id: string };
type LeaseMatchRow = {
  id: string;
  tenantName: string | null;
  unitNumber: string | null;
};
type SummarySnapshotRow = { property_id: string; total_recovery: string };
type SummaryBilledRow = { property_id: string; billed_amount: string };

const billedFields = [
  "id",
  "organization_id",
  "property_id",
  "period_start_date::text as period_start_date",
  "period_end_date::text as period_end_date",
  "tenant_name",
  "billed_amount::text as billed_amount",
  "source_type",
  "lease_id",
  "pool_id",
].join(", ");

export class PostgresActualBilledRepository implements ActualBilledRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async createUploadRows(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    rows: ActualBilledInsert[];
  }): Promise<UploadBillingResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await propertyBelongsToOrganization(executor, input))) {
        return { state: "property_not_found" };
      }

      await lockPropertyFinancialEvidence(executor, input);

      if (await hasFinalizedBillingMutationPeriod(executor, input)) {
        return { state: "period_finalized" };
      }

      if (input.rows.length === 0) {
        return { state: "created", insertedCount: 0, rows: [] };
      }

      const insertResult = await insertActualBilledRows(executor, input);

      return { state: "created", ...insertResult };
    });
  }

  async createManualEntry(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    totalBilled: string;
    poolId: string | null;
  }): Promise<ManualBillingResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await propertyBelongsToOrganization(executor, input))) {
        return { state: "property_not_found" };
      }
      await lockPropertyFinancialEvidence(executor, input);

      if (await hasFinalizedBillingMutationPeriod(executor, input)) {
        return { state: "period_finalized" };
      }
      if (
        input.poolId &&
        !(await poolBelongsToProperty(executor, {
          poolId: input.poolId,
          propertyId: input.propertyId,
        }))
      ) {
        return { state: "pool_not_found" };
      }

      const result = await executor.query<ActualBilledRecord>(
        [
          "insert into actual_billed_amounts",
          "(id, organization_id, property_id, period_start_date, period_end_date,",
          "tenant_name, billed_amount, source_type, pool_id)",
          "values ($1, $2, $3, $4::date, $5::date, $6, $7::numeric, 'manual', $8::uuid)",
          `returning ${billedFields}`,
        ].join(" "),
        [
          crypto.randomUUID(),
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
          "TOTAL (Manual Entry)",
          input.totalBilled,
          input.poolId,
        ],
      );
      const record = result.rows[0];
      if (!record) {
        throw new Error("Actual billed insert did not return a record");
      }

      return { state: "created", record };
    });
  }

  async listBilledAmounts(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<ActualBilledRecord[] | null> {
    if (!(await propertyBelongsToOrganization(this.executor, input))) {
      return null;
    }

    const result = await this.executor.query<ActualBilledRecord>(
      [
        `select ${billedFields}`,
        "from actual_billed_amounts",
        "where organization_id = $1",
        "and property_id = $2",
        "and period_start_date <= $4::date",
        "and period_end_date >= $3::date",
        "order by tenant_name, id",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.periodStart,
        input.periodEnd,
      ],
    );

    return result.rows;
  }

  async deleteBilledAmounts(input: {
    organizationId: string;
    propertyId: string;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<DeleteBillingResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await propertyBelongsToOrganization(executor, input))) {
        return { state: "property_not_found" };
      }

      await lockPropertyFinancialEvidence(executor, input);

      if (await hasFinalizedBillingMutationPeriod(executor, input)) {
        return { state: "period_finalized" };
      }
      if (await hasFinalizedTargetBilledRowsForDelete(executor, input)) {
        return { state: "period_finalized" };
      }

      const params: unknown[] = [input.organizationId, input.propertyId];
      const filters = ["organization_id = $1", "property_id = $2"];
      if (input.periodEnd) {
        params.push(input.periodEnd);
        filters.push(`period_start_date <= $${params.length}::date`);
      }
      if (input.periodStart) {
        params.push(input.periodStart);
        filters.push(`period_end_date >= $${params.length}::date`);
      }

      const result = await executor.query<IdRow>(
        [
          "delete from actual_billed_amounts",
          `where ${filters.join(" and ")}`,
          "returning id",
        ].join(" "),
        params,
      );

      return { state: "deleted", deletedCount: result.rows.length };
    });
  }

  async updateBilledRowMatches(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    matches: Array<{ billedRowId: string; leaseId: string }>;
  }): Promise<UpdateBillingMatchesResult> {
    return this.executor.transaction(async (executor) => {
      if (!(await propertyBelongsToOrganization(executor, input))) {
        return { state: "property_not_found" };
      }

      await lockPropertyFinancialEvidence(executor, input);

      if (await hasFinalizedBillingMutationPeriod(executor, input)) {
        return { state: "period_finalized" };
      }

      if (input.matches.length === 0) {
        return { state: "updated", updatedCount: 0 };
      }

      const matchValues: unknown[] = [];
      const placeholders = input.matches.map((match, index) => {
        const offset = index * 2;
        matchValues.push(match.billedRowId, match.leaseId);

        return `($${offset + 5}::uuid, $${offset + 6}::uuid)`;
      });
      if (
        await hasFinalizedTargetBilledRowsForMatches(executor, input, {
          placeholders,
          matchValues,
        })
      ) {
        return { state: "period_finalized" };
      }

      const validationResult = await executor.query<{ valid_count: string }>(
        [
          "with matches(actual_billed_id, lease_id) as (values",
          placeholders.join(", "),
          ")",
          "select count(*)::text as valid_count",
          "from matches",
          "join actual_billed_amounts aba on aba.id = matches.actual_billed_id",
          "join leases on leases.id = matches.lease_id",
          "where aba.organization_id = $1",
          "and aba.property_id = $2",
          "and aba.period_start_date <= $4::date",
          "and aba.period_end_date >= $3::date",
          "and leases.property_id = $2",
          "and leases.start_date <= $4::date",
          "and leases.end_date >= $3::date",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
          ...matchValues,
        ],
      );
      if (
        Number(validationResult.rows[0]?.valid_count ?? 0) !==
        input.matches.length
      ) {
        return { state: "invalid_match" };
      }

      const updateResult = await executor.query<IdRow>(
        [
          "with matches(actual_billed_id, lease_id) as (values",
          placeholders.join(", "),
          ")",
          "update actual_billed_amounts aba",
          "set lease_id = matches.lease_id",
          "from matches",
          "where aba.id = matches.actual_billed_id",
          "and aba.organization_id = $1",
          "and aba.property_id = $2",
          "and aba.period_start_date <= $4::date",
          "and aba.period_end_date >= $3::date",
          "and exists (",
          "select 1 from leases",
          "where leases.id = matches.lease_id",
          "and leases.property_id = $2",
          "and leases.start_date <= $4::date",
          "and leases.end_date >= $3::date",
          ")",
          "returning aba.id",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
          ...matchValues,
        ],
      );

      return { state: "updated", updatedCount: updateResult.rows.length };
    });
  }

  async loadLeakageDataset(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    includeDrafts: boolean;
  }) {
    if (!(await propertyBelongsToOrganization(this.executor, input))) {
      return {
        propertyExists: false,
        snapshots: [],
        hasImportBatches: false,
        billedRows: [],
        leases: [],
      };
    }

    const statuses = input.includeDrafts
      ? ["finalized", "draft"]
      : ["finalized"];
    const snapshotsResult =
      await this.executor.query<ReconciliationRecoveryRecord>(
        [
          "select lease_id, total_recovery::text as total_recovery",
          "from reconciliation_snapshots",
          "where organization_id = $1",
          "and property_id = $2",
          "and period_start_date <= $4::date",
          "and period_end_date >= $3::date",
          "and status = any($5::text[])",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
          statuses,
        ],
      );
    const hasImportBatches =
      (
        await this.executor.query<ExistsRow>(
          [
            "select exists (",
            "select 1 from import_batches",
            "where organization_id = $1",
            "and property_id = $2",
            ")",
          ].join(" "),
          [input.organizationId, input.propertyId],
        )
      ).rows[0]?.exists === true;
    const billedResult = await this.executor.query<{
      tenant_name: string | null;
      billed_amount: string;
    }>(
      [
        "select tenant_name, billed_amount::text as billed_amount",
        "from actual_billed_amounts",
        "where organization_id = $1",
        "and property_id = $2",
        "and period_start_date <= $4::date",
        "and period_end_date >= $3::date",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.periodStart,
        input.periodEnd,
      ],
    );
    const leaseIds = [
      ...new Set(
        snapshotsResult.rows
          .map((snapshot) => snapshot.lease_id)
          .filter((leaseId): leaseId is string => typeof leaseId === "string"),
      ),
    ];
    const leases =
      leaseIds.length === 0
        ? []
        : (
            await this.executor.query<LeaseTenantRecord>(
              [
                "select id, tenant_name",
                "from leases",
                "where property_id = $1",
                "and id = any($2::uuid[])",
              ].join(" "),
              [input.propertyId, leaseIds],
            )
          ).rows;

    return {
      propertyExists: true,
      snapshots: snapshotsResult.rows,
      hasImportBatches,
      billedRows: billedResult.rows,
      leases,
    };
  }

  async loadBillingExposureDataset(input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  }) {
    if (!(await propertyBelongsToOrganization(this.executor, input))) {
      return {
        propertyExists: false,
        snapshots: [],
        billedRows: [],
      };
    }

    const [snapshotsResult, billedResult] = await Promise.all([
      this.executor.query<ReconciliationRecoveryRecord>(
        [
          "select lease_id, total_recovery::text as total_recovery",
          "from reconciliation_snapshots",
          "where organization_id = $1",
          "and property_id = $2",
          "and period_start_date = $3::date",
          "and period_end_date = $4::date",
          "and status = 'finalized'",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
        ],
      ),
      this.executor.query<{ billed_amount: string }>(
        [
          "select billed_amount::text as billed_amount",
          "from actual_billed_amounts",
          "where organization_id = $1",
          "and property_id = $2",
          "and period_start_date = $3::date",
          "and period_end_date = $4::date",
        ].join(" "),
        [
          input.organizationId,
          input.propertyId,
          input.periodStart,
          input.periodEnd,
        ],
      ),
    ]);

    return {
      propertyExists: true,
      snapshots: snapshotsResult.rows,
      billedRows: billedResult.rows,
    };
  }

  async loadLeakageSummaryDataset(organizationId: string) {
    const propertiesResult = await this.executor.query<IdRow>(
      "select id from properties where organization_id = $1",
      [organizationId],
    );
    const propertyIds = propertiesResult.rows.map((row) => row.id);
    if (propertyIds.length === 0) {
      return {
        propertyIds: [],
        finalizedSnapshots: [],
        draftSnapshots: [],
        billedRows: [],
      };
    }

    const [finalizedSnapshots, draftSnapshots, billedRows] = await Promise.all([
      this.executor.query<SummarySnapshotRow>(
        [
          "select property_id, total_recovery::text as total_recovery",
          "from reconciliation_snapshots",
          "where organization_id = $1",
          "and property_id = any($2::uuid[])",
          "and status = 'finalized'",
        ].join(" "),
        [organizationId, propertyIds],
      ),
      this.executor.query<SummarySnapshotRow>(
        [
          "select property_id, total_recovery::text as total_recovery",
          "from reconciliation_snapshots",
          "where organization_id = $1",
          "and property_id = any($2::uuid[])",
          "and status = 'draft'",
        ].join(" "),
        [organizationId, propertyIds],
      ),
      this.executor.query<SummaryBilledRow>(
        [
          "select property_id, billed_amount::text as billed_amount",
          "from actual_billed_amounts",
          "where organization_id = $1",
          "and property_id = any($2::uuid[])",
        ].join(" "),
        [organizationId, propertyIds],
      ),
    ]);

    return {
      propertyIds,
      finalizedSnapshots: finalizedSnapshots.rows,
      draftSnapshots: draftSnapshots.rows,
      billedRows: billedRows.rows,
    };
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

async function poolBelongsToProperty(
  executor: PostgresExecutor,
  input: { poolId: string; propertyId: string },
): Promise<boolean> {
  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1 from expense_pools",
      "where id = $1",
      "and property_id = $2",
      ")",
    ].join(" "),
    [input.poolId, input.propertyId],
  );

  return result.rows[0]?.exists === true;
}

async function hasFinalizedBillingMutationPeriod(
  executor: PostgresExecutor,
  input: {
    organizationId: string;
    propertyId: string;
    periodStart?: string;
    periodEnd?: string;
  },
): Promise<boolean> {
  const params: unknown[] = [input.organizationId, input.propertyId];
  const filters = [
    "organization_id = $1",
    "property_id = $2",
    "status = 'finalized'",
  ];

  if (input.periodEnd) {
    params.push(input.periodEnd);
    filters.push(`period_start_date <= $${params.length}::date`);
  }
  if (input.periodStart) {
    params.push(input.periodStart);
    filters.push(`period_end_date >= $${params.length}::date`);
  }

  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1 from reconciliation_snapshots",
      `where ${filters.join(" and ")}`,
      ")",
    ].join(" "),
    params,
  );

  return result.rows[0]?.exists === true;
}

async function hasFinalizedTargetBilledRowsForDelete(
  executor: PostgresExecutor,
  input: {
    organizationId: string;
    propertyId: string;
    periodStart?: string;
    periodEnd?: string;
  },
): Promise<boolean> {
  const params: unknown[] = [input.organizationId, input.propertyId];
  const filters = ["aba.organization_id = $1", "aba.property_id = $2"];

  if (input.periodEnd) {
    params.push(input.periodEnd);
    filters.push(`aba.period_start_date <= $${params.length}::date`);
  }
  if (input.periodStart) {
    params.push(input.periodStart);
    filters.push(`aba.period_end_date >= $${params.length}::date`);
  }

  const result = await executor.query<ExistsRow>(
    [
      "select exists (",
      "select 1 from actual_billed_amounts aba",
      "join reconciliation_snapshots finalized_snapshots",
      "on finalized_snapshots.organization_id = aba.organization_id",
      "and finalized_snapshots.property_id = aba.property_id",
      "and finalized_snapshots.status = 'finalized'",
      "and finalized_snapshots.period_start_date <= aba.period_end_date",
      "and finalized_snapshots.period_end_date >= aba.period_start_date",
      `where ${filters.join(" and ")}`,
      ")",
    ].join(" "),
    params,
  );

  return result.rows[0]?.exists === true;
}

async function hasFinalizedTargetBilledRowsForMatches(
  executor: PostgresExecutor,
  input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
  },
  matches: {
    placeholders: string[];
    matchValues: unknown[];
  },
): Promise<boolean> {
  const result = await executor.query<ExistsRow>(
    [
      "with matches(actual_billed_id, lease_id) as (values",
      matches.placeholders.join(", "),
      ")",
      "select exists (",
      "select 1 from matches",
      "join actual_billed_amounts aba on aba.id = matches.actual_billed_id",
      "join reconciliation_snapshots finalized_snapshots",
      "on finalized_snapshots.organization_id = aba.organization_id",
      "and finalized_snapshots.property_id = aba.property_id",
      "and finalized_snapshots.status = 'finalized'",
      "and finalized_snapshots.period_start_date <= aba.period_end_date",
      "and finalized_snapshots.period_end_date >= aba.period_start_date",
      "where aba.organization_id = $1",
      "and aba.property_id = $2",
      "and aba.period_start_date <= $4::date",
      "and aba.period_end_date >= $3::date",
      ")",
    ].join(" "),
    [
      input.organizationId,
      input.propertyId,
      input.periodStart,
      input.periodEnd,
      ...matches.matchValues,
    ],
  );

  return result.rows[0]?.exists === true;
}

async function insertActualBilledRows(
  executor: PostgresExecutor,
  input: {
    organizationId: string;
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    rows: ActualBilledInsert[];
  },
): Promise<{
  insertedCount: number;
  rows: Array<{
    id: string;
    tenantName: string;
    billedAmount: string;
    suite: string | null;
    leaseId: string | null;
  }>;
}> {
  const leaseIds = await resolveLeaseIdsForRows(executor, input);
  const values: unknown[] = [];
  const placeholders = input.rows.map((row, index) => {
    const offset = index * 10;
    values.push(
      crypto.randomUUID(),
      input.organizationId,
      input.propertyId,
      input.periodStart,
      input.periodEnd,
      leaseIds[index] ?? null,
      row.tenantName,
      row.billedAmount,
      row.sourceType,
      row.poolId,
    );

    return [
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::date,`,
      `$${offset + 5}::date, $${offset + 6}::uuid, $${offset + 7},`,
      `$${offset + 8}::numeric, $${offset + 9}, $${offset + 10}::uuid)`,
    ].join(" ");
  });
  const result = await executor.query<IdRow>(
    [
      "insert into actual_billed_amounts",
      "(id, organization_id, property_id, period_start_date, period_end_date,",
      "lease_id, tenant_name, billed_amount, source_type, pool_id)",
      `values ${placeholders.join(", ")}`,
      "returning id",
    ].join(" "),
    values,
  );

  return {
    insertedCount: result.rows.length,
    rows: input.rows.map((row, index) => ({
      id: result.rows[index]?.id ?? "",
      tenantName: row.tenantName,
      billedAmount: row.billedAmount,
      suite: row.suite,
      leaseId: leaseIds[index] ?? null,
    })),
  };
}

async function resolveLeaseIdsForRows(
  executor: PostgresExecutor,
  input: {
    propertyId: string;
    periodStart: string;
    periodEnd: string;
    rows: ActualBilledInsert[];
  },
): Promise<Array<string | null>> {
  const result = await executor.query<LeaseMatchRow>(
    [
      'select leases.id, leases.tenant_name as "tenantName",',
      'units.unit_number as "unitNumber"',
      "from leases",
      "left join units on units.id = leases.unit_id",
      "where leases.property_id = $1",
      "and leases.status = 'active'",
      "and leases.start_date <= $3::date",
      "and leases.end_date >= $2::date",
    ].join(" "),
    [input.propertyId, input.periodStart, input.periodEnd],
  );
  const tenantIndex = uniqueLeaseIndex(result.rows, (row) =>
    normalizeTenantMatchValue(row.tenantName),
  );
  const unitIndex = uniqueLeaseIndex(result.rows, (row) =>
    normalizeSuiteMatchValue(row.unitNumber),
  );
  const tenantAndUnitIndex = uniqueLeaseIndex(result.rows, (row) => {
    const tenant = normalizeTenantMatchValue(row.tenantName);
    const unit = normalizeSuiteMatchValue(row.unitNumber);

    return tenant && unit ? `${tenant}\u0000${unit}` : null;
  });

  return input.rows.map((row) => {
    const tenant = normalizeTenantMatchValue(row.tenantName);
    const suite = normalizeSuiteMatchValue(row.suite);
    if (tenant && suite) {
      const match = tenantAndUnitIndex.get(`${tenant}\u0000${suite}`);
      return match ?? null;
    }
    if (suite) {
      const match = unitIndex.get(suite);
      if (match) {
        return match;
      }
    }
    if (tenant) {
      return tenantIndex.get(tenant) ?? null;
    }

    return null;
  });
}

function uniqueLeaseIndex(
  rows: LeaseMatchRow[],
  keyForRow: (row: LeaseMatchRow) => string | null,
): Map<string, string> {
  const index = new Map<string, string>();
  const duplicateKeys = new Set<string>();
  for (const row of rows) {
    const key = keyForRow(row);
    if (!key) {
      continue;
    }
    if (index.has(key)) {
      duplicateKeys.add(key);
      index.delete(key);
      continue;
    }
    if (!duplicateKeys.has(key)) {
      index.set(key, row.id);
    }
  }

  return index;
}
