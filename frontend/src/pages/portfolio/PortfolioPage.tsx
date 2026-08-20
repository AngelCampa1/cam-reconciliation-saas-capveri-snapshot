/**
 * Portfolio Summary Page
 *
 * Displays portfolio-level CAM statement metrics: allowed CAM,
 * bill differences, bill check rate, and per-property breakdown for the most
 * recent finalized reconciliation year.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DollarSign, TrendingUp, Building2, BarChart3 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader, PageContainer } from '@/components/layout'
import { getSession } from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { SkeletonCard } from '@/components/ui/skeleton'
import { resolveApiUrl } from '@/api/url'
import { formatMoney, formatMoneyWhole } from '@/lib/money'
import { useViewport } from '@/hooks/useViewport'

interface PropertyPortfolioEntry {
  property_id: string
  property_name: string
  total_recoverable: string
  total_billed: string
  leakage: string
  recovery_rate: number | null
}

interface PortfolioSummaryData {
  period_year: number | null
  total_recoverable_cam: string
  total_leakage: string
  recovery_rate: number | null
  properties_with_leakage: number
  has_billing_data: boolean
  total_recovery_all_years: string
  properties: PropertyPortfolioEntry[]
}

// Exact 2-decimal currency display. Backend money values arrive as Decimal
// strings; formatMoney parses them exactly (no float coercion). See lib/money.ts.
const formatUSD = (value: string | number) => formatMoney(value)

function usePortfolioSummary() {
  return useQuery<PortfolioSummaryData>({
    queryKey: ['portfolio', 'summary'],
    queryFn: async () => {
      const session = await getSession()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(resolveApiUrl('/api/v1/portfolio/summary'), {
        headers,
      })

      if (!response.ok) {
        throw new Error('Failed to load portfolio data')
      }

      return response.json()
    },
    staleTime: 30000,
  })
}

interface MetricCardProps {
  title: string
  value: string
  tone?: 'default' | 'priority'
  /**
   * Optional one-line explanation shown under the value. Use it to explain a
   * placeholder value (e.g. why a metric reads "N/A") so the number never
   * leaves the reader guessing what to do next.
   */
  hint?: string
}

function MetricCard({ title, value, tone = 'default', hint }: MetricCardProps) {
  return (
    <Card className={tone === 'priority' ? 'border-destructive/30' : ''}>
      <CardHeader className="pb-2">
        <CardTitle
          as="h2"
          className="text-sm font-medium text-muted-foreground"
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            tone === 'priority'
              ? 'break-words font-mono text-2xl font-bold tabular-nums text-destructive'
              : 'break-words font-mono text-2xl font-bold tabular-nums'
          }
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

interface PropertyLeakageTableProps {
  properties: PropertyPortfolioEntry[]
  hasBillingData: boolean
}

function PropertyLeakageTable({
  properties,
  hasBillingData,
}: PropertyLeakageTableProps) {
  const { isMobile } = useViewport()

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Property Breakdown
        </CardTitle>
      </CardHeader>
      {isMobile ? (
        <CardContent className="space-y-3">
          {properties.map((prop) => (
            <div
              key={prop.property_id}
              className="rounded-lg border p-4"
              data-testid="property-breakdown-card"
            >
              <p
                className="mb-2 truncate font-medium"
                title={prop.property_name}
              >
                {prop.property_name}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-xs text-muted-foreground">Allowed CAM</dt>
                <dd className="font-mono tabular-nums">
                  {formatUSD(prop.total_recoverable)}
                </dd>
                <dt className="text-xs text-muted-foreground">Billed</dt>
                <dd className="font-mono tabular-nums">
                  {formatUSD(prop.total_billed)}
                </dd>
                <dt className="text-xs text-muted-foreground">
                  Bill Difference
                </dt>
                <dd className="font-mono tabular-nums font-medium">
                  {formatUSD(prop.leakage)}
                </dd>
                {hasBillingData && (
                  <>
                    <dt className="text-xs text-muted-foreground">
                      Bill Check Rate
                    </dt>
                    <dd className="font-mono tabular-nums">
                      {prop.recovery_rate !== null
                        ? `${prop.recovery_rate.toFixed(1)}%`
                        : 'N/A'}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </CardContent>
      ) : (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <caption className="sr-only">
                Property CAM bill difference breakdown
              </caption>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th
                    scope="col"
                    className="w-[32%] px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    Property
                  </th>
                  <th
                    scope="col"
                    className="w-[17%] px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Allowed CAM
                  </th>
                  <th
                    scope="col"
                    className="w-[17%] px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Billed
                  </th>
                  <th
                    scope="col"
                    className="w-[17%] px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Bill Difference
                  </th>
                  {hasBillingData && (
                    <th
                      scope="col"
                      className="w-[17%] px-4 py-3 text-right font-medium text-muted-foreground"
                    >
                      Bill Check Rate
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {properties.map((prop) => (
                  <tr
                    key={prop.property_id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      <span
                        className="block truncate"
                        title={prop.property_name}
                      >
                        {prop.property_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatUSD(prop.total_recoverable)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatUSD(prop.total_billed)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium tabular-nums">
                      {formatUSD(prop.leakage)}
                    </td>
                    {hasBillingData && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {prop.recovery_rate !== null
                          ? `${prop.recovery_rate.toFixed(1)}%`
                          : 'N/A'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function PortfolioNOISection({ totalRecovery }: { totalRecovery: number }) {
  // Cap rate stored as integer tenths-of-percent to avoid float step issues
  const [capRateTenths, setCapRateTenths] = useState(70) // default 7.0%

  const capRate = parseFloat((capRateTenths / 1000).toFixed(4))
  const capRatePercent = capRateTenths / 10

  const noiLift = totalRecovery
  const assetValueLift = capRate > 0 ? totalRecovery / capRate : 0

  return (
    <Card data-testid="portfolio-noi-section">
      <CardHeader className="pb-2">
        <CardTitle as="h2" className="text-base">
          NOI Impact
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <DollarSign aria-hidden="true" className="h-3.5 w-3.5" />
              Final tenant total
            </div>
            <div className="font-mono text-lg font-semibold tabular-nums">
              {formatMoneyWhole(totalRecovery)}
            </div>
            <div className="text-xs text-muted-foreground">
              All years combined
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
              NOI Lift
            </div>
            <div className="font-mono text-lg font-semibold tabular-nums">
              {formatMoneyWhole(noiLift)}
            </div>
            <div className="text-xs text-muted-foreground">
              Additional annual NOI
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
              Asset Value Lift
            </div>
            <div className="font-mono text-lg font-semibold tabular-nums text-primary">
              {formatMoneyWhole(assetValueLift)}
            </div>
            <div className="text-xs text-muted-foreground">
              At {capRatePercent.toFixed(1)}% cap rate
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-sm">
            Cap rate assumption:{' '}
            <span className="font-semibold">{capRatePercent.toFixed(1)}%</span>
          </Label>
          <input
            id="cap-rate-slider"
            type="range"
            data-testid="portfolio-cap-rate-slider"
            min="20"
            max="120"
            step="1"
            value={capRateTenths}
            onChange={(e) => setCapRateTenths(Number(e.target.value))}
            className="w-full cursor-pointer accent-primary"
            aria-label="Cap rate assumption"
            aria-valuemin={2}
            aria-valuemax={12}
            aria-valuenow={capRatePercent}
            aria-valuetext={`${capRatePercent.toFixed(1)}%`}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>2.0%</span>
            <span>12.0%</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>
            Final tenant total adds to NOI. Dividing by the cap rate gives an
            estimated increase in building market value.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function PortfolioPage() {
  const navigate = useNavigate()
  const { data, isLoading, error, isPaused, refetch } = usePortfolioSummary()

  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and data undefined, so without this the page would render
  // the "No portfolio data yet" empty state and imply the user has no data when
  // the backend is simply unreachable. The `!data` guard keeps any stale summary
  // rendered rather than hiding it behind an offline screen.
  const isOffline = isPaused && !data

  const subtitle =
    data?.period_year != null
      ? `${data.period_year} reconciliation year`
      : 'Portfolio overview'

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Portfolio" description="Portfolio overview" />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard className="h-28" bodyLines={0} />
            <SkeletonCard className="h-28" bodyLines={0} />
            <SkeletonCard className="h-28" bodyLines={0} />
            <SkeletonCard className="h-28" bodyLines={0} />
          </div>
          <SkeletonCard bodyLines={5} />
        </div>
      </PageContainer>
    )
  }

  if (error || isOffline) {
    return (
      <PageContainer>
        <PageHeader title="Portfolio" description="Portfolio overview" />
        <ErrorState
          title="Couldn't load your portfolio"
          description="Something went wrong on our end."
          offline={isOffline}
          action={{ onClick: () => refetch() }}
        />
      </PageContainer>
    )
  }

  const isEmpty = !data || data.period_year === null

  return (
    <PageContainer>
      <PageHeader title="Portfolio" description={subtitle} />

      {isEmpty ? (
        <EmptyState
          className="mt-6"
          titleAs="h2"
          icon={BarChart3}
          title="No portfolio data yet"
          description="Finalize a reconciliation to see portfolio metrics."
          action={{
            label: 'Go to Reconciliations',
            onClick: () => navigate('/reconciliations'),
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div
            data-testid="portfolio-metric-cards"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <MetricCard
              title="Bill difference"
              value={formatUSD(data.total_leakage)}
            />
            <MetricCard
              title="Bill check rate"
              value={
                data.recovery_rate !== null
                  ? `${data.recovery_rate.toFixed(1)}%`
                  : 'N/A'
              }
              {...(data.recovery_rate === null
                ? { hint: 'Add what you billed tenants to see this' }
                : {})}
            />
            <MetricCard
              title="Properties to check"
              value={String(data.properties_with_leakage)}
            />
            <MetricCard
              title="Allowed CAM"
              value={formatUSD(data.total_recoverable_cam)}
            />
          </div>

          {/* NOI Impact Section */}
          {parseFloat(data.total_recovery_all_years) > 0 && (
            <PortfolioNOISection
              totalRecovery={parseFloat(data.total_recovery_all_years)}
            />
          )}

          {/* Property Breakdown Table */}
          {data.properties.length > 0 && (
            <PropertyLeakageTable
              properties={data.properties}
              hasBillingData={data.has_billing_data}
            />
          )}
        </div>
      )}

      {/* Fine-print verification disclaimer */}
      <p className="mt-3 text-xs text-muted-foreground">
        These numbers come from your files and may have errors. Check your lease
        and GL before you act on them.
      </p>
    </PageContainer>
  )
}
