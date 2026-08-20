import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import type React from 'react'
import { BrowserRouter } from 'react-router-dom'

import { ReconciliationKickoffModal } from './ReconciliationKickoffModal'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/api/generated/sdk.gen', () => ({
  listPropertiesApiV1PropertiesGet: vi.fn(),
  getLeakageApiV1LeakagePropertyIdGet: vi.fn(),
}))

vi.mock('@/api/hooks', () => ({
  useLeases: vi.fn(),
}))

vi.mock('@/features/reconciliation/hooks/useReconciliationValidation', () => ({
  useReconciliationValidation: vi.fn(),
}))

vi.mock('@/features/reconciliation/hooks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/reconciliation/hooks')>()
  return { ...actual, useReconciliationKickoffState: vi.fn() }
})

vi.mock('./CalculateButton', () => ({
  CalculateButton: ({
    disabled,
    onCalculateSuccess,
    onFixMappings,
  }: {
    disabled?: boolean
    onCalculateSuccess?: () => void
    onFixMappings?: () => void
  }) => (
    <div>
      <button disabled={disabled}>Calculate</button>
      <button onClick={() => onCalculateSuccess?.()} type="button">
        Complete
      </button>
      <button onClick={() => onFixMappings?.()} type="button">
        Fix mappings
      </button>
    </div>
  ),
}))

vi.mock('./SharedGlUpload', () => ({
  SharedGlUpload: ({
    onUploaded,
  }: {
    onUploaded: (batchId: string) => void
  }) => (
    <button onClick={() => onUploaded('batch-1')} type="button">
      Upload GL
    </button>
  ),
}))

function renderModal(
  props: Partial<React.ComponentProps<typeof ReconciliationKickoffModal>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ReconciliationKickoffModal
          open={true}
          onOpenChange={vi.fn()}
          year={2025}
          {...props}
        />
      </QueryClientProvider>
    </BrowserRouter>
  )
}

describe('ReconciliationKickoffModal', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
    const sdk = await import('@/api/generated/sdk.gen')
    const hooks = await import('@/api/hooks')
    const validation =
      await import('@/features/reconciliation/hooks/useReconciliationValidation')

    vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
      data: {
        data: [
          {
            id: 'prop-1',
            name: 'Tower',
            address_line1: '1 Main',
            city: 'Denver',
            state: 'CO',
            postal_code: '80202',
            total_rentable_sqft: '1000',
            total_usable_sqft: '900',
            common_area_sqft: '100',
            organization_id: 'org-1',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    } as never)
    vi.mocked(sdk.getLeakageApiV1LeakagePropertyIdGet).mockResolvedValue({
      data: {
        property_id: 'prop-1',
        period_start: '2025-01-01',
        period_end: '2025-12-31',
        capveri_calculated: '0',
        actual_billed: '0',
        leakage: '0',
        leakage_pct: 0,
        has_reconciliation_data: false,
        has_gl_data: false,
        has_billing_data: false,
        breakdown: [],
      },
    } as never)
    vi.mocked(hooks.useLeases).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(validation.useReconciliationValidation).mockReturnValue({
      unmappedPools: [],
      isLoading: false,
      canCalculate: true,
      warnings: [],
      mappingCounts: {},
    })

    const reconciliationHooks = await import('@/features/reconciliation/hooks')
    vi.mocked(
      reconciliationHooks.useReconciliationKickoffState
    ).mockReturnValue({
      isLoading: false,
      isPaused: false,
      refetch: vi.fn(),
      hasLeases: false,
      hasGlData: false,
      isReady: false,
      unmappedPools: [],
    })
  })

  afterEach(() => {
    // Restore connectivity in case a test forced the offline path.
    onlineManager.setOnline(true)
  })

  it('requires property selection for global entry', async () => {
    renderModal()
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /property/i })
      ).toBeInTheDocument()
    })
    expect(screen.getByText(/select a property/i)).toBeInTheDocument()
  })

  it('shows an offline notice instead of an empty property dropdown when the properties fetch is paused', async () => {
    // Force the properties query to pause (unreachable backend) before render.
    // With networkMode 'online', an offline manager makes TanStack Query pause
    // the fetch immediately — the queryFn never runs, so the beforeEach mock is
    // never consulted and `propertiesData` stays undefined.
    onlineManager.setOnline(false)

    renderModal()

    // Offline notice must appear in place of the property selector.
    // ErrorState swaps in its lost-connection copy when `offline` is set.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()

    // The empty property dropdown must NOT render (it would read as
    // "you have no properties").
    expect(
      screen.queryByRole('combobox', { name: /property/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/select a property to continue/i)).toBeNull()
  })

  it('renders property options when selector opens', async () => {
    const user = userEvent.setup()
    renderModal()
    const trigger = await screen.findByRole('combobox', { name: /property/i })
    await user.click(trigger)
    expect(
      await screen.findByRole('option', { name: 'Tower' })
    ).toBeInTheDocument()
  })

  it('shows missing requirements and disables calculate', async () => {
    renderModal({ initialPropertyId: 'prop-1' })
    await waitFor(() => {
      expect(screen.getByText('Add tenant terms')).toBeInTheDocument()
    })
    expect(screen.getByText(/add lease pdfs later/i)).toBeInTheDocument()
    expect(screen.getByText(/upload gl data/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate' })).toBeDisabled()
  })

  it('marks GL step complete after upload', async () => {
    const user = userEvent.setup()
    renderModal({ initialPropertyId: 'prop-1' })
    await user.click(await screen.findByRole('button', { name: /upload gl/i }))
    expect(screen.getByText(/gl uploaded/i)).toBeInTheDocument()
  })

  it('marks tenant terms complete when active leases exist', async () => {
    const reconciliationHooks = await import('@/features/reconciliation/hooks')
    vi.mocked(
      reconciliationHooks.useReconciliationKickoffState
    ).mockReturnValue({
      isLoading: false,
      isPaused: false,
      refetch: vi.fn(),
      hasLeases: true,
      hasGlData: false,
      isReady: false,
      unmappedPools: [],
    })

    renderModal({ initialPropertyId: 'prop-1' })

    expect(await screen.findByText('Tenant terms found')).toBeInTheDocument()
  })

  it('navigates to tenant terms and pools from requirement actions', async () => {
    const user = userEvent.setup()
    renderModal({ initialPropertyId: 'prop-1' })

    await user.click(await screen.findByRole('button', { name: /add terms/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/properties/prop-1?tab=leases')

    await user.click(screen.getByRole('button', { name: /fix mappings/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/properties/prop-1?tab=pools')
  })

  it('closes and navigates after calculate success', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onComplete = vi.fn()
    renderModal({
      initialPropertyId: 'prop-1',
      onOpenChange,
      onComplete,
    })

    await user.click(await screen.findByRole('button', { name: /complete/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onComplete).toHaveBeenCalledWith('prop-1', 2025)
    expect(mockNavigate).toHaveBeenCalledWith(
      '/properties/prop-1/reconciliations?year=2025'
    )
  })

  it('handles property list query errors without crashing', async () => {
    const sdk = await import('@/api/generated/sdk.gen')
    vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
      error: { detail: 'failed' },
    } as never)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    renderModal()
    expect(
      await screen.findByRole('combobox', { name: /property/i })
    ).toBeInTheDocument()
    consoleErrorSpy.mockRestore()
  })

  it('shows offline notice instead of misleading prerequisites when kickoff state is paused', async () => {
    const user = userEvent.setup()
    const mockRefetch = vi.fn()
    const reconciliationHooks = await import('@/features/reconciliation/hooks')
    vi.mocked(
      reconciliationHooks.useReconciliationKickoffState
    ).mockReturnValue({
      isLoading: false,
      isPaused: true,
      refetch: mockRefetch,
      hasLeases: false,
      hasGlData: false,
      isReady: false,
      unmappedPools: [],
    })

    renderModal({ initialPropertyId: 'prop-1' })

    // Offline notice must appear
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()

    // Misleading prerequisites copy must not appear: neither the
    // "Run reconciliation" card nor the "What we need" checklist (which would
    // render false hasLeases/hasGlData states off un-loaded data).
    expect(
      screen.queryByText(/add tenant terms and gl data first/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByText('What we need')).not.toBeInTheDocument()
    expect(screen.queryByText('Add tenant terms')).not.toBeInTheDocument()
    expect(screen.queryByText('Upload GL data')).not.toBeInTheDocument()

    // Try again must call refetch
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockRefetch).toHaveBeenCalled()
  })
})
