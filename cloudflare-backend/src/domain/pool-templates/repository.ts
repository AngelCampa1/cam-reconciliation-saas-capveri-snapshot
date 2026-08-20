export type JsonObject = Record<string, unknown>;

export type PoolTemplateRecord = JsonObject & {
  id: string;
  name: string;
  description: string | null;
  property_type: string | null;
  structure: JsonObject;
  is_system: boolean;
  organization_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PoolTemplateListRecord = Pick<
  PoolTemplateRecord,
  "id" | "name" | "description" | "property_type" | "is_system" | "created_at"
> & {
  pool_count: number;
};

export type ExpensePoolTemplateSource = {
  id: string;
  name: string;
  pool_type: string;
  is_gross_up_applicable: boolean;
  gross_up_target: string | null;
  description: string | null;
  parent_pool_id: string | null;
};

export type CreatedPoolInfo = {
  id: string;
  name: string;
  is_parent: boolean;
};

export type ApplyTemplateResult = {
  template_name: string;
  property_id: string;
  pools_created: number;
  parent_pools: ExpensePoolTemplateSource[];
  child_pools: ExpensePoolTemplateSource[];
};

export type PoolCopyResult = {
  pools_copied: number;
  parent_pools_copied: number;
  child_pools_copied: number;
  pools_deleted: number;
  copied_pools: CreatedPoolInfo[];
};

export type PoolTemplateRepository = {
  listTemplates(input: {
    organizationId: string;
    propertyType?: string;
  }): Promise<PoolTemplateListRecord[]>;
  getTemplate(input: {
    templateId: string;
    organizationId: string;
  }): Promise<PoolTemplateRecord | null>;
  createTemplate(input: {
    organizationId: string;
    data: JsonObject;
  }): Promise<PoolTemplateRecord>;
  updateTemplate(input: {
    templateId: string;
    organizationId: string;
    patch: JsonObject;
  }): Promise<PoolTemplateRecord | null>;
  deleteTemplate(input: {
    templateId: string;
    organizationId: string;
  }): Promise<boolean>;
  applyTemplate(input: {
    templateId: string;
    propertyId: string;
    organizationId: string;
    deleteExisting: boolean;
    poolFactory: PoolFactory;
  }): Promise<
    ApplyTemplateResult | "template_not_found" | "property_not_found"
  >;
  copyPools(input: {
    sourcePropertyId: string;
    targetPropertyId: string;
    organizationId: string;
    copyMode: "merge" | "replace";
  }): Promise<
    PoolCopyResult | "source_property_not_found" | "target_property_not_found"
  >;
};

export type PoolFactory = (input: {
  propertyId: string;
  name: string;
  parentPoolId: string | null;
  grossUpEnabled: boolean;
}) => JsonObject;

export function poolCountFromStructure(structure: JsonObject): number {
  const pools = Array.isArray(structure.pools) ? structure.pools : [];

  return pools.length;
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("unique") || message.includes("duplicate");
}
