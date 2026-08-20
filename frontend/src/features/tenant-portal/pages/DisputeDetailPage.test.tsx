/**
 * Tests for DisputeDetailPage component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DisputeDetailPage } from './DisputeDetailPage'
import { apiClient } from '@/api/client'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock API client
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'viewer-other' } }),
}))

vi.mock('@/lib/analytics', () => ({
  getCountBucket: (value: number | string | null | undefined) => {
    const numericValue =
      typeof value === 'string' ? Number.parseInt(value, 10) : value
    if (numericValue === 0) return '0'
    if (typeof numericValue === 'number' && numericValue <= 10) return '1-10'
    return 'unknown'
  },
  trackEvent: vi.fn(),
}))

import { toast } from 'sonner'
import { trackEvent } from '@/lib/analytics'

type ApiClientGetResult = Awaited<ReturnType<typeof apiClient.get>>
type ApiClientPostResult = Awaited<ReturnType<typeof apiClient.post>>

function apiGetResult(
  data: unknown,
  error: unknown = null
): ApiClientGetResult {
  return { data, error } as unknown as ApiClientGetResult
}

function apiPostResult(
  data: unknown,
  error: unknown = null
): ApiClientPostResult {
  return { data, error } as unknown as ApiClientPostResult
}

const mockDispute = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  statement_id: '456e7890-e12b-34d5-a678-901234567890',
  category: 'calculation_error',
  description: 'There is an error in the CAM calculation',
  status: 'open',
  created_at: '2024-12-30T10:00:00Z',
  comments: [
    {
      id: 'comment-1',
      author_id: 'user-1',
      author_name: 'John Tenant',
      content: 'Please review the Q3 HVAC allocation.',
      created_at: '2024-12-30T10:00:00Z',
    },
  ],
  attachments: [
    {
      id: 'attachment-1',
      filename: 'invoice.pdf',
      file_url: 'https://storage.example.com/disputes/123/invoice.pdf',
      file_size_bytes: 1024000,
      content_type: 'application/pdf',
      created_at: '2024-12-30T10:00:00Z',
    },
  ],
}

describe('DisputeDetailPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore the shared online singleton so a paused-fetch test cannot leak
    // into later tests in the run.
    onlineManager.setOnline(true)
  })

  const renderWithRouter = (disputeId: string) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/tenant/disputes/${disputeId}`]}>
          <Routes>
            <Route
              path="/tenant/disputes/:disputeId"
              element={<DisputeDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('shows loading state while fetching dispute', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) as unknown as ReturnType<typeof apiClient.get>
    )

    renderWithRouter(mockDispute.id)

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows an offline notice (not "Dispute not found") when the fetch is paused', async () => {
    onlineManager.setOnline(false)
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText('Dispute not found')).not.toBeInTheDocument()
  })

  it('renders dispute details correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText(/calculation error/i)).toBeInTheDocument()
    })

    expect(screen.getByText('Open')).toBeInTheDocument()
    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('tenant_dispute_detail_viewed', {
        dispute_id: mockDispute.id,
        statement_id: mockDispute.statement_id,
        category: mockDispute.category,
        status: mockDispute.status,
        comment_count: 1,
        comment_count_bucket: '1-10',
        attachment_count: 1,
        attachment_count_bucket: '1-10',
      })
    })
  })

  it('renders human-readable category label not raw enum (F-224)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText(/Calculation Error/)).toBeInTheDocument()
    })

    expect(screen.queryByText('calculation_error')).not.toBeInTheDocument()
  })

  it('displays comments in dispute thread', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText('John Tenant')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/please review the q3 hvac allocation/i)
    ).toBeInTheDocument()
  })

  it('renders the original dispute description the tenant filed', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText('What you disputed')).toBeInTheDocument()
    })

    expect(
      screen.getByText('There is an error in the CAM calculation')
    ).toBeInTheDocument()
  })

  it('displays attachments section', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText('Attachments')).toBeInTheDocument()
    })

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument()
    expect(screen.getByText('1000.0 KB')).toBeInTheDocument()
  })

  it('shows resolution summary when dispute is resolved', async () => {
    const resolvedDispute = {
      ...mockDispute,
      status: 'resolved',
      resolution_summary:
        'The calculation has been corrected and credit issued.',
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(
      apiGetResult(resolvedDispute)
    )

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText('Resolution')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/the calculation has been corrected/i)
    ).toBeInTheDocument()
  })

  it('hides comment form when dispute is closed', async () => {
    const closedDispute = {
      ...mockDispute,
      status: 'closed',
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(closedDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/add a comment/i)
      ).not.toBeInTheDocument()
    })
  })

  it('shows not found message when dispute does not exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(null))

    renderWithRouter('nonexistent-id')

    await waitFor(() => {
      expect(screen.getByText(/dispute not found/i)).toBeInTheDocument()
    })
  })

  it('renders attachment Download as a link with correct href', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByText('Attachments')).toBeInTheDocument()
    })

    const downloadLink = screen.getByRole('link', {
      name: /download invoice\.pdf/i,
    })
    expect(downloadLink).toHaveAttribute(
      'href',
      'https://storage.example.com/disputes/123/invoice.pdf'
    )
    expect(downloadLink).toHaveAttribute('target', '_blank')
    expect(downloadLink).toHaveAttribute('download', 'invoice.pdf')
  })

  it('shows error toast when adding a comment fails', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      apiPostResult(null, { detail: 'Server error' })
    )

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/add a comment/i)
    fireEvent.change(textarea, { target: { value: 'Test comment' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to add comment. Please try again.'
      )
    })
  })

  it('tracks successful tenant comments without comment content', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(apiGetResult(mockDispute))
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      apiPostResult({
        id: 'comment-2',
        dispute_id: mockDispute.id,
        author_id: 'tenant-user',
        author_name: 'Tenant User',
        content: 'Do not send this text',
        is_internal: false,
        created_at: '2024-12-30T11:00:00Z',
      })
    )

    renderWithRouter(mockDispute.id)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/add a comment/i), {
      target: { value: 'Do not send this text' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        'tenant_dispute_comment_submit_succeeded',
        {
          dispute_id: mockDispute.id,
          statement_id: mockDispute.statement_id,
          category: mockDispute.category,
          status: mockDispute.status,
          comment_count: 2,
          comment_count_bucket: '1-10',
        }
      )
    })
    expect(trackEvent).not.toHaveBeenCalledWith(
      'tenant_dispute_comment_submit_succeeded',
      expect.objectContaining({ content: expect.any(String) })
    )
    expect(
      vi
        .mocked(trackEvent)
        .mock.calls.filter(
          ([event]) => event === 'tenant_dispute_detail_viewed'
        )
    ).toHaveLength(1)
  })
})
