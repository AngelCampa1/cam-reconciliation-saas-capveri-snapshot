/**
 * Lease Term Version Types
 *
 * Zod schemas and TypeScript types for versioned lease recovery terms.
 * Each version has an effective date; the calculation engine uses the
 * version effective during the reconciliation period.
 */
import { z } from 'zod'

/**
 * Full lease term version (from database)
 */
export const LeaseTermVersionSchema = z.object({
  id: z.string().uuid(),
  lease_id: z.string().uuid(),
  version_number: z.number().int().min(1),
  effective_date: z.string(),

  // Recovery profile fields
  base_year: z.number().int().min(1990).max(2100).nullable().optional(),
  base_year_amount: z.string().nullable().optional(),
  gross_up_base_year: z.boolean().default(false),
  pro_rata_share: z.string(),
  cap_type: z
    .enum(['none', 'non_cumulative', 'cumulative', 'cumulative_compounding'])
    .default('none'),
  cap_rate: z.string().nullable().optional(),
  admin_fee_percentage: z.string().default('0'),
  excluded_pools: z.array(z.string()).default([]),
  rsf_measurement_standard: z.string().nullable().optional(),
  rsf_measurement_date: z.string().nullable().optional(),

  // Amendment metadata
  amendment_reason: z.string().nullable().optional(),
  amendment_document_url: z.string().max(2048).nullable().optional(),

  // Audit
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
})

export type LeaseTermVersion = z.infer<typeof LeaseTermVersionSchema>

/**
 * DTO for creating a new term version (amendment)
 */
export const LeaseTermVersionCreateSchema = z
  .object({
    effective_date: z.string().min(1, 'Effective date is required'),
    base_year: z.number().int().min(1990).max(2100).nullable().optional(),
    base_year_amount: z.string().nullable().optional(),
    gross_up_base_year: z.boolean().optional(),
    pro_rata_share: z.string().min(1, 'Pro-rata share is required'),
    cap_type: z
      .enum(['none', 'non_cumulative', 'cumulative', 'cumulative_compounding'])
      .default('none'),
    cap_rate: z.string().nullable().optional(),
    admin_fee_percentage: z.string().optional(),
    excluded_pools: z.array(z.string()).optional(),
    amendment_reason: z.string().nullable().optional(),
    amendment_document_url: z.string().max(2048).nullable().optional(),
  })
  .refine(
    (data) => {
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

export type LeaseTermVersionCreate = z.infer<
  typeof LeaseTermVersionCreateSchema
>

/**
 * Lightweight summary for timeline display
 */
export const LeaseTermVersionSummarySchema = z.object({
  id: z.string().uuid(),
  version_number: z.number().int(),
  effective_date: z.string(),
  pro_rata_share: z.string(),
  cap_type: z.string(),
  amendment_reason: z.string().nullable().optional(),
  created_at: z.string(),
})

export type LeaseTermVersionSummary = z.infer<
  typeof LeaseTermVersionSummarySchema
>
