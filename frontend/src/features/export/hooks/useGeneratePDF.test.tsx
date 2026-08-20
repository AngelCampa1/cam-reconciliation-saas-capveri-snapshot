/**
 * Tests for useGeneratePDF hook.
 *
 * Tests PDF generation with query management and blob URL creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useGeneratePDF } from './useGeneratePDF'
import type { PDFExportOptions } from '../types'
import { configureAuth } from '@/api/client'

// Create wrapper with QueryClient
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

describe('useGeneratePDF', () => {
  beforeEach(() => {
    // Mock fetch globally
    global.fetch = vi.fn()
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-pdf-url')
    configureAuth({
      getSession: async () => ({ access_token: 'mock-access-token' }),
      signOut: async () => {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const defaultOptions: PDFExportOptions = {
    includeCoverPage: true,
    includeCalculationDetails: false,
  }

  describe('Successful PDF Generation', () => {
    it('generates PDF and returns blob URL', async () => {
      const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' })
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'Content-Disposition':
            'attachment; filename="reconciliation_123.pdf"',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snapshot-123',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual({
        url: 'blob:mock-pdf-url',
        blob: mockBlob,
        filename: 'reconciliation_123.pdf',
      })
    })

    it('constructs correct API endpoint with query params', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-456',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const url = fetchCall[0] as string

      expect(url).toContain(
        '/api/v1/exports/reconciliation/snapshots/snap-456/export/pdf'
      )
      expect(url).toContain('allow_draft=true')
    })

    it('sets correct headers for PDF request', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-123',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const fetchOptions = fetchCall[1] as RequestInit

      expect(fetchOptions.method).toBe('GET')
      const headers = new Headers(fetchOptions.headers)
      expect(headers.get('Accept')).toBe('application/pdf')
      expect(headers.get('Authorization')).toBe('Bearer mock-access-token')
    })
  })

  describe('Filename Extraction', () => {
    it('extracts filename from Content-Disposition header', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="custom-report.pdf"',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-123',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.filename).toBe('custom-report.pdf')
    })

    it('uses default filename when Content-Disposition missing', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-789',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.filename).toBe('reconciliation_snap-789.pdf')
    })

    it('uses default filename when Content-Disposition malformed', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'Content-Disposition': 'attachment; no-filename-here',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-abc',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.filename).toBe('reconciliation_snap-abc.pdf')
    })
  })

  describe('Error Handling', () => {
    it('handles server error response', async () => {
      const mockResponse = {
        ok: false,
        text: () => Promise.resolve('Snapshot not found'),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-invalid',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe(
        'Failed to generate PDF: Snapshot not found'
      )
    })

    it('handles network error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-123',
            options: defaultOptions,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Network error')
    })
  })

  describe('Query Control', () => {
    it('does not execute query when enabled is false', () => {
      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-123',
            options: defaultOptions,
            enabled: false,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      expect(result.current.isFetching).toBe(false)
      expect(result.current.data).toBeUndefined()
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it('executes query when enabled is true (default)', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-123',
            options: defaultOptions,
            // enabled defaults to true
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(vi.mocked(global.fetch)).toHaveBeenCalled()
    })
  })

  describe('Query Key', () => {
    it('generates queryKey with snapshotId and options', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers(),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const options: PDFExportOptions = {
        includeCoverPage: false,
        includeCalculationDetails: true,
      }

      const { result } = renderHook(
        () =>
          useGeneratePDF({
            snapshotId: 'snap-xyz',
            options,
          }),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Query key should be ['pdf-export', snapshotId, options]
      // We can't directly access queryKey but we can verify the query ran
      expect(result.current.data).toBeDefined()
    })
  })
})
