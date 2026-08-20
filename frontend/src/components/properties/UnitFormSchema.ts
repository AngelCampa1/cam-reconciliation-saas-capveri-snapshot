/**
 * Unit Form Validation Schema
 *
 * Zod schema for validating unit form data including:
 * - Unit number (required)
 * - Rentable square footage (required, positive)
 * - Usable square footage (optional, positive)
 */
import { z } from 'zod'

export const unitFormSchema = z.object({
  unit_number: z
    .string()
    .min(1, 'Unit number is required')
    .max(50, 'Unit number must be less than 50 characters'),
  rentable_sqft: z
    .string()
    .min(1, 'Rentable sqft is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive number')
    .refine((val) => parseFloat(val) > 0, 'Must be greater than 0'),
  usable_sqft: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive number')
    .refine((val) => val === '' || parseFloat(val) >= 0, 'Must be 0 or greater')
    .optional()
    .or(z.literal('')),
  space_type: z.enum([
    'office',
    'retail',
    'laboratory',
    'storage',
    'outdoor_amenity',
    'equipment_shaft',
    'other',
  ]),
})

export type UnitFormData = z.infer<typeof unitFormSchema>
