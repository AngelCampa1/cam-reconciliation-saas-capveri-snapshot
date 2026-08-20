import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from './DataTable'
import { DataTableColumnHeader } from './DataTableColumnHeader'

// Test data type
interface TestItem {
  id: string
  name: string
  email: string
  status: string
}

// Sample test data
const testData: TestItem[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com', status: 'active' },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    status: 'inactive',
  },
  { id: '3', name: 'Bob Wilson', email: 'bob@example.com', status: 'active' },
  {
    id: '4',
    name: 'Alice Brown',
    email: 'alice@example.com',
    status: 'pending',
  },
  {
    id: '5',
    name: 'Charlie Davis',
    email: 'charlie@example.com',
    status: 'active',
  },
]

// Column definitions
const columns: ColumnDef<TestItem>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'status',
    header: 'Status',
  },
]

describe('DataTable', () => {
  describe('Rendering', () => {
    it('should render table with data', () => {
      render(<DataTable columns={columns} data={testData} />)

      expect(screen.getByTestId('data-table')).toBeInTheDocument()
      expect(screen.getByTestId('table')).toBeInTheDocument()
    })

    it('should render all column headers', () => {
      render(<DataTable columns={columns} data={testData} />)

      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('should render all data rows', () => {
      render(<DataTable columns={columns} data={testData} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(
        <DataTable columns={columns} data={testData} className="custom-class" />
      )

      expect(screen.getByTestId('data-table')).toHaveClass('custom-class')
    })
  })

  describe('Empty State', () => {
    it('should display default empty message when no data', () => {
      render(<DataTable columns={columns} data={[]} />)

      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      expect(screen.getByText('No results found.')).toBeInTheDocument()
    })

    it('should display custom empty message', () => {
      render(
        <DataTable
          columns={columns}
          data={[]}
          emptyMessage="No users available"
        />
      )

      expect(screen.getByText('No users available')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show skeleton when loading', () => {
      render(<DataTable columns={columns} data={[]} isLoading={true} />)

      expect(screen.getByTestId('data-table-skeleton')).toBeInTheDocument()
    })

    it('should not show data when loading', () => {
      render(<DataTable columns={columns} data={testData} isLoading={true} />)

      expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should show pagination controls by default', () => {
      render(<DataTable columns={columns} data={testData} />)

      expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument()
    })

    it('should hide pagination when disabled', () => {
      render(
        <DataTable columns={columns} data={testData} enablePagination={false} />
      )

      expect(
        screen.queryByTestId('data-table-pagination')
      ).not.toBeInTheDocument()
    })

    it('should use custom page size', () => {
      const largeData = Array.from({ length: 25 }, (_, i) => ({
        id: `${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        status: 'active',
      }))

      render(
        <DataTable
          columns={columns}
          data={largeData}
          pageSize={5}
          getRowId={(row) => row.id}
        />
      )

      // Should only show 5 rows (data rows have testid like row-0, row-1...)
      const rows = screen.getAllByTestId(/^row-\d+$/)
      expect(rows).toHaveLength(5)
    })

    it('should navigate between pages', async () => {
      const user = userEvent.setup()
      const largeData = Array.from({ length: 25 }, (_, i) => ({
        id: `${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        status: 'active',
      }))

      render(<DataTable columns={columns} data={largeData} pageSize={10} />)

      // First page
      expect(screen.getByText('User 0')).toBeInTheDocument()
      expect(screen.queryByText('User 10')).not.toBeInTheDocument()

      // Go to next page
      const nextButton = screen.getByTestId('next-page-button')
      await user.click(nextButton)

      expect(screen.getByText('User 10')).toBeInTheDocument()
      expect(screen.queryByText('User 0')).not.toBeInTheDocument()
    })
  })

  describe('Row Selection', () => {
    it('should not show checkboxes by default', () => {
      render(<DataTable columns={columns} data={testData} />)

      expect(
        screen.queryByTestId('select-all-checkbox')
      ).not.toBeInTheDocument()
    })

    it('should show checkboxes when row selection enabled', () => {
      render(
        <DataTable
          columns={columns}
          data={testData}
          enableRowSelection={true}
        />
      )

      expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument()
    })

    it('should select individual row', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={testData}
          enableRowSelection={true}
          onRowSelectionChange={onSelectionChange}
          getRowId={(row) => row.id}
        />
      )

      const firstRowCheckbox = screen.getByTestId('select-row-1')
      await user.click(firstRowCheckbox)

      expect(onSelectionChange).toHaveBeenCalledWith([testData[0]])
    })

    it('should select all rows on page', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={testData}
          enableRowSelection={true}
          onRowSelectionChange={onSelectionChange}
          getRowId={(row) => row.id}
        />
      )

      const selectAllCheckbox = screen.getByTestId('select-all-checkbox')
      await user.click(selectAllCheckbox)

      expect(onSelectionChange).toHaveBeenCalledWith(testData)
    })

    it('should show selected row styling', async () => {
      const user = userEvent.setup()

      render(
        <DataTable
          columns={columns}
          data={testData}
          enableRowSelection={true}
          getRowId={(row) => row.id}
        />
      )

      const firstRowCheckbox = screen.getByTestId('select-row-1')
      await user.click(firstRowCheckbox)

      const firstRow = screen.getByTestId('row-1')
      expect(firstRow).toHaveAttribute('data-state', 'selected')
    })
  })

  describe('Sorting', () => {
    it('should sort column on header click', async () => {
      const user = userEvent.setup()

      render(<DataTable columns={columns} data={testData} />)

      // Find and click the Name header button (inside column header component)
      const nameHeader = screen.getByTestId('column-name')
      const sortButton = within(nameHeader).getByRole('button')
      await user.click(sortButton)

      // After clicking, rows should be sorted alphabetically
      const rows = screen.getAllByTestId(/^row-/)
      const firstRow = rows[0]
      expect(within(firstRow).getByText('Alice Brown')).toBeInTheDocument()
    })

    it('should toggle sort direction on second click', async () => {
      const user = userEvent.setup()

      render(<DataTable columns={columns} data={testData} />)

      const nameHeader = screen.getByTestId('column-name')
      const sortButton = within(nameHeader).getByRole('button')

      // First click - ascending
      await user.click(sortButton)
      // Second click - descending
      await user.click(sortButton)

      const rows = screen.getAllByTestId(/^row-/)
      const firstRow = rows[0]
      expect(within(firstRow).getByText('John Doe')).toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should make rows focusable', () => {
      render(
        <DataTable
          columns={columns}
          data={testData}
          getRowId={(row) => row.id}
        />
      )

      const rows = screen.getAllByTestId(/^row-\d+$/)
      rows.forEach((row) => {
        // tabIndex is stored as lowercase tabindex in the DOM
        expect(row).toHaveAttribute('tabindex', '0')
      })
    })

    it('should select row on Enter key when selection enabled', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={testData}
          enableRowSelection={true}
          onRowSelectionChange={onSelectionChange}
          getRowId={(row) => row.id}
        />
      )

      const firstRow = screen.getByTestId('row-1')
      firstRow.focus()
      await user.keyboard('{Enter}')

      expect(onSelectionChange).toHaveBeenCalledWith([testData[0]])
    })

    it('should toggle selection on repeated Enter', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={testData}
          enableRowSelection={true}
          onRowSelectionChange={onSelectionChange}
          getRowId={(row) => row.id}
        />
      )

      const firstRow = screen.getByTestId('row-1')
      firstRow.focus()

      // Select
      await user.keyboard('{Enter}')
      expect(onSelectionChange).toHaveBeenLastCalledWith([testData[0]])

      // Deselect
      await user.keyboard('{Enter}')
      expect(onSelectionChange).toHaveBeenLastCalledWith([])
    })
  })

  describe('Row ID', () => {
    it('should use custom getRowId function', () => {
      render(
        <DataTable
          columns={columns}
          data={testData}
          getRowId={(row) => row.id}
        />
      )

      expect(screen.getByTestId('row-1')).toBeInTheDocument()
      expect(screen.getByTestId('row-2')).toBeInTheDocument()
    })
  })

  describe('Integration', () => {
    it('should handle combined features', async () => {
      const user = userEvent.setup()
      const onSelectionChange = vi.fn()

      const largeData = Array.from({ length: 25 }, (_, i) => ({
        id: `${i + 1}`,
        name: `User ${String.fromCharCode(90 - i)}`, // Z, Y, X, ...
        email: `user${i}@example.com`,
        status: i % 2 === 0 ? 'active' : 'inactive',
      }))

      render(
        <DataTable
          columns={columns}
          data={largeData}
          enableRowSelection={true}
          enablePagination={true}
          pageSize={5}
          onRowSelectionChange={onSelectionChange}
          getRowId={(row) => row.id}
        />
      )

      // Verify pagination - use specific regex for data rows
      expect(screen.getAllByTestId(/^row-\d+$/)).toHaveLength(5)

      // Sort by name
      const nameHeader = screen.getByTestId('column-name')
      const sortButton = within(nameHeader).getByRole('button')
      await user.click(sortButton)

      // Select first row on sorted data - get first checkbox
      const rowCheckboxes = screen.getAllByTestId(/^select-row-/)
      await user.click(rowCheckboxes[0])

      expect(onSelectionChange).toHaveBeenCalled()
    })
  })
})
