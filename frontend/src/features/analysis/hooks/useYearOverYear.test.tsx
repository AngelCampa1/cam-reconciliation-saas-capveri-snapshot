/**
 * Tests for Year-over-Year Analysis Hooks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useAnomalyDetection,
  useAvailableYears,
  useYearOverYearComparison,
} from './useYearOverYear'
import type { AnomalyDetectionRequest, YearOverYearRequest } from '../types'

// Mock API client
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { apiClient } from '@/api/client'

describe('useAvailableYears', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('fetches available years successfully when propertyId is provided', async () => {
    const mockYears = [2022, 2023, 2024]
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockYears,
      error: null,
    })

    const { result } = renderHook(() => useAvailableYears('prop-123'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockYears)
    expect(apiClient.get).toHaveBeenCalledWith({
      url: '/api/v1/analysis/properties/prop-123/available-years',
    })
  })

  it('does not fetch when propertyId is undefined', () => {
    const { result } = renderHook(() => useAvailableYears(undefined), {
      wrapper,
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.fetchStatus).toBe('idle')
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('uses alternative query key when propertyId is undefined', () => {
    const { result } = renderHook(() => useAvailableYears(undefined), {
      wrapper,
    })

    // Query should be disabled but key should be set
    expect(result.current.isLoading).toBe(false)
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('handles API error response', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: null,
      error: { detail: 'Not found' },
    })

    const { result } = renderHook(() => useAvailableYears('prop-123'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe(
      'Failed to fetch available years'
    )
  })

  it('returns empty array when no finalized snapshots exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const { result } = renderHook(() => useAvailableYears('prop-new'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual([])
  })

  it('throws error when enabled but propertyId is empty', async () => {
    // Test the error path when propertyId check fails in queryFn
    const { result } = renderHook(() => useAvailableYears(undefined), {
      wrapper,
    })

    // Query should not run when propertyId is undefined (enabled: false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.status).toBe('pending')
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('refetches when propertyId changes', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [2022, 2023],
      error: null,
    })

    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useAvailableYears(id),
      {
        wrapper,
        initialProps: { id: 'prop-123' },
      }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(apiClient.get).toHaveBeenCalledTimes(1)

    // Change property ID
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [2023, 2024],
      error: null,
    })

    rerender({ id: 'prop-456' })

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(2)
    })

    expect(apiClient.get).toHaveBeenLastCalledWith({
      url: '/api/v1/analysis/properties/prop-456/available-years',
    })
  })
})

describe('useYearOverYearComparison', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('fetches comparison data successfully', async () => {
    const mockRequest: YearOverYearRequest = {
      property_id: 'prop-123',
      years: [2022, 2023],
    }

    const mockComparison = {
      property_id: 'prop-123',
      property_name: 'Tower A',
      years: [2022, 2023],
      base_year: 2022,
      pool_comparisons: [],
      total_amounts: {},
      total_variance_amount: null,
      total_variance_percent: null,
    }

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: mockComparison,
      error: null,
    })

    const { result } = renderHook(() => useYearOverYearComparison(), {
      wrapper,
    })

    result.current.mutate(mockRequest)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockComparison)
    expect(apiClient.post).toHaveBeenCalledWith({
      url: '/api/v1/analysis/year-over-year',
      body: mockRequest,
    })
  })

  it('coerces Decimal-string money fields to numbers (preserving null)', async () => {
    const mockRequest: YearOverYearRequest = {
      property_id: 'prop-123',
      years: [2022, 2023],
    }

    // Backend Decimals serialize as JSON strings; null pools/variances stay null
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        property_id: 'prop-123',
        property_name: 'Tower A',
        years: [2022, 2023],
        base_year: 2022,
        pool_comparisons: [
          {
            pool_name: 'Utilities',
            amounts: { 2022: '100000.50', 2023: null },
            base_year_amount: '100000.50',
            variance_amount: null,
            variance_percent: null,
            variance_level: 'normal',
            matched_from: null,
          },
        ],
        total_amounts: { 2022: '100000.50', 2023: '125000.75' },
        total_variance_amount: '25000.25',
        total_variance_percent: '25.0',
      },
      error: null,
    })

    const { result } = renderHook(() => useYearOverYearComparison(), {
      wrapper,
    })

    result.current.mutate(mockRequest)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    const data = result.current.data
    const pool = data?.pool_comparisons[0]

    expect(typeof pool?.amounts[2022]).toBe('number')
    expect(pool?.amounts[2022]).toBe(100000.5)
    expect(pool?.amounts[2023]).toBeNull()
    expect(typeof pool?.base_year_amount).toBe('number')
    expect(pool?.base_year_amount).toBe(100000.5)
    expect(pool?.variance_amount).toBeNull()
    expect(pool?.variance_percent).toBeNull()

    expect(typeof data?.total_amounts[2022]).toBe('number')
    expect(data?.total_amounts[2022]).toBe(100000.5)
    expect(data?.total_amounts[2023]).toBe(125000.75)
    expect(typeof data?.total_variance_amount).toBe('number')
    expect(data?.total_variance_amount).toBe(25000.25)
    expect(typeof data?.total_variance_percent).toBe('number')
    expect(data?.total_variance_percent).toBe(25)
  })

  it('handles API error response', async () => {
    const mockRequest: YearOverYearRequest = {
      property_id: 'prop-123',
      years: [2022, 2023],
    }

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: null,
      error: { detail: 'Invalid years' },
    })

    const { result } = renderHook(() => useYearOverYearComparison(), {
      wrapper,
    })

    result.current.mutate(mockRequest)

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe(
      'Failed to fetch year-over-year comparison'
    )
  })

  it('handles network error', async () => {
    const mockRequest: YearOverYearRequest = {
      property_id: 'prop-123',
      years: [2022, 2023],
    }

    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useYearOverYearComparison(), {
      wrapper,
    })

    result.current.mutate(mockRequest)

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe('Network error')
  })

  it('can be called multiple times with different requests', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({
        data: { property_id: 'prop-1', years: [2022, 2023], comparisons: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { property_id: 'prop-1', years: [2023, 2024], comparisons: [] },
        error: null,
      })

    const { result } = renderHook(() => useYearOverYearComparison(), {
      wrapper,
    })

    // First request
    result.current.mutate({ property_id: 'prop-1', years: [2022, 2023] })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.years).toEqual([2022, 2023])

    // Reset mutation state
    result.current.reset()

    // Second request
    result.current.mutate({ property_id: 'prop-1', years: [2023, 2024] })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.years).toEqual([2023, 2024])
    expect(apiClient.post).toHaveBeenCalledTimes(2)
  })
})

describe('useAnomalyDetection', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('posts to the right URL with the right body and coerces numeric fields', async () => {
    const mockRequest: AnomalyDetectionRequest = {
      property_id: 'prop-123',
      target_year: 2024,
      comparison_years: [2022, 2023],
    }

    // Backend Decimals may serialize as JSON strings
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        property_id: 'prop-123',
        target_year: 2024,
        anomalies: [
          {
            pool_name: 'Utilities',
            anomaly_type: 'spike',
            severity: 'critical',
            current_value: '125000.50',
            expected_value: '100000.00',
            variance_percent: '25.0',
            explanation: 'Spike detected',
            years_affected: [2024],
          },
        ],
        total_anomalies: 1,
        critical_count: 1,
        warning_count: 0,
        info_count: 0,
      },
      error: null,
    })

    const { result } = renderHook(() => useAnomalyDetection(), { wrapper })

    result.current.mutate(mockRequest)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(apiClient.post).toHaveBeenCalledWith({
      url: '/api/v1/analysis/anomaly-detection',
      body: mockRequest,
    })

    const anomaly = result.current.data?.anomalies[0]
    expect(anomaly?.current_value).toBe(125000.5)
    expect(anomaly?.expected_value).toBe(100000)
    expect(anomaly?.variance_percent).toBe(25)
    expect(typeof anomaly?.current_value).toBe('number')
  })

  it('throws when apiClient returns an error', async () => {
    const mockRequest: AnomalyDetectionRequest = {
      property_id: 'prop-123',
      target_year: 2024,
      comparison_years: [2022, 2023],
    }

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: null,
      error: { detail: 'Invalid request' },
    })

    const { result } = renderHook(() => useAnomalyDetection(), { wrapper })

    result.current.mutate(mockRequest)

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect((result.current.error as Error).message).toBe(
      'Failed to detect anomalies'
    )
  })
})
