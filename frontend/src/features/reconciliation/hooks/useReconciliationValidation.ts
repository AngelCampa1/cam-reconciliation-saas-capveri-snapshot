/**
 * useReconciliationValidation - Pre-flight validation for reconciliation calculations
 *
 * Checks expense pools and GL mappings to determine if calculation is safe.
 * Returns warnings if any expense pools lack GL account mappings.
 */

import { useMemo } from 'react'
import { useExpensePools, usePoolMappings } from '@/api/hooks'

export interface UnmappedPool {
  id: string
  name: string
}

export interface ValidationResult {
  /** Whether calculation can proceed (true if all pools have mappings) */
  canCalculate: boolean
  /** All expense pools (id + name) for the property */
  pools: UnmappedPool[]
  /** List of pools without GL mappings */
  unmappedPools: UnmappedPool[]
  /** Human-readable warning messages */
  warnings: string[]
  /** Loading state while fetching data */
  isLoading: boolean
  /** Mapping counts by pool ID */
  mappingCounts: Record<string, number>
}

/**
 * Validates reconciliation configuration before calculation.
 *
 * Checks:
 * - All expense pools have at least one GL account mapping
 *
 * @param propertyId - Property ID to validate
 * @returns Validation result with warnings and unmapped pools
 */
export function useReconciliationValidation(
  propertyId: string
): ValidationResult {
  // Fetch expense pools
  const { data: poolsData, isLoading: poolsLoading } =
    useExpensePools(propertyId)

  // Fetch all pool mappings
  const { data: mappingsData, isLoading: mappingsLoading } =
    usePoolMappings(propertyId)

  const isLoading = poolsLoading || mappingsLoading

  // Calculate mapping counts per pool
  const mappingCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const mappings = mappingsData?.data || []

    mappings.forEach((mapping) => {
      const poolId = mapping.expense_pool_id
      counts[poolId] = (counts[poolId] || 0) + 1
    })

    return counts
  }, [mappingsData])

  // All pools (minimal shape for display)
  const pools = useMemo(
    () => (poolsData?.data || []).map((p) => ({ id: p.id, name: p.name })),
    [poolsData]
  )

  // Find pools with 0 mappings
  const unmappedPools = useMemo(
    () => pools.filter((pool) => (mappingCounts[pool.id] ?? 0) === 0),
    [pools, mappingCounts]
  )

  // Generate warnings
  const warnings = useMemo(() => {
    const result: string[] = []

    if (unmappedPools.length > 0) {
      result.push(
        `${unmappedPools.length} expense pool${unmappedPools.length === 1 ? ' has' : 's have'} no GL account mappings`
      )
    }

    return result
  }, [unmappedPools])

  // Can calculate if all pools have mappings (or no pools exist)
  const canCalculate = unmappedPools.length === 0

  return {
    canCalculate,
    pools,
    unmappedPools,
    warnings,
    isLoading,
    mappingCounts,
  }
}
