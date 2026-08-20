/**
 * ReconciliationStatusCard Component
 *
 * Dashboard widget showing reconciliation status for properties needing attention.
 * Features:
 * - Shows up to 5 properties needing attention
 * - Status badges (Draft, Needs Reconciliation, Needs Review)
 * - Direct CTAs: Run reconciliation / Review
 * - View All link to /reconciliations
 */
import { Link, useNavigate } from 'react-router-dom'
import { Calculator, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { AllClearState } from './AllClearState'

export type ReconciliationStatus =
  | 'draft'
  | 'needs_calculation'
  | 'needs_review'

export interface ReconciliationStatusItem {
  /** Unique identifier */
  id: string
  /** Property ID for navigation */
  propertyId: string
  /** Property name */
  propertyName: string
  /** Current status */
  status: ReconciliationStatus
  /** Tenant name */
  tenantName: string
  /** Tenant billable amount (optional) */
  totalRecovery?: number
}

const statusConfig: Record<
  ReconciliationStatus,
  { label: string; variant: string; cta: string }
> = {
  draft: {
    label: 'Draft',
    variant: 'bg-warning/10 text-warning-foreground border-warning/20',
    cta: 'Review',
  },
  needs_calculation: {
    label: 'Needs Reconciliation',
    variant: 'bg-primary/10 text-primary border-primary/20',
    cta: 'Run reconciliation',
  },
  needs_review: {
    label: 'Needs Review',
    variant: 'bg-warning/10 text-warning-foreground border-warning/20',
    cta: 'Review',
  },
}

export interface ReconciliationStatusCardProps {
  /** List of reconciliation status items */
  items: ReconciliationStatusItem[]
  /** Additional CSS classes */
  className?: string
}

export function ReconciliationStatusCard({
  items,
  className,
}: ReconciliationStatusCardProps) {
  const navigate = useNavigate()
  const hasItems = items.length > 0
  const displayItems = items.slice(0, 5)

  const handleCTAClick = (propertyId: string) => {
    // Default to prior year since CAM reconciliation is almost always for the previous fiscal year
    const defaultYear = new Date().getFullYear() - 1
    navigate(`/properties/${propertyId}/reconciliations?year=${defaultYear}`)
  }

  return (
    <Card className={cn(className)} data-testid="reconciliation-status-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle as="h2" className="text-base font-medium">
              Reconciliation Status
            </CardTitle>
          </div>
          {hasItems && (
            <Badge variant="secondary" className="h-5 px-2 text-xs">
              {items.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <>
            <ul role="list" className="space-y-3 list-none p-0 m-0">
              {displayItems.map((item) => {
                const config = statusConfig[item.status]

                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="min-w-0 truncate font-medium"
                          title={item.propertyName}
                        >
                          {item.propertyName}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('shrink-0 text-xs', config.variant)}
                        >
                          {config.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="truncate" title={item.tenantName}>
                          {item.tenantName}
                        </span>
                        {item.totalRecovery !== undefined && (
                          <>
                            <span className="text-border-subtle">|</span>
                            <span className="font-mono tabular-nums font-medium text-foreground">
                              {formatMoney(item.totalRecovery)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] w-full shrink-0 sm:w-auto"
                      onClick={() => handleCTAClick(item.propertyId)}
                      aria-label={`${config.cta} ${item.propertyName}`}
                    >
                      {config.cta}
                    </Button>
                  </li>
                )
              })}
            </ul>

            {/* View All link — sits outside the <ul> so it isn't an invalid
                non-<li> list child */}
            <Button asChild variant="outline" className="mt-3 w-full gap-2">
              <Link to="/reconciliations">
                View All Reconciliations
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </>
        ) : (
          <AllClearState message="No pending reconciliations" />
        )}
      </CardContent>
    </Card>
  )
}
