/**
 * ReconciliationSnapshot domain types for CAM reconciliation results.
 *
 * These Zod schemas match exactly with backend/app/models/reconciliation_snapshot.py.
 * Snapshots represent immutable reconciliation calculations for audit purposes.
 */

import { z } from 'zod'

import { formatCalendarDate } from '@/lib/utils'
import { ReconciliationStatus } from './enums'

/**
 * Zod schema for ReconciliationStatus enum values.
 */
export const ReconciliationStatusSchema = z.enum(['draft', 'finalized'])

/**
 * Helper to validate ReconciliationStatus values.
 */
export const isValidReconciliationStatus = (
  value: string
): value is ReconciliationStatus => {
  return Object.values(ReconciliationStatus).includes(
    value as ReconciliationStatus
  )
}

/**
 * Helper for decimal string validation for financial amounts.
 * Allows negative values for credits.
 */
const financialAmountString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal number')

/**
 * Schema for calculation trace entries.
 * This is a flexible structure that will be refined when CalculationStep (Story 2.12) is implemented.
 */
export const CalculationTraceEntrySchema = z.record(z.string(), z.any())

/**
 * Full ReconciliationSnapshot model from database.
 *
 * Represents an immutable snapshot of CAM reconciliation calculations
 * for a specific lease and time period.
 */
export const ReconciliationSnapshotSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  lease_id: z.string().uuid(),
  period_start_date: z.string().date(),
  period_end_date: z.string().date(),
  status: ReconciliationStatusSchema,

  // Calculated financial values (stored as decimal strings for precision)
  total_operating_expenses: financialAmountString,
  grossed_up_expenses: financialAmountString,
  base_year_amount: financialAmountString,
  tenant_share_before_cap: financialAmountString,
  tenant_share_after_cap: financialAmountString,
  admin_fee: financialAmountString,
  total_recovery: financialAmountString,

  // Audit trail - calculation steps stored as JSONB
  calculation_trace: z.array(CalculationTraceEntrySchema).default([]),

  // Finalization tracking
  finalized_at: z.string().datetime().nullable().optional(),
  finalized_by_user_id: z.string().uuid().nullable().optional(),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type ReconciliationSnapshot = z.infer<
  typeof ReconciliationSnapshotSchema
>

/**
 * DTO for creating a reconciliation snapshot.
 *
 * Requires property_id, lease_id, period dates, and all calculated values.
 */
export const ReconciliationSnapshotCreateSchema = z
  .object({
    property_id: z.string().uuid(),
    lease_id: z.string().uuid(),
    period_start_date: z.string().date(),
    period_end_date: z.string().date(),
    status: ReconciliationStatusSchema.default('draft'),

    // All calculated values are required
    total_operating_expenses: financialAmountString,
    grossed_up_expenses: financialAmountString,
    base_year_amount: financialAmountString,
    tenant_share_before_cap: financialAmountString,
    tenant_share_after_cap: financialAmountString,
    admin_fee: financialAmountString,
    total_recovery: financialAmountString,

    // Calculation trace for audit
    calculation_trace: z.array(CalculationTraceEntrySchema).default([]),
  })
  .refine(
    (data) => {
      const start = new Date(data.period_start_date)
      const end = new Date(data.period_end_date)
      return end > start
    },
    {
      message: 'period_end_date must be after period_start_date',
      path: ['period_end_date'],
    }
  )

export type ReconciliationSnapshotCreate = z.infer<
  typeof ReconciliationSnapshotCreateSchema
>

/**
 * DTO for updating a reconciliation snapshot.
 *
 * All fields are optional for partial updates.
 * Only non-finalized snapshots can be updated.
 */
export const ReconciliationSnapshotUpdateSchema = z.object({
  status: ReconciliationStatusSchema.optional(),

  // Calculated values can be updated if not finalized
  total_operating_expenses: financialAmountString.optional(),
  grossed_up_expenses: financialAmountString.optional(),
  base_year_amount: financialAmountString.optional(),
  tenant_share_before_cap: financialAmountString.optional(),
  tenant_share_after_cap: financialAmountString.optional(),
  admin_fee: financialAmountString.optional(),
  total_recovery: financialAmountString.optional(),

  // Calculation trace can be updated
  calculation_trace: z.array(CalculationTraceEntrySchema).optional(),
})

export type ReconciliationSnapshotUpdate = z.infer<
  typeof ReconciliationSnapshotUpdateSchema
>

/**
 * DTO for finalizing a reconciliation snapshot.
 *
 * Once finalized, the snapshot becomes immutable.
 */
export const ReconciliationSnapshotFinalizeSchema = z.object({
  finalized_by_user_id: z.string().uuid(),
})

export type ReconciliationSnapshotFinalize = z.infer<
  typeof ReconciliationSnapshotFinalizeSchema
>

/**
 * Summary view of a reconciliation snapshot for list displays.
 *
 * Includes key financial figures without the full calculation trace.
 */
export const ReconciliationSnapshotSummarySchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  lease_id: z.string().uuid(),
  period_start_date: z.string().date(),
  period_end_date: z.string().date(),
  status: ReconciliationStatusSchema,
  total_recovery: financialAmountString,
  is_finalized: z.boolean().default(false),
  finalized_at: z.string().datetime().nullable().optional(),

  // Optional related info for display
  property_name: z.string().nullable().optional(),
  tenant_name: z.string().nullable().optional(),
})

export type ReconciliationSnapshotSummary = z.infer<
  typeof ReconciliationSnapshotSummarySchema
>

/**
 * Check if a snapshot can be modified.
 *
 * Returns false if the snapshot has been finalized.
 */
export const canModifySnapshot = (
  snapshot: ReconciliationSnapshot
): boolean => {
  return snapshot.status !== ReconciliationStatus.FINALIZED
}

/**
 * Format a recovery amount for display.
 *
 * @param amount - The decimal string amount to format
 * @returns Formatted string with currency symbol
 */
export const formatRecoveryAmount = (amount: string): string => {
  // FIX F-107: format the Decimal string directly. parseFloat() coerces the
  // amount to the nearest IEEE-754 double, so a backend Decimal beyond ~15
  // significant digits (e.g. "99999999999999.99") would display as "...98".
  // Intl.NumberFormat.format() accepts a string and formats it without that
  // precision loss. Number() is used only to validate numericness (never for
  // the displayed value); non-numeric input falls back to the raw string.
  const trimmed = amount.trim()
  if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
    return amount
  }
  // `format` accepts a string at runtime (ECMA-402 parses it as an exact
  // decimal), but the TS lib only types `number | bigint`, so we cast. This
  // is the whole point of the fix --- passing the string avoids the double
  // coercion that would lose precision on large amounts.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(trimmed as unknown as number)
}

/**
 * Get display name for a reconciliation status.
 */
export const getReconciliationStatusDisplayName = (
  status: ReconciliationStatus
): string => {
  const displayNames: Record<ReconciliationStatus, string> = {
    [ReconciliationStatus.DRAFT]: 'Draft',
    [ReconciliationStatus.FINALIZED]: 'Finalized',
  }
  return displayNames[status] || status
}

/**
 * Format a period range for display, e.g. "Jan 1, 2024 - Dec 31, 2024".
 *
 * Both endpoints are date-only calendar dates, so they route through the
 * `formatCalendarDate` SSOT, which parses them from their local date parts to
 * avoid the timezone off-by-one shift.
 */
export const formatPeriodRange = (
  startDate: string,
  endDate: string
): string => {
  return `${formatCalendarDate(startDate)} - ${formatCalendarDate(endDate)}`
}
