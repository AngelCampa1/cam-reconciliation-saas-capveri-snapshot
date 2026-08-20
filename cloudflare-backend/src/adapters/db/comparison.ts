import Decimal from "decimal.js";
import {
  buildComparisonResult,
  type ComparisonResult,
  type ComparisonSource,
  type ExplicitCharge,
  matchStatusForLeaseKey,
  type StoredComparisonRun,
  type StoredComparisonRunSummary,
  type TenantVariance,
} from "../../domain/comparison/model";
import type {
  ComparisonRepository,
  ComparisonRunInput,
  ExplicitComparisonInput,
  GetComparisonRunInput,
  ListComparisonRunsInput,
  PersistComparisonRunInput,
  SaveComparisonRunInput,
} from "../../domain/comparison/repository";
import { normalizeTenantMatchValue } from "./lease-match";
import type { PostgresExecutor } from "./postgres";

type PropertyExistsRow = { id: string };
type SnapshotRow = {
  leaseId: string | null;
  totalRecovery: string | number | null;
  poolBreakdowns: unknown;
};
type LeaseRow = { id: string; tenantName: string | null };
type BilledRow = {
  id: string | null;
  leaseId: string | null;
  tenantName: string | null;
  billedAmount: string | number | null;
  poolId: string | null;
};
type PoolRow = { id: string; name: string | null };
type RunRow = {
  id: string;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  tolerance: string | number;
  source: ComparisonSource;
  totalCapveriCorrect: string | number;
  totalActualCharged: string | number;
  totalNetVariance: string | number;
  totalOvercharge: string | number;
  totalUndercharge: string | number;
  overchargeCount: string | number;
  underchargeCount: string | number;
  matchCount: string | number;
  createdBy: string | null;
  createdAt: string | Date;
};
type FindingRow = {
  leaseId: string;
  tenantName: string | null;
  capveriCorrect: string | number;
  actualCharged: string | number;
  variance: string | number;
  absVariance: string | number;
  direction: "overcharge" | "undercharge" | "match";
  variancePct: string | number | null;
  poolBreakdowns: unknown;
};

export class PostgresComparisonRepository implements ComparisonRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async compareActualBilled(
    input: ComparisonRunInput,
  ): Promise<ComparisonResult> {
    const dataset = await this.loadComparisonDataset(input);
    if (!dataset.propertyExists) {
      return emptyComparison(input);
    }

    const chargedRows = await this.loadChargedRows(input);

    return this.buildLoadedComparison({
      input,
      correctByLease: dataset.correctByLease,
      tenantNames: dataset.tenantNames,
      correctPoolsByLease: dataset.correctPoolsByLease,
      ...chargedRows,
    });
  }

  async compareExplicit(
    input: ExplicitComparisonInput,
  ): Promise<ComparisonResult> {
    const dataset = await this.loadComparisonDataset(input);
    if (!dataset.propertyExists) {
      return emptyComparison(input);
    }
    const chargedRows = normalizeExplicitCharges(input.charges);

    return this.buildLoadedComparison({
      input,
      correctByLease: dataset.correctByLease,
      tenantNames: dataset.tenantNames,
      correctPoolsByLease: dataset.correctPoolsByLease,
      ...chargedRows,
    });
  }

  async createRun(
    input: PersistComparisonRunInput,
  ): Promise<StoredComparisonRun> {
    const result =
      input.charges === undefined || input.charges === null
        ? await this.compareActualBilled(input)
        : await this.compareExplicit({ ...input, charges: input.charges });
    const source: ComparisonSource =
      input.charges === undefined || input.charges === null
        ? "actual_billed"
        : "explicit";
    const run = await this.saveRun({
      organizationId: input.organizationId,
      userId: input.userId,
      source,
      result,
    });

    return run;
  }

  async listRuns(
    input: ListComparisonRunsInput,
  ): Promise<StoredComparisonRunSummary[]> {
    const result = await this.executor.query<RunRow>(
      [
        runSelectColumns(),
        "from comparison_runs",
        "where organization_id = $1",
        "and property_id = $2",
        "order by created_at desc",
        "limit $3 offset $4",
      ].join(" "),
      [input.organizationId, input.propertyId, input.limit, input.offset],
    );

    return result.rows.map(toRunSummary);
  }

  async getRun(
    input: GetComparisonRunInput,
  ): Promise<StoredComparisonRun | null> {
    const runResult = await this.executor.query<RunRow>(
      [
        runSelectColumns(),
        "from comparison_runs",
        "where organization_id = $1",
        "and id = $2",
        "limit 1",
      ].join(" "),
      [input.organizationId, input.runId],
    );
    const run = runResult.rows[0];
    if (!run) {
      return null;
    }

    const findings = await this.listFindings(input.organizationId, input.runId);

    return { ...toRunSummary(run), findings };
  }

  private async saveRun(
    input: SaveComparisonRunInput,
  ): Promise<StoredComparisonRun> {
    return this.executor.transaction(async (transaction) => {
      const runResult = await transaction.query<{ id: string }>(
        [
          "insert into comparison_runs (",
          "organization_id, property_id, period_start_date, period_end_date,",
          "tolerance, source, total_capveri_correct, total_actual_charged,",
          "total_net_variance, total_overcharge, total_undercharge,",
          "overcharge_count, undercharge_count, match_count, created_by",
          ") values (",
          "$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15",
          ") returning id",
        ].join(" "),
        [
          input.organizationId,
          input.result.property_id,
          input.result.period_start,
          input.result.period_end,
          input.result.tolerance,
          input.source,
          input.result.total_capveri_correct,
          input.result.total_actual_charged,
          input.result.total_net_variance,
          input.result.total_overcharge,
          input.result.total_undercharge,
          input.result.overcharge_count,
          input.result.undercharge_count,
          input.result.match_count,
          input.userId,
        ],
      );
      const runId = runResult.rows[0]?.id;
      if (!runId) {
        throw new Error("Failed to insert comparison run header");
      }

      for (const tenant of input.result.tenants) {
        await transaction.query(
          [
            "insert into comparison_findings (",
            "comparison_run_id, organization_id, lease_id, tenant_name,",
            "capveri_correct, actual_charged, variance, abs_variance,",
            "direction, variance_pct, pool_breakdowns",
            ") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)",
          ].join(" "),
          [
            runId,
            input.organizationId,
            tenant.lease_id,
            tenant.tenant_name,
            tenant.capveri_correct,
            tenant.actual_charged,
            tenant.variance,
            tenant.abs_variance,
            tenant.direction,
            tenant.variance_pct,
            tenant.pool_breakdowns === null
              ? null
              : JSON.stringify(tenant.pool_breakdowns),
          ],
        );
      }

      const stored = await this.getRunWithExecutor(
        transaction,
        input.organizationId,
        runId,
      );
      if (!stored) {
        throw new Error("Comparison run was saved but could not be read back");
      }

      return stored;
    });
  }

  private async getRunWithExecutor(
    executor: PostgresExecutor,
    organizationId: string,
    runId: string,
  ): Promise<StoredComparisonRun | null> {
    const runResult = await executor.query<RunRow>(
      [
        runSelectColumns(),
        "from comparison_runs",
        "where organization_id = $1",
        "and id = $2",
        "limit 1",
      ].join(" "),
      [organizationId, runId],
    );
    const run = runResult.rows[0];
    if (!run) {
      return null;
    }

    const findings = await this.listFindings(organizationId, runId, executor);

    return { ...toRunSummary(run), findings };
  }

  private async listFindings(
    organizationId: string,
    runId: string,
    executor: PostgresExecutor = this.executor,
  ): Promise<TenantVariance[]> {
    const result = await executor.query<FindingRow>(
      [
        'select lease_id as "leaseId", tenant_name as "tenantName",',
        'capveri_correct::text as "capveriCorrect",',
        'actual_charged::text as "actualCharged", variance::text as "variance",',
        'abs_variance::text as "absVariance", direction,',
        'variance_pct::text as "variancePct", pool_breakdowns as "poolBreakdowns"',
        "from comparison_findings",
        "where organization_id = $1",
        "and comparison_run_id = $2",
      ].join(" "),
      [organizationId, runId],
    );

    return result.rows.map(toTenantVariance).sort(compareTenantVariance);
  }

  private async loadComparisonDataset(input: ComparisonRunInput): Promise<{
    propertyExists: boolean;
    correctByLease: Map<string, Decimal>;
    tenantNames: Map<string, string>;
    correctPoolsByLease: Map<string, Map<string, Decimal>>;
  }> {
    const propertyResult = await this.executor.query<PropertyExistsRow>(
      [
        "select id",
        "from properties",
        "where id = $1",
        "and organization_id = $2",
        "limit 1",
      ].join(" "),
      [input.propertyId, input.organizationId],
    );
    if (propertyResult.rows.length === 0) {
      return {
        propertyExists: false,
        correctByLease: new Map(),
        tenantNames: new Map(),
        correctPoolsByLease: new Map(),
      };
    }

    const correctData = await this.loadCorrectByLease(input);

    return { propertyExists: true, ...correctData };
  }

  private async loadCorrectByLease(input: ComparisonRunInput): Promise<{
    correctByLease: Map<string, Decimal>;
    tenantNames: Map<string, string>;
    correctPoolsByLease: Map<string, Map<string, Decimal>>;
  }> {
    const params: unknown[] = [
      input.organizationId,
      input.propertyId,
      input.periodEnd,
      input.periodStart,
    ];
    const statusClause = input.includeDrafts
      ? "and status in ('finalized', 'draft')"
      : "and status = 'finalized'";
    const snapshots = await this.executor.query<SnapshotRow>(
      [
        'select lease_id as "leaseId", total_recovery::text as "totalRecovery",',
        'pool_breakdowns as "poolBreakdowns"',
        "from reconciliation_snapshots",
        "where organization_id = $1",
        "and property_id = $2",
        "and period_start_date <= $3",
        "and period_end_date >= $4",
        statusClause,
      ].join(" "),
      params,
    );
    const correctByLease = new Map<string, Decimal>();
    const correctPoolsByLease = new Map<string, Map<string, Decimal>>();
    const leaseIds: string[] = [];

    for (const snapshot of snapshots.rows) {
      if (!snapshot.leaseId) {
        continue;
      }
      leaseIds.push(snapshot.leaseId);
      addToMap(
        correctByLease,
        snapshot.leaseId,
        decimalOrZero(snapshot.totalRecovery),
      );
      const pools = extractCorrectPools(snapshot.poolBreakdowns);
      if (pools.size > 0) {
        const existing = correctPoolsByLease.get(snapshot.leaseId) ?? new Map();
        for (const [poolName, amount] of pools) {
          addToMap(existing, poolName, amount);
        }
        correctPoolsByLease.set(snapshot.leaseId, existing);
      }
    }

    const tenantNames = await this.loadTenantNames(input.propertyId, leaseIds);

    return { correctByLease, tenantNames, correctPoolsByLease };
  }

  private async loadTenantNames(
    propertyId: string,
    leaseIds: string[],
  ): Promise<Map<string, string>> {
    if (leaseIds.length === 0) {
      return new Map();
    }
    const result = await this.executor.query<LeaseRow>(
      [
        'select id, tenant_name as "tenantName"',
        "from leases",
        "where property_id = $1",
        "and id = any($2::uuid[])",
      ].join(" "),
      [propertyId, [...new Set(leaseIds)]],
    );

    return new Map(
      result.rows
        .filter((row) => row.tenantName !== null)
        .map((row) => [row.id, row.tenantName as string]),
    );
  }

  private async loadChargedRows(input: ComparisonRunInput): Promise<{
    chargedByLease: Map<string, Decimal>;
    chargedByName: Map<string, Decimal>;
    unidentifiedRows: Array<[string, Decimal]>;
    chargedPoolsByLease: Map<string, Map<string, Decimal>>;
    chargedPoolsByName: Map<string, Map<string, Decimal>>;
    chargedLeaseNames: Map<string, string>;
  }> {
    const result = await this.executor.query<BilledRow>(
      [
        'select actual_billed_amounts.id, leases.id as "leaseId",',
        'actual_billed_amounts.tenant_name as "tenantName",',
        'actual_billed_amounts.billed_amount::text as "billedAmount",',
        'actual_billed_amounts.pool_id as "poolId"',
        "from actual_billed_amounts",
        "left join leases",
        "on leases.id = actual_billed_amounts.lease_id",
        "and leases.property_id = actual_billed_amounts.property_id",
        "where organization_id = $1",
        "and actual_billed_amounts.property_id = $2",
        "and actual_billed_amounts.period_start_date <= $3",
        "and actual_billed_amounts.period_end_date >= $4",
      ].join(" "),
      [
        input.organizationId,
        input.propertyId,
        input.periodEnd,
        input.periodStart,
      ],
    );
    const chargedByLease = new Map<string, Decimal>();
    const chargedByName = new Map<string, Decimal>();
    const chargedPoolsByLease = new Map<string, Map<string, Decimal>>();
    const chargedPoolsByName = new Map<string, Map<string, Decimal>>();
    const chargedLeaseNames = new Map<string, string>();
    const unidentifiedRows: Array<[string, Decimal]> = [];

    for (const record of result.rows) {
      const amount = decimalOrZero(record.billedAmount);
      const name = record.tenantName?.trim() ?? "";
      if (record.leaseId) {
        addToMap(chargedByLease, record.leaseId, amount);
        if (name && !chargedLeaseNames.has(record.leaseId)) {
          chargedLeaseNames.set(record.leaseId, name);
        }
        if (record.poolId) {
          const pools = chargedPoolsByLease.get(record.leaseId) ?? new Map();
          addToMap(pools, record.poolId, amount);
          chargedPoolsByLease.set(record.leaseId, pools);
        }
        continue;
      }
      if (name) {
        addToMap(chargedByName, name, amount);
        if (record.poolId) {
          const pools = chargedPoolsByName.get(name) ?? new Map();
          addToMap(pools, record.poolId, amount);
          chargedPoolsByName.set(name, pools);
        }
      } else if (record.id) {
        unidentifiedRows.push([record.id, amount]);
      }
    }

    return {
      chargedByLease,
      chargedByName,
      unidentifiedRows,
      chargedPoolsByLease,
      chargedPoolsByName,
      chargedLeaseNames,
    };
  }

  private async buildLoadedComparison(input: {
    input: ComparisonRunInput;
    correctByLease: Map<string, Decimal>;
    tenantNames: Map<string, string>;
    correctPoolsByLease: Map<string, Map<string, Decimal>>;
    chargedByLease: Map<string, Decimal>;
    chargedByName: Map<string, Decimal>;
    unidentifiedRows: Array<[string, Decimal]>;
    chargedPoolsByLease: Map<string, Map<string, Decimal>>;
    chargedPoolsByName: Map<string, Map<string, Decimal>>;
    chargedLeaseNames: Map<string, string>;
  }): Promise<ComparisonResult> {
    const { correctForCompare, chargedByLease, names } = rekeyChargedToLeases({
      correctByLease: input.correctByLease,
      tenantNames: input.tenantNames,
      directChargedByLease: input.chargedByLease,
      chargedByName: input.chargedByName,
      unidentifiedRows: input.unidentifiedRows,
      chargedLeaseNames: input.chargedLeaseNames,
    });
    const chargedPoolsByLease = rekeyChargedPoolsToLeases({
      tenantNames: input.tenantNames,
      chargedByName: input.chargedByName,
      directChargedPoolsByLease: input.chargedPoolsByLease,
      chargedPoolsByName: input.chargedPoolsByName,
    });
    let correctByPool: Map<string, Map<string, Decimal>> | undefined;
    let chargedByPool: Map<string, Map<string, Decimal>> | undefined;
    let poolNames: Map<string, string> | undefined;
    if (input.correctPoolsByLease.size > 0 && chargedPoolsByLease.size > 0) {
      const poolIdToName = await this.loadPoolNames(input.input.propertyId);
      const dimension = buildPoolDimension(
        input.correctPoolsByLease,
        chargedPoolsByLease,
        poolIdToName,
      );
      if (dimension) {
        correctByPool = dimension.correctByPool;
        chargedByPool = dimension.chargedByPool;
        poolNames = dimension.poolNames;
      }
    }

    return buildComparisonResult({
      correctByLease: correctForCompare,
      chargedByLease,
      propertyId: input.input.propertyId,
      periodStart: input.input.periodStart,
      periodEnd: input.input.periodEnd,
      tolerance: new Decimal(input.input.tolerance),
      tenantNames: names,
      ...(correctByPool ? { correctByLeaseAndPool: correctByPool } : {}),
      ...(chargedByPool ? { chargedByLeaseAndPool: chargedByPool } : {}),
      ...(poolNames ? { poolNames } : {}),
    });
  }

  private async loadPoolNames(
    propertyId: string,
  ): Promise<Map<string, string>> {
    const result = await this.executor.query<PoolRow>(
      ["select id, name from expense_pools where property_id = $1"].join(" "),
      [propertyId],
    );

    return new Map(
      result.rows
        .filter((row) => row.name !== null && row.name.trim().length > 0)
        .map((row) => [row.id, row.name as string]),
    );
  }
}

function normalizeExplicitCharges(charges: ExplicitCharge[]): {
  chargedByLease: Map<string, Decimal>;
  chargedByName: Map<string, Decimal>;
  unidentifiedRows: Array<[string, Decimal]>;
  chargedPoolsByLease: Map<string, Map<string, Decimal>>;
  chargedPoolsByName: Map<string, Map<string, Decimal>>;
  chargedLeaseNames: Map<string, string>;
} {
  const chargedByLease = new Map<string, Decimal>();
  const chargedByName = new Map<string, Decimal>();
  const chargedPoolsByLease = new Map<string, Map<string, Decimal>>();
  const chargedPoolsByName = new Map<string, Map<string, Decimal>>();
  const chargedLeaseNames = new Map<string, string>();
  const unidentifiedRows: Array<[string, Decimal]> = [];

  charges.forEach((charge, index) => {
    const amount = new Decimal(charge.amount);
    const leaseId = charge.lease_id?.trim() ?? "";
    const name = charge.tenant_name?.trim() ?? "";
    const poolId = charge.pool_id?.trim() ?? "";

    if (leaseId) {
      addToMap(chargedByLease, leaseId, amount);
      if (name) {
        chargedLeaseNames.set(leaseId, name);
      }
      if (poolId) {
        const pools = chargedPoolsByLease.get(leaseId) ?? new Map();
        addToMap(pools, poolId, amount);
        chargedPoolsByLease.set(leaseId, pools);
      }
      return;
    }

    if (name) {
      addToMap(chargedByName, name, amount);
      if (poolId) {
        const pools = chargedPoolsByName.get(name) ?? new Map();
        addToMap(pools, poolId, amount);
        chargedPoolsByName.set(name, pools);
      }
      return;
    }
    unidentifiedRows.push([`explicit::${index}`, amount]);
  });

  return {
    chargedByLease,
    chargedByName,
    unidentifiedRows,
    chargedPoolsByLease,
    chargedPoolsByName,
    chargedLeaseNames,
  };
}

function rekeyChargedToLeases(input: {
  correctByLease: Map<string, Decimal>;
  tenantNames: Map<string, string>;
  directChargedByLease: Map<string, Decimal>;
  chargedByName: Map<string, Decimal>;
  unidentifiedRows: Array<[string, Decimal]>;
  chargedLeaseNames: Map<string, string>;
}): {
  correctForCompare: Map<string, Decimal>;
  chargedByLease: Map<string, Decimal>;
  names: Map<string, string>;
} {
  const normalizedCharged = normalizeChargedNames(input.chargedByName);
  const allNameToLeases = new Map<string, string[]>();
  const normalizedNameLabels = new Map<string, string>();
  for (const [leaseId, name] of input.tenantNames) {
    const normalized = normalizeTenantMatchValue(name);
    if (!normalized) {
      continue;
    }
    allNameToLeases.set(normalized, [
      ...(allNameToLeases.get(normalized) ?? []),
      leaseId,
    ]);
    if (!normalizedNameLabels.has(normalized)) {
      normalizedNameLabels.set(normalized, name);
    }
  }
  const fallbackNameToLeases = new Map<string, string[]>();
  for (const [name, leaseIds] of allNameToLeases) {
    fallbackNameToLeases.set(
      name,
      leaseIds.length > 1
        ? leaseIds.filter((leaseId) => !input.directChargedByLease.has(leaseId))
        : leaseIds,
    );
  }

  const combinedNames = new Set(
    [...fallbackNameToLeases.entries()]
      .filter(
        ([name, leaseIds]) =>
          leaseIds.length > 1 && normalizedCharged.amounts.has(name),
      )
      .map(([name]) => name),
  );
  const combinedLeases = new Set(
    [...combinedNames].flatMap((name) => fallbackNameToLeases.get(name) ?? []),
  );
  const chargedByLease = new Map<string, Decimal>();
  const syntheticNames = new Map<string, string>();
  const syntheticCorrect = new Map<string, Decimal>();

  for (const name of combinedNames) {
    const label = displayNameForNormalizedName(
      name,
      normalizedCharged.labels,
      normalizedNameLabels,
    );
    const key = `ambiguous-name::${label}`;
    syntheticNames.set(key, label);
    const total = (fallbackNameToLeases.get(name) ?? []).reduce(
      (sum, leaseId) => sum.plus(input.correctByLease.get(leaseId) ?? 0),
      new Decimal(0),
    );
    syntheticCorrect.set(key, total);
  }

  const correctForCompare = new Map(
    [...input.correctByLease.entries()].filter(
      ([leaseId]) => !combinedLeases.has(leaseId),
    ),
  );
  for (const [key, amount] of syntheticCorrect) {
    correctForCompare.set(key, amount);
  }

  for (const [leaseId, amount] of input.directChargedByLease) {
    if (input.tenantNames.has(leaseId)) {
      addToMap(chargedByLease, leaseId, amount);
      continue;
    }

    const key = `unmatched-lease::${leaseId}`;
    syntheticNames.set(
      key,
      input.chargedLeaseNames.get(leaseId) ?? "Unknown lease",
    );
    addToMap(chargedByLease, key, amount);
  }

  for (const [name, amount] of input.chargedByName) {
    const normalizedName = normalizeTenantMatchValue(name);
    const leaseIds = normalizedName
      ? (fallbackNameToLeases.get(normalizedName) ?? [])
      : [];
    let key: string;
    if (normalizedName && combinedNames.has(normalizedName)) {
      key = `ambiguous-name::${displayNameForNormalizedName(
        normalizedName,
        normalizedCharged.labels,
        normalizedNameLabels,
      )}`;
    } else if (leaseIds.length === 1 && leaseIds[0]) {
      key = leaseIds[0];
    } else {
      key = `unmatched-name::${name}`;
      syntheticNames.set(key, name);
    }
    addToMap(chargedByLease, key, amount);
  }

  for (const [rowId, amount] of input.unidentifiedRows) {
    const key = `id::${rowId}`;
    syntheticNames.set(key, "Unidentified charge");
    addToMap(chargedByLease, key, amount);
  }

  return {
    correctForCompare,
    chargedByLease,
    names: new Map([
      ...input.tenantNames.entries(),
      ...input.chargedLeaseNames.entries(),
      ...syntheticNames.entries(),
    ]),
  };
}

function rekeyChargedPoolsToLeases(input: {
  tenantNames: Map<string, string>;
  chargedByName: Map<string, Decimal>;
  directChargedPoolsByLease: Map<string, Map<string, Decimal>>;
  chargedPoolsByName: Map<string, Map<string, Decimal>>;
}): Map<string, Map<string, Decimal>> {
  const normalizedCharged = normalizeChargedNames(input.chargedByName);
  const nameToLeases = new Map<string, string[]>();
  for (const [leaseId, name] of input.tenantNames) {
    const normalized = normalizeTenantMatchValue(name);
    if (!normalized) {
      continue;
    }
    nameToLeases.set(normalized, [
      ...(nameToLeases.get(normalized) ?? []),
      leaseId,
    ]);
  }
  const combinedNames = new Set(
    [...nameToLeases.entries()]
      .filter(
        ([name, leaseIds]) =>
          leaseIds.length > 1 && normalizedCharged.amounts.has(name),
      )
      .map(([name]) => name),
  );
  const chargedPoolsByLease = new Map(
    [...input.directChargedPoolsByLease.entries()].map(([leaseId, pools]) => [
      leaseId,
      new Map(pools),
    ]),
  );

  for (const [name, pools] of input.chargedPoolsByName) {
    const normalizedName = normalizeTenantMatchValue(name);
    const leaseIds = normalizedName
      ? (nameToLeases.get(normalizedName) ?? [])
      : [];
    if (
      !normalizedName ||
      combinedNames.has(normalizedName) ||
      leaseIds.length !== 1 ||
      !leaseIds[0]
    ) {
      continue;
    }
    chargedPoolsByLease.set(leaseIds[0], new Map(pools));
  }

  return chargedPoolsByLease;
}

function normalizeChargedNames(chargedByName: Map<string, Decimal>): {
  amounts: Map<string, Decimal>;
  labels: Map<string, string>;
} {
  const amounts = new Map<string, Decimal>();
  const labels = new Map<string, string>();
  for (const [name, amount] of chargedByName) {
    const normalized = normalizeTenantMatchValue(name);
    if (!normalized) {
      continue;
    }
    addToMap(amounts, normalized, amount);
    if (!labels.has(normalized)) {
      labels.set(normalized, name);
    }
  }

  return { amounts, labels };
}

function displayNameForNormalizedName(
  normalized: string,
  chargedLabels: Map<string, string>,
  leaseLabels: Map<string, string>,
): string {
  return (
    chargedLabels.get(normalized) ?? leaseLabels.get(normalized) ?? normalized
  );
}

function buildPoolDimension(
  correctPoolsByLeaseName: Map<string, Map<string, Decimal>>,
  chargedPoolsByLeaseId: Map<string, Map<string, Decimal>>,
  poolIdToName: Map<string, string>,
):
  | {
      correctByPool: Map<string, Map<string, Decimal>>;
      chargedByPool: Map<string, Map<string, Decimal>>;
      poolNames: Map<string, string>;
    }
  | undefined {
  const nameToId = new Map([...poolIdToName].map(([id, name]) => [name, id]));
  const correctByLeaseId = new Map<string, Map<string, Decimal>>();

  for (const [leaseId, byName] of correctPoolsByLeaseName) {
    const resolved = new Map<string, Decimal>();
    for (const [poolName, amount] of byName) {
      const poolId = nameToId.get(poolName);
      if (poolId) {
        addToMap(resolved, poolId, amount);
      }
    }
    if (resolved.size > 0) {
      correctByLeaseId.set(leaseId, resolved);
    }
  }

  const sharedLeaseIds = [...correctByLeaseId.keys()].filter((leaseId) =>
    chargedPoolsByLeaseId.has(leaseId),
  );
  if (sharedLeaseIds.length === 0) {
    return undefined;
  }

  return {
    correctByPool: new Map(
      sharedLeaseIds.map((leaseId) => [
        leaseId,
        correctByLeaseId.get(leaseId) ?? new Map(),
      ]),
    ),
    chargedByPool: new Map(
      sharedLeaseIds.map((leaseId) => [
        leaseId,
        chargedPoolsByLeaseId.get(leaseId) ?? new Map(),
      ]),
    ),
    poolNames: poolIdToName,
  };
}

function extractCorrectPools(rawBreakdowns: unknown): Map<string, Decimal> {
  const byName = new Map<string, Decimal>();
  const breakdowns = normalizePoolBreakdowns(rawBreakdowns);
  if (!breakdowns) {
    return byName;
  }

  for (const rawPool of breakdowns) {
    if (!rawPool || typeof rawPool !== "object" || Array.isArray(rawPool)) {
      continue;
    }
    const pool = rawPool as Record<string, unknown>;
    const poolName = pool.pool_name;
    if (typeof poolName !== "string" || poolName.length === 0) {
      continue;
    }
    addToMap(
      byName,
      poolName,
      decimalOrZero(pool.total_recovery ?? pool.recovery),
    );
  }

  return byName;
}

function normalizePoolBreakdowns(rawBreakdowns: unknown): unknown[] | null {
  if (Array.isArray(rawBreakdowns)) {
    return rawBreakdowns;
  }
  if (typeof rawBreakdowns !== "string" || rawBreakdowns.trim().length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(rawBreakdowns);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function emptyComparison(input: ComparisonRunInput): ComparisonResult {
  return buildComparisonResult({
    correctByLease: new Map(),
    chargedByLease: new Map(),
    propertyId: input.propertyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    tolerance: new Decimal(input.tolerance),
  });
}

function toRunSummary(row: RunRow): StoredComparisonRunSummary {
  return {
    id: row.id,
    property_id: row.propertyId,
    period_start: row.periodStart,
    period_end: row.periodEnd,
    tolerance: new Decimal(row.tolerance).toFixed(),
    source: row.source,
    total_capveri_correct: new Decimal(row.totalCapveriCorrect).toFixed(),
    total_actual_charged: new Decimal(row.totalActualCharged).toFixed(),
    total_net_variance: new Decimal(row.totalNetVariance).toFixed(),
    total_overcharge: new Decimal(row.totalOvercharge).toFixed(),
    total_undercharge: new Decimal(row.totalUndercharge).toFixed(),
    overcharge_count: Number(row.overchargeCount),
    undercharge_count: Number(row.underchargeCount),
    match_count: Number(row.matchCount),
    created_by: row.createdBy,
    created_at:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
  };
}

function toTenantVariance(row: FindingRow): TenantVariance {
  const match = matchStatusForLeaseKey(
    row.leaseId,
    new Decimal(row.capveriCorrect),
    new Decimal(row.actualCharged),
  );

  return {
    lease_id: row.leaseId,
    tenant_name: row.tenantName,
    match_status: match.match_status,
    match_note: match.match_note,
    capveri_correct: new Decimal(row.capveriCorrect).toFixed(),
    actual_charged: new Decimal(row.actualCharged).toFixed(),
    variance: new Decimal(row.variance).toFixed(),
    direction: row.direction,
    abs_variance: new Decimal(row.absVariance).toFixed(),
    variance_pct: recomputeStoredVariancePct(row),
    pool_breakdowns: normalizePoolBreakdowns(row.poolBreakdowns) as
      | TenantVariance["pool_breakdowns"]
      | null,
  };
}

function recomputeStoredVariancePct(row: FindingRow): string | null {
  const correct = new Decimal(row.capveriCorrect);
  if (correct.isZero()) {
    return null;
  }

  return new Decimal(row.variance)
    .div(correct.abs())
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

function compareTenantVariance(
  left: TenantVariance,
  right: TenantVariance,
): number {
  return new Decimal(right.abs_variance).cmp(new Decimal(left.abs_variance));
}

function runSelectColumns(): string {
  return [
    'select id, property_id as "propertyId",',
    'period_start_date::text as "periodStart",',
    'period_end_date::text as "periodEnd",',
    'tolerance::text as "tolerance", source,',
    'total_capveri_correct::text as "totalCapveriCorrect",',
    'total_actual_charged::text as "totalActualCharged",',
    'total_net_variance::text as "totalNetVariance",',
    'total_overcharge::text as "totalOvercharge",',
    'total_undercharge::text as "totalUndercharge",',
    'overcharge_count as "overchargeCount",',
    'undercharge_count as "underchargeCount",',
    'match_count as "matchCount",',
    'created_by as "createdBy", created_at as "createdAt"',
  ].join(" ");
}

function addToMap(
  map: Map<string, Decimal>,
  key: string,
  amount: Decimal,
): void {
  map.set(key, (map.get(key) ?? new Decimal(0)).plus(amount));
}

function decimalOrZero(value: unknown): Decimal {
  try {
    return new Decimal(
      typeof value === "string" || typeof value === "number" ? value : 0,
    );
  } catch {
    return new Decimal(0);
  }
}
