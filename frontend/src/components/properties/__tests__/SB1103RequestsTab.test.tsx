/**
 * SB1103RequestsTab Component Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SB1103RequestsTab } from '../SB1103RequestsTab'
import * as hooks from '@/api/hooks'
import { ApiError } from '@/api/errors'
import { toast } from 'sonner'

const SAMPLE_PROPERTY_ID = 'prop-123'

const mockRequest = {
  id: 'req-1',
  organization_id: 'org-1',
  property_id: SAMPLE_PROPERTY_ID,
  lease_id: 'lease-1',
  requested_by_name: 'Jane Smith',
  requested_by_email: 'jane@tenant.com',
  request_date: '2025-01-15',
  response_deadline: '2025-02-14',
  window_start_date: '2023-07-15',
  window_end_date: '2025-01-15',
  status: 'pending',
  export_format: null,
  exported_at: null,
  notes: null,
  created_at: '2025-01-15T00:00:00Z',
  updated_at: '2025-01-15T00:00:00Z',
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('SB1103RequestsTab', () => {
  let exportMutateSpy: ReturnType<typeof vi.fn>
  let updateMutateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    exportMutateSpy = vi.fn()
    updateMutateSpy = vi.fn()

    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: { data: [mockRequest], count: 1, has_more: false },
      isLoading: false,
      error: null,
    } as any)

    vi.spyOn(hooks, 'useUpdateSB1103Request').mockReturnValue({
      mutate: updateMutateSpy,
      isPending: false,
    } as any)

    vi.spyOn(hooks, 'useExportSB1103Request').mockReturnValue({
      mutate: exportMutateSpy,
      isPending: false,
    } as any)

    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
      error: null,
    } as any)
  })

  it('renders the compliance requests table for CA property', () => {
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    expect(screen.getByText('SB 1103 Compliance Requests')).toBeInTheDocument()
    expect(screen.getByText('Log New Request')).toBeInTheDocument()
  })

  it('shows informational warning banner for non-CA property', () => {
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="TX" />
    )
    expect(screen.getByText('Non-California Property')).toBeInTheDocument()
    expect(screen.getByText(/SB 1103 may not apply/i)).toBeInTheDocument()
  })

  it('does not show warning banner for CA property', () => {
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    expect(
      screen.queryByText('Non-California Property')
    ).not.toBeInTheDocument()
  })

  it('shows request data in the table', () => {
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('jane@tenant.com')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    // DataTable handles loading state internally
    expect(screen.getByText('SB 1103 Compliance Requests')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', () => {
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
    } as any)

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    expect(
      screen.getByText(/Couldn't load compliance requests/i)
    ).toBeInTheDocument()
  })

  it('shows endpoint unavailable state on 404', () => {
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError('HTTP 404', 404),
    } as any)

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    expect(
      screen.getByText(/compliance endpoint is currently unavailable/i)
    ).toBeInTheDocument()
  })

  it('opens dialog when Log New Request is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    await user.click(screen.getByText('Log New Request'))
    await waitFor(() => {
      expect(
        screen.getByText('Log SB 1103 Compliance Request')
      ).toBeInTheDocument()
    })
  })

  it('triggers export action from the actions menu', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Export PDF'))

    expect(exportMutateSpy).toHaveBeenCalledWith(
      { requestId: 'req-1', format: 'pdf' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    )
  })

  it('triggers export excel and both actions from the actions menu', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Export Excel'))
    expect(exportMutateSpy).toHaveBeenCalledWith(
      { requestId: 'req-1', format: 'excel' },
      expect.any(Object)
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Export Both (ZIP)'))
    expect(exportMutateSpy).toHaveBeenCalledWith(
      { requestId: 'req-1', format: 'both' },
      expect.any(Object)
    )
  })

  it('marks a request as delivered from the actions menu', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Mark as Delivered'))

    expect(updateMutateSpy).toHaveBeenCalledWith({
      requestId: 'req-1',
      data: { status: 'delivered' },
    })
  })

  it('hides mark delivered action when status is already delivered', async () => {
    const deliveredRequest = { ...mockRequest, status: 'delivered' }
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: { data: [deliveredRequest], count: 1, has_more: false },
      isLoading: false,
      error: null,
    } as any)

    const user = userEvent.setup()
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.queryByText('Mark as Delivered')).not.toBeInTheDocument()
  })

  describe('mobile card view', () => {
    let originalMatchMedia: typeof window.matchMedia

    beforeEach(() => {
      originalMatchMedia = window.matchMedia
      // Force the useMobileCards() hook to report a phone viewport so the
      // md:hidden card stack renders. In jsdom there is no real CSS, so the
      // hidden md:block DataTable stays in the DOM too — assertions below
      // account for both copies being present.
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia
    })

    afterEach(() => {
      window.matchMedia = originalMatchMedia
    })

    it('renders a request card with requestor and deadline on mobile', () => {
      renderWithProviders(
        <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
      )

      // Card stack + DataTable both mount in jsdom, so the name appears twice.
      expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(1)
      expect(screen.getAllByText('jane@tenant.com').length).toBeGreaterThan(1)
      // The mobile-only "Requested" / "Response deadline" labels prove the
      // card markup rendered (the DataTable uses different column headers).
      expect(screen.getByText('Requested')).toBeInTheDocument()
      expect(screen.getByText('Response deadline')).toBeInTheDocument()
    })

    it('triggers export from a card actions menu on mobile', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
      )

      // Two Actions buttons exist (card + table row); open the card's.
      const actionButtons = screen.getAllByRole('button', { name: 'Actions' })
      expect(actionButtons.length).toBeGreaterThan(1)
      await user.click(actionButtons[actionButtons.length - 1]!)
      await user.click(screen.getByText('Export PDF'))

      expect(exportMutateSpy).toHaveBeenCalledWith(
        { requestId: 'req-1', format: 'pdf' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      )
    })
  })

  it('falls back to raw status label when status is unknown', () => {
    const unknownStatusRequest = { ...mockRequest, status: 'in_review' }
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: { data: [unknownStatusRequest], count: 1, has_more: false },
      isLoading: false,
      error: null,
    } as any)

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )
    expect(screen.getByText('in_review')).toBeInTheDocument()
  })

  it('shows export error toast when export mutation fails', async () => {
    const user = userEvent.setup()
    const toastErrorSpy = vi.spyOn(toast, 'error').mockImplementation(vi.fn())

    exportMutateSpy = vi.fn((_variables, options) => {
      options?.onError?.(
        new Error('Download failed') as any,
        {} as any,
        {} as any
      )
    })
    vi.spyOn(hooks, 'useExportSB1103Request').mockReturnValue({
      mutate: exportMutateSpy,
      isPending: false,
    } as any)

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Export PDF'))

    expect(toastErrorSpy).toHaveBeenCalledWith(
      'Export failed',
      expect.objectContaining({ description: expect.any(String) })
    )
  })

  it('shows export success toast when export mutation succeeds', async () => {
    const user = userEvent.setup()
    const toastSuccessSpy = vi
      .spyOn(toast, 'success')
      .mockImplementation(vi.fn())

    exportMutateSpy = vi.fn((_variables, options) => {
      options?.onSuccess?.(undefined as any, {} as any, {} as any, {} as any)
    })
    vi.spyOn(hooks, 'useExportSB1103Request').mockReturnValue({
      mutate: exportMutateSpy,
      isPending: false,
    } as any)

    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Export PDF'))

    expect(toastSuccessSpy).toHaveBeenCalledWith(
      expect.stringMatching(/export triggered/i)
    )
  })

  it('shows update success and error toasts from update mutation callbacks', async () => {
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(vi.fn())
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(vi.fn())

    vi.spyOn(hooks, 'useUpdateSB1103Request').mockImplementation(
      (options: any) => ({
        mutate: () => {
          options?.onSuccess?.()
          options?.onError?.(new Error('Update blew up'))
        },
        isPending: false,
      })
    )

    const user = userEvent.setup()
    renderWithProviders(
      <SB1103RequestsTab propertyId={SAMPLE_PROPERTY_ID} propertyState="CA" />
    )

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByText('Mark as Delivered'))

    expect(successSpy).toHaveBeenCalledWith('Request updated')
    expect(errorSpy).toHaveBeenCalledWith(
      'Update failed',
      expect.objectContaining({ description: expect.any(String) })
    )
  })
})
