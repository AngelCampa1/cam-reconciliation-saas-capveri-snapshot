/**
 * Tests for PDFPreviewModal component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PDFPreviewModal } from './PDFPreviewModal'

vi.mock('@/api/hooks', () => ({
  useExportPdfDownload: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const defaultProps = {
  open: true,
  blobUrl: 'blob:mock-pdf-url',
  propertyId: 'property-123',
  year: 2024,
  includeCharts: false,
  includeNotes: false,
  onClose: vi.fn(),
}

describe('PDFPreviewModal', () => {
  it('renders the modal when open', () => {
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('pdf-preview-modal')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} open={false} />
      </Wrapper>
    )
    expect(screen.queryByTestId('pdf-preview-modal')).not.toBeInTheDocument()
  })

  it('renders PDF viewer iframe with blob url', () => {
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} />
      </Wrapper>
    )
    const viewer = screen.getByTestId('pdf-viewer')
    expect(viewer).toBeInTheDocument()
    expect(viewer).toHaveAttribute('src', 'blob:mock-pdf-url')
  })

  it('shows download button', () => {
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('download-button')).toBeInTheDocument()
  })

  it('shows close preview button', () => {
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('close-preview')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('close-preview'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows message when no blob url provided', () => {
    render(
      <Wrapper>
        <PDFPreviewModal {...defaultProps} blobUrl={undefined} />
      </Wrapper>
    )
    expect(screen.getByTestId('pdf-preview-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument()
  })
})
