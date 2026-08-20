import Decimal from "decimal.js";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresPoolConfigRepository } from "../adapters/db/pool-config";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  buildPoolHierarchy,
  isUniqueConstraintError,
  isValidGlPattern,
  type JsonObject,
  type PoolConfigRepository,
} from "../domain/pool-config/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type PoolConfigRouteDependencies = {
  repository?: PoolConfigRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
const paginationQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");
const decimalInputSchema = z
  .union([z.number(), z.string()])
  .refine(
    (value) =>
      typeof value === "number"
        ? Number.isFinite(value)
        : isDecimalString(value),
    { message: "Expected decimal string or number" },
  );
const boundedDecimalSchema = (minimum: number, maximum: number) =>
  decimalInputSchema.refine(
    (value) => {
      const numeric = Number(value);

      return numeric >= minimum && numeric <= maximum;
    },
    { message: `Expected decimal between ${minimum} and ${maximum}` },
  );
const expensePoolBaseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  pool_type: z.enum(["operating", "tax", "insurance", "capital", "other"]),
  is_gross_up_applicable: z.boolean().default(true),
  gross_up_target: boundedDecimalSchema(0, 1).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  parent_pool_id: uuidSchema.nullable().optional(),
});
const expensePoolCreateSchema = expensePoolBaseSchema.superRefine(
  validateGrossUpTarget,
);
const expensePoolUpdateSchema = expensePoolBaseSchema
  .partial()
  .superRefine(validateGrossUpTarget);
const poolMappingCreateSchema = z.object({
  expense_pool_id: uuidSchema,
  gl_account_pattern: z.string().trim().min(1).max(50),
  allocation_percentage: boundedDecimalSchema(0, 1).default("1.0"),
  priority: z.number().int().min(0).default(0),
});
const poolMappingUpdateSchema = poolMappingCreateSchema
  .omit({ expense_pool_id: true })
  .partial();
const poolAllocationCreateSchema = z.object({
  source_pool_id: uuidSchema,
  target_pool_id: uuidSchema,
  allocation_type: z.enum(["percentage", "fixed_amount"]),
  allocation_value: decimalInputSchema,
});
const poolAllocationUpdateSchema = poolAllocationCreateSchema
  .omit({ source_pool_id: true })
  .partial();

export function createPoolConfigRoutes(
  dependencies: PoolConfigRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/properties/*", authMiddleware(dependencies.auth));

  app.get("/properties/:propertyId/expense-pools", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const query = paginationQuerySchema
      .extend({ include_children: booleanQuerySchema.default("true") })
      .parse(c.req.query());
    await requirePropertyAccess(c, dependencies, propertyId);
    const page = await resolveRepository(c.env, dependencies).listExpensePools({
      propertyId,
      skip: query.skip,
      limit: query.limit,
      includeChildren: query.include_children,
    });
    const data = query.include_children
      ? buildPoolHierarchy(page.data)
      : page.data.map((pool) => ({ ...pool, children: [] }));

    return c.json({
      data,
      count: page.count,
      has_more: query.include_children
        ? false
        : page.count > query.skip + query.limit,
    });
  });

  app.get("/properties/:propertyId/expense-pools/:poolId", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const poolId = uuidSchema.parse(c.req.param("poolId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const pool = await resolveRepository(c.env, dependencies).getExpensePool({
      propertyId,
      poolId,
    });

    if (!pool) {
      throw new HttpError(
        404,
        "expense_pool_not_found",
        "Expense pool not found",
      );
    }

    return c.json(pool);
  });

  app.post("/properties/:propertyId/expense-pools", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const body = expensePoolCreateSchema.parse(await parseJsonBody(c));
    await validateExpensePoolParent(
      c,
      dependencies,
      propertyId,
      body.parent_pool_id,
    );

    try {
      const pool = await resolveRepository(
        c.env,
        dependencies,
      ).createExpensePool({
        propertyId,
        data: serializeExpensePool(body),
      });

      return c.json(pool, 201);
    } catch (error) {
      throw mapPoolWriteError(error, body.name);
    }
  });

  app.put("/properties/:propertyId/expense-pools/:poolId", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const poolId = uuidSchema.parse(c.req.param("poolId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const patch = removeUndefined(
      expensePoolUpdateSchema.parse(await parseJsonBody(c)),
    );
    rejectEmptyPatch(patch);
    await validateExpensePoolParent(
      c,
      dependencies,
      propertyId,
      patch.parent_pool_id as string | null | undefined,
      poolId,
    );

    try {
      const pool = await resolveRepository(
        c.env,
        dependencies,
      ).updateExpensePool({
        propertyId,
        poolId,
        patch: serializeExpensePoolPatch(patch),
      });

      if (!pool) {
        throw new HttpError(
          404,
          "expense_pool_not_found",
          "Expense pool not found",
        );
      }

      return c.json(pool);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw mapPoolWriteError(error, String(patch.name ?? "unknown"));
    }
  });

  app.delete("/properties/:propertyId/expense-pools/:poolId", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const poolId = uuidSchema.parse(c.req.param("poolId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const deleted = await resolveRepository(
      c.env,
      dependencies,
    ).deleteExpensePool({
      propertyId,
      poolId,
    });

    if (!deleted) {
      throw new HttpError(
        404,
        "expense_pool_not_found",
        "Expense pool not found",
      );
    }

    return c.body(null, 204);
  });

  app.get("/properties/:propertyId/pool-mappings", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const query = paginationQuerySchema
      .extend({ pool_id: uuidSchema.optional() })
      .parse(c.req.query());
    await requirePropertyAccess(c, dependencies, propertyId);
    if (query.pool_id) {
      await requirePoolBelongsToProperty(
        c,
        dependencies,
        propertyId,
        query.pool_id,
      );
    }
    const page = await resolveRepository(c.env, dependencies).listPoolMappings({
      propertyId,
      ...(query.pool_id ? { poolId: query.pool_id } : {}),
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(toPageResponse(page, query.skip, query.limit));
  });

  app.post("/properties/:propertyId/pool-mappings", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const body = poolMappingCreateSchema.parse(await parseJsonBody(c));
    validateGlPattern(body.gl_account_pattern);
    await requirePropertyAccess(c, dependencies, propertyId);
    await requirePoolBelongsToProperty(
      c,
      dependencies,
      propertyId,
      body.expense_pool_id,
    );

    try {
      const mapping = await resolveRepository(
        c.env,
        dependencies,
      ).createPoolMapping({
        data: {
          expense_pool_id: body.expense_pool_id,
          gl_account_pattern: body.gl_account_pattern,
          allocation_percentage: serializeDecimal(body.allocation_percentage),
          priority: body.priority,
        },
      });

      return c.json(mapping, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(
          409,
          "pool_mapping_conflict",
          `Mapping with pattern '${body.gl_account_pattern}' already exists for this pool`,
        );
      }
      throw error;
    }
  });

  app.put("/properties/:propertyId/pool-mappings/:mappingId", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const mappingId = uuidSchema.parse(c.req.param("mappingId"));
    const patch = removeUndefined(
      poolMappingUpdateSchema.parse(await parseJsonBody(c)),
    );
    rejectEmptyPatch(patch);
    if (patch.gl_account_pattern) {
      validateGlPattern(String(patch.gl_account_pattern));
    }
    await requirePropertyAccess(c, dependencies, propertyId);

    try {
      const mapping = await resolveRepository(
        c.env,
        dependencies,
      ).updatePoolMapping({
        propertyId,
        mappingId,
        patch: serializePoolMappingPatch(patch),
      });

      if (!mapping) {
        throw new HttpError(
          404,
          "pool_mapping_not_found",
          "Pool mapping not found",
        );
      }

      return c.json(mapping);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (isUniqueConstraintError(error)) {
        throw new HttpError(
          409,
          "pool_mapping_conflict",
          "A mapping with this pattern already exists",
        );
      }
      throw error;
    }
  });

  app.delete("/properties/:propertyId/pool-mappings/:mappingId", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const mappingId = uuidSchema.parse(c.req.param("mappingId"));
    await requirePropertyAccess(c, dependencies, propertyId);
    const deleted = await resolveRepository(
      c.env,
      dependencies,
    ).deletePoolMapping({
      propertyId,
      mappingId,
    });

    if (!deleted) {
      throw new HttpError(
        404,
        "pool_mapping_not_found",
        "Pool mapping not found",
      );
    }

    return c.body(null, 204);
  });

  app.get("/properties/:propertyId/pool-allocations", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const query = paginationQuerySchema
      .extend({ source_pool_id: uuidSchema.optional() })
      .parse(c.req.query());
    await requirePropertyAccess(c, dependencies, propertyId);
    if (query.source_pool_id) {
      await requirePoolBelongsToProperty(
        c,
        dependencies,
        propertyId,
        query.source_pool_id,
      );
    }
    const page = await resolveRepository(
      c.env,
      dependencies,
    ).listPoolAllocations({
      propertyId,
      ...(query.source_pool_id ? { sourcePoolId: query.source_pool_id } : {}),
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(toPageResponse(page, query.skip, query.limit));
  });

  app.post("/properties/:propertyId/pool-allocations", async (c) => {
    requireLandlordEditor(c);
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const body = poolAllocationCreateSchema.parse(await parseJsonBody(c));
    await requirePropertyAccess(c, dependencies, propertyId);
    await validateAllocation(c, dependencies, propertyId, {
      sourcePoolId: body.source_pool_id,
      targetPoolId: body.target_pool_id,
      allocationType: body.allocation_type,
      allocationValue: serializeDecimal(body.allocation_value),
    });

    try {
      const allocation = await resolveRepository(
        c.env,
        dependencies,
      ).createPoolAllocation({
        data: {
          source_pool_id: body.source_pool_id,
          target_pool_id: body.target_pool_id,
          allocation_type: body.allocation_type,
          allocation_value: serializeDecimal(body.allocation_value),
        },
      });

      return c.json(allocation, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(
          409,
          "pool_allocation_conflict",
          "Allocation already exists for this source/target pair",
        );
      }
      throw error;
    }
  });

  app.put(
    "/properties/:propertyId/pool-allocations/:allocationId",
    async (c) => {
      requireLandlordEditor(c);
      const propertyId = uuidSchema.parse(c.req.param("propertyId"));
      const allocationId = uuidSchema.parse(c.req.param("allocationId"));
      const patch = removeUndefined(
        poolAllocationUpdateSchema.parse(await parseJsonBody(c)),
      );
      rejectEmptyPatch(patch);
      await requirePropertyAccess(c, dependencies, propertyId);
      const existing = await resolveRepository(
        c.env,
        dependencies,
      ).getPoolAllocation({
        propertyId,
        allocationId,
      });
      if (!existing) {
        throw new HttpError(
          404,
          "pool_allocation_not_found",
          "Pool allocation not found",
        );
      }
      await validateAllocation(c, dependencies, propertyId, {
        sourcePoolId: existing.source_pool_id,
        targetPoolId: String(patch.target_pool_id ?? existing.target_pool_id),
        allocationType: String(
          patch.allocation_type ?? existing.allocation_type,
        ),
        allocationValue: serializeDecimal(
          patch.allocation_value ?? existing.allocation_value,
        ),
        excludeAllocationId: allocationId,
      });

      try {
        const allocation = await resolveRepository(
          c.env,
          dependencies,
        ).updatePoolAllocation({
          propertyId,
          allocationId,
          patch: serializePoolAllocationPatch(patch),
        });

        if (!allocation) {
          throw new HttpError(
            404,
            "pool_allocation_not_found",
            "Pool allocation not found",
          );
        }

        return c.json(allocation);
      } catch (error) {
        if (error instanceof HttpError) {
          throw error;
        }
        if (isUniqueConstraintError(error)) {
          throw new HttpError(
            409,
            "pool_allocation_conflict",
            "Allocation already exists for this source/target pair",
          );
        }
        throw error;
      }
    },
  );

  app.delete(
    "/properties/:propertyId/pool-allocations/:allocationId",
    async (c) => {
      requireLandlordEditor(c);
      const propertyId = uuidSchema.parse(c.req.param("propertyId"));
      const allocationId = uuidSchema.parse(c.req.param("allocationId"));
      await requirePropertyAccess(c, dependencies, propertyId);
      const deleted = await resolveRepository(
        c.env,
        dependencies,
      ).deletePoolAllocation({
        propertyId,
        allocationId,
      });

      if (!deleted) {
        throw new HttpError(
          404,
          "pool_allocation_not_found",
          "Pool allocation not found",
        );
      }

      return c.body(null, 204);
    },
  );

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: PoolConfigRouteDependencies,
): PoolConfigRepository {
  return (
    dependencies.repository ??
    new PostgresPoolConfigRepository(createDirectPostgresExecutor(env))
  );
}

async function requirePropertyAccess(
  c: RouteContext,
  dependencies: PoolConfigRouteDependencies,
  propertyId: string,
): Promise<void> {
  const auth = c.get("auth");
  const exists = await resolveRepository(c.env, dependencies).propertyExists({
    propertyId,
    organizationId: auth.actor.organizationId,
  });

  if (!exists) {
    throw new HttpError(404, "property_not_found", "Property not found");
  }
}

async function requirePoolBelongsToProperty(
  c: RouteContext,
  dependencies: PoolConfigRouteDependencies,
  propertyId: string,
  poolId: string,
): Promise<void> {
  const exists = await resolveRepository(
    c.env,
    dependencies,
  ).poolBelongsToProperty({
    propertyId,
    poolId,
  });

  if (!exists) {
    throw new HttpError(
      404,
      "expense_pool_not_found",
      "Expense pool not found",
    );
  }
}

async function validateExpensePoolParent(
  c: RouteContext,
  dependencies: PoolConfigRouteDependencies,
  propertyId: string,
  parentPoolId: string | null | undefined,
  currentPoolId?: string,
): Promise<void> {
  if (parentPoolId === undefined || parentPoolId === null) {
    return;
  }
  if (parentPoolId === currentPoolId) {
    throw new HttpError(
      400,
      "invalid_parent_pool",
      "Parent pool must be different from the pool being updated",
    );
  }

  const parent = await resolveRepository(c.env, dependencies).getPoolParent({
    poolId: parentPoolId,
  });
  if (!parent) {
    throw new HttpError(404, "parent_pool_not_found", "Parent pool not found");
  }
  if (parent.property_id !== propertyId) {
    throw new HttpError(
      400,
      "invalid_parent_pool",
      "Parent pool must belong to the same property",
    );
  }
  if (parent.parent_pool_id !== null) {
    throw new HttpError(
      400,
      "pool_hierarchy_too_deep",
      "Maximum hierarchy depth exceeded. Pools can only be 2 levels deep.",
    );
  }
  if (
    currentPoolId &&
    (await resolveRepository(c.env, dependencies).poolHasChildren({
      propertyId,
      poolId: currentPoolId,
    }))
  ) {
    throw new HttpError(
      400,
      "pool_hierarchy_too_deep",
      "Maximum hierarchy depth exceeded. Pools can only be 2 levels deep.",
    );
  }
}

function validateGrossUpTarget(
  pool: {
    is_gross_up_applicable?: boolean | undefined;
    gross_up_target?: string | number | null | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (pool.is_gross_up_applicable === false && pool.gross_up_target != null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gross_up_target"],
      message:
        "gross_up_target should not be set when is_gross_up_applicable is false",
    });
  }
}

async function validateAllocation(
  c: RouteContext,
  dependencies: PoolConfigRouteDependencies,
  propertyId: string,
  input: {
    sourcePoolId: string;
    targetPoolId: string;
    allocationType: string;
    allocationValue: string;
    excludeAllocationId?: string;
  },
): Promise<void> {
  if (input.allocationType !== "percentage") {
    throw new HttpError(
      422,
      "unsupported_allocation_type",
      "Only percentage pool allocations are supported for reconciliation",
    );
  }
  if (input.sourcePoolId === input.targetPoolId) {
    throw new HttpError(
      422,
      "self_allocation",
      "Source and target pools must be different",
    );
  }

  const repository = resolveRepository(c.env, dependencies);
  const poolIds = new Set(await repository.listPoolIds({ propertyId }));
  if (!poolIds.has(input.sourcePoolId) || !poolIds.has(input.targetPoolId)) {
    throw new HttpError(
      400,
      "invalid_pool_reference",
      "Source and target pools must belong to the same property",
    );
  }

  const allocationValue = new Decimal(input.allocationValue);
  if (allocationValue.lte(0) || allocationValue.gt(100)) {
    throw new HttpError(
      422,
      "invalid_allocation_value",
      "Percentage allocation value must be greater than 0 and at most 100",
    );
  }

  const total = (
    await repository.listPercentageAllocations({
      sourcePoolId: input.sourcePoolId,
    })
  )
    .filter((row) => row.id !== input.excludeAllocationId)
    .reduce(
      (sum, row) => sum.plus(new Decimal(row.allocation_value)),
      allocationValue,
    );

  if (total.gt(100)) {
    throw new HttpError(
      422,
      "allocation_total_exceeded",
      `Percentage allocations for a source pool cannot exceed 100%, got ${total.toFixed()}%`,
    );
  }
}

function requireLandlordEditor(c: RouteContext): void {
  const role = c.get("auth").actor.role;
  if (role === "owner" || role === "admin" || role === "member") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function validateGlPattern(pattern: string): void {
  if (!isValidGlPattern(pattern)) {
    throw new HttpError(
      422,
      "invalid_gl_account_pattern",
      "Invalid GL account pattern. Use digits, *, %, ?, -, or . only.",
    );
  }
}

function rejectEmptyPatch(patch: JsonObject): void {
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "empty_patch", "No fields to update");
  }
}

async function parseJsonBody(c: RouteContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Invalid JSON request body");
  }
}

function removeUndefined(record: Record<string, unknown>): JsonObject {
  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined),
  );
}

function toPageResponse<Row>(
  page: { data: Row[]; count: number },
  skip: number,
  limit: number,
): { data: Row[]; count: number; has_more: boolean } {
  return {
    data: page.data,
    count: page.count,
    has_more: page.count > skip + limit,
  };
}

function serializeExpensePool(
  body: z.infer<typeof expensePoolCreateSchema>,
): JsonObject {
  return removeUndefined({
    name: body.name,
    pool_type: body.pool_type,
    is_gross_up_applicable: body.is_gross_up_applicable,
    gross_up_target: serializeOptionalDecimal(body.gross_up_target),
    description: body.description,
    parent_pool_id: body.parent_pool_id,
  });
}

function serializeExpensePoolPatch(patch: JsonObject): JsonObject {
  return serializePatchDecimals(patch, ["gross_up_target"]);
}

function serializePoolMappingPatch(patch: JsonObject): JsonObject {
  return serializePatchDecimals(patch, ["allocation_percentage"]);
}

function serializePoolAllocationPatch(patch: JsonObject): JsonObject {
  return serializePatchDecimals(patch, ["allocation_value"]);
}

function serializePatchDecimals(
  patch: JsonObject,
  decimalFields: string[],
): JsonObject {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      decimalFields.includes(key) ? serializeOptionalDecimal(value) : value,
    ]),
  );
}

function serializeDecimal(value: unknown): string {
  return new Decimal(String(value)).toFixed();
}

function serializeOptionalDecimal(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  return serializeDecimal(value);
}

function isDecimalString(value: string): boolean {
  if (value.trim() === "") {
    return false;
  }

  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
}

function mapPoolWriteError(error: unknown, poolName: string): Error {
  if (isUniqueConstraintError(error)) {
    return new HttpError(
      409,
      "expense_pool_conflict",
      `Pool '${poolName}' already exists in this property`,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
