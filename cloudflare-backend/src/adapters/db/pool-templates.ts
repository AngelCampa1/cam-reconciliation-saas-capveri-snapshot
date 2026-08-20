import type { PostgresExecutor } from "./postgres";
import type {
  ApplyTemplateResult,
  CreatedPoolInfo,
  ExpensePoolTemplateSource,
  JsonObject,
  PoolCopyResult,
  PoolFactory,
  PoolTemplateListRecord,
  PoolTemplateRecord,
  PoolTemplateRepository,
} from "../../domain/pool-templates/repository";
import { poolCountFromStructure } from "../../domain/pool-templates/repository";

type IdRow = { id: string };
type CountRow = { total_count: string | number | bigint };

const templateFields = [
  "id",
  "name",
  "description",
  "property_type",
  "structure",
  "is_system",
  "organization_id",
  "version",
  "created_at",
  "updated_at",
].join(", ");

const templateListFields = [
  "id",
  "name",
  "description",
  "property_type",
  "structure",
  "is_system",
  "created_at",
].join(", ");

const poolFields = [
  "id",
  "name",
  "pool_type",
  "is_gross_up_applicable",
  "gross_up_target::text as gross_up_target",
  "description",
  "parent_pool_id",
].join(", ");

const templateWritableFields = [
  "name",
  "description",
  "property_type",
  "structure",
  "is_system",
  "organization_id",
  "version",
] as const;

const poolWritableFields = [
  "property_id",
  "name",
  "pool_type",
  "is_gross_up_applicable",
  "gross_up_target",
  "description",
  "parent_pool_id",
] as const;

export class PostgresPoolTemplateRepository implements PoolTemplateRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async listTemplates(input: {
    organizationId: string;
    propertyType?: string;
  }): Promise<PoolTemplateListRecord[]> {
    const filters = ["(is_system = true or organization_id = $1)"];
    const params: unknown[] = [input.organizationId];
    if (input.propertyType) {
      params.push(input.propertyType);
      filters.push(`property_type = $${params.length}`);
    }

    const result = await this.executor.query<
      Omit<PoolTemplateListRecord, "pool_count"> & { structure: JsonObject }
    >(
      [
        `select ${templateListFields}`,
        "from pool_templates",
        `where ${filters.join(" and ")}`,
        "order by is_system desc, name asc",
      ].join(" "),
      params,
    );

    return result.rows.map(({ structure, ...row }) => ({
      ...row,
      pool_count: poolCountFromStructure(structure),
    }));
  }

  async getTemplate(input: {
    templateId: string;
    organizationId: string;
  }): Promise<PoolTemplateRecord | null> {
    return this.getTemplateWithExecutor(this.executor, input);
  }

  async createTemplate(input: {
    organizationId: string;
    data: JsonObject;
  }): Promise<PoolTemplateRecord> {
    return insertReturning<PoolTemplateRecord>(
      this.executor,
      "pool_templates",
      templateWritableFields,
      {
        ...input.data,
        is_system: false,
        organization_id: input.organizationId,
        version: 1,
      },
      templateFields,
    );
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

    return updateReturning<PoolTemplateRecord>({
      executor: this.executor,
      table: "pool_templates",
      writableFields: templateWritableFields,
      patch: {
        ...input.patch,
        ...(Object.hasOwn(input.patch, "structure")
          ? { version: existing.version + 1 }
          : {}),
      },
      whereSql: "id = $1 and organization_id = $2 and is_system = false",
      whereParams: [input.templateId, input.organizationId],
      returningFields: templateFields,
    });
  }

  async deleteTemplate(input: {
    templateId: string;
    organizationId: string;
  }): Promise<boolean> {
    const result = await this.executor.query<IdRow>(
      [
        "delete from pool_templates",
        "where id = $1 and organization_id = $2 and is_system = false",
        "returning id",
      ].join(" "),
      [input.templateId, input.organizationId],
    );

    return result.rows.length > 0;
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
    return this.executor.transaction(async (executor) => {
      const template = await this.getTemplateWithExecutor(executor, {
        templateId: input.templateId,
        organizationId: input.organizationId,
      });
      if (!template) {
        return "template_not_found";
      }
      if (
        !(await propertyExists(
          executor,
          input.propertyId,
          input.organizationId,
        ))
      ) {
        return "property_not_found";
      }

      if (input.deleteExisting) {
        await deletePropertyPools(executor, input.propertyId);
      }

      const parentPools: ExpensePoolTemplateSource[] = [];
      const childPools: ExpensePoolTemplateSource[] = [];
      const parentNodes: Array<{
        node: TemplatePoolNode;
        created: ExpensePoolTemplateSource;
      }> = [];
      const structurePools = templateStructurePools(template.structure);

      for (const pool of structurePools) {
        const created = await insertPool(
          executor,
          input.poolFactory({
            propertyId: input.propertyId,
            name: pool.name,
            parentPoolId: null,
            grossUpEnabled: pool.grossUpEnabled,
          }),
        );
        parentPools.push(created);
        parentNodes.push({ node: pool, created });
      }

      for (const parent of parentNodes) {
        for (const child of parent.node.children) {
          childPools.push(
            await insertPool(
              executor,
              input.poolFactory({
                propertyId: input.propertyId,
                name: child.name,
                parentPoolId: parent.created.id,
                grossUpEnabled: child.grossUpEnabled,
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
    });
  }

  async copyPools(input: {
    sourcePropertyId: string;
    targetPropertyId: string;
    organizationId: string;
    copyMode: "merge" | "replace";
  }): Promise<
    PoolCopyResult | "source_property_not_found" | "target_property_not_found"
  > {
    return this.executor.transaction(async (executor) => {
      if (
        !(await propertyExists(
          executor,
          input.sourcePropertyId,
          input.organizationId,
        ))
      ) {
        return "source_property_not_found";
      }
      if (
        !(await propertyExists(
          executor,
          input.targetPropertyId,
          input.organizationId,
        ))
      ) {
        return "target_property_not_found";
      }

      const sourcePools = await listPropertyPools(
        executor,
        input.sourcePropertyId,
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

      const poolsDeleted =
        input.copyMode === "replace"
          ? await deletePropertyPools(executor, input.targetPropertyId)
          : 0;
      const parentIdMap = new Map<string, string>();
      const copiedPools: CreatedPoolInfo[] = [];

      for (const pool of sourcePools.filter(
        (pool) => pool.parent_pool_id === null,
      )) {
        const created = await insertPool(executor, {
          property_id: input.targetPropertyId,
          name: pool.name,
          pool_type: pool.pool_type,
          is_gross_up_applicable: pool.is_gross_up_applicable,
          gross_up_target: pool.gross_up_target,
          description: pool.description,
          parent_pool_id: null,
        });
        parentIdMap.set(pool.id, created.id);
        copiedPools.push({
          id: created.id,
          name: created.name,
          is_parent: true,
        });
      }

      for (const pool of sourcePools.filter(
        (pool) => pool.parent_pool_id !== null,
      )) {
        const newParentId = parentIdMap.get(String(pool.parent_pool_id));
        if (!newParentId) {
          continue;
        }
        const created = await insertPool(executor, {
          property_id: input.targetPropertyId,
          name: pool.name,
          pool_type: pool.pool_type,
          is_gross_up_applicable: pool.is_gross_up_applicable,
          gross_up_target: pool.gross_up_target,
          description: pool.description,
          parent_pool_id: newParentId,
        });
        copiedPools.push({
          id: created.id,
          name: created.name,
          is_parent: false,
        });
      }

      return {
        pools_copied: copiedPools.length,
        parent_pools_copied: copiedPools.filter((pool) => pool.is_parent)
          .length,
        child_pools_copied: copiedPools.filter((pool) => !pool.is_parent)
          .length,
        pools_deleted: poolsDeleted,
        copied_pools: copiedPools,
      };
    });
  }

  private async getTemplateWithExecutor(
    executor: PostgresExecutor,
    input: { templateId: string; organizationId: string },
  ): Promise<PoolTemplateRecord | null> {
    return (
      (
        await executor.query<PoolTemplateRecord>(
          [
            `select ${templateFields}`,
            "from pool_templates",
            "where id = $1 and (is_system = true or organization_id = $2)",
          ].join(" "),
          [input.templateId, input.organizationId],
        )
      ).rows[0] ?? null
    );
  }
}

async function propertyExists(
  executor: PostgresExecutor,
  propertyId: string,
  organizationId: string,
): Promise<boolean> {
  const result = await executor.query<IdRow>(
    "select id from properties where id = $1 and organization_id = $2",
    [propertyId, organizationId],
  );

  return result.rows.length > 0;
}

async function listPropertyPools(
  executor: PostgresExecutor,
  propertyId: string,
): Promise<ExpensePoolTemplateSource[]> {
  const result = await executor.query<ExpensePoolTemplateSource>(
    [
      `select ${poolFields}`,
      "from expense_pools",
      "where property_id = $1",
      "order by parent_pool_id asc nulls first, name asc",
    ].join(" "),
    [propertyId],
  );

  return result.rows;
}

async function deletePropertyPools(
  executor: PostgresExecutor,
  propertyId: string,
): Promise<number> {
  const count = await executor.query<CountRow>(
    "select count(*) as total_count from expense_pools where property_id = $1",
    [propertyId],
  );
  await executor.query("delete from expense_pools where property_id = $1", [
    propertyId,
  ]);

  return Number(count.rows[0]?.total_count ?? 0);
}

async function insertPool(
  executor: PostgresExecutor,
  values: JsonObject,
): Promise<ExpensePoolTemplateSource> {
  return insertReturning<ExpensePoolTemplateSource>(
    executor,
    "expense_pools",
    poolWritableFields,
    values,
    poolFields,
  );
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

type TemplatePoolNode = {
  name: string;
  grossUpEnabled: boolean;
  children: TemplatePoolNode[];
};

function templateStructurePools(structure: JsonObject): TemplatePoolNode[] {
  if (!Array.isArray(structure.pools)) {
    return [];
  }

  return structure.pools.map((node) => normalizeTemplateNode(node));
}

function normalizeTemplateNode(node: unknown): TemplatePoolNode {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new Error("Invalid pool template structure");
  }
  const record = node as Record<string, unknown>;
  const children = Array.isArray(record.children) ? record.children : [];

  return {
    name: String(record.name),
    grossUpEnabled:
      typeof record.gross_up_enabled === "boolean"
        ? record.gross_up_enabled
        : true,
    children: children.map((child) => normalizeTemplateNode(child)),
  };
}
