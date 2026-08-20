/**
 * Cell mutation hook with optimistic updates.
 *
 * Provides instant UI feedback for cell edits with automatic rollback on error.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient, ApiError } from '@/api/client'
import { updateReconciliationCellApiV1ReconciliationCellsCellIdPatch } from '@/api/generated/sdk.gen'
import type {
  PaginatedResponse_ReconciliationSnapshotSummary_,
  ReconciliationSnapshotSummary,
} from '@/api/generated/types.gen'
import { queryKeys } from '@/api/hooks'
import type { ReconciliationRow } from '../types/reconciliation-row'

export interface CellUpdateParams {
  snapshotId: string
  field: string
  value: string | number
}

/**
 * Update a reconciliation cell value.
 * Calls the PATCH /api/v1/reconciliation/cells/{cell_id} endpoint.
 *
 * The cell_id is a base64-encoded string of "snapshot_id:field_name"
 */
async function updateReconciliationCell(
  params: CellUpdateParams
): Promise<void> {
  // Encode cell_id as URL-safe base64 for use as a path segment.
  const cellId = btoa(`${params.snapshotId}:${params.field}`)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  const response =
    await updateReconciliationCellApiV1ReconciliationCellsCellIdPatch({
      client: apiClient,
      path: { cell_id: cellId },
      body: { value: params.value },
    })

  if (response.error) {
    throw ApiError.fromUnknown(response.error)
  }
}

function updateCachedRow<T extends { id: string }>(
  row: T,
  newData: CellUpdateParams
): T {
  if (row.id !== newData.snapshotId) {
    return row
  }

  return {
    ...row,
    [newData.field]: newData.value,
  }
}

function isPaginatedSnapshotCache(
  value: unknown
): value is PaginatedResponse_ReconciliationSnapshotSummary_ {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Array.isArray((value as { items?: unknown }).items)
}

function updateOptimisticCache(
  old: unknown,
  newData: CellUpdateParams
): unknown {
  if (!old) return old

  if (Array.isArray(old)) {
    return (old as ReconciliationRow[]).map((row) =>
      updateCachedRow(row, newData)
    )
  }

  if (!isPaginatedSnapshotCache(old)) {
    return old
  }

  return {
    ...old,
    items: old.items.map((snapshot: ReconciliationSnapshotSummary) =>
      updateCachedRow(snapshot, newData)
    ),
  }
}

/**
 * Hook for cell mutations with optimistic updates.
 *
 * Features:
 * - Instant UI updates (optimistic)
 * - Automatic rollback on error
 * - Error toast with retry option
 * - Pending state indicator
 */
export function useCellMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CellUpdateParams) => {
      return updateReconciliationCell(params)
    },

    onMutate: async (newData) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({
        queryKey: queryKeys.reconciliation.snapshots(),
      })

      // Get all queries for reconciliation snapshots
      const queriesData = queryClient.getQueriesData({
        queryKey: queryKeys.reconciliation.snapshots(),
      })

      // Optimistically update all matching queries
      if (queriesData.length > 0) {
        queriesData.forEach(([queryKey]) => {
          queryClient.setQueryData<unknown>(queryKey, (old: unknown) =>
            updateOptimisticCache(old, newData)
          )
        })
      }

      // Return context with snapshot for rollback
      return { queriesData }
    },

    onError: (_err, _newData, context) => {
      // Rollback to previous state for all queries
      if (context?.queriesData) {
        context.queriesData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }

      // Show error toast with retry option
      toast.error('Save failed. Data reverted.', {
        action: {
          label: 'Retry',
          onClick: () => {
            // The mutation can be retried by the user clicking retry
            // The component using this hook should handle retry
          },
        },
      })
    },

    onSuccess: () => {
      // Invalidate all reconciliation snapshot queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.reconciliation.snapshots(),
      })
    },
  })
}
