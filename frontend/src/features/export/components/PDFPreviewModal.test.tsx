/**
 * Tests for PDFPreviewModal component.
 *
 * Verifies PDF preview modal with zoom, navigation, download, and print controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PDFPreviewModal } from './PDFPreviewModal'

// Mock the PDFViewer component
vi.mock('@/components/hitl/PDFViewer', () => ({
  PDFViewer: ({ url, currentPage, onPageChange, scale }: any) => (
    <div
      data-testid="pdf-viewer"
      data-url={url}
      data-page={currentPage}
      data-scale={scale}
    >
      PDF Viewer Mock
      <button onClick={() => onPageChange(currentPage + 1)}>Next Page</button>
    </div>
  ),
}))

// Mock the download and print utilities
vi.mock('../utils/pdfHelpers', () => ({
  downloadPDF: vi.fn(),
  printPDF: vi.fn(),
  ZOOM_PRESETS: {
    FIT_WIDTH: 'fit-width',
    FIT_PAGE: 'fit-page',
    ACTUAL_SIZE: 1.0,
    ZOOM_50: 0.5,
    ZOOM_75: 0.75,
    ZOOM_125: 1.25,
    ZOOM_150: 1.5,
    ZOOM_200: 2.0,
  },
  calculateFitScale: vi.fn(),
}))

// Mock the useGeneratePDF hook
const mockRefetch = vi.fn()
vi.mock('../hooks/useGeneratePDF', () => ({
  useGeneratePDF: vi.fn(),
}))

describe('PDFPreviewModal', () => {
  let queryClient: QueryClient
  const mockOnClose = vi.fn()
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    snapshotId: 'test-snapshot-id',
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
    mockOnClose.mockClear()
    mockRefetch.mockClear()

    // Default mock implementation
    const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
    vi.mocked(useGeneratePDF).mockReturnValue({
      data: {
        url: 'blob:test-url',
        blob: new Blob(['test'], { type: 'application/pdf' }),
        filename: 'test.pdf',
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    } as any)
  })

  const renderWithQuery = (props = defaultProps) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PDFPreviewModal {...props} />
      </QueryClientProvider>
    )
  }

  describe('Modal Display', () => {
    it('renders modal when open', () => {
      renderWithQuery()

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('PDF Preview')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Preview the generated reconciliation statement before downloading'
        )
      ).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      renderWithQuery({ ...defaultProps, isOpen: false })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('calls onClose when dialog is closed', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Loading State', () => {
    it('shows loading skeleton while PDF generates', async () => {
      const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
      vi.mocked(useGeneratePDF).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      } as any)

      renderWithQuery()

      expect(screen.getByText('Generating PDF...')).toBeInTheDocument()
      expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows error message when PDF generation fails', async () => {
      const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
      vi.mocked(useGeneratePDF).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error occurred'),
        refetch: mockRefetch,
      } as any)

      renderWithQuery()

      expect(screen.getByText('Failed to generate PDF')).toBeInTheDocument()
      expect(screen.getByText('Network error occurred')).toBeInTheDocument()
    })

    it('shows retry button on error', async () => {
      const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
      vi.mocked(useGeneratePDF).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Test error'),
        refetch: mockRefetch,
      } as any)

      renderWithQuery()

      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('calls refetch when retry button is clicked', async () => {
      const user = userEvent.setup()
      const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
      vi.mocked(useGeneratePDF).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Test error'),
        refetch: mockRefetch,
      } as any)

      renderWithQuery()

      const retryButton = screen.getByRole('button', { name: 'Retry' })
      await user.click(retryButton)

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('PDF Preview', () => {
    it('displays PDF viewer when data is loaded', () => {
      renderWithQuery()

      expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument()
    })

    it('passes correct URL to PDF viewer', () => {
      renderWithQuery()

      const viewer = screen.getByTestId('pdf-viewer')
      expect(viewer).toHaveAttribute('data-url', 'blob:test-url')
    })

    it('starts at page 1', () => {
      renderWithQuery()

      const viewer = screen.getByTestId('pdf-viewer')
      expect(viewer).toHaveAttribute('data-page', '1')
    })

    it('starts with default scale of 1.0', () => {
      renderWithQuery()

      const viewer = screen.getByTestId('pdf-viewer')
      expect(viewer).toHaveAttribute('data-scale', '1')
    })
  })

  describe('Zoom Controls', () => {
    it('displays zoom controls', () => {
      renderWithQuery()

      expect(
        screen.getByRole('button', { name: /zoom out/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /zoom in/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('increases zoom when zoom in is clicked', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const zoomInButton = screen.getByRole('button', { name: /zoom in/i })
      await user.click(zoomInButton)

      await waitFor(() => {
        const viewer = screen.getByTestId('pdf-viewer')
        expect(viewer).toHaveAttribute('data-scale', '1.25')
      })
    })

    it('decreases zoom when zoom out is clicked', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const zoomOutButton = screen.getByRole('button', { name: /zoom out/i })
      await user.click(zoomOutButton)

      await waitFor(() => {
        const viewer = screen.getByTestId('pdf-viewer')
        expect(viewer).toHaveAttribute('data-scale', '0.75')
      })
    })

    it('disables zoom out at minimum scale', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const zoomOutButton = screen.getByRole('button', { name: /zoom out/i })

      // Click zoom out multiple times to reach minimum
      await user.click(zoomOutButton)
      await user.click(zoomOutButton)
      await user.click(zoomOutButton)
      await user.click(zoomOutButton)

      await waitFor(() => {
        expect(zoomOutButton).toBeDisabled()
      })
    })

    it('disables zoom in at maximum scale', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const zoomInButton = screen.getByRole('button', { name: /zoom in/i })

      // Click zoom in many times to reach maximum
      for (let i = 0; i < 10; i++) {
        await user.click(zoomInButton)
      }

      await waitFor(() => {
        expect(zoomInButton).toBeDisabled()
      })
    })
  })

  describe('Download and Print', () => {
    it('displays download button', () => {
      renderWithQuery()

      expect(
        screen.getByRole('button', { name: /download/i })
      ).toBeInTheDocument()
    })

    it('displays print button', () => {
      renderWithQuery()

      expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
    })

    it('calls downloadPDF when download button is clicked', async () => {
      const user = userEvent.setup()
      const { downloadPDF } = await import('../utils/pdfHelpers')

      renderWithQuery()

      const downloadButton = screen.getByRole('button', { name: /download/i })
      await user.click(downloadButton)

      expect(downloadPDF).toHaveBeenCalledWith(expect.any(Blob), 'test.pdf')
    })

    it('calls printPDF when print button is clicked', async () => {
      const user = userEvent.setup()
      const { printPDF } = await import('../utils/pdfHelpers')

      renderWithQuery()

      const printButton = screen.getByRole('button', { name: /print/i })
      await user.click(printButton)

      expect(printPDF).toHaveBeenCalledWith(expect.any(Blob))
    })

    it('disables download during loading', async () => {
      const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
      vi.mocked(useGeneratePDF).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      } as any)

      renderWithQuery()

      expect(
        screen.queryByRole('button', { name: /download/i })
      ).not.toBeInTheDocument()
    })

    it('disables print during loading', async () => {
      const { useGeneratePDF } = await import('../hooks/useGeneratePDF')
      vi.mocked(useGeneratePDF).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      } as any)

      renderWithQuery()

      expect(
        screen.queryByRole('button', { name: /print/i })
      ).not.toBeInTheDocument()
    })
  })

  describe('Page Navigation', () => {
    it('can navigate to next page', async () => {
      const user = userEvent.setup()
      renderWithQuery()

      const nextButton = screen.getByText('Next Page')
      await user.click(nextButton)

      await waitFor(() => {
        const viewer = screen.getByTestId('pdf-viewer')
        expect(viewer).toHaveAttribute('data-page', '2')
      })
    })
  })
})
