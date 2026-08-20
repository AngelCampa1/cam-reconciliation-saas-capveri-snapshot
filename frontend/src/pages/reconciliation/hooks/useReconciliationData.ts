/**
 * useReconciliationData Hook
 *
 * Fetches and transforms reconciliation snapshots into grid rows.
 * Handles data fetching, transformation, pool extraction, and aggregate calculations.
 */
import { useMemo } from 'react'
import { useProperty } from '@/api/hooks'
import { useAllReconciliationSnapshots } from '@/api/hooks'
import { useAuth } from '@/contexts/AuthContext'
import { sumMoney } from '@/lib/money'
import type { ReconciliationRow } from '@/features/reconciliation/types'
import type {
  Property,
  ReconciliationSnapshot,
  ReconciliationSnapshotSummary,
} from '@/api/generated/types.gen'

interface UseReconciliationDataParams {
  propertyId: string
  year: string
}

interface UseReconciliationDataResult {
  rows: ReconciliationRow[]
  snapshots: ReconciliationSnapshotSummary[]
  property: Property | null
  status: 'draft' | 'finalized'
  isFinalized: boolean
  totalRecovery: number
  tenantCount: number
  snapshotId: string | null
  isLoading: boolean
  isError: boolean
  isPaused: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Calculation step structure from calculation_trace JSONB
 */
interface CalculationStep {
  step_order: number
  step_name: string
  input_values: Record<string, string>
  operation: string
  output_value: string
  note?: string | null
}

/**
 * Pool data extracted from calculation traces
 */
interface PoolData {
  pool_id: string
  pool_name: string
  total_expenses: string
  grossed_up_expenses?: string
  tenant_shares: Record<string, string>
}

/**
 * Extract pool data from a single snapshot's calculation_trace.
 *
 * Parses the calculation steps to find:
 * - Pool aggregation steps (pattern: "Aggregate [Pool Name] Pool")
 * - Tenant share calculations (pattern: "Calculate Tenant Share - [Pool Name]")
 *
 * @param snapshot - Reconciliation snapshot with calculation_trace
 * @returns Map of pool_id to PoolData
 */
function extractPoolsFromTrace(
  snapshot: ReconciliationSnapshot | ReconciliationSnapshotSummary
): Map<string, PoolData> {
  const pools = new Map<string, PoolData>()

  // calculation_trace only exists on full ReconciliationSnapshot, not Summary
  if (
    !('calculation_trace' in snapshot) ||
    !snapshot.calculation_trace ||
    snapshot.calculation_trace.length === 0
  ) {
    return pools
  }

  const trace = snapshot.calculation_trace as unknown as CalculationStep[]

  // Find pool aggregation steps
  for (const step of trace) {
    // Match "Aggregate [Pool Name] Pool" pattern
    const poolMatch = step.step_name.match(/Aggregate (.+) Pool/i)
    if (poolMatch || step.input_values.pool_name) {
      const poolName = poolMatch?.[1] || step.input_values.pool_name

      // Skip if poolName is still undefined
      if (!poolName) continue

      const poolId =
        step.input_values.pool_id ||
        `pool-${poolName.toLowerCase().replace(/\s+/g, '-')}`

      if (!pools.has(poolId)) {
        pools.set(poolId, {
          pool_id: poolId,
          pool_name: poolName,
          total_expenses: step.input_values.total_expenses || step.output_value,
          ...(step.input_values.grossed_up_expenses !== undefined && {
            grossed_up_expenses: step.input_values.grossed_up_expenses,
          }),
          tenant_shares: {},
        })
      }
    }
  }

  // Find tenant share steps
  for (const step of trace) {
    const shareMatch = step.step_name.match(/Calculate Tenant Share - (.+)/i)
    if (shareMatch) {
      const poolName = shareMatch[1]
      const pool = Array.from(pools.values()).find(
        (p) => p.pool_name === poolName
      )

      if (pool) {
        pool.tenant_shares[snapshot.lease_id] = step.output_value
      }
    }
  }

  return pools
}

/**
 * Transform reconciliation snapshots into grid rows.
 *
 * Creates two types of rows:
 * 1. Expense pool rows - Extracted from calculation_trace with tenant shares
 * 2. Tenant summary rows - Total recovery per tenant
 *
 * @param snapshots - Array of reconciliation snapshots
 * @returns Array of grid rows (pools + summaries)
 */
function transformSnapshotsToRows(
  snapshots: ReconciliationSnapshotSummary[]
): ReconciliationRow[] {
  const rows: ReconciliationRow[] = []
  const poolMap = new Map<string, PoolData>()

  // Extract and merge pools from all snapshots
  for (const snapshot of snapshots) {
    const snapshotPools = extractPoolsFromTrace(snapshot)

    for (const [poolId, poolData] of snapshotPools.entries()) {
      if (!poolMap.has(poolId)) {
        poolMap.set(poolId, {
          pool_id: poolData.pool_id,
          pool_name: poolData.pool_name,
          total_expenses: poolData.total_expenses,
          ...(poolData.grossed_up_expenses !== undefined && {
            grossed_up_expenses: poolData.grossed_up_expenses,
          }),
          tenant_shares: {},
        })
      }

      const existingPool = poolMap.get(poolId)!
      Object.assign(existingPool.tenant_shares, poolData.tenant_shares)
    }
  }

  // Create expense pool rows
  for (const [poolId, poolData] of poolMap.entries()) {
    rows.push({
      id: `pool-${poolId}`,
      type: 'expense_pool',
      pool_id: poolData.pool_id,
      pool_name: poolData.pool_name,
      total_expenses: poolData.total_expenses,
      grossed_up_expenses: poolData.grossed_up_expenses,
      tenant_shares: poolData.tenant_shares,
    })
  }

  // Create tenant summary rows with real tenant names
  for (const snapshot of snapshots) {
    // Preserve the exact backend Decimal string (no float round-trip).
    const totalRecovery = snapshot.total_recovery || '0'
    rows.push({
      id: snapshot.id,
      type: 'tenant_summary',
      tenant_id: snapshot.lease_id,
      // Use tenant_name from snapshot API response (backend joins lease data)
      tenant_name: snapshot.tenant_name || snapshot.lease_id,
      total_recovery: totalRecovery,
      // Tenant's share before the admin fee. The three money columns read
      // tenant_share + admin_fee = final_amount (total_recovery is all-in).
      tenant_share: snapshot.tenant_share_after_cap ?? undefined,
      // Surface the admin fee charged on this snapshot (null when none).
      admin_fee: snapshot.admin_fee ?? undefined,
      final_amount: totalRecovery,
    })
  }

  return rows
}

/**
 * Fetch and transform reconciliation data for a property and year.
 *
 * Combines property data, reconciliation snapshots, and derived calculations
 * into a format suitable for the reconciliation grid.
 *
 * @param params - Property ID and year to fetch
 * @returns Query result with rows, property, status, and aggregates
 */
export function useReconciliationData({
  propertyId,
  year,
}: UseReconciliationDataParams): UseReconciliationDataResult {
  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  // Wait for auth to be ready before fetching data
  const { isLoading: authLoading, user } = useAuth()
  const isAuthReady = !authLoading && !!user

  // Fetch property - only when auth is ready
  const {
    data: property,
    isLoading: propertyLoading,
    isError: propertyError,
    isPaused: propertyPaused,
    error: propertyErrorObj,
    refetch: refetchProperty,
  } = useProperty(propertyId, { enabled: isAuthReady })

  // Fetch reconciliation snapshots - only when auth is ready.
  // Uses the all-pages hook so properties with >100 leases are not truncated
  // (the backend caps page size at 100); the grid, totals, finalized status,
  // and exports all depend on the complete snapshot set.
  const {
    data: snapshotsResponse,
    isLoading: snapshotsLoading,
    isError: snapshotsError,
    isPaused: snapshotsPaused,
    error: snapshotsErrorObj,
    refetch: refetchSnapshots,
  } = useAllReconciliationSnapshots(
    {
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
    },
    { enabled: isAuthReady }
  )

  // Transform snapshots to grid rows
  const rows = useMemo(() => {
    return transformSnapshotsToRows(snapshotsResponse?.items || [])
  }, [snapshotsResponse])

  // Calculate aggregates
  const { totalRecovery, isFinalized, tenantCount, snapshotId } =
    useMemo(() => {
      const tenantRows = rows.filter((r) => r.type === 'tenant_summary')

      // Accumulate exactly across Decimal strings (no float drift), then
      // convert the canonical total once at this number-typed boundary.
      const total = Number(
        sumMoney(tenantRows.map((row) => row.total_recovery || '0'))
      )

      const finalized =
        snapshotsResponse?.items?.every((s) => s.status === 'finalized') ??
        false

      // Get the first snapshot ID (there should be multiple snapshots, one per lease)
      const firstSnapshotId = snapshotsResponse?.items?.[0]?.id || null

      return {
        totalRecovery: total,
        isFinalized: finalized,
        tenantCount: tenantRows.length,
        snapshotId: firstSnapshotId,
      }
    }, [rows, snapshotsResponse])

  return {
    rows,
    snapshots: snapshotsResponse?.items || [],
    property: property || null,
    status: isFinalized ? 'finalized' : 'draft',
    isFinalized,
    totalRecovery,
    tenantCount,
    snapshotId,
    isLoading: authLoading || propertyLoading || snapshotsLoading,
    isError: propertyError || snapshotsError,
    isPaused: propertyPaused || snapshotsPaused,
    error: (propertyErrorObj || snapshotsErrorObj) as Error | null,
    refetch: () => {
      void refetchProperty()
      void refetchSnapshots()
    },
  }
}
