/**
 * Tests for GL narrative analysis hooks.
 *
 * Focus: query-key isolation (F-036) — disabled instances must not collapse
 * to a shared static "disabled" sentinel key, which would let stale data
 * bleed across property/year contexts when re-enabled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useLatestGLAnalysis } from './useGLAnalysis'

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { apiClient } from '@/api/client'

describe('useLatestGLAnalysis', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('keys disabled instances by their real params, not a static sentinel (F-036)', () => {
    // Two disabled instances with different identifying params.
    renderHook(() => useLatestGLAnalysis('prop-a', undefined), { wrapper })
    renderHook(() => useLatestGLAnalysis('prop-b', undefined), { wrapper })

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)

    // No instance collapses to the old static 'disabled' sentinel.
    expect(keys.some((k) => JSON.stringify(k).includes('"disabled"'))).toBe(
      false
    )

    // Each disabled instance has a distinct cache entry that still carries
    // its real property id.
    expect(keys).toContainEqual(['gl-analysis', 'latest', 'prop-a', null])
    expect(keys).toContainEqual(['gl-analysis', 'latest', 'prop-b', null])

    // No fetch is performed while disabled.
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('reuses the same key whether disabled or enabled for the same params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: null,
      error: null,
      response: { status: 404 } as Response,
    } as never)

    // Disabled (missing year) then enabled — same property id.
    const { rerender, result } = renderHook(
      ({ year }: { year: number | undefined }) =>
        useLatestGLAnalysis('prop-a', year),
      { wrapper, initialProps: { year: undefined as number | undefined } }
    )

    // Disabled: no fetch.
    expect(apiClient.get).not.toHaveBeenCalled()

    rerender({ year: 2024 })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(apiClient.get).toHaveBeenCalledWith({
      url: '/api/v1/analysis/gl-narrative/prop-a/2024',
    })
  })
})
