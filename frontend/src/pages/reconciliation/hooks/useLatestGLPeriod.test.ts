/**
 * Tests for useLatestGLPeriod hook
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useLatestGLPeriod } from './useLatestGLPeriod'
import { getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet } from '@/api/generated/sdk.gen'

vi.mock('@/api/generated/sdk.gen', () => ({
  getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet: vi.fn(),
}))

const mockGetGlDateRange = vi.mocked(
  getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet
)

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe('useLatestGLPeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the GL primary year from the endpoint', async () => {
    mockGetGlDateRange.mockResolvedValue({
      data: { min_date: '2023-01-01', max_date: '2023-12-31', year: 2023 },
      error: undefined,
    } as never)

    const { result } = renderHook(() => useLatestGLPeriod('property-123'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(2023)
    expect(mockGetGlDateRange).toHaveBeenCalledWith(
      expect.objectContaining({ path: { property_id: 'property-123' } })
    )
  })

  it('returns null when the property has no GL entries (404 error)', async () => {
    mockGetGlDateRange.mockResolvedValue({
      data: undefined,
      error: { detail: 'No GL entries found for this property' },
    } as never)

    const { result } = renderHook(() => useLatestGLPeriod('property-empty'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('returns null when the request throws (network failure)', async () => {
    mockGetGlDateRange.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useLatestGLPeriod('property-net'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('returns null when year is not a finite number', async () => {
    mockGetGlDateRange.mockResolvedValue({
      data: { min_date: '2023-01-01', max_date: '2023-12-31', year: null },
      error: undefined,
    } as never)

    const { result } = renderHook(() => useLatestGLPeriod('property-bad'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('does not fetch when propertyId is empty', () => {
    const { result } = renderHook(() => useLatestGLPeriod(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGetGlDateRange).not.toHaveBeenCalled()
  })

  it('uses property ID in query key for cache isolation', async () => {
    mockGetGlDateRange.mockResolvedValue({
      data: { min_date: '2022-01-01', max_date: '2022-12-31', year: 2022 },
      error: undefined,
    } as never)

    const { result: result1 } = renderHook(
      () => useLatestGLPeriod('property-1'),
      { wrapper: createWrapper() }
    )
    const { result: result2 } = renderHook(
      () => useLatestGLPeriod('property-2'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true)
      expect(result2.current.isSuccess).toBe(true)
    })

    expect(result1.current.data).toBe(2022)
    expect(result2.current.data).toBe(2022)
  })
})
