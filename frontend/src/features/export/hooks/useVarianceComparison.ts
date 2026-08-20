import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { YearOverYearComparison } from '@/features/analysis/types'
import type { VarianceComparisonResponse } from '../types'

export interface UseVarianceComparisonParams {
  propertyId: string
  years: number[]
  useFuzzyMatching?: boolean
  enabled?: boolean
}

/**
 * Backend 400 messages that mean "there is simply nothing to compare yet"
 * rather than a genuine failure. A single-year property, or a year that has
 * not been finalized, lands here — a common, benign state we should present
 * as a friendly empty-state, not a red error.
 */
const NOTHING_TO_COMPARE_PATTERN =
  /no finalized snapshots|at least 2 years|maximum \d+ years/i

/**
 * Error thrown by the variance query. `isNothingToCompare` distinguishes the
 * benign "no prior-year reconciliation to compare" case from a real failure so
 * the UI can show a helpful empty-state instead of a destructive alert.
 */
export class VarianceComparisonError extends Error {
  readonly isNothingToCompare: boolean

  constructor(isNothingToCompare: boolean) {
    super('Failed to fetch variance comparison')
    this.name = 'VarianceComparisonError'
    this.isNothingToCompare = isNothingToCompare
  }
}

export function useVarianceComparison({
  propertyId,
  years,
  useFuzzyMatching = true,
  enabled = true,
}: UseVarianceComparisonParams) {
  return useQuery<VarianceComparisonResponse>({
    queryKey: ['variance-comparison', propertyId, years, useFuzzyMatching],
    queryFn: async () => {
      const { data, error } = await apiClient.post({
        url: '/api/v1/analysis/year-over-year' as never,
        body: {
          property_id: propertyId,
          years,
          use_fuzzy_matching: useFuzzyMatching,
        } as never,
      })
      if (error) {
        const apiError = error as { statusCode?: number; message?: string }
        const isNothingToCompare =
          apiError.statusCode === 400 &&
          NOTHING_TO_COMPARE_PATTERN.test(apiError.message ?? '')
        throw new VarianceComparisonError(isNothingToCompare)
      }

      const comparison = data as YearOverYearComparison
      const sortedYears = [...comparison.years].sort((a, b) => a - b)
      const baseYear = comparison.base_year
      const currentYear = sortedYears[sortedYears.length - 1] ?? baseYear

      const totalPriorAmount = Number(comparison.total_amounts[baseYear] ?? 0)
      const totalCurrentAmount = Number(
        comparison.total_amounts[currentYear] ?? 0
      )

      return {
        propertyId: comparison.property_id,
        propertyName: comparison.property_name,
        years: sortedYears,
        baseYear,
        currentYear,
        currentPeriod: String(currentYear),
        priorPeriod: String(baseYear),
        items: comparison.pool_comparisons.map((pool, index) => {
          const priorAmount = Number(pool.amounts[baseYear] ?? 0)
          const currentAmount = Number(pool.amounts[currentYear] ?? 0)
          const varianceAmount = Number(
            pool.variance_amount ?? currentAmount - priorAmount
          )
          const variancePercent = Number(pool.variance_percent ?? 0)
          // No prior-year amount to compare against: a percent change is
          // undefined, so flag it as "new" rather than reporting "+0.00%".
          // priorAmount collapses both an absent pool (the backend sends no
          // base-year entry) and a real $0 base to 0, so this is intentionally
          // broader than the backend's $0-base-only "new category" flag — a
          // pool that simply did not exist last year is equally "new" here.
          const isNew = priorAmount === 0 && currentAmount > 0

          return {
            poolId: `${pool.pool_name}-${index}`,
            poolName: pool.pool_name,
            currentAmount,
            priorAmount,
            varianceAmount,
            variancePercent,
            isNew,
            varianceType: isNew
              ? 'new'
              : variancePercent > 0
                ? 'increase'
                : variancePercent < 0
                  ? 'decrease'
                  : 'unchanged',
          }
        }),
        totalCurrentAmount,
        totalPriorAmount,
        totalVarianceAmount: Number(comparison.total_variance_amount ?? 0),
        totalVariancePercent: Number(comparison.total_variance_percent ?? 0),
        // The prior year had no total to compare against, so the total percent
        // change is undefined: show "New" instead of a misleading "+0.00%".
        isTotalNew: totalPriorAmount === 0 && totalCurrentAmount > 0,
      }
    },
    enabled: enabled && !!propertyId && years.length >= 2,
    // Keep failures inside this component's inline error UI. The global
    // queryClient default escalates first-load errors to the route-level
    // ErrorBoundary; for a tab inside the Export modal that would crash the
    // whole page (e.g. when the prior year has no reconciliation to compare).
    throwOnError: false,
  })
}
