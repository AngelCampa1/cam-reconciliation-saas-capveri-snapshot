/**
 * ReconciliationsTab Component Tests
 *
 * Tests for the reconciliations tab within property detail page including:
 * - Table display with all columns (period, status, total recovery, created date)
 * - Status badges (finalized/draft)
 * - Currency and period formatting
 * - Empty state
 * - Navigation to full reconciliation page
 * - Loading and error states
 *
 * Coverage Target: 100%
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import { ReconciliationsTab } from './ReconciliationsTab'
import * as hooks from '@/api/hooks'

vi.mock(
  '@/features/reconciliation/components/ReconciliationKickoffModal',
  () => ({
    ReconciliationKickoffModal: ({
      open,
      initialPropertyId,
    }: {
      open: boolean
      initialPropertyId?: string
    }) =>
      open ? (
        <div data-testid="kickoff-modal">{`Kickoff Modal ${initialPropertyId ?? ''}`}</div>
      ) : null,
  })
)

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock reconciliation snapshots data
const mockSnapshots = [
  {
    id: 'snap-1',
    property_id: 'prop-123',
    period_start_date: '2024-01-01',
    period_end_date: '2024-12-31',
    status: 'finalized',
    finalized_at: '2024-02-15T10:00:00Z',
    total_recovery: '50000.00',
    created_at: '2024-02-01T10:00:00Z',
    tenant_name: 'Acme Corporation',
  },
  {
    id: 'snap-2',
    property_id: 'prop-123',
    period_start_date: '2023-01-01',
    period_end_date: '2023-12-31',
    status: 'draft',
    finalized_at: null,
    total_recovery: '45000.00',
    created_at: '2024-01-15T11:00:00Z',
    tenant_name: 'Tech Startup Inc',
  },
  {
    id: 'snap-3',
    property_id: 'prop-123',
    period_start_date: '2022-01-01',
    period_end_date: '2022-12-31',
    status: 'finalized',
    finalized_at: '2023-02-10T12:00:00Z',
    total_recovery: '0.00',
    created_at: '2023-02-01T12:00:00Z',
    tenant_name: null,
  },
]

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  )
}

describe('ReconciliationsTab', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  describe('Rendering States', () => {
    it('should render loading skeleton while fetching data', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isSuccess: false,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      // DataTable shows loading state
      expect(screen.queryByRole('table')).toBeInTheDocument()
    })

    it('should render error message when fetch fails', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch reconciliations' },
        isSuccess: false,
        isError: true,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(
        screen.getByText(/couldn't load reconciliations/i)
      ).toBeInTheDocument()
    })

    it('should render empty state when no reconciliations exist', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('No reconciliations yet')).toBeInTheDocument()
      expect(screen.getByText('Calculate Reconciliation')).toBeInTheDocument()
    })

    it('should render table with reconciliations when data exists', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getByText('Recent Reconciliations')).toBeInTheDocument()
    })

    it('should render empty state when data.items array is empty', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('No reconciliations yet')).toBeInTheDocument()
    })
  })

  describe('Data Display - All Columns', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should display formatted period range (start - end)', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const dates2024 = screen.getAllByText(/2024/i)
      expect(dates2024.length).toBeGreaterThan(0)
    })

    it('should display status badge with finalized state', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const finalizedBadges = screen.getAllByText('Finalized')
      expect(finalizedBadges.length).toBeGreaterThan(0)
    })

    it('should display status badge with draft state', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    it('should display total recovery as formatted currency', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('$50,000.00')).toBeInTheDocument()
      expect(screen.getByText('$45,000.00')).toBeInTheDocument()
    })

    it('should display created date in correct format', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const febDates = screen.getAllByText(/Feb/i)
      expect(febDates.length).toBeGreaterThan(0)
    })
  })

  describe('Period Formatting', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should format period with month and year', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Jan 2024 - Dec 2024')).toBeInTheDocument()
    })

    it('should handle different date ranges correctly', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Jan 2023 - Dec 2023')).toBeInTheDocument()
      expect(screen.getByText('Jan 2022 - Dec 2022')).toBeInTheDocument()
    })

    it('should format period consistently across locales', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const periods = screen.getAllByText(/Jan \d{4} - Dec \d{4}/)
      expect(periods.length).toBe(3)
    })
  })

  describe('Currency Formatting', () => {
    it('should format positive amounts with $ symbol', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [
            {
              ...mockSnapshots[0],
              total_recovery: 123456.78,
            },
          ],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('$123,456.78')).toBeInTheDocument()
    })

    it('should format zero amounts as $0.00', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('should format large amounts with comma separators', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [
            {
              ...mockSnapshots[0],
              total_recovery: 1000000.0,
            },
          ],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('$1,000,000.00')).toBeInTheDocument()
    })

    it('should handle null/undefined total_recovery as 0', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [
            {
              ...mockSnapshots[0],
              total_recovery: null,
            },
          ],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })
  })

  describe('Status Badge Variants', () => {
    it('should show success badge when finalized_at is not null', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [mockSnapshots[0]],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Finalized')).toBeInTheDocument()
      const badge = screen.getByText('Finalized').closest('div')
      expect(badge?.className).toContain('badge-finalized')
    })

    it('should show secondary badge when finalized_at is null', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [mockSnapshots[1]],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Draft')).toBeInTheDocument()
      const badge = screen.getByText('Draft').closest('div')
      expect(badge?.className).toContain('badge-draft')
    })

    it('should display "Finalized" label for finalized snapshots', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [mockSnapshots[0]],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Finalized')).toBeInTheDocument()
    })

    it('should display "Draft" label for non-finalized snapshots', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [mockSnapshots[1]],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
  })

  describe('Empty State Variants', () => {
    it('should show "No reconciliations yet" heading in empty state', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('No reconciliations yet')).toBeInTheDocument()
    })

    it('should show "Calculate Reconciliation" button in empty state', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Calculate Reconciliation')).toBeInTheDocument()
    })

    it('should show Calculator icon in empty state', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      const { container } = renderWithProviders(
        <ReconciliationsTab propertyId="prop-123" />
      )

      // Calculator icon should be present
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('should include descriptive text in empty state', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const calculateTexts = screen.getAllByText(/calculate/i)
      expect(calculateTexts.length).toBeGreaterThan(0)
    })
  })

  describe('Navigation - View All Button', () => {
    it('should show "View All Reconciliations" button when data exists', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(
        screen.getByRole('button', { name: /View All Reconciliations/i })
      ).toBeInTheDocument()
    })

    it('should navigate to /reconciliation with propertyId in state when "View All" clicked', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const viewAllButton = screen.getByRole('button', {
        name: /View All Reconciliations/i,
      })
      await user.click(viewAllButton)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          expect.stringMatching(
            /^\/properties\/prop-123\/reconciliations\?year=\d{4}$/
          ),
          { state: { propertyId: 'prop-123' } }
        )
      })
    })

    it('should call navigate with correct arguments', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const viewAllButton = screen.getByRole('button', {
        name: /View All Reconciliations/i,
      })
      await user.click(viewAllButton)

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/properties\/prop-123\/reconciliations\?year=\d{4}$/
        ),
        expect.objectContaining({ state: { propertyId: 'prop-123' } })
      )
    })
  })

  describe('Navigation - Empty State CTA', () => {
    it('should open kickoff modal when empty state CTA clicked', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const ctaButton = screen.getByText('Calculate Reconciliation')
      await user.click(ctaButton)

      expect(screen.getByTestId('kickoff-modal')).toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('passes property id to kickoff modal from empty CTA', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const ctaButton = screen.getByText('Calculate Reconciliation')
      await user.click(ctaButton)

      expect(screen.getByText(/Kickoff Modal prop-123/)).toBeInTheDocument()
    })

    it('navigates to property reconciliation when not first reconciliation', async () => {
      const user = userEvent.setup()
      const snapshotsSpy = vi
        .spyOn(hooks, 'useReconciliationSnapshots')
        .mockReturnValueOnce({
          data: { items: [], total: 0 },
          isLoading: false,
          error: null,
          isSuccess: true,
          isError: false,
        } as any)
        .mockReturnValueOnce({
          data: { items: [mockSnapshots[0]], total: 1 },
          isLoading: false,
          error: null,
          isSuccess: true,
          isError: false,
        } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const ctaButton = screen.getByText('Calculate Reconciliation')
      await user.click(ctaButton)

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/properties\/prop-123\/reconciliations\?year=\d{4}$/
        ),
        { state: { propertyId: 'prop-123' } }
      )
      expect(screen.queryByTestId('kickoff-modal')).not.toBeInTheDocument()
      snapshotsSpy.mockRestore()
    })
  })

  describe('Error Display', () => {
    it('should display error message when error.message exists', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Database connection failed' },
        isSuccess: false,
        isError: true,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(
        screen.getByText(/couldn't load reconciliations/i)
      ).toBeInTheDocument()
    })

    it('should display fallback error message when error.message is undefined', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: {} as any,
        isSuccess: false,
        isError: true,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(
        screen.getByText(/couldn't load reconciliations/i)
      ).toBeInTheDocument()
    })
  })

  describe('Props', () => {
    it('should use propertyId prop in useReconciliationSnapshots filter', () => {
      const spy = vi.spyOn(hooks, 'useReconciliationSnapshots')
      spy.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="test-prop-456" />)

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          property_id: 'test-prop-456',
        }),
        expect.any(Object)
      )
    })

    it('should render with different propertyId values', () => {
      const spy = vi.spyOn(hooks, 'useReconciliationSnapshots')
      spy.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      const { unmount } = renderWithProviders(
        <ReconciliationsTab propertyId="prop-abc" />
      )
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ property_id: 'prop-abc' }),
        expect.any(Object)
      )

      unmount()
      spy.mockClear()

      renderWithProviders(<ReconciliationsTab propertyId="prop-xyz" />)
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ property_id: 'prop-xyz' }),
        expect.any(Object)
      )
    })
  })

  describe('Hook Parameters', () => {
    it('should request page 1 from API', () => {
      const spy = vi.spyOn(hooks, 'useReconciliationSnapshots')
      spy.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
        expect.any(Object)
      )
    })

    it('should request size 10 from API', () => {
      const spy = vi.spyOn(hooks, 'useReconciliationSnapshots')
      spy.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ size: 10 }),
        expect.any(Object)
      )
    })
  })

  describe('Table Configuration', () => {
    it('should disable pagination in DataTable', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      const { container } = renderWithProviders(
        <ReconciliationsTab propertyId="prop-123" />
      )

      // Pagination should not be present
      const pagination = container.querySelector('[data-testid="pagination"]')
      expect(pagination).not.toBeInTheDocument()
    })

    it('should pass correct emptyMessage to DataTable', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      // Empty state message should be shown
      expect(screen.getByText('No reconciliations yet')).toBeInTheDocument()
    })

    it('should pass isLoading state to DataTable', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isSuccess: false,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      // Table should show loading state
      expect(screen.queryByRole('table')).toBeInTheDocument()
    })
  })

  describe('Header Section', () => {
    it('should display "Recent Reconciliations" heading', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Recent Reconciliations')).toBeInTheDocument()
    })

    it('should render heading and button in flex layout', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      const { container } = renderWithProviders(
        <ReconciliationsTab propertyId="prop-123" />
      )

      const heading = screen.getByText('Recent Reconciliations')
      const flexContainer = heading.parentElement
      expect(flexContainer?.className).toContain('flex')
      expect(flexContainer?.className).toContain('justify-between')
    })
  })

  describe('Data Access', () => {
    it('should handle data.items being undefined', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: undefined, total: 0 } as any,
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('No reconciliations yet')).toBeInTheDocument()
    })

    it('should handle data being null', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('No reconciliations yet')).toBeInTheDocument()
    })
  })

  describe('Tenant Name Column', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should display Tenant column header', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Tenant')).toBeInTheDocument()
    })

    it('should display tenant name in each row', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
      expect(screen.getByText('Tech Startup Inc')).toBeInTheDocument()
    })

    it('should display "Unknown" when tenant_name is null', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })

    it('should render tenant name with font-medium class', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const tenantCell = screen.getByText('Acme Corporation')
      expect(tenantCell.className).toContain('font-medium')
    })
  })

  describe('Row Click Navigation', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: { items: mockSnapshots, total: 3 },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should navigate to reconciliation detail when row clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      // Click on the first tenant name to trigger row click
      const tenantCell = screen.getByText('Acme Corporation')
      const row = tenantCell.closest('tr')
      if (row) {
        await user.click(row)
      }

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          expect.stringContaining('/reconciliations'),
          expect.any(Object)
        )
      })
    })

    it('routes a Jan-1 snapshot to its own calendar year, not the prior year (timezone-safe)', async () => {
      // period_start_date "2024-01-01" parsed via new Date() is UTC midnight =
      // Dec 31 2023 in US timezones, so getFullYear() would route to year=2023.
      // The fix reads the year from the YYYY-MM-DD parts; assert 2024 holds.
      const user = userEvent.setup()
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const row = screen.getByText('Acme Corporation').closest('tr')
      if (row) {
        await user.click(row)
      }

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/properties/prop-123/reconciliations?year=2024',
          expect.any(Object)
        )
      })
    })

    it('should have cursor-pointer class on rows', () => {
      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const tenantCell = screen.getByText('Acme Corporation')
      const row = tenantCell.closest('tr')
      expect(row?.className).toContain('cursor-pointer')
    })
  })

  describe('Badge Component Usage', () => {
    it('should use Badge component for finalized status', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [mockSnapshots[0]],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const badge = screen.getByText('Finalized').closest('[class*="badge"]')
      expect(badge).toBeInTheDocument()
    })

    it('should use Badge component for draft status', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: {
          items: [mockSnapshots[1]],
          total: 1,
        },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      const badge = screen.getByText('Draft').closest('[class*="badge"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('ReconciliationsTab - offline / paused', () => {
    it('shows offline error state and hides misleading empty copy when query is paused', () => {
      vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isPaused: true,
        refetch: vi.fn(),
        isSuccess: false,
        isError: false,
      } as any)

      renderWithProviders(<ReconciliationsTab propertyId="prop-123" />)

      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/no reconciliations yet/i)
      ).not.toBeInTheDocument()
    })
  })
})
