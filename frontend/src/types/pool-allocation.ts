/**
 * PoolAllocation domain types for split expense allocations.
 *
 * These Zod schemas match exactly with backend/app/models/pool_allocation.py.
 * Pool allocations handle splitting expenses from a source pool
 * to multiple target pools with percentage or fixed amount allocations.
 */

import { z } from 'zod'

/**
 * Helper for allocation value validation.
 * For percentage: must be between 0 and 100
 * For fixed_amount: must be positive
 */
const allocationValueString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a valid decimal number')
  .refine(
    (val) => {
      const num = parseFloat(val)
      return num > 0
    },
    { message: 'Allocation value must be positive' }
  )

/**
 * AllocationType enum matching backend.
 */
const AllocationTypeSchema = z.enum(['percentage', 'fixed_amount'])

/**
 * Full PoolAllocation model from database.
 *
 * Represents a single allocation from a source pool to a target pool.
 */
export const PoolAllocationSchema = z.object({
  id: z.string().uuid(),
  source_pool_id: z.string().uuid(),
  target_pool_id: z.string().uuid(),
  allocation_type: AllocationTypeSchema,
  allocation_value: allocationValueString,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type PoolAllocation = z.infer<typeof PoolAllocationSchema>

export interface PoolAllocationListResponse {
  data: PoolAllocation[]
  count: number
  has_more: boolean
}

/**
 * DTO for creating a pool allocation.
 */
export const PoolAllocationCreateSchema = z
  .object({
    source_pool_id: z.string().uuid(),
    target_pool_id: z.string().uuid(),
    allocation_type: AllocationTypeSchema,
    allocation_value: allocationValueString,
  })
  .refine(
    (data) => {
      // Validate percentage range
      if (data.allocation_type === 'percentage') {
        const value = parseFloat(data.allocation_value)
        return value > 0 && value <= 100
      }
      // Fixed amounts just need to be positive (already validated by allocationValueString)
      return true
    },
    {
      message: 'Percentage allocation must be between 0 and 100',
      path: ['allocation_value'],
    }
  )

export type PoolAllocationCreate = z.infer<typeof PoolAllocationCreateSchema>

/**
 * DTO for updating a pool allocation.
 *
 * All fields are optional for partial updates.
 */
export const PoolAllocationUpdateSchema = z.object({
  target_pool_id: z.string().uuid().optional(),
  allocation_type: AllocationTypeSchema.optional(),
  allocation_value: allocationValueString.optional(),
})

export type PoolAllocationUpdate = z.infer<typeof PoolAllocationUpdateSchema>

/**
 * Validate that percentage allocations sum to exactly 100%.
 *
 * @param allocations - List of allocation DTOs to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateAllocationsSumTo100(
  allocations: PoolAllocationCreate[]
): { isValid: boolean; error: string } {
  // Filter to only percentage allocations
  const percentageAllocations = allocations.filter(
    (a) => a.allocation_type === 'percentage'
  )

  if (percentageAllocations.length === 0) {
    // No percentage allocations to validate
    return { isValid: true, error: '' }
  }

  // FIX F-106: sum the percentages using integer arithmetic so floating-point
  // accumulation drift can never push a legitimately-100% split outside the
  // tolerance below. We scale every value to integers at the largest decimal
  // precision present, sum those exactly, then divide once at the end (an
  // exact operation for these magnitudes). A naive `sum + parseFloat(...)`
  // reduce accumulates IEEE-754 error across many addends.
  const decimalPlaces = percentageAllocations.reduce((max, a) => {
    const fraction = a.allocation_value.split('.')[1] ?? ''
    return Math.max(max, fraction.length)
  }, 0)
  const factor = 10 ** decimalPlaces
  const totalScaled = percentageAllocations.reduce(
    (sum, a) => sum + Math.round(parseFloat(a.allocation_value) * factor),
    0
  )
  const total = totalScaled / factor

  // Check if sum equals 100 (with tolerance for decimal precision)
  if (Math.abs(total - 100) > 0.01) {
    return {
      isValid: false,
      error: `Percentage allocations must sum to 100%, got ${total.toFixed(2)}%`,
    }
  }

  return { isValid: true, error: '' }
}
