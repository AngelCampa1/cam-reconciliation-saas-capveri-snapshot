/**
 * Recovery Profile Validation Schema
 *
 * Zod schema for validating lease recovery profile data including:
 * - Pro-rata share (required)
 * - Base year settings (optional)
 * - Expense cap configuration (optional)
 * - Gross-up settings (optional)
 * - Admin fee percentage (optional)
 */
import { z } from 'zod'

import { BaseYearAdjustmentItemSchema } from '@/types/lease-recovery-profile'

/**
 * Schema for lease recovery profile
 * Maps to LeaseRecoveryProfile_Input from API
 */
export const recoveryProfileSchema = z
  .object({
    // Pro-rata share (required, 0-100%)
    pro_rata_share: z
      .string()
      .min(1, 'Pro-rata share is required')
      .refine(
        (val) => {
          const num = parseFloat(val)
          return !isNaN(num) && num >= 0 && num <= 100
        },
        { message: 'Pro-rata share must be between 0 and 100' }
      ),

    // Base year settings
    base_year: z
      .number()
      .int('Base year must be a whole number')
      .min(1900, 'Base year must be after 1900')
      .max(2100, 'Base year must be before 2100')
      .nullable()
      .optional(),
    base_year_amount: z
      .string()
      .refine(
        (val) => {
          if (!val || val === '') return true
          const num = parseFloat(val)
          return !isNaN(num) && num >= 0
        },
        { message: 'Base year amount must be a positive number' }
      )
      .nullable()
      .optional(),
    gross_up_base_year: z.boolean().optional(),
    base_year_adjustments: z.array(BaseYearAdjustmentItemSchema).default([]),

    // Expense cap settings
    cap_type: z
      .enum(['none', 'non_cumulative', 'cumulative', 'cumulative_compounding'])
      .default('none'),
    cap_rate: z
      .string()
      .refine(
        (val) => {
          if (!val || val === '') return true
          const num = parseFloat(val)
          return !isNaN(num) && num >= 0 && num <= 100
        },
        { message: 'Cap rate must be between 0 and 100' }
      )
      .nullable()
      .optional(),

    // Admin fee
    admin_fee_percentage: z
      .string()
      .refine(
        (val) => {
          if (!val || val === '') return true
          const num = parseFloat(val)
          return !isNaN(num) && num >= 0 && num <= 100
        },
        { message: 'Admin fee must be between 0 and 100' }
      )
      .optional(),

    // BOMA 2024 compliance
    rsf_measurement_standard: z
      .enum(['2010', '2017', '2024', 'custom'])
      .nullable()
      .optional(),

    // Accounting basis
    accounting_basis: z.enum(['cash', 'accrual']).nullable().optional(),
  })
  .refine(
    (data) => {
      // If cap type is not 'none', cap_rate must be provided
      if (data.cap_type && data.cap_type !== 'none') {
        return data.cap_rate && data.cap_rate !== ''
      }
      return true
    },
    {
      message: 'Cap rate is required when cap type is not none',
      path: ['cap_rate'],
    }
  )

export type RecoveryProfileFormData = z.infer<typeof recoveryProfileSchema>
