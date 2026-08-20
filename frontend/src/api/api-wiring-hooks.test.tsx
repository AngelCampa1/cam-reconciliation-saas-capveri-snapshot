import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import {
  useExportHistory,
  useTaxProtestDeadlines,
  useExportBatchPdf,
  type BatchPDFRequest,
} from './hooks'
import { ApiError } from './errors'
import * as client from './client'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
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

const expectedBase = import.meta.env.VITE_API_URL || ''

describe('API wiring hooks — error + timeout handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(client, 'getSession').mockResolvedValue({
      access_token: 'token-123',
    })
  })

  describe('F-115: FastAPI `detail` surfacing', () => {
    it('useExportHistory surfaces an array-shaped 422 detail as joined readable messages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['query', 'property_id'],
              msg: 'value is not a valid uuid',
              type: 'value_error.uuid',
            },
            {
              loc: ['query', 'format'],
              msg: 'unexpected value',
              type: 'value_error',
            },
          ],
        }),
      } as Response)

      const { result } = renderHook(() => useExportHistory('not-a-uuid'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.statusCode).toBe(422)
      expect(error.message).toBe('value is not a valid uuid; unexpected value')
      // Must NOT stringify to "[object Object]"
      expect(error.message).not.toContain('[object Object]')
      expect(error.errors).toHaveLength(2)
      expect(error.errors?.[0]?.msg).toBe('value is not a valid uuid')
    })

    it('useTaxProtestDeadlines surfaces a string detail unchanged', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Not authorized for this property' }),
      } as Response)

      const { result } = renderHook(() => useTaxProtestDeadlines(2025), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.statusCode).toBe(403)
      expect(error.message).toBe('Not authorized for this property')
      expect(error.errors).toBeUndefined()
    })

    it('useTaxProtestDeadlines falls back to a default message when detail is absent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response)

      const { result } = renderHook(() => useTaxProtestDeadlines(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error.statusCode).toBe(500)
      expect(error.message).toBe('Failed to fetch tax protest deadlines')
    })

    it('useTaxProtestDeadlines falls back to the default message for an empty-array detail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ detail: [] }),
      } as Response)

      const { result } = renderHook(() => useTaxProtestDeadlines(2025), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error.statusCode).toBe(422)
      expect(error.message).toBe('Failed to fetch tax protest deadlines')
      expect(error.errors).toBeUndefined()
    })

    it('useTaxProtestDeadlines falls back to the default message when the body is not JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON')
        },
      } as unknown as Response)

      const { result } = renderHook(() => useTaxProtestDeadlines(2025), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error.statusCode).toBe(502)
      expect(error.message).toBe('Failed to fetch tax protest deadlines')
    })

    it('useExportBatchPdf surfaces an array-shaped 422 detail as joined readable messages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ['body', 'tenant_ids', 0],
              msg: 'value is not a valid uuid',
              type: 'value_error.uuid',
            },
          ],
        }),
      } as Response)

      const { result } = renderHook(() => useExportBatchPdf(), {
        wrapper: createWrapper(),
      })

      const payload: BatchPDFRequest = {
        property_id: 'prop-123',
        year: 2025,
        tenant_ids: ['bad-id'],
      }
      result.current.mutate(payload)

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.statusCode).toBe(422)
      expect(error.message).toBe('value is not a valid uuid')
      expect(error.message).not.toContain('[object Object]')
      expect(error.errors).toHaveLength(1)
    })
  })

  describe('F-112: request timeout maps to a 408 ApiError', () => {
    it('useExportHistory maps a fetch TimeoutError to a 408 ApiError', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new DOMException('The operation timed out.', 'TimeoutError')
      )

      const { result } = renderHook(() => useExportHistory('prop-123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.statusCode).toBe(408)
      expect(error.message).toBe('Request timed out. Please try again.')
    })

    it('useExportBatchPdf maps a fetch TimeoutError to a 408 ApiError', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new DOMException('The operation timed out.', 'TimeoutError')
      )

      const { result } = renderHook(() => useExportBatchPdf(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        property_id: 'prop-123',
        year: 2025,
        tenant_ids: ['tenant-1'],
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const error = result.current.error as ApiError
      expect(error).toBeInstanceOf(ApiError)
      expect(error.statusCode).toBe(408)
      expect(error.message).toBe('Request timed out. Please try again.')
    })

    it('useExportHistory re-throws non-timeout fetch errors unchanged', async () => {
      const networkError = new TypeError('Failed to fetch')
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(networkError)

      const { result } = renderHook(() => useExportHistory('prop-123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBe(networkError)
    })
  })

  describe('happy path still uses API base URL + auth header', () => {
    it('useExportHistory issues an authorized GET to the export history endpoint', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], count: 0 }),
      } as Response)

      const { result } = renderHook(() => useExportHistory('prop-123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetchMock).toHaveBeenCalledWith(
        `${expectedBase}/api/v1/export/history?property_id=prop-123`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
          }),
        })
      )
    })
  })
})
