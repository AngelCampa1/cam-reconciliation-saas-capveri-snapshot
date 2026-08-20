/**
 * Property domain types for commercial real estate buildings.
 *
 * These Zod schemas match exactly with backend/app/models/property.py.
 * Properties represent commercial buildings with BOMA-compliant area
 * measurements.
 */

import { z } from 'zod'

/**
 * Helper for validating decimal strings with constraints.
 * Used for BOMA area fields that require precise decimal handling.
 */
export const decimalString = (opts?: {
  gt?: number
  ge?: number
  le?: number
}) =>
  z.string().refine(
    (val) => {
      // Validate proper numeric format (not just parseFloat which is too lenient)
      if (!/^-?\d+(\.\d+)?$/.test(val)) return false
      const num = parseFloat(val)
      if (isNaN(num)) return false
      if (opts?.gt !== undefined && num <= opts.gt) return false
      if (opts?.ge !== undefined && num < opts.ge) return false
      if (opts?.le !== undefined && num > opts.le) return false
      return true
    },
    {
      message: `Invalid decimal value${opts?.gt !== undefined ? ` (must be > ${opts.gt})` : ''}${opts?.ge !== undefined ? ` (must be >= ${opts.ge})` : ''}${opts?.le !== undefined ? ` (must be <= ${opts.le})` : ''}`,
    }
  )

/**
 * Full property model from database.
 *
 * Includes all fields: base fields plus database-generated fields.
 * Area fields are represented as strings to maintain decimal precision.
 */
export const PropertySchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    name: z.string().min(1).max(255),
    address_line1: z.string().max(255),
    address_line2: z.string().max(255).nullable(),
    city: z.string().max(100),
    state: z.string().length(2),
    postal_code: z.string().max(20),
    total_rentable_sqft: decimalString({ gt: 0 }),
    total_usable_sqft: decimalString({ gt: 0 }),
    common_area_sqft: decimalString({ ge: 0 }),
    target_occupancy: decimalString({ ge: 0, le: 1 }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .refine(
    (data) => {
      const rentable = parseFloat(data.total_rentable_sqft)
      const usable = parseFloat(data.total_usable_sqft)
      return usable <= rentable
    },
    {
      message: 'Usable sqft cannot exceed rentable sqft',
      path: ['total_usable_sqft'],
    }
  )

export type Property = z.infer<typeof PropertySchema>

/**
 * Base property fields without cross-field validation.
 * Used as a building block for Create and Update schemas.
 */
const PropertyBaseSchema = z.object({
  name: z.string().min(1).max(255),
  address_line1: z.string().max(255),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().max(100),
  state: z.string().length(2),
  postal_code: z.string().max(20),
  total_rentable_sqft: decimalString({ gt: 0 }),
  total_usable_sqft: decimalString({ gt: 0 }),
  common_area_sqft: decimalString({ ge: 0 }),
  target_occupancy: decimalString({ ge: 0, le: 1 }).optional().default('0.95'),
})

/**
 * DTO for creating a property.
 *
 * ID, organization_id, and timestamps are set by the system.
 * Includes validation that usable sqft <= rentable sqft.
 */
export const PropertyCreateSchema = PropertyBaseSchema.refine(
  (data) => {
    const rentable = parseFloat(data.total_rentable_sqft)
    const usable = parseFloat(data.total_usable_sqft)
    return usable <= rentable
  },
  {
    message: 'Usable sqft cannot exceed rentable sqft',
    path: ['total_usable_sqft'],
  }
)

export type PropertyCreate = z.infer<typeof PropertyCreateSchema>

/**
 * DTO for updating a property (all fields optional).
 *
 * Only provided fields will be updated; others remain unchanged.
 * Note: Cross-field validation (usable <= rentable) must be checked
 * at the service layer when combining with existing values.
 */
export const PropertyUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  postal_code: z.string().max(20).optional(),
  total_rentable_sqft: decimalString({ gt: 0 }).optional(),
  total_usable_sqft: decimalString({ gt: 0 }).optional(),
  common_area_sqft: decimalString({ ge: 0 }).optional(),
  target_occupancy: decimalString({ ge: 0, le: 1 }).optional(),
})

export type PropertyUpdate = z.infer<typeof PropertyUpdateSchema>

/**
 * Lightweight property summary for list views.
 *
 * Contains only essential fields for display in property lists.
 */
export const PropertySummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  city: z.string(),
  state: z.string().length(2),
  total_rentable_sqft: decimalString({ gt: 0 }),
})

export type PropertySummary = z.infer<typeof PropertySummarySchema>

/**
 * Helper to convert numeric values to decimal strings for API submission.
 */
export const toDecimalString = (value: number): string => {
  return value.toString()
}

/**
 * Helper to parse decimal string to number for calculations.
 */
export const parseDecimal = (value: string): number => {
  const parsed = parseFloat(value)
  if (isNaN(parsed)) {
    throw new Error(`Invalid decimal value: ${value}`)
  }
  return parsed
}

/**
 * Calculate load factor (R/U ratio) per BOMA standards.
 */
export const calculateLoadFactor = (
  rentableSqft: string,
  usableSqft: string
): number => {
  const rentable = parseDecimal(rentableSqft)
  const usable = parseDecimal(usableSqft)
  if (usable === 0) return 0
  return rentable / usable
}
