import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ImportErrorDisplay,
  ImportErrorSummary,
  ImportError,
} from './ImportErrorDisplay'

describe('ImportErrorDisplay', () => {
  const mockErrors: ImportError[] = [
    {
      row: 5,
      column: 'Amount',
      errorType: 'invalid_format',
      message: 'Invalid number format',
      actualValue: 'abc123',
      expectedFormat: 'Decimal number (e.g., 1000.00)',
    },
    {
      row: 10,
      column: 'Date',
      errorType: 'invalid_format',
      message: 'Invalid date format',
      actualValue: '13/45/2024',
      expectedFormat: 'YYYY-MM-DD',
    },
    {
      row: 15,
      column: 'Account',
      errorType: 'missing_required',
      message: 'Required field is empty',
      actualValue: '',
      expectedFormat: 'Account code required',
    },
    {
      row: 20,
      column: 'Reference',
      errorType: 'duplicate',
      message: 'Duplicate reference number',
      actualValue: 'REF-001',
    },
    {
      row: 25,
      errorType: 'parsing',
      message: 'Unable to parse row',
    },
  ]

  const mockSummary: ImportErrorSummary = {
    totalRows: 100,
    successfulRows: 95,
    failedRows: 5,
    errors: mockErrors,
    fileName: 'test-import.csv',
  }

  it('renders error summary with file name', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(screen.getByText('Import Errors')).toBeInTheDocument()
    expect(screen.getByText('test-import.csv')).toBeInTheDocument()
  })

  it('displays total rows statistic', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(screen.getByText('Total Rows')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('displays successful rows with percentage', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(screen.getByText('Successful')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText('(95.0%)')).toBeInTheDocument()
  })

  it('displays failed rows with error count', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
    // "5" appears in multiple places, check for the failed rows specifically
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    expect(screen.getByText('(5 errors)')).toBeInTheDocument()
  })

  it('displays error summary alert', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(
      screen.getByText(/5 rows failed to import due to 5 errors/)
    ).toBeInTheDocument()
  })

  it('groups errors by type', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(screen.getByText('Errors by Type')).toBeInTheDocument()
    expect(screen.getAllByText('Invalid Format').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Missing Required Field').length
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Duplicate Entry').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Parsing Error').length).toBeGreaterThan(0)
  })

  it('displays error count for each type', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    // Invalid Format has 2 errors
    expect(screen.getByText('2 occurrences')).toBeInTheDocument()
    // Missing Required, Duplicate, Parsing each have 1 error
    const singleOccurrences = screen.getAllByText('1 occurrence')
    expect(singleOccurrences).toHaveLength(3)
  })

  it('expands error type details when clicked', async () => {
    const user = userEvent.setup()

    render(<ImportErrorDisplay summary={mockSummary} />)

    // Find the Invalid Format section button  (first occurrence in grouped section)
    const buttons = screen.getAllByText('Invalid Format')
    const invalidFormatButton = buttons[0].closest('button')

    expect(invalidFormatButton).toBeInTheDocument()
    await user.click(invalidFormatButton!)

    // Should show error details table (messages appear in both grouped section and all errors table)
    expect(screen.getAllByText('Invalid number format').length).toBeGreaterThan(
      0
    )
    expect(screen.getAllByText('Invalid date format').length).toBeGreaterThan(0)
  })

  it('collapses error type details when clicked again', async () => {
    const user = userEvent.setup()

    render(<ImportErrorDisplay summary={mockSummary} />)

    const buttons = screen.getAllByText('Invalid Format')
    const invalidFormatButton = buttons[0].closest('button')

    // Expand
    await user.click(invalidFormatButton!)
    const expandedMessages = screen.getAllByText('Invalid number format')
    expect(expandedMessages.length).toBeGreaterThan(1) // Appears in grouped section AND all errors table

    // Collapse (should only appear in all errors table now)
    await user.click(invalidFormatButton!)
    const collapsedMessages = screen.getAllByText('Invalid number format')
    expect(collapsedMessages.length).toBe(1) // Only in all errors table
  })

  it('displays row and column information in error details', async () => {
    const user = userEvent.setup()

    render(<ImportErrorDisplay summary={mockSummary} />)

    const buttons = screen.getAllByText('Invalid Format')
    const invalidFormatButton = buttons[0].closest('button')
    await user.click(invalidFormatButton!)

    expect(screen.getAllByText('5').length).toBeGreaterThan(0) // Row number appears
    expect(screen.getAllByText('Amount').length).toBeGreaterThan(0) // Column name appears
  })

  it('displays actual value and expected format', async () => {
    const user = userEvent.setup()

    render(<ImportErrorDisplay summary={mockSummary} />)

    const buttons = screen.getAllByText('Invalid Format')
    const invalidFormatButton = buttons[0].closest('button')
    await user.click(invalidFormatButton!)

    expect(screen.getAllByText('abc123').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Decimal number (e.g., 1000.00)').length
    ).toBeGreaterThan(0)
  })

  it('shows dash for missing column information', async () => {
    const user = userEvent.setup()

    render(<ImportErrorDisplay summary={mockSummary} />)

    const buttons = screen.getAllByText('Parsing Error')
    const parsingButton = buttons[0].closest('button')
    await user.click(parsingButton!)

    // The parsing error doesn't have a column
    const rows = screen.getAllByRole('row')
    const parsingErrorRow = rows.find((row) =>
      row.textContent?.includes('Unable to parse row')
    )
    expect(parsingErrorRow).toBeInTheDocument()
  })

  it('displays all errors table', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(screen.getByText('All Errors (5)')).toBeInTheDocument()
  })

  it('shows all error types in all errors table', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    // All 5 errors should be visible
    expect(screen.getByText('Invalid number format')).toBeInTheDocument()
    expect(screen.getByText('Invalid date format')).toBeInTheDocument()
    expect(screen.getByText('Required field is empty')).toBeInTheDocument()
    expect(screen.getByText('Duplicate reference number')).toBeInTheDocument()
    expect(screen.getByText('Unable to parse row')).toBeInTheDocument()
  })

  it('truncates errors list when exceeding maxVisibleErrors', () => {
    const manyErrors: ImportError[] = Array.from({ length: 75 }, (_, i) => ({
      row: i + 1,
      column: 'Test',
      errorType: 'validation' as const,
      message: `Error ${i + 1}`,
    }))

    const largeSummary: ImportErrorSummary = {
      ...mockSummary,
      errors: manyErrors,
      failedRows: 75,
    }

    render(<ImportErrorDisplay summary={largeSummary} maxVisibleErrors={50} />)

    // Should show "Show 25 more errors" button
    expect(screen.getByText('Show 25 more errors')).toBeInTheDocument()
  })

  it('shows all errors when "Show more" is clicked', async () => {
    const user = userEvent.setup()

    const manyErrors: ImportError[] = Array.from({ length: 75 }, (_, i) => ({
      row: i + 1,
      column: 'Test',
      errorType: 'validation' as const,
      message: `Error ${i + 1}`,
    }))

    const largeSummary: ImportErrorSummary = {
      ...mockSummary,
      errors: manyErrors,
      failedRows: 75,
    }

    render(<ImportErrorDisplay summary={largeSummary} maxVisibleErrors={50} />)

    await user.click(screen.getByText('Show 25 more errors'))

    // Should now show "Show fewer errors"
    expect(screen.getByText('Show fewer errors')).toBeInTheDocument()
  })

  it('hides extra errors when "Show fewer" is clicked', async () => {
    const user = userEvent.setup()

    const manyErrors: ImportError[] = Array.from({ length: 75 }, (_, i) => ({
      row: i + 1,
      column: 'Test',
      errorType: 'validation' as const,
      message: `Error ${i + 1}`,
    }))

    const largeSummary: ImportErrorSummary = {
      ...mockSummary,
      errors: manyErrors,
      failedRows: 75,
    }

    render(<ImportErrorDisplay summary={largeSummary} maxVisibleErrors={50} />)

    // Expand
    await user.click(screen.getByText('Show 25 more errors'))

    // Collapse
    await user.click(screen.getByText('Show fewer errors'))

    // Should be back to showing "Show more"
    expect(screen.getByText('Show 25 more errors')).toBeInTheDocument()
  })

  it('displays download report button when onDownloadReport is provided', () => {
    const mockDownload = vi.fn()

    render(
      <ImportErrorDisplay
        summary={mockSummary}
        onDownloadReport={mockDownload}
      />
    )

    expect(
      screen.getByRole('button', { name: /Download Error Report/ })
    ).toBeInTheDocument()
  })

  it('calls onDownloadReport when download button is clicked', async () => {
    const user = userEvent.setup()
    const mockDownload = vi.fn()

    render(
      <ImportErrorDisplay
        summary={mockSummary}
        onDownloadReport={mockDownload}
      />
    )

    await user.click(
      screen.getByRole('button', { name: /Download Error Report/ })
    )

    expect(mockDownload).toHaveBeenCalled()
  })

  it('does not show download button when onDownloadReport is not provided', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(
      screen.queryByRole('button', { name: /Download Error Report/ })
    ).not.toBeInTheDocument()
  })

  it('displays retry button when onRetry is provided', () => {
    const mockRetry = vi.fn()

    render(<ImportErrorDisplay summary={mockSummary} onRetry={mockRetry} />)

    expect(
      screen.getByRole('button', { name: /Upload Corrected File/ })
    ).toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup()
    const mockRetry = vi.fn()

    render(<ImportErrorDisplay summary={mockSummary} onRetry={mockRetry} />)

    await user.click(
      screen.getByRole('button', { name: /Upload Corrected File/ })
    )

    expect(mockRetry).toHaveBeenCalled()
  })

  it('does not show retry button when onRetry is not provided', () => {
    render(<ImportErrorDisplay summary={mockSummary} />)

    expect(
      screen.queryByRole('button', { name: /Upload Corrected File/ })
    ).not.toBeInTheDocument()
  })

  it('handles zero errors gracefully', () => {
    const noErrorsSummary: ImportErrorSummary = {
      totalRows: 100,
      successfulRows: 100,
      failedRows: 0,
      errors: [],
      fileName: 'perfect-file.csv',
    }

    render(<ImportErrorDisplay summary={noErrorsSummary} />)

    expect(screen.getByText('Import Errors')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('(100.0%)')).toBeInTheDocument()
  })

  it('formats large numbers with commas', () => {
    const largeSummary: ImportErrorSummary = {
      totalRows: 1000000,
      successfulRows: 999950,
      failedRows: 50,
      errors: mockErrors,
      fileName: 'huge-file.csv',
    }

    render(<ImportErrorDisplay summary={largeSummary} />)

    expect(screen.getByText('1,000,000')).toBeInTheDocument()
    expect(screen.getByText('999,950')).toBeInTheDocument()
  })

  it('uses singular form for 1 error', () => {
    const singleErrorSummary: ImportErrorSummary = {
      totalRows: 100,
      successfulRows: 99,
      failedRows: 1,
      errors: [mockErrors[0]],
      fileName: 'test.csv',
    }

    render(<ImportErrorDisplay summary={singleErrorSummary} />)

    expect(
      screen.getByText(/1 row failed to import due to 1 error/)
    ).toBeInTheDocument()
  })
})
