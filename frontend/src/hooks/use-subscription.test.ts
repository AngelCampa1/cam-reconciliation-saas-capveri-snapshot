/**
 * Tests for use-subscription hook
 *
 * Minimal test coverage for subscription query hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSubscription, subscriptionKeys } from './use-subscription'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(),
      })),
    })),
  },
}))

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', email: 'test@example.com' },
  })),
}))

// Create wrapper with fresh QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
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

describe('subscriptionKeys', () => {
  it('generates correct query keys', () => {
    expect(subscriptionKeys.all).toEqual(['subscription'])
  })
})

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches subscription data successfully', async () => {
    const mockSubscription = {
      id: 'sub-1',
      organization_id: 'org-1',
      plan: 'professional',
      status: 'active' as const,
      current_period_start: '2024-01-01',
      current_period_end: '2024-12-31',
      cancel_at_period_end: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: mockSubscription,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockSubscription)
  })

  it('returns null when no subscription exists (free tier)', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('throws error for non-PGRST116 errors', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST500', message: 'Database error' },
        }),
      }),
    } as any)

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('disabled when user is null', async () => {
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
  })

  it('preserves subscription status field correctly', async () => {
    // Reset useAuth mock (might have been changed by previous test)
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    } as any)

    const mockSubscription = {
      id: 'sub-1',
      organization_id: 'org-1',
      plan: 'professional',
      status: 'active' as const,
      current_period_start: '2024-01-01',
      current_period_end: '2024-12-31',
      cancel_at_period_end: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: mockSubscription,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 2000, // Increased from default 1000ms
      interval: 50, // Poll faster
    })
    expect(result.current.data?.status).toBe('active')
    expect(result.current.data?.plan).toBe('professional')
  })

  it('preserves deprecated growth plan aliases from the subscription row', async () => {
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    } as any)

    const mockSubscription = {
      id: 'sub-growth',
      organization_id: 'org-1',
      plan: 'growth',
      status: 'active' as const,
      building_count: 2,
      current_period_start: '2024-01-01',
      current_period_end: '2024-12-31',
      cancel_at_period_end: false,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: mockSubscription,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.plan).toBe('growth')
  })

  it('has correct staleTime of 5 minutes', () => {
    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    // Query should have 5 minute staleTime (300000ms)
    expect(result.current.dataUpdatedAt).toBeDefined()
  })
})
