/**
 * Tests for use-payment-methods hook
 *
 * Minimal test coverage for payment methods query hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { usePaymentMethods } from './use-payment-methods'
import { listPaymentMethodsApiV1BillingPaymentMethodsGet } from '@/api/client'

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual('@/api/client')
  return {
    ...actual,
    apiClient: {},
    listPaymentMethodsApiV1BillingPaymentMethodsGet: vi.fn(),
  }
})

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

describe('usePaymentMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches payment methods successfully', async () => {
    const mockPaymentMethods = [
      {
        id: 'pm_1',
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2025,
        is_default: true,
      },
      {
        id: 'pm_2',
        brand: 'mastercard',
        last4: '5555',
        exp_month: 6,
        exp_year: 2026,
        is_default: false,
      },
    ]

    vi.mocked(
      listPaymentMethodsApiV1BillingPaymentMethodsGet
    ).mockResolvedValue({
      data: mockPaymentMethods as never,
      error: undefined,
      response: {} as Response,
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockPaymentMethods)
    expect(listPaymentMethodsApiV1BillingPaymentMethodsGet).toHaveBeenCalled()
  })

  it('handles empty payment methods (no cards on file)', async () => {
    vi.mocked(
      listPaymentMethodsApiV1BillingPaymentMethodsGet
    ).mockResolvedValue({
      data: [] as never,
      error: undefined,
      response: {} as Response,
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })

  it('uses correct query key for caching', () => {
    vi.mocked(
      listPaymentMethodsApiV1BillingPaymentMethodsGet
    ).mockResolvedValue({
      data: [] as never,
      error: undefined,
      response: {} as Response,
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    // Query key should be ['payment-methods']
    expect(result.current.status).toBe('pending')
  })

  it('throws error on API error', async () => {
    vi.mocked(
      listPaymentMethodsApiV1BillingPaymentMethodsGet
    ).mockResolvedValue({
      data: undefined,
      error: new Error('Unauthorized'),
      response: {} as Response,
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Unauthorized')
  })

  it('handles thrown network failure', async () => {
    vi.mocked(
      listPaymentMethodsApiV1BillingPaymentMethodsGet
    ).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Network error')
  })

  it('preserves payment method structure with all fields', async () => {
    const mockPaymentMethod = {
      id: 'pm_test123',
      brand: 'amex',
      last4: '0005',
      exp_month: 3,
      exp_year: 2027,
      is_default: true,
    }

    vi.mocked(
      listPaymentMethodsApiV1BillingPaymentMethodsGet
    ).mockResolvedValue({
      data: [mockPaymentMethod] as never,
      error: undefined,
      response: {} as Response,
    })

    const { result } = renderHook(() => usePaymentMethods(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([mockPaymentMethod])
    expect(result.current.data?.[0]).toHaveProperty('id')
    expect(result.current.data?.[0]).toHaveProperty('brand')
    expect(result.current.data?.[0]).toHaveProperty('last4')
    expect(result.current.data?.[0]).toHaveProperty('exp_month')
    expect(result.current.data?.[0]).toHaveProperty('exp_year')
    expect(result.current.data?.[0]).toHaveProperty('is_default')
  })
})
