/**
 * Tests for Checkout Success Page component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckoutSuccessPage } from './CheckoutSuccess'

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => <nav data-testid="landing-nav">Nav</nav>,
}))

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}))

const mockSearchParams = new URLSearchParams()
const mockRemoveQueries = vi.fn()
const { mockCaptureUnexpectedError } = vi.hoisted(() => ({
  mockCaptureUnexpectedError: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: mockCaptureUnexpectedError,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams],
  }
})

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-access-token',
            user: { id: 'mock-user-id' },
          },
        },
        error: null,
      }),
    },
  },
}))

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
)

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({
      removeQueries: mockRemoveQueries,
    }),
  }
})

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.delete('session_id')
    global.fetch = vi.fn()
  })

  describe('Loading State', () => {
    it('shows loading indicator while verifying session', () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      expect(screen.getByText(/setting up your trial/i)).toBeInTheDocument()
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows a non-error return state when session_id is missing', async () => {
      // No session_id in URL params
      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: /checkout session not found/i,
          })
        ).toBeInTheDocument()
        expect(
          screen.queryByText(/something went wrong/i)
        ).not.toBeInTheDocument()
        expect(
          screen.getByText(/choose a plan or return to billing/i)
        ).toBeInTheDocument()
      })
    })

    it('shows error when session verification fails', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
        expect(
          screen.getByText(/session verification failed/i)
        ).toBeInTheDocument()
      })
      expect(mockCaptureUnexpectedError).not.toHaveBeenCalled()
    })

    it('reports 5xx session verification failures', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Session verification failed',
            statusCode: 503,
          }),
          {
            operation: 'checkout_success.verify_session',
            surface: 'checkout',
            path: '/api/v1/billing/checkout/success',
          }
        )
      })
    })

    it('reports network errors during session verification', async () => {
      const error = new Error('network down')
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockRejectedValue(error)

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(error, {
          operation: 'checkout_success.verify_session',
          surface: 'checkout',
          path: '/api/v1/billing/checkout/success',
        })
      })
    })

    it('renders LandingNav and Footer on error state (Bug #7)', async () => {
      // No session_id — triggers immediate error
      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
        expect(screen.getByTestId('footer')).toBeInTheDocument()
      })
    })

    it('displays link to billing page on error', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /go to billing/i })
        expect(link).toHaveAttribute('href', '/settings/billing')
      })
    })
  })

  describe('Success State', () => {
    it('shows success message when verification succeeds', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          subscription_id: 'sub_test123',
          customer_id: 'cus_test123',
        }),
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(screen.getByText("You're all set.")).toBeInTheDocument()
        expect(
          screen.getByText(/your 30-day free trial has started/i)
        ).toBeInTheDocument()
      })
    })

    it('verifies session with correct API call', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      })
      global.fetch = mockFetch

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(
            '/api/v1/billing/checkout/success?session_id=cs_test123'
          ),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer mock-access-token',
            }),
          })
        )
      })
    })

    it('displays dashboard link on success', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', {
          name: /go to dashboard/i,
        })
        expect(dashboardLink).toHaveAttribute('href', '/dashboard')
      })
    })

    it('displays billing details link on success', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        const billingLink = screen.getByRole('link', {
          name: /view billing details/i,
        })
        expect(billingLink).toHaveAttribute('href', '/settings/billing')
      })
    })

    it('clears cached billing activation after successful verification', async () => {
      mockSearchParams.set('session_id', 'cs_test123')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      })

      render(<CheckoutSuccessPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(mockRemoveQueries).toHaveBeenCalledWith({
          queryKey: ['billing-activation', 'mock-user-id'],
        })
      })
    })
  })
})
