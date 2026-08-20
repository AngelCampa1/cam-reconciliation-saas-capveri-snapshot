/**
 * Tenant Dashboard
 *
 * Read-only dashboard showing tenant's lease information and reconciliation statements.
 * Mobile-responsive with clear status indicators and download capabilities.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTenantDashboardApiV1TenantDashboardGet } from '@/api/generated/sdk.gen'
import { apiClient } from '@/api/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Bell, FileText } from 'lucide-react'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { getCountBucket, trackEvent } from '@/lib/analytics'
import { formatMoney } from '@/lib/money'
import { formatCalendarDate } from '@/lib/utils'

interface PropertySummary {
  id: string
  name: string
  address: string
}

interface UnitSummary {
  id: string
  unit_number: string
  rentable_sqft: string
}

interface LeaseDetail {
  id: string
  property: PropertySummary
  unit?: UnitSummary | null
  start_date: string
  end_date: string
  pro_rata_share: string
  base_year?: number
}

interface StatementSummary {
  id: string
  property_name: string
  period_start: string
  period_end: string
  tenant_share: string
  status: 'pending' | 'paid' | 'disputed' | 'overdue'
  pdf_url?: string
  created_at: string
}

interface TenantDashboardData {
  leases: LeaseDetail[]
  statements: StatementSummary[]
  unread_notifications: number
}

function isTenantDashboardData(value: unknown): value is TenantDashboardData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<TenantDashboardData>
  return (
    Array.isArray(candidate.leases) &&
    Array.isArray(candidate.statements) &&
    typeof candidate.unread_notifications === 'number'
  )
}

function DashboardUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-6 flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-destructive-strong">
        Dashboard data is unavailable right now.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function TenantDashboard() {
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useQuery<TenantDashboardData>({
    queryKey: ['tenant-dashboard'],
    queryFn: async () => {
      const response = await getTenantDashboardApiV1TenantDashboardGet({
        client: apiClient,
      })
      if (response.error || !response.data) {
        throw new Error('Failed to fetch dashboard data')
      }

      if (!isTenantDashboardData(response.data)) {
        throw new Error('Received malformed dashboard data')
      }

      return response.data
    },
  })

  useEffect(() => {
    if (!data) return

    const pendingStatementCount = data.statements.filter(
      (statement) => statement.status === 'pending'
    ).length
    const paidStatementCount = data.statements.filter(
      (statement) => statement.status === 'paid'
    ).length
    const disputedStatementCount = data.statements.filter(
      (statement) => statement.status === 'disputed'
    ).length
    const overdueStatementCount = data.statements.filter(
      (statement) => statement.status === 'overdue'
    ).length

    trackEvent('tenant_dashboard_viewed', {
      lease_count: data.leases.length,
      lease_count_bucket: getCountBucket(data.leases.length),
      statement_count: data.statements.length,
      statement_count_bucket: getCountBucket(data.statements.length),
      unread_notification_count: data.unread_notifications,
      unread_notification_count_bucket: getCountBucket(
        data.unread_notifications
      ),
      pending_statement_count: pendingStatementCount,
      paid_statement_count: paidStatementCount,
      disputed_statement_count: disputedStatementCount,
      overdue_statement_count: overdueStatementCount,
    })
  }, [data])

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-11 w-11 rounded-button" />
        </div>
        <section>
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonCard showImage={false} showHeader bodyLines={3} />
            <SkeletonCard showImage={false} showHeader bodyLines={3} />
          </div>
        </section>
        <section>
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-2">
            <SkeletonCard showImage={false} showHeader={false} bodyLines={2} />
            <SkeletonCard showImage={false} showHeader={false} bodyLines={2} />
            <SkeletonCard showImage={false} showHeader={false} bodyLines={2} />
          </div>
        </section>
      </div>
    )
  }

  if (error) {
    return <DashboardUnavailable onRetry={() => refetch()} />
  }

  if (!data) {
    return <DashboardUnavailable onRetry={() => refetch()} />
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with notification badge */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tenant Dashboard</h1>
        <Button
          variant="outline"
          className="relative min-h-[44px]"
          aria-label={`View notifications${data.unread_notifications ? ` (${data.unread_notifications} unread)` : ''}`}
          onClick={() => navigate('/tenant/notifications')}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {data.unread_notifications > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center"
            >
              {data.unread_notifications}
            </span>
          )}
        </Button>
      </div>

      {/* Property/Lease Summary */}
      <section aria-labelledby="tenant-leases-heading">
        <h2 id="tenant-leases-heading" className="text-lg font-semibold mb-4">
          Your Leases
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.leases.map((lease) => (
            <LeaseCard key={lease.id} lease={lease} />
          ))}
        </div>
        {data.leases.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No leases linked yet"
            description="Your lease is not linked to your account yet. Ask your property manager to connect it."
            size="sm"
          />
        )}
      </section>

      {/* Reconciliation Statements */}
      <section aria-labelledby="tenant-statements-heading">
        <h2
          id="tenant-statements-heading"
          className="text-lg font-semibold mb-4"
        >
          CAM Reconciliation Statements
        </h2>
        {/* role="list" is explicit because list-none makes Safari/VoiceOver
            drop the implicit list role, losing the "list, N items" announcement. */}
        <ul role="list" className="space-y-2 list-none">
          {data.statements.map((statement) => (
            <StatementRow
              key={statement.id}
              statement={statement}
              navigate={navigate}
            />
          ))}
          {data.statements.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No statements yet"
              description="Your property manager sends CAM statements here when they are ready. There is nothing for you to do now."
              size="sm"
            />
          )}
        </ul>

        {/* Fine-print verification disclaimer */}
        <p className="mt-3 text-xs text-muted-foreground">
          We worked out this amount. Check it against your lease. If something
          looks off, ask your property manager.
        </p>
      </section>
    </div>
  )
}

function LeaseCard({ lease }: { lease: LeaseDetail }) {
  const proRataPercent = (parseFloat(lease.pro_rata_share) * 100).toFixed(2)

  return (
    <Card className="shadow-sm transition-all duration-fast hover:shadow-md">
      <CardHeader variant="muted">
        <CardTitle className="text-base">{lease.property.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {lease.property.address}
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Unit</dt>
          <dd>{lease.unit ? lease.unit.unit_number : 'Building-wide'}</dd>
          <dt className="text-muted-foreground">Lease Period</dt>
          <dd>
            {formatCalendarDate(lease.start_date)} –{' '}
            {formatCalendarDate(lease.end_date)}
          </dd>
          <dt className="text-muted-foreground">Pro-Rata Share</dt>
          <dd>{proRataPercent}%</dd>
          {lease.base_year && (
            <>
              <dt className="text-muted-foreground">Base Year</dt>
              <dd>{lease.base_year}</dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

function StatementRow({
  statement,
  navigate,
}: {
  statement: StatementSummary
  navigate: ReturnType<typeof useNavigate>
}) {
  const getStatementStatusVariant = (
    status: string
  ): 'warning' | 'success' | 'destructive' | 'default' => {
    switch (status) {
      case 'pending':
        return 'warning'
      case 'paid':
        return 'success'
      case 'disputed':
        return 'destructive'
      case 'overdue':
        return 'destructive'
      default:
        return 'default'
    }
  }

  // Humanize the raw backend status enum for the badge label so tenants read
  // "Pending"/"Paid", not a lowercase "pending"/"paid".
  const getStatementStatusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Pending'
      case 'paid':
        return 'Paid'
      case 'disputed':
        return 'Disputed'
      case 'overdue':
        return 'Overdue'
      default:
        return status
    }
  }

  // Format the exact backend decimal string directly (formatMoney does an exact
  // ECMA-402 decimal parse — no parseFloat precision loss, forced en-US).
  const tenantShareAmount = formatMoney(statement.tenant_share)

  // A tenant can hold several statements for the same property — even for the
  // same period (one per leased unit) — so property name alone produces
  // duplicate button names. Combine the period and the share amount so each
  // action announces uniquely and usefully to screen readers.
  const statementLabel = `${statement.property_name}, ${formatCalendarDate(statement.period_start)} to ${formatCalendarDate(statement.period_end)}, ${tenantShareAmount}`

  return (
    <li
      data-testid="statement-row"
      className="flex flex-col gap-4 rounded-lg border p-4 shadow-sm transition-all duration-fast hover:bg-muted/30 hover:shadow-sm lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 lg:flex-1">
        <p className="break-words font-medium">{statement.property_name}</p>
        <p className="text-sm text-muted-foreground">
          {formatCalendarDate(statement.period_start)} –{' '}
          {formatCalendarDate(statement.period_end)}
        </p>
      </div>
      <div className="flex flex-col items-start gap-3 lg:shrink-0 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end lg:gap-4">
        <span className="font-mono font-semibold tabular-nums">
          {tenantShareAmount}
        </span>
        <Badge variant={getStatementStatusVariant(statement.status)}>
          {getStatementStatusLabel(statement.status)}
        </Badge>
        {statement.status === 'disputed' ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={`View dispute for ${statementLabel}`}
            onClick={() => navigate('/tenant/disputes')}
          >
            View dispute
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Dispute statement for ${statementLabel}`}
            onClick={() =>
              navigate(`/tenant/disputes/new?statement_id=${statement.id}`)
            }
          >
            Dispute
          </Button>
        )}
        {statement.pdf_url && (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Download statement for ${statementLabel}`}
            asChild
          >
            <a
              href={statement.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="justify-center"
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Download
            </a>
          </Button>
        )}
      </div>
    </li>
  )
}
