/**
 * React Query hook for pool copy operations.
 *
 * Provides functionality to copy expense pools between properties
 * with support for merge and replace modes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PoolCopyRequest, PoolCopyResult } from '@/types'
import { apiClient } from '@/api/client'
import { ApiError } from '@/api/errors'
import { queryKeys } from '@/api/hooks'

/**
 * Copy expense pools from one property to another.
 */
export function usePoolCopy() {
  const queryClient = useQueryClient()

  return useMutation<PoolCopyResult, ApiError, PoolCopyRequest>({
    mutationFn: async (request: PoolCopyRequest) => {
      const { data, error, response } = await apiClient.post({
        url: '/api/v1/pool-templates/copy' as never,
        body: request as never,
      })

      if (error) {
        // Surface the backend's structured error detail when available,
        // mirroring sibling hooks (use-stripe-portal, api/hooks export flows).
        const detail = (error as { detail?: unknown }).detail
        const message =
          typeof detail === 'string' && detail.length > 0
            ? detail
            : 'Failed to copy pools'
        throw new ApiError(message, response?.status ?? 0)
      }

      return data as PoolCopyResult
    },
    onSuccess: (_data, variables) => {
      // Invalidate expense pools for both source and target properties
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(
          variables.source_property_id
        ),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(
          variables.target_property_id
        ),
      })
    },
  })
}
