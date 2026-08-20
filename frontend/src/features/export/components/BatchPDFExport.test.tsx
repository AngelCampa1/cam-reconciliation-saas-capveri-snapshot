/**
 * Tests for BatchPDFExport component.
 *
 * Verifies batch PDF export with progress tracking and cancellation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BatchPDFExport } from './BatchPDFExport'
import type { TenantInfo } from '../types'

// Mock the components and hooks
vi.mock('./TenantSelector', () => ({
  TenantSelector: ({ tenants, selected, onChange }: any) => (
    <div data-testid="tenant-selector">
      <div>Tenants: {tenants.length}</div>
      <div>Selected: {selected.length}</div>
      <button onClick={() => onChange(['1', '2'])}>Select Tenants</button>
    </div>
  ),
}))

const mockCancel = vi.fn()
const mockMutate = vi.fn()
const mockReset = vi.fn()

vi.mock('../hooks/useBatchPDFExport', () => ({
  useBatchPDFExport: vi.fn(),
}))

vi.mock('../utils/pdfHelpers', () => ({
  downloadPDF: vi.fn(),
}))

describe('BatchPDFExport', () => {
  let queryClient: QueryClient
  const mockTenants: TenantInfo[] = [
    { id: '1', name: 'Acme Corp', suiteNumber: '101' },
    { id: '2', name: 'Widget Inc', suiteNumber: '202' },
    { id: '3', name: 'Global Services' },
  ]

  const defaultProps = {
    snapshotId: 'snapshot-123',
    tenants: mockTenants,
    options: {
      includeCoverPage: true,
      includeCalculationDetails: false,
    },
  }

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    mockCancel.mockClear()
    mockMutate.mockClear()
    mockReset.mockClear()

    // Default mock implementation
    const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
    vi.mocked(useBatchPDFExport).mockReturnValue({
      mutate: mockMutate,
      cancel: mockCancel,
      reset: mockReset,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: null,
      progress: { completed: 0, total: 0 },
    } as any)
  })

  const renderWithQuery = (props = defaultProps) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BatchPDFExport {...props} />
      </QueryClientProvider>
    )
  }

  describe('Rendering', () => {
    it('renders tenant selector', () => {
      renderWithQuery()

      expect(screen.getByTestId('tenant-selector')).toBeInTheDocument()
      expect(screen.getByText('Tenants: 3')).toBeInTheDocument()
    })

    it('renders export format options', () => {
      renderWithQuery()

      expect(screen.getByText('Export Format')).toBeInTheDocument()
      expect(screen.getByText('Individual PDFs (ZIP)')).toBeInTheDocument()
      expect(screen.getByText('Combined PDF')).toBeInTheDocument()
    })

    it('renders export button', () => {
      renderWithQuery()

      expect(
        screen.getByRole('button', { name: /Export 0 Tenants/i })
      ).toBeInTheDocument()
    })
  })

  describe('Tenant Selection', () => {
    it('updates selected tenant count', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const selectButton = screen.getByRole('button', {
        name: /Select Tenants/i,
      })
      await user.click(selectButton)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Export 2 Tenants/i })
        ).toBeInTheDocument()
      })
    })

    it('disables export when no tenants selected', () => {
      renderWithQuery()

      const exportButton = screen.getByRole('button', {
        name: /Export 0 Tenants/i,
      })
      expect(exportButton).toBeDisabled()
    })

    it('enables export when tenants are selected', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const selectButton = screen.getByRole('button', {
        name: /Select Tenants/i,
      })
      await user.click(selectButton)

      await waitFor(() => {
        const exportButton = screen.getByRole('button', {
          name: /Export 2 Tenants/i,
        })
        expect(exportButton).not.toBeDisabled()
      })
    })
  })

  describe('Export Mode Selection', () => {
    it('defaults to ZIP mode', () => {
      renderWithQuery()

      const zipRadio = screen.getByRole('radio', {
        name: /Individual PDFs \(ZIP\)/i,
      })
      expect(zipRadio).toBeChecked()
    })

    it('allows changing to combined mode', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const combinedRadio = screen.getByRole('radio', { name: /Combined PDF/i })
      await user.click(combinedRadio)

      expect(combinedRadio).toBeChecked()
    })
  })

  describe('Export Operation', () => {
    it('calls mutate with correct options when exporting', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      // Select tenants
      const selectButton = screen.getByRole('button', {
        name: /Select Tenants/i,
      })
      await user.click(selectButton)

      // Click export
      await waitFor(async () => {
        const exportButton = screen.getByRole('button', {
          name: /Export 2 Tenants/i,
        })
        await user.click(exportButton)
      })

      expect(mockMutate).toHaveBeenCalledWith({
        snapshotId: 'snapshot-123',
        tenantIds: ['1', '2'],
        mode: 'zip',
        includeCoverPage: true,
        includeCalculationDetails: false,
      })
    })

    it('uses selected export mode', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      // Select tenants
      const selectButton = screen.getByRole('button', {
        name: /Select Tenants/i,
      })
      await user.click(selectButton)

      // Change to combined mode
      const combinedRadio = screen.getByRole('radio', { name: /Combined PDF/i })
      await user.click(combinedRadio)

      // Click export
      await waitFor(async () => {
        const exportButton = screen.getByRole('button', {
          name: /Export 2 Tenants/i,
        })
        await user.click(exportButton)
      })

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'combined',
        })
      )
    })
  })

  describe('Progress Display', () => {
    it('shows progress bar when exporting', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: { completed: 2, total: 5, currentTenant: 'Acme Corp' },
      } as any)

      renderWithQuery()

      expect(screen.getByText('Exporting Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('40% complete')).toBeInTheDocument()
    })

    it('shows estimated time remaining', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: { completed: 3, total: 5, estimatedTimeRemaining: 45 },
      } as any)

      renderWithQuery()

      expect(screen.getByText('45s remaining')).toBeInTheDocument()
    })

    it('formats time remaining in minutes', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: { completed: 1, total: 10, estimatedTimeRemaining: 180 },
      } as any)

      renderWithQuery()

      expect(screen.getByText('3m remaining')).toBeInTheDocument()
    })

    it('disables export button during operation', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: { completed: 2, total: 5 },
      } as any)

      renderWithQuery()

      const exportButton = screen.getByRole('button', { name: /Export/i })
      expect(exportButton).toBeDisabled()
    })
  })

  describe('Cancellation', () => {
    it('shows cancel button during export', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: { completed: 2, total: 5 },
      } as any)

      renderWithQuery()

      expect(
        screen.getByRole('button', { name: /Cancel/i })
      ).toBeInTheDocument()
    })

    it('calls cancel when cancel button clicked', async () => {
      const user = userEvent.setup()
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: { completed: 2, total: 5 },
      } as any)

      renderWithQuery()

      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      await user.click(cancelButton)

      expect(mockCancel).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('shows error message on failure', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: false,
        isError: true,
        isSuccess: false,
        error: new Error('Network error'),
        data: null,
        progress: { completed: 0, total: 0 },
      } as any)

      renderWithQuery()

      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    it('shows partial failure errors', async () => {
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: false,
        isError: false,
        isSuccess: false,
        error: null,
        data: null,
        progress: {
          completed: 3,
          total: 5,
          errors: [
            { tenantId: '1', error: 'Missing data' },
            { tenantId: '2', error: 'Invalid format' },
          ],
        },
      } as any)

      renderWithQuery()

      expect(
        screen.getByText('2 tenant(s) failed to export:')
      ).toBeInTheDocument()
      expect(screen.getByText(/Acme Corp: Missing data/)).toBeInTheDocument()
      expect(screen.getByText(/Widget Inc: Invalid format/)).toBeInTheDocument()
    })
  })

  describe('Auto-download', () => {
    it('downloads file on success', async () => {
      const { downloadPDF } = await import('../utils/pdfHelpers')
      const { useBatchPDFExport } = await import('../hooks/useBatchPDFExport')

      const mockBlob = new Blob(['test'], { type: 'application/zip' })
      vi.mocked(useBatchPDFExport).mockReturnValue({
        mutate: mockMutate,
        cancel: mockCancel,
        reset: mockReset,
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
        data: {
          url: 'blob:test',
          blob: mockBlob,
          filename: 'batch-export.zip',
        },
        progress: { completed: 5, total: 5 },
      } as any)

      renderWithQuery()

      await waitFor(() => {
        expect(downloadPDF).toHaveBeenCalledWith(mockBlob, 'batch-export.zip')
        expect(mockReset).toHaveBeenCalled()
      })
    })
  })
})
