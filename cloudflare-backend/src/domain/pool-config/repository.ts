export type JsonObject = Record<string, unknown>;

export type ExpensePoolRecord = JsonObject & {
  id: string;
  property_id: string;
  name: string;
  pool_type: string;
  is_gross_up_applicable: boolean;
  gross_up_target: string | null;
  description: string | null;
  parent_pool_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpensePoolWithChildren = ExpensePoolRecord & {
  children: ExpensePoolWithChildren[];
};

export type PoolMappingRecord = JsonObject & {
  id: string;
  expense_pool_id: string;
  gl_account_pattern: string;
  allocation_percentage: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type PoolAllocationRecord = JsonObject & {
  id: string;
  source_pool_id: string;
  target_pool_id: string;
  allocation_type: string;
  allocation_value: string;
  created_at: string;
  updated_at: string;
};

export type PageResult<Row> = {
  data: Row[];
  count: number;
};

export type PoolConfigRepository = {
  propertyExists(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean>;
  listExpensePools(input: {
    propertyId: string;
    skip: number;
    limit: number;
    includeChildren: boolean;
  }): Promise<PageResult<ExpensePoolRecord>>;
  getExpensePool(input: {
    propertyId: string;
    poolId: string;
  }): Promise<ExpensePoolRecord | null>;
  createExpensePool(input: {
    propertyId: string;
    data: JsonObject;
  }): Promise<ExpensePoolRecord>;
  updateExpensePool(input: {
    propertyId: string;
    poolId: string;
    patch: JsonObject;
  }): Promise<ExpensePoolRecord | null>;
  deleteExpensePool(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean>;
  poolBelongsToProperty(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean>;
  poolHasChildren(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean>;
  listPoolIds(input: { propertyId: string }): Promise<string[]>;
  getPoolParent(input: { poolId: string }): Promise<{
    id: string;
    property_id: string;
    parent_pool_id: string | null;
  } | null>;
  listPoolMappings(input: {
    propertyId: string;
    poolId?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PoolMappingRecord>>;
  createPoolMapping(input: { data: JsonObject }): Promise<PoolMappingRecord>;
  updatePoolMapping(input: {
    propertyId: string;
    mappingId: string;
    patch: JsonObject;
  }): Promise<PoolMappingRecord | null>;
  deletePoolMapping(input: {
    propertyId: string;
    mappingId: string;
  }): Promise<boolean>;
  listPoolAllocations(input: {
    propertyId: string;
    sourcePoolId?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PoolAllocationRecord>>;
  getPoolAllocation(input: {
    propertyId: string;
    allocationId: string;
  }): Promise<PoolAllocationRecord | null>;
  listPercentageAllocations(input: {
    sourcePoolId: string;
  }): Promise<PoolAllocationRecord[]>;
  createPoolAllocation(input: {
    data: JsonObject;
  }): Promise<PoolAllocationRecord>;
  updatePoolAllocation(input: {
    propertyId: string;
    allocationId: string;
    patch: JsonObject;
  }): Promise<PoolAllocationRecord | null>;
  deletePoolAllocation(input: {
    propertyId: string;
    allocationId: string;
  }): Promise<boolean>;
};

export function buildPoolHierarchy(
  pools: ExpensePoolRecord[],
): ExpensePoolWithChildren[] {
  const parents: ExpensePoolRecord[] = [];
  const childrenByParent = new Map<string, ExpensePoolRecord[]>();

  for (const pool of pools) {
    if (pool.parent_pool_id === null) {
      parents.push(pool);
      continue;
    }

    childrenByParent.set(pool.parent_pool_id, [
      ...(childrenByParent.get(pool.parent_pool_id) ?? []),
      pool,
    ]);
  }

  return parents.map((parent) => ({
    ...parent,
    children: (childrenByParent.get(parent.id) ?? []).map((child) => ({
      ...child,
      children: [],
    })),
  }));
}

export function isValidGlPattern(pattern: string): boolean {
  return /^[0-9*%?\-.]+$/u.test(pattern);
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("unique") || message.includes("duplicate");
}
