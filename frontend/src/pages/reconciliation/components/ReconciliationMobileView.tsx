/**
 * ReconciliationMobileView Component
 *
 * Mobile-optimized list view for reconciliation data.
 * Features:
 * - Card-based layout
 * - Pull-to-refresh
 * - Filter chips
 * - Smooth scrolling
 * - Search functionality
 * - Virtual scrolling for performance
 */
import { useState, useRef, useEffect } from 'react'
import { Search, RefreshCw, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EmptyStateNoSearchResults } from '@/components/EmptyState'
import { ReconciliationCard } from './ReconciliationCard'
import type { ReconciliationRow } from '@/features/reconciliation/types/reconciliation-row'

export interface ReconciliationMobileViewProps {
  /** Reconciliation data rows */
  data: ReconciliationRow[]
  /** Callback when refresh is triggered */
  onRefresh?: () => void | Promise<void>
  /** Whether data is currently loading */
  isLoading?: boolean
  /** Test ID */
  testId?: string
}

/**
 * Filter type for reconciliation rows
 */
type FilterType = 'all' | 'pools' | 'tenants'

/**
 * Filter chip component
 */
function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-fast whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
      aria-pressed={active}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn('ml-1 text-xs', active ? 'opacity-90' : 'opacity-60')}
        >
          ({count})
        </span>
      )}
    </button>
  )
}

/**
 * Pull-to-refresh indicator
 */
function PullToRefreshIndicator({ progress }: { progress: number }) {
  return (
    <div className="flex items-center justify-center py-4">
      <RefreshCw
        className={cn(
          'h-5 w-5 text-muted-foreground transition-transform',
          progress > 0.8 && 'animate-spin'
        )}
        style={{
          transform: `rotate(${progress * 360}deg)`,
        }}
      />
    </div>
  )
}

export function ReconciliationMobileView({
  data,
  onRefresh,
  isLoading = false,
  testId,
}: ReconciliationMobileViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number>(0)
  const isAtTop = useRef(true)

  // Track scroll position to detect top
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      isAtTop.current = container.scrollTop === 0
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Pull-to-refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAtTop.current) {
      touchStartY.current = e.touches[0]?.clientY ?? 0
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isAtTop.current || isLoading) return

    const deltaY = (e.touches[0]?.clientY ?? 0) - touchStartY.current

    if (deltaY > 0) {
      // Pulling down
      const progress = Math.min(deltaY / 80, 1)
      setPullProgress(progress)
      setIsPulling(progress > 0.3)
    }
  }

  const handleTouchEnd = async () => {
    if (isPulling && onRefresh) {
      await onRefresh()
    }
    setIsPulling(false)
    setPullProgress(0)
  }

  // Filter and search logic
  const filteredData = data.filter((row) => {
    // Apply filter type
    if (activeFilter === 'pools' && row.type !== 'expense_pool') return false
    if (activeFilter === 'tenants' && row.type !== 'tenant_summary')
      return false

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (row.type === 'expense_pool') {
        return row.pool_name.toLowerCase().includes(query)
      } else if (row.type === 'tenant_summary') {
        return row.tenant_name.toLowerCase().includes(query)
      }
    }

    return true
  })

  // Count by type
  const poolCount = data.filter((r) => r.type === 'expense_pool').length
  const tenantCount = data.filter((r) => r.type === 'tenant_summary').length

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-testid={testId}
    >
      {/* Pull-to-refresh indicator */}
      {pullProgress > 0 && <PullToRefreshIndicator progress={pullProgress} />}

      {/* Sticky search and filters */}
      <div className="sticky top-0 z-sticky bg-background border-b pb-3 pt-2 px-4 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search pools or tenants"
            placeholder="Search pools or tenants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 min-h-[44px]"
            data-testid="mobile-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Filter Chips (F-290): labeled toggle-button group. These chips
            single-select a filter over the grid below (they don't swap tab
            panels), so a group of aria-pressed toggles is the honest pattern;
            a tablist would promise roving-tabindex/arrow-key nav we don't ship. */}
        <div
          role="group"
          aria-label="Filter view"
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        >
          <FilterChip
            label="All"
            active={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
            count={data.length}
          />
          <FilterChip
            label="Pools"
            active={activeFilter === 'pools'}
            onClick={() => setActiveFilter('pools')}
            count={poolCount}
          />
          <FilterChip
            label="Tenants"
            active={activeFilter === 'tenants'}
            onClick={() => setActiveFilter('tenants')}
            count={tenantCount}
          />
        </div>
      </div>

      {/* Card List */}
      <div className="flex-1 p-4 space-y-3 pb-20">
        {/* Each card title is an <h3>; this section heading gives them a valid
            h2 parent so the page never skips from the <h1> straight to an <h3>.
            It is visually redundant with the search/filter chips above, so it
            is sr-only. Finalized reconciliations drop the GL analysis panel
            (the page's other h2), which is what exposed the skip (F2). */}
        <h2 className="sr-only">Pool and tenant variance</h2>
        {filteredData.length === 0 ? (
          <EmptyStateNoSearchResults
            query={searchQuery || undefined}
            onClear={searchQuery ? () => setSearchQuery('') : undefined}
            size="sm"
          />
        ) : (
          filteredData.map((row) => (
            <ReconciliationCard
              key={row.id}
              row={row}
              testId={`reconciliation-card-${row.id}`}
            />
          ))
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center"
          role="status"
          aria-label="Loading"
        >
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  )
}
