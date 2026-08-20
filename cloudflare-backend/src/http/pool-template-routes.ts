import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresPoolTemplateRepository } from "../adapters/db/pool-templates";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  isUniqueConstraintError,
  type JsonObject,
  type PoolTemplateRepository,
} from "../domain/pool-templates/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type PoolTemplateRouteDependencies = {
  repository?: PoolTemplateRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
type PoolStructureNode = {
  name: string;
  gross_up_enabled: boolean;
  children: PoolStructureNode[];
};
type PoolStructureNodeInput = {
  name: string;
  gross_up_enabled?: boolean | undefined;
  children?: PoolStructureNodeInput[] | undefined;
};
const poolStructureNodeSchema: z.ZodType<
  PoolStructureNode,
  z.ZodTypeDef,
  PoolStructureNodeInput
> = z.lazy(() =>
  z.object({
    name: z.string().trim().min(1).max(100),
    gross_up_enabled: z.boolean().default(true),
    children: z.array(poolStructureNodeSchema).default([]),
  }),
);
const poolTemplateStructureSchema = z
  .object({
    pools: z.array(poolStructureNodeSchema).min(1),
  })
  .superRefine((structure, context) => {
    const names = new Set<string>();
    for (const [poolIndex, pool] of structure.pools.entries()) {
      validateUniquePoolName(pool.name, names, context, [
        "pools",
        poolIndex,
        "name",
      ]);
      for (const [childIndex, child] of pool.children.entries()) {
        validateUniquePoolName(child.name, names, context, [
          "pools",
          poolIndex,
          "children",
          childIndex,
          "name",
        ]);
        if (child.children.length > 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["pools", poolIndex, "children", childIndex, "children"],
            message:
              "Pool hierarchy cannot exceed 2 levels (parent -> child only)",
          });
        }
      }
    }
  });
const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  property_type: z.string().trim().min(1).nullable().optional(),
  structure: poolTemplateStructureSchema,
});
const templateUpdateSchema = templateCreateSchema.partial();
const applyTemplateSchema = z.object({
  template_id: uuidSchema,
  property_id: uuidSchema,
  delete_existing: z.boolean().default(true),
});
const copyPoolsSchema = z
  .object({
    source_property_id: uuidSchema,
    target_property_id: uuidSchema,
    copy_mode: z.enum(["merge", "replace"]).default("merge"),
  })
  .refine(
    (request) => request.source_property_id !== request.target_property_id,
    {
      path: ["target_property_id"],
      message:
        "Cannot copy pools to the same property. Source and target must be different.",
    },
  );

export function createPoolTemplateRoutes(
  dependencies: PoolTemplateRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/pool-templates/*", authMiddleware(dependencies.auth));
  app.use("/pool-templates", authMiddleware(dependencies.auth));

  app.get("/pool-templates", async (c) => {
    const propertyType = c.req.query("property_type");
    const templates = await resolveRepository(
      c.env,
      dependencies,
    ).listTemplates({
      organizationId: c.get("auth").actor.organizationId,
      ...(propertyType ? { propertyType } : {}),
    });

    return c.json(templates);
  });

  app.get("/pool-templates/:templateId", async (c) => {
    const templateId = uuidSchema.parse(c.req.param("templateId"));
    const template = await resolveRepository(c.env, dependencies).getTemplate({
      templateId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!template) {
      throw new HttpError(404, "pool_template_not_found", "Template not found");
    }

    return c.json(template);
  });

  app.post("/pool-templates", async (c) => {
    requireLandlordEditor(c);
    const body = templateCreateSchema.parse(await parseJsonBody(c));

    try {
      const template = await resolveRepository(
        c.env,
        dependencies,
      ).createTemplate({
        organizationId: c.get("auth").actor.organizationId,
        data: serializeTemplateCreate(body),
      });

      return c.json(template, 201);
    } catch (error) {
      throw mapTemplateWriteError(error, "Failed to create template");
    }
  });

  app.put("/pool-templates/:templateId", async (c) => {
    requireLandlordEditor(c);
    const templateId = uuidSchema.parse(c.req.param("templateId"));
    const patch = removeUndefined(
      templateUpdateSchema.parse(await parseJsonBody(c)),
    );
    const existing = await resolveRepository(c.env, dependencies).getTemplate({
      templateId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!existing) {
      throw new HttpError(404, "pool_template_not_found", "Template not found");
    }
    if (existing.is_system) {
      throw new HttpError(
        403,
        "system_template_immutable",
        "Cannot update system templates",
      );
    }

    if (Object.keys(patch).length === 0) {
      return c.json(existing);
    }

    try {
      const template = await resolveRepository(
        c.env,
        dependencies,
      ).updateTemplate({
        templateId,
        organizationId: c.get("auth").actor.organizationId,
        patch: serializeTemplatePatch(patch),
      });

      if (!template) {
        throw new HttpError(
          404,
          "pool_template_not_found",
          "Template not found",
        );
      }

      return c.json(template);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw mapTemplateWriteError(error, "Failed to update template");
    }
  });

  app.delete("/pool-templates/:templateId", async (c) => {
    requireLandlordEditor(c);
    const templateId = uuidSchema.parse(c.req.param("templateId"));
    const existing = await resolveRepository(c.env, dependencies).getTemplate({
      templateId,
      organizationId: c.get("auth").actor.organizationId,
    });

    if (!existing) {
      throw new HttpError(404, "pool_template_not_found", "Template not found");
    }
    if (existing.is_system) {
      throw new HttpError(
        403,
        "system_template_immutable",
        "Cannot delete system templates",
      );
    }

    const deleted = await resolveRepository(c.env, dependencies).deleteTemplate(
      {
        templateId,
        organizationId: c.get("auth").actor.organizationId,
      },
    );

    if (!deleted) {
      throw new HttpError(404, "pool_template_not_found", "Template not found");
    }

    return c.body(null, 204);
  });

  app.post("/pool-templates/apply", async (c) => {
    requireLandlordEditor(c);
    const body = applyTemplateSchema.parse(await parseJsonBody(c));
    const result = await applyTemplate(c, dependencies, body);

    if (result === "template_not_found") {
      throw new HttpError(404, "pool_template_not_found", "Template not found");
    }
    if (result === "property_not_found") {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    return c.json(result);
  });

  app.post("/pool-templates/copy", async (c) => {
    requireLandlordEditor(c);
    const body = copyPoolsSchema.parse(await parseJsonBody(c));
    const result = await copyPools(c, dependencies, body);

    if (result === "source_property_not_found") {
      throw new HttpError(
        404,
        "source_property_not_found",
        `Source property ${body.source_property_id} not found or access denied`,
      );
    }
    if (result === "target_property_not_found") {
      throw new HttpError(
        404,
        "target_property_not_found",
        `Target property ${body.target_property_id} not found or access denied`,
      );
    }

    return c.json(result);
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: PoolTemplateRouteDependencies,
): PoolTemplateRepository {
  return (
    dependencies.repository ??
    new PostgresPoolTemplateRepository(createDirectPostgresExecutor(env))
  );
}

async function applyTemplate(
  c: RouteContext,
  dependencies: PoolTemplateRouteDependencies,
  body: z.infer<typeof applyTemplateSchema>,
) {
  try {
    return await resolveRepository(c.env, dependencies).applyTemplate({
      templateId: body.template_id,
      propertyId: body.property_id,
      organizationId: c.get("auth").actor.organizationId,
      deleteExisting: body.delete_existing,
      poolFactory: createPoolFromTemplateNode,
    });
  } catch (error) {
    throw mapPoolWriteError(error);
  }
}

async function copyPools(
  c: RouteContext,
  dependencies: PoolTemplateRouteDependencies,
  body: z.infer<typeof copyPoolsSchema>,
) {
  try {
    return await resolveRepository(c.env, dependencies).copyPools({
      sourcePropertyId: body.source_property_id,
      targetPropertyId: body.target_property_id,
      organizationId: c.get("auth").actor.organizationId,
      copyMode: body.copy_mode,
    });
  } catch (error) {
    throw mapPoolWriteError(error);
  }
}

async function parseJsonBody(c: RouteContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Invalid JSON request body");
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

function serializeTemplateCreate(
  body: z.infer<typeof templateCreateSchema>,
): JsonObject {
  return removeUndefined({
    name: body.name,
    description: body.description,
    property_type: body.property_type,
    structure: body.structure,
  });
}

function serializeTemplatePatch(patch: JsonObject): JsonObject {
  return removeUndefined({
    name: patch.name,
    description: patch.description,
    property_type: patch.property_type,
    structure: patch.structure,
  });
}

function removeUndefined(record: Record<string, unknown>): JsonObject {
  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined),
  );
}

function validateUniquePoolName(
  name: string,
  names: Set<string>,
  context: z.RefinementCtx,
  path: Array<string | number>,
): void {
  const key = name.trim().toLowerCase();
  if (names.has(key)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "Pool template names must be unique within a template",
    });
    return;
  }

  names.add(key);
}

function createPoolFromTemplateNode(input: {
  propertyId: string;
  name: string;
  parentPoolId: string | null;
  grossUpEnabled: boolean;
}): JsonObject {
  return {
    property_id: input.propertyId,
    name: input.name,
    pool_type: inferPoolType(input.name),
    is_gross_up_applicable: input.grossUpEnabled,
    gross_up_target: null,
    description: null,
    parent_pool_id: input.parentPoolId,
  };
}

function inferPoolType(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("tax")) {
    return "tax";
  }
  if (normalized.includes("insurance")) {
    return "insurance";
  }
  if (normalized.includes("capital")) {
    return "capital";
  }

  return "operating";
}

function mapTemplateWriteError(error: unknown, message: string): Error {
  if (isUniqueConstraintError(error)) {
    return new HttpError(409, "pool_template_conflict", message);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function mapPoolWriteError(error: unknown): Error {
  if (isUniqueConstraintError(error)) {
    return new HttpError(
      409,
      "pool_name_conflict",
      "A pool with this name already exists on the target property",
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
