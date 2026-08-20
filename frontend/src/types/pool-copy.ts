/**
 * Types for pool copy operations.
 *
 * Defines request and result types for copying expense pools
 * between properties.
 */

import { z } from 'zod'

export const CopyModeSchema = z.enum(['merge', 'replace'])
export type CopyMode = z.infer<typeof CopyModeSchema>

export const PoolCopyRequestSchema = z.object({
  source_property_id: z.string().uuid(),
  target_property_id: z.string().uuid(),
  copy_mode: CopyModeSchema.default('merge'),
})
export type PoolCopyRequest = z.infer<typeof PoolCopyRequestSchema>

export const CopiedPoolInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  is_parent: z.boolean(),
})
export type CopiedPoolInfo = z.infer<typeof CopiedPoolInfoSchema>

export const PoolCopyResultSchema = z.object({
  pools_copied: z.number().int().min(0),
  parent_pools_copied: z.number().int().min(0),
  child_pools_copied: z.number().int().min(0),
  pools_deleted: z.number().int().min(0).default(0),
  copied_pools: z.array(CopiedPoolInfoSchema).default([]),
})
export type PoolCopyResult = z.infer<typeof PoolCopyResultSchema>
