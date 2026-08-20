/**
 * MissingMappingsWarning - Warns users when expense pools lack GL mappings
 *
 * Displays a warning alert when one or more expense pools have no GL account
 * mappings configured, which would result in $0.00 reconciliation amounts.
 *
 * On a finalized reconciliation the banner switches to a past-tense,
 * informational message and drops the setup actions: the run is locked, so
 * configuring mappings can no longer change the result. The reviewer just
 * needs to know which pool costs were left out of the finalized numbers.
 */
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface PoolInfo {
  id: string
  name: string
}

export interface MissingMappingsWarningProps {
  /** List of expense pools for the property */
  pools: PoolInfo[]
  /** Mapping counts by pool ID */
  mappingCounts: Record<string, number>
  /** Callback when user clicks to navigate to Pools tab */
  onNavigateToPools?: () => void
  /** Callback to open the workflow help tour */
  onShowHelp?: () => void
  /**
   * Whether the reconciliation is finalized (locked). When true the banner
   * reads as a past-tense note and hides the setup actions.
   */
  isFinalized?: boolean
  /** Optional: Custom className for styling */
  className?: string
}

/**
 * Warning banner displayed when expense pools have no GL mappings.
 *
 * Shows:
 * - Alert when any pool has 0 mappings
 * - List of pool names without mappings
 * - Button to navigate to Pools tab to configure (draft only)
 */
export function MissingMappingsWarning({
  pools,
  mappingCounts,
  onNavigateToPools,
  onShowHelp,
  isFinalized = false,
  className,
}: MissingMappingsWarningProps) {
  // Find pools with 0 mappings
  const unmappedPools = pools.filter((pool) => {
    const count = mappingCounts[pool.id] ?? 0
    return count === 0
  })

  // Don't render if no pools or all have mappings
  if (pools.length === 0 || unmappedPools.length === 0) {
    return null
  }

  const poolCount = unmappedPools.length
  const poolWord = poolCount === 1 ? 'pool' : 'pools'
  // Setup actions only make sense before the run is locked.
  const showActions = !isFinalized && (onShowHelp || onNavigateToPools)

  return (
    <Alert variant="warning" className={className}>
      <AlertCircle className="h-4 w-4" />
      {/* F-288: Use a non-heading element. This is a contextual notice label,
          not document structure. An h5 here created an illegal heading-level
          jump (h1 → h5) in the reconciliation workspace. */}
      <div className="mb-1 font-medium leading-none tracking-tight">
        {isFinalized
          ? 'Some expense pools had no GL mappings'
          : 'Missing GL Account Mappings'}
      </div>
      <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="mb-1">
            {isFinalized ? (
              <>
                {poolCount} expense {poolWord} had no GL account mappings. We
                did not bill their costs to tenants.
              </>
            ) : (
              <>
                {poolCount} expense {poolWord}{' '}
                {poolCount === 1 ? 'has' : 'have'} no GL account mappings
                configured. Expenses won&apos;t be allocated to tenants.
              </>
            )}
          </p>
          <p className="text-sm opacity-90">
            Unmapped pools: {unmappedPools.map((p) => p.name).join(', ')}
          </p>
        </div>
        {showActions && (
          <div className="flex shrink-0 gap-2">
            {onShowHelp && (
              <Button variant="ghost" size="sm" onClick={onShowHelp}>
                Show me how
              </Button>
            )}
            {onNavigateToPools && (
              <Button variant="outline" size="sm" onClick={onNavigateToPools}>
                Configure Mappings
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
