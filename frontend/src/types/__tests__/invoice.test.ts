/**
 * Tests for Invoice domain types.
 *
 * Validates InvoiceStatus enum and all Invoice Zod schemas
 * for correct validation and type inference.
 */

import { describe, it, expect } from 'vitest'
import {
  InvoiceStatus,
  InvoiceStatusSchema,
  InvoiceSchema,
  InvoiceCreateSchema,
  InvoiceUpdateSchema,
  InvoiceSummarySchema,
  isValidInvoiceStatus,
  getInvoiceStatusDisplayName,
  isInvoiceFinalized,
  requiresPayment,
  calculateBalance,
  formatInvoiceAmount,
} from '../invoice'

// =============================================================================
// InvoiceStatus Tests
// =============================================================================

describe('InvoiceStatus', () => {
  it('has draft value', () => {
    expect(InvoiceStatus.DRAFT).toBe('draft')
  })

  it('has open value', () => {
    expect(InvoiceStatus.OPEN).toBe('open')
  })

  it('has paid value', () => {
    expect(InvoiceStatus.PAID).toBe('paid')
  })

  it('has void value', () => {
    expect(InvoiceStatus.VOID).toBe('void')
  })

  it('has uncollectible value', () => {
    expect(InvoiceStatus.UNCOLLECTIBLE).toBe('uncollectible')
  })

  it('has exactly five status values', () => {
    const values = Object.values(InvoiceStatus)
    expect(values).toHaveLength(5)
  })

  it('all values are lowercase', () => {
    Object.values(InvoiceStatus).forEach((status) => {
      expect(status).toBe(status.toLowerCase())
    })
  })
})

describe('InvoiceStatusSchema', () => {
  it('validates draft', () => {
    expect(InvoiceStatusSchema.parse('draft')).toBe('draft')
  })

  it('validates open', () => {
    expect(InvoiceStatusSchema.parse('open')).toBe('open')
  })

  it('validates paid', () => {
    expect(InvoiceStatusSchema.parse('paid')).toBe('paid')
  })

  it('validates void', () => {
    expect(InvoiceStatusSchema.parse('void')).toBe('void')
  })

  it('validates uncollectible', () => {
    expect(InvoiceStatusSchema.parse('uncollectible')).toBe('uncollectible')
  })

  it('rejects invalid status', () => {
    expect(() => InvoiceStatusSchema.parse('invalid')).toThrow()
  })

  it('rejects empty string', () => {
    expect(() => InvoiceStatusSchema.parse('')).toThrow()
  })
})

// =============================================================================
// InvoiceCreateSchema Tests
// =============================================================================

describe('InvoiceCreateSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'
  const validDatetime = '2024-01-15T10:30:00.000Z'

  it('validates minimal create', () => {
    const result = InvoiceCreateSchema.parse({
      organization_id: validUuid,
      amount_due: '100.00',
      period_start: validDatetime,
      period_end: validDatetime,
    })
    expect(result.organization_id).toBe(validUuid)
    expect(result.amount_due).toBe('100.00')
    expect(result.amount_paid).toBe('0.00') // Default
    expect(result.currency).toBe('usd') // Default
    expect(result.status).toBe('draft') // Default
  })

  it('validates create with all fields', () => {
    const subId = '223e4567-e89b-12d3-a456-426614174001'
    const result = InvoiceCreateSchema.parse({
      organization_id: validUuid,
      subscription_id: subId,
      stripe_invoice_id: 'in_1234567890',
      amount_due: '250.00',
      amount_paid: '50.00',
      currency: 'eur',
      status: 'open',
      period_start: validDatetime,
      period_end: validDatetime,
      due_date: validDatetime,
    })
    expect(result.subscription_id).toBe(subId)
    expect(result.stripe_invoice_id).toBe('in_1234567890')
    expect(result.amount_paid).toBe('50.00')
    expect(result.currency).toBe('eur')
    expect(result.status).toBe('open')
    expect(result.due_date).toBe(validDatetime)
  })

  it('accepts numeric amount_due', () => {
    const result = InvoiceCreateSchema.parse({
      organization_id: validUuid,
      amount_due: 100.5,
      period_start: validDatetime,
      period_end: validDatetime,
    })
    expect(result.amount_due).toBe(100.5)
  })

  it('requires organization_id', () => {
    expect(() =>
      InvoiceCreateSchema.parse({
        amount_due: '100.00',
        period_start: validDatetime,
        period_end: validDatetime,
      })
    ).toThrow()
  })

  it('requires amount_due', () => {
    expect(() =>
      InvoiceCreateSchema.parse({
        organization_id: validUuid,
        period_start: validDatetime,
        period_end: validDatetime,
      })
    ).toThrow()
  })

  it('requires period_start', () => {
    expect(() =>
      InvoiceCreateSchema.parse({
        organization_id: validUuid,
        amount_due: '100.00',
        period_end: validDatetime,
      })
    ).toThrow()
  })

  it('requires period_end', () => {
    expect(() =>
      InvoiceCreateSchema.parse({
        organization_id: validUuid,
        amount_due: '100.00',
        period_start: validDatetime,
      })
    ).toThrow()
  })

  it('rejects invalid organization_id', () => {
    expect(() =>
      InvoiceCreateSchema.parse({
        organization_id: 'not-a-uuid',
        amount_due: '100.00',
        period_start: validDatetime,
        period_end: validDatetime,
      })
    ).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() =>
      InvoiceCreateSchema.parse({
        organization_id: validUuid,
        amount_due: '100.00',
        period_start: validDatetime,
        period_end: validDatetime,
        status: 'invalid_status',
      })
    ).toThrow()
  })

  it('allows null subscription_id', () => {
    const result = InvoiceCreateSchema.parse({
      organization_id: validUuid,
      amount_due: '100.00',
      period_start: validDatetime,
      period_end: validDatetime,
      subscription_id: null,
    })
    expect(result.subscription_id).toBeNull()
  })
})

// =============================================================================
// InvoiceUpdateSchema Tests
// =============================================================================

describe('InvoiceUpdateSchema', () => {
  const validDatetime = '2024-01-15T10:30:00.000Z'

  it('validates empty update', () => {
    const result = InvoiceUpdateSchema.parse({})
    expect(result.amount_paid).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(result.stripe_invoice_id).toBeUndefined()
    expect(result.paid_at).toBeUndefined()
    expect(result.pdf_url).toBeUndefined()
  })

  it('validates amount_paid only update', () => {
    const result = InvoiceUpdateSchema.parse({
      amount_paid: '100.00',
    })
    expect(result.amount_paid).toBe('100.00')
    expect(result.status).toBeUndefined()
  })

  it('validates status only update', () => {
    const result = InvoiceUpdateSchema.parse({
      status: 'paid',
    })
    expect(result.status).toBe('paid')
    expect(result.amount_paid).toBeUndefined()
  })

  it('validates paid_at update', () => {
    const result = InvoiceUpdateSchema.parse({
      paid_at: validDatetime,
    })
    expect(result.paid_at).toBe(validDatetime)
  })

  it('validates pdf_url update', () => {
    const result = InvoiceUpdateSchema.parse({
      pdf_url: 'https://example.com/invoice.pdf',
    })
    expect(result.pdf_url).toBe('https://example.com/invoice.pdf')
  })

  it('validates multiple field update', () => {
    const result = InvoiceUpdateSchema.parse({
      amount_paid: '100.00',
      status: 'paid',
      paid_at: validDatetime,
      pdf_url: 'https://example.com/invoice.pdf',
    })
    expect(result.amount_paid).toBe('100.00')
    expect(result.status).toBe('paid')
    expect(result.paid_at).toBe(validDatetime)
    expect(result.pdf_url).toBe('https://example.com/invoice.pdf')
  })

  it('rejects invalid status', () => {
    expect(() =>
      InvoiceUpdateSchema.parse({
        status: 'bad_status',
      })
    ).toThrow()
  })

  it('rejects invalid pdf_url', () => {
    expect(() =>
      InvoiceUpdateSchema.parse({
        pdf_url: 'not-a-url',
      })
    ).toThrow()
  })
})

// =============================================================================
// InvoiceSchema Tests
// =============================================================================

describe('InvoiceSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'
  const validUuid2 = '223e4567-e89b-12d3-a456-426614174001'
  const validUuid3 = '323e4567-e89b-12d3-a456-426614174002'
  const validDatetime = '2024-01-15T10:30:00.000Z'

  const validInvoice = {
    id: validUuid,
    organization_id: validUuid2,
    subscription_id: validUuid3,
    stripe_invoice_id: 'in_abc123',
    amount_due: '199.99',
    amount_paid: '199.99',
    currency: 'usd',
    status: 'paid',
    period_start: validDatetime,
    period_end: validDatetime,
    due_date: validDatetime,
    paid_at: validDatetime,
    pdf_url: 'https://example.com/invoice.pdf',
    created_at: validDatetime,
    updated_at: validDatetime,
  }

  it('validates full invoice', () => {
    const result = InvoiceSchema.parse(validInvoice)
    expect(result.id).toBe(validUuid)
    expect(result.organization_id).toBe(validUuid2)
    expect(result.amount_due).toBe('199.99')
    expect(result.amount_paid).toBe('199.99')
    expect(result.status).toBe('paid')
    expect(result.pdf_url).toBe('https://example.com/invoice.pdf')
  })

  it('validates invoice without optional fields', () => {
    const result = InvoiceSchema.parse({
      ...validInvoice,
      subscription_id: null,
      stripe_invoice_id: null,
      due_date: null,
      paid_at: null,
      pdf_url: null,
    })
    expect(result.subscription_id).toBeNull()
    expect(result.stripe_invoice_id).toBeNull()
    expect(result.due_date).toBeNull()
    expect(result.paid_at).toBeNull()
    expect(result.pdf_url).toBeNull()
  })

  it('transforms numeric amount_due to string', () => {
    const result = InvoiceSchema.parse({
      ...validInvoice,
      amount_due: 199.99,
    })
    expect(result.amount_due).toBe('199.99')
  })

  it('requires id', () => {
    const { id: _id, ...noId } = validInvoice
    void _id
    expect(() => InvoiceSchema.parse(noId)).toThrow()
  })

  it('requires organization_id', () => {
    const { organization_id: _orgId, ...noOrgId } = validInvoice
    void _orgId
    expect(() => InvoiceSchema.parse(noOrgId)).toThrow()
  })

  it('requires period_start', () => {
    const { period_start: _ps, ...noPeriodStart } = validInvoice
    void _ps
    expect(() => InvoiceSchema.parse(noPeriodStart)).toThrow()
  })

  it('requires period_end', () => {
    const { period_end: _pe, ...noPeriodEnd } = validInvoice
    void _pe
    expect(() => InvoiceSchema.parse(noPeriodEnd)).toThrow()
  })

  it('requires created_at', () => {
    const { created_at: _ca, ...noCreatedAt } = validInvoice
    void _ca
    expect(() => InvoiceSchema.parse(noCreatedAt)).toThrow()
  })

  it('requires updated_at', () => {
    const { updated_at: _ua, ...noUpdatedAt } = validInvoice
    void _ua
    expect(() => InvoiceSchema.parse(noUpdatedAt)).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() =>
      InvoiceSchema.parse({
        ...validInvoice,
        status: 'invalid',
      })
    ).toThrow()
  })

  it('rejects invalid pdf_url', () => {
    expect(() =>
      InvoiceSchema.parse({
        ...validInvoice,
        pdf_url: 'not-a-url',
      })
    ).toThrow()
  })
})

// =============================================================================
// InvoiceSummarySchema Tests
// =============================================================================

describe('InvoiceSummarySchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'
  const validUuid2 = '223e4567-e89b-12d3-a456-426614174001'
  const validDatetime = '2024-01-15T10:30:00.000Z'

  const validSummary = {
    id: validUuid,
    organization_id: validUuid2,
    amount_due: '100.00',
    amount_paid: '50.00',
    currency: 'usd',
    status: 'open',
    period_end: validDatetime,
    due_date: validDatetime,
  }

  it('validates summary', () => {
    const result = InvoiceSummarySchema.parse(validSummary)
    expect(result.amount_due).toBe('100.00')
    expect(result.amount_paid).toBe('50.00')
    expect(result.status).toBe('open')
  })

  it('validates summary with null due_date', () => {
    const result = InvoiceSummarySchema.parse({
      ...validSummary,
      due_date: null,
    })
    expect(result.due_date).toBeNull()
  })

  it('transforms numeric amounts to strings', () => {
    const result = InvoiceSummarySchema.parse({
      ...validSummary,
      amount_due: 100.0,
      amount_paid: 50.0,
    })
    expect(result.amount_due).toBe('100')
    expect(result.amount_paid).toBe('50')
  })

  it('requires all required fields', () => {
    const { status: _status, ...noStatus } = validSummary
    void _status
    expect(() => InvoiceSummarySchema.parse(noStatus)).toThrow()
  })

  it('validates all status types', () => {
    const statuses = ['draft', 'open', 'paid', 'void', 'uncollectible']
    statuses.forEach((status) => {
      const result = InvoiceSummarySchema.parse({
        ...validSummary,
        status,
      })
      expect(result.status).toBe(status)
    })
  })
})

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('isValidInvoiceStatus', () => {
  it('returns true for valid statuses', () => {
    expect(isValidInvoiceStatus('draft')).toBe(true)
    expect(isValidInvoiceStatus('open')).toBe(true)
    expect(isValidInvoiceStatus('paid')).toBe(true)
    expect(isValidInvoiceStatus('void')).toBe(true)
    expect(isValidInvoiceStatus('uncollectible')).toBe(true)
  })

  it('returns false for invalid statuses', () => {
    expect(isValidInvoiceStatus('invalid')).toBe(false)
    expect(isValidInvoiceStatus('')).toBe(false)
    expect(isValidInvoiceStatus(null)).toBe(false)
    expect(isValidInvoiceStatus(undefined)).toBe(false)
    expect(isValidInvoiceStatus(123)).toBe(false)
  })
})

describe('getInvoiceStatusDisplayName', () => {
  it('returns correct display names', () => {
    expect(getInvoiceStatusDisplayName('draft')).toBe('Draft')
    expect(getInvoiceStatusDisplayName('open')).toBe('Open')
    expect(getInvoiceStatusDisplayName('paid')).toBe('Paid')
    expect(getInvoiceStatusDisplayName('void')).toBe('Void')
    expect(getInvoiceStatusDisplayName('uncollectible')).toBe('Uncollectible')
  })
})

describe('isInvoiceFinalized', () => {
  it('returns true for finalized statuses', () => {
    expect(isInvoiceFinalized('paid')).toBe(true)
    expect(isInvoiceFinalized('void')).toBe(true)
    expect(isInvoiceFinalized('uncollectible')).toBe(true)
  })

  it('returns false for non-finalized statuses', () => {
    expect(isInvoiceFinalized('draft')).toBe(false)
    expect(isInvoiceFinalized('open')).toBe(false)
  })
})

describe('requiresPayment', () => {
  it('returns true for open status', () => {
    expect(requiresPayment('open')).toBe(true)
  })

  it('returns false for other statuses', () => {
    expect(requiresPayment('draft')).toBe(false)
    expect(requiresPayment('paid')).toBe(false)
    expect(requiresPayment('void')).toBe(false)
    expect(requiresPayment('uncollectible')).toBe(false)
  })
})

describe('calculateBalance', () => {
  it('calculates correct balance', () => {
    expect(calculateBalance('100.00', '0.00')).toBe('100.00')
    expect(calculateBalance('100.00', '50.00')).toBe('50.00')
    expect(calculateBalance('100.00', '100.00')).toBe('0.00')
    expect(calculateBalance('199.99', '99.99')).toBe('100.00')
  })

  it('handles overpayment', () => {
    expect(calculateBalance('100.00', '150.00')).toBe('-50.00')
  })
})

describe('formatInvoiceAmount', () => {
  it('formats USD amounts correctly', () => {
    expect(formatInvoiceAmount('100.00', 'usd')).toBe('$100.00')
    expect(formatInvoiceAmount(100, 'usd')).toBe('$100.00')
    expect(formatInvoiceAmount('1234.56', 'usd')).toBe('$1,234.56')
  })

  it('formats EUR amounts correctly', () => {
    expect(formatInvoiceAmount('100.00', 'eur')).toMatch(/€|EUR/)
  })

  it('defaults to USD', () => {
    expect(formatInvoiceAmount('100.00')).toBe('$100.00')
  })

  it('handles string amounts', () => {
    expect(formatInvoiceAmount('99.99')).toBe('$99.99')
  })

  it('handles numeric amounts', () => {
    expect(formatInvoiceAmount(99.99)).toBe('$99.99')
  })
})
