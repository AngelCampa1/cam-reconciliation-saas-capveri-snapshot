/**
 * Tests for use-organization-usage hook
 *
 * Minimal test coverage for organization usage query hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useOrganizationUsage, usageKeys } from './use-organization-usage'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const mockSelect = vi.fn()
      if (table === 'properties') {
        mockSelect.mockResolvedValue({ count: 5, error: null })
      } else if (table === 'users') {
        mockSelect.mockResolvedValue({ count: 3, error: null })
      } else if (table === 'subscriptions') {
        mockSelect.mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { plan: 'professional', unit_count: 120 },
            error: null,
          }),
        })
      }
      return { select: mockSelect }
    }),
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

describe('usageKeys', () => {
  it('generates correct query keys', () => {
    expect(usageKeys.all).toEqual(['organization-usage'])
  })
})

describe('useOrganizationUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches usage data successfully', async () => {
    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      propertiesUsed: 5,
      propertiesLimit: -1,
      unitsUsed: 0,
      unitsLimit: 120,
      usersUsed: 3,
      usersLimit: -1,
    })
  })

  it('handles free tier when no subscription exists', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockResolvedValue({ count: 1, error: null }),
        } as any
      } else if (table === 'users') {
        return {
          select: vi.fn().mockResolvedValue({ count: 1, error: null }),
        } as any
      } else if (table === 'subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      propertiesUsed: 1,
      propertiesLimit: 1, // free plan
      unitsUsed: 0,
      unitsLimit: 1, // free plan
      usersUsed: 1,
      usersLimit: 1, // free plan
    })
  })

  it('calculates correct limits for essentials plan', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockResolvedValue({ count: 5, error: null }),
        } as any
      } else if (table === 'users') {
        return {
          select: vi.fn().mockResolvedValue({ count: 2, error: null }),
        } as any
      } else if (table === 'subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { plan: 'essentials', unit_count: 50 },
              error: null,
            }),
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.propertiesLimit).toBe(-1)
    expect(result.current.data?.unitsLimit).toBe(50)
    expect(result.current.data?.usersLimit).toBe(-1)
  })

  it('calculates correct limits for growth plan (deprecated alias)', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockResolvedValue({ count: 50, error: null }),
        } as any
      } else if (table === 'users') {
        return {
          select: vi.fn().mockResolvedValue({ count: 20, error: null }),
        } as any
      } else if (table === 'subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { plan: 'growth', unit_count: 120 },
              error: null,
            }),
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.propertiesLimit).toBe(-1)
    expect(result.current.data?.unitsLimit).toBe(120)
    expect(result.current.data?.usersLimit).toBe(-1)
  })

  it('throws error when user is not authenticated', async () => {
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
  })

  it('handles properties count error', async () => {
    // Reset useAuth mock (might have been changed by previous test)
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    } as any)

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockResolvedValue({
            count: null,
            error: { message: 'Count failed' },
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('handles users count error', async () => {
    // Reset useAuth mock (might have been changed by previous test)
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    } as any)

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockResolvedValue({ count: 5, error: null }),
        } as any
      } else if (table === 'users') {
        return {
          select: vi.fn().mockResolvedValue({
            count: null,
            error: { message: 'Count failed' },
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('handles subscription fetch non-PGRST116 error', async () => {
    // Reset useAuth mock (might have been changed by previous test)
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    } as any)

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'properties') {
        return {
          select: vi.fn().mockResolvedValue({ count: 5, error: null }),
        } as any
      } else if (table === 'users') {
        return {
          select: vi.fn().mockResolvedValue({ count: 3, error: null }),
        } as any
      } else if (table === 'subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST500', message: 'Database error' },
            }),
          }),
        } as any
      }
      return { select: vi.fn() } as any
    })

    const { result } = renderHook(() => useOrganizationUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })
})
