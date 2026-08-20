import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CapBankLedgerResponse } from '@/api/hooks'

import { CapBankLedger } from './CapBankLedger'

const useCapBankLedger = vi.fn()

vi.mock('@/api/hooks', () => ({
  useCapBankLedger: (leaseId: string) => useCapBankLedger(leaseId),
}))

const baseLedger: CapBankLedgerResponse = {
  lease_id: 'lease-1',
  tenant_name: 'Acme',
  pool_name: null,
  cap_type: 'cumulative',
  cap_rate: '0.05',
  entries: [
    {
      period_start: '2024-01-01',
      period_end: '2024-12-31',
      snapshot_id: null,
      cap_type: 'cumulative',
      cap_rate: '0.05',
      base_year_amount: '100000',
      cap_threshold: '110000',
      actual_expense: '105000',
      amount_applied: '105000',
      excess_absorbed_by_landlord: '0',
      bank_opening: '0',
      bank_change: '5000',
      bank_closing: '5000',
      finalized_at: null,
    },
  ],
  current_bank_balance: '5000.00',
  total_landlord_absorbed: '0.00',
}

function mockLedger(overrides: Partial<CapBankLedgerResponse>) {
  useCapBankLedger.mockReturnValue({
    data: { ...baseLedger, ...overrides },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
}

describe('CapBankLedger - offline / paused', () => {
  it('shows offline error state and no misleading empty copy when paused', () => {
    useCapBankLedger.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    })
    render(<CapBankLedger leaseId="lease-1" />)
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/no cap history/i)).not.toBeInTheDocument()
  })
})

describe('CapBankLedger summary header', () => {
  it('renders the two summary balances as currency', () => {
    mockLedger({})
    render(<CapBankLedger leaseId="lease-1" />)
    // The same amounts also appear in the timeline table below, so match all.
    expect(screen.getAllByText('$5,000.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0)
  })

  it('formats the headline balances from the exact decimal string without a lossy float round-trip', () => {
    // parseFloat('9007199254740993.45') === 9007199254740992 — a float round-trip
    // would print the wrong dollars on the two biggest numbers on the screen. The
    // canonical exact formatter must keep every digit (F-430).
    mockLedger({
      current_bank_balance: '9007199254740993.45',
      total_landlord_absorbed: '9007199254740993.45',
    })
    render(<CapBankLedger leaseId="lease-1" />)
    expect(
      screen.getAllByText('$9,007,199,254,740,993.45').length
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText('$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })
})
