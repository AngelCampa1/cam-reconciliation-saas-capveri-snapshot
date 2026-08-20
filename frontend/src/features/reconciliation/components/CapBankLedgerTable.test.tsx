import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CapBankLedgerEntry } from '@/api/hooks'

import { CapBankLedgerTable } from './CapBankLedgerTable'

const baseEntry: CapBankLedgerEntry = {
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
}

describe('CapBankLedgerTable', () => {
  it('renders cap and bank amounts as currency', () => {
    render(<CapBankLedgerTable entries={[baseEntry]} />)
    expect(screen.getByText('$110,000.00')).toBeInTheDocument()
    expect(screen.getByText('+$5,000.00')).toBeInTheDocument()
  })

  it('formats money from the exact decimal string without a lossy float round-trip', () => {
    // A magnitude beyond JS Number.MAX_SAFE_INTEGER: parseFloat would round it
    // to 9007199254740992, so a float round-trip prints the wrong dollars. The
    // canonical exact formatter must preserve every digit (F-430).
    render(
      <CapBankLedgerTable
        entries={[{ ...baseEntry, cap_threshold: '9007199254740993.45' }]}
      />
    )
    expect(screen.getByText('$9,007,199,254,740,993.45')).toBeInTheDocument()
    expect(
      screen.queryByText('$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })

  it('renders a negative bank change with a single minus sign (no double negative)', () => {
    // The cell only prepends a "+" for positives, so a negative must show the
    // formatter's own single "-", never "--".
    render(
      <CapBankLedgerTable entries={[{ ...baseEntry, bank_change: '-5000' }]} />
    )
    expect(screen.getByText('-$5,000.00')).toBeInTheDocument()
    expect(screen.queryByText('--$5,000.00')).not.toBeInTheDocument()
  })
})
