/**
 * React Query hooks for year-over-year analysis.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type {
  AnomalyDetectionRequest,
  AnomalyDetectionResult,
  YearOverYearComparison,
  YearOverYearRequest,
} from '../types'

/**
 * Coerce a backend Decimal value (which serializes to a JSON string) to a
 * number, preserving null/undefined as null. Returns null if the value is not
 * a finite number.
 */
function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

const ANALYSIS_KEYS = {
  all: ['analysis'] as const,
  yearOverYear: (propertyId: string, years: number[]) =>
    [...ANALYSIS_KEYS.all, 'yoy', propertyId, years] as const,
  availableYears: (propertyId: string) =>
    [...ANALYSIS_KEYS.all, 'available-years', propertyId] as const,
}

/**
 * Hook to fetch available years with finalized snapshots for a property.
 */
export function useAvailableYears(propertyId: string | undefined) {
  return useQuery({
    queryKey: propertyId
      ? ANALYSIS_KEYS.availableYears(propertyId)
      : ['analysis', 'available-years', 'none'],
    queryFn: async () => {
      if (!propertyId) {
        throw new Error('Property ID is required')
      }

      const { data, error } = await apiClient.get({
        url: `/api/v1/analysis/properties/${propertyId}/available-years` as never,
      })

      if (error) {
        throw new Error('Failed to fetch available years')
      }

      return data as number[]
    },
    enabled: !!propertyId,
  })
}

/**
 * Hook to fetch year-over-year comparison data.
 */
export function useYearOverYearComparison() {
  return useMutation({
    mutationFn: async (req: YearOverYearRequest) => {
      const { data, error } = await apiClient.post({
        url: '/api/v1/analysis/year-over-year' as never,
        body: req as never,
      })

      if (error) {
        throw new Error('Failed to fetch year-over-year comparison')
      }

      const raw = data as YearOverYearComparison
      return {
        ...raw,
        pool_comparisons: (raw.pool_comparisons ?? []).map((pool) => ({
          ...pool,
          amounts: Object.fromEntries(
            Object.entries(pool.amounts ?? {}).map(([year, value]) => [
              Number(year),
              toNum(value),
            ])
          ),
          base_year_amount: toNum(pool.base_year_amount),
          variance_amount: toNum(pool.variance_amount),
          variance_percent: toNum(pool.variance_percent),
        })),
        total_amounts: Object.fromEntries(
          Object.entries(raw.total_amounts ?? {}).map(([year, value]) => [
            Number(year),
            Number(value),
          ])
        ),
        total_variance_amount: toNum(raw.total_variance_amount),
        total_variance_percent: toNum(raw.total_variance_percent),
      } as YearOverYearComparison
    },
  })
}

/**
 * Hook to detect anomalies for a property across comparison years.
 */
export function useAnomalyDetection() {
  return useMutation({
    mutationFn: async (req: AnomalyDetectionRequest) => {
      const { data, error } = await apiClient.post({
        url: '/api/v1/analysis/anomaly-detection' as never,
        body: req as never,
      })
      if (error) {
        throw new Error('Failed to detect anomalies')
      }
      const raw = data as AnomalyDetectionResult
      return {
        ...raw,
        anomalies: raw.anomalies.map((a) => ({
          ...a,
          current_value: Number(a.current_value),
          expected_value: Number(a.expected_value),
          variance_percent: Number(a.variance_percent),
        })),
      }
    },
  })
}
