/**
 * Tests for ExtractionsPage
 *
 * Covers table rendering, filters, pagination, and navigation to verification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ExtractionsPage } from './ExtractionsPage'
import { DocumentStatus, ExtractionJobStatus } from '@/types/enums'

const { mockTrackEvent } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
}))

vi.mock('@/lib/analytics', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics')
  return {
    ...actual,
    trackEvent: mockTrackEvent,
  }
})

// Mock the API client
vi.mock('@/api/client', async () => {
  const actual = await vi.importActual('@/api/client')
  return {
    ...actual,
    apiClient: {},
    getJobStatusApiV1ExtractionsJobsJobIdGet: vi.fn(),
    listExtractionsApiV1ExtractionsGet: vi.fn(),
    processExtractionApiV1ExtractionsDocumentIdProcessPost: vi.fn(),
  }
})

vi.mock('@/hooks/useNotificationPermission', () => ({
  sendBrowserNotification: vi.fn(),
  useNotificationPermission: vi.fn(() => ({
    permission: 'denied',
    requestPermission: vi.fn(),
    isSupported: false,
  })),
}))

// Mock useViewport hook
vi.mock('@/hooks/useViewport', () => ({
  useViewport: vi.fn(() => ({ width: 1024, height: 768 })), // Desktop by default
}))

import {
  getJobStatusApiV1ExtractionsJobsJobIdGet,
  listExtractionsApiV1ExtractionsGet,
  processExtractionApiV1ExtractionsDocumentIdProcessPost,
} from '@/api/client'
import { useViewport } from '@/hooks/useViewport'
import { onlineManager } from '@tanstack/react-query'

const mockExtractions = {
  items: [
    {
      id: 'extraction-1',
      filename: 'lease-1.pdf',
      status: DocumentStatus.READY_FOR_REVIEW,
      created_at: '2024-01-01T12:00:00Z',
      processed_at: '2024-01-01T12:30:00Z',
      verified_at: null,
      average_confidence: 0.95,
      low_confidence_count: 0,
    },
    {
      id: 'extraction-2',
      filename: 'lease-2.pdf',
      status: DocumentStatus.VERIFIED,
      created_at: '2024-01-02T12:00:00Z',
      processed_at: '2024-01-02T12:30:00Z',
      verified_at: '2024-01-02T13:00:00Z',
      average_confidence: 0.72,
      low_confidence_count: 3,
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  has_next: false,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('ExtractionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackEvent.mockClear()
    vi.mocked(getJobStatusApiV1ExtractionsJobsJobIdGet).mockResolvedValue({
      data: { status: DocumentStatus.PROCESSING },
      error: undefined,
    })
    vi.mocked(
      processExtractionApiV1ExtractionsDocumentIdProcessPost
    ).mockResolvedValue({
      data: { job_id: 'job-123' },
      error: undefined,
    })
  })

  it('shows data table skeleton while loading instead of spinner', () => {
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockReturnValue(
      new Promise(() => {}) // Never resolves
    )

    const { container } = render(<ExtractionsPage />, {
      wrapper: createWrapper(),
    })

    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
    // DataTableSkeleton renders skeleton cells
    expect(screen.getAllByTestId('skeleton-cell').length).toBeGreaterThan(0)
  })

  it('renders error state', async () => {
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: undefined,
      error: { message: 'Failed' },
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText("Couldn't load extractions")).toBeInTheDocument()
    })
  })

  it('renders table with extractions', async () => {
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
      expect(screen.getByText('lease-2.pdf')).toBeInTheDocument()
      expect(screen.getByText('Showing 2 of 2 extractions')).toBeInTheDocument()
    })
  })

  it('displays confidence scores with colors', async () => {
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('95%')).toBeInTheDocument() // High confidence
      expect(screen.getByText('72%')).toBeInTheDocument() // Medium confidence
      expect(screen.getByText('(3 low)')).toBeInTheDocument() // Low count
    })
  })

  it('shows review button only for ready documents', async () => {
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const reviewButtons = screen.getAllByTestId('review-button')
      expect(reviewButtons).toHaveLength(1) // Only for READY_FOR_REVIEW
    })
  })

  it('starts processing pending documents from the list', async () => {
    const user = userEvent.setup()
    const pendingData = {
      items: [
        {
          ...mockExtractions.items[0],
          id: 'pending-document',
          status: DocumentStatus.PENDING,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: pendingData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId('process-button'))

    await waitFor(() => {
      expect(
        processExtractionApiV1ExtractionsDocumentIdProcessPost
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { document_id: 'pending-document' },
        })
      )
    })
    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()
    expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledTimes(1)
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_process_started',
      {
        document_id: 'pending-document',
        action_type: 'process',
      }
    )
  })

  it('shows progress microcopy while a document is processing', async () => {
    const user = userEvent.setup()
    const pendingData = {
      items: [
        {
          ...mockExtractions.items[0],
          id: 'pending-document',
          status: DocumentStatus.PENDING,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: pendingData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByTestId('process-button'))

    expect(
      await screen.findByText(/this can take up to 30 seconds/i)
    ).toBeVisible()
  })

  it('refetches the extractions list when a processing job completes', async () => {
    const user = userEvent.setup()
    vi.mocked(getJobStatusApiV1ExtractionsJobsJobIdGet).mockResolvedValue({
      data: { status: ExtractionJobStatus.COMPLETED },
      error: undefined,
    })
    const pendingData = {
      items: [
        {
          ...mockExtractions.items[0],
          id: 'pending-document',
          status: DocumentStatus.PENDING,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: pendingData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledTimes(1)

    await user.click(await screen.findByTestId('process-button'))

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_extraction_process_completed',
        expect.objectContaining({ document_id: 'pending-document' })
      )
    })

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledTimes(2)
    })
  })

  it('allows failed documents to be retried from the list', async () => {
    const user = userEvent.setup()
    const failedData = {
      items: [
        {
          ...mockExtractions.items[0],
          id: 'failed-document',
          status: DocumentStatus.FAILED,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: failedData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(
        processExtractionApiV1ExtractionsDocumentIdProcessPost
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { document_id: 'failed-document' },
        })
      )
    })
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_process_started',
      {
        document_id: 'failed-document',
        action_type: 'retry',
      }
    )
  })

  it('handles status filter change', async () => {
    const user = userEvent.setup()
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    // Open filter dropdown
    const filterTrigger = screen.getByRole('combobox')
    await user.click(filterTrigger)

    // Select "Verified" filter
    const verifiedOption = screen.getByRole('option', { name: /verified/i })
    await user.click(verifiedOption)

    // Verify API called with filter
    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            status: DocumentStatus.VERIFIED,
          }),
        })
      )
    })
  })

  it('renders empty state after filtering to no results', async () => {
    const user = userEvent.setup()

    // First call returns data
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValueOnce({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    // Change filter to return empty results
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: { ...mockExtractions, items: [], total: 0 },
      error: undefined,
    })

    const filterTrigger = screen.getByRole('combobox')
    await user.click(filterTrigger)
    const pendingOption = screen.getByRole('option', { name: /pending/i })
    await user.click(pendingOption)

    await waitFor(() => {
      expect(
        screen.getByText('No extractions with this status')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /show all statuses/i })
      ).toBeInTheDocument()
    })
  })

  it('handles pagination', async () => {
    const user = userEvent.setup()

    // Mock data with pagination
    const pagedData = {
      ...mockExtractions,
      total: 25,
      page_size: 20,
      has_next: true,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: pagedData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    })

    // Click next page
    const nextButton = screen.getByRole('button', { name: /next/i })
    await user.click(nextButton)

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            page: 2,
          }),
        })
      )
    })
  })

  it('resets to the first page when status filter changes', async () => {
    const user = userEvent.setup()
    const pagedData = {
      ...mockExtractions,
      total: 25,
      page_size: 20,
      has_next: true,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: pagedData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await screen.findByText('Page 1 of 2')
    await user.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ page: 2 }),
        })
      )
    })

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /failed/i }))

    await waitFor(() => {
      const calls = vi.mocked(listExtractionsApiV1ExtractionsGet).mock.calls
      expect(calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          query: expect.objectContaining({
            page: 1,
            status: DocumentStatus.FAILED,
          }),
        })
      )
    })
  })

  it('displays different status badge colors', async () => {
    const statusExtractions = {
      items: [
        { ...mockExtractions.items[0], status: DocumentStatus.PENDING },
        {
          ...mockExtractions.items[0],
          id: 'e2',
          status: DocumentStatus.PROCESSING,
        },
        {
          ...mockExtractions.items[0],
          id: 'e3',
          status: DocumentStatus.FAILED,
        },
        {
          ...mockExtractions.items[0],
          id: 'e4',
          status: DocumentStatus.REJECTED,
        },
      ],
      total: 4,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: statusExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Processing')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })
  })

  it('displays dash for null confidence', async () => {
    const nullConfidenceData = {
      items: [{ ...mockExtractions.items[0], average_confidence: null }],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: nullConfidenceData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('-')).toBeInTheDocument()
    })
  })

  it('displays low confidence color for scores below 70%', async () => {
    const lowConfidenceData = {
      items: [{ ...mockExtractions.items[0], average_confidence: 0.65 }],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: lowConfidenceData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const percentage = screen.getByText('65%')
      expect(percentage).toBeInTheDocument()
      expect(percentage.className).toContain('text-destructive-strong')
    })
  })

  it('displays medium confidence color for scores 70-89%', async () => {
    const mediumConfidenceData = {
      items: [{ ...mockExtractions.items[0], average_confidence: 0.85 }],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mediumConfidenceData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const percentage = screen.getByText('85%')
      expect(percentage).toBeInTheDocument()
      expect(percentage.className).toContain('text-warning-strong')
    })
  })

  it('displays high confidence color for scores 90%+', async () => {
    const highConfidenceData = {
      items: [{ ...mockExtractions.items[0], average_confidence: 0.95 }],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: highConfidenceData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const percentage = screen.getByText('95%')
      expect(percentage).toBeInTheDocument()
      expect(percentage.className).toContain('text-success-strong')
    })
  })

  it('hides low confidence count when zero', async () => {
    const zeroLowCountData = {
      items: [
        {
          ...mockExtractions.items[0],
          average_confidence: 0.85,
          low_confidence_count: 0,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: zeroLowCountData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument()
      expect(screen.queryByText(/low/i)).not.toBeInTheDocument()
    })
  })

  it('disables Previous button on first page', async () => {
    const pagedData = {
      ...mockExtractions,
      total: 25,
      page: 1,
      page_size: 20,
      has_next: true,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: pagedData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const prevButton = screen.getByRole('button', { name: /previous/i })
      expect(prevButton).toBeDisabled()
    })
  })

  it('disables Next button on last page', async () => {
    const user = userEvent.setup()

    // First page data
    const firstPageData = {
      ...mockExtractions,
      total: 25,
      page: 1,
      page_size: 20,
      has_next: true,
    }

    // Last page data
    const lastPageData = {
      items: [mockExtractions.items[0]],
      total: 25,
      page: 2,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValueOnce({
      data: firstPageData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    })

    // Navigate to last page
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValueOnce({
      data: lastPageData,
      error: undefined,
    })

    const nextButton = screen.getByRole('button', { name: /next/i })
    await user.click(nextButton)

    // Now on page 2 (last page), Next should be disabled
    await waitFor(() => {
      const updatedNextButton = screen.getByRole('button', { name: /next/i })
      expect(updatedNextButton).toBeDisabled()
    })
  })

  it('hides pagination when total items fit in one page', async () => {
    const singlePageData = {
      items: [mockExtractions.items[0]],
      total: 1,
      page: 1,
      page_size: 20,
      has_next: false,
    }

    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: singlePageData,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    // Pagination should not be rendered
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
  })

  it('filters by PENDING status', async () => {
    const user = userEvent.setup()
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    const filterTrigger = screen.getByRole('combobox')
    await user.click(filterTrigger)

    const pendingOption = screen.getByRole('option', { name: /^pending$/i })
    await user.click(pendingOption)

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            status: DocumentStatus.PENDING,
          }),
        })
      )
    })
  })

  it('filters by PROCESSING status', async () => {
    const user = userEvent.setup()
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    const filterTrigger = screen.getByRole('combobox')
    await user.click(filterTrigger)

    const processingOption = screen.getByRole('option', { name: /processing/i })
    await user.click(processingOption)

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            status: DocumentStatus.PROCESSING,
          }),
        })
      )
    })
  })

  it('filters by FAILED status', async () => {
    const user = userEvent.setup()
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    const filterTrigger = screen.getByRole('combobox')
    await user.click(filterTrigger)

    const failedOption = screen.getByRole('option', { name: /failed/i })
    await user.click(failedOption)

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            status: DocumentStatus.FAILED,
          }),
        })
      )
    })
  })

  it('filters by REJECTED status', async () => {
    const user = userEvent.setup()
    vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
      data: mockExtractions,
      error: undefined,
    })

    render(<ExtractionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
    })

    const filterTrigger = screen.getByRole('combobox')
    await user.click(filterTrigger)

    const rejectedOption = screen.getByRole('option', { name: /rejected/i })
    await user.click(rejectedOption)

    await waitFor(() => {
      expect(listExtractionsApiV1ExtractionsGet).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            status: DocumentStatus.REJECTED,
          }),
        })
      )
    })
  })

  describe('Mobile View', () => {
    beforeEach(() => {
      // Mock mobile viewport
      vi.mocked(useViewport).mockReturnValue({ width: 600, height: 800 })
    })

    afterEach(() => {
      // Restore desktop viewport
      vi.mocked(useViewport).mockReturnValue({ width: 1024, height: 768 })
    })

    it('renders mobile cards instead of table on small screens', async () => {
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: mockExtractions,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        // Should show filenames in cards
        expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
        expect(screen.getByText('lease-2.pdf')).toBeInTheDocument()
      })

      // Should NOT have table element in mobile view
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('displays status badges in mobile cards', async () => {
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: mockExtractions,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Ready for Review')).toBeInTheDocument()
        expect(screen.getByText('Verified')).toBeInTheDocument()
      })
    })

    it('displays confidence percentage in mobile cards', async () => {
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: mockExtractions,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('95% confidence')).toBeInTheDocument()
        expect(screen.getByText('72% confidence')).toBeInTheDocument()
      })
    })

    it('shows review button only for ready_for_review status in mobile', async () => {
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: mockExtractions,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        // Only one Review button should exist (for ready_for_review)
        const reviewButtons = screen.getAllByRole('button', { name: /review/i })
        expect(reviewButtons).toHaveLength(1)
      })
    })

    it('renders mobile empty state with upload button', async () => {
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('No documents to verify')).toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /upload document/i })
        ).toBeInTheDocument()
      })
    })

    it('shows low confidence count in mobile cards', async () => {
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: mockExtractions,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        // Second item has 3 low confidence fields
        expect(screen.getByText('(3 low)')).toBeInTheDocument()
      })
    })

    it('hides confidence display when null in mobile cards', async () => {
      const nullConfidenceData = {
        items: [{ ...mockExtractions.items[0], average_confidence: null }],
        total: 1,
        page: 1,
        page_size: 20,
        has_next: false,
      }

      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: nullConfidenceData,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
      })

      // Should NOT show any confidence text when null
      expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument()
    })

    it('renders mobile empty state with filter applied', async () => {
      const user = userEvent.setup()

      // First call returns data
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValueOnce({
        data: mockExtractions,
        error: undefined,
      })

      render(<ExtractionsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('lease-1.pdf')).toBeInTheDocument()
      })

      // Change filter to return empty results
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockResolvedValue({
        data: { ...mockExtractions, items: [], total: 0 },
        error: undefined,
      })

      const filterTrigger = screen.getByRole('combobox')
      await user.click(filterTrigger)
      const pendingOption = screen.getByRole('option', { name: /pending/i })
      await user.click(pendingOption)

      await waitFor(() => {
        expect(
          screen.getByText('No extractions with this status')
        ).toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /show all statuses/i })
        ).toBeInTheDocument()
      })
    })
  })

  describe('Offline / Paused state', () => {
    afterEach(() => {
      onlineManager.setOnline(true)
    })

    it('shows an offline notice instead of the empty state when the fetch is paused', async () => {
      // Mark the browser as offline so TanStack Query pauses the fetch
      onlineManager.setOnline(false)

      // Return a promise that never resolves so the query stays paused
      vi.mocked(listExtractionsApiV1ExtractionsGet).mockReturnValue(
        new Promise(() => {})
      )

      // Use a local QueryClient with default networkMode so pausing actually
      // works (the shared helper uses networkMode 'always' via retry:false only,
      // but we need to be safe — a fresh client with no overrides is correct).
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      )

      render(<ExtractionsPage />, { wrapper: Wrapper })

      // The offline error state must appear
      expect(
        await screen.findByText(/can't reach the server/i)
      ).toBeInTheDocument()

      // A "Try again" button must be present
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()

      // The misleading empty state must NOT be shown
      expect(screen.queryByText(/no extractions yet/i)).not.toBeInTheDocument()
    })
  })
})
