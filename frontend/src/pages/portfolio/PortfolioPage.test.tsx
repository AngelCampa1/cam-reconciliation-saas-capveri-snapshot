/**
 * Tests for PortfolioPage component
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
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { server } from '../../mocks/server'
import {
  resetPortfolioData,
  setPortfolioData,
  getPortfolioErrorHandler,
} from '../../mocks/handlers'

// Mock API client
vi.mock('../../api/client', () => ({
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
}))

// Mock useAuth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'user-123', email: 'testuser@example.com' },
    session: null,
    isLoading: false,
    error: null,
    isAuthenticated: true,
  }),
}))

import { PortfolioPage } from './PortfolioPage'

// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => {
  server.resetHandlers()
  resetPortfolioData()
})
afterAll(() => server.close())

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

describe('PortfolioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPortfolioData()
  })

  describe('Loading State', () => {
    it('shows skeleton cards while loading', () => {
      render(<PortfolioPage />, { wrapper: createWrapper() })

      const skeleton = document.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows error message when request fails', async () => {
      server.use(getPortfolioErrorHandler(500))

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByText(/couldn't load your portfolio/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Offline State', () => {
    afterEach(() => {
      // onlineManager is a global singleton; restore it so no other test is
      // affected by the paused-network state set inside this block.
      onlineManager.setOnline(true)
    })

    it('shows an offline notice (not the empty state) when the portfolio fetch is paused', async () => {
      onlineManager.setOnline(false)

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      })

      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/no portfolio data yet/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no finalized reconciliation data', async () => {
      setPortfolioData({
        period_year: null,
        total_recoverable_cam: '0',
        total_leakage: '0',
        recovery_rate: null,
        properties_with_leakage: 0,
        has_billing_data: false,
        properties: [],
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/no portfolio data yet/i)).toBeInTheDocument()
      })
    })
  })

  describe('Metric Cards', () => {
    it('renders four metric cards with correct labels', async () => {
      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getAllByText('Bill difference').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Bill check rate').length).toBeGreaterThan(0)
        expect(
          screen.getAllByText('Properties to check').length
        ).toBeGreaterThan(0)
        expect(screen.getAllByText('Allowed CAM').length).toBeGreaterThan(0)
      })
      expect(screen.queryByText('Leakage to Recover')).not.toBeInTheDocument()
      expect(screen.queryByText('Recovery Rate')).not.toBeInTheDocument()
    })

    it('formats currency values as USD', async () => {
      setPortfolioData({
        total_recoverable_cam: '350000',
        total_leakage: '105000',
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('$350,000.00')).toBeInTheDocument()
        expect(screen.getByText('$105,000.00')).toBeInTheDocument()
      })
    })

    it('shows N/A for recovery rate when no billing data', async () => {
      setPortfolioData({
        recovery_rate: null,
        has_billing_data: false,
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('N/A')).toBeInTheDocument()
      })
      // The N/A must not leave the reader guessing — a hint explains the next step.
      expect(
        screen.getByText('Add what you billed tenants to see this')
      ).toBeInTheDocument()
    })

    it('shows formatted recovery rate when billing data exists', async () => {
      setPortfolioData({
        recovery_rate: 70.0,
        has_billing_data: true,
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('70.0%')).toBeInTheDocument()
      })
      // No hint when the real rate is shown.
      expect(
        screen.queryByText('Add what you billed tenants to see this')
      ).not.toBeInTheDocument()
    })
  })

  describe('Period Subtitle', () => {
    it('shows reconciliation year in subtitle', async () => {
      setPortfolioData({ period_year: 2024 })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(
          screen.getByText(/2024 reconciliation year/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Property Breakdown Table', () => {
    it('renders property table with rows sorted by leakage', async () => {
      setPortfolioData({
        properties: [
          {
            property_id: '00000000-0000-0000-0000-000000000001',
            property_name: 'Harbor View Tower',
            total_recoverable: '200000',
            total_billed: '130000',
            leakage: '70000',
            recovery_rate: 65.0,
          },
          {
            property_id: '00000000-0000-0000-0000-000000000002',
            property_name: 'Main Street Plaza',
            total_recoverable: '150000',
            total_billed: '115000',
            leakage: '35000',
            recovery_rate: 76.67,
          },
        ],
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Harbor View Tower')).toBeInTheDocument()
        expect(screen.getByText('Main Street Plaza')).toBeInTheDocument()
      })

      // Harbor View (70k leakage) should appear before Main Street (35k leakage)
      const rows = screen.getAllByRole('row')
      const harborIndex = rows.findIndex((row) =>
        row.textContent?.includes('Harbor View Tower')
      )
      const mainStreetIndex = rows.findIndex((row) =>
        row.textContent?.includes('Main Street Plaza')
      )
      expect(harborIndex).toBeLessThan(mainStreetIndex)
    })

    it('hides NOI section when total recovery is zero', async () => {
      setPortfolioData({
        total_recovery_all_years: '0',
        period_year: 2024,
        properties: [
          {
            property_id: '00000000-0000-0000-0000-000000000001',
            property_name: 'Harbor View Tower',
            total_recoverable: '200000',
            total_billed: '200000',
            leakage: '0',
            recovery_rate: 100.0,
          },
        ],
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Harbor View Tower')).toBeInTheDocument()
      })

      expect(
        screen.queryByTestId('portfolio-noi-section')
      ).not.toBeInTheDocument()
    })

    it('hides table when no properties in portfolio', async () => {
      setPortfolioData({ properties: [], period_year: null })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
      })
    })
  })

  describe('NOI Impact Section', () => {
    it('renders NOI section with slider and computed values', async () => {
      setPortfolioData({
        total_recovery_all_years: '350000',
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByTestId('portfolio-noi-section')).toBeInTheDocument()
      })

      // Should show stat labels
      expect(screen.getByText('Final tenant total')).toBeInTheDocument()
      expect(screen.getByText('NOI Lift')).toBeInTheDocument()
      expect(screen.getByText('Asset Value Lift')).toBeInTheDocument()
      expect(screen.queryByText('Total Recovery')).not.toBeInTheDocument()

      // Should show cap rate slider at default 7.0%
      const slider = screen.getByTestId('portfolio-cap-rate-slider')
      expect(slider).toBeInTheDocument()
      expect(screen.getByText(/Cap rate assumption/)).toBeInTheDocument()
    })

    it('updates asset value lift when cap rate slider changes', async () => {
      setPortfolioData({
        total_recovery_all_years: '100000',
      })

      render(<PortfolioPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByTestId('portfolio-noi-section')).toBeInTheDocument()
      })

      // Change slider to 10.0% (value 100)
      const slider = screen.getByTestId('portfolio-cap-rate-slider')
      fireEvent.change(slider, { target: { value: '100' } })

      // Asset value lift = 100000 / 0.1 = $1,000,000
      expect(screen.getByText(/At 10\.0% cap rate/)).toBeInTheDocument()
      expect(screen.getByText('$1,000,000')).toBeInTheDocument()
    })
  })
})
