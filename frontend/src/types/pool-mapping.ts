/**
 * PoolMapping domain types for GL account to expense pool mapping.
 *
 * These Zod schemas match exactly with backend/app/models/pool_mapping.py.
 * Pool mappings support wildcard-based pattern matching for automatic
 * expense categorization. Patterns support:
 * - `*` matches any sequence of characters (e.g., '51*' matches '5100', '51234')
 * - `?` matches exactly one character (e.g., '51??' matches '5100', '5199')
 */

import { z } from 'zod'

/**
 * Validates that a GL account pattern contains only valid characters.
 *
 * Valid characters:
 * - Digits 0-9
 * - Wildcard * (matches any sequence)
 * - Wildcard ? (matches single character)
 * - Hyphen - (for account ranges like '5100-5199')
 */
export const isValidGLPattern = (pattern: string): boolean => {
  if (!pattern) {
    return false
  }
  const validPattern = /^[0-9*?-]+$/
  return validPattern.test(pattern)
}

/**
 * Convert a GL account pattern to a regex pattern.
 */
export const patternToRegex = (pattern: string): RegExp => {
  // Escape special regex chars except our wildcards
  let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  // Convert our wildcards to regex
  // * becomes .* (any sequence)
  // ? becomes . (single char)
  escaped = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

/**
 * Check if a GL account matches a wildcard pattern.
 */
export const matchesGLPattern = (
  glAccount: string,
  pattern: string
): boolean => {
  const regex = patternToRegex(pattern)
  return regex.test(glAccount)
}

/**
 * Helper for validating GL account patterns in Zod schemas.
 */
const glAccountPatternString = z
  .string()
  .min(1, 'Pattern is required')
  .max(50, 'Pattern must be 50 characters or less')
  .refine(isValidGLPattern, {
    message: 'Pattern must contain only digits, wildcards (* or ?), or hyphens',
  })

/**
 * Helper for allocation percentage validation.
 * Values must be between 0 and 1 (representing 0% to 100%).
 */
const allocationPercentageString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal number')
  .refine(
    (val) => {
      const num = parseFloat(val)
      return num >= 0 && num <= 1
    },
    { message: 'Allocation percentage must be between 0 and 1' }
  )

/**
 * Full PoolMapping model from database.
 *
 * Maps GL account patterns to expense pools for automatic
 * expense categorization during reconciliation.
 */
export const PoolMappingSchema = z.object({
  id: z.string().uuid(),
  expense_pool_id: z.string().uuid(),
  gl_account_pattern: glAccountPatternString,
  allocation_percentage: allocationPercentageString,
  priority: z.number().int().min(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type PoolMapping = z.infer<typeof PoolMappingSchema>

/**
 * DTO for creating a pool mapping.
 *
 * Requires expense_pool_id and pattern. Defaults to 100% allocation
 * and priority 0.
 */
export const PoolMappingCreateSchema = z.object({
  expense_pool_id: z.string().uuid(),
  gl_account_pattern: glAccountPatternString,
  allocation_percentage: allocationPercentageString.default('1.0'),
  priority: z.number().int().min(0).default(0),
})

export type PoolMappingCreate = z.infer<typeof PoolMappingCreateSchema>

/**
 * DTO for updating a pool mapping.
 *
 * All fields are optional for partial updates.
 */
export const PoolMappingUpdateSchema = z.object({
  gl_account_pattern: glAccountPatternString.optional(),
  allocation_percentage: allocationPercentageString.optional(),
  priority: z.number().int().min(0).optional(),
})

export type PoolMappingUpdate = z.infer<typeof PoolMappingUpdateSchema>

/**
 * Summary view of a pool mapping for list displays.
 *
 * Includes pattern info and optionally the pool name for display.
 */
export const PoolMappingSummarySchema = z.object({
  id: z.string().uuid(),
  expense_pool_id: z.string().uuid(),
  gl_account_pattern: z.string(),
  allocation_percentage: allocationPercentageString,
  priority: z.number().int().min(0),
  pool_name: z.string().nullable().optional(),
})

export type PoolMappingSummary = z.infer<typeof PoolMappingSummarySchema>

/**
 * Helper to format allocation percentage for display.
 */
export const formatAllocationPercentage = (value: string): string => {
  const num = parseFloat(value)
  if (isNaN(num)) {
    return value
  }
  return `${(num * 100).toFixed(0)}%`
}

/**
 * Helper to describe a GL pattern for display.
 */
export const describeGLPattern = (pattern: string): string => {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return `Exact match: ${pattern}`
  }

  const parts: string[] = []
  if (pattern.includes('*')) {
    parts.push('* matches any sequence')
  }
  if (pattern.includes('?')) {
    parts.push('? matches single character')
  }

  return `Pattern: ${pattern} (${parts.join(', ')})`
}
