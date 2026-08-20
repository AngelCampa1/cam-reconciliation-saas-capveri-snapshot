/**
 * F-133 regression: settings-area hooks must NOT escalate first-load query
 * failures to the global React ErrorBoundary.
 *
 * The production QueryClient (main.tsx) uses:
 *   throwOnError: (_error, query) => query.state.data === undefined
 * which re-throws during render for any query whose first load fails with no
 * cached data — white-screening the entire app.
 *
 * Each hook targeted by F-133 opts out with an explicit `throwOnError: false`
 * so the error stays contained as query state and the page can render its own
 * inline error/empty state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// Auth + Supabase mocks shared across all tests in this file
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-abc' } }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue(new Error('DB error')),
      single: vi.fn().mockRejectedValue(new Error('DB error')),
    }),
  },
}))

vi.mock('@/api/authFetch', () => ({
  authenticatedFetch: vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ detail: 'Unauthorized' }),
  }),
}))

// ---------------------------------------------------------------------------
// QueryClient factories
// ---------------------------------------------------------------------------

/** Plain client — no global throwOnError. Used for baseline success checks. */
const createWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

/**
 * Replicates the production global default from main.tsx.
 * An unguarded hook would throw during render here (data === undefined on
 * first failure), escalating to the ErrorBoundary.
 */
const createWrapperWithGlobalThrow = () => {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: (_error: unknown, query: { state: { data: unknown } }) =>
          query.state.data === undefined,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

// ---------------------------------------------------------------------------
// useSubscription — F-133 fail-open
// ---------------------------------------------------------------------------

describe('useSubscription (F-133)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('stays contained as isError when first-load fails under the production global throwOnError', async () => {
    const { useSubscription } = await import('./use-subscription')

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapperWithGlobalThrow(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    // Must NOT have thrown — renderHook would have thrown if the hook escalated.
    expect(result.current.data).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// useOrganization — F-133 fail-open
// ---------------------------------------------------------------------------

describe('useOrganization (F-133)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('stays contained as isError when first-load fails under the production global throwOnError', async () => {
    const { useOrganization } = await import('./use-organization')

    const { result } = renderHook(() => useOrganization(), {
      wrapper: createWrapperWithGlobalThrow(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.data).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// useFeatureUsage — F-133 fail-open
// ---------------------------------------------------------------------------

describe('useFeatureUsage (F-133)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('stays contained as isError when fetch returns 401 on first load', async () => {
    const { useFeatureUsage } = await import('./use-feature-usage')

    const { result } = renderHook(() => useFeatureUsage(), {
      wrapper: createWrapperWithGlobalThrow(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.data).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// useInvoices — F-133 fail-open
// ---------------------------------------------------------------------------

describe('useInvoices (F-133)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: 'Unauthorized' }),
    } as Response)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('stays contained as isError when fetch returns 401 on first load', async () => {
    const { useInvoices } = await import('./use-invoices')

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapperWithGlobalThrow(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.data).toBeUndefined()
  })
})
