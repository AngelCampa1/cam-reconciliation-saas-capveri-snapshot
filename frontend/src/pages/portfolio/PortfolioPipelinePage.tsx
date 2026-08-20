/**
 * Portfolio Pipeline Page
 *
 * Shows all properties' reconciliation campaign status at a glance.
 * Controllers can advance campaigns through the workflow from here.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send,
  Eye,
  CheckCircle2,
  FileEdit,
  Building2,
  Users,
} from 'lucide-react'

import {
  useCampaigns,
  useSubmitForReview,
  useApproveCampaign,
  useRejectCampaign,
  useMarkSent,
  type CampaignSummary,
} from '@/api'
import { PageHeader, PageContainer } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SkeletonCard } from '@/components/ui/skeleton'
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { CampaignStatus } from '@/types/enums'
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_VARIANTS,
  CAMPAIGN_STATUS_ORDER,
} from '@/lib/campaign-status'
import { formatMoneyWhole } from '@/lib/money'
import { pluralize } from '@/lib/pluralize'
import { toast } from 'sonner'
import { useViewport } from '@/hooks/useViewport'

function StatusChips({ campaigns }: { campaigns: CampaignSummary[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const status of CAMPAIGN_STATUS_ORDER) {
      c[status] = 0
    }
    for (const campaign of campaigns) {
      c[campaign.status] = (c[campaign.status] || 0) + 1
    }
    return c
  }, [campaigns])

  return (
    <div className="flex flex-wrap gap-2" data-testid="status-chips">
      {CAMPAIGN_STATUS_ORDER.map((status) => (
        <Badge
          key={status}
          variant={CAMPAIGN_STATUS_VARIANTS[status]}
          className="text-sm"
        >
          {CAMPAIGN_STATUS_LABELS[status]}: {counts[status]}
        </Badge>
      ))}
    </div>
  )
}

function CampaignActions({
  campaign,
  selectedYear,
  onTransition,
  fullWidth = false,
}: {
  campaign: CampaignSummary
  selectedYear: number
  onTransition: (id: string, action: string) => void
  fullWidth?: boolean
}) {
  const navigate = useNavigate()
  const reconciliationPath = `/properties/${campaign.property_id}/reconciliations?year=${selectedYear}`
  const btnCls = fullWidth ? 'w-full min-h-[44px]' : undefined

  switch (campaign.status) {
    case CampaignStatus.DRAFT:
      return (
        <Button
          size="sm"
          variant="outline"
          className={btnCls}
          onClick={() => navigate(reconciliationPath)}
        >
          <FileEdit className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Finalize
        </Button>
      )
    case CampaignStatus.FINALIZED:
      return (
        <Button
          size="sm"
          className={btnCls}
          onClick={() => onTransition(campaign.id, 'submit-for-review')}
        >
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Submit for Review
        </Button>
      )
    case CampaignStatus.IN_REVIEW:
      return (
        <div
          className={fullWidth ? 'flex flex-col gap-2 w-full' : 'flex gap-1'}
        >
          <Button
            size="sm"
            className={btnCls}
            onClick={() => onTransition(campaign.id, 'approve')}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={btnCls}
            onClick={() => onTransition(campaign.id, 'reject')}
          >
            Reject
          </Button>
        </div>
      )
    case CampaignStatus.APPROVED:
      return (
        <Button
          size="sm"
          className={btnCls}
          onClick={() => onTransition(campaign.id, 'mark-sent')}
        >
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Mark Sent
        </Button>
      )
    case CampaignStatus.SENT:
      return (
        <Button
          size="sm"
          variant="ghost"
          className={btnCls}
          onClick={() => navigate(reconciliationPath)}
        >
          <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          View
        </Button>
      )
    default:
      return null
  }
}

export function PortfolioPipelinePage() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(String(currentYear))
  const yearNumber = parseInt(selectedYear, 10)
  const { isMobile } = useViewport()

  const {
    data: campaigns,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useCampaigns({
    year: yearNumber,
  })

  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves isError false and campaigns undefined, so without this the page would
  // render the "No campaigns for {year}" empty state and imply the user has none
  // when the backend is simply unreachable. The `!campaigns` guard keeps any
  // already-loaded list rendered rather than hiding it behind an offline screen.
  const isOffline = isPaused && !campaigns
  const submitForReview = useSubmitForReview()
  const approveCampaign = useApproveCampaign()
  const rejectCampaign = useRejectCampaign()
  const markSent = useMarkSent()

  const handleTransition = async (campaignId: string, action: string) => {
    const mutations: Record<string, typeof submitForReview> = {
      'submit-for-review': submitForReview,
      approve: approveCampaign,
      reject: rejectCampaign,
      'mark-sent': markSent,
    }
    const mutation = mutations[action]
    if (!mutation) return

    try {
      await mutation.mutateAsync(campaignId)
      toast.success('Campaign updated')
    } catch {
      toast.error('Failed to update campaign')
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <PageContainer>
      <PageHeader
        title="Portfolio Pipeline"
        description="Track reconciliation campaigns across all properties"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger
            aria-label="Filter by year"
            className="w-full sm:w-[140px]"
            data-testid="year-selector"
          >
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div data-testid="loading-skeleton">
          {isMobile ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} showHeader bodyLines={2} />
              ))}
            </div>
          ) : (
            <DataTableSkeleton columnCount={6} rowCount={6} />
          )}
        </div>
      ) : isError || isOffline ? (
        <ErrorState
          data-testid="error-state"
          title="Couldn't load campaigns"
          description="Something went wrong on our end."
          offline={isOffline}
          action={{ onClick: () => refetch() }}
        />
      ) : !campaigns || campaigns.length === 0 ? (
        <EmptyState
          data-testid="empty-state"
          titleAs="h2"
          icon={Building2}
          title={`No campaigns for ${yearNumber}`}
          description="Dispute campaigns appear here once you finalize a reconciliation. Run and finalize one to get started."
          action={{
            label: 'Go to Reconciliations',
            onClick: () => navigate('/reconciliations'),
          }}
        />
      ) : (
        <>
          <StatusChips campaigns={campaigns} />

          {isMobile ? (
            /* Mobile: stacked cards so action buttons never scroll off-screen */
            <div className="mt-6 space-y-3" data-testid="mobile-cards-view">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-lg border p-4"
                  data-testid="campaign-row"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Building2
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span
                        className="min-w-0 truncate font-medium"
                        title={campaign.property_name}
                      >
                        {campaign.property_name}
                      </span>
                    </div>
                    <Badge
                      className="shrink-0"
                      variant={CAMPAIGN_STATUS_VARIANTS[campaign.status]}
                    >
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {campaign.finalized_tenant_count}/
                        {campaign.tenant_count}{' '}
                        {pluralize(campaign.tenant_count, 'tenant')} finalized
                      </span>
                    </div>
                    <span className="font-mono font-medium tabular-nums">
                      {formatMoneyWhole(campaign.total_recovery)}
                    </span>
                  </div>
                  <div className="mt-4">
                    <CampaignActions
                      campaign={campaign}
                      selectedYear={yearNumber}
                      onTransition={handleTransition}
                      fullWidth
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="mt-6 overflow-x-auto rounded-md border"
              data-testid="desktop-table-view"
            >
              <Table>
                <TableCaption className="sr-only">
                  Reconciliation pipeline for {yearNumber}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Property</TableHead>
                    <TableHead className="min-w-[90px] text-center">
                      Tenants
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[140px] text-right">
                      Total Variance
                    </TableHead>
                    <TableHead className="min-w-[180px] text-right">
                      Next Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id} data-testid="campaign-row">
                      <TableCell className="max-w-[260px] font-medium">
                        <span
                          className="block truncate"
                          title={campaign.property_name}
                        >
                          {campaign.property_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {campaign.finalized_tenant_count}/
                        {campaign.tenant_count}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={CAMPAIGN_STATUS_VARIANTS[campaign.status]}
                        >
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoneyWhole(campaign.total_recovery)}
                      </TableCell>
                      <TableCell className="text-right">
                        <CampaignActions
                          campaign={campaign}
                          selectedYear={yearNumber}
                          onTransition={handleTransition}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
