/**
 * React Query hooks for Module B system comparison.
 *
 * The live comparison is modeled as a MUTATION (it is computed on demand from
 * user-chosen period / charged source, like the year-over-year compare flow),
 * while persisted runs are QUERIES. All hooks call the hand-authored comparison
 * client and surface backend errors as `ApiError`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/api/client'
import {
  compareExplicitCharges,
  createComparisonRun,
  getComparison,
  listComparisonRuns,
  getComparisonRun,
  type ComparisonResult,
  type ComparisonQuery,
  type ExplicitCharge,
  type PersistRunRequest,
  type StoredComparisonRun,
  type StoredComparisonRunSummary,
} from '@/api/comparison'

/** Query key factory for comparison data. */
export const comparisonKeys = {
  all: ['comparison'] as const,
  runs: (propertyId: string) =>
    [...comparisonKeys.all, 'runs', propertyId] as const,
  run: (runId: string) => [...comparisonKeys.all, 'run', runId] as const,
}

/** Inputs for computing a live comparison. */
export interface RunComparisonInput {
  propertyId: string
  periodStart: string
  periodEnd: string
  tolerance?: string
  includeDrafts?: boolean
  /**
   * Explicit charged set. When provided (even if empty), the comparison runs
   * against these caller-supplied charges; when omitted/undefined it runs
   * against the default `actual_billed_amounts` source.
   */
  charges?: ExplicitCharge[]
}

/**
 * Compute a live bidirectional comparison.
 *
 * Routes to the explicit-charges endpoint when `charges` is supplied, otherwise
 * to the default actual-billed source.
 */
export function useRunComparison() {
  return useMutation<ComparisonResult, ApiError, RunComparisonInput>({
    mutationFn: async (input) => {
      if (input.charges !== undefined) {
        const { data, error } = await compareExplicitCharges({
          client: apiClient,
          propertyId: input.propertyId,
          body: {
            period_start: input.periodStart,
            period_end: input.periodEnd,
            charges: input.charges,
            ...(input.tolerance !== undefined
              ? { tolerance: input.tolerance }
              : {}),
            ...(input.includeDrafts !== undefined
              ? { include_drafts: input.includeDrafts }
              : {}),
          },
        })
        if (error || !data) {
          throw error instanceof ApiError
            ? error
            : new ApiError('Failed to run comparison', 500)
        }
        return data
      }

      const query: ComparisonQuery = {
        period_start: input.periodStart,
        period_end: input.periodEnd,
        ...(input.tolerance !== undefined
          ? { tolerance: input.tolerance }
          : {}),
        ...(input.includeDrafts !== undefined
          ? { include_drafts: input.includeDrafts }
          : {}),
      }
      const { data, error } = await getComparison({
        client: apiClient,
        propertyId: input.propertyId,
        query,
      })
      if (error || !data) {
        throw error instanceof ApiError
          ? error
          : new ApiError('Failed to run comparison', 500)
      }
      return data
    },
  })
}

/** Inputs for persisting a comparison run. */
export interface SaveComparisonRunInput {
  propertyId: string
  body: PersistRunRequest
}

/**
 * Persist a comparison as a point-in-time audit run, then invalidate the run
 * list for that property so the history view refreshes.
 */
export function useSaveComparisonRun() {
  const queryClient = useQueryClient()
  return useMutation<StoredComparisonRun, ApiError, SaveComparisonRunInput>({
    mutationFn: async ({ propertyId, body }) => {
      const { data, error } = await createComparisonRun({
        client: apiClient,
        propertyId,
        body,
      })
      if (error || !data) {
        throw error instanceof ApiError
          ? error
          : new ApiError('Failed to save comparison run', 500)
      }
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: comparisonKeys.runs(variables.propertyId),
      })
    },
  })
}

/** List persisted comparison runs for a property (newest first). */
export function useComparisonRuns(propertyId: string, enabled = true) {
  return useQuery<StoredComparisonRunSummary[], ApiError>({
    queryKey: comparisonKeys.runs(propertyId),
    enabled: enabled && Boolean(propertyId),
    queryFn: async () => {
      const { data, error } = await listComparisonRuns({
        client: apiClient,
        propertyId,
      })
      if (error || !data) {
        throw error instanceof ApiError
          ? error
          : new ApiError('Failed to load comparison runs', 500)
      }
      return data
    },
  })
}

/** Fetch one persisted comparison run plus its findings. */
export function useComparisonRun(runId: string, enabled = true) {
  return useQuery<StoredComparisonRun, ApiError>({
    queryKey: comparisonKeys.run(runId),
    enabled: enabled && Boolean(runId),
    queryFn: async () => {
      const { data, error } = await getComparisonRun({
        client: apiClient,
        runId,
      })
      if (error || !data) {
        throw error instanceof ApiError
          ? error
          : new ApiError('Failed to load comparison run', 500)
      }
      return data
    },
  })
}
