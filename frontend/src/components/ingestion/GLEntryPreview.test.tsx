import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GLEntryPreview, GLEntry } from './GLEntryPreview'

describe('GLEntryPreview', () => {
  const mockEntries: GLEntry[] = [
    {
      id: '1',
      date: new Date('2024-01-15'),
      account: '6000',
      description: 'Janitorial Services',
      debit: '1500.0',
      credit: null,
      balance: '1500.0',
    },
    {
      id: '2',
      date: new Date('2024-01-20'),
      account: '6100',
      description: 'Utilities - Electric',
      debit: null,
      credit: '850.5',
      balance: '649.5',
    },
    {
      id: '3',
      date: new Date('2024-02-05'),
      account: '6200',
      description: 'Property Insurance',
      debit: '2000.0',
      credit: null,
      balance: '2649.5',
    },
    {
      id: '4',
      date: new Date('2024-02-10'),
      account: '6000',
      description: 'Janitorial Supplies',
      debit: '250.0',
      credit: null,
      balance: '2899.5',
    },
    {
      id: '5',
      date: new Date('2024-02-15'),
      account: '7000',
      description: 'Property Tax Payment',
      debit: null,
      credit: '5000.0',
      balance: '-2100.5',
    },
  ]

  it('renders GL entry table with all columns', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    expect(screen.getByText('GL Entry Preview')).toBeInTheDocument()
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Debit')).toBeInTheDocument()
    expect(screen.getByText('Credit')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
  })

  it('displays all GL entries', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    expect(screen.getByText('Janitorial Services')).toBeInTheDocument()
    expect(screen.getByText('Utilities - Electric')).toBeInTheDocument()
    expect(screen.getByText('Property Insurance')).toBeInTheDocument()
    expect(screen.getByText('Janitorial Supplies')).toBeInTheDocument()
    expect(screen.getByText('Property Tax Payment')).toBeInTheDocument()
  })

  it('displays entry count correctly', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    expect(screen.getByText('5 entries')).toBeInTheDocument()
  })

  it('displays singular form for one entry', () => {
    render(<GLEntryPreview entries={[mockEntries[0]]} />)

    expect(screen.getByText('1 entry')).toBeInTheDocument()
  })

  it('formats currency values correctly', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    // Currency values may appear in multiple columns (debit/credit/balance)
    expect(screen.getAllByText('$1,500.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$850.50').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$2,000.00').length).toBeGreaterThan(0)
  })

  it('displays dash for null debit/credit values', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1] // Skip header row

    // First entry has debit but no credit- expect both debit and balance to show $1,500.00
    const amounts = within(firstDataRow).getAllByText('$1,500.00')
    expect(amounts.length).toBeGreaterThan(0)
    const cells = within(firstDataRow).getAllByText('-')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('colors negative balances in red', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    const rows = screen.getAllByRole('row')
    const lastRow = rows[rows.length - 1]

    const balanceCell = within(lastRow).getByText(/2,100\.50/)
    expect(balanceCell).toHaveClass('text-destructive-strong')
  })

  it('colors positive balances in green', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // Balance appears in last column - get all instances and check the balance column
    const balanceCells = within(firstDataRow).getAllByText('$1,500.00')
    const balanceCell = balanceCells[balanceCells.length - 1] // Balance is last occurrence
    expect(balanceCell).toHaveClass('text-success-strong')
  })

  it('filters entries by account search', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const searchInput = screen.getByLabelText(/Search Account or Description/)
    await user.type(searchInput, '6000')

    // Should show only entries with account 6000
    expect(screen.getByText('Janitorial Services')).toBeInTheDocument()
    expect(screen.getByText('Janitorial Supplies')).toBeInTheDocument()
    expect(screen.queryByText('Utilities - Electric')).not.toBeInTheDocument()
    expect(screen.getByText('2 entries (filtered)')).toBeInTheDocument()
  })

  it('filters entries by description search', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const searchInput = screen.getByLabelText(/Search Account or Description/)
    await user.type(searchInput, 'Insurance')

    expect(screen.getByText('Property Insurance')).toBeInTheDocument()
    expect(screen.queryByText('Janitorial Services')).not.toBeInTheDocument()
    expect(screen.getByText('1 entry (filtered)')).toBeInTheDocument()
  })

  it('filters entries by date from', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const dateFromInput = screen.getByLabelText('Date From')
    await user.type(dateFromInput, '2024-02-01')

    // Should only show February entries
    expect(screen.getByText('Property Insurance')).toBeInTheDocument()
    expect(screen.getByText('Janitorial Supplies')).toBeInTheDocument()
    expect(screen.getByText('Property Tax Payment')).toBeInTheDocument()
    expect(screen.queryByText('Janitorial Services')).not.toBeInTheDocument()
    expect(screen.getByText('3 entries (filtered)')).toBeInTheDocument()
  })

  it('filters entries by date to', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const dateToInput = screen.getByLabelText('Date To')
    await user.type(dateToInput, '2024-01-31')

    // Should only show January entries
    expect(screen.getByText('Janitorial Services')).toBeInTheDocument()
    expect(screen.getByText('Utilities - Electric')).toBeInTheDocument()
    expect(screen.queryByText('Property Insurance')).not.toBeInTheDocument()
    expect(screen.getByText('2 entries (filtered)')).toBeInTheDocument()
  })

  it('filters entries by date range', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const dateFromInput = screen.getByLabelText('Date From')
    const dateToInput = screen.getByLabelText('Date To')

    await user.type(dateFromInput, '2024-02-01')
    await user.type(dateToInput, '2024-02-10')

    // Should show only entries between Feb 1 and Feb 10
    expect(screen.getByText('Property Insurance')).toBeInTheDocument()
    expect(screen.getByText('Janitorial Supplies')).toBeInTheDocument()
    expect(screen.queryByText('Property Tax Payment')).not.toBeInTheDocument()
    expect(screen.getByText('2 entries (filtered)')).toBeInTheDocument()
  })

  it('sorts by date ascending', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const dateHeader = screen.getByRole('button', { name: /Date/ })
    await user.click(dateHeader)

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // First entry should be Jan 15 (Janitorial Services)
    expect(
      within(firstDataRow).getByText('Janitorial Services')
    ).toBeInTheDocument()
  })

  it('sorts by date descending', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const dateHeader = screen.getByRole('button', { name: /Date/ })
    await user.click(dateHeader) // asc
    await user.click(dateHeader) // desc

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // First entry should be Feb 15 (Property Tax Payment)
    expect(
      within(firstDataRow).getByText('Property Tax Payment')
    ).toBeInTheDocument()
  })

  it('clears sort on third click', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const dateHeader = screen.getByRole('button', { name: /Date/ })
    await user.click(dateHeader) // asc
    await user.click(dateHeader) // desc
    await user.click(dateHeader) // clear

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // Should be back to original order (first entry)
    expect(
      within(firstDataRow).getByText('Janitorial Services')
    ).toBeInTheDocument()
  })

  it('sorts by account', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const accountHeader = screen.getByRole('button', { name: /Account/ })
    await user.click(accountHeader)

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // First entry should be account 6000
    expect(within(firstDataRow).getByText('6000')).toBeInTheDocument()
  })

  it('sorts by debit amount', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const debitHeader = screen.getByRole('button', { name: /Debit/ })
    await user.click(debitHeader)

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // First entry should have smallest debit (credit entries have null debit, treated as 0)
    expect(
      within(firstDataRow).getByText('Utilities - Electric')
    ).toBeInTheDocument()
  })

  it('sorts by credit amount', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const creditHeader = screen.getByRole('button', { name: /Credit/ })
    await user.click(creditHeader)

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]

    // First entry should be debit-only (null credit, treated as 0)
    expect(
      within(firstDataRow).getByText('Janitorial Services')
    ).toBeInTheDocument()
  })

  it('paginates entries when exceeding page size', () => {
    const manyEntries: GLEntry[] = Array.from({ length: 75 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(2024, 0, i + 1),
      account: `${6000 + i}`,
      description: `Entry ${i + 1}`,
      debit: i % 2 === 0 ? '100' : null,
      credit: i % 2 === 1 ? '50' : null,
      balance: '100',
    }))

    render(<GLEntryPreview entries={manyEntries} pageSize={50} />)

    expect(screen.getByText('Entry 1')).toBeInTheDocument()
    expect(screen.queryByText('Entry 51')).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('navigates to next page', async () => {
    const user = userEvent.setup()

    const manyEntries: GLEntry[] = Array.from({ length: 75 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(2024, 0, i + 1),
      account: `${6000 + i}`,
      description: `Entry ${i + 1}`,
      debit: i % 2 === 0 ? '100' : null,
      credit: i % 2 === 1 ? '50' : null,
      balance: '100',
    }))

    render(<GLEntryPreview entries={manyEntries} pageSize={50} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.queryByText('Entry 1')).not.toBeInTheDocument()
    expect(screen.getByText('Entry 51')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('navigates to previous page', async () => {
    const user = userEvent.setup()

    const manyEntries: GLEntry[] = Array.from({ length: 75 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(2024, 0, i + 1),
      account: `${6000 + i}`,
      description: `Entry ${i + 1}`,
      debit: i % 2 === 0 ? '100' : null,
      credit: i % 2 === 1 ? '50' : null,
      balance: '100',
    }))

    render(<GLEntryPreview entries={manyEntries} pageSize={50} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))

    expect(screen.getByText('Entry 1')).toBeInTheDocument()
    expect(screen.queryByText('Entry 51')).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('disables previous button on first page', () => {
    const manyEntries: GLEntry[] = Array.from({ length: 75 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(2024, 0, i + 1),
      account: `${6000 + i}`,
      description: `Entry ${i + 1}`,
      debit: '100',
      credit: null,
      balance: '100',
    }))

    render(<GLEntryPreview entries={manyEntries} pageSize={50} />)

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('disables next button on last page', async () => {
    const user = userEvent.setup()

    const manyEntries: GLEntry[] = Array.from({ length: 75 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(2024, 0, i + 1),
      account: `${6000 + i}`,
      description: `Entry ${i + 1}`,
      debit: '100',
      credit: null,
      balance: '100',
    }))

    render(<GLEntryPreview entries={manyEntries} pageSize={50} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('shows export CSV button when callback provided', () => {
    const mockExport = vi.fn()

    render(<GLEntryPreview entries={mockEntries} onExportCSV={mockExport} />)

    expect(
      screen.getByRole('button', { name: /Export to CSV/ })
    ).toBeInTheDocument()
  })

  it('calls onExportCSV when export button clicked', async () => {
    const user = userEvent.setup()
    const mockExport = vi.fn()

    render(<GLEntryPreview entries={mockEntries} onExportCSV={mockExport} />)

    await user.click(screen.getByRole('button', { name: /Export to CSV/ }))

    expect(mockExport).toHaveBeenCalled()
  })

  it('does not show export button when callback not provided', () => {
    render(<GLEntryPreview entries={mockEntries} />)

    expect(
      screen.queryByRole('button', { name: /Export to CSV/ })
    ).not.toBeInTheDocument()
  })

  it('shows view import batch button when batch ID and callback provided', () => {
    const mockViewBatch = vi.fn()

    render(
      <GLEntryPreview
        entries={mockEntries}
        importBatchId="batch-123"
        onViewImportBatch={mockViewBatch}
      />
    )

    expect(
      screen.getByRole('button', { name: /View Import Batch/ })
    ).toBeInTheDocument()
  })

  it('calls onViewImportBatch when button clicked', async () => {
    const user = userEvent.setup()
    const mockViewBatch = vi.fn()

    render(
      <GLEntryPreview
        entries={mockEntries}
        importBatchId="batch-123"
        onViewImportBatch={mockViewBatch}
      />
    )

    await user.click(screen.getByRole('button', { name: /View Import Batch/ }))

    expect(mockViewBatch).toHaveBeenCalledWith('batch-123')
  })

  it('does not show view batch button when batch ID not provided', () => {
    const mockViewBatch = vi.fn()

    render(
      <GLEntryPreview entries={mockEntries} onViewImportBatch={mockViewBatch} />
    )

    expect(
      screen.queryByRole('button', { name: /View Import Batch/ })
    ).not.toBeInTheDocument()
  })

  it('does not show view batch button when callback not provided', () => {
    render(<GLEntryPreview entries={mockEntries} importBatchId="batch-123" />)

    expect(
      screen.queryByRole('button', { name: /View Import Batch/ })
    ).not.toBeInTheDocument()
  })

  it('shows no entries message when all entries filtered out', async () => {
    const user = userEvent.setup()

    render(<GLEntryPreview entries={mockEntries} />)

    const searchInput = screen.getByLabelText(/Search Account or Description/)
    await user.type(searchInput, 'nonexistent')

    expect(
      screen.getByText('No entries found. Try adjusting your filters.')
    ).toBeInTheDocument()
  })

  it('resets to first page when applying filters', async () => {
    const user = userEvent.setup()

    const manyEntries: GLEntry[] = Array.from({ length: 75 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(2024, 0, i + 1),
      account: i < 50 ? '6000' : '7000',
      description: `Entry ${i + 1}`,
      debit: '100',
      credit: null,
      balance: '100',
    }))

    render(<GLEntryPreview entries={manyEntries} pageSize={50} />)

    // Go to page 2
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()

    // Apply search filter
    const searchInput = screen.getByLabelText(/Search Account or Description/)
    await user.type(searchInput, '6000')

    // Should be back on page 1 - Entry 1 should be visible (not Entry 51+)
    expect(screen.getByText('Entry 1')).toBeInTheDocument()
    expect(screen.queryByText('Entry 51')).not.toBeInTheDocument()
  })
})
