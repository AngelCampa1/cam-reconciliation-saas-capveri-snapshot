import { Column, Table } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Settings2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div
        className={cn('max-w-[200px]', className)}
        data-testid="column-header"
      >
        <span className="truncate">{title}</span>
      </div>
    )
  }

  const isSorted = column.getIsSorted()

  return (
    <div
      className={cn('flex items-center space-x-2 max-w-[200px]', className)}
      data-testid="column-header-container"
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          '-ml-3 h-8 font-semibold',
          'hover:bg-muted/50',
          'data-[state=open]:bg-accent',
          'transition-colors duration-fast',
          // Active sort highlighting
          isSorted && 'text-foreground bg-muted/30'
        )}
        onClick={() => column.toggleSorting(isSorted === 'asc')}
        data-testid={`sort-button-${column.id}`}
      >
        {/* Restore the table header's uppercase/tracking treatment that the
            Button base style resets to text-transform:none, so sortable and
            non-sortable headers render identically (TableHead sets the token). */}
        <span className="truncate uppercase tracking-wider">{title}</span>
        {isSorted === 'desc' ? (
          <ArrowDown
            className="ml-2 h-3.5 w-3.5 text-primary"
            data-testid="sort-icon-desc"
            aria-hidden="true"
          />
        ) : isSorted === 'asc' ? (
          <ArrowUp
            className="ml-2 h-3.5 w-3.5 text-primary"
            data-testid="sort-icon-asc"
            aria-hidden="true"
          />
        ) : (
          <ArrowUpDown
            className="ml-2 h-3.5 w-3.5 text-muted-foreground/60"
            data-testid="sort-icon-unsorted"
            aria-hidden="true"
          />
        )}
      </Button>
    </div>
  )
}

// Column visibility dropdown for toggling multiple columns
interface DataTableColumnVisibilityProps<TData> {
  table: Table<TData>
}

export function DataTableColumnVisibility<TData>({
  table,
}: DataTableColumnVisibilityProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
          data-testid="column-visibility-trigger"
        >
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                data-testid={`column-toggle-${column.id}`}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
