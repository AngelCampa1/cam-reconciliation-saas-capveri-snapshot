import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  ApplyTemplateResult,
  JsonObject,
  PoolCopyResult,
  PoolFactory,
  PoolTemplateListRecord,
  PoolTemplateRecord,
  PoolTemplateRepository,
} from "../domain/pool-templates/repository";
import type { AppEnv } from "../env";
import { createPoolTemplateRoutes } from "../http/pool-template-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111112";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SYSTEM_TEMPLATE_ID = "33333333-3333-4333-8333-333333333331";
const CUSTOM_TEMPLATE_ID = "33333333-3333-4333-8333-333333333332";
const OTHER_TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_PROPERTY_ID = "44444444-4444-4444-8444-444444444441";
const TARGET_PROPERTY_ID = "44444444-4444-4444-8444-444444444442";
const OTHER_PROPERTY_ID = "44444444-4444-4444-8444-444444444443";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

type PoolRecord = {
  id: string;
  property_id: string;
  name: string;
  pool_type: string;
  is_gross_up_applicable: boolean;
  gross_up_target: string | null;
  description: string | null;
  parent_pool_id: string | null;
};

class MemoryPoolTemplateRepository implements PoolTemplateRepository {
  readonly properties = new Map([
    [SOURCE_PROPERTY_ID, ORG_ID],
    [TARGET_PROPERTY_ID, ORG_ID],
    [OTHER_PROPERTY_ID, OTHER_ORG_ID],
  ]);
  readonly templates = new Map<string, PoolTemplateRecord>([
    [
      SYSTEM_TEMPLATE_ID,
      templateRecord({
        id: SYSTEM_TEMPLATE_ID,
        name: "Office Building",
        is_system: true,
        organization_id: null,
        property_type: "office",
      }),
    ],
    [
      CUSTOM_TEMPLATE_ID,
      templateRecord({
        id: CUSTOM_TEMPLATE_ID,
        name: "Custom Retail",
        is_system: false,
        organization_id: ORG_ID,
        property_type: "retail",
      }),
    ],
    [
      OTHER_TEMPLATE_ID,
      templateRecord({
        id: OTHER_TEMPLATE_ID,
        name: "Other Org Template",
        is_system: false,
        organization_id: OTHER_ORG_ID,
        property_type: "office",
      }),
    ],
  ]);
  readonly pools = new Map<string, PoolRecord>([
    [
      "55555555-5555-4555-8555-555555555551",
      poolRecord({
        id: "55555555-5555-4555-8555-555555555551",
        property_id: SOURCE_PROPERTY_ID,
        name: "Operating Expenses",
        parent_pool_id: null,
      }),
    ],
    [
      "55555555-5555-4555-8555-555555555552",
      poolRecord({
        id: "55555555-5555-4555-8555-555555555552",
        property_id: SOURCE_PROPERTY_ID,
        name: "Janitorial",
        parent_pool_id: "55555555-5555-4555-8555-555555555551",
      }),
    ],
    [
      "55555555-5555-4555-8555-555555555553",
      poolRecord({
        id: "55555555-5555-4555-8555-555555555553",
        property_id: TARGET_PROPERTY_ID,
        name: "Existing Target Pool",
        parent_pool_id: null,
      }),
    ],
  ]);

  async listTemplates(input: {
    organizationId: string;
    propertyType?: string;
  }): Promise<PoolTemplateListRecord[]> {
    return [...this.templates.values()]
      .filter(
        (template) =>
          template.is_system ||
          template.organization_id === input.organizationId,
      )
      .filter(
        (template) =>
          !input.propertyType || template.property_type === input.propertyType,
      )
      .sort((left, right) => {
        if (left.is_system !== right.is_system) {
          return left.is_system ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        property_type: template.property_type,
        is_system: template.is_system,
        pool_count: structurePools(template.structure).length,
        created_at: template.created_at,
      }));
  }

  async getTemplate(input: {
    templateId: string;
    organizationId: string;
  }): Promise<PoolTemplateRecord | null> {
    const template = this.templates.get(input.templateId);
    if (
      !template ||
      (!template.is_system && template.organization_id !== input.organizationId)
    ) {
      return null;
    }

    return template;
  }

  async createTemplate(input: {
    organizationId: string;
    data: JsonObject;
  }): Promise<PoolTemplateRecord> {
    const record = templateRecord({
      id: "33333333-3333-4333-8333-333333333334",
      name: String(input.data.name),
      description: nullableString(input.data.description),
      property_type: nullableString(input.data.property_type),
      structure: objectValue(input.data.structure),
      is_system: false,
      organization_id: input.organizationId,
      version: 1,
    });
    this.templates.set(record.id, record);

    return record;
  }

  async updateTemplate(input: {
    templateId: string;
    organizationId: string;
    patch: JsonObject;
  }): Promise<PoolTemplateRecord | null> {
    const existing = await this.getTemplate(input);
    if (
      !existing ||
      existing.is_system ||
      existing.organization_id !== input.organizationId
    ) {
      return null;
    }
    const updated = {
      ...existing,
      ...input.patch,
      version: Object.hasOwn(input.patch, "structure")
        ? existing.version + 1
        : existing.version,
    } as PoolTemplateRecord;
    this.templates.set(input.templateId, updated);

    return updated;
  }

  async deleteTemplate(input: {
    templateId: string;
    organizationId: string;
  }): Promise<boolean> {
    const existing = await this.getTemplate(input);
    if (
      !existing ||
      existing.is_system ||
      existing.organization_id !== input.organizationId
    ) {
      return false;
    }

    return this.templates.delete(input.templateId);
  }

  async applyTemplate(input: {
    templateId: string;
    propertyId: string;
    organizationId: string;
    deleteExisting: boolean;
    poolFactory: PoolFactory;
  }): Promise<
    ApplyTemplateResult | "template_not_found" | "property_not_found"
  > {
    const template = await this.getTemplate({
      templateId: input.templateId,
      organizationId: input.organizationId,
    });
    if (!template) {
      return "template_not_found";
    }
    if (this.properties.get(input.propertyId) !== input.organizationId) {
      return "property_not_found";
    }
    if (input.deleteExisting) {
      for (const [poolId, pool] of this.pools) {
        if (pool.property_id === input.propertyId) {
          this.pools.delete(poolId);
        }
      }
    }

    const parentPools: PoolRecord[] = [];
    const childPools: PoolRecord[] = [];
    const parentIdByName = new Map<string, string>();
    for (const pool of structurePools(template.structure)) {
      const created = this.createPool(
        input.poolFactory({
          propertyId: input.propertyId,
          name: String(pool.name),
          parentPoolId: null,
          grossUpEnabled: booleanValue(pool.gross_up_enabled, true),
        }),
      );
      parentPools.push(created);
      parentIdByName.set(String(pool.name), created.id);
    }

    for (const pool of structurePools(template.structure)) {
      const parentId = parentIdByName.get(String(pool.name));
      if (!parentId) {
        continue;
      }
      for (const child of childrenFromNode(pool)) {
        childPools.push(
          this.createPool(
            input.poolFactory({
              propertyId: input.propertyId,
              name: String(child.name),
              parentPoolId: parentId,
              grossUpEnabled: booleanValue(child.gross_up_enabled, true),
            }),
          ),
        );
      }
    }

    return {
      template_name: template.name,
      property_id: input.propertyId,
      pools_created: parentPools.length + childPools.length,
      parent_pools: parentPools,
      child_pools: childPools,
    };
  }

  async copyPools(input: {
    sourcePropertyId: string;
    targetPropertyId: string;
    organizationId: string;
    copyMode: "merge" | "replace";
  }): Promise<
    PoolCopyResult | "source_property_not_found" | "target_property_not_found"
  > {
    if (this.properties.get(input.sourcePropertyId) !== input.organizationId) {
      return "source_property_not_found";
    }
    if (this.properties.get(input.targetPropertyId) !== input.organizationId) {
      return "target_property_not_found";
    }
    const sourcePools = [...this.pools.values()].filter(
      (pool) => pool.property_id === input.sourcePropertyId,
    );
    if (sourcePools.length === 0) {
      return {
        pools_copied: 0,
        parent_pools_copied: 0,
        child_pools_copied: 0,
        pools_deleted: 0,
        copied_pools: [],
      };
    }

    let poolsDeleted = 0;
    if (input.copyMode === "replace") {
      for (const [poolId, pool] of this.pools) {
        if (pool.property_id === input.targetPropertyId) {
          this.pools.delete(poolId);
          poolsDeleted += 1;
        }
      }
    }

    const parentIdMap = new Map<string, string>();
    const copiedPools: Array<{ id: string; name: string; is_parent: boolean }> =
      [];
    for (const pool of sourcePools.filter(
      (candidate) => candidate.parent_pool_id === null,
    )) {
      const created = this.createPool({
        ...pool,
        property_id: input.targetPropertyId,
        parent_pool_id: null,
      });
      parentIdMap.set(pool.id, created.id);
      copiedPools.push({ id: created.id, name: created.name, is_parent: true });
    }
    for (const pool of sourcePools.filter(
      (candidate) => candidate.parent_pool_id !== null,
    )) {
      const parentPoolId = parentIdMap.get(String(pool.parent_pool_id));
      if (!parentPoolId) {
        continue;
      }
      const created = this.createPool({
        ...pool,
        property_id: input.targetPropertyId,
        parent_pool_id: parentPoolId,
      });
      copiedPools.push({
        id: created.id,
        name: created.name,
        is_parent: false,
      });
    }

    return {
      pools_copied: copiedPools.length,
      parent_pools_copied: copiedPools.filter((pool) => pool.is_parent).length,
      child_pools_copied: copiedPools.filter((pool) => !pool.is_parent).length,
      pools_deleted: poolsDeleted,
      copied_pools: copiedPools,
    };
  }

  private createPool(data: JsonObject): PoolRecord {
    const propertyId = String(data.property_id);
    const name = String(data.name);
    if (
      [...this.pools.values()].some(
        (pool) =>
          pool.property_id === propertyId &&
          pool.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new Error("duplicate key value violates unique constraint");
    }

    const record = poolRecord({
      ...data,
      id: `55555555-5555-4555-8555-${String(this.pools.size + 1).padStart(12, "0")}`,
    });
    this.pools.set(record.id, record);

    return record;
  }
}

function createTestApp(
  options: {
    repository?: MemoryPoolTemplateRepository;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
) {
  const repository = options.repository ?? new MemoryPoolTemplateRepository();
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
    createPoolTemplateRoutes({
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

describe("pool template routes", () => {
  it("lists system and org templates with optional property type filtering", async () => {
    const { app } = createTestApp();
    const allResponse = await app.request(
      "/api/v1/pool-templates",
      { headers: authHeaders() },
      env(),
    );
    const officeResponse = await app.request(
      "/api/v1/pool-templates?property_type=office",
      { headers: authHeaders() },
      env(),
    );
    const all = arrayValue(await allResponse.json());
    const office = arrayValue(await officeResponse.json());

    expect(allResponse.status).toBe(200);
    expect(all).toHaveLength(2);
    expect(objectValue(all[0]).is_system).toBe(true);
    expect(office).toHaveLength(1);
    expect(objectValue(office[0]).id).toBe(SYSTEM_TEMPLATE_ID);
  });

  it("gets, creates, updates, and deletes custom templates", async () => {
    const { app, repository } = createTestApp();
    const getResponse = await app.request(
      `/api/v1/pool-templates/${CUSTOM_TEMPLATE_ID}`,
      { headers: authHeaders() },
      env(),
    );
    const createResponse = await app.request(
      "/api/v1/pool-templates",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "New Template",
          property_type: "office",
          structure: simpleStructure(),
        }),
      },
      env(),
    );
    const updateResponse = await app.request(
      `/api/v1/pool-templates/${CUSTOM_TEMPLATE_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "Updated Retail",
          structure: simpleStructure("Taxes & Insurance"),
        }),
      },
      env(),
    );
    const deleteResponse = await app.request(
      `/api/v1/pool-templates/${CUSTOM_TEMPLATE_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    const created = await jsonObject(createResponse);
    const updated = await jsonObject(updateResponse);

    expect(getResponse.status).toBe(200);
    expect(createResponse.status).toBe(201);
    expect(created.name).toBe("New Template");
    expect(updateResponse.status).toBe(200);
    expect(updated.name).toBe("Updated Retail");
    expect(updated.version).toBe(2);
    expect(deleteResponse.status).toBe(204);
    expect(repository.templates.has(CUSTOM_TEMPLATE_ID)).toBe(false);
  });

  it("rejects system template mutation and invalid template hierarchy", async () => {
    const { app } = createTestApp();
    const systemUpdateResponse = await app.request(
      `/api/v1/pool-templates/${SYSTEM_TEMPLATE_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: "Mutated" }),
      },
      env(),
    );
    const invalidCreateResponse = await app.request(
      "/api/v1/pool-templates",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "Invalid",
          structure: {
            pools: [
              {
                name: "Parent",
                children: [
                  { name: "Child", children: [{ name: "Grandchild" }] },
                ],
              },
            ],
          },
        }),
      },
      env(),
    );
    const systemBody = await jsonObject(systemUpdateResponse);
    const invalidBody = await jsonObject(invalidCreateResponse);

    expect(systemUpdateResponse.status).toBe(403);
    expect(errorCode(systemBody)).toBe("system_template_immutable");
    expect(invalidCreateResponse.status).toBe(422);
    expect(errorCode(invalidBody)).toBe("validation_error");
  });

  it("rejects duplicate template pool names before apply/copy can hit the database", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/api/v1/pool-templates",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "Duplicate Names",
          structure: {
            pools: [
              {
                name: "Operating Expenses",
                children: [{ name: "Operating Expenses" }],
              },
            ],
          },
        }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(422);
    expect(errorCode(body)).toBe("validation_error");
  });

  it("applies templates and normalizes expense pool fields", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/api/v1/pool-templates/apply",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          template_id: SYSTEM_TEMPLATE_ID,
          property_id: TARGET_PROPERTY_ID,
          delete_existing: true,
        }),
      },
      env(),
    );
    const body = await jsonObject(response);
    const targetPools = [...repository.pools.values()].filter(
      (pool) => pool.property_id === TARGET_PROPERTY_ID,
    );

    expect(response.status).toBe(200);
    expect(body.template_name).toBe("Office Building");
    expect(body.pools_created).toBe(2);
    expect(targetPools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Operating Expenses",
          pool_type: "operating",
          is_gross_up_applicable: true,
        }),
        expect.objectContaining({
          name: "Janitorial",
          pool_type: "operating",
          is_gross_up_applicable: true,
        }),
      ]),
    );
    expect(
      targetPools.some((pool) => pool.name === "Existing Target Pool"),
    ).toBe(false);
  });

  it("returns not found when applying a template to another org property", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      "/api/v1/pool-templates/apply",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          template_id: SYSTEM_TEMPLATE_ID,
          property_id: OTHER_PROPERTY_ID,
        }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(404);
    expect(errorCode(body)).toBe("property_not_found");
  });

  it("copies pools with merge and replace modes", async () => {
    const { app, repository } = createTestApp();
    const mergeResponse = await app.request(
      "/api/v1/pool-templates/copy",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_property_id: SOURCE_PROPERTY_ID,
          target_property_id: TARGET_PROPERTY_ID,
          copy_mode: "merge",
        }),
      },
      env(),
    );
    const replaceResponse = await app.request(
      "/api/v1/pool-templates/copy",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_property_id: SOURCE_PROPERTY_ID,
          target_property_id: TARGET_PROPERTY_ID,
          copy_mode: "replace",
        }),
      },
      env(),
    );
    const merge = await jsonObject(mergeResponse);
    const replace = await jsonObject(replaceResponse);

    expect(mergeResponse.status).toBe(200);
    expect(merge.pools_copied).toBe(2);
    expect(merge.parent_pools_copied).toBe(1);
    expect(merge.child_pools_copied).toBe(1);
    expect(merge.pools_deleted).toBe(0);
    expect(replaceResponse.status).toBe(200);
    expect(replace.pools_copied).toBe(2);
    expect(Number(replace.pools_deleted)).toBeGreaterThan(0);
    expect(
      [...repository.pools.values()].filter(
        (pool) => pool.property_id === TARGET_PROPERTY_ID,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Operating Expenses" }),
        expect.objectContaining({ name: "Janitorial" }),
      ]),
    );
  });

  it("returns a conflict when merge copy collides with target pool names", async () => {
    const { app, repository } = createTestApp();
    repository.pools.set(
      "55555555-5555-4555-8555-555555555554",
      poolRecord({
        id: "55555555-5555-4555-8555-555555555554",
        property_id: TARGET_PROPERTY_ID,
        name: "Operating Expenses",
        parent_pool_id: null,
      }),
    );

    const response = await app.request(
      "/api/v1/pool-templates/copy",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_property_id: SOURCE_PROPERTY_ID,
          target_property_id: TARGET_PROPERTY_ID,
          copy_mode: "merge",
        }),
      },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(409);
    expect(errorCode(body)).toBe("pool_name_conflict");
  });

  it("rejects same-property copy and viewer mutations", async () => {
    const { app } = createTestApp({ role: "viewer" });
    const viewerResponse = await app.request(
      "/api/v1/pool-templates",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: "Denied", structure: simpleStructure() }),
      },
      env(),
    );
    const { app: editorApp } = createTestApp();
    const samePropertyResponse = await editorApp.request(
      "/api/v1/pool-templates/copy",
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          source_property_id: SOURCE_PROPERTY_ID,
          target_property_id: SOURCE_PROPERTY_ID,
        }),
      },
      env(),
    );
    const viewerBody = await jsonObject(viewerResponse);
    const samePropertyBody = await jsonObject(samePropertyResponse);

    expect(viewerResponse.status).toBe(403);
    expect(errorCode(viewerBody)).toBe("insufficient_permissions");
    expect(samePropertyResponse.status).toBe(422);
    expect(errorCode(samePropertyBody)).toBe("validation_error");
  });
});

function templateRecord(
  overrides: Partial<PoolTemplateRecord>,
): PoolTemplateRecord {
  return {
    id: overrides.id ?? SYSTEM_TEMPLATE_ID,
    name: overrides.name ?? "Template",
    description: overrides.description ?? null,
    property_type: overrides.property_type ?? null,
    structure: overrides.structure ?? simpleStructure(),
    is_system: overrides.is_system ?? true,
    organization_id: overrides.organization_id ?? null,
    version: overrides.version ?? 1,
    created_at: "2026-06-13T00:00:00Z",
    updated_at: "2026-06-13T00:00:00Z",
  };
}

function poolRecord(overrides: Partial<PoolRecord>): PoolRecord {
  return {
    id: String(overrides.id ?? "55555555-5555-4555-8555-555555555551"),
    property_id: String(overrides.property_id ?? SOURCE_PROPERTY_ID),
    name: String(overrides.name ?? "Operating Expenses"),
    pool_type: String(overrides.pool_type ?? "operating"),
    is_gross_up_applicable: Boolean(overrides.is_gross_up_applicable ?? true),
    gross_up_target: overrides.gross_up_target ?? null,
    description: overrides.description ?? null,
    parent_pool_id: overrides.parent_pool_id ?? null,
  };
}

function simpleStructure(name = "Operating Expenses"): JsonObject {
  return {
    pools: [
      {
        name,
        gross_up_enabled: true,
        children: [{ name: "Janitorial", gross_up_enabled: true }],
      },
    ],
  };
}

function nullableString(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function structurePools(structure: JsonObject): Record<string, unknown>[] {
  return Array.isArray(structure.pools)
    ? structure.pools.map((pool) => objectValue(pool))
    : [];
}

function childrenFromNode(
  node: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(node.children)
    ? node.children.map((child) => objectValue(child))
    : [];
}
