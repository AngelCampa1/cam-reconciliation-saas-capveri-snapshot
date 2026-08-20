/**
 * Tests for DashboardPage component
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterEach,
  afterAll,
} from 'vitest'
import { onlineManager } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import {
  resetDashboardData,
  setDashboardData,
  getDashboardErrorHandler,
} from '../mocks/handlers'
import { useSubscription } from '@/hooks/use-subscription'

// Mock API client for dashboard and snapshots
vi.mock('../api/client', () => ({
  getSession: vi.fn().mockResolvedValue({
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  }),
  apiClient: {},
  listSnapshotsApiV1ReconciliationSnapshotsGet: vi.fn().mockResolvedValue({
    data: { items: [], total: 0, page: 1, page_size: 20, pages: 0 },
    error: null,
  }),
}))

// Mock useAuth hook for WelcomeCard component
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: {
      id: 'user-123',
      email: 'testuser@example.com',
    },
    session: null,
    isLoading: false,
    error: null,
    isAuthenticated: true,
  }),
}))

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
    __loaded: false,
  },
}))

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  }),
}))

import { DashboardPage } from './DashboardPage'
import { listSnapshotsApiV1ReconciliationSnapshotsGet } from '../api/client'

const SAMPLE_SEEN_KEY = 'capveri_onboarding_sample_result_seen:user-123'

function markSampleSeen() {
  localStorage.setItem(SAMPLE_SEEN_KEY, '1')
}

// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  resetDashboardData()
  localStorage.clear()
  window.history.pushState({}, '', '/')
})
afterAll(() => server.close())

// Create a wrapper with all providers
const createWrapper = (throwOnMissingData = false) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        throwOnError: throwOnMissingData
          ? (_error, query) => query.state.data === undefined
          : false,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    )
  }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDashboardData()
    localStorage.clear()
    window.history.pushState({}, '', '/')
    vi.mocked(useSubscription).mockReturnValue({
      data: null,
      isLoading: false,
    } as ReturnType<typeof useSubscription>)
  })

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      render(<DashboardPage />, { wrapper: createWrapper() })

      // Loading state renders skeleton cards with animate-pulse class
      const skeleton = document.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows error message when API call fails', async () => {
      server.use(getDashboardErrorHandler(500))

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByText(/couldn't load your dashboard/i)
        ).toBeInTheDocument()
      })
    })

    it('shows an offline notice (not a server error) when the dashboard fetch is paused', async () => {
      // Take the network offline so TanStack Query pauses the fetch
      // (fetchStatus → 'paused', isPaused → true, isLoading → false, data → undefined)
      onlineManager.setOnline(false)
      try {
        render(<DashboardPage />, { wrapper: createWrapper() })

        await waitFor(() => {
          expect(
            screen.getByText(/can't reach the server/i)
          ).toBeInTheDocument()
        })

        expect(
          screen.getByRole('button', { name: /try again/i })
        ).toBeInTheDocument()
      } finally {
        onlineManager.setOnline(true)
      }
    })

    it('keeps the dashboard usable when leakage summary fails', async () => {
      server.use(
        http.get('*/api/v1/leakage/summary', () =>
          HttpResponse.json({ detail: 'Service unavailable' }, { status: 503 })
        )
      )

      render(<DashboardPage />, { wrapper: createWrapper(true) })

      expect(
        (await screen.findAllByText(/reconciliation status/i)).length
      ).toBeGreaterThan(0)
      expect(
        screen.queryByText(/something went wrong/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Successful Data Load', () => {
    it('renders dashboard with fetched data', async () => {
      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      // Page header should be visible
      expect(
        screen.getByText(/see what needs review and what to do next/i)
      ).toBeInTheDocument()
    })

    it('displays property count in welcome card', async () => {
      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        // WelcomeCard shows property count as number
        expect(screen.getByText('5')).toBeInTheDocument()
      })
    })
  })

  describe('Tier Personalization', () => {
    it('renders free tier dashboard framing when no subscription', async () => {
      vi.mocked(useSubscription).mockReturnValue({
        data: null,
        isLoading: false,
      } as ReturnType<typeof useSubscription>)

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getAllByText(/reconciliation status/i).length
        ).toBeGreaterThan(0)
      })
    })

    it('renders paid tier dashboard framing for any subscription', async () => {
      vi.mocked(useSubscription).mockReturnValue({
        data: {
          id: 'sub-1',
          organization_id: 'org-1',
          plan: 'professional',
          status: 'active',
          building_count: 1,
          current_period_start: '2026-01-01T00:00:00Z',
          current_period_end: '2026-02-01T00:00:00Z',
          cancel_at_period_end: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        isLoading: false,
      } as ReturnType<typeof useSubscription>)

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getAllByText(/reconciliation status/i).length
        ).toBeGreaterThan(0)
      })
    })
  })

  describe('New User Experience', () => {
    it('sends first-login zero-property accounts to the sample before showing the dashboard', async () => {
      localStorage.setItem('capveri_tour', JSON.stringify({ skipped: true }))
      setDashboardData({
        property_count: 0,
        unit_count: 0,
        lease_count: 0,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(window.location.pathname).toBe('/onboard')
        expect(window.location.search).toBe('?demo=1&source=first-login')
      })
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
      expect(screen.queryByText('Start here')).not.toBeInTheDocument()
    })

    it('does not let a stale unscoped sample flag skip the account sample', async () => {
      localStorage.setItem('capveri_tour', JSON.stringify({ skipped: true }))
      localStorage.setItem('capveri_onboarding_sample_result_seen', '1')
      setDashboardData({
        property_count: 0,
        unit_count: 0,
        lease_count: 0,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(window.location.pathname).toBe('/onboard')
        expect(window.location.search).toBe('?demo=1&source=first-login')
      })
    })

    it('shows the checklist after the account has seen the sample', async () => {
      markSampleSeen()
      localStorage.setItem('capveri_tour', JSON.stringify({ skipped: true }))
      setDashboardData({
        property_count: 0,
        unit_count: 0,
        lease_count: 0,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Start here')).toBeInTheDocument()
      })
      expect(screen.getByText(/1 of 4 completed/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /start/i })).toHaveAttribute(
        'href',
        '/properties/new'
      )
    })
  })

  describe('Dashboard Cards', () => {
    it('renders quick actions card', async () => {
      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/quick actions/i)).toBeInTheDocument()
      })
    })

    it('renders reconciliation status card', async () => {
      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByTestId('reconciliation-status-card')
        ).toBeInTheDocument()
      })
    })
  })

  describe('Onboarding Checklist', () => {
    beforeEach(() => {
      // Clear localStorage before each test
      localStorage.clear()
    })

    it('displays checklist items for new user', async () => {
      // Dismiss the tour overlay so it doesn't interfere with checklist assertions
      markSampleSeen()
      localStorage.setItem('capveri_tour', JSON.stringify({ skipped: true }))
      setDashboardData({
        property_count: 0,
        unit_count: 0,
        lease_count: 0,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Start here')).toBeInTheDocument()
      })

      // Check for outcome-anchored checklist items
      expect(screen.getByText('See a sample result')).toBeInTheDocument()
      expect(screen.getByText('Check your own building')).toBeInTheDocument()
      expect(screen.getByText('Get your support packet')).toBeInTheDocument()
      expect(screen.getByText('Add your other buildings')).toBeInTheDocument()
    })

    it('dismisses checklist and saves to localStorage', async () => {
      const user = userEvent.setup()
      // Dismiss the tour overlay so focus trap doesn't block the checklist dismiss button
      markSampleSeen()
      localStorage.setItem('capveri_tour', JSON.stringify({ skipped: true }))
      setDashboardData({
        property_count: 0,
        unit_count: 0,
        lease_count: 0,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Start here')).toBeInTheDocument()
      })

      // Find and click the dismiss button
      const dismissButton = screen.getByRole('button', { name: /dismiss/i })
      await user.click(dismissButton)

      // Checklist should be hidden
      await waitFor(() => {
        expect(screen.queryByText('Start here')).not.toBeInTheDocument()
      })

      // Check localStorage was updated
      const savedState = localStorage.getItem('capveri_onboarding')
      expect(savedState).toBeTruthy()
      const parsedState = JSON.parse(savedState!)
      expect(parsedState.dismissed).toBe(true)
    })

    it('keeps showing the checklist after the user adds a property (persistent activation)', async () => {
      setDashboardData({
        property_count: 1,
        unit_count: 3,
        lease_count: 0,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      // Activation checklist persists until every setup step completes.
      expect(await screen.findByText('Start here')).toBeInTheDocument()
    })

    it('handles invalid JSON in localStorage gracefully', async () => {
      // Set invalid JSON in localStorage to trigger catch block
      markSampleSeen()
      localStorage.setItem('capveri_onboarding', 'not-valid-json')

      setDashboardData({
        property_count: 0,
        unit_count: 0,
        lease_count: 0,
        alerts: [],
      })

      // Should not throw error and show checklist (default behavior)
      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Start here')).toBeInTheDocument()
      })
    })
  })

  describe('Properties Needing Attention', () => {
    it('shows properties without reconciliation in status card', async () => {
      setDashboardData({
        property_count: 2,
        unit_count: 5,
        lease_count: 3,
        pending_reconciliations: 2,
        pending_verifications: 0,
        recent_properties: [
          {
            id: 'prop-1',
            name: 'Downtown Tower',
            unit_count: 10,
            last_reconciliation: null,
          },
          {
            id: 'prop-2',
            name: 'Suburban Plaza',
            unit_count: 5,
            last_reconciliation: '2024-01-15',
          },
        ],
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        // The property without reconciliation should appear in needs attention
        expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
      })

      // Property with reconciliation shouldn't be in the needs attention list
      const statusCard = screen.getByTestId('reconciliation-status-card')
      // Suburban Plaza has a reconciliation, so shouldn't be in needsAttention
    })

    it('limits needs attention items to 5', async () => {
      setDashboardData({
        property_count: 7,
        unit_count: 35,
        lease_count: 20,
        pending_reconciliations: 7,
        pending_verifications: 0,
        recent_properties: [
          {
            id: 'p1',
            name: 'Property 1',
            unit_count: 5,
            last_reconciliation: null,
          },
          {
            id: 'p2',
            name: 'Property 2',
            unit_count: 5,
            last_reconciliation: null,
          },
          {
            id: 'p3',
            name: 'Property 3',
            unit_count: 5,
            last_reconciliation: null,
          },
          {
            id: 'p4',
            name: 'Property 4',
            unit_count: 5,
            last_reconciliation: null,
          },
          {
            id: 'p5',
            name: 'Property 5',
            unit_count: 5,
            last_reconciliation: null,
          },
          {
            id: 'p6',
            name: 'Property 6',
            unit_count: 5,
            last_reconciliation: null,
          },
          {
            id: 'p7',
            name: 'Property 7',
            unit_count: 5,
            last_reconciliation: null,
          },
        ],
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        // Should show 5 max items needing attention
        expect(screen.getByText('Property 1')).toBeInTheDocument()
        expect(screen.getByText('Property 5')).toBeInTheDocument()
      })

      // 6th and 7th properties should not be shown (limit is 5)
      expect(screen.queryByText('Property 6')).not.toBeInTheDocument()
      expect(screen.queryByText('Property 7')).not.toBeInTheDocument()
    })

    it('displays unit count in needs attention items', async () => {
      setDashboardData({
        property_count: 1,
        unit_count: 10,
        lease_count: 5,
        pending_reconciliations: 1,
        pending_verifications: 0,
        recent_properties: [
          {
            id: 'prop-1',
            name: 'Multi-Unit Building',
            unit_count: 10,
            last_reconciliation: null,
          },
        ],
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Multi-Unit Building')).toBeInTheDocument()
      })

      // Check that unit count is displayed (as "10 units")
      expect(screen.getByText('10 units')).toBeInTheDocument()
    })

    it('handles singular unit count', async () => {
      setDashboardData({
        property_count: 1,
        unit_count: 1,
        lease_count: 1,
        pending_reconciliations: 1,
        pending_verifications: 0,
        recent_properties: [
          {
            id: 'prop-1',
            name: 'Single Unit Building',
            unit_count: 1,
            last_reconciliation: null,
          },
        ],
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Single Unit Building')).toBeInTheDocument()
      })

      // Check for singular "unit" (not "units")
      expect(screen.getByText('1 unit')).toBeInTheDocument()
    })
  })

  describe('Activation checklist persistence', () => {
    it('still shows the checklist after the user has added a property but not finished all steps', async () => {
      server.use(
        http.get('*/api/v1/dashboard', () =>
          HttpResponse.json({
            property_count: 1,
            unit_count: 3,
            lease_count: 2,
            gl_entry_count: 1,
            pending_reconciliations: 0,
            pending_verifications: 0,
            total_recovery_finalized: '0.00',
            recent_properties: [
              {
                id: 'prop-1',
                name: 'Westview Center',
                unit_count: 3,
                last_reconciliation: null,
              },
            ],
          })
        )
      )

      render(<DashboardPage />, { wrapper: createWrapper() })
      expect(await screen.findByText(/start here/i)).toBeInTheDocument()
      // The sample is no longer pre-done. If a user reaches the dashboard with
      // a property but no recorded sample view, the checklist returns them to
      // the sample value moment first.
      expect(screen.getByText(/0 of 4 completed/i)).toBeInTheDocument()
    })

    it('hides the checklist once every activation step is complete', async () => {
      markSampleSeen()
      server.use(
        http.get('*/api/v1/dashboard', () =>
          HttpResponse.json({
            // Every checklist outcome is met: a sample is always done, two
            // buildings exist (own building + other buildings), and recovery
            // has been finalized (tenant letters produced).
            property_count: 2,
            unit_count: 3,
            lease_count: 2,
            gl_entry_count: 1,
            pending_reconciliations: 1,
            pending_verifications: 0,
            total_recovery_finalized: '4200.00',
            recent_properties: [
              {
                id: 'prop-1',
                name: 'Westview Center',
                unit_count: 3,
                last_reconciliation: '2026-03-15',
              },
            ],
          })
        )
      )

      render(<DashboardPage />, { wrapper: createWrapper() })
      await screen.findByText('Dashboard')
      expect(screen.queryByText(/start here/i)).not.toBeInTheDocument()
    })
  })

  describe('Recovery Metrics Calculation', () => {
    it('calculates recovery metrics from snapshots', async () => {
      const currentYear = new Date().getFullYear()
      const currentMonth = new Date().getMonth()
      const currentDate = new Date(currentYear, currentMonth, 15).toISOString()
      const lastYearDate = new Date(currentYear - 1, 6, 15).toISOString()

      // Mock snapshots API with recovery data
      vi.mocked(listSnapshotsApiV1ReconciliationSnapshotsGet).mockResolvedValue(
        {
          data: {
            items: [
              {
                id: 'snap-1',
                total_recovery: 5000,
                period_end_date: currentDate,
                finalized_at: currentDate,
              },
              {
                id: 'snap-2',
                total_recovery: 3000,
                period_end_date: currentDate,
                finalized_at: null,
              },
              {
                id: 'snap-3',
                total_recovery: 2000,
                period_end_date: lastYearDate,
                finalized_at: lastYearDate,
              },
            ],
            total: 3,
            page: 1,
            page_size: 1000,
            pages: 1,
          },
          error: null,
        }
      )

      setDashboardData({
        property_count: 2,
        unit_count: 10,
        lease_count: 5,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      // Recovery card should show calculated metrics
      // All time = 5000 + 3000 + 2000 = 10000
      // This year = 5000 + 3000 = 8000
      // This month = 5000 (only snap-1 was finalized this month)
    })

    it('handles snapshots with null period_end_date', async () => {
      vi.mocked(listSnapshotsApiV1ReconciliationSnapshotsGet).mockResolvedValue(
        {
          data: {
            items: [
              {
                id: 'snap-1',
                total_recovery: 1000,
                period_end_date: null,
                finalized_at: null,
              },
            ],
            total: 1,
            page: 1,
            page_size: 1000,
            pages: 1,
          },
          error: null,
        }
      )

      setDashboardData({
        property_count: 1,
        unit_count: 5,
        lease_count: 2,
        alerts: [],
      })

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })
    })
  })

  describe('Hero recovery metric selection', () => {
    // Without billing data, total_recovery_opportunity collapses to the finalized
    // total (already shown as tenant billable), so the hero must NOT use it.
    it('does not drive the hero from leakage opportunity when no billing data exists', async () => {
      server.use(
        http.get('*/api/v1/leakage/summary', () =>
          HttpResponse.json({
            total_recovery_opportunity: '42966.36',
            properties_with_leakage: 2,
            total_underbill_exposure: '42966.36',
            total_overbill_exposure: '0',
            total_billing_exposure: '42966.36',
            properties_with_underbill: 2,
            properties_with_overbill: 0,
            properties_with_billing_exposure: 2,
            has_billing_data: false,
            draft_recovery: '0',
            draft_property_count: 0,
          })
        )
      )

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/check again any time/i)).toBeInTheDocument()
      })
      expect(
        screen.queryByRole('link', { name: /review drafts/i })
      ).not.toBeInTheDocument()
    })

    it('surfaces draft recovery in the hero when drafts exist without billing data', async () => {
      server.use(
        http.get('*/api/v1/leakage/summary', () =>
          HttpResponse.json({
            total_recovery_opportunity: '0',
            properties_with_leakage: 0,
            total_underbill_exposure: '0',
            total_overbill_exposure: '0',
            total_billing_exposure: '0',
            properties_with_underbill: 0,
            properties_with_overbill: 0,
            properties_with_billing_exposure: 0,
            has_billing_data: false,
            draft_recovery: '19475.82',
            draft_property_count: 2,
          })
        )
      )

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByText(/check statement totals before you send/i)
        ).toBeInTheDocument()
      })

      // The hero number is a dollar amount, so the eyebrow must name what it is
      // ("exposure to fix") in plain words rather than jargon like
      // "Reconciliation status" — otherwise the big green figure reads as
      // "908 what?" to a first-time user.
      // Scope to the hero heading (h2): the checklist also contains the phrase
      // "See exposure to fix", so a bare getByText is ambiguous.
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: /statement total to check/i,
        })
      ).toBeInTheDocument()
    })

    it('drives the hero from billing exposure once billing data is uploaded', async () => {
      server.use(
        http.get('*/api/v1/leakage/summary', () =>
          HttpResponse.json({
            total_recovery_opportunity: '5000.00',
            properties_with_leakage: 1,
            total_underbill_exposure: '5000.00',
            total_overbill_exposure: '3000.00',
            total_billing_exposure: '8000.00',
            properties_with_underbill: 1,
            properties_with_overbill: 1,
            properties_with_billing_exposure: 2,
            has_billing_data: true,
            draft_recovery: '0',
            draft_property_count: 0,
          })
        )
      )

      render(<DashboardPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByText(/check over-bills and under-bills before you send/i)
        ).toBeInTheDocument()
      })
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: /bill amount to check/i,
        })
      ).toBeInTheDocument()
      expect(screen.getByText('Over-bill total')).toBeInTheDocument()
      expect(screen.getByText('Under-bill total')).toBeInTheDocument()
      expect(screen.getByText('$3,000')).toBeInTheDocument()
      expect(screen.getByText('$5,000')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', {
          level: 2,
          name: /tenant total to check/i,
        })
      ).not.toBeInTheDocument()
    })
  })
})
