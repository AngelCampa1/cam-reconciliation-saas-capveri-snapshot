/**
 * Tenant summary panel component for reconciliation review.
 *
 * Displays per-tenant totals, pro-rata shares, and billable amounts
 * with filtering capabilities.
 */

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'

export interface TenantSummaryData {
  id: string
  name: string
  proRataShare: number
  totalBillable: number
  priorYearTotal?: number
}

export interface TenantRowProps {
  tenant: TenantSummaryData
  isSelected: boolean
  onClick: () => void
}

export interface TenantSummaryProps {
  tenants: TenantSummaryData[]
  onTenantSelect: (tenantId: string | null) => void
  selectedTenantId: string | null
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

/**
 * Format percentage value.
 */
function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Individual tenant row in summary panel.
 *
 * Features:
 * - Displays tenant name, pro-rata share, billable amount
 * - Shows variance from prior year if available
 * - Clickable for filtering
 * - Visual selected state
 *
 * F-289: each row is a single interactive control, so it is exposed as a
 * list item (not a table cell). The visible content is unlabeled columns,
 * so the button carries an explicit aria-label describing the row, and
 * aria-pressed conveys the active-filter state that was previously visual
 * only. The wrapper div carries role="listitem"; it has no layout styles.
 */
export function TenantRow({ tenant, isSelected, onClick }: TenantRowProps) {
  const variance = tenant.priorYearTotal
    ? tenant.totalBillable - tenant.priorYearTotal
    : null

  // FIX NEW-FE-1: Use explicit > 0 check to prevent division by zero or near-zero
  // A truthy check would allow very small positive values causing extreme percentages
  const variancePercent =
    variance !== null && tenant.priorYearTotal && tenant.priorYearTotal > 0
      ? variance / tenant.priorYearTotal
      : null

  const ariaLabel =
    `${tenant.name}: ${formatPercent(tenant.proRataShare)} pro-rata share, ` +
    `${formatMoney(tenant.totalBillable)} billable` +
    (variance !== null && variancePercent !== null
      ? `, ${formatMoney(variance)} variance vs prior year`
      : '')

  return (
    <div role="listitem">
      <button
        onClick={onClick}
        aria-pressed={isSelected}
        aria-label={ariaLabel}
        className={cn(
          'w-full text-left px-3 py-2 rounded-full transition-all duration-fast',
          'hover:bg-accent hover:shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isSelected && 'bg-accent border border-primary shadow-sm'
        )}
      >
        <div
          className="truncate text-sm font-medium"
          title={tenant.name}
          aria-hidden="true"
        >
          {tenant.name}
        </div>
        <div
          className="flex items-center justify-between mt-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <span>{formatPercent(tenant.proRataShare)}</span>
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {formatMoney(tenant.totalBillable)}
          </span>
        </div>
        {variance !== null && variancePercent !== null && (
          <div
            aria-hidden="true"
            className={cn(
              'text-xs mt-1 font-mono tabular-nums',
              variance !== 0 ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {variance > 0 ? '+' : ''}
            {formatMoney(variance)} ({variancePercent > 0 ? '+' : ''}
            {formatPercent(variancePercent)})
          </div>
        )}
      </button>
    </div>
  )
}

/**
 * Tenant summary panel with filtering and totals.
 *
 * Features:
 * - List of all tenants with their totals
 * - Click to filter grid by tenant
 * - Grand total calculation
 * - Variance from prior year
 * - Collapsible panel
 * - Clear filter button when tenant selected
 */
export function TenantSummary({
  tenants,
  onTenantSelect,
  selectedTenantId,
  isCollapsed = false,
  onToggleCollapse,
}: TenantSummaryProps) {
  const grandTotal = tenants.reduce((sum, t) => sum + t.totalBillable, 0)
  const priorYearGrandTotal = tenants.reduce(
    (sum, t) => sum + (t.priorYearTotal ?? 0),
    0
  )
  const hasVarianceData = tenants.some((t) => t.priorYearTotal !== undefined)

  const grandVariance = hasVarianceData
    ? grandTotal - priorYearGrandTotal
    : null
  const grandVariancePercent =
    grandVariance !== null && priorYearGrandTotal > 0
      ? grandVariance / priorYearGrandTotal
      : null

  if (isCollapsed) {
    return (
      <div className="border-l flex flex-col items-center p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="relative h-8 w-8 p-0 before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
          aria-label="Expand tenant summary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="mt-4 text-xs text-muted-foreground writing-mode-vertical transform rotate-180">
          Tenant Summary
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="tenant-summary"
      className="border-l p-4 w-80 flex flex-col bg-muted/10 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {/* F-288: h2. Direct structural section under the page h1; was h3
              which skipped h2 entirely, creating an illegal heading gap. */}
          <h2 className="font-semibold text-base">Tenant Filter</h2>
          {selectedTenantId && (
            <p className="text-xs text-muted-foreground">
              Grid filtered to selected tenant
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {selectedTenantId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTenantSelect(null)}
              className="relative h-6 w-6 p-0 before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
              aria-label="Clear filter"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="relative h-6 w-6 p-0 before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
              aria-label="Collapse tenant summary"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* F-289: the tenant rows are single clickable filter controls, so the
          honest semantic is a list of buttons (not a table of cells trapped
          inside buttons). role="list" + role="listitem" gives screen readers
          "list, N items" with each row's meaning carried by the button's
          aria-label. ARIA-only, no visual change. */}
      <div
        role="list"
        aria-label="Tenants"
        className="flex-1 overflow-y-auto space-y-1"
      >
        {tenants.map((tenant) => (
          <TenantRow
            key={tenant.id}
            tenant={tenant}
            isSelected={tenant.id === selectedTenantId}
            onClick={() => onTenantSelect(tenant.id)}
          />
        ))}
      </div>

      <div className="border-t mt-4 pt-4">
        <div className="flex items-center justify-between font-bold">
          <span>Grand Total</span>
          <span className="font-mono tabular-nums">
            {formatMoney(grandTotal)}
          </span>
        </div>
        {grandVariance !== null && grandVariancePercent !== null && (
          <div
            className={cn(
              'text-sm mt-2 font-mono tabular-nums',
              grandVariance !== 0 ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {grandVariance > 0 ? '+' : ''}
            {formatMoney(grandVariance)} ({grandVariancePercent > 0 ? '+' : ''}
            {formatPercent(grandVariancePercent)})
          </div>
        )}
        {/* Fine-print verification disclaimer */}
        <p className="mt-2 text-xs text-muted-foreground">
          These numbers come from your files and may have errors. Check your
          lease and GL before you act on them.
        </p>
      </div>
    </div>
  )
}
