/**
 * Tests for use-organization hook
 *
 * Minimal test coverage for organization query and mutation hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useOrganization,
  useUpdateOrganization,
  organizationKeys,
} from './use-organization'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(),
      })),
      update: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
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

describe('organizationKeys', () => {
  it('generates correct query keys', () => {
    expect(organizationKeys.all).toEqual(['organization'])
    expect(organizationKeys.detail()).toEqual(['organization', 'detail'])
  })
})

describe('useOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches organization data successfully', async () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Test Organization',
      subscription_status: 'active',
      settings: {
        timezone: 'UTC',
        default_currency: 'USD',
        fiscal_year_end_month: 12,
      },
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: mockOrg,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockOrg)
  })

  it('returns null when no organization exists (PGRST116)', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' },
        }),
      }),
    } as any)

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('throws error for non-PGRST116 errors', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST500', message: 'Database error' },
        }),
      }),
    } as any)

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('disabled when user is null', async () => {
    const { useAuth } = await import('@/hooks/useAuth')
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapper(),
    })

    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
  })
})

describe('useUpdateOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates organization successfully', async () => {
    const mockUpdatedOrg = {
      id: 'org-1',
      name: 'Updated Organization',
      subscription_status: 'active',
      settings: {},
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    }

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockUpdatedOrg,
            error: null,
          }),
        }),
      }),
    } as any)

    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ name: 'Updated Organization' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockUpdatedOrg)
  })

  it('updates cache on success', async () => {
    const mockUpdatedOrg = {
      id: 'org-1',
      name: 'Updated Organization',
      subscription_status: 'active',
      settings: {},
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    }

    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockUpdatedOrg,
            error: null,
          }),
        }),
      }),
    } as any)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData')

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )

    const { result } = renderHook(() => useUpdateOrganization(), { wrapper })

    result.current.mutate({ name: 'Updated Organization' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      organizationKeys.detail(),
      mockUpdatedOrg
    )
  })

  it('throws error on update failure', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Update failed' },
          }),
        }),
      }),
    } as any)

    const { result } = renderHook(() => useUpdateOrganization(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ name: 'Updated Organization' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })
})
