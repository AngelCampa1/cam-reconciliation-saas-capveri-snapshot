/**
 * GLEntry domain types for general ledger entries.
 *
 * These Zod schemas match exactly with backend/app/models/gl_entry.py.
 * The GLEntry model stores normalized general ledger entries imported from
 * CSV/Excel files. Amounts are stored as signed decimals (positive=debit,
 * negative=credit) to simplify aggregation.
 */

import { z } from 'zod'

/**
 * Helper for decimal string validation.
 * Decimals are transmitted as strings to preserve precision.
 */
const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal number')

/**
 * Full GLEntry model from database.
 *
 * Stores normalized general ledger data with the original raw row
 * preserved as JSONB for audit purposes.
 */
export const GLEntrySchema = z.object({
  id: z.string().uuid(),
  import_batch_id: z.string().uuid(),
  property_id: z.string().uuid(),
  account_code: z.string().min(1).max(50),
  account_description: z.string().max(255),
  amount: decimalString,
  transaction_date: z.string().date(),
  period_year: z.number().int().min(1990).max(2100),
  period_month: z.number().int().min(1).max(12),
  vendor_name: z.string().max(255).nullable(),
  description: z.string().max(1000).nullable(),
  raw_row_data: z.record(z.string(), z.any()),
  created_at: z.string().datetime(),
})

export type GLEntry = z.infer<typeof GLEntrySchema>

/**
 * DTO for creating a GL entry from parser output.
 *
 * Used by ingestion parsers to create normalized GL entries.
 */
export const GLEntryCreateSchema = z.object({
  import_batch_id: z.string().uuid(),
  property_id: z.string().uuid(),
  account_code: z.string().min(1).max(50),
  account_description: z.string().max(255),
  amount: decimalString,
  transaction_date: z.string().date(),
  period_year: z.number().int().min(1990).max(2100),
  period_month: z.number().int().min(1).max(12),
  vendor_name: z.string().max(255).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  raw_row_data: z.record(z.string(), z.any()).default({}),
})

export type GLEntryCreate = z.infer<typeof GLEntryCreateSchema>

/**
 * DTO for updating a GL entry.
 *
 * Limited update capability - most fields are immutable after import.
 * Only description and vendor_name can be corrected.
 */
export const GLEntryUpdateSchema = z.object({
  vendor_name: z.string().max(255).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
})

export type GLEntryUpdate = z.infer<typeof GLEntryUpdateSchema>

/**
 * Aggregated GL entries for reporting.
 *
 * Used for displaying expense pool totals and account summaries.
 */
export const GLEntrySummarySchema = z.object({
  account_code: z.string(),
  account_description: z.string(),
  total_amount: decimalString,
  entry_count: z.number().int().min(0),
})

export type GLEntrySummary = z.infer<typeof GLEntrySummarySchema>

/**
 * Helper to check if an amount represents a debit (positive) or credit (negative).
 */
export const isDebit = (amount: string): boolean => {
  const num = parseFloat(amount)
  return !isNaN(num) && num > 0
}

export const isCredit = (amount: string): boolean => {
  const num = parseFloat(amount)
  return !isNaN(num) && num < 0
}

/**
 * Helper to format amount for display with debit/credit indication.
 */
export const formatGLAmount = (amount: string): string => {
  const num = parseFloat(amount)
  if (isNaN(num)) return amount
  const abs = Math.abs(num).toFixed(2)
  return num < 0 ? `(${abs})` : abs
}
