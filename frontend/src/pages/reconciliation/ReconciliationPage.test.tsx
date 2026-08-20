/**
 * Tests for ReconciliationPage component.
 *
 * Validates page rendering, data loading, error states, and user interactions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ReconciliationPage } from './ReconciliationPage'
import type { ReconciliationRow } from '@/features/reconciliation/types'
import type {
  Property,
  ReconciliationSnapshot,
} from '@/api/generated/types.gen'

// Mock dependencies
vi.mock('./hooks/useReconciliationData')
vi.mock('@/hooks/useViewport')
vi.mock('@/features/reconciliation/hooks')
vi.mock('@/features/reconciliation/components', async (importOriginal) => {
  const React = await import('react')
  const actual =
    await importOriginal<
      typeof import('@/features/reconciliation/components')
    >()

  return {
    ...actual,
    ReconciliationGrid: ({
      data,
      onTrace,
    }: {
      data: ReconciliationRow[]
      onTrace?: (row: ReconciliationRow) => void
    }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            const firstRow = data[0]
            if (firstRow) onTrace?.(firstRow)
          },
        },
        'Open trace mock'
      ),
  }
})
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: vi.fn(),
}))
vi.mock('@/api', () => ({
  useCampaigns: vi.fn(() => ({ data: undefined })),
  useSubmitForReview: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useReconciliationSnapshot: vi.fn(),
}))
vi.mock('@/features/export/hooks', () => ({
  useVarianceComparison: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useDetailAdvisor: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
}))

// Import mocked modules to access mock functions
import { useReconciliationData } from './hooks/useReconciliationData'
import { useViewport } from '@/hooks/useViewport'
import {
  useColumnConfig,
  useReconciliationValidation,
} from '@/features/reconciliation/hooks'
import { useSubscription } from '@/hooks/use-subscription'
import { useReconciliationSnapshot } from '@/api'

const mockUseReconciliationData = vi.mocked(useReconciliationData)
const mockUseViewport = vi.mocked(useViewport)
const mockUseColumnConfig = vi.mocked(useColumnConfig)
const mockUseReconciliationValidation = vi.mocked(useReconciliationValidation)
const mockUseSubscription = vi.mocked(useSubscription)
const mockUseReconciliationSnapshot = vi.mocked(useReconciliationSnapshot)

// Base shape for the useReconciliationData mock. Each test spreads this and
// overrides only the fields it exercises, so the full 13-field contract stays
// in one place.
function reconResult(
  overrides: Partial<ReturnType<typeof useReconciliationData>> = {}
): ReturnType<typeof useReconciliationData> {
  return {
    rows: [],
    property: null,
    status: 'draft',
    isFinalized: false,
    totalRecovery: 0,
    tenantCount: 0,
    snapshots: [],
    snapshotId: null,
    isPaused: false,
    refetch: vi.fn(),
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

// Sample test data
const mockProperty: Property = {
  id: 'prop-1',
  name: 'Test Property',
  organization_id: 'org-1',
  address: '123 Test St',
  city: 'Test City',
  state: 'CA',
  zip_code: '12345',
  property_type: 'Office',
  total_square_feet: 100000,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockRows: ReconciliationRow[] = [
  {
    type: 'expense_pool',
    id: 'pool-1',
    pool_name: 'Utilities',
    total_expenses: '10000.00',
  },
  {
    type: 'tenant_summary',
    id: 'tenant-1',
    tenant_id: '00000000-0000-0000-0000-000000000010',
    tenant_name: 'Acme Corp',
    total_recovery: '2375.00',
  },
]

const mockRowsMultipleTenants: ReconciliationRow[] = [
  {
    type: 'tenant_summary',
    id: 'tenant-1',
    tenant_id: '00000000-0000-0000-0000-000000000010',
    tenant_name: 'Acme Corp',
    total_recovery: '50000.00',
  },
  {
    type: 'tenant_summary',
    id: 'tenant-2',
    tenant_id: '00000000-0000-0000-0000-000000000011',
    tenant_name: 'TechStart Inc',
    total_recovery: '30000.00',
  },
]

// Helper to create wrapper with QueryClient and Router
function createWrapper(
  initialRoute = '/properties/prop-1/reconciliations?year=2024'
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route
              path="/properties/:propertyId/reconciliations"
              element={children}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('ReconciliationPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()

    // Default mock for useViewport - desktop view
    mockUseViewport.mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      width: 1920,
      height: 1080,
    })

    // Default mock for useColumnConfig
    mockUseColumnConfig.mockReturnValue({
      columnVisibility: {},
      toggleColumn: vi.fn(),
      resetToDefaults: vi.fn(),
    })

    // Default mock for useReconciliationValidation
    mockUseReconciliationValidation.mockReturnValue({
      canCalculate: true,
      unmappedPools: [],
      warnings: [],
      isLoading: false,
      mappingCounts: {},
    })

    mockUseSubscription.mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof useSubscription>)

    mockUseReconciliationSnapshot.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useReconciliationSnapshot>)

    // Default mock for useReconciliationData - success state with data
    mockUseReconciliationData.mockReturnValue(
      reconResult({
        rows: mockRows,
        property: mockProperty,
        totalRecovery: 9500.0,
        tenantCount: 1,
        snapshotId: 'snapshot-1',
      })
    )
  })

  describe('Loading State', () => {
    it('renders loading skeleton when data is loading', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({ isLoading: true })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0)
      expect(screen.queryByText('Test Property')).not.toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('renders error alert when data fetch fails', () => {
      const errorMessage = 'Failed to fetch reconciliation data'
      mockUseReconciliationData.mockReturnValue(
        reconResult({ isError: true, error: new Error(errorMessage) })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(
        screen.getByText('Error Loading Reconciliation')
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          "We couldn't load this reconciliation. Your data is safe. Go back and open it again."
        )
      ).toBeInTheDocument()
    })

    it('renders error when property not found', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRows,
          // property: null is the default — Property not found
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshotId: 'snapshot-1',
        })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(
        screen.getByText('Error Loading Reconciliation')
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          "We couldn't load this reconciliation. Your data is safe. Go back and open it again."
        )
      ).toBeInTheDocument()
    })

    it('renders generic error message when error is null', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({ isError: true /* error: null is the default */ })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(
        screen.getByText(
          "We couldn't load this reconciliation. Your data is safe. Go back and open it again."
        )
      ).toBeInTheDocument()
    })

    it('shows an offline notice (not "Property not found") when the fetch is paused', () => {
      // Backend unreachable: the data hook pauses both queries, so property is
      // null with no error. The page must not imply the property was deleted.
      mockUseReconciliationData.mockReturnValue(reconResult({ isPaused: true }))

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(screen.getByText("Can't reach the server")).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Error Loading Reconciliation')
      ).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('renders empty state when no reconciliation data exists', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({ property: mockProperty /* rows: [] is the default */ })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(
        screen.getByText('No reconciliation snapshots found.')
      ).toBeInTheDocument()
      expect(
        screen.getByText(`${mockProperty.name} - 2024 Reconciliation`)
      ).toBeInTheDocument()
    })
  })

  describe('Success State with Data', () => {
    it('renders property name and year in header', () => {
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      // Use getAllByText since ReconciliationHeader also renders these texts
      const headers = screen.getAllByText('Test Property - 2024 Reconciliation')
      expect(headers.length).toBeGreaterThan(0)

      // Raw property UUID must not be shown in the page header (F-181)
      expect(screen.queryByText(/Property ID:/)).not.toBeInTheDocument()
    })

    it('renders calculate button in header', () => {
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      const calculateButtons = screen.getAllByText(/reconcile/i)
      expect(calculateButtons.length).toBeGreaterThan(0)
    })

    it('renders finalize button in header', () => {
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(screen.getByTestId('finalize-button')).toBeInTheDocument()
    })

    it('disables calculate button when reconciliation is finalized', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRows,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshotId: 'snapshot-1',
        })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      // The header "Run reconciliation" button should be disabled when finalized.
      // Query by stable test id so the assertion is independent of button copy.
      const calculateButton = screen.getByTestId('calculate-button')
      expect(calculateButton).toBeDisabled()
    })

    it('disables finalize button when reconciliation is already finalized', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRows,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshotId: 'snapshot-1',
        })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      // Get all finalize buttons (header button + stepper button)
      const finalizeButtons = screen.getAllByRole('button', {
        name: /finalize/i,
      })
      // The FinalizeButton in header should be disabled when finalized
      const primaryButton = finalizeButtons.find((btn) =>
        btn.hasAttribute('disabled')
      )
      expect(primaryButton).toBeDisabled()
    })

    it('review callout says "before finalizing" while a run is not yet finalized', () => {
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(screen.getByText(/before finalizing/i)).toBeInTheDocument()
      expect(
        screen.queryByText(/before you send tenant packets/i)
      ).not.toBeInTheDocument()
    })

    it('review callout switches to "before you send tenant packets" once finalized', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRows,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshotId: 'snapshot-1',
        })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })

      expect(
        screen.getByText(/before you send tenant packets/i)
      ).toBeInTheDocument()
      expect(screen.queryByText(/before finalizing/i)).not.toBeInTheDocument()
    })

    it('renders column config menu on desktop', () => {
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      // Column config menu should be rendered (verified by checking it's in the DOM)
      // The actual button might be hidden in a dropdown, so we just verify it rendered
      expect(mockUseColumnConfig).toHaveBeenCalled()
    })

    it('does not render column config menu on mobile', () => {
      mockUseViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
        width: 375,
        height: 667,
      })

      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      // On mobile, ColumnConfigMenu should not be in the DOM
      // We can verify by checking that ReconciliationMobileView is rendered instead
      expect(
        container.querySelector('[data-testid="reconciliation-mobile-view"]')
      ).toBeInTheDocument()
    })

    it('uses current year when year param not provided', () => {
      const currentYear = new Date().getFullYear().toString()

      render(<ReconciliationPage />, {
        wrapper: createWrapper('/properties/prop-1/reconciliations'),
      })

      expect(mockUseReconciliationData).toHaveBeenCalledWith({
        propertyId: 'prop-1',
        year: currentYear,
      })
    })

    it('uses year from search params when provided', () => {
      render(<ReconciliationPage />, {
        wrapper: createWrapper('/properties/prop-1/reconciliations?year=2023'),
      })

      expect(mockUseReconciliationData).toHaveBeenCalledWith({
        propertyId: 'prop-1',
        year: '2023',
      })
    })

    it('shows starter lease terms note in the trace drawer', async () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: [mockRows[1]],
          property: mockProperty,
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshots: [
            {
              id: 'snapshot-uuid-001',
              lease_id: '00000000-0000-0000-0000-000000000010',
              tenant_name: 'Acme Corp',
            },
          ],
          snapshotId: 'snapshot-uuid-001',
        })
      )
      mockUseReconciliationSnapshot.mockReturnValue({
        data: {
          id: 'snapshot-uuid-001',
          property_id: 'prop-1',
          lease_id: '00000000-0000-0000-0000-000000000010',
          period_start_date: '2024-01-01',
          period_end_date: '2024-12-31',
          total_operating_expenses: '100000.00',
          grossed_up_expenses: '100000.00',
          base_year_amount: '0.00',
          tenant_share_before_cap: '2375.00',
          tenant_share_after_cap: '2375.00',
          admin_fee: '0.00',
          total_recovery: '2375.00',
          calculation_trace: [
            {
              step_order: 1,
              step_name: 'Estimated starter terms',
              input_values: {},
              operation: 'tenant SF / property SF',
              output_value: '0.1',
            },
          ],
          lease_terms_snapshot: {
            estimated_terms_note:
              'We used tenant SF divided by property SF. Add lease terms to firm this up.',
          },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          is_finalized: false,
        } as ReconciliationSnapshot,
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useReconciliationSnapshot>)

      const user = userEvent.setup()
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      await user.click(screen.getByRole('button', { name: 'Open trace mock' }))

      expect(await screen.findByText('Starter lease terms')).toBeInTheDocument()
      expect(
        screen.getByText(
          'We used tenant SF divided by property SF. Add lease terms to firm this up.'
        )
      ).toBeInTheDocument()
    })
  })

  describe('Responsive Behavior', () => {
    it('renders desktop grid on desktop viewport', () => {
      mockUseViewport.mockReturnValue({
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        width: 1920,
        height: 1080,
      })

      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      // Desktop should NOT render mobile view
      expect(
        container.querySelector('[data-testid="reconciliation-mobile-view"]')
      ).not.toBeInTheDocument()
    })

    it('renders mobile view on mobile viewport', () => {
      mockUseViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
        width: 375,
        height: 667,
      })

      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      expect(
        container.querySelector('[data-testid="reconciliation-mobile-view"]')
      ).toBeInTheDocument()
    })
  })

  describe('TenantSummary wiring', () => {
    it('renders TenantSummary panel on desktop when rows contain tenant data', () => {
      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      expect(
        container.querySelector('[data-testid="tenant-summary"]')
      ).toBeInTheDocument()
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    it('renders TenantSummary with correct pro-rata shares for multiple tenants', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRowsMultipleTenants,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 80000,
          tenantCount: 2,
          snapshotId: 'snapshot-1',
        })
      )

      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      expect(
        container.querySelector('[data-testid="tenant-summary"]')
      ).toBeInTheDocument()
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
      // Pro-rata: 50000/80000=62.50% and 30000/80000=37.50%
      expect(screen.getByText('62.50%')).toBeInTheDocument()
      expect(screen.getByText('37.50%')).toBeInTheDocument()
    })

    it('renders TenantSummary with empty tenant list when no tenant rows exist', () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: [{ type: 'expense_pool', id: 'pool-1', pool_name: 'CAM' }],
          property: mockProperty,
        })
      )

      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      expect(
        container.querySelector('[data-testid="tenant-summary"]')
      ).toBeInTheDocument()
    })

    it('does not render TenantSummary on mobile viewport', () => {
      mockUseViewport.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
        width: 375,
        height: 667,
      })

      const { container } = render(<ReconciliationPage />, {
        wrapper: createWrapper(),
      })

      expect(
        container.querySelector('[data-testid="tenant-summary"]')
      ).not.toBeInTheDocument()
    })
  })

  describe('DemandLetterButton wiring', () => {
    it('passes total_recovery to DemandLetterButton so eligible tenants appear in panel', async () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRows,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshotId: 'snapshot-1',
        })
      )

      render(<ReconciliationPage />, { wrapper: createWrapper() })
      const user = userEvent.setup()

      // Click the Demand Letter button to open the panel
      await user.click(screen.getByRole('button', { name: /more/i }))
      const demandLetterBtn = screen.getByTestId('demand-letter-button')
      await user.click(demandLetterBtn)

      // Panel step 1: tenant with total_recovery='2375.00' should appear in select
      // Without the fix, eligibleTenants=[] and "No tenants..." message shows
      await waitFor(() =>
        expect(
          screen.queryByText(/No tenants with outstanding recovery amounts/i)
        ).not.toBeInTheDocument()
      )
      // Acme Corp should appear as an eligible tenant option
      const tenantSelect = screen.getByTestId('tenant-select')
      expect(within(tenantSelect).getByText(/Acme Corp/i)).toBeInTheDocument()
    })

    it('tenant select option value is snapshot id not lease id', async () => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRows,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 9500.0,
          tenantCount: 1,
          snapshots: [
            {
              id: 'snapshot-uuid-001',
              lease_id: '00000000-0000-0000-0000-000000000010',
            },
          ],
          snapshotId: 'snapshot-uuid-001',
        })
      )
      render(<ReconciliationPage />, { wrapper: createWrapper() })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /more/i }))
      await user.click(screen.getByTestId('demand-letter-button'))
      await waitFor(() =>
        expect(screen.getByTestId('tenant-select')).toBeInTheDocument()
      )
      const option = screen.getByRole('option', {
        name: /Acme Corp/i,
      }) as HTMLOptionElement
      expect(option.value).toBe('snapshot-uuid-001')
    })
  })

  describe('NOI Impact wiring', () => {
    beforeEach(() => {
      mockUseReconciliationData.mockReturnValue(
        reconResult({
          rows: mockRowsMultipleTenants,
          property: mockProperty,
          status: 'finalized',
          isFinalized: true,
          totalRecovery: 80000,
          tenantCount: 2,
          snapshotId: 'snapshot-1',
        })
      )
      mockUseSubscription.mockReturnValue({
        data: {
          id: 'sub_active',
          organization_id: 'org-1',
          plan: 'growth_v2',
          status: 'active',
          building_count: 1,
          current_period_start: '2024-01-01T00:00:00Z',
          current_period_end: '2024-12-31T00:00:00Z',
          cancel_at_period_end: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        isLoading: false,
      } as ReturnType<typeof useSubscription>)
    })

    it('opens the unlocked NOI Impact panel from a finalized reconciliation', async () => {
      const user = userEvent.setup()
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      await user.click(screen.getByTestId('noi-impact-button'))

      expect(screen.getByTestId('noi-impact-panel')).toBeInTheDocument()
      expect(screen.getByTestId('stat-recovery-amount')).toHaveTextContent(
        '$80,000'
      )
      expect(screen.getByTestId('stat-noi-lift')).toHaveTextContent('$80,000')
      expect(screen.getByTestId('stat-asset-value-lift')).toHaveTextContent(
        '$1,142,857'
      )
      expect(screen.queryByTestId('noi-impact-locked')).not.toBeInTheDocument()
      expect(screen.getByTestId('export-board-button')).toBeInTheDocument()
    })

    it('updates asset value lift when the cap rate slider changes', async () => {
      const user = userEvent.setup()
      render(<ReconciliationPage />, { wrapper: createWrapper() })

      await user.click(screen.getByTestId('noi-impact-button'))
      const assetValue = screen.getByTestId('stat-asset-value-lift')
      expect(assetValue).toHaveTextContent('$1,142,857')

      fireEvent.change(screen.getByTestId('cap-rate-slider'), {
        target: { value: '80' },
      })

      expect(assetValue).toHaveTextContent('$1,000,000')
      expect(assetValue).toHaveTextContent('At 8.0% cap rate')
    })
  })

  describe('Variance Report Button', () => {
    it('renders variance report button in toolbar', async () => {
      render(<ReconciliationPage />, { wrapper: createWrapper() })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: /more/i }))
      expect(screen.getByTestId('variance-report-button')).toBeInTheDocument()
    })

    it('opens export panel variance tab when variance button clicked', async () => {
      const user = userEvent.setup()
      render(<ReconciliationPage />, { wrapper: createWrapper() })
      await user.click(screen.getByRole('button', { name: /more/i }))
      await user.click(screen.getByTestId('variance-report-button'))
      expect(screen.getByTestId('variance-report')).toBeInTheDocument()
    })

    it('explains why Demand Letter / Tax Protest are disabled before finalize', async () => {
      const user = userEvent.setup()
      render(<ReconciliationPage />, { wrapper: createWrapper() })
      await user.click(screen.getByRole('button', { name: /more/i }))

      const demandLetter = screen.getByTestId('demand-letter-button')
      const taxProtest = screen.getByTestId('tax-protest-button')
      expect(demandLetter).toHaveAttribute('aria-disabled', 'true')
      expect(taxProtest).toHaveAttribute('aria-disabled', 'true')
      // A disabled item must say why, so the user is not left guessing.
      expect(demandLetter).toHaveTextContent(
        'Finalize the reconciliation first'
      )
      expect(taxProtest).toHaveTextContent('Finalize the reconciliation first')
    })
  })
})
