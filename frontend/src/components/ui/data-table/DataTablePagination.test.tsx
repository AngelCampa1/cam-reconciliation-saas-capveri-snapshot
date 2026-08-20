import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTablePagination } from './DataTablePagination'

// Mock table object for testing
function createMockTable(
  overrides: Partial<ReturnType<typeof createDefaultMockTable>> = {}
) {
  const defaultMock = createDefaultMockTable()
  return { ...defaultMock, ...overrides }
}

function createDefaultMockTable() {
  return {
    getFilteredSelectedRowModel: vi.fn(() => ({ rows: [] })),
    getFilteredRowModel: vi.fn(() => ({ rows: Array(50).fill({}) })),
    getState: vi.fn(() => ({
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    })),
    setPageSize: vi.fn(),
    setPageIndex: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    getCanPreviousPage: vi.fn(() => false),
    getCanNextPage: vi.fn(() => true),
    getPageCount: vi.fn(() => 5),
  }
}

describe('DataTablePagination', () => {
  describe('Rendering', () => {
    it('should render pagination container', () => {
      const mockTable = createMockTable()
      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument()
    })

    it('should display total row count when no selection', () => {
      const mockTable = createMockTable({
        getFilteredRowModel: vi.fn(() => ({ rows: Array(50).fill({}) })),
        getFilteredSelectedRowModel: vi.fn(() => ({ rows: [] })),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('row-selection-count')).toHaveTextContent(
        '50 rows total'
      )
    })

    it('should display selection count when rows selected', () => {
      const mockTable = createMockTable({
        getFilteredRowModel: vi.fn(() => ({ rows: Array(50).fill({}) })),
        getFilteredSelectedRowModel: vi.fn(() => ({ rows: Array(5).fill({}) })),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('row-selection-count')).toHaveTextContent(
        '5 of 50 rows selected'
      )
    })

    it('uses singular "row" when exactly one row is selected', () => {
      const mockTable = createMockTable({
        getFilteredRowModel: vi.fn(() => ({ rows: Array(50).fill({}) })),
        getFilteredSelectedRowModel: vi.fn(() => ({ rows: Array(1).fill({}) })),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('row-selection-count')).toHaveTextContent(
        '1 of 50 row selected'
      )
    })

    it('should display current page info', () => {
      const mockTable = createMockTable({
        getState: vi.fn(() => ({
          pagination: { pageIndex: 2, pageSize: 10 },
        })),
        getPageCount: vi.fn(() => 5),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('page-info')).toHaveTextContent('3/5')
    })

    it('should show 1/1, not 1/0, when there are no rows', () => {
      const mockTable = createMockTable({
        getState: vi.fn(() => ({
          pagination: { pageIndex: 0, pageSize: 10 },
        })),
        getPageCount: vi.fn(() => 0),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('page-info')).toHaveTextContent('1/1')
    })
  })

  describe('Page Size Selection', () => {
    it('should render page size selector', () => {
      const mockTable = createMockTable()
      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('page-size-select')).toBeInTheDocument()
    })

    it('should display current page size', () => {
      const mockTable = createMockTable({
        getState: vi.fn(() => ({
          pagination: { pageIndex: 0, pageSize: 20 },
        })),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('page-size-select')).toHaveTextContent('20')
    })

    it('should use custom page size options', async () => {
      const user = userEvent.setup()
      const mockTable = createMockTable()

      render(
        <DataTablePagination
          table={mockTable as any}
          pageSizeOptions={[5, 15, 25]}
        />
      )

      // Open the select
      await user.click(screen.getByTestId('page-size-select'))

      expect(screen.getByTestId('page-size-5')).toBeInTheDocument()
      expect(screen.getByTestId('page-size-15')).toBeInTheDocument()
      expect(screen.getByTestId('page-size-25')).toBeInTheDocument()
    })

    it('should call setPageSize when page size changed', async () => {
      const user = userEvent.setup()
      const setPageSize = vi.fn()
      const mockTable = createMockTable({ setPageSize })

      render(<DataTablePagination table={mockTable as any} />)

      await user.click(screen.getByTestId('page-size-select'))
      await user.click(screen.getByTestId('page-size-20'))

      expect(setPageSize).toHaveBeenCalledWith(20)
    })
  })

  describe('Navigation Buttons', () => {
    it('should render all navigation buttons', () => {
      const mockTable = createMockTable()
      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('first-page-button')).toBeInTheDocument()
      expect(screen.getByTestId('previous-page-button')).toBeInTheDocument()
      expect(screen.getByTestId('next-page-button')).toBeInTheDocument()
      expect(screen.getByTestId('last-page-button')).toBeInTheDocument()
    })

    it('should disable previous buttons on first page', () => {
      const mockTable = createMockTable({
        getCanPreviousPage: vi.fn(() => false),
        getCanNextPage: vi.fn(() => true),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('first-page-button')).toBeDisabled()
      expect(screen.getByTestId('previous-page-button')).toBeDisabled()
      expect(screen.getByTestId('next-page-button')).not.toBeDisabled()
      expect(screen.getByTestId('last-page-button')).not.toBeDisabled()
    })

    it('should disable next buttons on last page', () => {
      const mockTable = createMockTable({
        getCanPreviousPage: vi.fn(() => true),
        getCanNextPage: vi.fn(() => false),
      })

      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('first-page-button')).not.toBeDisabled()
      expect(screen.getByTestId('previous-page-button')).not.toBeDisabled()
      expect(screen.getByTestId('next-page-button')).toBeDisabled()
      expect(screen.getByTestId('last-page-button')).toBeDisabled()
    })

    it('should call setPageIndex(0) on first page click', async () => {
      const user = userEvent.setup()
      const setPageIndex = vi.fn()
      const mockTable = createMockTable({
        setPageIndex,
        getCanPreviousPage: vi.fn(() => true),
      })

      render(<DataTablePagination table={mockTable as any} />)

      await user.click(screen.getByTestId('first-page-button'))

      expect(setPageIndex).toHaveBeenCalledWith(0)
    })

    it('should call previousPage on previous click', async () => {
      const user = userEvent.setup()
      const previousPage = vi.fn()
      const mockTable = createMockTable({
        previousPage,
        getCanPreviousPage: vi.fn(() => true),
      })

      render(<DataTablePagination table={mockTable as any} />)

      await user.click(screen.getByTestId('previous-page-button'))

      expect(previousPage).toHaveBeenCalled()
    })

    it('should call nextPage on next click', async () => {
      const user = userEvent.setup()
      const nextPage = vi.fn()
      const mockTable = createMockTable({
        nextPage,
        getCanNextPage: vi.fn(() => true),
      })

      render(<DataTablePagination table={mockTable as any} />)

      await user.click(screen.getByTestId('next-page-button'))

      expect(nextPage).toHaveBeenCalled()
    })

    it('should call setPageIndex(last) on last page click', async () => {
      const user = userEvent.setup()
      const setPageIndex = vi.fn()
      const mockTable = createMockTable({
        setPageIndex,
        getCanNextPage: vi.fn(() => true),
        getPageCount: vi.fn(() => 5),
      })

      render(<DataTablePagination table={mockTable as any} />)

      await user.click(screen.getByTestId('last-page-button'))

      expect(setPageIndex).toHaveBeenCalledWith(4) // 5 - 1
    })
  })

  describe('Accessibility', () => {
    it('should have aria-labels on navigation buttons', () => {
      const mockTable = createMockTable()
      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('first-page-button')).toHaveAttribute(
        'aria-label',
        'Go to first page'
      )
      expect(screen.getByTestId('previous-page-button')).toHaveAttribute(
        'aria-label',
        'Go to previous page'
      )
      expect(screen.getByTestId('next-page-button')).toHaveAttribute(
        'aria-label',
        'Go to next page'
      )
      expect(screen.getByTestId('last-page-button')).toHaveAttribute(
        'aria-label',
        'Go to last page'
      )
    })
  })

  describe('Design canon', () => {
    it('navigation buttons have pill corners (rounded-full)', () => {
      const mockTable = createMockTable()
      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('first-page-button')).toHaveClass(
        'rounded-full'
      )
      expect(screen.getByTestId('previous-page-button')).toHaveClass(
        'rounded-full'
      )
      expect(screen.getByTestId('next-page-button')).toHaveClass('rounded-full')
      expect(screen.getByTestId('last-page-button')).toHaveClass('rounded-full')
    })

    it('page size selector has pill corners (rounded-full)', () => {
      const mockTable = createMockTable()
      render(<DataTablePagination table={mockTable as any} />)

      expect(screen.getByTestId('page-size-select')).toHaveClass('rounded-full')
    })
  })
})
