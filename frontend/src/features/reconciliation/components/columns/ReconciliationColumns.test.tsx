/**
 * Tests for reconciliation grid column definitions.
 *
 * Validates column configuration and cell rendering logic.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { flexRender } from '@tanstack/react-table'

import {
  reconciliationColumns,
  tenantSummaryColumns,
} from './ReconciliationColumns'
import { ReconciliationRow } from '../../types/reconciliation-row'

// Find column by id
function getColumnById(id: string) {
  return reconciliationColumns.find((col) => col.id === id)
}

function renderColumnById(id: string, row: ReconciliationRow) {
  const column = getColumnById(id)
  if (!column || !column.cell) return null

  const cellContext = {
    row: {
      original: row,
      index: 0,
      id: 'test-row',
    },
  } as any

  return render(<>{flexRender(column.cell, cellContext)}</>)
}

describe('reconciliationColumns', () => {
  const mockTenantRow: ReconciliationRow = {
    id: 'tenant-1',
    type: 'tenant_summary',
    tenant_id: '123e4567-e89b-12d3-a456-426614174001',
    tenant_name: 'Acme Corp',
    total_recovery: '5750.00',
    tenant_share: '5000.00',
    admin_fee: '750.00',
    final_amount: '5750.00',
  }

  const mockExpensePoolRow: ReconciliationRow = {
    id: 'pool-1',
    type: 'expense_pool',
    pool_name: 'Common Area Maintenance',
    pool_type: 'operating',
    total_expenses: '15000.00',
  }

  it('has correct number of columns', () => {
    expect(reconciliationColumns).toHaveLength(4)
  })

  describe('Name column', () => {
    it('renders tenant name for tenant summary row', () => {
      renderColumnById('name', mockTenantRow)
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    it('renders pool name for expense pool row', () => {
      renderColumnById('name', mockExpensePoolRow)
      expect(screen.getByText('Common Area Maintenance')).toBeInTheDocument()
    })

    it('renders "Unknown" when name is missing', () => {
      const rowWithoutName: ReconciliationRow = {
        id: 'tenant-2',
        type: 'tenant_summary',
        tenant_id: '123',
        tenant_name: '',
        total_recovery: '0',
      }
      renderColumnById('name', rowWithoutName)
      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })
  })

  describe('Tenant Share column', () => {
    it('renders the pre-fee tenant share for tenant summary row', () => {
      renderColumnById('tenant_share', mockTenantRow)
      expect(screen.getByText('$5,000.00')).toBeInTheDocument()
    })

    it('falls back to the all-in total when tenant_share is missing', () => {
      const legacyRow: ReconciliationRow = {
        id: 'tenant-legacy',
        type: 'tenant_summary',
        tenant_id: '123e4567-e89b-12d3-a456-426614174099',
        tenant_name: 'Legacy Tenant',
        total_recovery: '5750.00',
      }
      renderColumnById('tenant_share', legacyRow)
      expect(screen.getByText('$5,750.00')).toBeInTheDocument()
    })

    it('renders total expenses for expense pool row', () => {
      renderColumnById('tenant_share', mockExpensePoolRow)
      expect(screen.getByText('$15,000.00')).toBeInTheDocument()
    })
  })

  describe('Admin Fee column', () => {
    it('renders admin fee for tenant summary row', () => {
      renderColumnById('admin_fee', mockTenantRow)
      expect(screen.getByText('$750.00')).toBeInTheDocument()
    })

    it('renders dash when admin fee is missing', () => {
      const rowWithoutFee: ReconciliationRow = {
        id: 'tenant-2',
        type: 'tenant_summary',
        tenant_id: '123',
        tenant_name: 'Test Tenant',
        total_recovery: '1000.00',
      }
      renderColumnById('admin_fee', rowWithoutFee)
      expect(screen.getByText('--')).toBeInTheDocument()
    })

    it('F-291: admin fee placeholder dash is aria-hidden and has sr-only "Not applicable" text', () => {
      const rowWithoutFee: ReconciliationRow = {
        id: 'tenant-3',
        type: 'tenant_summary',
        tenant_id: '456',
        tenant_name: 'No Fee Tenant',
        total_recovery: '1000.00',
      }
      renderColumnById('admin_fee', rowWithoutFee)

      // Visual dash must be aria-hidden so screen readers skip it
      const dash = screen.getByText('--')
      expect(dash).toHaveAttribute('aria-hidden', 'true')

      // Screen-reader-only text provides accessible meaning
      expect(screen.getByText('Not applicable')).toBeInTheDocument()
    })

    it('F-291: admin fee pool row placeholder dash is aria-hidden with sr-only text', () => {
      renderColumnById('admin_fee', mockExpensePoolRow)

      const dash = screen.getByText('--')
      expect(dash).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByText('Not applicable')).toBeInTheDocument()
    })
  })

  describe('Final Amount column', () => {
    it('renders final amount for tenant summary row', () => {
      renderColumnById('final_amount', mockTenantRow)
      expect(screen.getByText('$5,750.00')).toBeInTheDocument()
    })

    it('renders dash for expense pool row', () => {
      renderColumnById('final_amount', mockExpensePoolRow)
      expect(screen.getByText('--')).toBeInTheDocument()
    })
  })
})

describe('tenantSummaryColumns (deprecated)', () => {
  it('is an empty array', () => {
    expect(tenantSummaryColumns).toHaveLength(0)
  })
})
