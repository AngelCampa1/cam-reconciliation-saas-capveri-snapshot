import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataTableSkeleton } from './DataTableSkeleton'

describe('DataTableSkeleton', () => {
  describe('Rendering', () => {
    it('should render skeleton container', () => {
      render(<DataTableSkeleton columnCount={3} />)

      expect(screen.getByTestId('data-table-skeleton')).toBeInTheDocument()
    })

    it('should render table structure', () => {
      render(<DataTableSkeleton columnCount={3} />)

      expect(screen.getByTestId('table')).toBeInTheDocument()
      expect(screen.getByTestId('table-header')).toBeInTheDocument()
      expect(screen.getByTestId('table-body')).toBeInTheDocument()
    })

    it('should render skeleton pagination', () => {
      render(<DataTableSkeleton columnCount={3} />)

      expect(screen.getByTestId('skeleton-pagination')).toBeInTheDocument()
    })

    it('should render row-only variant without nested table wrapper', () => {
      const { container } = render(
        <table>
          <tbody>
            <DataTableSkeleton columnCount={3} rowCount={2} variant="rows" />
          </tbody>
        </table>
      )

      expect(
        screen.queryByTestId('data-table-skeleton')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('skeleton-pagination')
      ).not.toBeInTheDocument()
      expect(screen.getAllByTestId(/^skeleton-row-/)).toHaveLength(2)
      expect(
        Array.from(container.querySelector('tbody')?.children ?? []).every(
          (child) => child.tagName === 'TR'
        )
      ).toBe(true)
    })
  })

  describe('Column Count', () => {
    it('should render correct number of header columns', () => {
      render(<DataTableSkeleton columnCount={5} />)

      const headerRow = screen.getByTestId('table-header').querySelector('tr')
      const headerCells = headerRow?.querySelectorAll('th')
      expect(headerCells).toHaveLength(5)
    })

    it('should render correct number of columns per row', () => {
      render(<DataTableSkeleton columnCount={4} />)

      const firstRow = screen.getByTestId('skeleton-row-0')
      const cells = firstRow.querySelectorAll('td')
      expect(cells).toHaveLength(4)
    })
  })

  describe('Row Count', () => {
    it('should render 10 rows by default', () => {
      render(<DataTableSkeleton columnCount={3} />)

      const rows = screen.getAllByTestId(/^skeleton-row-/)
      expect(rows).toHaveLength(10)
    })

    it('should render custom number of rows', () => {
      render(<DataTableSkeleton columnCount={3} rowCount={5} />)

      const rows = screen.getAllByTestId(/^skeleton-row-/)
      expect(rows).toHaveLength(5)
    })

    it('should render 1 row when specified', () => {
      render(<DataTableSkeleton columnCount={3} rowCount={1} />)

      const rows = screen.getAllByTestId(/^skeleton-row-/)
      expect(rows).toHaveLength(1)
    })
  })

  describe('Checkbox Column', () => {
    it('should not show checkbox column by default', () => {
      render(<DataTableSkeleton columnCount={3} />)

      const headerRow = screen.getByTestId('table-header').querySelector('tr')
      const headerCells = headerRow?.querySelectorAll('th')
      expect(headerCells).toHaveLength(3) // No extra checkbox column
    })

    it('should show checkbox column when enabled', () => {
      render(<DataTableSkeleton columnCount={3} showCheckbox={true} />)

      const headerRow = screen.getByTestId('table-header').querySelector('tr')
      const headerCells = headerRow?.querySelectorAll('th')
      expect(headerCells).toHaveLength(4) // 3 + 1 checkbox column
    })

    it('should show checkbox in each row when enabled', () => {
      render(
        <DataTableSkeleton columnCount={3} showCheckbox={true} rowCount={3} />
      )

      const firstRow = screen.getByTestId('skeleton-row-0')
      const cells = firstRow.querySelectorAll('td')
      expect(cells).toHaveLength(4) // 3 + 1 checkbox column
    })
  })

  describe('Skeleton Cells', () => {
    it('should render skeleton cells with animation', () => {
      render(<DataTableSkeleton columnCount={2} rowCount={1} />)

      const skeletonCells = screen.getAllByTestId('skeleton-cell')
      expect(skeletonCells.length).toBeGreaterThan(0)

      skeletonCells.forEach((cell) => {
        expect(cell).toHaveClass('animate-pulse')
      })
    })

    it('should have muted background on skeleton cells', () => {
      render(<DataTableSkeleton columnCount={2} rowCount={1} />)

      const skeletonCells = screen.getAllByTestId('skeleton-cell')
      skeletonCells.forEach((cell) => {
        expect(cell).toHaveClass('bg-muted')
      })
    })

    it('should have rounded corners on skeleton cells', () => {
      render(<DataTableSkeleton columnCount={2} rowCount={1} />)

      const skeletonCells = screen.getAllByTestId('skeleton-cell')
      skeletonCells.forEach((cell) => {
        // Shares the shared <Skeleton> primitive's radius (rounded-md).
        expect(cell).toHaveClass('rounded-md')
      })
    })
  })

  describe('Custom Class Name', () => {
    it('should apply custom className', () => {
      render(<DataTableSkeleton columnCount={3} className="custom-skeleton" />)

      expect(screen.getByTestId('data-table-skeleton')).toHaveClass(
        'custom-skeleton'
      )
    })

    it('should preserve default styling with custom class', () => {
      render(<DataTableSkeleton columnCount={3} className="custom-skeleton" />)

      const skeleton = screen.getByTestId('data-table-skeleton')
      expect(skeleton).toHaveClass('rounded-md')
      expect(skeleton).toHaveClass('border')
      expect(skeleton).toHaveClass('custom-skeleton')
    })
  })

  describe('Varying Widths', () => {
    it('should have varying skeleton cell widths for visual interest', () => {
      render(<DataTableSkeleton columnCount={4} rowCount={1} />)

      // The implementation uses varying widths for columns
      const skeletonCells = screen.getAllByTestId('skeleton-cell')

      // First column has w-32, others have w-20 or w-16
      const widthClasses = skeletonCells.map((cell) => {
        if (cell.classList.contains('w-32')) return 'w-32'
        if (cell.classList.contains('w-24')) return 'w-24'
        if (cell.classList.contains('w-20')) return 'w-20'
        if (cell.classList.contains('w-16')) return 'w-16'
        if (cell.classList.contains('w-8')) return 'w-8'
        if (cell.classList.contains('w-4')) return 'w-4'
        return 'unknown'
      })

      // Should have some variety in widths
      const uniqueWidths = new Set(widthClasses)
      expect(uniqueWidths.size).toBeGreaterThan(1)
    })
  })

  describe('Pagination Skeleton', () => {
    it('should render pagination skeleton elements', () => {
      render(<DataTableSkeleton columnCount={3} />)

      const pagination = screen.getByTestId('skeleton-pagination')
      const skeletonItems = pagination.querySelectorAll(
        '[data-testid="skeleton-cell"]'
      )

      // Should have multiple skeleton items for pagination controls
      expect(skeletonItems.length).toBeGreaterThan(0)
    })

    it('should have border-t on pagination section', () => {
      render(<DataTableSkeleton columnCount={3} />)

      const pagination = screen.getByTestId('skeleton-pagination')
      expect(pagination).toHaveClass('border-t')
    })
  })
})
