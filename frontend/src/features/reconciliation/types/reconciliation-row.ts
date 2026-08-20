/**
 * ReconciliationRow domain types for the reconciliation grid.
 *
 * Represents a single row in the reconciliation grid, which can be either:
 * - An expense pool with tenant share allocations
 * - A tenant summary row showing total recovery for a tenant
 */

import { z } from 'zod'

/**
 * Helper for decimal string validation for financial amounts.
 * Allows negative values for credits.
 */
const financialAmountString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal number')

/**
 * Row type discriminator.
 */
export const ReconciliationRowType = {
  EXPENSE_POOL: 'expense_pool',
  TENANT_SUMMARY: 'tenant_summary',
} as const
export type ReconciliationRowType =
  (typeof ReconciliationRowType)[keyof typeof ReconciliationRowType]

/**
 * Schema for an expense pool row in the reconciliation grid.
 *
 * Represents a single expense pool (e.g., CAM, Taxes, Insurance) with
 * allocations to each tenant based on their pro-rata share.
 */
export const ExpensePoolRowSchema = z.object({
  id: z.string(),
  type: z.literal('expense_pool'),
  pool_id: z.string().uuid().optional(),
  pool_name: z.string(),
  pool_type: z.string().optional(),
  total_expenses: financialAmountString.optional(),
  grossed_up_expenses: financialAmountString.optional(),
  tenant_shares: z.record(z.string(), financialAmountString).optional(),
})

export type ExpensePoolRow = z.infer<typeof ExpensePoolRowSchema>

/**
 * Schema for a tenant summary row in the reconciliation grid.
 *
 * Represents the total recovery amount for a single tenant across all pools.
 */
export const TenantSummaryRowSchema = z.object({
  id: z.string(),
  type: z.literal('tenant_summary'),
  tenant_id: z.string().uuid(),
  tenant_name: z.string(),
  total_recovery: financialAmountString,
  tenant_share: financialAmountString.optional(),
  admin_fee: financialAmountString.optional(),
  final_amount: financialAmountString.optional(),
})

export type TenantSummaryRow = z.infer<typeof TenantSummaryRowSchema>

/**
 * Union type for all row types in the reconciliation grid.
 */
export const ReconciliationRowSchema = z.discriminatedUnion('type', [
  ExpensePoolRowSchema,
  TenantSummaryRowSchema,
])

export type ReconciliationRow = z.infer<typeof ReconciliationRowSchema>

/**
 * Type guard to check if a row is an expense pool row.
 */
export const isExpensePoolRow = (
  row: ReconciliationRow
): row is ExpensePoolRow => {
  return row.type === 'expense_pool'
}

/**
 * Type guard to check if a row is a tenant summary row.
 */
export const isTenantSummaryRow = (
  row: ReconciliationRow
): row is TenantSummaryRow => {
  return row.type === 'tenant_summary'
}
