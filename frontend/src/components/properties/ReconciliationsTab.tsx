/**
 * ReconciliationsTab Component
 *
 * Displays the 10 most recent reconciliation snapshots for a property.
 * Provides navigation to the full reconciliation page.
 *
 * Features:
 * - DataTable with period, status, total recovery, and created date columns
 * - Status badges with color coding (finalized/draft)
 * - Currency and period formatting
 * - Empty state with CTA button
 * - "View All Reconciliations" button for navigation
 */

import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { Calculator, CheckCircle, Clock } from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { useReconciliationSnapshots } from '@/api/hooks'
import { formatCalendarDate, formatTimestampDate } from '@/lib/utils'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ReconciliationKickoffModal } from '@/features/reconciliation/components/ReconciliationKickoffModal'
import { formatMoney } from '@/lib/money'

interface ReconciliationsTabProps {
  propertyId: string
}

interface ReconciliationSnapshot {
  id: string
  property_id: string
  period_start_date: string
  period_end_date: string
  status: string
  finalized_at: string | null
  total_recovery: string | null
  created_at?: string
  tenant_name?: string
}

export function ReconciliationsTab({ propertyId }: ReconciliationsTabProps) {
  const navigate = useNavigate()
  const { isMobile } = useViewport()
  const [kickoffModalOpen, setKickoffModalOpen] = useState(false)
  const { data, isLoading, error, refetch, isPaused } =
    useReconciliationSnapshots(
      {
        property_id: propertyId,
        page: 1,
        size: 10,
      },
      {}
    )
  const { data: firstRunProbe } = useReconciliationSnapshots(
    {
      page: 1,
      size: 1,
    },
    {}
  )

  // Backend filtering gives us max 10 items
  const reconciliations =
    (data?.items as ReconciliationSnapshot[] | undefined) || []

  const isOffline = isPaused && !data

  const handleViewAll = () => {
    // Extract year from most recent reconciliation
    const mostRecentYear =
      reconciliations.length > 0
        ? new Date(reconciliations[0]!.period_start_date).getFullYear()
        : new Date().getFullYear()

    navigate(
      `/properties/${propertyId}/reconciliations?year=${mostRecentYear}`,
      {
        state: { propertyId },
      }
    )
  }

  const handleEmptyCTA = () => {
    const isFirstReconciliation = (firstRunProbe?.items?.length ?? 0) === 0
    if (isFirstReconciliation) {
      setKickoffModalOpen(true)
      return
    }

    // Use current year when no reconciliations exist
    const currentYear = new Date().getFullYear()
    navigate(`/properties/${propertyId}/reconciliations?year=${currentYear}`, {
      state: { propertyId },
    })
  }

  const formatPeriod = (startDate: string, endDate: string) => {
    // Period bounds are calendar dates (date-only). Format through the shared
    // TZ-safe helper so "Jan 2024" can't shift a month across timezones.
    const opts = { month: 'short', year: 'numeric' } as const
    const startFormatted = formatCalendarDate(startDate, opts)
    const endFormatted = formatCalendarDate(endDate, opts)
    return `${startFormatted} - ${endFormatted}`
  }

  const getStatusBadge = (snapshot: ReconciliationSnapshot) => {
    const isFinalized = snapshot.finalized_at !== null

    if (isFinalized) {
      return (
        <Badge variant="success" className="badge-finalized gap-1">
          <CheckCircle className="h-3 w-3" aria-hidden="true" />
          Finalized
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary" className="badge-draft gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Draft
        </Badge>
      )
    }
  }

  const handleRowClick = (snapshot: ReconciliationSnapshot) => {
    // Extract year from the date-only period string directly. Parsing
    // "2024-01-01" with new Date() yields UTC midnight, which is the PREVIOUS
    // day (and so the previous year for a Jan 1 start) in US timezones — that
    // would route a 2024 snapshot to ?year=2023. Read the year from the
    // YYYY-MM-DD parts instead so the calendar year holds in every timezone.
    const year = parseInt(
      (snapshot.period_start_date.split('T')[0] ?? '').split('-')[0] || '0',
      10
    )

    navigate(`/properties/${propertyId}/reconciliations?year=${year}`, {
      state: { propertyId, snapshotId: snapshot.id },
    })
  }

  const columns: ColumnDef<ReconciliationSnapshot>[] = [
    {
      accessorKey: 'tenant_name',
      header: 'Tenant',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.tenant_name || 'Unknown'}
        </span>
      ),
    },
    {
      accessorKey: 'period_start_date',
      header: 'Period',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatPeriod(
            row.original.period_start_date,
            row.original.period_end_date
          )}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => getStatusBadge(row.original),
    },
    {
      accessorKey: 'total_recovery',
      header: () => <span className="text-right block">Tenant Billable</span>,
      cell: ({ row }) => (
        <span className="tabular-nums font-mono text-right block">
          {formatMoney(row.original.total_recovery ?? 0)}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.created_at
            ? formatTimestampDate(row.original.created_at)
            : '-'}
        </span>
      ),
    },
  ]

  // Error state
  if (error || isOffline) {
    return (
      <ErrorState
        title="Couldn't load reconciliations"
        size="sm"
        offline={isOffline}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  // Empty state - only show when not loading, not offline, and no data
  if (!isLoading && !isOffline && reconciliations.length === 0) {
    return (
      <>
        <EmptyState
          icon={Calculator}
          title="No reconciliations yet"
          description="Calculate reconciliations to see results."
          action={{
            label: 'Calculate Reconciliation',
            onClick: handleEmptyCTA,
          }}
        />
        <ReconciliationKickoffModal
          open={kickoffModalOpen}
          onOpenChange={setKickoffModalOpen}
          initialPropertyId={propertyId}
          year={new Date().getFullYear()}
        />
      </>
    )
  }

  // Data table view - shown when loading or has data
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Recent Reconciliations</h2>
        <Button
          onClick={handleViewAll}
          variant="outline"
          className="w-full sm:w-auto"
        >
          View All Reconciliations
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-3 md:hidden">
          {reconciliations.map((snapshot) => (
            <button
              key={snapshot.id}
              type="button"
              onClick={() => handleRowClick(snapshot)}
              className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">
                  {snapshot.tenant_name || 'Unknown'}
                </p>
                <span className="shrink-0">{getStatusBadge(snapshot)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatPeriod(
                  snapshot.period_start_date,
                  snapshot.period_end_date
                )}
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Tenant Billable
                  </p>
                  <p className="font-mono font-medium tabular-nums">
                    {formatMoney(snapshot.total_recovery ?? 0)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {snapshot.created_at
                    ? formatTimestampDate(snapshot.created_at)
                    : '-'}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      <div className={isMobile ? 'hidden md:block' : ''}>
        <DataTable
          columns={columns}
          data={reconciliations}
          isLoading={isLoading}
          emptyMessage="No reconciliations found"
          enablePagination={false}
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  )
}
