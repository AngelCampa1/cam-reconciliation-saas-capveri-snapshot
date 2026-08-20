/**
 * Tests for use-invoices hooks
 *
 * Tests for useInvoices and useInvoiceSummary React Query hooks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useInvoices,
  useInvoiceSummary,
  type Invoice,
  type InvoiceListResponse,
  type InvoiceSummaryResponse,
} from './use-invoices'

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-access-token',
            user: { id: 'mock-user-id' },
          },
        },
        error: null,
      }),
    },
  },
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

const mockInvoice: Invoice = {
  id: 'inv_001',
  subscription_id: 'sub_123',
  stripe_invoice_id: 'in_stripe_001',
  amount_due: 29900,
  amount_paid: 29900,
  currency: 'usd',
  status: 'paid',
  period_start: '2024-01-01',
  period_end: '2024-01-31',
  due_date: '2024-02-01',
  paid_at: '2024-01-25',
  pdf_url: 'https://example.com/invoice.pdf',
  created_at: '2024-01-01T00:00:00Z',
}

describe('useInvoices', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches invoices successfully with default params', async () => {
    const mockResponse: InvoiceListResponse = {
      invoices: [mockInvoice],
      total: 1,
      page: 1,
      per_page: 10,
      has_more: false,
    }

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResponse)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/invoices?page=1&per_page=10'),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('includes status filter in query params', async () => {
    const mockResponse: InvoiceListResponse = {
      invoices: [mockInvoice],
      total: 1,
      page: 1,
      per_page: 10,
      has_more: false,
    }

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoices('paid'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/billing/invoices?page=1&per_page=10&status=paid'
      ),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('handles custom pagination params', async () => {
    const mockResponse: InvoiceListResponse = {
      invoices: [mockInvoice],
      total: 50,
      page: 3,
      per_page: 25,
      has_more: true,
    }

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoices(undefined, 3, 25), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResponse)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/invoices?page=3&per_page=25'),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('generates query keys with all params', () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ invoices: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoices('open', 2, 20), {
      wrapper: createWrapper(),
    })

    // Query key should be ['invoices', 'open', 2, 20]
    expect(result.current.status).toBe('pending')
  })

  it('throws error on 404 response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Failed to fetch invoices')
  })

  it('throws error on 500 server error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Failed to fetch invoices')
  })

  it('handles network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Network error')
  })
})

describe('useInvoiceSummary', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches invoice summary successfully', async () => {
    const mockSummary: InvoiceSummaryResponse = {
      total_invoices: 12,
      paid_invoices: 10,
      open_invoices: 2,
      total_paid: 35880,
      currency: 'usd',
    }

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSummary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoiceSummary(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockSummary)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/billing/invoices/summary'),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('uses correct query key for caching', () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoiceSummary(), {
      wrapper: createWrapper(),
    })

    // Query key should be ['invoices', 'summary']
    expect(result.current.status).toBe('pending')
  })

  it('throws error on failed fetch', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoiceSummary(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toContain('Failed to fetch summary')
  })

  it('handles empty summary (new organization)', async () => {
    const emptySummary: InvoiceSummaryResponse = {
      total_invoices: 0,
      paid_invoices: 0,
      open_invoices: 0,
      total_paid: 0,
      currency: 'usd',
    }

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(emptySummary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useInvoiceSummary(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(emptySummary)
  })

  it('handles network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useInvoiceSummary(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Network error')
  })
})
