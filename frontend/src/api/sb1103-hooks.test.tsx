import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import {
  useSB1103Requests,
  useCreateSB1103Request,
  useExportSB1103Request,
  type SB1103RequestCreateInput,
} from './hooks'
import * as client from './client'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient = createQueryClient()) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe('SB1103 Hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(client, 'getSession').mockResolvedValue({
      access_token: 'token-123',
    })
  })

  it('useSB1103Requests uses API base URL and auth header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], count: 0, has_more: false }),
    } as Response)

    const { result } = renderHook(() => useSB1103Requests('prop-123'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const expectedBase = import.meta.env.VITE_API_URL || ''
    expect(fetchMock).toHaveBeenCalledWith(
      `${expectedBase}/api/v1/compliance/sb1103?property_id=prop-123`,
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    )
  })

  it('useCreateSB1103Request posts to API base URL with auth header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'req-1' }),
    } as Response)

    const { result } = renderHook(() => useCreateSB1103Request(), {
      wrapper: createWrapper(),
    })

    const payload: SB1103RequestCreateInput = {
      property_id: 'prop-123',
      lease_id: 'lease-123',
      requested_by_name: 'Jane Smith',
      requested_by_email: 'jane@example.com',
      request_date: '2025-01-15',
      notes: 'Urgent request',
    }

    result.current.mutate(payload)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const expectedBase = import.meta.env.VITE_API_URL || ''
    expect(fetchMock).toHaveBeenCalledWith(
      `${expectedBase}/api/v1/compliance/sb1103`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('useExportSB1103Request invalidates the full SB1103 cache after export', async () => {
    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const createObjectUrl = vi.fn(() => 'blob:sb1103-export')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(new Blob(['pdf-bytes'], { type: 'application/pdf' }), {
        status: 200,
        headers: {
          'content-disposition': 'attachment; filename="SB1103_req-1.pdf"',
        },
      })
    )

    const { result } = renderHook(() => useExportSB1103Request(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate({ requestId: 'req-1', format: 'pdf' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const expectedBase = import.meta.env.VITE_API_URL || ''
    expect(fetchMock).toHaveBeenCalledWith(
      `${expectedBase}/api/v1/compliance/sb1103/req-1/export?format=pdf`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['sb1103'],
    })
    expect(createObjectUrl).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:sb1103-export')
  })
})
