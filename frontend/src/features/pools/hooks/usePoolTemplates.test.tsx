/**
 * Tests for pool template hooks.
 *
 * Tests CRUD operations and template application with query management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  usePoolTemplates,
  usePoolTemplate,
  useCreatePoolTemplate,
  useUpdatePoolTemplate,
  useDeletePoolTemplate,
  useApplyTemplate,
  poolTemplateKeys,
} from './usePoolTemplates'
import * as generatedApi from '@/api/generated'
import type {
  PoolTemplate,
  PoolTemplateCreate,
  PoolTemplateUpdate,
  ApplyTemplateRequest,
} from '@/api/generated'

// Mock the generated API functions
vi.mock('@/api/generated', async () => {
  const actual = await vi.importActual('@/api/generated')
  return {
    ...actual,
    listTemplatesApiV1PoolTemplatesGet: vi.fn(),
    getTemplateApiV1PoolTemplatesTemplateIdGet: vi.fn(),
    createTemplateApiV1PoolTemplatesPost: vi.fn(),
    updateTemplateApiV1PoolTemplatesTemplateIdPut: vi.fn(),
    deleteTemplateApiV1PoolTemplatesTemplateIdDelete: vi.fn(),
    applyTemplateApiV1PoolTemplatesApplyPost: vi.fn(),
  }
})

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('usePoolTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockTemplate: PoolTemplate = {
    id: 'template-1',
    name: 'Office Building - Standard',
    description: 'Standard expense pools for office buildings',
    property_type: 'office',
    is_system: true,
    organization_id: null,
    pools: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  describe('Query Key Factory', () => {
    it('generates correct query keys', () => {
      expect(poolTemplateKeys.all).toEqual(['pool-templates'])
      expect(poolTemplateKeys.lists()).toEqual(['pool-templates', 'list'])
      expect(poolTemplateKeys.list('office')).toEqual([
        'pool-templates',
        'list',
        { propertyType: 'office' },
      ])
      expect(poolTemplateKeys.details()).toEqual(['pool-templates', 'detail'])
      expect(poolTemplateKeys.detail('template-1')).toEqual([
        'pool-templates',
        'detail',
        'template-1',
      ])
    })
  })

  describe('usePoolTemplates - List Templates', () => {
    it('fetches all templates without filter', async () => {
      const mockTemplates = [mockTemplate]
      vi.mocked(
        generatedApi.listTemplatesApiV1PoolTemplatesGet
      ).mockResolvedValue({
        data: mockTemplates,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePoolTemplates(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockTemplates)
      expect(
        generatedApi.listTemplatesApiV1PoolTemplatesGet
      ).toHaveBeenCalledWith({
        client: expect.any(Object),
      })
    })

    it('filters by property type', async () => {
      const mockTemplates = [mockTemplate]
      vi.mocked(
        generatedApi.listTemplatesApiV1PoolTemplatesGet
      ).mockResolvedValue({
        data: mockTemplates,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePoolTemplates('office'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(
        generatedApi.listTemplatesApiV1PoolTemplatesGet
      ).toHaveBeenCalledWith({
        client: expect.any(Object),
        query: { property_type: 'office' },
      })
    })

    it('returns empty array when data is null', async () => {
      vi.mocked(
        generatedApi.listTemplatesApiV1PoolTemplatesGet
      ).mockResolvedValue({
        data: null,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePoolTemplates(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual([])
    })

    it('handles API error', async () => {
      vi.mocked(
        generatedApi.listTemplatesApiV1PoolTemplatesGet
      ).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => usePoolTemplates(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Network error')
    })
  })

  describe('usePoolTemplate - Get Single Template', () => {
    it('fetches template by ID', async () => {
      vi.mocked(
        generatedApi.getTemplateApiV1PoolTemplatesTemplateIdGet
      ).mockResolvedValue({
        data: mockTemplate,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePoolTemplate('template-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockTemplate)
      expect(
        generatedApi.getTemplateApiV1PoolTemplatesTemplateIdGet
      ).toHaveBeenCalledWith({
        client: expect.any(Object),
        path: { template_id: 'template-1' },
      })
    })

    it('throws error when template not found', async () => {
      vi.mocked(
        generatedApi.getTemplateApiV1PoolTemplatesTemplateIdGet
      ).mockResolvedValue({
        data: null,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => usePoolTemplate('nonexistent'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Template not found')
    })

    it('does not execute query when templateId is empty', () => {
      const { result } = renderHook(() => usePoolTemplate(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.isFetching).toBe(false)
      expect(
        generatedApi.getTemplateApiV1PoolTemplatesTemplateIdGet
      ).not.toHaveBeenCalled()
    })

    it('handles API error', async () => {
      vi.mocked(
        generatedApi.getTemplateApiV1PoolTemplatesTemplateIdGet
      ).mockRejectedValue(new Error('Server error'))

      const { result } = renderHook(() => usePoolTemplate('template-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Server error')
    })
  })

  describe('useCreatePoolTemplate', () => {
    it('creates new template', async () => {
      const newTemplate: PoolTemplateCreate = {
        name: 'New Template',
        property_type: 'retail',
        pools: [],
      }

      const createdTemplate: PoolTemplate = {
        ...newTemplate,
        id: 'new-template-id',
        description: null,
        is_system: false,
        organization_id: 'org-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      vi.mocked(
        generatedApi.createTemplateApiV1PoolTemplatesPost
      ).mockResolvedValue({
        data: createdTemplate,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useCreatePoolTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(newTemplate)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(createdTemplate)
    })

    it('throws error when no data returned', async () => {
      const newTemplate: PoolTemplateCreate = {
        name: 'New Template',
        property_type: 'retail',
        pools: [],
      }

      vi.mocked(
        generatedApi.createTemplateApiV1PoolTemplatesPost
      ).mockResolvedValue({
        data: null,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useCreatePoolTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(newTemplate)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('No data returned from API')
    })

    it('handles API error', async () => {
      const newTemplate: PoolTemplateCreate = {
        name: 'New Template',
        property_type: 'retail',
        pools: [],
      }

      vi.mocked(
        generatedApi.createTemplateApiV1PoolTemplatesPost
      ).mockRejectedValue(new Error('Validation error'))

      const { result } = renderHook(() => useCreatePoolTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(newTemplate)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Validation error')
    })

    it('invalidates template lists on successful create', async () => {
      const newTemplate: PoolTemplateCreate = {
        name: 'New Template',
        property_type: 'retail',
        pools: [],
      }

      const createdTemplate: PoolTemplate = {
        ...newTemplate,
        id: 'new-template-id',
        description: null,
        is_system: false,
        organization_id: 'org-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }

      vi.mocked(
        generatedApi.createTemplateApiV1PoolTemplatesPost
      ).mockResolvedValue({
        data: createdTemplate,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useCreatePoolTemplate(), { wrapper })

      result.current.mutate(newTemplate)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: poolTemplateKeys.lists(),
      })
    })
  })

  describe('useUpdatePoolTemplate', () => {
    it('updates existing template', async () => {
      const update: PoolTemplateUpdate = {
        name: 'Updated Template Name',
      }

      const updatedTemplate: PoolTemplate = {
        ...mockTemplate,
        name: 'Updated Template Name',
      }

      vi.mocked(
        generatedApi.updateTemplateApiV1PoolTemplatesTemplateIdPut
      ).mockResolvedValue({
        data: updatedTemplate,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdatePoolTemplate('template-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate(update)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(updatedTemplate)
      expect(
        generatedApi.updateTemplateApiV1PoolTemplatesTemplateIdPut
      ).toHaveBeenCalledWith({
        client: expect.any(Object),
        path: { template_id: 'template-1' },
        body: update,
      })
    })

    it('throws error when no data returned', async () => {
      const update: PoolTemplateUpdate = {
        name: 'Updated Name',
      }

      vi.mocked(
        generatedApi.updateTemplateApiV1PoolTemplatesTemplateIdPut
      ).mockResolvedValue({
        data: null,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useUpdatePoolTemplate('template-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate(update)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('No data returned from API')
    })

    it('handles API error', async () => {
      const update: PoolTemplateUpdate = {
        name: 'Updated Name',
      }

      vi.mocked(
        generatedApi.updateTemplateApiV1PoolTemplatesTemplateIdPut
      ).mockRejectedValue(new Error('Not found'))

      const { result } = renderHook(() => useUpdatePoolTemplate('template-1'), {
        wrapper: createWrapper(),
      })

      result.current.mutate(update)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Not found')
    })

    it('updates detail cache and invalidates lists on successful update', async () => {
      const update: PoolTemplateUpdate = {
        name: 'Updated Template Name',
      }

      const updatedTemplate: PoolTemplate = {
        ...mockTemplate,
        name: 'Updated Template Name',
      }

      vi.mocked(
        generatedApi.updateTemplateApiV1PoolTemplatesTemplateIdPut
      ).mockResolvedValue({
        data: updatedTemplate,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useUpdatePoolTemplate('template-1'), {
        wrapper,
      })

      result.current.mutate(update)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify detail cache is updated
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        poolTemplateKeys.detail('template-1'),
        updatedTemplate
      )

      // Verify lists are invalidated
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: poolTemplateKeys.lists(),
      })
    })
  })

  describe('useDeletePoolTemplate', () => {
    it('deletes template', async () => {
      vi.mocked(
        generatedApi.deleteTemplateApiV1PoolTemplatesTemplateIdDelete
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useDeletePoolTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('template-1')

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(
        generatedApi.deleteTemplateApiV1PoolTemplatesTemplateIdDelete
      ).toHaveBeenCalledWith({
        client: expect.any(Object),
        path: { template_id: 'template-1' },
      })
    })

    it('handles API error', async () => {
      vi.mocked(
        generatedApi.deleteTemplateApiV1PoolTemplatesTemplateIdDelete
      ).mockRejectedValue(new Error('Cannot delete system template'))

      const { result } = renderHook(() => useDeletePoolTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate('template-1')

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe(
        'Cannot delete system template'
      )
    })

    it('removes detail cache and invalidates lists on successful delete', async () => {
      vi.mocked(
        generatedApi.deleteTemplateApiV1PoolTemplatesTemplateIdDelete
      ).mockResolvedValue({
        data: undefined,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      const removeQueriesSpy = vi.spyOn(queryClient, 'removeQueries')
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useDeletePoolTemplate(), { wrapper })

      result.current.mutate('template-1')

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify detail cache is removed
      expect(removeQueriesSpy).toHaveBeenCalledWith({
        queryKey: poolTemplateKeys.detail('template-1'),
      })

      // Verify lists are invalidated
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: poolTemplateKeys.lists(),
      })
    })
  })

  describe('useApplyTemplate', () => {
    it('applies template to property', async () => {
      const applyRequest: ApplyTemplateRequest = {
        template_id: 'template-1',
        property_id: 'property-123',
      }

      const applyResponse = {
        message: 'Template applied successfully',
        pools_created: 5,
      }

      vi.mocked(
        generatedApi.applyTemplateApiV1PoolTemplatesApplyPost
      ).mockResolvedValue({
        data: applyResponse,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useApplyTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(applyRequest)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(applyResponse)
      expect(
        generatedApi.applyTemplateApiV1PoolTemplatesApplyPost
      ).toHaveBeenCalledWith({
        client: expect.any(Object),
        body: applyRequest,
      })
    })

    it('throws error when no data returned', async () => {
      const applyRequest: ApplyTemplateRequest = {
        template_id: 'template-1',
        property_id: 'property-123',
      }

      vi.mocked(
        generatedApi.applyTemplateApiV1PoolTemplatesApplyPost
      ).mockResolvedValue({
        data: null,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const { result } = renderHook(() => useApplyTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(applyRequest)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('No data returned from API')
    })

    it('handles API error', async () => {
      const applyRequest: ApplyTemplateRequest = {
        template_id: 'template-1',
        property_id: 'property-123',
      }

      vi.mocked(
        generatedApi.applyTemplateApiV1PoolTemplatesApplyPost
      ).mockRejectedValue(new Error('Property already has pools'))

      const { result } = renderHook(() => useApplyTemplate(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(applyRequest)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Property already has pools')
    })

    it('invalidates expense pool queries on successful apply', async () => {
      const applyRequest: ApplyTemplateRequest = {
        template_id: 'template-1',
        property_id: 'property-123',
      }

      const applyResponse = {
        message: 'Template applied successfully',
        pools_created: 5,
      }

      vi.mocked(
        generatedApi.applyTemplateApiV1PoolTemplatesApplyPost
      ).mockResolvedValue({
        data: applyResponse,
        error: undefined,
        request: {} as Request,
        response: {} as Response,
      })

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useApplyTemplate(), { wrapper })

      result.current.mutate(applyRequest)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify property's expense pools are invalidated
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['expense-pools', 'byProperty', 'property-123'],
      })
    })
  })
})
