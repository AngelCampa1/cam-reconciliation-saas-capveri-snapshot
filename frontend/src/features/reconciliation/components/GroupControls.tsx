/**
 * Group controls component for expand/collapse all functionality.
 *
 * Provides buttons to expand or collapse all groups at once.
 */

import { ChevronsDown, ChevronsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pluralizeWithCount } from '@/lib/pluralize'

export interface GroupControlsProps {
  onExpandAll: () => void
  onCollapseAll: () => void
  groupCount?: number
  allExpanded?: boolean
  allCollapsed?: boolean
}

/**
 * Controls for group expansion state.
 *
 * Features:
 * - Expand all groups button
 * - Collapse all groups button
 * - Disabled state when all groups already in target state
 * - Optional group count display
 */
export function GroupControls({
  onExpandAll,
  onCollapseAll,
  groupCount,
  allExpanded = false,
  allCollapsed = false,
}: GroupControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {groupCount !== undefined && (
        <span className="text-sm text-muted-foreground">
          {pluralizeWithCount(groupCount, 'group')}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onExpandAll}
        disabled={allExpanded}
        className="gap-2"
      >
        <ChevronsDown className="h-4 w-4" />
        Expand All
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onCollapseAll}
        disabled={allCollapsed}
        className="gap-2"
      >
        <ChevronsUp className="h-4 w-4" />
        Collapse All
      </Button>
    </div>
  )
}
