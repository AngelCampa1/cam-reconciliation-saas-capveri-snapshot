/**
 * Pool structure preview component.
 *
 * Displays a visual tree representation of a pool template structure.
 */

import { Layers } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PoolStructureNode } from '@/types'

interface PoolPreviewProps {
  /**
   * Pool structure to preview.
   */
  structure: {
    pools: PoolStructureNode[]
  }
  /**
   * Optional CSS class name.
   */
  className?: string
}

/**
 * Renders a single pool node with optional children.
 */
function PoolNode({
  node,
  isChild = false,
}: {
  node: PoolStructureNode
  isChild?: boolean
}) {
  return (
    <div className={cn(isChild ? 'ml-6 mt-2' : 'mt-3 first:mt-0')}>
      <div className="flex items-center gap-2">
        <span
          className={cn(isChild ? 'text-sm' : 'font-medium', 'text-foreground')}
        >
          {node.name}
        </span>
        {node.gross_up_enabled ? (
          <Badge variant="secondary" className="text-xs">
            Gross-up
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            Fixed
          </Badge>
        )}
      </div>

      {/* Render children if any */}
      {node.children && node.children.length > 0 && (
        <div className="border-l-2 border-border ml-2 pl-2 mt-1">
          {node.children.map((child, idx) => (
            <PoolNode key={`${child.name}-${idx}`} node={child} isChild />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Visual preview of pool template structure.
 *
 * Shows pool hierarchy with gross-up indicators.
 */
export function PoolPreview({ structure, className = '' }: PoolPreviewProps) {
  const poolCount = structure.pools.length
  const totalPools = structure.pools.reduce((sum, pool) => {
    return sum + 1 + (pool.children?.length || 0)
  }, 0)

  return (
    <Card
      className={cn(
        'p-4 shadow-sm transition-all duration-fast hover:shadow-sm',
        className
      )}
    >
      <div className="mb-3">
        <h4 className="text-sm font-medium text-foreground">Pool Structure</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {poolCount} parent pool{poolCount !== 1 ? 's' : ''}, {totalPools}{' '}
          total pool
          {totalPools !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-1">
        {structure.pools.map((pool, idx) => (
          <PoolNode key={`${pool.name}-${idx}`} node={pool} />
        ))}
      </div>

      {structure.pools.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No pools yet"
          description="No pools defined."
          size="sm"
        />
      )}
    </Card>
  )
}
