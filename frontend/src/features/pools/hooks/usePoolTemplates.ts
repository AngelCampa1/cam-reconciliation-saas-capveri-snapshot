/**
 * React Query hooks for pool template operations.
 *
 * Provides CRUD operations and template application functionality.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '@/api/client'
import {
  listTemplatesApiV1PoolTemplatesGet,
  createTemplateApiV1PoolTemplatesPost,
  getTemplateApiV1PoolTemplatesTemplateIdGet,
  updateTemplateApiV1PoolTemplatesTemplateIdPut,
  deleteTemplateApiV1PoolTemplatesTemplateIdDelete,
  applyTemplateApiV1PoolTemplatesApplyPost,
  type PoolTemplate,
  type PoolTemplateCreate,
  type PoolTemplateUpdate,
  type ApplyTemplateRequest,
  type ApplyTemplateApiV1PoolTemplatesApplyPostResponse,
} from '@/api/generated'
import { apiClient } from '@/api/client'
import { queryKeys } from '@/api/hooks'

/**
 * Query key factory for pool templates.
 */
export const poolTemplateKeys = {
  all: ['pool-templates'] as const,
  lists: () => [...poolTemplateKeys.all, 'list'] as const,
  list: (propertyType?: string) =>
    [...poolTemplateKeys.lists(), { propertyType }] as const,
  details: () => [...poolTemplateKeys.all, 'detail'] as const,
  detail: (id: string) => [...poolTemplateKeys.details(), id] as const,
}

/**
 * Fetch all pool templates (system + organization custom).
 */
export function usePoolTemplates(propertyType?: string) {
  return useQuery({
    queryKey: poolTemplateKeys.list(propertyType),
    queryFn: async () => {
      const response = await listTemplatesApiV1PoolTemplatesGet(
        propertyType
          ? { client: apiClient, query: { property_type: propertyType } }
          : { client: apiClient }
      )
      return response.data ?? []
    },
  })
}

/**
 * Fetch a specific pool template by ID.
 */
export function usePoolTemplate(templateId: string) {
  return useQuery({
    queryKey: poolTemplateKeys.detail(templateId),
    queryFn: async () => {
      const response = await getTemplateApiV1PoolTemplatesTemplateIdGet({
        client: apiClient,
        path: { template_id: templateId },
      })
      if (!response.data) {
        throw new Error('Template not found')
      }
      return response.data
    },
    enabled: Boolean(templateId),
  })
}

/**
 * Create a new custom pool template.
 */
export function useCreatePoolTemplate() {
  const queryClient = useQueryClient()

  return useMutation<PoolTemplate, ApiError, PoolTemplateCreate>({
    mutationFn: async (data: PoolTemplateCreate) => {
      const response = await createTemplateApiV1PoolTemplatesPost({
        client: apiClient,
        body: data,
      })
      if (!response.data) {
        throw new Error('No data returned from API')
      }
      return response.data
    },
    onSuccess: () => {
      // Invalidate all template lists
      queryClient.invalidateQueries({ queryKey: poolTemplateKeys.lists() })
    },
  })
}

/**
 * Update an existing custom pool template.
 */
export function useUpdatePoolTemplate(templateId: string) {
  const queryClient = useQueryClient()

  return useMutation<PoolTemplate, ApiError, PoolTemplateUpdate>({
    mutationFn: async (data: PoolTemplateUpdate) => {
      const response = await updateTemplateApiV1PoolTemplatesTemplateIdPut({
        client: apiClient,
        path: { template_id: templateId },
        body: data,
      })
      if (!response.data) {
        throw new Error('No data returned from API')
      }
      return response.data
    },
    onSuccess: (updatedTemplate) => {
      // Update cached detail
      queryClient.setQueryData(
        poolTemplateKeys.detail(templateId),
        updatedTemplate
      )
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: poolTemplateKeys.lists() })
    },
  })
}

/**
 * Delete a custom pool template.
 */
export function useDeletePoolTemplate() {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: async (templateId: string) => {
      await deleteTemplateApiV1PoolTemplatesTemplateIdDelete({
        client: apiClient,
        path: { template_id: templateId },
      })
    },
    onSuccess: (_data, templateId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: poolTemplateKeys.detail(templateId),
      })
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: poolTemplateKeys.lists() })
    },
  })
}

/**
 * Apply a pool template to a property.
 */
export function useApplyTemplate() {
  const queryClient = useQueryClient()

  return useMutation<
    ApplyTemplateApiV1PoolTemplatesApplyPostResponse,
    ApiError,
    ApplyTemplateRequest
  >({
    mutationFn: async (request: ApplyTemplateRequest) => {
      const response = await applyTemplateApiV1PoolTemplatesApplyPost({
        client: apiClient,
        body: request,
      })
      if (!response.data) {
        throw new Error('No data returned from API')
      }
      return response.data
    },
    onSuccess: (_data, variables) => {
      // Invalidate property's expense pools
      queryClient.invalidateQueries({
        queryKey: queryKeys.expensePools.byProperty(variables.property_id),
      })
    },
  })
}
