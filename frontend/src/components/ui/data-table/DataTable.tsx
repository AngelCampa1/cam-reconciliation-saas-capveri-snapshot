import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  Row,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { Inbox } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTablePagination } from './DataTablePagination'
import { DataTableSkeleton } from './DataTableSkeleton'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useViewport } from '@/hooks/useViewport'

interface DataTableProps<TData, TValue> {
  /** Column definitions for the table */
  columns: ColumnDef<TData, TValue>[]
  /** Data to display in the table */
  data: TData[]
  /** Loading state - shows skeleton */
  isLoading?: boolean
  /** Message to display when no data */
  emptyMessage?: string
  /** Enable row selection */
  enableRowSelection?: boolean
  /** Callback when row selection changes */
  onRowSelectionChange?: (selectedRows: TData[]) => void
  /** Enable pagination (default: true) */
  enablePagination?: boolean
  /** Initial page size (default: 10) */
  pageSize?: number
  /** Page size options for pagination */
  pageSizeOptions?: number[] | undefined
  /** Custom class name */
  className?: string | undefined
  /** Get row ID for selection tracking */
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string
  /** Callback when row is clicked */
  onRowClick?: (row: TData) => void
  /** Mobile card renderer for responsive design - renders cards on mobile instead of table */
  mobileCardRenderer?: (row: TData, index: number) => React.ReactNode
  /** Breakpoint width for mobile card view (default: 768) */
  mobileBreakpoint?: number
  /** Accessible caption for the table (sr-only if not a visible heading) */
  caption?: string
  /** Returns an accessible label for an interactive row */
  getRowLabel?: (row: TData) => string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No results found.',
  enableRowSelection = false,
  onRowSelectionChange,
  enablePagination = true,
  pageSize = 10,
  pageSizeOptions,
  className,
  getRowId,
  onRowClick,
  mobileCardRenderer,
  mobileBreakpoint = 768,
  caption,
  getRowLabel,
}: DataTableProps<TData, TValue>) {
  const viewport = useViewport()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [showScrollIndicator, setShowScrollIndicator] = React.useState(false)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  // Check if we should show mobile cards
  const showMobileCards =
    mobileCardRenderer && viewport.width < mobileBreakpoint

  // Detect horizontal scrollability for scroll indicator
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const checkScrollable = () => {
      const isScrollable = container.scrollWidth > container.clientWidth
      setShowScrollIndicator(isScrollable)
    }

    checkScrollable()
    window.addEventListener('resize', checkScrollable)
    return () => window.removeEventListener('resize', checkScrollable)
  }, [data])

  // Build columns with optional row selection
  const tableColumns = React.useMemo(() => {
    if (!enableRowSelection) return columns

    const selectionColumn: ColumnDef<TData, TValue> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          data-testid="select-all-checkbox"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          data-testid={`select-row-${row.id}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    }

    return [selectionColumn, ...columns]
  }, [columns, enableRowSelection])

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    ...(enablePagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    ...(getRowId ? { getRowId } : {}),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  })

  // Notify parent of selection changes
  React.useEffect(() => {
    if (onRowSelectionChange) {
      const selectedRows = table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original)
      onRowSelectionChange(selectedRows)
    }
  }, [rowSelection, onRowSelectionChange, table])

  // Loading state — match the loaded layout so the skeleton doesn't flip
  // from a table shape to cards once data arrives on mobile.
  if (isLoading) {
    if (showMobileCards) {
      return (
        <div
          className={cn('space-y-md', className)}
          data-testid="data-table-mobile-skeleton"
          aria-busy="true"
          aria-label="Loading data"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} showHeader bodyLines={2} />
          ))}
        </div>
      )
    }
    return (
      <DataTableSkeleton
        columnCount={columns.length}
        showCheckbox={enableRowSelection}
        className={className}
      />
    )
  }

  // Mobile card view
  if (showMobileCards) {
    return (
      <div
        className={cn('space-y-lg', className)}
        data-testid="data-table-mobile"
      >
        <div className="space-y-md">
          {table.getRowModel().rows.length > 0 ? (
            table
              .getRowModel()
              .rows.map((row, index) => (
                <div key={row.id}>
                  {mobileCardRenderer(row.original, index)}
                </div>
              ))
          ) : (
            <Card className="p-2xl text-center text-muted-foreground">
              <div className="flex flex-col items-center justify-center gap-2 py-lg">
                <Inbox
                  className="h-8 w-8 text-muted-foreground/40"
                  aria-hidden="true"
                />
                <span className="text-sm">{emptyMessage}</span>
              </div>
            </Card>
          )}
        </div>
        {enablePagination && (
          <DataTablePagination
            table={table}
            pageSizeOptions={pageSizeOptions}
          />
        )}
      </div>
    )
  }

  // Desktop table view
  return (
    <div className={cn('space-y-lg', className)} data-testid="data-table">
      <div ref={scrollContainerRef} className="overflow-x-auto relative">
        {/* Scroll indicator gradient */}
        {showScrollIndicator && (
          <div className="absolute right-0 top-0 bottom-0 w-[var(--spacing-2xl)] bg-gradient-to-l from-background to-transparent pointer-events-none z-sticky" />
        )}
        <div className="inline-block min-w-full align-middle">
          {/* Enhanced container with refined shadow and border */}
          <div className="rounded-lg border border-border-subtle overflow-hidden shadow-sm bg-card">
            <Table>
              {caption && <caption className="sr-only">{caption}</caption>}
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isSorted = header.column.getIsSorted()
                      const ariaSort =
                        isSorted === 'asc'
                          ? ('ascending' as const)
                          : isSorted === 'desc'
                            ? ('descending' as const)
                            : header.column.getCanSort()
                              ? ('none' as const)
                              : undefined
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          data-testid={`column-${header.id}`}
                          aria-sort={ariaSort}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      data-testid={`row-${row.id}`}
                      tabIndex={0}
                      aria-label={getRowLabel?.(row.original)}
                      onClick={() => onRowClick?.(row.original)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (onRowClick) {
                            onRowClick(row.original)
                          } else if (enableRowSelection) {
                            row.toggleSelected(!row.getIsSelected())
                          }
                        }
                      }}
                      className={cn(
                        'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        onRowClick &&
                          'cursor-pointer hover:bg-[var(--table-row-bg-hover)]',
                        row.getIsSelected() &&
                          'bg-[var(--table-row-bg-selected)] border-l-4 border-l-[var(--table-row-border-selected)]'
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          data-testid={`cell-${cell.id}`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={tableColumns.length}
                      className="text-center text-muted-foreground"
                      data-testid="empty-state"
                    >
                      <div className="flex flex-col items-center justify-center gap-2 py-4xl">
                        <Inbox
                          className="h-8 w-8 text-muted-foreground/40"
                          aria-hidden="true"
                        />
                        <span className="text-sm">{emptyMessage}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      {enablePagination && (
        <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
      )}
    </div>
  )
}
