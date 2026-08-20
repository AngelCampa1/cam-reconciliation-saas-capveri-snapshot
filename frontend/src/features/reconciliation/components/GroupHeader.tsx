/**
 * Group header component for collapsible expense pool sections.
 *
 * Displays pool name, subtotal, and expand/collapse toggle.
 */

import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { pluralizeWithCount } from '@/lib/pluralize'

export interface GroupHeaderProps {
  poolName: string
  subtotal: string
  rowCount?: number
  isExpanded: boolean
  onToggle: () => void
}

/**
 * Collapsible group header for expense pools.
 *
 * Features:
 * - Pool name display
 * - Subtotal with currency formatting
 * - Optional row count
 * - Expand/collapse toggle button
 * - Visual hierarchy styling
 */
export function GroupHeader({
  poolName,
  subtotal,
  rowCount,
  isExpanded,
  onToggle,
}: GroupHeaderProps) {
  return (
    <div
      data-testid="group-header"
      className="flex items-center gap-2 px-4 py-2 font-semibold bg-muted/50 border-b sticky top-0 z-sticky shadow-sm"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="relative h-6 w-6 p-0 before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
      <span className="text-sm">{poolName}</span>
      {rowCount !== undefined && (
        <span className="text-xs text-muted-foreground font-normal">
          ({pluralizeWithCount(rowCount, 'item')})
        </span>
      )}
      <span className="ml-auto text-sm font-mono tabular-nums">
        {/* subtotal is the backend's exact decimal string; formatMoney parses
            it directly (no parseFloat round-trip) so a large pool subtotal keeps
            every digit instead of drifting at float precision (F-430). */}
        {formatMoney(subtotal)}
      </span>
    </div>
  )
}
