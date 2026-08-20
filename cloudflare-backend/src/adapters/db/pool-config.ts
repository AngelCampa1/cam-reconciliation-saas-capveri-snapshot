import type { PostgresExecutor } from "./postgres";
import type {
  ExpensePoolRecord,
  JsonObject,
  PageResult,
  PoolAllocationRecord,
  PoolConfigRepository,
  PoolMappingRecord,
} from "../../domain/pool-config/repository";

type CountRow = { total_count: string | number | bigint };
type IdRow = { id: string };

const expensePoolFields = [
  "id",
  "property_id",
  "name",
  "pool_type",
  "is_gross_up_applicable",
  "gross_up_target::text as gross_up_target",
  "description",
  "parent_pool_id",
  "created_at",
  "updated_at",
].join(", ");

const poolMappingFields = [
  "id",
  "expense_pool_id",
  "gl_account_pattern",
  "allocation_percentage::text as allocation_percentage",
  "priority",
  "created_at",
  "updated_at",
].join(", ");

const poolAllocationFields = [
  "id",
  "source_pool_id",
  "target_pool_id",
  "allocation_type",
  "allocation_value::text as allocation_value",
  "created_at",
  "updated_at",
].join(", ");

// Same columns, but table-qualified for queries that join expense_pools
// (otherwise "id"/"created_at" are ambiguous across the two tables).
const poolAllocationFieldsPrefixed = [
  "pool_allocations.id",
  "pool_allocations.source_pool_id",
  "pool_allocations.target_pool_id",
  "pool_allocations.allocation_type",
  "pool_allocations.allocation_value::text as allocation_value",
  "pool_allocations.created_at",
  "pool_allocations.updated_at",
].join(", ");

const expensePoolWritableFields = [
  "property_id",
  "name",
  "pool_type",
  "is_gross_up_applicable",
  "gross_up_target",
  "description",
  "parent_pool_id",
] as const;

const poolMappingWritableFields = [
  "expense_pool_id",
  "gl_account_pattern",
  "allocation_percentage",
  "priority",
] as const;

const poolAllocationWritableFields = [
  "source_pool_id",
  "target_pool_id",
  "allocation_type",
  "allocation_value",
] as const;

export class PostgresPoolConfigRepository implements PoolConfigRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async propertyExists(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      "select id from properties where id = $1 and organization_id = $2",
      [input.propertyId, input.organizationId],
    );

    return result.rows.length > 0;
  }

  async listExpensePools(input: {
    propertyId: string;
    skip: number;
    limit: number;
    includeChildren: boolean;
  }): Promise<PageResult<ExpensePoolRecord>> {
    const count = await countRows(
      this.executor,
      "expense_pools",
      ["property_id = $1"],
      [input.propertyId],
    );
    const params: unknown[] = [input.propertyId];
    const pagination = input.includeChildren ? "" : "offset $2 limit $3";
    if (!input.includeChildren) {
      params.push(input.skip, input.limit);
    }

    const result = await this.executor.query<ExpensePoolRecord>(
      [
        `select ${expensePoolFields}`,
        "from expense_pools",
        "where property_id = $1",
        "order by name asc",
        pagination,
      ].join(" "),
      params,
    );

    return { data: result.rows, count };
  }

  async getExpensePool(input: {
    propertyId: string;
    poolId: string;
  }): Promise<ExpensePoolRecord | null> {
    return (
      (
        await this.executor.query<ExpensePoolRecord>(
          [
            `select ${expensePoolFields}`,
            "from expense_pools",
            "where id = $1 and property_id = $2",
          ].join(" "),
          [input.poolId, input.propertyId],
        )
      ).rows[0] ?? null
    );
  }

  async createExpensePool(input: {
    propertyId: string;
    data: JsonObject;
  }): Promise<ExpensePoolRecord> {
    return insertReturning<ExpensePoolRecord>(
      this.executor,
      "expense_pools",
      expensePoolWritableFields,
      { ...input.data, property_id: input.propertyId },
      expensePoolFields,
    );
  }

  async updateExpensePool(input: {
    propertyId: string;
    poolId: string;
    patch: JsonObject;
  }): Promise<ExpensePoolRecord | null> {
    return updateReturning<ExpensePoolRecord>({
      executor: this.executor,
      table: "expense_pools",
      writableFields: expensePoolWritableFields,
      patch: input.patch,
      whereSql: "id = $1 and property_id = $2",
      whereParams: [input.poolId, input.propertyId],
      returningFields: expensePoolFields,
    });
  }

  async deleteExpensePool(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      "delete from expense_pools where id = $1 and property_id = $2 returning id",
      [input.poolId, input.propertyId],
    );

    return result.rows.length > 0;
  }

  async poolBelongsToProperty(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      "select id from expense_pools where id = $1 and property_id = $2",
      [input.poolId, input.propertyId],
    );

    return result.rows.length > 0;
  }

  async poolHasChildren(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      "select id from expense_pools where property_id = $1 and parent_pool_id = $2 limit 1",
      [input.propertyId, input.poolId],
    );

    return result.rows.length > 0;
  }

  async listPoolIds(input: { propertyId: string }): Promise<string[]> {
    const result = await this.executor.query<IdRow>(
      "select id from expense_pools where property_id = $1",
      [input.propertyId],
    );

    return result.rows.map((row) => row.id);
  }

  async getPoolParent(input: { poolId: string }): Promise<{
    id: string;
    property_id: string;
    parent_pool_id: string | null;
  } | null> {
    return (
      (
        await this.executor.query<{
          id: string;
          property_id: string;
          parent_pool_id: string | null;
        }>(
          "select id, property_id, parent_pool_id from expense_pools where id = $1",
          [input.poolId],
        )
      ).rows[0] ?? null
    );
  }

  async listPoolMappings(input: {
    propertyId: string;
    poolId?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PoolMappingRecord>> {
    const poolIds = await this.listPoolIds({ propertyId: input.propertyId });
    if (poolIds.length === 0) {
      return { data: [], count: 0 };
    }

    const filters = ["expense_pool_id = any($1::uuid[])"];
    const params: unknown[] = [poolIds];
    if (input.poolId) {
      params.push(input.poolId);
      filters.push(`expense_pool_id = $${params.length}`);
    }

    const count = await countRows(
      this.executor,
      "pool_mappings",
      filters,
      params,
    );

    params.push(input.skip, input.limit);
    const result = await this.executor.query<PoolMappingRecord>(
      [
        `select ${poolMappingFields}`,
        "from pool_mappings",
        `where ${filters.join(" and ")}`,
        "order by priority desc",
        `offset $${params.length - 1} limit $${params.length}`,
      ].join(" "),
      params,
    );

    return { data: result.rows, count };
  }

  async createPoolMapping(input: {
    data: JsonObject;
  }): Promise<PoolMappingRecord> {
    const existing = await this.executor.query<IdRow>(
      [
        "select id from pool_mappings",
        "where expense_pool_id = $1",
        "and gl_account_pattern = $2",
        "limit 1",
      ].join(" "),
      [input.data.expense_pool_id, input.data.gl_account_pattern],
    );
    if (existing.rows.length > 0) {
      throw new Error("duplicate key value violates unique constraint");
    }

    return insertReturning<PoolMappingRecord>(
      this.executor,
      "pool_mappings",
      poolMappingWritableFields,
      input.data,
      poolMappingFields,
    );
  }

  async updatePoolMapping(input: {
    propertyId: string;
    mappingId: string;
    patch: JsonObject;
  }): Promise<PoolMappingRecord | null> {
    const names = poolMappingWritableFields.filter((field) =>
      Object.hasOwn(input.patch, field),
    );
    if (names.length === 0) {
      return null;
    }
    if (Object.hasOwn(input.patch, "gl_account_pattern")) {
      const existing = await this.executor.query<{
        expense_pool_id: string;
      }>(
        [
          "select pool_mappings.expense_pool_id",
          "from pool_mappings",
          "join expense_pools on pool_mappings.expense_pool_id = expense_pools.id",
          "where pool_mappings.id = $1",
          "and expense_pools.property_id = $2",
        ].join(" "),
        [input.mappingId, input.propertyId],
      );
      const current = existing.rows[0];
      if (!current) {
        return null;
      }
      const conflict = await this.executor.query<IdRow>(
        [
          "select id from pool_mappings",
          "where expense_pool_id = $1",
          "and gl_account_pattern = $2",
          "and id <> $3",
          "limit 1",
        ].join(" "),
        [
          current.expense_pool_id,
          input.patch.gl_account_pattern,
          input.mappingId,
        ],
      );
      if (conflict.rows.length > 0) {
        throw new Error("duplicate key value violates unique constraint");
      }
    }

    const assignments = names
      .map((field, index) => `${field} = $${index + 3}`)
      .join(", ");
    const params = [
      input.mappingId,
      input.propertyId,
      ...names.map((field) => input.patch[field]),
    ];
    const result = await this.executor.query<PoolMappingRecord>(
      [
        "update pool_mappings",
        `set ${assignments}`,
        "from expense_pools",
        "where pool_mappings.expense_pool_id = expense_pools.id",
        "and pool_mappings.id = $1",
        "and expense_pools.property_id = $2",
        `returning ${poolMappingFields
          .split(", ")
          .map((field) => `pool_mappings.${field}`)
          .join(", ")}`,
      ].join(" "),
      params,
    );

    return result.rows[0] ?? null;
  }

  async deletePoolMapping(input: {
    propertyId: string;
    mappingId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      [
        "delete from pool_mappings",
        "using expense_pools",
        "where pool_mappings.expense_pool_id = expense_pools.id",
        "and pool_mappings.id = $1",
        "and expense_pools.property_id = $2",
        "returning pool_mappings.id",
      ].join(" "),
      [input.mappingId, input.propertyId],
    );

    return result.rows.length > 0;
  }

  async listPoolAllocations(input: {
    propertyId: string;
    sourcePoolId?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PoolAllocationRecord>> {
    const poolIds = await this.listPoolIds({ propertyId: input.propertyId });
    if (poolIds.length === 0) {
      return { data: [], count: 0 };
    }

    const filters = ["source_pool_id = any($1::uuid[])"];
    const params: unknown[] = [poolIds];
    if (input.sourcePoolId) {
      params.push(input.sourcePoolId);
      filters.push(`source_pool_id = $${params.length}`);
    }

    const count = await countRows(
      this.executor,
      "pool_allocations",
      filters,
      params,
    );

    params.push(input.skip, input.limit);
    const result = await this.executor.query<PoolAllocationRecord>(
      [
        `select ${poolAllocationFields}`,
        "from pool_allocations",
        `where ${filters.join(" and ")}`,
        "order by created_at asc",
        `offset $${params.length - 1} limit $${params.length}`,
      ].join(" "),
      params,
    );

    return { data: result.rows, count };
  }

  async getPoolAllocation(input: {
    propertyId: string;
    allocationId: string;
  }): Promise<PoolAllocationRecord | null> {
    // Scope through expense_pools.property_id so a landlord can only read an
    // allocation that belongs to the property they were authorized for.
    // Keying by id alone would let any landlord read another org's allocation.
    return (
      (
        await this.executor.query<PoolAllocationRecord>(
          [
            `select ${poolAllocationFieldsPrefixed}`,
            "from pool_allocations",
            "join expense_pools",
            "on pool_allocations.source_pool_id = expense_pools.id",
            "where pool_allocations.id = $1",
            "and expense_pools.property_id = $2",
          ].join(" "),
          [input.allocationId, input.propertyId],
        )
      ).rows[0] ?? null
    );
  }

  async listPercentageAllocations(input: {
    sourcePoolId: string;
  }): Promise<PoolAllocationRecord[]> {
    const result = await this.executor.query<PoolAllocationRecord>(
      [
        `select ${poolAllocationFields}`,
        "from pool_allocations",
        "where source_pool_id = $1",
        "and allocation_type = 'percentage'",
      ].join(" "),
      [input.sourcePoolId],
    );

    return result.rows;
  }

  async createPoolAllocation(input: {
    data: JsonObject;
  }): Promise<PoolAllocationRecord> {
    return insertReturning<PoolAllocationRecord>(
      this.executor,
      "pool_allocations",
      poolAllocationWritableFields,
      input.data,
      poolAllocationFields,
    );
  }

  async updatePoolAllocation(input: {
    propertyId: string;
    allocationId: string;
    patch: JsonObject;
  }): Promise<PoolAllocationRecord | null> {
    // Scope the update through expense_pools.property_id so a landlord cannot
    // overwrite an allocation that belongs to another organization's property
    // by guessing its id. Mirrors deletePoolAllocation's cross-tenant guard.
    return updateReturning<PoolAllocationRecord>({
      executor: this.executor,
      table: "pool_allocations",
      writableFields: poolAllocationWritableFields,
      patch: input.patch,
      whereSql:
        "id = $1 and source_pool_id in " +
        "(select id from expense_pools where property_id = $2)",
      whereParams: [input.allocationId, input.propertyId],
      returningFields: poolAllocationFields,
    });
  }

  async deletePoolAllocation(input: {
    propertyId: string;
    allocationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      [
        "delete from pool_allocations",
        "using expense_pools",
        "where pool_allocations.source_pool_id = expense_pools.id",
        "and pool_allocations.id = $1",
        "and expense_pools.property_id = $2",
        "returning pool_allocations.id",
      ].join(" "),
      [input.allocationId, input.propertyId],
    );

    return result.rows.length > 0;
  }
}

async function countRows(
  executor: PostgresExecutor,
  tableSql: string,
  filters: string[],
  params: readonly unknown[],
): Promise<number> {
  const result = await executor.query<CountRow>(
    [
      "select count(*) as total_count",
      `from ${tableSql}`,
      filters.length > 0 ? `where ${filters.join(" and ")}` : "",
    ].join(" "),
    params,
  );

  return Number(result.rows[0]?.total_count ?? 0);
}

async function insertReturning<Row>(
  executor: PostgresExecutor,
  table: string,
  writableFields: readonly string[],
  values: JsonObject,
  returningFields: string,
): Promise<Row> {
  const names = writableFields.filter((field) => Object.hasOwn(values, field));
  const params = names.map((field) => values[field]);
  const result = await executor.query<Row>(
    [
      `insert into ${table} (${names.join(", ")})`,
      `values (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
      `returning ${returningFields}`,
    ].join(" "),
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Failed to insert ${table}`);
  }

  return row;
}

async function updateReturning<Row>(input: {
  executor: PostgresExecutor;
  table: string;
  writableFields: readonly string[];
  patch: JsonObject;
  whereSql: string;
  whereParams: readonly unknown[];
  returningFields: string;
}): Promise<Row | null> {
  const names = input.writableFields.filter((field) =>
    Object.hasOwn(input.patch, field),
  );
  if (names.length === 0) {
    return null;
  }

  const assignments = names
    .map(
      (field, index) => `${field} = $${index + input.whereParams.length + 1}`,
    )
    .join(", ");
  const params = [
    ...input.whereParams,
    ...names.map((field) => input.patch[field]),
  ];
  const result = await input.executor.query<Row>(
    [
      `update ${input.table}`,
      `set ${assignments}`,
      `where ${input.whereSql}`,
      `returning ${input.returningFields}`,
    ].join(" "),
    params,
  );

  return result.rows[0] ?? null;
}
