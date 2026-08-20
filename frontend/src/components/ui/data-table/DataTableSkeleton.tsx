import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DataTableSkeletonProps {
  /** Number of columns to render */
  columnCount: number
  /** Number of rows to render (default: 10) */
  rowCount?: number
  /** Whether to show checkbox column (default: false) */
  showCheckbox?: boolean
  /** Render either a full standalone table or body rows for an existing table */
  variant?: 'standalone' | 'rows'
  /** Custom className for the skeleton container */
  className?: string | undefined
}

function SkeletonCell({ className }: { className?: string }) {
  // Route through the shared <Skeleton> primitive so table-loading placeholders
  // draw their pulse animation, radius, and muted color from one source instead
  // of re-implementing the same classes here (app-wide "use the shared
  // component, never hand-roll it" convention).
  return (
    <Skeleton
      className={cn('h-4 w-full', className)}
      data-testid="skeleton-cell"
    />
  )
}

export function DataTableSkeleton({
  columnCount,
  rowCount = 10,
  showCheckbox = false,
  variant = 'standalone',
  className,
}: DataTableSkeletonProps) {
  const skeletonRows = Array.from({ length: rowCount }).map((_, rowIndex) => (
    <TableRow
      key={`row-${rowIndex}`}
      data-testid={`skeleton-row-${rowIndex}`}
      aria-hidden="true"
    >
      {showCheckbox && (
        <TableCell>
          <SkeletonCell className="h-4 w-4" />
        </TableCell>
      )}
      {Array.from({ length: columnCount }).map((_, colIndex) => (
        <TableCell key={`cell-${rowIndex}-${colIndex}`}>
          <SkeletonCell
            className={cn(
              'h-4',
              // Vary widths for visual interest
              colIndex === 0 ? 'w-32' : colIndex % 2 === 0 ? 'w-20' : 'w-16'
            )}
          />
        </TableCell>
      ))}
    </TableRow>
  ))

  if (variant === 'rows') {
    return skeletonRows
  }

  return (
    <div
      className={cn('overflow-x-hidden rounded-md border', className)}
      data-testid="data-table-skeleton"
      aria-busy="true"
      aria-label="Loading table data"
    >
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckbox && (
              <TableHead className="w-[50px]">
                <SkeletonCell className="h-4 w-4" />
              </TableHead>
            )}
            {Array.from({ length: columnCount }).map((_, index) => (
              <TableHead key={`header-${index}`}>
                <SkeletonCell className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{skeletonRows}</TableBody>
      </Table>
      {/* Skeleton pagination */}
      <div
        className="flex items-center justify-between px-2 py-4 border-t"
        data-testid="skeleton-pagination"
      >
        <SkeletonCell className="h-4 w-40" />
        <div className="hidden items-center space-x-6 sm:flex">
          <div className="flex items-center space-x-2">
            <SkeletonCell className="h-4 w-24" />
            <SkeletonCell className="h-8 w-16" />
          </div>
          <SkeletonCell className="h-4 w-24" />
          <div className="flex items-center space-x-2">
            <SkeletonCell className="h-8 w-8" />
            <SkeletonCell className="h-8 w-8" />
            <SkeletonCell className="h-8 w-8" />
            <SkeletonCell className="h-8 w-8" />
          </div>
        </div>
      </div>
    </div>
  )
}
