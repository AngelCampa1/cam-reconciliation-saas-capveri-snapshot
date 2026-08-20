/**
 * Tests for use-stripe-portal hook
 *
 * Tests the Stripe Customer Portal integration hook.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useStripePortal } from './use-stripe-portal'

// Mock window.location.href
const mockLocationHref = vi.fn()
delete (window as any).location
window.location = { href: mockLocationHref } as any

describe('useStripePortal', () => {
  let queryClient: QueryClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    fetchSpy = vi.spyOn(global, 'fetch')
    mockLocationHref.mockClear()
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('creates portal session and redirects to Stripe URL', async () => {
    const mockPortalUrl = 'https://billing.stripe.com/session/test_123'

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: mockPortalUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useStripePortal(), { wrapper })

    expect(result.current.isPending).toBe(false)

    // Trigger the mutation
    result.current.mutate('http://localhost:3000/settings/billing')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Verify API call
    expect(fetchSpy).toHaveBeenCalled()
    const requestCall = fetchSpy.mock.calls[0][0] as Request
    expect(requestCall.url).toContain('/api/v1/billing/portal')
    expect(requestCall.url).toContain(
      'return_url=http%3A%2F%2Flocalhost%3A3000%2Fsettings%2Fbilling'
    )
    expect(requestCall.method).toBe('POST')

    // Verify redirect
    expect(window.location.href).toBe(mockPortalUrl)
  })

  it('handles error when portal session creation fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Internal Server Error', {
        status: 500,
      })
    )

    const { result } = renderHook(() => useStripePortal(), { wrapper })

    result.current.mutate('http://localhost:3000/settings/billing')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toEqual(
      new Error('Failed to create portal session')
    )

    // Should not redirect on error
    expect(mockLocationHref).not.toHaveBeenCalled()
  })

  it('handles network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useStripePortal(), { wrapper })

    result.current.mutate('http://localhost:3000/settings/billing')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toEqual(new Error('Network error'))
    expect(mockLocationHref).not.toHaveBeenCalled()
  })

  it('exposes loading state during portal session creation', async () => {
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({ url: 'https://billing.stripe.com/test' }),
                  {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  }
                )
              ),
            100
          )
        )
    )

    const { result } = renderHook(() => useStripePortal(), { wrapper })

    expect(result.current.isPending).toBe(false)

    result.current.mutate('http://localhost:3000/settings/billing')

    // Should show loading state immediately after mutation
    await waitFor(() => {
      expect(result.current.isPending).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.isPending).toBe(false)
  })

  it('accepts custom return URL', async () => {
    const customReturnUrl = 'http://localhost:3000/custom/path'

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://billing.stripe.com/test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => useStripePortal(), { wrapper })

    result.current.mutate(customReturnUrl)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(fetchSpy).toHaveBeenCalled()
    const requestCall = fetchSpy.mock.calls[0][0] as Request
    expect(requestCall.url).toContain('/api/v1/billing/portal')
    expect(requestCall.url).toContain(
      'return_url=http%3A%2F%2Flocalhost%3A3000%2Fcustom%2Fpath'
    )
    expect(requestCall.method).toBe('POST')
  })
})
