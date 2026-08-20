/**
 * Tests for usePoolCopy hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePoolCopy } from './usePoolCopy'
import { apiClient } from '@/api/client'

// Mock the API client
vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('usePoolCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies pools successfully', async () => {
    const mockResult = {
      pools_copied: 3,
      parent_pools_copied: 2,
      child_pools_copied: 1,
      pools_deleted: 0,
      copied_pools: [],
    }

    vi.mocked(apiClient.post).mockResolvedValue({ data: mockResult })

    const { result } = renderHook(() => usePoolCopy(), {
      wrapper: createWrapper(),
    })

    const request = {
      source_property_id: 'source-id',
      target_property_id: 'target-id',
      copy_mode: 'merge' as const,
    }

    result.current.mutate(request)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.post).toHaveBeenCalledWith({
      url: '/api/v1/pool-templates/copy',
      body: request,
    })
    expect(result.current.data).toEqual(mockResult)
  })

  it('handles copy errors', async () => {
    const error = new Error('Copy failed')
    vi.mocked(apiClient.post).mockRejectedValue(error)

    const { result } = renderHook(() => usePoolCopy(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      source_property_id: 'source-id',
      target_property_id: 'target-id',
      copy_mode: 'replace' as const,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual(error)
  })

  it('surfaces the backend error detail when present', async () => {
    // The backend returns a structured `detail` string on failures.
    vi.mocked(apiClient.post).mockResolvedValue({
      data: null,
      error: { detail: 'Target property already has pools configured' },
      response: { status: 409 } as Response,
    })

    const { result } = renderHook(() => usePoolCopy(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      source_property_id: 'source-id',
      target_property_id: 'target-id',
      copy_mode: 'merge' as const,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toBe(
      'Target property already has pools configured'
    )
    expect(result.current.error?.statusCode).toBe(409)
  })

  it('falls back to a generic message when no detail is provided', async () => {
    // Test the if (error) branch when the backend omits a usable detail.
    vi.mocked(apiClient.post).mockResolvedValue({
      data: null,
      error: { message: 'Validation failed' },
    })

    const { result } = renderHook(() => usePoolCopy(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      source_property_id: 'source-id',
      target_property_id: 'target-id',
      copy_mode: 'merge' as const,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toBe('Failed to copy pools')
    expect(result.current.error?.statusCode).toBe(0)
  })

  it('invalidates queries on successful copy', async () => {
    const mockResult = {
      pools_copied: 2,
      parent_pools_copied: 1,
      child_pools_copied: 1,
      pools_deleted: 0,
      copied_pools: [],
    }

    vi.mocked(apiClient.post).mockResolvedValue({ data: mockResult })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => usePoolCopy(), { wrapper })

    result.current.mutate({
      source_property_id: 'source-123',
      target_property_id: 'target-456',
      copy_mode: 'replace' as const,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Verify both source and target property queries are invalidated
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['expense-pools', 'byProperty', 'source-123'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['expense-pools', 'byProperty', 'target-456'],
    })
  })
})
