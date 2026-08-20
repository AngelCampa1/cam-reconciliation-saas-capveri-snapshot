import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DataTableColumnHeader,
  DataTableColumnVisibility,
} from './DataTableColumnHeader'

// Mock column object
function createMockColumn(
  overrides: Partial<ReturnType<typeof createDefaultMockColumn>> = {}
) {
  const defaultMock = createDefaultMockColumn()
  return { ...defaultMock, ...overrides }
}

function createDefaultMockColumn() {
  return {
    getCanSort: vi.fn(() => true),
    getIsSorted: vi.fn(() => false as 'asc' | 'desc' | false),
    toggleSorting: vi.fn(),
    getCanHide: vi.fn(() => true),
  }
}

// Mock table object for visibility tests
function createMockTable(
  overrides: Partial<ReturnType<typeof createDefaultMockTable>> = {}
) {
  const defaultMock = createDefaultMockTable()
  return { ...defaultMock, ...overrides }
}

function createDefaultMockTable() {
  return {
    getAllColumns: vi.fn(() => [
      {
        id: 'name',
        getCanHide: vi.fn(() => true),
        getIsVisible: vi.fn(() => true),
        toggleVisibility: vi.fn(),
      },
      {
        id: 'email',
        getCanHide: vi.fn(() => true),
        getIsVisible: vi.fn(() => true),
        toggleVisibility: vi.fn(),
      },
      {
        id: 'status',
        getCanHide: vi.fn(() => true),
        getIsVisible: vi.fn(() => false),
        toggleVisibility: vi.fn(),
      },
      {
        id: 'select',
        getCanHide: vi.fn(() => false), // Selection column can't be hidden
        getIsVisible: vi.fn(() => true),
        toggleVisibility: vi.fn(),
      },
    ]),
  }
}

describe('DataTableColumnHeader', () => {
  describe('Non-Sortable Column', () => {
    it('should render plain text when column cannot sort', () => {
      const mockColumn = createMockColumn({
        getCanSort: vi.fn(() => false),
      })

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      expect(screen.getByTestId('column-header')).toHaveTextContent('Name')
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('should apply custom className to non-sortable header', () => {
      const mockColumn = createMockColumn({
        getCanSort: vi.fn(() => false),
      })

      render(
        <DataTableColumnHeader
          column={mockColumn as any}
          title="Name"
          className="custom-class"
        />
      )

      expect(screen.getByTestId('column-header')).toHaveClass('custom-class')
    })
  })

  describe('Sortable Column', () => {
    it('should render button when column can sort', () => {
      const mockColumn = createMockColumn()

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      expect(screen.getByRole('button')).toBeInTheDocument()
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('should show unsorted icon when not sorted', () => {
      const mockColumn = createMockColumn({
        getIsSorted: vi.fn(() => false),
      })

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      expect(screen.getByTestId('sort-icon-unsorted')).toBeInTheDocument()
    })

    it('should show ascending icon when sorted asc', () => {
      const mockColumn = createMockColumn({
        getIsSorted: vi.fn(() => 'asc' as const),
      })

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      expect(screen.getByTestId('sort-icon-asc')).toBeInTheDocument()
    })

    it('should show descending icon when sorted desc', () => {
      const mockColumn = createMockColumn({
        getIsSorted: vi.fn(() => 'desc' as const),
      })

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      expect(screen.getByTestId('sort-icon-desc')).toBeInTheDocument()
    })

    it('should call toggleSorting with true when unsorted', async () => {
      const user = userEvent.setup()
      const toggleSorting = vi.fn()
      const mockColumn = createMockColumn({
        getIsSorted: vi.fn(() => false),
        toggleSorting,
      })

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      await user.click(screen.getByRole('button'))

      expect(toggleSorting).toHaveBeenCalledWith(false)
    })

    it('should call toggleSorting to desc when sorted asc', async () => {
      const user = userEvent.setup()
      const toggleSorting = vi.fn()
      const mockColumn = createMockColumn({
        getIsSorted: vi.fn(() => 'asc' as const),
        toggleSorting,
      })

      render(<DataTableColumnHeader column={mockColumn as any} title="Name" />)

      await user.click(screen.getByRole('button'))

      expect(toggleSorting).toHaveBeenCalledWith(true)
    })

    it('should apply custom className to sortable header', () => {
      const mockColumn = createMockColumn()

      render(
        <DataTableColumnHeader
          column={mockColumn as any}
          title="Name"
          className="custom-class"
        />
      )

      expect(screen.getByTestId('column-header-container')).toHaveClass(
        'custom-class'
      )
    })
  })
})

describe('DataTableColumnVisibility', () => {
  describe('Rendering', () => {
    it('should render visibility dropdown', () => {
      const mockTable = createMockTable()
      render(<DataTableColumnVisibility table={mockTable as any} />)

      expect(
        screen.getByTestId('column-visibility-trigger')
      ).toBeInTheDocument()
    })

    it('should show "Columns" label', () => {
      const mockTable = createMockTable()
      render(<DataTableColumnVisibility table={mockTable as any} />)

      expect(screen.getByText('Columns')).toBeInTheDocument()
    })
  })

  describe('Column Toggles', () => {
    it('should show hideable columns in dropdown', async () => {
      const user = userEvent.setup()
      const mockTable = createMockTable()

      render(<DataTableColumnVisibility table={mockTable as any} />)

      await user.click(screen.getByTestId('column-visibility-trigger'))

      expect(screen.getByTestId('column-toggle-name')).toBeInTheDocument()
      expect(screen.getByTestId('column-toggle-email')).toBeInTheDocument()
      expect(screen.getByTestId('column-toggle-status')).toBeInTheDocument()
    })

    it('should not show non-hideable columns', async () => {
      const user = userEvent.setup()
      const mockTable = createMockTable()

      render(<DataTableColumnVisibility table={mockTable as any} />)

      await user.click(screen.getByTestId('column-visibility-trigger'))

      expect(
        screen.queryByTestId('column-toggle-select')
      ).not.toBeInTheDocument()
    })

    it('should show checked state for visible columns', async () => {
      const user = userEvent.setup()
      const mockTable = createMockTable()

      render(<DataTableColumnVisibility table={mockTable as any} />)

      await user.click(screen.getByTestId('column-visibility-trigger'))

      const nameToggle = screen.getByTestId('column-toggle-name')
      expect(nameToggle).toHaveAttribute('data-state', 'checked')
    })

    it('should show unchecked state for hidden columns', async () => {
      const user = userEvent.setup()
      const mockTable = createMockTable()

      render(<DataTableColumnVisibility table={mockTable as any} />)

      await user.click(screen.getByTestId('column-visibility-trigger'))

      const statusToggle = screen.getByTestId('column-toggle-status')
      expect(statusToggle).toHaveAttribute('data-state', 'unchecked')
    })

    it('should toggle column visibility on click', async () => {
      const user = userEvent.setup()
      const toggleVisibility = vi.fn()
      const mockTable = createMockTable({
        getAllColumns: vi.fn(() => [
          {
            id: 'name',
            getCanHide: vi.fn(() => true),
            getIsVisible: vi.fn(() => true),
            toggleVisibility,
          },
        ]),
      })

      render(<DataTableColumnVisibility table={mockTable as any} />)

      await user.click(screen.getByTestId('column-visibility-trigger'))
      await user.click(screen.getByTestId('column-toggle-name'))

      expect(toggleVisibility).toHaveBeenCalledWith(false)
    })
  })

  describe('Formatting', () => {
    it('should format column names with proper capitalization', async () => {
      const user = userEvent.setup()
      const mockTable = createMockTable({
        getAllColumns: vi.fn(() => [
          {
            id: 'userName',
            getCanHide: vi.fn(() => true),
            getIsVisible: vi.fn(() => true),
            toggleVisibility: vi.fn(),
          },
          {
            id: 'created_at',
            getCanHide: vi.fn(() => true),
            getIsVisible: vi.fn(() => true),
            toggleVisibility: vi.fn(),
          },
        ]),
      })

      render(<DataTableColumnVisibility table={mockTable as any} />)

      await user.click(screen.getByTestId('column-visibility-trigger'))

      // Column names should be displayed in readable format
      expect(screen.getByText(/userName|User Name/i)).toBeInTheDocument()
    })
  })
})
