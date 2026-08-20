import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  ExpensePoolRecord,
  JsonObject,
  PageResult,
  PoolAllocationRecord,
  PoolConfigRepository,
  PoolMappingRecord,
} from "../domain/pool-config/repository";
import type { AppEnv } from "../env";
import { createPoolConfigRoutes } from "../http/pool-config-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROPERTY_ID = "33333333-3333-4333-8333-333333333334";
const OPERATING_POOL_ID = "44444444-4444-4444-8444-444444444441";
const CHILD_POOL_ID = "44444444-4444-4444-8444-444444444442";
const TAX_POOL_ID = "44444444-4444-4444-8444-444444444443";
const OTHER_POOL_ID = "44444444-4444-4444-8444-444444444444";
const MAPPING_ID = "55555555-5555-4555-8555-555555555555";
const ALLOCATION_ID = "66666666-6666-4666-8666-666666666666";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryPoolConfigRepository implements PoolConfigRepository {
  readonly properties = new Map([
    [PROPERTY_ID, ORG_ID],
    [OTHER_PROPERTY_ID, "99999999-9999-4999-8999-999999999999"],
  ]);
  readonly pools = new Map<string, ExpensePoolRecord>([
    [
      OPERATING_POOL_ID,
      poolRecord({
        id: OPERATING_POOL_ID,
        name: "Operating",
        pool_type: "operating",
      }),
    ],
    [
      CHILD_POOL_ID,
      poolRecord({
        id: CHILD_POOL_ID,
        name: "Janitorial",
        pool_type: "operating",
        parent_pool_id: OPERATING_POOL_ID,
      }),
    ],
    [
      TAX_POOL_ID,
      poolRecord({
        id: TAX_POOL_ID,
        name: "Taxes",
        pool_type: "tax",
      }),
    ],
    [
      OTHER_POOL_ID,
      poolRecord({
        id: OTHER_POOL_ID,
        property_id: OTHER_PROPERTY_ID,
        name: "Other Org Pool",
        pool_type: "operating",
      }),
    ],
  ]);
  readonly mappings = new Map<string, PoolMappingRecord>([
    [
      MAPPING_ID,
      mappingRecord({
        id: MAPPING_ID,
        expense_pool_id: OPERATING_POOL_ID,
        gl_account_pattern: "51*",
      }),
    ],
  ]);
  readonly allocations = new Map<string, PoolAllocationRecord>([
    [
      ALLOCATION_ID,
      allocationRecord({
        id: ALLOCATION_ID,
        source_pool_id: OPERATING_POOL_ID,
        target_pool_id: TAX_POOL_ID,
        allocation_value: "60",
      }),
    ],
  ]);

  async propertyExists(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean> {
    return this.properties.get(input.propertyId) === input.organizationId;
  }

  async listExpensePools(input: {
    propertyId: string;
    skip: number;
    limit: number;
    includeChildren: boolean;
  }): Promise<PageResult<ExpensePoolRecord>> {
    const pools = [...this.pools.values()]
      .filter((pool) => pool.property_id === input.propertyId)
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      data: input.includeChildren
        ? pools
        : pools.slice(input.skip, input.skip + input.limit),
      count: pools.length,
    };
  }

  async getExpensePool(input: {
    propertyId: string;
    poolId: string;
  }): Promise<ExpensePoolRecord | null> {
    const pool = this.pools.get(input.poolId);

    return pool?.property_id === input.propertyId ? pool : null;
  }

  async createExpensePool(input: {
    propertyId: string;
    data: JsonObject;
  }): Promise<ExpensePoolRecord> {
    const record = poolRecord({
      id: `77777777-7777-4777-8777-${String(this.pools.size + 1).padStart(12, "0")}`,
      property_id: input.propertyId,
      name: String(input.data.name),
      pool_type: String(input.data.pool_type),
      is_gross_up_applicable: Boolean(input.data.is_gross_up_applicable),
      gross_up_target: nullableString(input.data.gross_up_target),
      description: nullableString(input.data.description),
      parent_pool_id: nullableString(input.data.parent_pool_id),
    });
    this.pools.set(record.id, record);

    return record;
  }

  async updateExpensePool(input: {
    propertyId: string;
    poolId: string;
    patch: JsonObject;
  }): Promise<ExpensePoolRecord | null> {
    const existing = await this.getExpensePool(input);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input.patch } as ExpensePoolRecord;
    this.pools.set(input.poolId, updated);

    return updated;
  }

  async deleteExpensePool(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean> {
    const existing = await this.getExpensePool(input);
    if (!existing) {
      return false;
    }

    return this.pools.delete(input.poolId);
  }

  async poolBelongsToProperty(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean> {
    return (await this.getExpensePool(input)) !== null;
  }

  async poolHasChildren(input: {
    propertyId: string;
    poolId: string;
  }): Promise<boolean> {
    return [...this.pools.values()].some(
      (pool) =>
        pool.property_id === input.propertyId &&
        pool.parent_pool_id === input.poolId,
    );
  }

  async listPoolIds(input: { propertyId: string }): Promise<string[]> {
    return [...this.pools.values()]
      .filter((pool) => pool.property_id === input.propertyId)
      .map((pool) => pool.id);
  }

  async getPoolParent(input: { poolId: string }): Promise<{
    id: string;
    property_id: string;
    parent_pool_id: string | null;
  } | null> {
    const pool = this.pools.get(input.poolId);

    return pool
      ? {
          id: pool.id,
          property_id: pool.property_id,
          parent_pool_id: pool.parent_pool_id,
        }
      : null;
  }

  async listPoolMappings(input: {
    propertyId: string;
    poolId?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PoolMappingRecord>> {
    const poolIds = new Set(
      await this.listPoolIds({ propertyId: input.propertyId }),
    );
    const rows = [...this.mappings.values()]
      .filter((mapping) => poolIds.has(mapping.expense_pool_id))
      .filter(
        (mapping) => !input.poolId || mapping.expense_pool_id === input.poolId,
      )
      .sort((left, right) => right.priority - left.priority);

    return {
      data: rows.slice(input.skip, input.skip + input.limit),
      count: rows.length,
    };
  }

  async createPoolMapping(input: {
    data: JsonObject;
  }): Promise<PoolMappingRecord> {
    if (
      [...this.mappings.values()].some(
        (mapping) =>
          mapping.expense_pool_id === input.data.expense_pool_id &&
          mapping.gl_account_pattern === input.data.gl_account_pattern,
      )
    ) {
      throw new Error("duplicate key value violates unique constraint");
    }

    const record = mappingRecord({
      id: "55555555-5555-4555-8555-555555555556",
      expense_pool_id: String(input.data.expense_pool_id),
      gl_account_pattern: String(input.data.gl_account_pattern),
      allocation_percentage: String(input.data.allocation_percentage),
      priority: Number(input.data.priority),
    });
    this.mappings.set(record.id, record);

    return record;
  }

  async updatePoolMapping(input: {
    propertyId: string;
    mappingId: string;
    patch: JsonObject;
  }): Promise<PoolMappingRecord | null> {
    const page = await this.listPoolMappings({
      propertyId: input.propertyId,
      skip: 0,
      limit: 100,
    });
    const existing = page.data.find(
      (mapping) => mapping.id === input.mappingId,
    );
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...input.patch } as PoolMappingRecord;
    this.mappings.set(input.mappingId, updated);

    return updated;
  }

  async deletePoolMapping(input: {
    propertyId: string;
    mappingId: string;
  }): Promise<boolean> {
    const existing = await this.updatePoolMapping({
      propertyId: input.propertyId,
      mappingId: input.mappingId,
      patch: {},
    });
    if (!existing) {
      return false;
    }

    return this.mappings.delete(input.mappingId);
  }

  async listPoolAllocations(input: {
    propertyId: string;
    sourcePoolId?: string;
    skip: number;
    limit: number;
  }): Promise<PageResult<PoolAllocationRecord>> {
    const poolIds = new Set(
      await this.listPoolIds({ propertyId: input.propertyId }),
    );
    const rows = [...this.allocations.values()]
      .filter((allocation) => poolIds.has(allocation.source_pool_id))
      .filter(
        (allocation) =>
          !input.sourcePoolId ||
          allocation.source_pool_id === input.sourcePoolId,
      );

    return {
      data: rows.slice(input.skip, input.skip + input.limit),
      count: rows.length,
    };
  }

  async getPoolAllocation(input: {
    propertyId: string;
    allocationId: string;
  }): Promise<PoolAllocationRecord | null> {
    const existing = this.allocations.get(input.allocationId);
    const pool = existing ? this.pools.get(existing.source_pool_id) : undefined;
    if (!existing || pool?.property_id !== input.propertyId) {
      return null;
    }

    return existing;
  }

  async listPercentageAllocations(input: {
    sourcePoolId: string;
  }): Promise<PoolAllocationRecord[]> {
    return [...this.allocations.values()].filter(
      (allocation) =>
        allocation.source_pool_id === input.sourcePoolId &&
        allocation.allocation_type === "percentage",
    );
  }

  async createPoolAllocation(input: {
    data: JsonObject;
  }): Promise<PoolAllocationRecord> {
    if (
      [...this.allocations.values()].some(
        (allocation) =>
          allocation.source_pool_id === input.data.source_pool_id &&
          allocation.target_pool_id === input.data.target_pool_id,
      )
    ) {
      throw new Error("duplicate key value violates unique constraint");
    }

    const record = allocationRecord({
      id: "66666666-6666-4666-8666-666666666667",
      source_pool_id: String(input.data.source_pool_id),
      target_pool_id: String(input.data.target_pool_id),
      allocation_type: String(input.data.allocation_type),
      allocation_value: String(input.data.allocation_value),
    });
    this.allocations.set(record.id, record);

    return record;
  }

  async updatePoolAllocation(input: {
    propertyId: string;
    allocationId: string;
    patch: JsonObject;
  }): Promise<PoolAllocationRecord | null> {
    const existing = this.allocations.get(input.allocationId);
    const pool = existing ? this.pools.get(existing.source_pool_id) : undefined;
    if (!existing || pool?.property_id !== input.propertyId) {
      return null;
    }
    const updated = { ...existing, ...input.patch } as PoolAllocationRecord;
    this.allocations.set(input.allocationId, updated);

    return updated;
  }

  async deletePoolAllocation(input: {
    propertyId: string;
    allocationId: string;
  }): Promise<boolean> {
    const existing = this.allocations.get(input.allocationId);
    const pool = existing ? this.pools.get(existing.source_pool_id) : undefined;
    if (!existing || pool?.property_id !== input.propertyId) {
      return false;
    }

    return this.allocations.delete(input.allocationId);
  }
}

function createTestApp(
  options: {
    repository?: MemoryPoolConfigRepository;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
) {
  const repository = options.repository ?? new MemoryPoolConfigRepository();
  const context = createAuthContext(options.role ?? "member");
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createPoolConfigRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"],
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

function authHeaders() {
  return { authorization: "Bearer valid-token" };
}

function jsonHeaders() {
  return { ...authHeaders(), "content-type": "application/json" };
}

async function jsonObject(
  response: Response,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected JSON object response");
  }

  return body as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object value");
  }

  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected array value");
  }

  return value;
}

function errorCode(body: Record<string, unknown>): unknown {
  return objectValue(body.error).code;
}

describe("pool config routes", () => {
  it("lists expense pools as a parent-child hierarchy", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools`,
      { headers: authHeaders() },
      env(),
    );
    const body = await jsonObject(response);
    const data = arrayValue(body.data);
    const firstPool = objectValue(data[0]);

    expect(response.status).toBe(200);
    expect(body.count).toBe(3);
    expect(body.has_more).toBe(false);
    expect(data).toHaveLength(2);
    expect(firstPool.children).toEqual([
      expect.objectContaining({ id: CHILD_POOL_ID, name: "Janitorial" }),
    ]);
  });

  it("supports flat expense pool pagination when include_children is false", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools?include_children=false&skip=0&limit=1`,
      { headers: authHeaders() },
      env(),
    );
    const body = await jsonObject(response);
    const data = arrayValue(body.data);

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(body.count).toBe(3);
    expect(body.has_more).toBe(true);
    expect(objectValue(data[0]).children).toEqual([]);
  });

  it("gets, updates, and deletes an expense pool", async () => {
    const { app, repository } = createTestApp();
    const getResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools/${TAX_POOL_ID}`,
      { headers: authHeaders() },
      env(),
    );
    const updateResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools/${TAX_POOL_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "Property Taxes",
          description: "Tax recoveries",
        }),
      },
      env(),
    );
    const updated = await jsonObject(updateResponse);
    const deleteResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools/${TAX_POOL_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(getResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(updated.name).toBe("Property Taxes");
    expect(deleteResponse.status).toBe(204);
    expect(repository.pools.has(TAX_POOL_ID)).toBe(false);
  });

  it("rejects creating a grandchild expense pool", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "Night Cleaning",
          pool_type: "operating",
          parent_pool_id: CHILD_POOL_ID,
        }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(400);
    expect(errorCode(body)).toBe("pool_hierarchy_too_deep");
  });

  it("rejects gross-up targets when gross-up is disabled", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "Insurance",
          pool_type: "insurance",
          is_gross_up_applicable: false,
          gross_up_target: "0.95",
        }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(422);
    expect(errorCode(body)).toBe("validation_error");
  });

  it("rejects moving a parent pool under another root when it already has children", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools/${OPERATING_POOL_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ parent_pool_id: TAX_POOL_ID }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(400);
    expect(errorCode(body)).toBe("pool_hierarchy_too_deep");
  });

  it("creates pool mappings only for valid same-property pools", async () => {
    const { app, repository } = createTestApp();
    const badPatternResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          expense_pool_id: OPERATING_POOL_ID,
          gl_account_pattern: "51A",
        }),
      },
      env(),
    );
    const otherPropertyResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          expense_pool_id: OTHER_POOL_ID,
          gl_account_pattern: "52*",
        }),
      },
      env(),
    );
    const createdResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          expense_pool_id: OPERATING_POOL_ID,
          gl_account_pattern: "52*",
          allocation_percentage: "0.5",
          priority: 10,
        }),
      },
      env(),
    );
    const created = await jsonObject(createdResponse);

    expect(badPatternResponse.status).toBe(422);
    expect(otherPropertyResponse.status).toBe(404);
    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({
      expense_pool_id: OPERATING_POOL_ID,
      gl_account_pattern: "52*",
      allocation_percentage: "0.5",
      priority: 10,
    });
    expect(repository.mappings.size).toBe(2);
  });

  it("lists, updates, rejects duplicate, and deletes pool mappings", async () => {
    const { app, repository } = createTestApp();
    const listResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings?pool_id=${OPERATING_POOL_ID}`,
      { headers: authHeaders() },
      env(),
    );
    const updateResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings/${MAPPING_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ gl_account_pattern: "52*", priority: 4 }),
      },
      env(),
    );
    const duplicateResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          expense_pool_id: OPERATING_POOL_ID,
          gl_account_pattern: "52*",
        }),
      },
      env(),
    );
    const deleteResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-mappings/${MAPPING_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    const listBody = await jsonObject(listResponse);
    const updated = await jsonObject(updateResponse);
    const duplicate = await jsonObject(duplicateResponse);

    expect(listResponse.status).toBe(200);
    expect(arrayValue(listBody.data)).toHaveLength(1);
    expect(updateResponse.status).toBe(200);
    expect(updated.gl_account_pattern).toBe("52*");
    expect(updated.priority).toBe(4);
    expect(duplicateResponse.status).toBe(409);
    expect(errorCode(duplicate)).toBe("pool_mapping_conflict");
    expect(deleteResponse.status).toBe(204);
    expect(repository.mappings.has(MAPPING_ID)).toBe(false);
  });

  it("rejects allocation totals above 100 percent", async () => {
    const { app } = createTestApp();
    const invalidDecimalResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_pool_id: OPERATING_POOL_ID,
          target_pool_id: CHILD_POOL_ID,
          allocation_type: "percentage",
          allocation_value: "not-a-number",
        }),
      },
      env(),
    );
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_pool_id: OPERATING_POOL_ID,
          target_pool_id: CHILD_POOL_ID,
          allocation_type: "percentage",
          allocation_value: "45",
        }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(invalidDecimalResponse.status).toBe(422);
    expect(response.status).toBe(422);
    expect(errorCode(body)).toBe("allocation_total_exceeded");
  });

  it("allows updating an existing allocation while excluding its own percentage", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations/${ALLOCATION_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ allocation_value: "75" }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(200);
    expect(body.allocation_value).toBe("75");
  });

  it("does not read or overwrite an allocation belonging to another org's property", async () => {
    const { app, repository } = createTestApp();
    // Seed a victim allocation that lives under another organization's pool.
    const victimAllocationId = "77777777-7777-4777-8777-777777777777";
    repository.allocations.set(
      victimAllocationId,
      allocationRecord({
        id: victimAllocationId,
        source_pool_id: OTHER_POOL_ID,
        target_pool_id: OTHER_POOL_ID,
        allocation_value: "10",
      }),
    );

    // The caller is authorized for PROPERTY_ID, then guesses the victim id.
    // Scoping through expense_pools.property_id must hide it (404), and the
    // victim record must be left untouched.
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations/${victimAllocationId}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ allocation_value: "99" }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(404);
    expect(errorCode(body)).toBe("pool_allocation_not_found");
    expect(
      repository.allocations.get(victimAllocationId)?.allocation_value,
    ).toBe("10");
  });

  it("lists, creates, rejects duplicate, and deletes pool allocations", async () => {
    const { app, repository } = createTestApp();
    const listResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations?source_pool_id=${OPERATING_POOL_ID}`,
      { headers: authHeaders() },
      env(),
    );
    const createResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_pool_id: TAX_POOL_ID,
          target_pool_id: OPERATING_POOL_ID,
          allocation_type: "percentage",
          allocation_value: "25",
        }),
      },
      env(),
    );
    const duplicateResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_pool_id: TAX_POOL_ID,
          target_pool_id: OPERATING_POOL_ID,
          allocation_type: "percentage",
          allocation_value: "25",
        }),
      },
      env(),
    );
    const deleteResponse = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations/${ALLOCATION_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    const listBody = await jsonObject(listResponse);
    const created = await jsonObject(createResponse);
    const duplicate = await jsonObject(duplicateResponse);

    expect(listResponse.status).toBe(200);
    expect(arrayValue(listBody.data)).toHaveLength(1);
    expect(createResponse.status).toBe(201);
    expect(created.source_pool_id).toBe(TAX_POOL_ID);
    expect(created.target_pool_id).toBe(OPERATING_POOL_ID);
    expect(duplicateResponse.status).toBe(409);
    expect(errorCode(duplicate)).toBe("pool_allocation_conflict");
    expect(deleteResponse.status).toBe(204);
    expect(repository.allocations.has(ALLOCATION_ID)).toBe(false);
  });

  it("rejects allocation updates that move the target pool to another property", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/pool-allocations/${ALLOCATION_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ target_pool_id: OTHER_POOL_ID }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(400);
    expect(errorCode(body)).toBe("invalid_pool_reference");
  });

  it("prevents viewer users from mutating pool configuration", async () => {
    const { app } = createTestApp({ role: "viewer" });
    const response = await app.request(
      `/api/v1/properties/${PROPERTY_ID}/expense-pools`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: "Insurance", pool_type: "insurance" }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(403);
    expect(errorCode(body)).toBe("insufficient_permissions");
  });
});

function poolRecord(overrides: Partial<ExpensePoolRecord>): ExpensePoolRecord {
  return {
    id: overrides.id ?? OPERATING_POOL_ID,
    property_id: overrides.property_id ?? PROPERTY_ID,
    name: overrides.name ?? "Operating",
    pool_type: overrides.pool_type ?? "operating",
    is_gross_up_applicable: overrides.is_gross_up_applicable ?? true,
    gross_up_target: overrides.gross_up_target ?? null,
    description: overrides.description ?? null,
    parent_pool_id: overrides.parent_pool_id ?? null,
    created_at: "2026-06-13T00:00:00Z",
    updated_at: "2026-06-13T00:00:00Z",
  };
}

function mappingRecord(
  overrides: Partial<PoolMappingRecord>,
): PoolMappingRecord {
  return {
    id: overrides.id ?? MAPPING_ID,
    expense_pool_id: overrides.expense_pool_id ?? OPERATING_POOL_ID,
    gl_account_pattern: overrides.gl_account_pattern ?? "51*",
    allocation_percentage: overrides.allocation_percentage ?? "1.0",
    priority: overrides.priority ?? 0,
    created_at: "2026-06-13T00:00:00Z",
    updated_at: "2026-06-13T00:00:00Z",
  };
}

function allocationRecord(
  overrides: Partial<PoolAllocationRecord>,
): PoolAllocationRecord {
  return {
    id: overrides.id ?? ALLOCATION_ID,
    source_pool_id: overrides.source_pool_id ?? OPERATING_POOL_ID,
    target_pool_id: overrides.target_pool_id ?? TAX_POOL_ID,
    allocation_type: overrides.allocation_type ?? "percentage",
    allocation_value: overrides.allocation_value ?? "60",
    created_at: "2026-06-13T00:00:00Z",
    updated_at: "2026-06-13T00:00:00Z",
  };
}

function nullableString(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}
