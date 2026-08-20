/**
 * React Query hooks for GL narrative analysis.
 *
 * Analysis is advisory only. These hooks never modify calculations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GLAnalysisResult {
  id: string
  organization_id: string
  property_id: string
  period_year: number
  analysis_markdown: string
  token_input: number
  token_output: number
  ran_at: string
  ran_by_user_id: string
  dismissed_at: string | null
  dismissed_by_user_id: string | null
  created_at: string
}

export interface GLAnalysisRunResponse {
  result: GLAnalysisResult
  gl_entry_count: number
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const GL_ANALYSIS_KEYS = {
  all: ['gl-analysis'] as const,
  latest: (propertyId: string | undefined, periodYear: number | undefined) =>
    [
      ...GL_ANALYSIS_KEYS.all,
      'latest',
      propertyId ?? null,
      periodYear ?? null,
    ] as const,
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Query hook to fetch the latest non-dismissed GL analysis for a property/year.
 * Returns null when no analysis exists yet. The API reports absence as a
 * 200/null response (a 404 from older backends is also tolerated as empty).
 */
export function useLatestGLAnalysis(
  propertyId: string | undefined,
  periodYear: number | undefined
) {
  return useQuery({
    // Always key by the real identifying params (never collapse to a static
    // "disabled" sentinel) so distinct disabled instances do not share (and
    // bleed) a single cache entry. Fetching is gated by `enabled` below.
    queryKey: GL_ANALYSIS_KEYS.latest(propertyId, periodYear),
    queryFn: async (): Promise<GLAnalysisResult | null> => {
      if (!propertyId || !periodYear) return null

      const { data, error, response } = await apiClient.get({
        url: `/api/v1/analysis/gl-narrative/${propertyId}/${periodYear}` as never,
      })

      // No analysis yet is a normal state, not an error. The API returns 200
      // with a null body when none exists; the 404 branch is a defensive
      // fallback for older backends.
      if (response?.status === 404) return null
      if (error) throw new Error('Failed to fetch GL analysis')

      return (data ?? null) as GLAnalysisResult | null
    },
    enabled: !!propertyId && !!periodYear,
  })
}

/**
 * Mutation hook to run GL narrative analysis for a property/year.
 * Invalidates the latest analysis query on success.
 */
export function useRunGLAnalysis(
  propertyId: string | undefined,
  periodYear: number | undefined
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<GLAnalysisRunResponse> => {
      if (!propertyId || !periodYear) {
        throw new Error('Property ID and period year are required')
      }

      const { data, error } = await apiClient.post({
        url: '/api/v1/analysis/gl-narrative' as never,
        body: {
          property_id: propertyId,
          period_year: periodYear,
        } as never,
      })

      if (error) throw new Error('Failed to run GL analysis')

      return data as GLAnalysisRunResponse
    },
    onSuccess: () => {
      if (propertyId && periodYear) {
        queryClient.invalidateQueries({
          queryKey: GL_ANALYSIS_KEYS.latest(propertyId, periodYear),
        })
      }
    },
  })
}

/**
 * Mutation hook to dismiss a GL analysis result.
 * Invalidates the latest analysis query on success.
 */
export function useDismissGLAnalysis(
  propertyId: string | undefined,
  periodYear: number | undefined
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (analysisId: string): Promise<GLAnalysisResult> => {
      const { data, error } = await apiClient.post({
        url: `/api/v1/analysis/gl-narrative/${analysisId}/dismiss` as never,
      })

      if (error) throw new Error('Failed to dismiss GL analysis')

      return data as GLAnalysisResult
    },
    onSuccess: () => {
      if (propertyId && periodYear) {
        queryClient.invalidateQueries({
          queryKey: GL_ANALYSIS_KEYS.latest(propertyId, periodYear),
        })
      }
    },
  })
}
