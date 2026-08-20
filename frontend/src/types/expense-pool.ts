/**
 * ExpensePool domain types for expense categorization.
 *
 * These Zod schemas match exactly with backend/app/models/expense_pool.py.
 * Expense pools categorize GL entries and define gross-up behavior
 * for expense recovery calculations.
 */

import { z } from 'zod'

import { PoolTypeSchema } from './lease-recovery-profile'

/**
 * Helper for decimal string validation for gross-up targets.
 * Values must be between 0 and 1 (representing 0% to 100%).
 */
const grossUpTargetString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal number')
  .refine(
    (val) => {
      const num = parseFloat(val)
      return num >= 0 && num <= 1
    },
    { message: 'Gross-up target must be between 0 and 1' }
  )

/**
 * Full ExpensePool model from database.
 *
 * Contains all pool configuration including gross-up settings
 * used by the financial calculation engine.
 */
export const ExpensePoolSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  pool_type: PoolTypeSchema,
  is_gross_up_applicable: z.boolean().default(true),
  gross_up_target: grossUpTargetString.nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  parent_pool_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type ExpensePool = z.infer<typeof ExpensePoolSchema>

/**
 * DTO for creating an expense pool.
 *
 * Requires property_id and pool configuration.
 */
export const ExpensePoolCreateSchema = z
  .object({
    property_id: z.string().uuid(),
    name: z.string().min(1).max(100),
    pool_type: PoolTypeSchema,
    is_gross_up_applicable: z.boolean().default(true),
    gross_up_target: grossUpTargetString.nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    parent_pool_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => {
      // gross_up_target should not be set when is_gross_up_applicable is false
      if (!data.is_gross_up_applicable && data.gross_up_target) {
        return false
      }
      return true
    },
    {
      message:
        'gross_up_target should not be set when is_gross_up_applicable is false',
      path: ['gross_up_target'],
    }
  )

export type ExpensePoolCreate = z.infer<typeof ExpensePoolCreateSchema>

/**
 * DTO for updating an expense pool.
 *
 * All fields are optional for partial updates.
 */
export const ExpensePoolUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pool_type: PoolTypeSchema.optional(),
  is_gross_up_applicable: z.boolean().optional(),
  gross_up_target: grossUpTargetString.nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  parent_pool_id: z.string().uuid().nullable().optional(),
})

export type ExpensePoolUpdate = z.infer<typeof ExpensePoolUpdateSchema>

/**
 * Summary view of an expense pool for list displays.
 *
 * Includes essential fields and aggregated totals.
 */
export const ExpensePoolSummarySchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  name: z.string(),
  pool_type: PoolTypeSchema,
  is_gross_up_applicable: z.boolean(),
  total_amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal number')
    .nullable()
    .optional(),
  entry_count: z.number().int().min(0).default(0),
})

export type ExpensePoolSummary = z.infer<typeof ExpensePoolSummarySchema>

/**
 * Expense pool with nested children for hierarchical display.
 *
 * Used for tree structure displays showing parent-child relationships.
 * Maximum depth: 2 levels (parent → child only).
 */
export const ExpensePoolWithChildrenSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.string().uuid(),
      property_id: z.string().uuid(),
      name: z.string().min(1).max(100),
      pool_type: PoolTypeSchema,
      is_gross_up_applicable: z.boolean(),
      gross_up_target: grossUpTargetString.nullable().optional(),
      description: z.string().max(500).nullable().optional(),
      parent_pool_id: z.string().uuid().nullable().optional(),
      created_at: z.string().datetime(),
      updated_at: z.string().datetime(),
      children: z.array(ExpensePoolWithChildrenSchema).default([]),
      total_amount: z
        .string()
        .regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal number')
        .nullable()
        .optional(),
    })
    .transform((data) => ({
      ...data,
      is_parent: data.children.length > 0,
      is_child:
        data.parent_pool_id !== null && data.parent_pool_id !== undefined,
    }))
)

export type ExpensePoolWithChildren = z.infer<
  typeof ExpensePoolWithChildrenSchema
>

/**
 * Helper to get display name for a pool type.
 */
export const getPoolTypeDisplayName = (poolType: string): string => {
  const displayNames: Record<string, string> = {
    operating: 'Operating Expenses',
    tax: 'Taxes',
    insurance: 'Insurance',
    capital: 'Capital Expenses',
    other: 'Other',
  }
  return displayNames[poolType] || poolType
}
