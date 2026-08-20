/**
 * Tests for VerificationPage
 *
 * Covers loading states, extraction display, field editing, undo/redo, and approval/rejection flows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { VerificationPage } from './VerificationPage'
import {
  getExtractionDetailApiV1ExtractionsDocumentIdGet,
  approveExtractionApiV1ExtractionsDocumentIdApprovePut,
  rejectExtractionApiV1ExtractionsDocumentIdRejectPut,
  listLeasesApiV1LeasesGet,
  createLeaseApiV1LeasesPost,
} from '@/api/client'

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

// Mock API client
vi.mock('@/api/client', () => ({
  apiClient: {},
  getExtractionDetailApiV1ExtractionsDocumentIdGet: vi.fn(),
  approveExtractionApiV1ExtractionsDocumentIdApprovePut: vi.fn(),
  rejectExtractionApiV1ExtractionsDocumentIdRejectPut: vi.fn(),
  listLeasesApiV1LeasesGet: vi.fn(),
  createLeaseApiV1LeasesPost: vi.fn(),
}))

// Mock dependencies
vi.mock('@/components/hitl/PDFViewer', () => ({
  PDFViewer: ({
    onPageChange,
    overlay,
    onLoadStateChange,
  }: {
    onPageChange: (page: number) => void
    overlay?: (dims: { width: number; height: number }) => React.ReactNode
    onLoadStateChange?: (state: 'loading' | 'loaded' | 'error') => void
  }) => (
    <div data-testid="pdf-viewer">
      <button onClick={() => onPageChange(2)}>Next Page</button>
      {/* Let tests drive the document load state so we can assert the
          approval gate (F-231). */}
      <button onClick={() => onLoadStateChange?.('loaded')}>Load PDF</button>
      <button onClick={() => onLoadStateChange?.('error')}>Fail PDF</button>
      {/* Simulate react-pdf reporting Letter-size rendered dimensions so the
          overlay render-prop actually renders (F-047). */}
      {overlay?.({ width: 612, height: 792 })}
    </div>
  ),
}))

vi.mock('@/components/hitl/BoundingBoxOverlay', () => ({
  BoundingBoxOverlay: ({
    onBoxClick,
  }: {
    onBoxClick: (field: string) => void
  }) => (
    <div data-testid="bounding-box-overlay">
      <button onClick={() => onBoxClick('base_year')}>Click Box</button>
    </div>
  ),
}))

vi.mock('@/components/hitl/VerificationLayout', () => ({
  VerificationLayout: ({
    pdfPanel,
    formPanel,
  }: {
    pdfPanel: React.ReactNode
    formPanel: React.ReactNode
  }) => (
    <div>
      <div data-testid="pdf-panel">{pdfPanel}</div>
      <div data-testid="form-panel">{formPanel}</div>
    </div>
  ),
}))

vi.mock('@/features/verification/components/EditInterface', () => ({
  EditInterface: ({
    onFieldChange,
    onUndo,
    onRedo,
    onFieldFocus,
    onConfirmField,
  }: {
    onFieldChange: (field: string, value: string) => void
    onUndo: () => void
    onRedo: () => void
    onFieldFocus: (field: string) => void
    onConfirmField?: (field: string) => void
  }) => (
    <div data-testid="edit-interface">
      <button onClick={() => onFieldChange('base_year', '2025')}>
        Change Field
      </button>
      <button onClick={onUndo} data-testid="undo-button">
        Undo
      </button>
      <button onClick={onRedo} data-testid="redo-button">
        Redo
      </button>
      <button onClick={() => onFieldFocus('base_year')}>Focus Field</button>
      <button
        onClick={() => onConfirmField?.('base_year')}
        data-testid="confirm-base_year"
      >
        Confirm Base Year
      </button>
    </div>
  ),
  VERIFIABLE_FIELD_KEYS: [
    'base_year',
    'base_year_amount',
    'gross_up_base_year',
    'pro_rata_share',
    'cap_type',
    'cap_rate',
    'admin_fee_percentage',
  ],
}))

vi.mock('@/features/verification/components/VerificationSummary', () => ({
  VerificationSummary: ({
    onFilterChange,
    sourceReferences,
  }: {
    onFilterChange: (filter: 'all' | 'low') => void
    sourceReferences: { verified: boolean }[]
  }) => (
    <div data-testid="verification-summary">
      <span data-testid="progress-text">
        {sourceReferences.filter((r) => r.verified).length}
      </span>
      <button
        onClick={() => onFilterChange('low')}
        data-testid="low-confidence-filter"
      >
        Show Low Confidence
      </button>
    </div>
  ),
}))

vi.mock('@/features/verification/components/ApprovalDialog', () => ({
  ApprovalDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: () => void
  }) =>
    open ? (
      <div data-testid="approval-dialog">
        <button data-testid="approval-confirm-button" onClick={onConfirm}>
          Approve & Commit
        </button>
      </div>
    ) : null,
}))

vi.mock('@/features/verification/components/RejectDialog', () => ({
  RejectDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: (reason: string, notes: string | null, requeue: boolean) => void
  }) =>
    open ? (
      <div data-testid="reject-dialog">
        <button onClick={() => onConfirm('wrong_data', 'Test notes', false)}>
          Confirm Rejection
        </button>
      </div>
    ) : null,
}))

const mockManualSave = vi.fn().mockResolvedValue(undefined)
const mockUseAutoSave = vi.fn(() => ({
  isSaving: false,
  lastSaved: new Date('2024-01-01T12:00:00Z'),
  saveError: null as Error | null,
  manualSave: mockManualSave,
}))

vi.mock('@/features/verification/hooks/useAutoSave', () => ({
  useAutoSave: () => mockUseAutoSave(),
}))

const mockExtraction = {
  id: 'extraction-1',
  filename: 'test-lease.pdf',
  status: 'extracted',
  storage_bucket: 'test-bucket',
  storage_key: 'test-key.pdf',
  document_url: 'https://example.com/test.pdf',
  content_type: 'application/pdf',
  file_size_bytes: 1024,
  extraction_result: {
    profile: {
      base_year: 2024,
      pro_rata_share: 0.05,
      admin_fee_percent: 0.15,
    },
    confidence_scores: { base_year: 0.95 },
    source_references: [
      {
        field: 'base_year',
        text: '2024',
        boundingBox: { left: 0.1, top: 0.1, width: 0.1, height: 0.1 },
        confidence: 0.95,
        page: 1,
      },
    ],
  },
  created_at: '2024-01-01T00:00:00Z',
  processed_at: '2024-01-01T01:00:00Z',
  verified_at: null,
  verified_by: null,
  lease_id: 'lease-1',
  property_id: 'property-1',
  edit_history: [],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/extractions/extraction-1']}>
          <Routes>
            <Route path="/extractions/:documentId" element={<>{children}</>} />
            <Route path="/extractions" element={<div>Extractions List</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('VerificationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackEvent.mockClear()
    mockUseAutoSave.mockReturnValue({
      isSaving: false,
      lastSaved: new Date('2024-01-01T12:00:00Z'),
      saveError: null,
      manualSave: mockManualSave,
    })
  })

  it('renders loading state', () => {
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { container } = render(<VerificationPage />, {
      wrapper: createWrapper(),
    })

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders error state with back button', async () => {
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: undefined,
      error: { message: 'Not found' },
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Extraction Not Found')).toBeInTheDocument()
      expect(screen.getByText('Back to Extractions')).toBeInTheDocument()
    })
  })

  it('renders no extraction data state', async () => {
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: {
        ...mockExtraction,
        extraction_result: null,
      },
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('No Extraction Data')).toBeInTheDocument()
    })
  })

  it('renders main extraction view', async () => {
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('test-lease.pdf')).toBeInTheDocument()
      expect(screen.getAllByTestId('pdf-viewer')).toHaveLength(2) // Parent wrapper + component
      expect(screen.getByTestId('edit-interface')).toBeInTheDocument()
      expect(screen.getByTestId('approve-button')).toBeInTheDocument()
      expect(screen.getByTestId('reject-button')).toBeInTheDocument()
    })
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_review_opened',
      expect.objectContaining({
        document_id: 'extraction-1',
        property_id: 'property-1',
        has_linked_lease: true,
        entry_point: 'verification_page',
      })
    )
  })

  it('renders the bounding box overlay via the PDFViewer overlay render-prop (F-047)', async () => {
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    // The overlay is now rendered inside PDFViewer (driven by the reported
    // page dimensions), not as a hardcoded 595x842 sibling.
    await waitFor(() => {
      expect(screen.getByTestId('bounding-box-overlay')).toBeInTheDocument()
    })
  })

  it('shows the draft-save-error indicator with a Retry control when autosave fails (F-048)', async () => {
    const user = userEvent.setup()
    mockUseAutoSave.mockReturnValue({
      isSaving: false,
      lastSaved: new Date('2024-01-01T12:00:00Z'),
      saveError: new Error('Auto-save failed'),
      manualSave: mockManualSave,
    })
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('draft-save-error')).toBeInTheDocument()
    })
    // Stale "saved" indicator must NOT be shown while there's an error
    expect(
      screen.queryByTestId('draft-saved-indicator')
    ).not.toBeInTheDocument()

    // Retry control triggers a manual save
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockManualSave).toHaveBeenCalled()
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_draft_save_retried',
      expect.objectContaining({
        document_id: 'extraction-1',
      })
    )
  })

  it('handles field changes and updates edit history', async () => {
    const user = userEvent.setup()
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Change Field')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Change Field'))

    // Field change is handled internally, no visible change to assert
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_field_edited',
      expect.objectContaining({
        document_id: 'extraction-1',
        field_group: 'dates',
      })
    )
  })

  it('handles undo and redo', async () => {
    const user = userEvent.setup()
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeInTheDocument()
    })

    // Make a change first
    await user.click(screen.getByText('Change Field'))

    // Undo the change
    await user.click(screen.getByTestId('undo-button'))

    // Redo the change
    await user.click(screen.getByTestId('redo-button'))
  })

  it('handles approval flow', async () => {
    const user = userEvent.setup()
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('approve-button')).toBeInTheDocument()
    })

    // Open approval dialog
    await user.click(screen.getByTestId('approve-button'))
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_approval_opened',
      expect.objectContaining({
        document_id: 'extraction-1',
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId('approval-dialog')).toBeInTheDocument()
    })

    // Confirm approval
    vi.mocked(
      approveExtractionApiV1ExtractionsDocumentIdApprovePut
    ).mockResolvedValue({
      data: { success: true },
      error: undefined,
    } as any)

    await user.click(screen.getByTestId('approval-confirm-button'))
    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_extraction_approved',
        expect.objectContaining({
          document_id: 'extraction-1',
        })
      )
    })
  })

  it('blocks approval when the source PDF fails to load (F-231)', async () => {
    const user = userEvent.setup()
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('approve-button')).toBeInTheDocument()
    })
    // Enabled before any load failure.
    expect(screen.getByTestId('approve-button')).not.toBeDisabled()

    // The source PDF 404s / fails to load.
    await user.click(screen.getByText('Fail PDF'))
    expect(screen.getByTestId('approve-button')).toBeDisabled()

    // Clicking the disabled button must not open the approval dialog.
    await user.click(screen.getByTestId('approve-button'))
    expect(screen.queryByTestId('approval-dialog')).not.toBeInTheDocument()

    // Recovering the PDF re-enables approval.
    await user.click(screen.getByText('Load PDF'))
    expect(screen.getByTestId('approve-button')).not.toBeDisabled()
  })

  it('ignores the Ctrl+Enter approve shortcut when the PDF failed to load (F-231)', async () => {
    const user = userEvent.setup()
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('approve-button')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Fail PDF'))
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(screen.queryByTestId('approval-dialog')).not.toBeInTheDocument()
  })

  it('handles rejection flow', async () => {
    const user = userEvent.setup()
    vi.mocked(
      getExtractionDetailApiV1ExtractionsDocumentIdGet
    ).mockResolvedValue({
      data: mockExtraction,
      error: undefined,
    } as any)

    render(<VerificationPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('reject-button')).toBeInTheDocument()
    })

    // Open reject dialog
    await user.click(screen.getByTestId('reject-button'))
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'lease_extraction_rejection_opened',
      expect.objectContaining({
        document_id: 'extraction-1',
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId('reject-dialog')).toBeInTheDocument()
    })

    // Confirm rejection
    vi.mocked(
      rejectExtractionApiV1ExtractionsDocumentIdRejectPut
    ).mockResolvedValue({
      data: { success: true },
      error: undefined,
    } as any)

    await user.click(screen.getByText('Confirm Rejection'))
    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_extraction_rejected',
        expect.objectContaining({
          document_id: 'extraction-1',
        })
      )
    })
  })
  describe('Keyboard Shortcuts', () => {
    it('Ctrl+Enter opens approval dialog', async () => {
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: mockExtraction, error: undefined } as any)
      render(<VerificationPage />, { wrapper: createWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId('edit-interface')).toBeInTheDocument()
      })
      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
      await waitFor(() => {
        expect(screen.getByTestId('approval-dialog')).toBeInTheDocument()
      })
    })

    it('Ctrl+Z triggers undo without errors', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: mockExtraction, error: undefined } as any)
      render(<VerificationPage />, { wrapper: createWrapper() })
      await waitFor(() => {
        expect(screen.getByText('Change Field')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Change Field'))
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
      expect(screen.getByTestId('edit-interface')).toBeInTheDocument()
    })

    it('Ctrl+Y triggers redo without errors', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: mockExtraction, error: undefined } as any)
      render(<VerificationPage />, { wrapper: createWrapper() })
      await waitFor(() => {
        expect(screen.getByText('Change Field')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Change Field'))
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
      fireEvent.keyDown(document, { key: 'y', ctrlKey: true })
      expect(screen.getByTestId('edit-interface')).toBeInTheDocument()
    })

    it('Ctrl+Shift+Z also triggers redo', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: mockExtraction, error: undefined } as any)
      render(<VerificationPage />, { wrapper: createWrapper() })
      await waitFor(() => {
        expect(screen.getByText('Change Field')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Change Field'))
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
      expect(screen.getByTestId('edit-interface')).toBeInTheDocument()
    })
  })

  describe('Confirm field affordance (F-176)', () => {
    it('confirming an unedited field increments the verified count and tracks it', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: mockExtraction, error: undefined } as any)
      render(<VerificationPage />, { wrapper: createWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId('confirm-base_year')).toBeInTheDocument()
      })

      expect(screen.getByTestId('progress-text')).toHaveTextContent('0')

      await user.click(screen.getByTestId('confirm-base_year'))

      expect(screen.getByTestId('progress-text')).toHaveTextContent('1')
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_extraction_field_confirmed',
        expect.objectContaining({ field_group: expect.any(String) })
      )
    })

    it('confirming a field again toggles it back off', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: mockExtraction, error: undefined } as any)
      render(<VerificationPage />, { wrapper: createWrapper() })
      await waitFor(() => {
        expect(screen.getByTestId('confirm-base_year')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('confirm-base_year'))
      expect(screen.getByTestId('progress-text')).toHaveTextContent('1')

      await user.click(screen.getByTestId('confirm-base_year'))
      expect(screen.getByTestId('progress-text')).toHaveTextContent('0')
    })
  })

  describe('Quick-create lease (F-174)', () => {
    const unlinkedExtraction = {
      ...mockExtraction,
      lease_id: null,
      property_id: 'property-1',
    }

    it('lets the user create a lease when the property has none, then enables approve', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: unlinkedExtraction, error: undefined } as any)
      vi.mocked(listLeasesApiV1LeasesGet).mockResolvedValue({
        data: { data: [] },
        error: undefined,
      } as any)
      vi.mocked(createLeaseApiV1LeasesPost).mockResolvedValue({
        data: { id: 'lease-new', tenant_name: 'Acme Coffee Co.' },
        error: undefined,
      } as any)

      render(<VerificationPage />, { wrapper: createWrapper() })

      // No existing leases: the "New lease" button is offered, approve is blocked.
      await waitFor(() => {
        expect(screen.getByTestId('create-lease-button')).toBeInTheDocument()
      })
      expect(screen.getByTestId('approve-button')).toBeDisabled()
      expect(screen.queryByTestId('lease-selector')).not.toBeInTheDocument()
      // The reason is visible (not hover-only) so touch users learn why.
      expect(screen.getByTestId('approve-disabled-reason')).toHaveTextContent(
        'Link a lease before you approve.'
      )

      await user.click(screen.getByTestId('create-lease-button'))

      fireEvent.change(screen.getByTestId('new-lease-tenant'), {
        target: { value: 'Acme Coffee Co.' },
      })
      fireEvent.change(screen.getByTestId('new-lease-start'), {
        target: { value: '2024-01-01' },
      })
      fireEvent.change(screen.getByTestId('new-lease-end'), {
        target: { value: '2024-12-31' },
      })

      await user.click(screen.getByTestId('create-lease-submit'))

      await waitFor(() => {
        expect(createLeaseApiV1LeasesPost).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              property_id: 'property-1',
              tenant_name: 'Acme Coffee Co.',
              start_date: '2024-01-01',
              end_date: '2024-12-31',
              recovery_profile: expect.objectContaining({ base_year: 2024 }),
            }),
          })
        )
      })

      // Lease now linked: approve is enabled.
      await waitFor(() => {
        expect(screen.getByTestId('approve-button')).not.toBeDisabled()
      })
    })

    it('blocks lease creation until required fields are valid', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: unlinkedExtraction, error: undefined } as any)
      vi.mocked(listLeasesApiV1LeasesGet).mockResolvedValue({
        data: { data: [] },
        error: undefined,
      } as any)

      render(<VerificationPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByTestId('create-lease-button')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('create-lease-button'))

      // Empty form: submit disabled.
      expect(screen.getByTestId('create-lease-submit')).toBeDisabled()

      // End before start: submit stays disabled and a hint shows.
      fireEvent.change(screen.getByTestId('new-lease-tenant'), {
        target: { value: 'Acme' },
      })
      fireEvent.change(screen.getByTestId('new-lease-start'), {
        target: { value: '2024-12-31' },
      })
      fireEvent.change(screen.getByTestId('new-lease-end'), {
        target: { value: '2024-01-01' },
      })

      expect(screen.getByTestId('create-lease-submit')).toBeDisabled()
      expect(
        screen.getByText(/end date must be on or after the start date/i)
      ).toBeInTheDocument()
      expect(createLeaseApiV1LeasesPost).not.toHaveBeenCalled()
    })

    it('surfaces a retryable error when the lease list fails, not a false "no leases" New-lease prompt (F-426)', async () => {
      const user = userEvent.setup()
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockResolvedValue({ data: unlinkedExtraction, error: undefined } as any)
      // The lease list fails to load (not an empty property).
      vi.mocked(listLeasesApiV1LeasesGet).mockRejectedValue(
        new Error('network')
      )

      render(<VerificationPage />, { wrapper: createWrapper() })

      // Must not masquerade the failure as "this property has no leases"
      // (which would nudge the user to create a duplicate and mislink it).
      await waitFor(() => {
        expect(screen.getByTestId('lease-load-error')).toBeInTheDocument()
      })
      expect(
        screen.queryByTestId('create-lease-button')
      ).not.toBeInTheDocument()

      // Try again refires the lease query — this time it succeeds.
      vi.mocked(listLeasesApiV1LeasesGet).mockResolvedValue({
        data: { data: [{ id: 'lease-1', tenant_name: 'Acme' }] },
        error: undefined,
      } as any)
      await user.click(screen.getByRole('button', { name: /try again/i }))

      await waitFor(() => {
        expect(screen.getByTestId('lease-selector')).toBeInTheDocument()
      })
    })
  })

  describe('Offline / Paused State', () => {
    afterEach(() => {
      onlineManager.setOnline(true)
    })

    it('shows offline heading and Try Again button when the network is paused with no cached data', async () => {
      // Drive isPaused:true by taking the network offline before the query
      // fires. With online=false TanStack Query v5 sets fetchStatus:'paused'
      // (isLoading stays false) so the page reaches `if (error || !extraction)`
      // with isPaused:true and extraction undefined → isOffline = true.
      onlineManager.setOnline(false)
      vi.mocked(
        getExtractionDetailApiV1ExtractionsDocumentIdGet
      ).mockReturnValue(new Promise(() => {})) // never resolves

      render(<VerificationPage />, { wrapper: createWrapper() })

      expect(
        await screen.findByText(/can't reach the server/i)
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/extraction not found/i)
      ).not.toBeInTheDocument()
    })
  })
})
