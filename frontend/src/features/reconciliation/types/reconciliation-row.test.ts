/**
 * Tests for ReconciliationRow types.
 *
 * Validates schema definitions and type guards for reconciliation grid data.
 */

import { describe, it, expect } from 'vitest'

import {
  ReconciliationRowSchema,
  type ReconciliationRow,
  isExpensePoolRow,
  isTenantSummaryRow,
} from './reconciliation-row'

describe('ReconciliationRowSchema', () => {
  it('validates a valid expense pool row', () => {
    const validRow = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'expense_pool' as const,
      pool_name: 'Common Area Maintenance',
      pool_type: 'operating',
      total_expenses: '15000.00',
      grossed_up_expenses: '15789.47',
      tenant_shares: {
        'tenant-1': '5263.16',
        'tenant-2': '10526.31',
      },
    }

    const result = ReconciliationRowSchema.safeParse(validRow)
    expect(result.success).toBe(true)
  })

  it('validates a valid tenant summary row', () => {
    const validRow = {
      id: 'summary-tenant-1',
      type: 'tenant_summary' as const,
      tenant_id: '123e4567-e89b-12d3-a456-426614174001',
      tenant_name: 'Acme Corp',
      total_recovery: '5263.16',
    }

    const result = ReconciliationRowSchema.safeParse(validRow)
    expect(result.success).toBe(true)
  })

  it('rejects row with invalid type', () => {
    const invalidRow = {
      id: 'test-id',
      type: 'invalid_type',
      pool_name: 'Test',
    }

    const result = ReconciliationRowSchema.safeParse(invalidRow)
    expect(result.success).toBe(false)
  })

  it('rejects row with invalid financial amount format', () => {
    const invalidRow = {
      id: 'test-id',
      type: 'expense_pool',
      pool_name: 'Test Pool',
      total_expenses: 'not-a-number',
    }

    const result = ReconciliationRowSchema.safeParse(invalidRow)
    expect(result.success).toBe(false)
  })

  it('allows optional fields to be undefined', () => {
    const minimalRow = {
      id: 'test-id',
      type: 'expense_pool' as const,
      pool_name: 'Test Pool',
    }

    const result = ReconciliationRowSchema.safeParse(minimalRow)
    expect(result.success).toBe(true)
  })
})

describe('Type guards', () => {
  it('isExpensePoolRow correctly identifies expense pool rows', () => {
    const expenseRow: ReconciliationRow = {
      id: 'test-id',
      type: 'expense_pool',
      pool_name: 'Test Pool',
    }
    const tenantRow: ReconciliationRow = {
      id: 'test-id',
      type: 'tenant_summary',
      tenant_id: '123e4567-e89b-12d3-a456-426614174001',
      tenant_name: 'Test Tenant',
      total_recovery: '1000.00',
    }

    expect(isExpensePoolRow(expenseRow)).toBe(true)
    expect(isExpensePoolRow(tenantRow)).toBe(false)
  })

  it('isTenantSummaryRow correctly identifies tenant summary rows', () => {
    const expenseRow: ReconciliationRow = {
      id: 'test-id',
      type: 'expense_pool',
      pool_name: 'Test Pool',
    }
    const tenantRow: ReconciliationRow = {
      id: 'test-id',
      type: 'tenant_summary',
      tenant_id: '123e4567-e89b-12d3-a456-426614174001',
      tenant_name: 'Test Tenant',
      total_recovery: '1000.00',
    }

    expect(isTenantSummaryRow(tenantRow)).toBe(true)
    expect(isTenantSummaryRow(expenseRow)).toBe(false)
  })
})
