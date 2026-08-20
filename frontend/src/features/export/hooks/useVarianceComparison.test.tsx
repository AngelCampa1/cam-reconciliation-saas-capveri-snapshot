import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  useVarianceComparison,
  VarianceComparisonError,
} from './useVarianceComparison'
import { apiClient } from '@/api/client'

vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useVarianceComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls year-over-year endpoint with property/year contract', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        property_id: 'prop-1',
        property_name: 'Property A',
        years: [2023, 2024],
        base_year: 2023,
        pool_comparisons: [],
        total_amounts: { 2023: 100, 2024: 120 },
        total_variance_amount: 20,
        total_variance_percent: 20,
      },
      error: null,
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2023, 2024],
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiClient.post).toHaveBeenCalledWith({
      url: '/api/v1/analysis/year-over-year',
      body: {
        property_id: 'prop-1',
        years: [2023, 2024],
        use_fuzzy_matching: true,
      },
    })
  })

  it('maps backend model into variance report shape', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        property_id: 'prop-1',
        property_name: 'Property A',
        years: [2023, 2024],
        base_year: 2023,
        pool_comparisons: [
          {
            pool_name: 'Utilities',
            amounts: { 2023: 100, 2024: 120 },
            variance_amount: 20,
            variance_percent: 20,
          },
        ],
        total_amounts: { 2023: 100, 2024: 120 },
        total_variance_amount: 20,
        total_variance_percent: 20,
      },
      error: null,
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2023, 2024],
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.priorPeriod).toBe('2023')
    expect(result.current.data?.currentPeriod).toBe('2024')
    expect(result.current.data?.items[0]?.poolName).toBe('Utilities')
  })

  it('flags items and total as "new" when the prior year had no amount', async () => {
    // Prior year (2023) has no GL/pool data, so every base amount is absent.
    // The backend leaves variance_percent null and (for the total) null, which
    // must surface as "New", not a misleading +0.00%.
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        property_id: 'prop-1',
        property_name: 'Property A',
        years: [2023, 2024],
        base_year: 2023,
        pool_comparisons: [
          {
            pool_name: 'Operating Expenses',
            amounts: { 2024: 63900 },
            variance_amount: null,
            variance_percent: null,
          },
        ],
        total_amounts: { 2023: 0, 2024: 836300 },
        total_variance_amount: 836300,
        total_variance_percent: null,
      },
      error: null,
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2023, 2024],
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const item = result.current.data?.items[0]
    expect(item?.isNew).toBe(true)
    expect(item?.varianceType).toBe('new')
    // Amount still falls back to current - prior so the row is not blank.
    expect(item?.varianceAmount).toBe(63900)
    expect(result.current.data?.isTotalNew).toBe(true)
    expect(result.current.data?.totalVarianceAmount).toBe(836300)
  })

  it('does not run when fewer than 2 years are provided', () => {
    renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2024],
        }),
      { wrapper: createWrapper() }
    )

    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('keeps errors local even under the global throwOnError default', async () => {
    // Mirror the app-wide queryClient default (main.tsx), which escalates
    // first-load errors to the nearest ErrorBoundary. The hook must opt out so
    // a failure inside the Export modal's Variance tab does not crash the page.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          throwOnError: (_error, query) => query.state.data === undefined,
        },
      },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    vi.mocked(apiClient.post).mockResolvedValue({
      data: null,
      error: { message: 'bad request' },
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2023, 2024],
        }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(
      'Failed to fetch variance comparison'
    )
  })

  it('returns query error when apiClient returns error', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: null,
      error: { message: 'bad request' },
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2023, 2024],
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(
      'Failed to fetch variance comparison'
    )
  })

  it('flags a benign "nothing to compare" 400 as isNothingToCompare', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: null,
      error: {
        statusCode: 400,
        message: 'No finalized snapshots found for years: 2024',
      },
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2024, 2025],
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    const error = result.current.error
    expect(error).toBeInstanceOf(VarianceComparisonError)
    expect((error as VarianceComparisonError).isNothingToCompare).toBe(true)
  })

  it('treats a genuine failure as not "nothing to compare"', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: null,
      error: { statusCode: 500, message: 'Internal Server Error' },
    } as never)

    const { result } = renderHook(
      () =>
        useVarianceComparison({
          propertyId: 'prop-1',
          years: [2024, 2025],
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    const error = result.current.error
    expect(error).toBeInstanceOf(VarianceComparisonError)
    expect((error as VarianceComparisonError).isNothingToCompare).toBe(false)
  })
})
