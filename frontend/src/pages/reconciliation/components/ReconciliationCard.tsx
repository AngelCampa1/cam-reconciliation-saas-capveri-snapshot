/**
 * ReconciliationCard Component
 *
 * Mobile-optimized card view for reconciliation rows.
 * Features:
 * - Expandable details
 * - Swipe gestures for actions
 * - Touch-optimized layout
 * - Financial amount formatting
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, DollarSign, Users, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type {
  ReconciliationRow,
  ExpensePoolRow,
  TenantSummaryRow,
} from '@/features/reconciliation/types/reconciliation-row'
import {
  isExpensePoolRow,
  isTenantSummaryRow,
} from '@/features/reconciliation/types/reconciliation-row'

export interface ReconciliationCardProps {
  /** Reconciliation row data */
  row: ReconciliationRow
  /** Callback when card is swiped */
  onSwipe?: (direction: 'left' | 'right') => void
  /** Test ID */
  testId?: string
}

/**
 * Format financial amount for display.
 *
 * Delegates to the shared {@link formatMoney} helper so backend Decimal
 * STRINGS are formatted via an exact ECMA-402 decimal parse instead of being
 * coerced through `parseFloat` (which drops precision). Non-numeric input maps
 * to a zero display, matching the rest of the reconciliation surface.
 */
function formatAmount(amount: string | undefined): string {
  if (!amount) return '$0.00'
  const formatted = formatMoney(amount)
  return formatted.startsWith('$') || formatted.startsWith('-$')
    ? formatted
    : '$0.00'
}

/**
 * Expense Pool Card - shows pool details with expandable tenant shares
 */
function ExpensePoolCard({
  row,
  isExpanded,
  onToggle,
}: {
  row: ExpensePoolRow
  isExpanded: boolean
  onToggle: () => void
}) {
  const tenantSharesEntries = row.tenant_shares
    ? Object.entries(row.tenant_shares)
    : []

  return (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{row.pool_name}</CardTitle>
            {row.pool_type && (
              <CardDescription className="text-xs mt-1">
                {row.pool_type}
              </CardDescription>
            )}
          </div>
          <button
            onClick={onToggle}
            className={cn(
              'ml-2 flex h-8 w-8 items-center justify-center rounded-full cursor-pointer hover:bg-accent transition-all duration-fast',
              isExpanded && 'rotate-180'
            )}
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            aria-expanded={isExpanded}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Total Expenses */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            Total Expenses
          </span>
          <span className="font-medium">
            {formatAmount(row.total_expenses)}
          </span>
        </div>

        {/* Grossed Up Expenses */}
        {row.grossed_up_expenses && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Grossed Up
            </span>
            <span className="font-medium">
              {formatAmount(row.grossed_up_expenses)}
            </span>
          </div>
        )}

        {/* Expanded: Tenant Shares */}
        {isExpanded && tenantSharesEntries.length > 0 && (
          <div className="border-t pt-3 mt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
              <Users className="h-3 w-3" />
              Tenant Allocations ({tenantSharesEntries.length})
            </div>
            {tenantSharesEntries.map(([tenantId, amount]) => (
              <div
                key={tenantId}
                className="flex items-center justify-between text-sm pl-4"
              >
                <span
                  className="min-w-0 truncate text-muted-foreground"
                  title={tenantId}
                >
                  {tenantId}
                </span>
                <span className="shrink-0 font-mono">
                  {formatAmount(amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </>
  )
}

/**
 * Tenant Summary Card - shows tenant totals
 */
function TenantSummaryCard({ row }: { row: TenantSummaryRow }) {
  return (
    <>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          {row.tenant_name}
        </CardTitle>
        <CardDescription className="text-xs">Tenant Summary</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Tenant Share (pre-fee) */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tenant Share</span>
          <span className="text-lg font-semibold">
            {formatAmount(row.tenant_share ?? row.total_recovery)}
          </span>
        </div>

        {/* Admin Fee */}
        {row.admin_fee && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Admin Fee</span>
            <span className="font-medium">{formatAmount(row.admin_fee)}</span>
          </div>
        )}

        {/* Final Amount */}
        {row.final_amount && (
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm font-medium">Final Amount</span>
            <span className="text-lg font-bold text-success-strong">
              {formatAmount(row.final_amount)}
            </span>
          </div>
        )}
      </CardContent>
    </>
  )
}

/**
 * Main ReconciliationCard component with swipe gesture support
 */
export function ReconciliationCard({
  row,
  onSwipe,
  testId,
}: ReconciliationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const isSwiping = useRef(false)

  // Reset swipe offset when touch ends
  useEffect(() => {
    const handleTouchEnd = () => {
      if (Math.abs(swipeOffset) > 100 && onSwipe) {
        onSwipe(swipeOffset > 0 ? 'right' : 'left')
      }
      setSwipeOffset(0)
      isSwiping.current = false
    }

    document.addEventListener('touchend', handleTouchEnd)
    return () => document.removeEventListener('touchend', handleTouchEnd)
  }, [swipeOffset, onSwipe])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? 0
    touchStartY.current = e.touches[0]?.clientY ?? 0
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = (e.touches[0]?.clientX ?? 0) - touchStartX.current
    const deltaY = (e.touches[0]?.clientY ?? 0) - touchStartY.current

    // Determine if this is a horizontal swipe
    if (!isSwiping.current && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwiping.current = true
    }

    if (isSwiping.current) {
      // Prevent vertical scroll during horizontal swipe
      e.preventDefault()
      setSwipeOffset(deltaX)
    }
  }

  return (
    <div
      ref={cardRef}
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      data-testid={testId}
    >
      <Card
        className={cn(
          'transition-transform touch-none',
          swipeOffset !== 0 && 'shadow-lg'
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`,
        }}
      >
        {isExpensePoolRow(row) ? (
          <ExpensePoolCard
            row={row}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
          />
        ) : isTenantSummaryRow(row) ? (
          <TenantSummaryCard row={row} />
        ) : null}
      </Card>

      {/* Swipe action indicators (for future implementation) */}
      {swipeOffset > 50 && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-success opacity-70">
          <DollarSign className="h-6 w-6" />
        </div>
      )}
      {swipeOffset < -50 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary opacity-70">
          <TrendingUp className="h-6 w-6" />
        </div>
      )}
    </div>
  )
}
