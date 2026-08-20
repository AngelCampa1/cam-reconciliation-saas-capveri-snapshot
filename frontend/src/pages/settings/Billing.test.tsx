import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BillingPage } from './Billing'
import { configureAuth } from '@/api/client'

const {
  mockCapturedHttpFailures,
  mockCapturedUnexpectedErrors,
  mockToastError,
} = vi.hoisted(() => ({
  mockCapturedHttpFailures: vi.fn(),
  mockCapturedUnexpectedErrors: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: vi.fn(),
}))

vi.mock('@/hooks/use-organization-usage', () => ({
  useOrganizationUsage: vi.fn(),
}))

vi.mock('@/hooks/use-stripe-portal', () => ({
  useStripePortal: vi.fn(),
}))

vi.mock('@/hooks/use-billing-activation', () => ({
  useBillingActivation: vi.fn(),
}))

vi.mock('@/hooks/use-credit-balance', () => ({
  useCreditBalance: vi.fn(),
}))

vi.mock('@/hooks/use-feature-usage', () => ({
  useFeatureUsage: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock('@/components/ui/sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}))

vi.mock('@/lib/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sentry')>()
  return {
    ...actual,
    captureUnexpectedError: (error: unknown, context: unknown) => {
      if (actual.shouldReportError(error)) {
        mockCapturedUnexpectedErrors(error, context)
      }
    },
    captureHttpFailure: (context: unknown) => {
      mockCapturedHttpFailures(context)
    },
  }
})

import { useSubscription } from '@/hooks/use-subscription'
import { useOrganizationUsage } from '@/hooks/use-organization-usage'
import { useStripePortal } from '@/hooks/use-stripe-portal'
import { useBillingActivation } from '@/hooks/use-billing-activation'
import { useCreditBalance } from '@/hooks/use-credit-balance'
import { useFeatureUsage } from '@/hooks/use-feature-usage'
import { supabase } from '@/lib/supabase'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('BillingPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    vi.mocked(useBillingActivation).mockReturnValue({
      data: null,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBillingActivation>)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-access-token',
          user: { id: 'mock-user-id' },
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)
    configureAuth({
      getSession: async () => ({
        access_token: 'mock-access-token',
        user: { id: 'mock-user-id' },
      }),
      signOut: async () => {},
    })
    vi.mocked(useStripePortal).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    } as unknown as ReturnType<typeof useStripePortal>)
    vi.mocked(useCreditBalance).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useCreditBalance>)
    vi.mocked(useFeatureUsage).mockReturnValue({
      data: { used_features: [], current_tier: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useFeatureUsage>)
  })

  it('displays loading state', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/billing & subscription/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(
      0
    )
  })

  it('renders the package plan summary', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_123',
        plan: 'growth_v2',
        status: 'active',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0)
    expect(screen.getByText('Package')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText(/rentable units on your plan/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /change plan/i })
    ).toBeInTheDocument()
  })

  it('shows Reconcile access for legacy per-building plans', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_defend',
        plan: 'defend',
        status: 'active',
        pricing_model: 'per_building',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 30,
        unit_count: 400,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 30,
        propertiesLimit: 50,
        unitsUsed: 400,
        unitsLimit: 500,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/run lease-accurate cam reconciliation/i)
    ).toBeInTheDocument()
    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0)
    expect(screen.getByText('Per building')).toBeInTheDocument()
    expect(screen.queryByText(/legacy per-building/i)).not.toBeInTheDocument()
  })

  it('shows paused-trial recovery messaging and CTA', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_123',
        plan: 'growth_v2',
        status: 'paused',
        stripe_subscription_id: 'sub_stripe',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/your trial ended without a payment method/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^add billing$/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /resume access/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/add a payment method first, then use resume access/i)
    ).toBeInTheDocument()
  })

  it('shows trial-end guidance instead of automatic charge copy for trialing subscriptions', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 4,
        unit_count: 40,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 4,
        propertiesLimit: 50,
        unitsUsed: 40,
        unitsLimit: 50,
        usersUsed: 2,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    const { container } = render(<BillingPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/trial ends/i)).toBeInTheDocument()
    expect(screen.getByText(/billing reminder/i)).toBeInTheDocument()
    expect(container.textContent).toContain('Jan 31, 2024')
    expect(screen.queryByText(/automatic charge date/i)).not.toBeInTheDocument()
  })

  it('plan picker CardHeader is keyboard-operable and aria-expanded toggles', async () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial_kb',
        plan: 'growth_v2',
        tier: 'defend',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 4,
        unit_count: 40,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 4,
        propertiesLimit: 50,
        unitsUsed: 40,
        unitsLimit: 50,
        usersUsed: 2,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    const header = screen.getByRole('button', { name: /choose your plan/i })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(header).toHaveAttribute('aria-controls', 'plan-picker-content')

    fireEvent.keyDown(header, { key: 'Enter' })

    expect(header).toHaveAttribute('aria-expanded', 'true')
    // The revealed panel matches the aria-controls id, so AT users can find it.
    expect(document.getElementById('plan-picker-content')).toBeInTheDocument()
  })

  it('opens Stripe checkout directly for no-card trial billing setup', async () => {
    // The 80OFF launch promo has a real endsAt (2026-07-04T07:00:00Z) and
    // isLaunchOfferLive() compares it against wall-clock time, so the discounted
    // price this test asserts stops rendering once that date passes. Pin the clock
    // inside the offer window; shouldAdvanceTime keeps RTL waitFor/userEvent working.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'))
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        tier: 'defend',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: 'https://checkout.stripe.com/c/test',
      }),
    } as Response)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/billing/checkout'),
          expect.objectContaining({
            method: 'POST',
          })
        )
      })

      const fetchInit = vi.mocked(global.fetch).mock.calls[0]?.[1] as
        | RequestInit
        | undefined
      const headers = new Headers(fetchInit?.headers)
      expect(headers.get('Content-Type')).toBe('application/json')

      const checkoutBody = JSON.parse(String(fetchInit?.body))
      expect(checkoutBody).toEqual(
        expect.objectContaining({
          plan_id: 'reconcile',
          billing_period: 'annual',
          unit_count: 120,
          building_count: 12,
          launch_offer_code: '80OFF',
          success_url: 'http://localhost:3000/checkout/success',
          cancel_url: 'http://localhost:3000/settings/billing',
        })
      )
      expect(window.location.href).toBe('https://checkout.stripe.com/c/test')
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('keeps the checkout failure toast and reports a server failure to Sentry', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        tier: 'defend',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: 'sql leaked tenant@example.com' }),
        {
          status: 500,
        }
      )
    )

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Billing setup failed', {
          description: 'Failed to open checkout',
        })
      })
      expect(mockCapturedHttpFailures).toHaveBeenCalledWith({
        operation: 'open-checkout',
        surface: 'billing',
        path: '/api/v1/billing/checkout',
        statusCode: 500,
      })
      expect(mockCapturedUnexpectedErrors).not.toHaveBeenCalled()
      expect(window.location.href).toBe(
        'http://localhost:3000/settings/billing'
      )
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('keeps expected checkout auth failures visible without reporting them to Sentry', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        tier: 'defend',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "You don't have access" }), {
        status: 403,
      })
    )

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Billing setup failed', {
          description: "You don't have access",
        })
      })
      expect(mockCapturedUnexpectedErrors).not.toHaveBeenCalled()
      expect(window.location.href).toBe(
        'http://localhost:3000/settings/billing'
      )
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('uses requested pricing units from billing selection for checkout', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing?intent=select-plan&units=120',
      search: '?intent=select-plan&units=120',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'reconcile',
        tier: 'reconcile',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 25,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 25,
        unitsLimit: 25,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: 'https://checkout.stripe.com/c/test',
      }),
    } as Response)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('$4,399/yr')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/billing/checkout'),
          expect.objectContaining({
            method: 'POST',
          })
        )
      })

      const fetchInit = vi.mocked(global.fetch).mock.calls[0]?.[1] as
        | RequestInit
        | undefined
      const checkoutBody = JSON.parse(String(fetchInit?.body))
      expect(checkoutBody).toEqual(
        expect.objectContaining({
          plan_id: 'reconcile',
          billing_period: 'annual',
          unit_count: 120,
          building_count: 12,
        })
      )
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('ignores select-plan checkout intent for active Stripe subscriptions', async () => {
    const user = userEvent.setup()
    const portalMutate = vi.fn()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing?intent=select-plan&units=120',
      search: '?intent=select-plan&units=120',
    } as Location

    vi.mocked(useStripePortal).mockReturnValue({
      mutate: portalMutate,
      isPending: false,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
    } as unknown as ReturnType<typeof useStripePortal>)
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_active',
        plan: 'reconcile',
        tier: 'reconcile',
        billing_interval: 'annual',
        stripe_subscription_id: 'sub_stripe_active',
        status: 'active',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 25,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 25,
        unitsLimit: 25,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      expect(screen.queryByRole('button', { name: /select plan/i })).toBeNull()

      await user.click(screen.getByRole('button', { name: /change plan/i }))

      expect(global.fetch).not.toHaveBeenCalled()
      expect(portalMutate).toHaveBeenCalledWith(
        'http://localhost:3000/settings/billing'
      )
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('renders checkout plan selection when select-plan has no subscription yet', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing?intent=select-plan&units=120',
      search: '?intent=select-plan&units=120',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: null,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 0,
        propertiesLimit: 50,
        unitsUsed: 0,
        unitsLimit: 25,
        usersUsed: 1,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: 'https://checkout.stripe.com/c/test',
      }),
    } as Response)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('$4,399/yr')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /select plan/i }))
      await user.click(
        await screen.findByRole('button', {
          name: /confirm and add billing/i,
        })
      )

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/billing/checkout'),
          expect.objectContaining({ method: 'POST' })
        )
      })

      const checkoutBody = JSON.parse(
        String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)
      )
      expect(checkoutBody).toEqual(
        expect.objectContaining({
          plan_id: 'reconcile',
          billing_period: 'annual',
          unit_count: 120,
          building_count: 1,
        })
      )
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('uses saved annual activation cadence when a legacy local trial row has no billing interval', async () => {
    // The 80OFF launch promo has a real endsAt (2026-07-04T07:00:00Z) and
    // isLaunchOfferLive() compares it against wall-clock time, so the discounted
    // price this test asserts stops rendering once that date passes. Pin the clock
    // inside the offer window; shouldAdvanceTime keeps RTL waitFor/userEvent working.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'))
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing',
    } as Location

    vi.mocked(useBillingActivation).mockReturnValue({
      data: {
        plan_id: 'control',
        billing_period: 'annual',
        unit_count: 120,
        building_count: 12,
        selected_at: '2026-04-28T00:00:00Z',
        checkout_required: false,
        has_active_access: true,
        has_paused_subscription: false,
        subscription_status: 'trialing',
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBillingActivation>)
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        tier: 'control',
        billing_interval: null,
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: 'https://checkout.stripe.com/c/test',
      }),
    } as Response)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const checkoutBody = JSON.parse(
        String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)
      )
      expect(checkoutBody.billing_period).toBe('annual')
      expect(checkoutBody.launch_offer_code).toBe('80OFF')
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('preserves offer_token and omits 80OFF when an explicit conflicting offer is present', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing?offer=PARTNER&offer_token=tok_123',
      search: '?offer=PARTNER&offer_token=tok_123',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        tier: 'control',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: 'https://checkout.stripe.com/c/test',
      }),
    } as Response)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const checkoutBody = JSON.parse(
        String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)
      )
      expect(checkoutBody.offer_token).toBe('tok_123')
      expect(checkoutBody.launch_offer_code).toBeUndefined()
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('preserves offer_token and omits default 80OFF when offer is absent', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Location }).location = {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/settings/billing?offer_token=tok_123',
      search: '?offer_token=tok_123',
    } as Location

    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_trial',
        plan: 'growth_v2',
        tier: 'control',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'trialing',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: 'https://checkout.stripe.com/c/test',
      }),
    } as Response)

    try {
      render(<BillingPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByRole('button', { name: /^add billing$/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })

      const checkoutBody = JSON.parse(
        String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)
      )
      expect(checkoutBody.offer_token).toBe('tok_123')
      expect(checkoutBody.launch_offer_code).toBeUndefined()
    } finally {
      ;(window as unknown as { location: Location }).location = originalLocation
    }
  })

  it('opens Stripe checkout for expired local trials without showing resume access', async () => {
    const user = userEvent.setup()
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_paused',
        plan: 'growth_v2',
        tier: 'control',
        billing_interval: 'annual',
        stripe_subscription_id: null,
        status: 'paused',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_url: '#checkout-session',
      }),
    } as Response)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(screen.queryByRole('button', { name: /resume access/i })).toBeNull()
    expect(
      screen.getByText(/add billing to restore access to your workspace/i)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^add billing$/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/billing/checkout'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('shows the unit overage banner and update billing action when usage exceeds coverage', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_123',
        plan: 'growth_v2',
        status: 'active',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 20,
        unit_count: 50,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 20,
        propertiesLimit: 50,
        unitsUsed: 60,
        unitsLimit: 50,
        usersUsed: 6,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /rentable unit limit exceeded/i })
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: /update billing/i }).length
    ).toBeGreaterThan(0)
  })

  it('shows canceling state and resume action for subscriptions ending at period close', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_canceling',
        plan: 'growth_v2',
        status: 'active',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T12:00:00Z',
        cancel_at_period_end: true,
        building_count: 12,
        unit_count: 120,
        stripe_subscription_id: 'sub_stripe',
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(screen.getByText('Canceling')).toBeInTheDocument()
    expect(screen.getByText('No upcoming invoice')).toBeInTheDocument()
    expect(
      screen.getByText(/your subscription will end on february 1, 2024/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /resume subscription/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /cancel subscription/i })
    ).not.toBeInTheDocument()
  })

  it('opens the cancellation wizard from an active subscription', async () => {
    const user = userEvent.setup()
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_active',
        plan: 'growth_v2',
        status: 'active',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
        stripe_subscription_id: 'sub_stripe',
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 12,
        propertiesLimit: 50,
        unitsUsed: 120,
        unitsLimit: 120,
        usersUsed: 4,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    await user.click(
      screen.getByRole('button', { name: /cancel subscription/i })
    )

    expect(
      screen.getByRole('heading', { name: /before you go/i })
    ).toBeInTheDocument()
  })

  it('renders the no active subscription state', () => {
    vi.mocked(useSubscription).mockReturnValue({
      data: null,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: {
        propertiesUsed: 0,
        propertiesLimit: 50,
        unitsUsed: 0,
        unitsLimit: 50,
        usersUsed: 1,
        usersLimit: -1,
      },
      isLoading: false,
    } as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/no active subscription/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/pricing'
    )
  })

  it('surfaces a retryable error, not a blank card, when usage fails to load (F-425)', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.mocked(useSubscription).mockReturnValue({
      data: {
        id: 'sub_123',
        plan: 'growth_v2',
        status: 'active',
        pricing_model: 'per_unit',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        cancel_at_period_end: false,
        building_count: 12,
        unit_count: 120,
      },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSubscription>)
    vi.mocked(useOrganizationUsage).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useOrganizationUsage>)

    render(<BillingPage />, { wrapper: RouterWrapper })

    // The usage card must not silently render an empty body on failure.
    const errorState = screen.getByTestId('usage-load-error')
    expect(errorState).toBeInTheDocument()
    expect(
      screen.getByText(/couldn.t load your usage this period/i)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
