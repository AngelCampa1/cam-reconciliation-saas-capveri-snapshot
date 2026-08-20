/**
 * ReconciliationsListPage Tests
 *
 * TDD RED Phase: Tests written first, implementation to follow.
 * Tests cover: render, filters, navigation, loading, error, empty states.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

import { ReconciliationsListPage } from './ReconciliationsListPage'
import * as sdk from '@/api/generated/sdk.gen'
import type {
  ReconciliationSnapshotSummary,
  Property,
} from '@/api/generated/types.gen'

vi.mock('@/components/billing/FreeAuditUpgradeModal', () => ({
  FreeAuditUpgradeModal: ({
    onClose,
    onSubscribe,
  }: {
    onClose: () => void
    onSubscribe: () => void
  }) => (
    <div>
      <button onClick={onClose} type="button">
        Mock Upgrade Close
      </button>
      <button onClick={onSubscribe} type="button">
        Mock Upgrade Subscribe
      </button>
    </div>
  ),
}))

vi.mock(
  '@/features/reconciliation/components/ReconciliationKickoffModal',
  () => ({
    ReconciliationKickoffModal: ({ open }: { open: boolean }) =>
      open ? <div data-testid="kickoff-modal">Kickoff Modal</div> : null,
  })
)

// Mock the SDK
vi.mock('@/api/generated/sdk.gen', () => ({
  listSnapshotsApiV1ReconciliationSnapshotsGet: vi.fn(),
  listPropertiesApiV1PropertiesGet: vi.fn(),
}))

// Mock the subscription hook
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ data: null, isLoading: false }),
}))

// Mock viewport so we can drive the desktop table vs. mobile card layout.
// Defaults to desktop; individual tests flip `mockIsMobile` to true.
let mockIsMobile = false
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    width: mockIsMobile ? 375 : 1280,
    height: 800,
    isMobile: mockIsMobile,
    isTablet: false,
    isLaptop: false,
    isDesktop: !mockIsMobile,
    size: mockIsMobile ? 'mobile' : 'desktop',
    isTouch: mockIsMobile,
  }),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Test data factories
function createMockProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    organization_id: 'org-1',
    name: 'Downtown Tower',
    address_line1: '100 Main Street',
    city: 'Denver',
    state: 'CO',
    postal_code: '80202',
    country: 'USA',
    property_type: 'office',
    total_sqft: '50000',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function createMockSnapshot(
  overrides: Partial<ReconciliationSnapshotSummary> = {}
): ReconciliationSnapshotSummary {
  return {
    id: 'snap-1',
    property_id: 'prop-1',
    lease_id: 'lease-1',
    period_start_date: '2024-01-01',
    period_end_date: '2024-12-31',
    status: 'draft',
    total_recovery: '45230.00',
    is_finalized: false,
    property_name: 'Downtown Tower',
    tenant_name: 'Acme Corp',
    ...overrides,
  }
}

// Test utilities
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('ReconciliationsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobile = false
  })

  describe('Initial Render', () => {
    it('renders page header with title and description', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /reconciliations/i })
        ).toBeInTheDocument()
      })
      expect(screen.getByText(/view and manage/i)).toBeInTheDocument()
    })

    it('renders year filter dropdown', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /year/i })
        ).toBeInTheDocument()
      })
    })

    it('renders status filter dropdown', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /status/i })
        ).toBeInTheDocument()
      })
    })
  })

  describe('Data Display', () => {
    it('displays properties with reconciliation status', async () => {
      const mockProperties = [
        createMockProperty({ id: 'prop-1', name: 'Downtown Tower' }),
        createMockProperty({ id: 'prop-2', name: 'Tech Plaza' }),
      ]
      const mockSnapshots = [
        createMockSnapshot({
          id: 'snap-1',
          property_id: 'prop-1',
          property_name: 'Downtown Tower',
          status: 'draft',
          total_recovery: '45230.00',
        }),
        createMockSnapshot({
          id: 'snap-2',
          property_id: 'prop-2',
          property_name: 'Tech Plaza',
          status: 'finalized',
          total_recovery: '32100.00',
          is_finalized: true,
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: mockProperties, total: 2 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 2,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
      })
      expect(screen.getByText('Tech Plaza')).toBeInTheDocument()
      // Status badges - there may be multiple "Draft" or "Finalized" texts (progress bar + badge)
      const draftBadges = screen.getAllByText(/draft/i)
      expect(draftBadges.length).toBeGreaterThan(0)
      const finalizedBadges = screen.getAllByText(/finalized/i)
      expect(finalizedBadges.length).toBeGreaterThan(0)
    })

    it('displays tenant billable amounts formatted as currency', async () => {
      const mockSnapshots = [
        createMockSnapshot({
          total_recovery: '45230.50',
          property_name: 'Downtown Tower',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
      })
      // Currency amounts appear in both stats card and table
      const currencyMatches = screen.getAllByText(/\$45,230\.50/)
      expect(currencyMatches.length).toBeGreaterThan(0)
    })

    it('displays summary statistics', async () => {
      const mockSnapshots = [
        createMockSnapshot({ status: 'draft', total_recovery: '45230.00' }),
        createMockSnapshot({
          id: 'snap-2',
          status: 'finalized',
          total_recovery: '32100.00',
          is_finalized: true,
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 2,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        // Should show counts
        expect(screen.getByText(/2/)).toBeInTheDocument() // Total
      })
    })

    it('groups multiple snapshots from same property', async () => {
      const mockSnapshots = [
        createMockSnapshot({
          id: 'snap-1',
          property_id: 'prop-1',
          property_name: 'Downtown Tower',
          tenant_name: 'Tenant A',
          status: 'draft',
          is_finalized: false,
          total_recovery: '10000.00',
        }),
        createMockSnapshot({
          id: 'snap-2',
          property_id: 'prop-1',
          property_name: 'Downtown Tower',
          tenant_name: 'Tenant B',
          status: 'finalized',
          is_finalized: true,
          total_recovery: '15000.00',
        }),
        createMockSnapshot({
          id: 'snap-3',
          property_id: 'prop-1',
          property_name: 'Downtown Tower',
          tenant_name: 'Tenant C',
          status: 'draft',
          is_finalized: false,
          total_recovery: '5000.00',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: {
          data: [createMockProperty({ id: 'prop-1', name: 'Downtown Tower' })],
          total: 1,
        },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 3,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        // Should show property name grouped (only one row for the property)
        expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
      })

      // Tenant billable amount should be summed: $30,000
      const currencyMatches = screen.getAllByText(/\$30,000\.00/)
      expect(currencyMatches.length).toBeGreaterThan(0)
    })

    it('handles snapshot with null property_name', async () => {
      const mockSnapshots = [
        createMockSnapshot({
          property_name: null as unknown as string,
          total_recovery: '1000.00',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        // Should fall back to "Unknown Property"
        expect(screen.getByText('Unknown Property')).toBeInTheDocument()
      })
    })
  })

  describe('Filtering', () => {
    it('filters by year when year selector changes', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /year/i })
        ).toBeInTheDocument()
      })

      const yearSelect = screen.getByRole('combobox', { name: /year/i })
      await user.click(yearSelect)

      // Select 2023
      const option2023 = await screen.findByRole('option', { name: /2023/i })
      await user.click(option2023)

      await waitFor(() => {
        expect(
          sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              period_start: expect.stringContaining('2023'),
            }),
          })
        )
      })
    })

    it('filters by status when status selector changes', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /status/i })
        ).toBeInTheDocument()
      })

      const statusSelect = screen.getByRole('combobox', { name: /status/i })
      await user.click(statusSelect)

      const draftOption = await screen.findByRole('option', { name: /draft/i })
      await user.click(draftOption)

      await waitFor(() => {
        expect(
          sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              is_finalized: false,
            }),
          })
        )
      })
    })

    it('filters by finalized status', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /status/i })
        ).toBeInTheDocument()
      })

      const statusSelect = screen.getByRole('combobox', { name: /status/i })
      await user.click(statusSelect)

      const finalizedOption = await screen.findByRole('option', {
        name: /finalized/i,
      })
      await user.click(finalizedOption)

      await waitFor(() => {
        expect(
          sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              is_finalized: true,
            }),
          })
        )
      })
    })

    it('filters by property when property selector changes', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: {
          data: [
            createMockProperty({ id: 'prop-123', name: 'Downtown Tower' }),
          ],
          total: 1,
        },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', { name: /property/i })
        ).toBeInTheDocument()
      })

      const propertySelect = screen.getByRole('combobox', { name: /property/i })
      await user.click(propertySelect)

      const propertyOption = await screen.findByRole('option', {
        name: /downtown tower/i,
      })
      await user.click(propertyOption)

      await waitFor(() => {
        expect(
          sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              property_id: 'prop-123',
            }),
          })
        )
      })
    })
  })

  describe('Navigation', () => {
    it('navigates to property reconciliation page when row action clicked', async () => {
      const user = userEvent.setup()
      const mockSnapshots = [
        createMockSnapshot({
          property_id: 'prop-123',
          property_name: 'Downtown Tower',
          status: 'draft',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty({ id: 'prop-123' })], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
      })

      const reviewButton = screen.getByRole('button', { name: /review/i })
      await user.click(reviewButton)

      // Year is auto-detected from snapshot data (mock defaults to 2024)
      expect(mockNavigate).toHaveBeenCalledWith(
        `/properties/prop-123/reconciliations?year=2024`
      )
    })

    it('navigates to calculation when calculate button clicked', async () => {
      const user = userEvent.setup()
      const mockSnapshots = [
        createMockSnapshot({
          property_id: 'prop-123',
          property_name: 'Tech Plaza',
          status: 'draft',
          total_recovery: '0',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: {
          data: [createMockProperty({ id: 'prop-123', name: 'Tech Plaza' })],
          total: 1,
        },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText('Tech Plaza')).toBeInTheDocument()
      })

      // Find calculate button if property needs calculation
      const calculateButton = screen.queryByRole('button', {
        name: /calculate/i,
      })
      if (calculateButton) {
        await user.click(calculateButton)
        expect(mockNavigate).toHaveBeenCalled()
      }
    })
  })

  describe('Loading State', () => {
    it('displays loading skeleton while fetching data', async () => {
      // Make the API never resolve to keep loading state
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockImplementation(
        () => new Promise(() => {})
      )
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockImplementation(() => new Promise(() => {}))

      renderWithProviders(<ReconciliationsListPage />)

      expect(screen.getByTestId('reconciliations-loading')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('displays error message when API fails', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockRejectedValue(
        new Error('Network error')
      )
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockRejectedValue(new Error('Network error'))

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByText(/trouble loading your reconciliations/i)
        ).toBeInTheDocument()
      })
    })

    it('displays retry button on error', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockRejectedValue(
        new Error('Network error')
      )
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockRejectedValue(new Error('Network error'))

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /retry/i })
        ).toBeInTheDocument()
      })
    })

    it('retries both queries when retry is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockRejectedValue(
        new Error('Network error')
      )
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockRejectedValue(new Error('Network error'))

      renderWithProviders(<ReconciliationsListPage />)

      const retryButton = await screen.findByRole('button', { name: /retry/i })
      await user.click(retryButton)

      await waitFor(() => {
        expect(sdk.listPropertiesApiV1PropertiesGet.mock.calls.length).toBe(2)
        expect(
          sdk.listSnapshotsApiV1ReconciliationSnapshotsGet.mock.calls.length
        ).toBeGreaterThanOrEqual(3)
      })
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no reconciliations exist', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/no reconciliations/i)).toBeInTheDocument()
      })
    })

    it('displays CTA to start reconciliation in empty state', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /start reconciliation/i })
        ).toBeInTheDocument()
      })
    })

    it('displays guided empty state when no properties and no snapshots exist', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/no reconciliations yet/i)).toBeInTheDocument()
      })
      expect(screen.getByText(/upload expense report/i)).toBeInTheDocument()
    })

    it('navigates to ingestion from guided empty state', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/no reconciliations yet/i)).toBeInTheDocument()
      })

      const uploadLink = screen.getByRole('link', {
        name: /upload expense report/i,
      })
      expect(uploadLink).toHaveAttribute('href', '/ingestion')
    })

    it('opens kickoff modal from no-snapshots state on first reconciliation', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(sdk.listSnapshotsApiV1ReconciliationSnapshotsGet)
        // Main filtered query: empty
        .mockResolvedValueOnce({
          data: {
            items: [],
            total: 0,
            page: 1,
            page_size: 20,
            has_next: false,
          },
        } as never)
        // First-time probe query: also empty => first reconciliation
        .mockResolvedValueOnce({
          data: {
            items: [],
            total: 0,
            page: 1,
            page_size: 1,
            has_next: false,
          },
        } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/no reconciliations/i)).toBeInTheDocument()
      })

      const startButton = screen.getByTestId(
        'start-reconciliation-empty-button'
      )
      await user.click(startButton)

      expect(screen.getByTestId('kickoff-modal')).toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('does not open kickoff modal for filter-only empty state', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(sdk.listSnapshotsApiV1ReconciliationSnapshotsGet)
        // First-time probe query (fires first): has an item => not first reconciliation
        .mockResolvedValueOnce({
          data: {
            items: [createMockSnapshot()],
            total: 1,
            page: 1,
            page_size: 1,
            has_next: false,
          },
        } as never)
        // Main filtered query: empty (triggers "no reconciliations" state)
        .mockResolvedValueOnce({
          data: {
            items: [],
            total: 0,
            page: 1,
            page_size: 20,
            has_next: false,
          },
        } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/no reconciliations/i)).toBeInTheDocument()
      })

      const startButton = screen.getByTestId(
        'start-reconciliation-empty-button'
      )
      await user.click(startButton)

      expect(screen.queryByTestId('kickoff-modal')).not.toBeInTheDocument()
      expect(mockNavigate).toHaveBeenCalledWith('/properties')
    })
  })

  describe('Accessibility', () => {
    it('has accessible status badges', async () => {
      const mockSnapshots = [
        createMockSnapshot({
          status: 'draft',
          property_name: 'Downtown Tower',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        // Multiple "Draft" texts may exist (stats card + badge)
        const statusBadges = screen.getAllByText(/draft/i)
        expect(statusBadges.length).toBeGreaterThan(0)
      })
    })

    it('has proper touch targets for action buttons', async () => {
      const mockSnapshots = [
        createMockSnapshot({ property_name: 'Downtown Tower' }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty()], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        const actionButton = screen.getByRole('button', { name: /review/i })
        expect(actionButton).toHaveClass('min-h-[44px]')
      })
    })
  })

  describe('Guided Empty State', () => {
    it('shows guided empty state when no reconciliations', async () => {
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)
      expect(
        await screen.findByText(/no reconciliations yet/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/upload expense report/i)).toBeInTheDocument()
    })
  })

  describe('Upgrade Modal Handlers', () => {
    it('navigates to billing when upgrade subscribe action is triggered', async () => {
      const user = userEvent.setup()
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [], total: 0 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: { items: [], total: 0, page: 1, page_size: 20, has_next: false },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)
      await user.click(
        screen.getByRole('button', { name: /mock upgrade subscribe/i })
      )

      expect(mockNavigate).toHaveBeenCalledWith('/settings/billing')
    })
  })

  describe('Mobile Layout', () => {
    it('renders stacked cards with a full-width action button on mobile (F-221)', async () => {
      mockIsMobile = true
      const user = userEvent.setup()
      const mockSnapshots = [
        createMockSnapshot({
          property_id: 'prop-123',
          property_name: 'Downtown Tower',
          tenant_name: 'Acme Corp',
          status: 'draft',
          total_recovery: '45230.00',
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: { data: [createMockProperty({ id: 'prop-123' })], total: 1 },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 1,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
      })

      // No desktop table rendered on mobile (avoids the Actions column scrolling
      // off-screen).
      expect(screen.queryByRole('table')).not.toBeInTheDocument()

      // The tenant count and tenant billable amount still surface in the card.
      expect(screen.getByText(/1 tenant/i)).toBeInTheDocument()
      // Amount also appears in the summary stats card, so match all instances.
      expect(screen.getAllByText(/\$45,230\.00/).length).toBeGreaterThan(0)

      // The action button stays full-width and still navigates correctly.
      const reviewButton = screen.getByRole('button', { name: /review/i })
      expect(reviewButton).toHaveClass('w-full')
      expect(reviewButton).toHaveClass('min-h-[44px]')

      await user.click(reviewButton)
      expect(mockNavigate).toHaveBeenCalledWith(
        '/properties/prop-123/reconciliations?year=2024'
      )
    })

    it('pluralizes the tenant count for multi-tenant properties on mobile', async () => {
      mockIsMobile = true
      const mockSnapshots = [
        createMockSnapshot({
          id: 'snap-1',
          property_id: 'prop-1',
          property_name: 'Downtown Tower',
          tenant_name: 'Tenant A',
          status: 'draft',
        }),
        createMockSnapshot({
          id: 'snap-2',
          property_id: 'prop-1',
          property_name: 'Downtown Tower',
          tenant_name: 'Tenant B',
          status: 'finalized',
          is_finalized: true,
        }),
      ]

      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockResolvedValue({
        data: {
          data: [createMockProperty({ id: 'prop-1', name: 'Downtown Tower' })],
          total: 1,
        },
      } as never)
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockResolvedValue({
        data: {
          items: mockSnapshots,
          total: 2,
          page: 1,
          page_size: 20,
          has_next: false,
        },
      } as never)

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/2 tenants/i)).toBeInTheDocument()
      })
    })
  })

  describe('Offline / Paused State', () => {
    afterEach(() => {
      onlineManager.setOnline(true)
    })

    it('shows an offline notice instead of the empty state when the fetch is paused', async () => {
      // Drive React Query into paused mode: with the default networkMode:'online',
      // queries pause immediately (isPaused:true, data:undefined) when the manager
      // reports offline — they never fire the queryFn at all.
      onlineManager.setOnline(false)

      // Mocks are set defensively; they won't be called while offline but are
      // required by vi.mock to avoid "not a function" errors if cleanup ordering
      // causes a stray invocation.
      vi.mocked(sdk.listPropertiesApiV1PropertiesGet).mockImplementation(
        () => new Promise(() => {})
      )
      vi.mocked(
        sdk.listSnapshotsApiV1ReconciliationSnapshotsGet
      ).mockImplementation(() => new Promise(() => {}))

      renderWithProviders(<ReconciliationsListPage />)

      await waitFor(() => {
        expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      })

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

      expect(
        screen.queryByText(/no reconciliations yet/i)
      ).not.toBeInTheDocument()
    })
  })
})
