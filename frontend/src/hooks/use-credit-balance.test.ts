/**
 * Tests for useCreditBalance hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useCreditBalance } from './use-credit-balance'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-token',
            user: { id: 'mock-user-id' },
          },
        },
        error: null,
      }),
    },
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useCreditBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('fetches credit balance from API', async () => {
    const mockBalance = {
      total_purchased: 10,
      total_used: 3,
      total_remaining: 7,
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBalance,
    } as Response)

    const { result } = renderHook(() => useCreditBalance(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockBalance)
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/credits'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    )
  })

  it('returns undefined while loading', () => {
    vi.mocked(global.fetch).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { result } = renderHook(() => useCreditBalance(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('exposes creditBalanceKeys for query invalidation', async () => {
    const { creditBalanceKeys } = await import('./use-credit-balance')

    expect(creditBalanceKeys.all).toEqual(['credit-balance'])
  })
})
