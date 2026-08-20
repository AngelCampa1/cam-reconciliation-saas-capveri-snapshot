/**
 * SB1103RequestsTab
 *
 * Tab component for managing California SB 1103 compliance requests on a property.
 * Shows a DataTable of requests with deadline badges, status, and export actions.
 * Displays an informational warning if the property is not in California.
 */
import { useMemo, useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { AlertTriangle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'

import {
  useSB1103Requests,
  useUpdateSB1103Request,
  useExportSB1103Request,
} from '@/api/hooks'
import { isApiError, getErrorMessage } from '@/api/errors'
import { ErrorState } from '@/components/ErrorState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { formatCalendarDate } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SB1103DeadlineBadge } from './SB1103DeadlineBadge'
import { SB1103RequestDialog } from './SB1103RequestDialog'

interface SB1103Request {
  id: string
  lease_id: string
  requested_by_name: string
  requested_by_email: string
  request_date: string
  response_deadline: string
  window_start_date: string
  window_end_date: string
  status: string
  export_format: string | null
  exported_at: string | null
  notes: string | null
}

interface SB1103RequestsTabProps {
  propertyId: string
  propertyState: string
}

// Parse a value that may be a date-only string ("2025-02-14") as LOCAL
// midnight rather than UTC. `new Date("2025-02-14")` is parsed as UTC, which
// renders as the previous calendar day for users west of UTC (all of the US) -
// that would show a compliance deadline that is off by one day. Full timestamps
// (with a "T") keep their normal parsing.
function parseLocalDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (match) {
    const [, year, month, day] = match
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  return new Date(dateStr)
}

function daysUntil(dateStr: string): number {
  const deadline = parseLocalDate(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  deadline.setHours(0, 0, 0, 0)
  return Math.round(
    (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  exported: 'Exported',
  delivered: 'Delivered',
  overdue: 'Overdue',
}

export function SB1103RequestsTab({
  propertyId,
  propertyState,
}: SB1103RequestsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Collapse the 5-column table to stacked cards on phones so the Status and
  // Actions columns don't clip on a ~390px viewport (matches sibling tabs).
  const { isMobile } = useViewport()

  const { data, isLoading, error, isPaused, refetch } =
    useSB1103Requests(propertyId)
  const isOffline = isPaused && !data
  const requests = useMemo(() => data?.data ?? [], [data?.data])

  const updateMutation = useUpdateSB1103Request({
    onSuccess: () => toast.success('Request updated'),
    onError: (err) =>
      toast.error('Update failed', { description: getErrorMessage(err) }),
  })

  const exportMutation = useExportSB1103Request()

  const handleExport = (
    requestId: string,
    format: 'pdf' | 'excel' | 'both'
  ) => {
    exportMutation.mutate(
      { requestId, format },
      {
        onSuccess: () => toast.success(`Export triggered (${format})`),
        onError: (err) =>
          toast.error('Export failed', { description: getErrorMessage(err) }),
      }
    )
  }

  const handleMarkDelivered = (requestId: string) => {
    updateMutation.mutate({ requestId, data: { status: 'delivered' } })
  }

  const renderStatusBadge = (status: string) => (
    <Badge variant="outline">{STATUS_LABELS[status] ?? status}</Badge>
  )

  const renderActions = (request: SB1103Request) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport(request.id, 'pdf')}>
          Export PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport(request.id, 'excel')}>
          Export Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport(request.id, 'both')}>
          Export Both (ZIP)
        </DropdownMenuItem>
        {request.status !== 'delivered' && (
          <DropdownMenuItem onClick={() => handleMarkDelivered(request.id)}>
            Mark as Delivered
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const columns: ColumnDef<SB1103Request>[] = [
    {
      accessorKey: 'requested_by_name',
      header: 'Requestor',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.requested_by_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.requested_by_email}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'request_date',
      header: 'Request Date',
      cell: ({ row }) => formatCalendarDate(row.original.request_date),
    },
    {
      accessorKey: 'response_deadline',
      header: 'Response Deadline',
      cell: ({ row }) => {
        const days = daysUntil(row.original.response_deadline)
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm">
              {formatCalendarDate(row.original.response_deadline)}
            </span>
            <SB1103DeadlineBadge
              status={row.original.status}
              daysRemaining={days}
            />
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => renderStatusBadge(row.original.status),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => renderActions(row.original),
    },
  ]

  if (isOffline) {
    return (
      <ErrorState
        size="sm"
        title="Couldn't load compliance requests"
        offline
        action={{ onClick: () => refetch() }}
      />
    )
  }

  if (error) {
    if (isApiError(error) && error.isNotFoundError) {
      return (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm text-warning-foreground">
          Compliance endpoint is currently unavailable. Please try again later
          or contact support if this continues.
        </div>
      )
    }

    return (
      <ErrorState
        size="sm"
        title="Couldn't load compliance requests"
        action={{ onClick: () => refetch() }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {propertyState?.toUpperCase() !== 'CA' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Non-California Property</AlertTitle>
          <AlertDescription>
            This property is not in California. California SB 1103 may not
            apply. Please verify applicability with legal counsel before
            responding to any requests.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">SB 1103 Compliance Requests</h2>
          <p className="text-sm text-muted-foreground">
            Track and respond to Qualified Commercial Tenant CAM disclosure
            requests within the 30-day deadline.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Log New Request
        </Button>
      </div>

      {isMobile && requests.length > 0 ? (
        <div className="space-y-3 md:hidden">
          {requests.map((request) => {
            const days = daysUntil(request.response_deadline)
            return (
              <div key={request.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {request.requested_by_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request.requested_by_email}
                    </p>
                  </div>
                  <span className="shrink-0">
                    {renderStatusBadge(request.status)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Requested</dt>
                    <dd>{formatCalendarDate(request.request_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Response deadline
                    </dt>
                    <dd className="flex flex-col gap-1">
                      <span>
                        {formatCalendarDate(request.response_deadline)}
                      </span>
                      <SB1103DeadlineBadge
                        status={request.status}
                        daysRemaining={days}
                      />
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end">
                  {renderActions(request)}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className={isMobile && requests.length > 0 ? 'hidden md:block' : ''}>
        <DataTable
          columns={columns}
          data={requests}
          isLoading={isLoading}
          emptyMessage="No SB 1103 requests logged yet."
        />
      </div>

      <SB1103RequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        propertyId={propertyId}
      />
    </div>
  )
}
