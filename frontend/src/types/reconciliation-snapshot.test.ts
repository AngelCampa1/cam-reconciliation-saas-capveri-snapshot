/**
 * Tests for ReconciliationSnapshot Zod schemas and helper functions.
 */

import { describe, expect, it } from 'vitest'

import { ReconciliationStatus } from './enums'
import {
  CalculationTraceEntrySchema,
  canModifySnapshot,
  formatPeriodRange,
  formatRecoveryAmount,
  getReconciliationStatusDisplayName,
  isValidReconciliationStatus,
  ReconciliationSnapshotCreateSchema,
  ReconciliationSnapshotFinalizeSchema,
  ReconciliationSnapshotSchema,
  ReconciliationSnapshotSummarySchema,
  ReconciliationSnapshotUpdateSchema,
  ReconciliationStatusSchema,
} from './reconciliation-snapshot'

describe('ReconciliationStatusSchema', () => {
  it('accepts valid status values', () => {
    expect(ReconciliationStatusSchema.parse('draft')).toBe('draft')
    expect(ReconciliationStatusSchema.parse('finalized')).toBe('finalized')
  })

  it('rejects invalid status values', () => {
    expect(() => ReconciliationStatusSchema.parse('pending')).toThrow()
    expect(() => ReconciliationStatusSchema.parse('DRAFT')).toThrow()
    expect(() => ReconciliationStatusSchema.parse('')).toThrow()
  })
})

describe('isValidReconciliationStatus', () => {
  it('returns true for valid status values', () => {
    expect(isValidReconciliationStatus('draft')).toBe(true)
    expect(isValidReconciliationStatus('finalized')).toBe(true)
  })

  it('returns false for invalid status values', () => {
    expect(isValidReconciliationStatus('pending')).toBe(false)
    expect(isValidReconciliationStatus('DRAFT')).toBe(false)
    expect(isValidReconciliationStatus('')).toBe(false)
    expect(isValidReconciliationStatus('complete')).toBe(false)
  })
})

describe('CalculationTraceEntrySchema', () => {
  it('accepts any record structure', () => {
    const entry = { step: 'gross_up', value: 1000.5, notes: 'test' }
    expect(CalculationTraceEntrySchema.parse(entry)).toEqual(entry)
  })

  it('accepts empty objects', () => {
    expect(CalculationTraceEntrySchema.parse({})).toEqual({})
  })

  it('accepts nested structures', () => {
    const entry = {
      calculation: { type: 'cap', inputs: [1, 2, 3] },
      result: { value: '500.00' },
    }
    expect(CalculationTraceEntrySchema.parse(entry)).toEqual(entry)
  })
})

describe('ReconciliationSnapshotSchema', () => {
  const validSnapshot = {
    id: crypto.randomUUID(),
    property_id: crypto.randomUUID(),
    lease_id: crypto.randomUUID(),
    period_start_date: '2024-01-01',
    period_end_date: '2024-12-31',
    status: 'draft',
    total_operating_expenses: '100000.00',
    grossed_up_expenses: '105000.00',
    base_year_amount: '80000.00',
    tenant_share_before_cap: '25000.00',
    tenant_share_after_cap: '22500.00',
    admin_fee: '3375.00',
    total_recovery: '25875.00',
    calculation_trace: [],
    finalized_at: null,
    finalized_by_user_id: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  }

  it('parses a valid draft snapshot', () => {
    const result = ReconciliationSnapshotSchema.parse(validSnapshot)
    expect(result.id).toBe(validSnapshot.id)
    expect(result.status).toBe('draft')
    expect(result.total_recovery).toBe('25875.00')
  })

  it('parses a finalized snapshot', () => {
    const finalized = {
      ...validSnapshot,
      status: 'finalized',
      finalized_at: '2024-02-01T15:30:00Z',
      finalized_by_user_id: crypto.randomUUID(),
    }
    const result = ReconciliationSnapshotSchema.parse(finalized)
    expect(result.status).toBe('finalized')
    expect(result.finalized_at).toBe('2024-02-01T15:30:00Z')
  })

  it('accepts negative financial amounts for credits', () => {
    const withCredits = {
      ...validSnapshot,
      admin_fee: '-500.00',
    }
    const result = ReconciliationSnapshotSchema.parse(withCredits)
    expect(result.admin_fee).toBe('-500.00')
  })

  it('accepts calculation trace entries', () => {
    const withTrace = {
      ...validSnapshot,
      calculation_trace: [
        { step: 'total_expenses', value: '100000.00' },
        { step: 'gross_up', factor: '1.05', result: '105000.00' },
        { step: 'tenant_share', percentage: '0.25', result: '25000.00' },
      ],
    }
    const result = ReconciliationSnapshotSchema.parse(withTrace)
    expect(result.calculation_trace).toHaveLength(3)
  })

  it('defaults calculation_trace to empty array', () => {
    const withoutTrace = { ...validSnapshot }
    delete (withoutTrace as Record<string, unknown>).calculation_trace
    const result = ReconciliationSnapshotSchema.parse(withoutTrace)
    expect(result.calculation_trace).toEqual([])
  })

  it('rejects invalid UUIDs', () => {
    expect(() =>
      ReconciliationSnapshotSchema.parse({
        ...validSnapshot,
        id: 'not-a-uuid',
      })
    ).toThrow()
  })

  it('rejects invalid date formats', () => {
    expect(() =>
      ReconciliationSnapshotSchema.parse({
        ...validSnapshot,
        period_start_date: '01/01/2024',
      })
    ).toThrow()
  })

  it('rejects invalid financial amount formats', () => {
    expect(() =>
      ReconciliationSnapshotSchema.parse({
        ...validSnapshot,
        total_recovery: '$25,875.00',
      })
    ).toThrow()

    expect(() =>
      ReconciliationSnapshotSchema.parse({
        ...validSnapshot,
        total_recovery: 'invalid',
      })
    ).toThrow()
  })

  it('rejects invalid status values', () => {
    expect(() =>
      ReconciliationSnapshotSchema.parse({
        ...validSnapshot,
        status: 'pending',
      })
    ).toThrow()
  })
})

describe('ReconciliationSnapshotCreateSchema', () => {
  const validCreate = {
    property_id: crypto.randomUUID(),
    lease_id: crypto.randomUUID(),
    period_start_date: '2024-01-01',
    period_end_date: '2024-12-31',
    total_operating_expenses: '100000.00',
    grossed_up_expenses: '105000.00',
    base_year_amount: '80000.00',
    tenant_share_before_cap: '25000.00',
    tenant_share_after_cap: '22500.00',
    admin_fee: '3375.00',
    total_recovery: '25875.00',
  }

  it('parses valid create DTO', () => {
    const result = ReconciliationSnapshotCreateSchema.parse(validCreate)
    expect(result.property_id).toBe(validCreate.property_id)
    expect(result.status).toBe('draft') // Default value
    expect(result.calculation_trace).toEqual([]) // Default value
  })

  it('allows explicit status', () => {
    const withStatus = { ...validCreate, status: 'draft' as const }
    const result = ReconciliationSnapshotCreateSchema.parse(withStatus)
    expect(result.status).toBe('draft')
  })

  it('allows calculation trace', () => {
    const withTrace = {
      ...validCreate,
      calculation_trace: [{ step: 'init', value: 0 }],
    }
    const result = ReconciliationSnapshotCreateSchema.parse(withTrace)
    expect(result.calculation_trace).toHaveLength(1)
  })

  it('rejects when period_end_date is before period_start_date', () => {
    expect(() =>
      ReconciliationSnapshotCreateSchema.parse({
        ...validCreate,
        period_start_date: '2024-12-31',
        period_end_date: '2024-01-01',
      })
    ).toThrow('period_end_date must be after period_start_date')
  })

  it('rejects when period_end_date equals period_start_date', () => {
    expect(() =>
      ReconciliationSnapshotCreateSchema.parse({
        ...validCreate,
        period_start_date: '2024-06-15',
        period_end_date: '2024-06-15',
      })
    ).toThrow('period_end_date must be after period_start_date')
  })

  it('accepts valid period with one day difference', () => {
    const result = ReconciliationSnapshotCreateSchema.parse({
      ...validCreate,
      period_start_date: '2024-01-01',
      period_end_date: '2024-01-02',
    })
    expect(result.period_start_date).toBe('2024-01-01')
    expect(result.period_end_date).toBe('2024-01-02')
  })

  it('rejects missing required financial fields', () => {
    const missing = { ...validCreate }
    delete (missing as Record<string, unknown>).total_recovery
    expect(() => ReconciliationSnapshotCreateSchema.parse(missing)).toThrow()
  })
})

describe('ReconciliationSnapshotUpdateSchema', () => {
  it('parses empty update (all optional)', () => {
    const result = ReconciliationSnapshotUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('parses status update only', () => {
    const result = ReconciliationSnapshotUpdateSchema.parse({
      status: 'finalized',
    })
    expect(result.status).toBe('finalized')
  })

  it('parses financial value updates', () => {
    const result = ReconciliationSnapshotUpdateSchema.parse({
      total_recovery: '30000.00',
      admin_fee: '4500.00',
    })
    expect(result.total_recovery).toBe('30000.00')
    expect(result.admin_fee).toBe('4500.00')
  })

  it('parses calculation trace update', () => {
    const result = ReconciliationSnapshotUpdateSchema.parse({
      calculation_trace: [{ step: 'recalc', reason: 'adjustment' }],
    })
    expect(result.calculation_trace).toHaveLength(1)
  })

  it('rejects invalid financial amounts', () => {
    expect(() =>
      ReconciliationSnapshotUpdateSchema.parse({
        total_recovery: 'invalid',
      })
    ).toThrow()
  })
})

describe('ReconciliationSnapshotFinalizeSchema', () => {
  it('parses valid finalize DTO', () => {
    const userId = crypto.randomUUID()
    const result = ReconciliationSnapshotFinalizeSchema.parse({
      finalized_by_user_id: userId,
    })
    expect(result.finalized_by_user_id).toBe(userId)
  })

  it('rejects missing user ID', () => {
    expect(() => ReconciliationSnapshotFinalizeSchema.parse({})).toThrow()
  })

  it('rejects invalid UUID', () => {
    expect(() =>
      ReconciliationSnapshotFinalizeSchema.parse({
        finalized_by_user_id: 'not-a-uuid',
      })
    ).toThrow()
  })
})

describe('ReconciliationSnapshotSummarySchema', () => {
  const validSummary = {
    id: crypto.randomUUID(),
    property_id: crypto.randomUUID(),
    lease_id: crypto.randomUUID(),
    period_start_date: '2024-01-01',
    period_end_date: '2024-12-31',
    status: 'draft',
    total_recovery: '25875.00',
    is_finalized: false,
    finalized_at: null,
  }

  it('parses valid summary', () => {
    const result = ReconciliationSnapshotSummarySchema.parse(validSummary)
    expect(result.id).toBe(validSummary.id)
    expect(result.is_finalized).toBe(false)
  })

  it('parses summary with optional display fields', () => {
    const withDisplay = {
      ...validSummary,
      property_name: 'Main Street Plaza',
      tenant_name: 'Acme Corp',
    }
    const result = ReconciliationSnapshotSummarySchema.parse(withDisplay)
    expect(result.property_name).toBe('Main Street Plaza')
    expect(result.tenant_name).toBe('Acme Corp')
  })

  it('parses finalized summary', () => {
    const finalized = {
      ...validSummary,
      status: 'finalized',
      is_finalized: true,
      finalized_at: '2024-02-01T15:30:00Z',
    }
    const result = ReconciliationSnapshotSummarySchema.parse(finalized)
    expect(result.is_finalized).toBe(true)
    expect(result.finalized_at).toBe('2024-02-01T15:30:00Z')
  })

  it('defaults is_finalized to false', () => {
    const withoutFlag = { ...validSummary }
    delete (withoutFlag as Record<string, unknown>).is_finalized
    const result = ReconciliationSnapshotSummarySchema.parse(withoutFlag)
    expect(result.is_finalized).toBe(false)
  })
})

describe('canModifySnapshot', () => {
  it('returns true for draft snapshots', () => {
    const draft = {
      id: crypto.randomUUID(),
      property_id: crypto.randomUUID(),
      lease_id: crypto.randomUUID(),
      period_start_date: '2024-01-01',
      period_end_date: '2024-12-31',
      status: ReconciliationStatus.DRAFT,
      total_operating_expenses: '100000.00',
      grossed_up_expenses: '105000.00',
      base_year_amount: '80000.00',
      tenant_share_before_cap: '25000.00',
      tenant_share_after_cap: '22500.00',
      admin_fee: '3375.00',
      total_recovery: '25875.00',
      calculation_trace: [],
      finalized_at: null,
      finalized_by_user_id: null,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    }
    expect(canModifySnapshot(draft)).toBe(true)
  })

  it('returns false for finalized snapshots', () => {
    const finalized = {
      id: crypto.randomUUID(),
      property_id: crypto.randomUUID(),
      lease_id: crypto.randomUUID(),
      period_start_date: '2024-01-01',
      period_end_date: '2024-12-31',
      status: ReconciliationStatus.FINALIZED,
      total_operating_expenses: '100000.00',
      grossed_up_expenses: '105000.00',
      base_year_amount: '80000.00',
      tenant_share_before_cap: '25000.00',
      tenant_share_after_cap: '22500.00',
      admin_fee: '3375.00',
      total_recovery: '25875.00',
      calculation_trace: [],
      finalized_at: '2024-02-01T15:30:00Z',
      finalized_by_user_id: crypto.randomUUID(),
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-02-01T15:30:00Z',
    }
    expect(canModifySnapshot(finalized)).toBe(false)
  })
})

describe('formatRecoveryAmount', () => {
  it('formats positive amounts with currency symbol', () => {
    expect(formatRecoveryAmount('25875.00')).toBe('$25,875.00')
  })

  it('formats negative amounts correctly', () => {
    expect(formatRecoveryAmount('-500.00')).toBe('-$500.00')
  })

  it('formats zero', () => {
    expect(formatRecoveryAmount('0')).toBe('$0.00')
    expect(formatRecoveryAmount('0.00')).toBe('$0.00')
  })

  it('formats large amounts with commas', () => {
    expect(formatRecoveryAmount('1234567.89')).toBe('$1,234,567.89')
  })

  it('returns original string for invalid input', () => {
    expect(formatRecoveryAmount('invalid')).toBe('invalid')
    expect(formatRecoveryAmount('')).toBe('')
  })

  it('handles decimal precision', () => {
    expect(formatRecoveryAmount('100.5')).toBe('$100.50')
    expect(formatRecoveryAmount('100.123')).toBe('$100.12')
  })

  it('preserves precision on large Decimal strings (F-107)', () => {
    // parseFloat() would coerce this to the nearest double and display
    // "...98"; formatting the string directly keeps the exact digits.
    expect(formatRecoveryAmount('99999999999999.99')).toBe(
      '$99,999,999,999,999.99'
    )
    expect(formatRecoveryAmount('9007199254740993.01')).toBe(
      '$9,007,199,254,740,993.01'
    )
  })

  it('returns original string for whitespace-only and trailing-garbage input', () => {
    expect(formatRecoveryAmount('   ')).toBe('   ')
    expect(formatRecoveryAmount('12.5abc')).toBe('12.5abc')
  })

  it('trims surrounding whitespace around a numeric value', () => {
    expect(formatRecoveryAmount('  1234.56  ')).toBe('$1,234.56')
  })
})

describe('getReconciliationStatusDisplayName', () => {
  it('returns correct display names', () => {
    expect(getReconciliationStatusDisplayName(ReconciliationStatus.DRAFT)).toBe(
      'Draft'
    )
    expect(
      getReconciliationStatusDisplayName(ReconciliationStatus.FINALIZED)
    ).toBe('Finalized')
  })
})

describe('formatPeriodRange', () => {
  it('formats a full year period', () => {
    const result = formatPeriodRange('2024-01-01', '2024-12-31')
    expect(result).toBe('Jan 1, 2024 - Dec 31, 2024')
  })

  it('formats a partial year period', () => {
    const result = formatPeriodRange('2024-04-01', '2024-06-30')
    expect(result).toBe('Apr 1, 2024 - Jun 30, 2024')
  })

  it('formats a cross-year period', () => {
    const result = formatPeriodRange('2023-10-01', '2024-03-31')
    expect(result).toBe('Oct 1, 2023 - Mar 31, 2024')
  })

  it('formats a single day period', () => {
    const result = formatPeriodRange('2024-06-15', '2024-06-16')
    expect(result).toBe('Jun 15, 2024 - Jun 16, 2024')
  })
})
