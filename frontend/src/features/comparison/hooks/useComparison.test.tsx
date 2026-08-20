/**
 * Tests for the Module B comparison React Query hooks.
 *
 * The comparison API client (`@/api/comparison`) is mocked at the module
 * boundary so we can assert routing (explicit vs default endpoint), error
 * surfacing as ApiError, run-list invalidation, and the `enabled` gating on the
 * two query hooks. The real ApiError class from `@/api/client` is used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import type {
  ComparisonResult,
  StoredComparisonRun,
  StoredComparisonRunSummary,
} from '@/api/comparison'
import {
  comparisonKeys,
  useRunComparison,
  useSaveComparisonRun,
  useComparisonRuns,
  useComparisonRun,
} from './useComparison'
import {
  compareExplicitCharges,
  createComparisonRun,
  getComparison,
  listComparisonRuns,
  getComparisonRun,
} from '@/api/comparison'

vi.mock('@/api/comparison', () => ({
  compareExplicitCharges: vi.fn(),
  createComparisonRun: vi.fn(),
  getComparison: vi.fn(),
  listComparisonRuns: vi.fn(),
  getComparisonRun: vi.fn(),
}))

function createWrapper(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
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

const sampleResult: ComparisonResult = {
  property_id: 'prop-1',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  tolerance: '0.01',
  tenants: [],
  total_capveri_correct: '1000.00',
  total_actual_charged: '1100.00',
  total_net_variance: '100.00',
  total_overcharge: '100.00',
  total_undercharge: '0.00',
  overcharge_count: 1,
  undercharge_count: 0,
  match_count: 0,
}

const sampleRun: StoredComparisonRun = {
  id: 'run-1',
  property_id: 'prop-1',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  tolerance: '0.01',
  source: 'actual_billed',
  total_capveri_correct: '1000.00',
  total_actual_charged: '1100.00',
  total_net_variance: '100.00',
  total_overcharge: '100.00',
  total_undercharge: '0.00',
  overcharge_count: 1,
  undercharge_count: 0,
  match_count: 0,
  created_by: 'user-1',
  created_at: '2024-06-01T00:00:00Z',
  findings: [],
}

const sampleSummary: StoredComparisonRunSummary = {
  id: 'run-1',
  property_id: 'prop-1',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  tolerance: '0.01',
  source: 'actual_billed',
  total_capveri_correct: '1000.00',
  total_actual_charged: '1100.00',
  total_net_variance: '100.00',
  total_overcharge: '100.00',
  total_undercharge: '0.00',
  overcharge_count: 1,
  undercharge_count: 0,
  match_count: 0,
  created_by: 'user-1',
  created_at: '2024-06-01T00:00:00Z',
}

describe('comparisonKeys', () => {
  it('builds stable query keys', () => {
    expect(comparisonKeys.all).toEqual(['comparison'])
    expect(comparisonKeys.runs('prop-1')).toEqual([
      'comparison',
      'runs',
      'prop-1',
    ])
    expect(comparisonKeys.run('run-1')).toEqual(['comparison', 'run', 'run-1'])
  })
})

describe('useRunComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes to the default (actual-billed) endpoint when charges is omitted', async () => {
    vi.mocked(getComparison).mockResolvedValue({ data: sampleResult } as never)

    const { result } = renderHook(() => useRunComparison(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      propertyId: 'prop-1',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(getComparison).toHaveBeenCalledTimes(1)
    expect(compareExplicitCharges).not.toHaveBeenCalled()
    expect(result.current.data).toEqual(sampleResult)
  })

  it('routes to the explicit endpoint when charges is supplied', async () => {
    vi.mocked(compareExplicitCharges).mockResolvedValue({
      data: sampleResult,
    } as never)

    const { result } = renderHook(() => useRunComparison(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      propertyId: 'prop-1',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      charges: [{ tenant_name: 'Acme', amount: '1100.00' }],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(compareExplicitCharges).toHaveBeenCalledTimes(1)
    expect(getComparison).not.toHaveBeenCalled()
    const callArg = vi.mocked(compareExplicitCharges).mock.calls[0][0]
    expect(callArg.body.charges).toEqual([
      { tenant_name: 'Acme', amount: '1100.00' },
    ])
  })

  it('rejects with the ApiError returned in { error }', async () => {
    vi.mocked(getComparison).mockResolvedValue({
      data: undefined,
      error: new ApiError('Period invalid', 422),
    } as never)

    const { result } = renderHook(() => useRunComparison(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      propertyId: 'prop-1',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.message).toBe('Period invalid')
    expect(result.current.error?.statusCode).toBe(422)
  })

  it('falls back to a generic ApiError when error is not an ApiError', async () => {
    vi.mocked(compareExplicitCharges).mockResolvedValue({
      data: undefined,
      error: { detail: 'raw' },
    } as never)

    const { result } = renderHook(() => useRunComparison(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      propertyId: 'prop-1',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      charges: [],
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.message).toBe('Failed to run comparison')
    expect(result.current.error?.statusCode).toBe(500)
  })
})

describe('useSaveComparisonRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves and invalidates the run list for the property', async () => {
    vi.mocked(createComparisonRun).mockResolvedValue({
      data: sampleRun,
    } as never)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useSaveComparisonRun(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate({
      propertyId: 'prop-1',
      body: {
        period_start: '2024-01-01',
        period_end: '2024-12-31',
        charges: null,
      },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: comparisonKeys.runs('prop-1'),
    })
  })

  it('surfaces the backend ApiError on failure', async () => {
    vi.mocked(createComparisonRun).mockResolvedValue({
      data: undefined,
      error: new ApiError('Save blocked', 403),
    } as never)

    const { result } = renderHook(() => useSaveComparisonRun(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({
      propertyId: 'prop-1',
      body: { period_start: '2024-01-01', period_end: '2024-12-31' },
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.statusCode).toBe(403)
  })
})

describe('useComparisonRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads runs when enabled and a property is present', async () => {
    vi.mocked(listComparisonRuns).mockResolvedValue({
      data: [sampleSummary],
    } as never)

    const { result } = renderHook(() => useComparisonRuns('prop-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([sampleSummary])
    expect(listComparisonRuns).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when enabled is false', () => {
    vi.mocked(listComparisonRuns).mockResolvedValue({
      data: [sampleSummary],
    } as never)

    const { result } = renderHook(() => useComparisonRuns('prop-1', false), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(listComparisonRuns).not.toHaveBeenCalled()
  })

  it('does not fetch when the property id is empty', () => {
    const { result } = renderHook(() => useComparisonRuns(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(listComparisonRuns).not.toHaveBeenCalled()
  })
})

describe('useComparisonRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a single run when enabled and a run id is present', async () => {
    vi.mocked(getComparisonRun).mockResolvedValue({ data: sampleRun } as never)

    const { result } = renderHook(() => useComparisonRun('run-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(sampleRun)
  })

  it('does not fetch when the run id is empty', () => {
    const { result } = renderHook(() => useComparisonRun(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(getComparisonRun).not.toHaveBeenCalled()
  })
})
