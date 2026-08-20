/**
 * Tests for useBatchPDFExport hook.
 *
 * Tests batch PDF export with progress tracking, cancellation, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useBatchPDFExport } from './useBatchPDFExport'
import type { BatchPDFExportOptions } from '../types'
import { configureAuth } from '@/api/client'

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useBatchPDFExport', () => {
  beforeEach(() => {
    // Mock fetch globally
    global.fetch = vi.fn()
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    // Mock Date.now for time calculations
    vi.spyOn(Date, 'now').mockReturnValue(1000000)
    configureAuth({
      getSession: async () => ({ access_token: 'mock-access-token' }),
      signOut: async () => {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Initial State', () => {
    it('initializes with empty progress', () => {
      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      expect(result.current.progress).toEqual({
        completed: 0,
        total: 0,
      })
      expect(result.current.isPending).toBe(false)
    })
  })

  describe('Successful Export', () => {
    it('exports PDFs with progress tracking', async () => {
      const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' })
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="reconciliation.pdf"',
          'X-Total-Tenants': '3',
          'X-Completed-Tenants': '3',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snapshot-123',
        tenantIds: ['tenant-1', 'tenant-2', 'tenant-3'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: false,
      }

      act(() => {
        result.current.mutate(options)
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual({
        url: 'blob:mock-url',
        blob: mockBlob,
        filename: 'reconciliation.pdf',
      })
    })

    it('constructs correct API endpoint with query params', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '2',
          'X-Completed-Tenants': '2',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snapshot-456',
        tenantIds: ['t1', 't2'],
        mode: 'zip',
        includeCoverPage: false,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const url = fetchCall[0] as string

      expect(url).toContain(
        '/api/v1/exports/reconciliation/snapshots/snapshot-456/export/batch-pdf'
      )
      expect(url).toContain('mode=zip')
      expect(url).toContain('include_cover_page=false')
      expect(url).toContain('include_calculation_details=true')
      expect(url).toContain('tenant_ids=t1')
      expect(url).toContain('tenant_ids=t2')
    })

    it('extracts filename from Content-Disposition header', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'Content-Disposition':
            'attachment; filename="custom-export-2024.zip"',
          'X-Total-Tenants': '1',
          'X-Completed-Tenants': '1',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'zip',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.filename).toBe('custom-export-2024.zip')
    })

    it('generates default filename when Content-Disposition missing', async () => {
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(
        '2024-03-15T10:30:00.000Z'
      )

      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '1',
          'X-Completed-Tenants': '1',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.filename).toBe(
        'reconciliation-batch-2024-03-15.pdf'
      )
    })

    it('uses zip extension for zip mode in default filename', async () => {
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(
        '2024-03-15T10:30:00.000Z'
      )

      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '1',
          'X-Completed-Tenants': '1',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'zip',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.filename).toBe(
        'reconciliation-batch-2024-03-15.zip'
      )
    })
  })

  describe('Progress Tracking', () => {
    it('updates progress from response headers', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '5',
          'X-Completed-Tenants': '3',
          'X-Current-Tenant': 'Acme Corp',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1', 't2', 't3', 't4', 't5'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.progress.total).toBe(5)
      expect(result.current.progress.completed).toBe(5)
      expect(result.current.progress.currentTenant).toBe('Acme Corp')
    })

    it('calculates estimated time remaining when tenants completed', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '5',
          'X-Completed-Tenants': '3',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1', 't2', 't3', 't4', 't5'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Should calculate estimated time remaining
      // Formula: ((totalTenants - completedTenants) * elapsedTime) / completedTenants
      expect(result.current.progress.estimatedTimeRemaining).toBeDefined()
      expect(typeof result.current.progress.estimatedTimeRemaining).toBe(
        'number'
      )
      expect(
        result.current.progress.estimatedTimeRemaining
      ).toBeGreaterThanOrEqual(0)
    })

    it('does not calculate time remaining when no tenants completed', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '5',
          'X-Completed-Tenants': '0',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1', 't2', 't3', 't4', 't5'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.progress.estimatedTimeRemaining).toBeUndefined()
    })

    it('initializes progress with tenant count at start', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '3',
          'X-Completed-Tenants': '3',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1', 't2', 't3'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      // Check initial progress before mutation completes
      expect(result.current.progress.total).toBe(0)

      result.current.mutate(options)

      // Progress should be set immediately when mutation starts
      await waitFor(() => {
        expect(result.current.progress.total).toBe(3)
      })
    })
  })

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toEqual(new Error('Network error'))
    })

    it('handles server error responses', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Internal Server Error',
        json: () =>
          Promise.resolve({
            detail: 'Export failed: insufficient permissions',
          }),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe(
        'Export failed: insufficient permissions'
      )
    })

    it('uses statusText when error detail not available', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Not Found',
        json: () => Promise.reject(new Error('Invalid JSON')),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Export failed: Not Found')
    })

    it('resets progress on error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1', 't2'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.progress).toEqual({
        completed: 0,
        total: 0,
      })
    })
  })

  describe('Cancel Functionality', () => {
    it('allows cancellation during export', async () => {
      // Never resolve the fetch to simulate long-running request
      vi.mocked(global.fetch).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1', 't2', 't3'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      // Wait for mutation to start and progress to initialize
      await waitFor(() => {
        expect(result.current.progress.total).toBe(3)
      })

      // Cancel the request
      act(() => {
        result.current.cancel()
      })

      // Progress should be reset (wait for state update)
      await waitFor(() => {
        expect(result.current.progress.total).toBe(0)
      })
      expect(result.current.progress.completed).toBe(0)
    })

    it('passes abort signal to fetch', async () => {
      const mockBlob = new Blob(['content'])
      const mockResponse = {
        ok: true,
        headers: new Headers({
          'X-Total-Tenants': '1',
          'X-Completed-Tenants': '1',
        }),
        blob: () => Promise.resolve(mockBlob),
      }

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response)

      const { result } = renderHook(() => useBatchPDFExport(), {
        wrapper: createWrapper(),
      })

      const options: BatchPDFExportOptions = {
        snapshotId: 'snap-1',
        tenantIds: ['t1'],
        mode: 'combined',
        includeCoverPage: true,
        includeCalculationDetails: true,
      }

      result.current.mutate(options)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const fetchCall = vi.mocked(global.fetch).mock.calls[0]
      const fetchOptions = fetchCall[1] as RequestInit

      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal)
    })
  })
})
