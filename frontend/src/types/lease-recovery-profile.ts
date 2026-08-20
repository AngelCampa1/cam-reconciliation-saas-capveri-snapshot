/**
 * LeaseRecoveryProfile domain types for lease recovery terms.
 *
 * These Zod schemas match exactly with backend/app/models/lease_recovery_profile.py.
 * The LeaseRecoveryProfile represents the "Financial DNA" extracted from lease
 * documents, containing all terms needed to calculate tenant expense recoveries.
 */

import { z } from 'zod'

import { CapType, PoolType } from './enums'
import { decimalString } from './property'

/**
 * Zod schema for CapType enum values.
 */
export const CapTypeSchema = z.enum([
  'none',
  'non_cumulative',
  'cumulative',
  'cumulative_compounding',
])

/**
 * Zod schema for PoolType enum values.
 */
export const PoolTypeSchema = z.enum([
  'operating',
  'tax',
  'insurance',
  'capital',
  'other',
])

/**
 * Zod schema for an imputed cost added to the base year to account for a service
 * introduced after the base year. Multiple items are additive.
 */
export const BaseYearAdjustmentItemSchema = z.object({
  service_name: z.string().min(1, 'Service name is required'),
  imputed_amount: decimalString({ ge: 0 }),
  justification: z.string().min(1, 'Justification is required'),
})

export type BaseYearAdjustmentItem = z.infer<
  typeof BaseYearAdjustmentItemSchema
>

/**
 * Full LeaseRecoveryProfile model stored as JSONB in leases table.
 *
 * Contains all recovery terms needed for the calculation engine.
 * Includes conditional validation: cap_rate required when cap_type != 'none'.
 */
export const LeaseRecoveryProfileSchema = z
  .object({
    // Base Year Terms
    base_year: z.number().int().min(1990).max(2100).nullable().optional(),
    base_year_amount: decimalString({ ge: 0 }).nullable().optional(),
    gross_up_base_year: z.boolean().default(false),
    base_year_adjustments: z.array(BaseYearAdjustmentItemSchema).default([]),

    // Tenant Share
    pro_rata_share: decimalString({ ge: 0, le: 1 }),

    // Cap Terms
    cap_type: CapTypeSchema.default('none'),
    cap_rate: decimalString({ ge: 0, le: 1 }).nullable().optional(),

    // Admin Fee
    admin_fee_percentage: decimalString({ ge: 0, le: 0.2 }).default('0'),

    // Exclusions
    excluded_pools: z.array(PoolTypeSchema).default([]),
  })
  .refine(
    (data) => {
      // cap_rate required if cap_type != 'none'
      if (data.cap_type !== 'none' && !data.cap_rate) {
        return false
      }
      return true
    },
    {
      message: 'Cap rate is required when cap type is not none',
      path: ['cap_rate'],
    }
  )

export type LeaseRecoveryProfile = z.infer<typeof LeaseRecoveryProfileSchema>

/**
 * DTO for creating/updating lease recovery profile.
 *
 * All fields except pro_rata_share are optional with sensible defaults.
 */
export const LeaseRecoveryProfileCreateSchema = z
  .object({
    // Base Year Terms
    base_year: z.number().int().min(1990).max(2100).nullable().optional(),
    base_year_amount: decimalString({ ge: 0 }).nullable().optional(),
    gross_up_base_year: z.boolean().default(false),
    base_year_adjustments: z.array(BaseYearAdjustmentItemSchema).default([]),

    // Tenant Share (required)
    pro_rata_share: decimalString({ ge: 0, le: 1 }),

    // Cap Terms
    cap_type: CapTypeSchema.default('none'),
    cap_rate: decimalString({ ge: 0, le: 1 }).nullable().optional(),

    // Admin Fee
    admin_fee_percentage: decimalString({ ge: 0, le: 0.2 }).default('0'),

    // Exclusions
    excluded_pools: z.array(PoolTypeSchema).default([]),
  })
  .refine(
    (data) => {
      if (data.cap_type !== 'none' && !data.cap_rate) {
        return false
      }
      return true
    },
    {
      message: 'Cap rate is required when cap type is not none',
      path: ['cap_rate'],
    }
  )

export type LeaseRecoveryProfileCreate = z.infer<
  typeof LeaseRecoveryProfileCreateSchema
>

/**
 * DTO for partial update of lease recovery profile.
 *
 * All fields are optional. Cross-field validation (cap_rate requirement)
 * must be checked at the service layer when merging with existing values.
 */
export const LeaseRecoveryProfileUpdateSchema = z.object({
  base_year: z.number().int().min(1990).max(2100).nullable().optional(),
  base_year_amount: decimalString({ ge: 0 }).nullable().optional(),
  gross_up_base_year: z.boolean().optional(),
  base_year_adjustments: z.array(BaseYearAdjustmentItemSchema).optional(),
  pro_rata_share: decimalString({ ge: 0, le: 1 }).optional(),
  cap_type: CapTypeSchema.optional(),
  cap_rate: decimalString({ ge: 0, le: 1 }).nullable().optional(),
  admin_fee_percentage: decimalString({ ge: 0, le: 0.2 }).optional(),
  excluded_pools: z.array(PoolTypeSchema).optional(),
})

export type LeaseRecoveryProfileUpdate = z.infer<
  typeof LeaseRecoveryProfileUpdateSchema
>

/**
 * Helper to check if a cap type value is valid.
 */
export const isValidCapType = (value: string): value is CapType => {
  return Object.values(CapType).includes(value as CapType)
}

/**
 * Helper to check if a pool type value is valid.
 */
export const isValidPoolType = (value: string): value is PoolType => {
  return Object.values(PoolType).includes(value as PoolType)
}
