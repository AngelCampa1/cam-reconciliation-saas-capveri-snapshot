/**
 * LandlordDisputeDetailPage Tests
 *
 * Tests for the landlord dispute detail page.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LandlordDisputeDetailPage } from './LandlordDisputeDetailPage'
import * as hooks from '@/api/hooks'
import type {
  AddCommentRequest,
  DisputeDetailDTO,
  UpdateStatusRequest,
} from '@/api/hooks'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
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

import { trackEvent } from '@/lib/analytics'

const mockDispute: DisputeDetailDTO = {
  id: 'dispute-1',
  tenant_user_id: 'tenant-1',
  statement_id: 'stmt-1',
  category: 'calculation_error',
  description: 'The CAM charges seem incorrect for Q3 2024',
  status: 'under_review',
  assigned_to: null,
  resolution_summary: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-16T14:00:00Z',
  comments: [
    {
      id: 'comment-1',
      dispute_id: 'dispute-1',
      author_id: 'tenant-1',
      author_name: 'John Tenant',
      content: 'I believe there is an error in the calculation',
      is_internal: false,
      created_at: '2024-01-15T10:00:00Z',
    },
    {
      id: 'comment-2',
      dispute_id: 'dispute-1',
      author_id: 'admin-1',
      author_name: 'Admin User',
      content: 'Internal: Checking with accounting',
      is_internal: true,
      created_at: '2024-01-16T09:00:00Z',
    },
  ],
  attachments: [
    {
      id: 'attach-1',
      filename: 'receipt.pdf',
      file_url: 'https://storage.example.com/receipt.pdf',
      file_size_bytes: 125000,
      content_type: 'application/pdf',
      created_at: '2024-01-15T10:00:00Z',
    },
  ],
}

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/disputes/dispute-1']}>
        <Routes>
          <Route
            path="/disputes/:disputeId"
            element={<LandlordDisputeDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LandlordDisputeDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders dispute details when data is loaded', async () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // Check header shows category
    expect(screen.getByText(/Calculation Error/i)).toBeInTheDocument()
    // Check description is shown
    expect(
      screen.getByText(/The CAM charges seem incorrect/i)
    ).toBeInTheDocument()
    // Check status badge renders the shared Title Case label (matches the
    // status filter + update form), not the raw lowercase enum value.
    expect(screen.getByText('Under Review')).toBeInTheDocument()
    expect(screen.queryByText('under_review')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        'landlord_dispute_detail_viewed',
        {
          dispute_id: mockDispute.id,
          statement_id: mockDispute.statement_id,
          category: mockDispute.category,
          status: mockDispute.status,
          comment_count: 2,
          comment_count_bucket: '1-10',
          attachment_count: 1,
          attachment_count_bucket: '1-10',
        }
      )
    })
  })

  it('renders comments section with thread', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // Check comments are rendered
    expect(
      screen.getByText('I believe there is an error in the calculation')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Internal: Checking with accounting')
    ).toBeInTheDocument()
    // Check internal badge is shown
    expect(screen.getByText('Internal')).toBeInTheDocument()
  })

  it('renders status update form for non-closed disputes', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // Should show status update form since dispute is not closed
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /update status/i })
    ).toBeInTheDocument()
  })

  it('hides status update form for closed disputes', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: { ...mockDispute, status: 'closed' },
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // Should not show status update form since dispute is closed
    expect(
      screen.queryByRole('button', { name: /update status/i })
    ).not.toBeInTheDocument()
  })

  it('renders add comment form with internal toggle', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // Should show add comment form
    expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mark as internal/i)).toBeInTheDocument()
  })

  it('renders attachments list', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // Check attachment is shown
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument()
  })

  it('renders demand letter button', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    renderWithProviders()

    expect(
      screen.getByTestId('demand-letter-from-dispute-button')
    ).toBeInTheDocument()
  })

  it('opens demand letter dialog when button is clicked', async () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    const user = userEvent.setup()
    renderWithProviders()

    await user.click(screen.getByTestId('demand-letter-from-dispute-button'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Generate Demand Letter')
  })

  it('dialog contains TX and CA state options', async () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    const user = userEvent.setup()
    renderWithProviders()

    await user.click(screen.getByTestId('demand-letter-from-dispute-button'))

    expect(
      screen.getByRole('radio', { name: /Texas \(TX\)/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /California \(CA\)/i })
    ).toBeInTheDocument()
  })

  it('dialog contains landlord name and payment deadline inputs', async () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    const user = userEvent.setup()
    renderWithProviders()

    await user.click(screen.getByTestId('demand-letter-from-dispute-button'))

    expect(screen.getByPlaceholderText('John Smith')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
  })

  it('collects the full landlord contact block and passes it to generate (F-362)', async () => {
    const mutate = vi.fn()
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    const user = userEvent.setup()
    renderWithProviders()

    await user.click(screen.getByTestId('demand-letter-from-dispute-button'))

    await user.type(screen.getByLabelText('Landlord Name'), 'Jane Owner')
    await user.type(screen.getByLabelText('Title'), 'Asset Manager')
    await user.type(screen.getByLabelText('Company'), 'Acme Properties LLC')
    await user.type(
      screen.getByLabelText('Address'),
      '123 Main St, Dallas, TX 75201'
    )
    await user.type(screen.getByLabelText('Phone'), '(214) 555-0100')
    await user.type(screen.getByLabelText('Email'), 'jane@acme.com')

    await user.click(
      screen.getByRole('button', { name: /generate & download/i })
    )

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        landlord_name: 'Jane Owner',
        landlord_title: 'Asset Manager',
        landlord_company: 'Acme Properties LLC',
        landlord_address: '123 Main St, Dallas, TX 75201',
        landlord_phone: '(214) 555-0100',
        landlord_email: 'jane@acme.com',
      })
    )
  })

  it('does not show the landlord name error until the field is touched', async () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    const user = userEvent.setup()
    renderWithProviders()

    await user.click(screen.getByTestId('demand-letter-from-dispute-button'))

    // Error is hidden on first open (empty but untouched)
    expect(
      screen.queryByText(/landlord name is required/i)
    ).not.toBeInTheDocument()

    // Blurring the empty field reveals the error
    const nameInput = screen.getByPlaceholderText('John Smith')
    await user.click(nameInput)
    await user.tab()

    expect(screen.getByText(/landlord name is required/i)).toBeInTheDocument()
  })

  it('does not call generate when landlord name is empty', async () => {
    const mutate = vi.fn()
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useGenerateDemandLetter').mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useGenerateDemandLetter>)

    const user = userEvent.setup()
    renderWithProviders()

    await user.click(screen.getByTestId('demand-letter-from-dispute-button'))
    // Button is disabled while empty, so it cannot fire the mutation
    expect(
      screen.getByRole('button', { name: /generate & download/i })
    ).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('shows a friendly filed date subtitle instead of a raw id', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    expect(screen.getByText(/Filed Jan 15, 2024/i)).toBeInTheDocument()
    expect(screen.queryByText(/Dispute ID:/i)).not.toBeInTheDocument()
  })

  it('labels the viewer\'s own comment as "You"', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    // admin-1 is the mocked current user; their comment author shows "You"
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('John Tenant')).toBeInTheDocument()
  })

  it('tracks successful landlord status changes without resolution text', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useUpdateDisputeStatus').mockImplementation(
      (_disputeId, options) =>
        ({
          mutate: (data: UpdateStatusRequest) => {
            options?.onSuccess?.(
              {
                id: mockDispute.id,
                statement_id: mockDispute.statement_id,
                category: mockDispute.category,
                status: data.status,
                description: mockDispute.description,
                created_at: mockDispute.created_at,
              },
              data,
              undefined,
              undefined
            )
          },
          isPending: false,
        }) as unknown as ReturnType<typeof hooks.useUpdateDisputeStatus>
    )

    renderWithProviders()

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /resolved/i }))
    await user.type(
      screen.getByPlaceholderText(/describe how this dispute was resolved/i),
      'Do not send this resolution text'
    )
    await user.click(screen.getByRole('button', { name: /update status/i }))

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        'landlord_dispute_status_update_succeeded',
        {
          dispute_id: mockDispute.id,
          statement_id: mockDispute.statement_id,
          category: mockDispute.category,
          previous_status: 'under_review',
          new_status: 'resolved',
        }
      )
    })
    expect(trackEvent).not.toHaveBeenCalledWith(
      'landlord_dispute_status_update_succeeded',
      expect.objectContaining({ resolution_summary: expect.any(String) })
    )
  })

  it('shows offline message and try-again button when query is paused with no data', () => {
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    } as ReturnType<typeof hooks.useDispute>)

    renderWithProviders()

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/dispute not found/i)).not.toBeInTheDocument()
  })

  it('tracks successful landlord comments without comment content', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useDispute').mockReturnValue({
      data: mockDispute,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDispute>)
    vi.spyOn(hooks, 'useAddDisputeComment').mockImplementation(
      (_disputeId, options) =>
        ({
          mutateAsync: async (data: AddCommentRequest) => {
            const comment = {
              id: 'comment-3',
              dispute_id: mockDispute.id,
              author_id: 'admin-1',
              author_name: 'Admin User',
              content: 'Do not send this comment text',
              is_internal: Boolean(data.is_internal),
              created_at: '2024-01-17T10:00:00Z',
            }
            options?.onSuccess?.(comment, data, undefined, undefined)
            return comment
          },
          isPending: false,
        }) as unknown as ReturnType<typeof hooks.useAddDisputeComment>
    )

    renderWithProviders()

    await user.type(
      screen.getByPlaceholderText(/add a comment/i),
      'Do not send this comment text'
    )
    await user.click(screen.getByLabelText(/mark as internal/i))
    await user.click(screen.getByRole('button', { name: /add comment/i }))

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith(
        'landlord_dispute_comment_submit_succeeded',
        {
          dispute_id: mockDispute.id,
          statement_id: mockDispute.statement_id,
          category: mockDispute.category,
          status: mockDispute.status,
          is_internal: true,
          comment_count: 3,
          comment_count_bucket: '1-10',
        }
      )
    })
    expect(trackEvent).not.toHaveBeenCalledWith(
      'landlord_dispute_comment_submit_succeeded',
      expect.objectContaining({ content: expect.any(String) })
    )
    expect(
      vi
        .mocked(trackEvent)
        .mock.calls.filter(
          ([event]) => event === 'landlord_dispute_detail_viewed'
        )
    ).toHaveLength(1)
  })
})
