/**
 * Property form validation schema.
 *
 * Single source of truth shared by the PropertyFormPage form resolver and its
 * tests. Keeping the schema in its own module (rather than exporting it from
 * the component) keeps the component file component-only for React Fast Refresh.
 *
 * target_occupancy is collected as a percentage string (e.g. "95" for 95%) and
 * converted to a decimal fraction on submit.
 */
import { z } from 'zod'

export const propertyFormSchema = z.object({
  name: z
    .string()
    .min(2, 'Property name must be at least 2 characters')
    .max(200, 'Property name must be less than 200 characters'),
  address_line1: z
    .string()
    .min(1, 'Address is required')
    .max(200, 'Address must be less than 200 characters'),
  address_line2: z
    .string()
    .max(200, 'Address line 2 must be less than 200 characters')
    .nullable()
    .optional(),
  city: z
    .string()
    .min(1, 'City is required')
    .max(100, 'City must be less than 100 characters'),
  state: z
    .string()
    .length(2, 'State must be a 2-letter code')
    .regex(/^[A-Z]{2}$/, 'State must be uppercase letters'),
  postal_code: z
    .string()
    .regex(
      /^\d{5}(-\d{4})?$/,
      'Postal code must be 5 digits or 5+4 format (e.g., 12345 or 12345-6789)'
    ),
  total_rentable_sqft: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive number')
    .refine((val) => parseFloat(val) > 0, 'Must be greater than 0'),
  total_usable_sqft: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive number')
    .refine((val) => parseFloat(val) > 0, 'Must be greater than 0'),
  common_area_sqft: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive number')
    .refine((val) => parseFloat(val) >= 0, 'Must be 0 or greater'),
  target_occupancy: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a number')
    .refine((val) => {
      const num = parseFloat(val)
      return num > 0 && num <= 100
    }, 'Must be between 1 and 100'),
  boma_standard_version: z.enum(['2010', '2017', '2024', 'custom']),
  rsf_measurement_date: z.string().optional().nullable(),
  tax_protest_county: z.string().max(255).optional().nullable(),
  tax_protest_deadline_override: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional()
    .nullable()
    .or(z.literal('')),
})

export type PropertyFormData = z.infer<typeof propertyFormSchema>
