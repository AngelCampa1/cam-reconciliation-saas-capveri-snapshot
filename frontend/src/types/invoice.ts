/**
 * Invoice domain types for billing history.
 *
 * This module defines the Invoice entity for tracking billing and payment history.
 * Invoices are linked to subscriptions and track amounts, payment status, and
 * billing periods. Status values align with Stripe's invoice statuses.
 */

import { z } from 'zod'

/**
 * Current status of an invoice.
 *
 * These values align with Stripe's invoice status values.
 */
export const InvoiceStatus = {
  DRAFT: 'draft',
  OPEN: 'open',
  PAID: 'paid',
  VOID: 'void',
  UNCOLLECTIBLE: 'uncollectible',
} as const
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

/**
 * Zod schema for invoice status validation.
 */
export const InvoiceStatusSchema = z.enum([
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
])

/**
 * Full invoice schema with all fields.
 */
export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  subscription_id: z.string().uuid().nullable(),
  stripe_invoice_id: z.string().nullable(),
  amount_due: z
    .string()
    .or(z.number())
    .transform((v) => String(v)),
  amount_paid: z
    .string()
    .or(z.number())
    .transform((v) => String(v)),
  currency: z.string().max(3).default('usd'),
  status: InvoiceStatusSchema,
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  due_date: z.string().datetime().nullable(),
  paid_at: z.string().datetime().nullable(),
  pdf_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Invoice = z.infer<typeof InvoiceSchema>

/**
 * Schema for creating a new invoice.
 */
export const InvoiceCreateSchema = z.object({
  organization_id: z.string().uuid(),
  subscription_id: z.string().uuid().nullable().optional(),
  stripe_invoice_id: z.string().nullable().optional(),
  amount_due: z.string().or(z.number()),
  amount_paid: z.string().or(z.number()).optional().default('0.00'),
  currency: z.string().max(3).optional().default('usd'),
  status: InvoiceStatusSchema.optional().default('draft'),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  due_date: z.string().datetime().nullable().optional(),
})

export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>

/**
 * Schema for updating an existing invoice.
 */
export const InvoiceUpdateSchema = z.object({
  amount_paid: z.string().or(z.number()).optional(),
  status: InvoiceStatusSchema.optional(),
  stripe_invoice_id: z.string().nullable().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  pdf_url: z.string().url().nullable().optional(),
})

export type InvoiceUpdate = z.infer<typeof InvoiceUpdateSchema>

/**
 * Lightweight invoice view for listings.
 */
export const InvoiceSummarySchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  amount_due: z
    .string()
    .or(z.number())
    .transform((v) => String(v)),
  amount_paid: z
    .string()
    .or(z.number())
    .transform((v) => String(v)),
  currency: z.string().max(3),
  status: InvoiceStatusSchema,
  period_end: z.string().datetime(),
  due_date: z.string().datetime().nullable(),
})

export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>

/**
 * Type guard for valid invoice status.
 */
export function isValidInvoiceStatus(value: unknown): value is InvoiceStatus {
  return InvoiceStatusSchema.safeParse(value).success
}

/**
 * Get display name for invoice status.
 */
export function getInvoiceStatusDisplayName(status: InvoiceStatus): string {
  const displayNames: Record<InvoiceStatus, string> = {
    draft: 'Draft',
    open: 'Open',
    paid: 'Paid',
    void: 'Void',
    uncollectible: 'Uncollectible',
  }
  return displayNames[status]
}

/**
 * Check if invoice is in a finalized state (paid, void, or uncollectible).
 */
export function isInvoiceFinalized(status: InvoiceStatus): boolean {
  return status === 'paid' || status === 'void' || status === 'uncollectible'
}

/**
 * Check if invoice requires payment.
 */
export function requiresPayment(status: InvoiceStatus): boolean {
  return status === 'open'
}

/**
 * Calculate remaining balance on invoice.
 */
export function calculateBalance(
  amountDue: string,
  amountPaid: string
): string {
  const due = parseFloat(amountDue)
  const paid = parseFloat(amountPaid)
  return (due - paid).toFixed(2)
}

/**
 * Format currency amount for display.
 */
export function formatInvoiceAmount(
  amount: string | number,
  currency: string = 'usd'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  })
  return formatter.format(numAmount)
}
