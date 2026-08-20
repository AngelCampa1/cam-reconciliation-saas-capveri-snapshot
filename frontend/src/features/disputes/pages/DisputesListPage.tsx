/**
 * DisputesListPage
 *
 * Landlord/admin page to view and manage all organization disputes.
 * Includes status filtering and navigation to dispute details.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useDisputes,
  type DisputeStatus,
  type DisputeSummaryDTO,
} from '@/api/hooks'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { cn, formatTimestampDate } from '@/lib/utils'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import {
  DisputeStatusBadge,
  isNeedsResponseStatus,
} from '../components/DisputeStatusBadge'
import { categoryLabel } from '../constants'
import { getCountBucket, trackEvent } from '@/lib/analytics'

// Status filter options
const STATUS_OPTIONS: Array<{ value: DisputeStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
]

function getStatusCount(disputes: DisputeSummaryDTO[], status: string) {
  return disputes.filter((dispute) => dispute.status.toLowerCase() === status)
    .length
}

export function DisputesListPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('all')

  const {
    data: disputes,
    isLoading,
    error,
    isPaused,
    refetch,
  } = useDisputes(statusFilter === 'all' ? {} : { status: statusFilter })
  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and disputes undefined, so without this the page would
  // render the "No disputes yet" empty state and imply nothing needs attention
  // when the backend is simply unreachable. The `!disputes` guard keeps any
  // already-loaded list rendered rather than hiding it behind an offline screen.
  const isOffline = isPaused && !disputes
  const loadedNeedsResponse =
    disputes?.filter((dispute) => isNeedsResponseStatus(dispute.status))
      .length ?? 0
  // The list endpoint returns at most 50 results per page. When the loaded
  // set is at the page boundary, the true count may be higher.
  const needsResponseCountLabel =
    disputes && disputes.length >= 50
      ? `${loadedNeedsResponse}+`
      : String(loadedNeedsResponse)

  useEffect(() => {
    if (!disputes) return

    trackEvent('landlord_disputes_viewed', {
      status_filter: statusFilter,
      total_count: disputes.length,
      total_count_bucket: getCountBucket(disputes.length),
      page_size: disputes.length,
      page_size_bucket: getCountBucket(disputes.length),
      needs_response_count: loadedNeedsResponse,
      needs_response_count_bucket: getCountBucket(loadedNeedsResponse),
      open_count: getStatusCount(disputes, 'open'),
      under_review_count: getStatusCount(disputes, 'under_review'),
      resolved_count: getStatusCount(disputes, 'resolved'),
      rejected_count: getStatusCount(disputes, 'rejected'),
      closed_count: getStatusCount(disputes, 'closed'),
    })
  }, [disputes, loadedNeedsResponse, statusFilter])

  return (
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="Disputes"
        description="View and manage tenant disputes across all properties"
      />

      <div className="flex-1">
        <Card className="mx-auto max-w-6xl">
          <CardContent className="pt-6">
            {/* Filter bar */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 w-full sm:w-auto [&>div]:w-full sm:[&>div]:w-auto">
                <Label htmlFor="status-filter" className="sr-only">
                  Filter by status
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as DisputeStatus | 'all')
                  }
                >
                  <SelectTrigger
                    id="status-filter"
                    className="w-full sm:w-[180px]"
                    aria-label="Filter by status"
                  >
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2 py-1">
                  {disputes?.length ?? 0} total
                </span>
                <span className="rounded-full border px-2 py-1">
                  {needsResponseCountLabel}{' '}
                  {loadedNeedsResponse === 1 ? 'needs' : 'need'} response
                </span>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard
                    key={i}
                    showImage={false}
                    showHeader
                    bodyLines={3}
                  />
                ))}
              </div>
            ) : error || isOffline ? (
              <ErrorState
                title="Couldn't load disputes"
                offline={isOffline}
                action={{ onClick: () => refetch() }}
              />
            ) : !disputes || disputes.length === 0 ? (
              statusFilter !== 'all' ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No disputes match this filter"
                  description="Nothing here with that status right now. Switch back to All Statuses to see every dispute."
                  action={{
                    label: 'Show all disputes',
                    onClick: () => setStatusFilter('all'),
                    icon: MessageSquare,
                    variant: 'outline',
                  }}
                  data-testid="disputes-empty-filtered"
                />
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="No disputes yet"
                  description="When a tenant questions a charge on their CAM statement, it shows up here so you can respond. Nothing needs your attention right now."
                  data-testid="disputes-empty"
                />
              )
            ) : (
              <div className="space-y-3">
                {disputes.map((dispute) => (
                  <DisputeCard
                    key={dispute.id}
                    dispute={dispute}
                    onClick={() => navigate(`/disputes/${dispute.id}`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface DisputeCardProps {
  dispute: DisputeSummaryDTO
  onClick: () => void
}

function DisputeCard({ dispute, onClick }: DisputeCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${categoryLabel(dispute.category)} dispute`}
      className={cn(
        'flex items-center justify-between border rounded-lg p-4',
        'cursor-pointer hover:bg-muted/50 transition-colors duration-200',
        'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          {/* Not a heading: a role="button" strips descendant heading
              semantics from the a11y tree, so this is a styled <span>. The card
              gets its accessible name from the aria-label above. */}
          <span className="min-w-0 break-words text-sm font-semibold">
            {categoryLabel(dispute.category)}
          </span>
          <DisputeStatusBadge status={dispute.status} />
          {isNeedsResponseStatus(dispute.status) && (
            <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
              Needs response
            </span>
          )}
        </div>
        <p
          className="mb-2 line-clamp-2 break-words text-sm text-muted-foreground"
          title={dispute.description}
        >
          {dispute.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Created: {formatTimestampDate(dispute.created_at)}</span>
        </div>
      </div>
      <ChevronRight
        className="ml-4 h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
}
