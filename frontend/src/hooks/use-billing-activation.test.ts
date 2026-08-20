import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockAuth: { user: { id: string }; userRole: string | null } = {
  user: { id: 'user-123' },
  userRole: null,
}
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-token',
          },
        },
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

// Replicates the production QueryClient default in main.tsx, which escalates
// first-load errors (no cached data) to the ErrorBoundary. Used to prove the
// hook opts out so a failed billing call cannot white-screen the whole app.
const createWrapperWithGlobalThrow = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: (_error: unknown, query: { state: { data: unknown } }) =>
          query.state.data === undefined,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useBillingActivation', () => {
  let originalLocation: Location

  beforeEach(() => {
    // Default to a landlord role so the query is enabled; the tenant-guard
    // test overrides this. A null/unknown role also disables the query.
    mockAuth.userRole = 'owner'
    originalLocation = window.location
    vi.stubEnv('VITE_API_URL', '')
    delete (window as Window & typeof globalThis).location
    window.location = {
      ...originalLocation,
      hostname: 'app.capveri.com',
    } as Location
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        plan_id: null,
        billing_period: null,
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: true,
        has_active_access: false,
        has_paused_subscription: false,
        subscription_status: null,
      }),
    } as Response)
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('fetches billing activation from the production API origin on app.capveri.com', async () => {
    const { useBillingActivation } = await import('./use-billing-activation')

    const { result } = renderHook(() => useBillingActivation(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.capveri.com/api/v1/billing/plan-selection',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer mock-token',
        },
      })
    )
  })

  it('returns trial_days_remaining from the API response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        plan_id: null,
        billing_period: null,
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: false,
        has_active_access: true,
        has_paused_subscription: false,
        subscription_status: 'trialing',
        trial_days_remaining: 12,
      }),
    } as Response)

    const { useBillingActivation } = await import('./use-billing-activation')

    const { result } = renderHook(() => useBillingActivation(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.trial_days_remaining).toBe(12)
    expect(result.current.data?.subscription_status).toBe('trialing')
  })

  it('returns null trial_days_remaining for active paid subscriptions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        plan_id: 'defend_v2',
        billing_period: 'annual',
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: false,
        has_active_access: true,
        has_paused_subscription: false,
        subscription_status: 'active',
        trial_days_remaining: null,
      }),
    } as Response)

    const { useBillingActivation } = await import('./use-billing-activation')

    const { result } = renderHook(() => useBillingActivation(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.trial_days_remaining).toBeNull()
  })

  it('never queries billing for a tenant role (regression: tenant 403 on landlord routes)', async () => {
    mockAuth.userRole = 'tenant'

    const { useBillingActivation } = await import('./use-billing-activation')

    const { result } = renderHook(() => useBillingActivation(), {
      wrapper: createWrapper(),
    })

    // Query is disabled for tenants: it stays idle and never hits the API.
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle')
    })
    expect(result.current.data).toBeUndefined()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not escalate a failed first-load response to the error boundary (regression: app white-screen)', async () => {
    // Simulate a transient billing failure (e.g. clock-skew 401) on first load.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Unauthorized' }),
    } as Response)

    const { useBillingActivation } = await import('./use-billing-activation')

    // Under the production global default, an unguarded query would throw
    // during render here (data === undefined). With the hook's explicit
    // throwOnError:false, renderHook must NOT throw and the error stays
    // contained as query state.
    const { result } = renderHook(() => useBillingActivation(), {
      wrapper: createWrapperWithGlobalThrow(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.data).toBeUndefined()
  })
})
