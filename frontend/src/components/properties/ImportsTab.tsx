/**
 * ImportsTab Component
 *
 * Displays the 10 most recent import batches for a property.
 * Provides navigation to the full ingestion page.
 *
 * Features:
 * - DataTable with file name, date, source, row count, and status
 * - Status badges with color coding
 * - Empty state with CTA button
 * - "View All Imports" button for navigation
 */

import type { ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { useViewport } from '@/hooks/useViewport'
import { FileSpreadsheet, CheckCircle, XCircle, Loader } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { usePropertyImports } from '@/api/hooks'
import type { ImportBatchSummary } from '@/api/generated/types.gen'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { formatNumber } from '@/lib/number'
import { pluralize } from '@/lib/pluralize'
import { getSourceLabel } from '@/lib/source-system'
import { cn, formatTimestampDate } from '@/lib/utils'

interface ImportsTabProps {
  propertyId: string
}

export function ImportsTab({ propertyId }: ImportsTabProps) {
  const navigate = useNavigate()
  const { isMobile } = useViewport()
  const { data, isLoading, error, refetch, isPaused } = usePropertyImports(
    propertyId,
    {
      page: 1,
      size: 10,
    }
  )

  const recentImports = (data?.imports ?? []).slice(0, 10)

  const isOffline = isPaused && !data

  const handleViewAll = () => {
    navigate('/ingestion', { state: { propertyId } })
  }

  const handleEmptyCTA = () => {
    navigate('/ingestion', { state: { propertyId } })
  }

  const formatRowCount = (count: number | undefined | null) => {
    if (count == null) return '0'
    return formatNumber(count)
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        label: string
        className: string
        icon: ComponentType<{ className?: string }>
      }
    > = {
      completed: {
        label: 'Success',
        className: 'text-success',
        icon: CheckCircle,
      },
      failed: {
        label: 'Failed',
        className: 'text-destructive',
        icon: XCircle,
      },
      processing: {
        label: 'Processing',
        className: 'text-primary',
        icon: Loader,
      },
    }

    const config = statusConfig[status] || statusConfig.completed
    const Icon = config?.icon || CheckCircle

    return (
      <div
        className={cn(
          'flex items-center gap-1',
          config?.className || 'text-success'
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span>{config?.label || 'Success'}</span>
      </div>
    )
  }

  const columns: ColumnDef<ImportBatchSummary>[] = [
    {
      accessorKey: 'filename',
      header: 'File Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileSpreadsheet
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{row.original.filename}</span>
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => formatTimestampDate(row.original.created_at),
    },
    {
      accessorKey: 'parser_type',
      header: 'Source',
      cell: ({ row }) => getSourceLabel(row.original.parser_type),
    },
    {
      accessorKey: 'rows_processed',
      header: 'Rows',
      cell: ({ row }) => formatRowCount(row.original.rows_processed),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
  ]

  // Error state
  if (error || isOffline) {
    return (
      <ErrorState
        title="Couldn't load imports"
        size="sm"
        offline={isOffline}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  // Empty state - only show when not loading, not offline, and no data
  if (!isLoading && !isOffline && recentImports.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No imports yet"
        description="Upload GL data to get started with reconciliations."
        action={{
          label: 'Upload GL Data',
          onClick: handleEmptyCTA,
        }}
      />
    )
  }

  // Data table view - shown when loading or has data
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Recent Imports</h2>
        <Button
          onClick={handleViewAll}
          variant="outline"
          className="w-full sm:w-auto"
        >
          View All Imports
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-3 md:hidden">
          {recentImports.map((importBatch) => (
            <div key={importBatch.id} className="rounded-lg border bg-card p-4">
              <p className="truncate font-medium" title={importBatch.filename}>
                {importBatch.filename}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatTimestampDate(importBatch.created_at)} ·{' '}
                {getSourceLabel(importBatch.parser_type)}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {formatRowCount(importBatch.rows_processed)}{' '}
                  {pluralize(importBatch.rows_processed, 'row')}
                </span>
                {getStatusBadge(importBatch.status)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className={isMobile ? 'hidden md:block' : ''}>
        <DataTable
          columns={columns}
          data={recentImports}
          isLoading={isLoading}
          emptyMessage="No imports found"
          enablePagination={false}
        />
      </div>
    </div>
  )
}
