/**
 * Pool template types for reusable pool configurations.
 *
 * Pool templates allow users to quickly set up expense pool structures
 * by applying pre-defined or custom templates to properties.
 */

import { z } from 'zod'

/**
 * Single node in pool hierarchy (parent or child pool).
 */
type PoolStructureNodeInput = {
  name: string
  gross_up_enabled?: boolean
  children?: PoolStructureNodeInput[]
}

export type PoolStructureNode = {
  name: string
  gross_up_enabled: boolean
  children: PoolStructureNode[]
}

export const PoolStructureNodeSchema: z.ZodType<
  PoolStructureNode,
  z.ZodTypeDef,
  PoolStructureNodeInput
> = z.object({
  name: z.string().min(1).max(100),
  gross_up_enabled: z.boolean().default(true),
  children: z
    .array(z.lazy(() => PoolStructureNodeSchema))
    .default([]) as z.ZodDefault<
    z.ZodArray<
      z.ZodLazy<
        z.ZodType<PoolStructureNode, z.ZodTypeDef, PoolStructureNodeInput>
      >
    >
  >,
}) as z.ZodType<PoolStructureNode, z.ZodTypeDef, PoolStructureNodeInput>

/**
 * Complete pool template structure with validation.
 */
export const PoolTemplateStructureSchema = z.object({
  pools: z.array(PoolStructureNodeSchema).min(1),
})

export type PoolTemplateStructure = z.infer<typeof PoolTemplateStructureSchema>

/**
 * Full pool template from database.
 */
export const PoolTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  property_type: z.string().nullable(),
  structure: z.record(z.any()), // JSONB structure
  is_system: z.boolean(),
  organization_id: z.string().uuid().nullable(),
  version: z.number().int().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type PoolTemplate = z.infer<typeof PoolTemplateSchema>

/**
 * Lightweight template for listing.
 */
export const PoolTemplateListSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  property_type: z.string().nullable(),
  is_system: z.boolean(),
  pool_count: z.number().int().min(0).default(0),
  created_at: z.string().datetime(),
})

export type PoolTemplateList = z.infer<typeof PoolTemplateListSchema>

/**
 * DTO for creating custom pool template.
 */
export const PoolTemplateCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  property_type: z.string().nullable().optional(),
  structure: z.record(z.any()), // Will be validated on backend
})

export type PoolTemplateCreate = z.infer<typeof PoolTemplateCreateSchema>

/**
 * DTO for updating custom pool template.
 */
export const PoolTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  property_type: z.string().nullable().optional(),
  structure: z.record(z.any()).optional(),
})

export type PoolTemplateUpdate = z.infer<typeof PoolTemplateUpdateSchema>

/**
 * Request to apply template to property.
 */
export const ApplyTemplateRequestSchema = z.object({
  template_id: z.string().uuid(),
  property_id: z.string().uuid(),
  delete_existing: z.boolean().default(true),
})

export type ApplyTemplateRequest = z.infer<typeof ApplyTemplateRequestSchema>

/**
 * Response from applying template to property.
 */
export const ApplyTemplateResponseSchema = z.object({
  template_name: z.string(),
  property_id: z.string().uuid(),
  pools_created: z.number().int().min(0),
  parent_pools: z.array(z.record(z.any())),
  child_pools: z.array(z.record(z.any())),
})

export type ApplyTemplateResponse = z.infer<typeof ApplyTemplateResponseSchema>
