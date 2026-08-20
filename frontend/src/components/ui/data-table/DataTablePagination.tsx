import { Table } from '@tanstack/react-table'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  pageSizeOptions?: number[] | undefined
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
}: DataTablePaginationProps<TData>) {
  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length
  const totalRowCount = table.getFilteredRowModel().rows.length

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4 border-t border-border-subtle"
      data-testid="data-table-pagination"
    >
      {/* Row count / selection info */}
      <div
        className="flex-1 text-sm text-muted-foreground text-left"
        data-testid="row-selection-count"
      >
        {selectedRowCount > 0 ? (
          <span>
            <span className="font-medium text-foreground">
              {selectedRowCount}
            </span>
            {' of '}
            <span className="font-medium text-foreground">{totalRowCount}</span>
            {selectedRowCount === 1 ? ' row selected' : ' rows selected'}
          </span>
        ) : (
          <span>
            <span className="font-medium text-foreground">{totalRowCount}</span>
            {totalRowCount === 1 ? ' row total' : ' rows total'}
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 sm:space-x-6 lg:space-x-8">
        {/* Rows per page selector */}
        <div className="flex items-center space-x-2">
          <p className="text-sm text-muted-foreground">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger
              className="h-8 w-[70px] rounded-full border-border-subtle"
              data-testid="page-size-select"
            >
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem
                  key={pageSize}
                  value={`${pageSize}`}
                  data-testid={`page-size-${pageSize}`}
                >
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pill-style page indicator */}
        <div
          className="flex items-center justify-center px-3 py-1 rounded-full bg-muted/50 text-sm font-medium"
          data-testid="page-info"
        >
          <span className="text-foreground">
            {table.getState().pagination.pageIndex + 1}
          </span>
          <span className="text-muted-foreground mx-1">/</span>
          <span className="text-muted-foreground">
            {Math.max(1, table.getPageCount())}
          </span>
        </div>

        {/* Navigation buttons - grouped with connected styling (pill outer shape per design canon) */}
        <div className="flex items-center rounded-full border border-border-subtle overflow-hidden">
          <Button
            variant="ghost"
            className="hidden min-h-[44px] min-w-[44px] p-0 lg:flex rounded-full border-r border-border-subtle hover:bg-muted/50"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            data-testid="first-page-button"
            aria-label="Go to first page"
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px] min-w-[44px] p-0 rounded-full border-r border-border-subtle hover:bg-muted/50"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            data-testid="previous-page-button"
            aria-label="Go to previous page"
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px] min-w-[44px] p-0 rounded-full border-r border-border-subtle lg:border-r hover:bg-muted/50"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            data-testid="next-page-button"
            aria-label="Go to next page"
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            className="hidden min-h-[44px] min-w-[44px] p-0 lg:flex rounded-full hover:bg-muted/50"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            data-testid="last-page-button"
            aria-label="Go to last page"
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
