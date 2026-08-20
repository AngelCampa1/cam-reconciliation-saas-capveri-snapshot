/**
 * Tenant Disputes Page
 *
 * Shows list of tenant's disputes with status and details.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Home, MessageSquare } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { apiClient } from '@/api/client'
import { SkeletonCard } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DisputeStatusBadge,
  isNeedsResponseStatus,
} from '@/features/disputes/components/DisputeStatusBadge'
import { categoryLabel } from '@/features/disputes/constants'
import { listDisputesApiV1TenantDisputesGet } from '@/api/generated/sdk.gen'
import type { DisputeSummaryDTO } from '@/api/generated/types.gen'
import { getCountBucket, trackEvent } from '@/lib/analytics'
import { formatCalendarDate } from '@/lib/utils'

function getStatusCount(disputes: DisputeSummaryDTO[], status: string) {
  return disputes.filter((dispute) => dispute.status.toLowerCase() === status)
    .length
}

export function TenantDisputesPage() {
  const navigate = useNavigate()

  const {
    data: disputes,
    isLoading,
    isPaused,
    error,
    refetch,
  } = useQuery<DisputeSummaryDTO[]>({
    queryKey: ['tenant-disputes'],
    queryFn: async () => {
      const response = await listDisputesApiV1TenantDisputesGet({
        client: apiClient,
      })
      if (response.error) {
        throw new Error('Failed to fetch disputes')
      }
      return response.data ?? []
    },
  })

  const needsResponseCount =
    disputes?.filter((dispute) => isNeedsResponseStatus(dispute.status))
      .length ?? 0

  useEffect(() => {
    if (!disputes) return

    trackEvent('tenant_disputes_viewed', {
      status_filter: 'all',
      total_count: disputes.length,
      total_count_bucket: getCountBucket(disputes.length),
      needs_response_count: needsResponseCount,
      needs_response_count_bucket: getCountBucket(needsResponseCount),
      open_count: getStatusCount(disputes, 'open'),
      under_review_count: getStatusCount(disputes, 'under_review'),
      resolved_count: getStatusCount(disputes, 'resolved'),
      rejected_count: getStatusCount(disputes, 'rejected'),
      closed_count: getStatusCount(disputes, 'closed'),
    })
  }, [disputes, needsResponseCount])

  return (
    // TenantLayout already provides the <main> landmark; this page renders a
    // plain <div> so the document has a single main region.
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="Dispute History"
        description="View and manage your CAM reconciliation disputes"
        showBackButton={true}
        backButtonTo="/tenant/dashboard"
        actions={
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => navigate('/tenant/dashboard')}>
                  <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                  Go to Dashboard
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Go to dashboard and choose a statement to dispute</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
      />
      <div className="flex-1">
        <Card className="mx-auto max-w-6xl">
          <CardContent className="pt-6">
            <div className="mb-6 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                Start a dispute from a statement. That way the property team can
                see the exact charges.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border px-2 py-1">
                  {disputes?.length ?? 0} total
                </span>
                <span className="rounded-full border px-2 py-1">
                  {needsResponseCount} need response
                </span>
              </div>
            </div>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard
                    key={i}
                    showImage={false}
                    showHeader
                    bodyLines={3}
                  />
                ))}
              </div>
            ) : error || (isPaused && !disputes) ? (
              <ErrorState
                size="sm"
                title="Couldn't load disputes"
                offline={isPaused && !disputes}
                action={{ onClick: () => refetch() }}
              />
            ) : !disputes || disputes.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                size="sm"
                title="No disputes yet"
                description="To start one, open a statement from your dashboard."
                action={{
                  label: 'Go to dashboard',
                  onClick: () => navigate('/tenant/dashboard'),
                  variant: 'outline',
                }}
              />
            ) : (
              <div className="space-y-4">
                {disputes.map((dispute) => (
                  <div
                    key={dispute.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View dispute: ${categoryLabel(dispute.category)}`}
                    className="flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
                    onClick={() => navigate(`/tenant/disputes/${dispute.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/tenant/disputes/${dispute.id}`)
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {/* A heading nested inside role="button" is flattened
                            into the button's name and lost from the heading
                            tree, so render the title as a styled span. The card
                            carries its own concise aria-label. */}
                        <span className="min-w-0 break-words font-semibold">
                          {categoryLabel(dispute.category)}
                        </span>
                        <DisputeStatusBadge status={dispute.status} />
                        {isNeedsResponseStatus(dispute.status) && (
                          <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning-foreground">
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
                      <p className="text-xs text-muted-foreground">
                        Created: {formatCalendarDate(dispute.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
