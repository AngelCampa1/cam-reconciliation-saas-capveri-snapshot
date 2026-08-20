/**
 * Tests for CheckoutDialog Component (Subscription)
 *
 * Input-driven dialog for subscribing to Reconcile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutDialog } from './CheckoutDialog'
import { supabase } from '@/lib/supabase'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-token',
            user: { id: 'mock-user-id' },
          },
        },
        error: null,
      }),
    },
  },
}))

const mockToastError = vi.fn()
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

describe('CheckoutDialog', () => {
  const getSessionMock = vi.mocked(supabase.auth.getSession)

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-token',
          user: { id: 'mock-user-id' },
        },
      },
      error: null,
    })
  })

  describe('Dialog Visibility', () => {
    it('renders dialog when open is true', () => {
      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByText('Start Your Free Trial')).toBeInTheDocument()
    })

    it('does not render content when open is false', () => {
      render(<CheckoutDialog open={false} onOpenChange={vi.fn()} />)

      expect(
        screen.queryByText('Start Your Free Trial')
      ).not.toBeInTheDocument()
    })
  })

  describe('Pricing Inputs', () => {
    it('shows rentable unit and building inputs', () => {
      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      expect(
        screen.getByRole('spinbutton', { name: /rentable units/i })
      ).toHaveValue(25)
      expect(
        screen.getByRole('spinbutton', { name: /buildings/i })
      ).toHaveValue(1)
    })

    it('defaults to the self-serve starting price', () => {
      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      expect(screen.getAllByText(/\$998\/year/).length).toBeGreaterThan(0)
      expect(screen.getByText('$4,990')).toHaveClass('line-through')
      expect(document.body.textContent).toContain('Limited time offer')
      expect(document.body.textContent).not.toContain('redemptions only')
      expect(document.body.textContent).toContain('after the first year')
    })

    it('updates the annual total when rentable units increase', async () => {
      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      fireEvent.change(
        screen.getByRole('spinbutton', { name: /rentable units/i }),
        {
          target: { value: '200' },
        }
      )

      await waitFor(() => {
        expect(screen.getAllByText(/\$7,163\/year/).length).toBeGreaterThan(0)
      })
    })

    it('does not clamp large rentable unit counts', async () => {
      const user = userEvent.setup()
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkout_required: false,
          has_active_access: true,
          subscription_status: 'trialing',
        }),
      })
      global.fetch = mockFetch

      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      fireEvent.change(
        screen.getByRole('spinbutton', { name: /rentable units/i }),
        {
          target: { value: '100001' },
        }
      )
      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/billing/trial/start'),
          expect.objectContaining({
            body: JSON.stringify({
              plan_id: 'reconcile',
              billing_period: 'annual',
              unit_count: 100001,
              building_count: 1,
              launch_offer_code: '80OFF',
            }),
          })
        )
      })
    })
  })

  describe('Order Summary', () => {
    it('shows due today as $0.00', () => {
      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('shows trial messaging', () => {
      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      expect(
        screen.getByText(/30-day free trial, then \$998\/year/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /add annual billing before the trial ends to keep access/i
        )
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/money-back guarantee/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Checkout Flow', () => {
    it('starts a no-card trial and navigates to success URL', async () => {
      const user = userEvent.setup()
      const onSuccess = vi.fn()
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkout_required: false,
          has_active_access: true,
          subscription_status: 'trialing',
        }),
      })
      global.fetch = mockFetch

      render(
        <CheckoutDialog
          open={true}
          onOpenChange={vi.fn()}
          onSuccess={onSuccess}
          successUrl="/dashboard"
        />
      )

      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/billing/trial/start'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              plan_id: 'reconcile',
              billing_period: 'annual',
              unit_count: 25,
              building_count: 1,
              launch_offer_code: '80OFF',
            }),
          })
        )
      })

      expect(onSuccess).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('shows loading state during checkout', async () => {
      const user = userEvent.setup()
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ checkout_url: 'https://test.com' }),
                }),
              100
            )
          )
      )

      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      expect(screen.getByText(/starting trial/i)).toBeInTheDocument()
    })

    it('handles checkout error', async () => {
      const user = userEvent.setup()
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ detail: 'Failed to create checkout session' }),
      })

      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Trial start failed', {
          description: 'Failed to create checkout session',
        })
      })
    })

    it('routes paused subscriptions to billing when checkout returns 409', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          detail:
            'Your trial is paused because billing was not added before it ended. Add a payment method in billing settings to resume access.',
        }),
      })

      render(<CheckoutDialog open={true} onOpenChange={onOpenChange} />)

      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'Billing required to resume access',
          expect.objectContaining({
            description: expect.stringContaining('resume access'),
          })
        )
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(mockNavigate).toHaveBeenCalledWith('/settings/billing')
    })

    it('shows auth required error when no session exists', async () => {
      const user = userEvent.setup()
      getSessionMock.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      })

      render(<CheckoutDialog open={true} onOpenChange={vi.fn()} />)

      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Authentication required', {
          description: 'Please log in to continue with checkout.',
        })
      })
    })
  })

  describe('successUrl prop', () => {
    it('uses custom successUrl for post-trial navigation when provided', async () => {
      const user = userEvent.setup()
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkout_required: false,
          has_active_access: true,
        }),
      })
      global.fetch = mockFetch

      render(
        <CheckoutDialog
          open={true}
          onOpenChange={vi.fn()}
          successUrl="/onboard/unlock?purchased=true"
        />
      )

      await user.click(
        screen.getByRole('button', { name: /start free trial/i })
      )

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/onboard/unlock?purchased=true'
        )
      })
    })
  })
})
