/**
 * Tests for ExportHistory component.
 *
 * Verifies export history display with filtering and download functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportHistory } from './ExportHistory'
import type { ExportRecord } from '../types'

// Mock viewport — defaults to desktop; flip mockIsMobile for mobile tests.
let mockIsMobile = false
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    width: mockIsMobile ? 375 : 1280,
    height: 800,
    isMobile: mockIsMobile,
    isTablet: false,
    isLaptop: false,
    isDesktop: !mockIsMobile,
    size: mockIsMobile ? 'mobile' : 'desktop',
    isTouch: mockIsMobile,
  }),
}))

describe('ExportHistory', () => {
  const mockOnDownload = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnPageChange = vi.fn()

  const mockExports: ExportRecord[] = [
    {
      id: 'export-1',
      propertyId: 'prop-1',
      format: 'pdf',
      fileName: 'reconciliation-2024-Q1.pdf',
      fileUrl: 'https://example.com/file1.pdf',
      fileSize: 1024 * 500, // 500 KB
      status: 'completed',
      createdBy: 'user-1',
      createdByName: 'John Doe',
      createdAt: '2024-01-15T10:30:00Z',
      expiresAt: '2024-02-15T10:30:00Z',
    },
    {
      id: 'export-2',
      propertyId: 'prop-1',
      format: 'excel',
      fileName: 'expenses-2024.xlsx',
      fileUrl: 'https://example.com/file2.xlsx',
      fileSize: 1024 * 1024 * 2, // 2 MB
      status: 'completed',
      createdBy: 'user-2',
      createdByName: 'Jane Smith',
      createdAt: '2024-01-20T14:00:00Z',
    },
    {
      id: 'export-3',
      propertyId: 'prop-1',
      format: 'erp',
      fileName: 'yardi-export.csv',
      status: 'processing',
      createdBy: 'user-1',
      createdByName: 'John Doe',
      createdAt: '2024-01-25T09:00:00Z',
    },
    {
      id: 'export-4',
      propertyId: 'prop-1',
      format: 'pdf',
      fileName: 'failed-export.pdf',
      status: 'failed',
      createdBy: 'user-2',
      createdByName: 'Jane Smith',
      createdAt: '2024-01-26T11:00:00Z',
      errorMessage: 'File generation failed',
    },
  ]

  const defaultProps = {
    propertyId: 'prop-1',
    onDownload: mockOnDownload,
    exports: mockExports,
    total: 4,
    page: 1,
    pageSize: 10,
  }

  beforeEach(() => {
    mockOnDownload.mockClear()
    mockOnDelete.mockClear()
    mockOnPageChange.mockClear()
    mockIsMobile = false
  })

  describe('Rendering', () => {
    it('renders export history table', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getByText('reconciliation-2024-Q1.pdf')).toBeInTheDocument()
      expect(screen.getByText('expenses-2024.xlsx')).toBeInTheDocument()
      expect(screen.getByText('yardi-export.csv')).toBeInTheDocument()
    })

    it('renders filter controls', () => {
      render(<ExportHistory {...defaultProps} />)

      // Select components use combobox role
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBeGreaterThanOrEqual(2) // Format and Status selects

      expect(screen.getByLabelText('From')).toBeInTheDocument()
      expect(screen.getByLabelText('To')).toBeInTheDocument()
    })

    it('displays format badges', () => {
      render(<ExportHistory {...defaultProps} />)

      const badges = screen.getAllByText(/pdf|excel|erp/i)
      expect(badges.length).toBeGreaterThan(0)
    })

    it('displays status badges with icons', () => {
      render(<ExportHistory {...defaultProps} />)

      // Multiple exports may have same status, use getAllByText
      expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Processing').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    })

    it('shows loading state', () => {
      render(<ExportHistory {...defaultProps} isLoading={true} exports={[]} />)

      expect(screen.getAllByTestId(/^skeleton-row-/)).toHaveLength(5)
      const tableBody = screen.getByTestId('table-body')
      expect(
        Array.from(tableBody.children).every((child) => child.tagName === 'TR')
      ).toBe(true)
      expect(
        within(tableBody).queryByTestId('data-table-skeleton')
      ).not.toBeInTheDocument()
    })

    it('shows empty state', () => {
      render(<ExportHistory {...defaultProps} exports={[]} total={0} />)

      expect(screen.getByText('No exports yet')).toBeInTheDocument()
    })
  })

  describe('File Information', () => {
    it('displays file names', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(screen.getByText('reconciliation-2024-Q1.pdf')).toBeInTheDocument()
      expect(screen.getByText('expenses-2024.xlsx')).toBeInTheDocument()
    })

    it('formats file sizes correctly', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(screen.getByText('500.0 KB')).toBeInTheDocument()
      expect(screen.getByText('2.0 MB')).toBeInTheDocument()
    })

    it('displays creator names', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(screen.getAllByText('John Doe').length).toBe(2)
      expect(screen.getAllByText('Jane Smith').length).toBe(2)
    })

    it('formats dates correctly', () => {
      render(<ExportHistory {...defaultProps} />)

      // Dates should be formatted as "Jan 15, 2024, 10:30 AM" or similar
      const dateElements = screen.getAllByText(/Jan \d{1,2}, \d{4}/)
      expect(dateElements.length).toBeGreaterThan(0)
    })
  })

  describe('Expiration', () => {
    it('shows expiration countdown', () => {
      // Create export with future expiration
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 15)

      const exportsWithExpiration: ExportRecord[] = [
        {
          ...mockExports[0],
          expiresAt: futureDate.toISOString(),
        },
      ]

      render(
        <ExportHistory
          {...defaultProps}
          exports={exportsWithExpiration}
          total={1}
        />
      )

      // Should show "15d" or similar
      const expirationCells = screen.getAllByText(/\d+d|expired/i)
      expect(expirationCells.length).toBeGreaterThan(0)
    })

    it('shows dash for exports without expiration', () => {
      render(<ExportHistory {...defaultProps} />)

      // Exports without expiresAt show "-"
      const dashElements = screen.getAllByText('-')
      expect(dashElements.length).toBeGreaterThan(0)
    })
  })

  describe('Download Functionality', () => {
    it('shows download button for completed exports', () => {
      render(<ExportHistory {...defaultProps} />)

      const downloadButtons = screen.getAllByRole('button', {
        name: /download/i,
      })
      expect(downloadButtons.length).toBe(2) // Two completed exports
    })

    it('calls onDownload when download button clicked', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} />)

      const downloadButtons = screen.getAllByRole('button', {
        name: /download/i,
      })
      await user.click(downloadButtons[0])

      expect(mockOnDownload).toHaveBeenCalledWith('export-1')
    })

    it('does not show download for processing exports', () => {
      render(<ExportHistory {...defaultProps} />)

      // Processing export should not have download button
      const rows = screen.getAllByRole('row')
      const processingRow = rows.find((row) =>
        row.textContent?.includes('yardi-export.csv')
      )
      expect(processingRow).toBeDefined()
      expect(processingRow?.textContent).not.toMatch(/download/i)
    })
  })

  describe('Delete Functionality', () => {
    it('shows delete button when onDelete provided', () => {
      render(<ExportHistory {...defaultProps} onDelete={mockOnDelete} />)

      const deleteButtons = screen.getAllByRole('button', {
        name: /delete export/i,
      })
      const trashButtons = deleteButtons.filter((btn) =>
        btn.querySelector('[class*="lucide-trash"]')
      )
      expect(trashButtons.length).toBe(4) // All exports have delete button
    })

    it('does not show delete button when onDelete not provided', () => {
      render(<ExportHistory {...defaultProps} />)

      const buttons = screen.getAllByRole('button')
      const trashButtons = buttons.filter((btn) =>
        btn.querySelector('[class*="lucide-trash"]')
      )
      expect(trashButtons.length).toBe(0)
    })

    it('opens delete confirmation dialog', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} onDelete={mockOnDelete} />)

      const deleteButtons = screen.getAllByRole('button', {
        name: /delete export/i,
      })
      const trashButtons = deleteButtons.filter((btn) =>
        btn.querySelector('[class*="lucide-trash"]')
      )
      await user.click(trashButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete Export')).toBeInTheDocument()
        expect(
          screen.getByText(/are you sure you want to delete/i)
        ).toBeInTheDocument()
      })
    })

    it('calls onDelete when confirmed', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} onDelete={mockOnDelete} />)

      const deleteButtons = screen.getAllByRole('button', {
        name: /delete export/i,
      })
      const trashButtons = deleteButtons.filter((btn) =>
        btn.querySelector('[class*="lucide-trash"]')
      )
      await user.click(trashButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete Export')).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /delete/i })
      await user.click(confirmButton)

      expect(mockOnDelete).toHaveBeenCalledWith('export-1')
    })

    it('closes dialog when cancelled', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} onDelete={mockOnDelete} />)

      const deleteButtons = screen.getAllByRole('button', {
        name: /delete export/i,
      })
      const trashButtons = deleteButtons.filter((btn) =>
        btn.querySelector('[class*="lucide-trash"]')
      )
      await user.click(trashButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete Export')).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Delete Export')).not.toBeInTheDocument()
      })
      expect(mockOnDelete).not.toHaveBeenCalled()
    })
  })

  describe('Pagination', () => {
    it('does not show pagination for single page', () => {
      render(<ExportHistory {...defaultProps} total={4} pageSize={10} />)

      expect(
        screen.queryByRole('button', { name: /previous/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /next/i })
      ).not.toBeInTheDocument()
    })

    it('shows pagination for multiple pages', () => {
      render(
        <ExportHistory
          {...defaultProps}
          total={25}
          pageSize={10}
          page={1}
          onPageChange={mockOnPageChange}
        />
      )

      expect(
        screen.getByRole('button', { name: /previous/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
      expect(
        screen.getByText(/showing 1 to 10 of 25 exports/i)
      ).toBeInTheDocument()
    })

    it('disables previous button on first page', () => {
      render(
        <ExportHistory
          {...defaultProps}
          total={25}
          pageSize={10}
          page={1}
          onPageChange={mockOnPageChange}
        />
      )

      const prevButton = screen.getByRole('button', { name: /previous/i })
      expect(prevButton).toBeDisabled()
    })

    it('disables next button on last page', () => {
      render(
        <ExportHistory
          {...defaultProps}
          total={25}
          pageSize={10}
          page={3}
          onPageChange={mockOnPageChange}
        />
      )

      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).toBeDisabled()
    })

    it('calls onPageChange when next clicked', async () => {
      const user = userEvent.setup()
      render(
        <ExportHistory
          {...defaultProps}
          total={25}
          pageSize={10}
          page={1}
          onPageChange={mockOnPageChange}
        />
      )

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      expect(mockOnPageChange).toHaveBeenCalledWith(2)
    })

    it('calls onPageChange when previous clicked', async () => {
      const user = userEvent.setup()
      render(
        <ExportHistory
          {...defaultProps}
          total={25}
          pageSize={10}
          page={2}
          onPageChange={mockOnPageChange}
        />
      )

      const prevButton = screen.getByRole('button', { name: /previous/i })
      await user.click(prevButton)

      expect(mockOnPageChange).toHaveBeenCalledWith(1)
    })
  })

  describe('Filtering', () => {
    it('allows format filter selection', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} />)

      // Find format select by finding the combobox with "Format" nearby
      const selects = screen.getAllByRole('combobox')
      await user.click(selects[0]) // First select is format

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /all formats/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('option', { name: /^pdf$/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('option', { name: /^excel$/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('option', { name: /^erp$/i })
        ).toBeInTheDocument()
      })
    })

    it('allows status filter selection', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} />)

      // Second select is status
      const selects = screen.getAllByRole('combobox')
      await user.click(selects[1])

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /all statuses/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('option', { name: /^completed$/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('option', { name: /^processing$/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('option', { name: /^failed$/i })
        ).toBeInTheDocument()
      })
    })

    it('f275: format and status selects have accessible names', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(
        screen.getByRole('combobox', { name: /filter by format/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', { name: /filter by status/i })
      ).toBeInTheDocument()
    })

    it('allows date range selection', async () => {
      const user = userEvent.setup()
      render(<ExportHistory {...defaultProps} />)

      const fromInput = screen.getByLabelText('From')
      const toInput = screen.getByLabelText('To')

      // Just verify inputs are present and can be interacted with
      expect(fromInput).toBeInTheDocument()
      expect(toInput).toBeInTheDocument()
      expect(fromInput).toHaveAttribute('type', 'date')
      expect(toInput).toHaveAttribute('type', 'date')
    })
  })

  describe('mobile layout', () => {
    beforeEach(() => {
      mockIsMobile = true
    })

    it('renders mobile-cards-view with file names and status badges', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
      expect(screen.getByText('reconciliation-2024-Q1.pdf')).toBeInTheDocument()
      expect(screen.getByText('expenses-2024.xlsx')).toBeInTheDocument()
    })

    it('renders Download button full-width for completed exports on mobile', () => {
      render(<ExportHistory {...defaultProps} />)

      const downloadBtns = screen.getAllByRole('button', { name: /download/i })
      expect(downloadBtns.length).toBeGreaterThan(0)
      expect(downloadBtns[0].className).toMatch(/w-full/)
      expect(downloadBtns[0].className).toMatch(/min-h-\[44px\]/)
    })

    it('renders Delete button full-width when onDelete provided on mobile', () => {
      render(<ExportHistory {...defaultProps} onDelete={mockOnDelete} />)

      const deleteBtns = screen.getAllByRole('button', { name: /delete/i })
      expect(deleteBtns.length).toBeGreaterThan(0)
      expect(deleteBtns[0].className).toMatch(/w-full/)
      expect(deleteBtns[0].className).toMatch(/min-h-\[44px\]/)
    })

    it('shows size and expiration labels in mobile cards', () => {
      render(<ExportHistory {...defaultProps} />)

      expect(screen.getAllByText(/Size:/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Expires:/i).length).toBeGreaterThan(0)
    })
  })
})
