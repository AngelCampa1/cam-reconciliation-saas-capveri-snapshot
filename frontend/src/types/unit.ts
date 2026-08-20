/**
 * Unit domain types for individual spaces within properties.
 *
 * These Zod schemas match exactly with backend/app/models/unit.py.
 * Units represent suites/spaces within commercial buildings.
 */

import { z } from 'zod'

import { UnitStatus } from './enums'
import { decimalString } from './property'

/**
 * Zod schema for UnitStatus enum values.
 */
export const UnitStatusSchema = z.enum([
  'vacant',
  'occupied',
  'under_renovation',
])

/**
 * Full unit model from database.
 *
 * Includes all fields plus database-generated fields.
 * Area fields are represented as strings to maintain decimal precision.
 */
export const UnitSchema = z
  .object({
    id: z.string().uuid(),
    property_id: z.string().uuid(),
    unit_number: z.string().min(1).max(50),
    rentable_sqft: decimalString({ gt: 0 }),
    usable_sqft: decimalString({ gt: 0 }),
    floor: z.number().int().min(0).nullable(),
    status: UnitStatusSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .refine(
    (data) => {
      const rentable = parseFloat(data.rentable_sqft)
      const usable = parseFloat(data.usable_sqft)
      return usable <= rentable
    },
    {
      message: 'Usable sqft cannot exceed rentable sqft',
      path: ['usable_sqft'],
    }
  )

export type Unit = z.infer<typeof UnitSchema>

/**
 * DTO for creating a new unit.
 *
 * Requires property_id to link unit to parent property.
 * Status defaults to 'vacant' if not specified.
 */
export const UnitCreateSchema = z
  .object({
    property_id: z.string().uuid(),
    unit_number: z.string().min(1).max(50),
    rentable_sqft: decimalString({ gt: 0 }),
    usable_sqft: decimalString({ gt: 0 }),
    floor: z.number().int().min(0).nullable().optional(),
    status: UnitStatusSchema.optional().default('vacant'),
  })
  .refine(
    (data) => {
      const rentable = parseFloat(data.rentable_sqft)
      const usable = parseFloat(data.usable_sqft)
      return usable <= rentable
    },
    {
      message: 'Usable sqft cannot exceed rentable sqft',
      path: ['usable_sqft'],
    }
  )

export type UnitCreate = z.infer<typeof UnitCreateSchema>

/**
 * DTO for updating an existing unit.
 *
 * All fields are optional; only provided fields will be updated.
 * Note: Cross-field validation (usable <= rentable) must be checked
 * at the service layer when combining with existing values.
 */
export const UnitUpdateSchema = z.object({
  unit_number: z.string().min(1).max(50).optional(),
  rentable_sqft: decimalString({ gt: 0 }).optional(),
  usable_sqft: decimalString({ gt: 0 }).optional(),
  floor: z.number().int().min(0).nullable().optional(),
  status: UnitStatusSchema.optional(),
})

export type UnitUpdate = z.infer<typeof UnitUpdateSchema>

/**
 * Lightweight unit summary for list views.
 *
 * Contains only essential fields for display in unit lists.
 */
export const UnitSummarySchema = z.object({
  id: z.string().uuid(),
  unit_number: z.string(),
  rentable_sqft: decimalString({ gt: 0 }),
  status: UnitStatusSchema,
})

export type UnitSummary = z.infer<typeof UnitSummarySchema>

/**
 * Helper to check if a status is valid.
 */
export const isValidUnitStatus = (status: string): status is UnitStatus => {
  return Object.values(UnitStatus).includes(status as UnitStatus)
}
