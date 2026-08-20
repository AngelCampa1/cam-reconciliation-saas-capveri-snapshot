import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckoutPage } from './Checkout'
import { supabase } from '@/lib/supabase'
import { configureAuth } from '@/api/client'
import { subscriptionKeys } from '@/hooks/use-subscription'

const mockNavigate = vi.fn()
const mockUseBillingActivation = vi.fn()
let mockSearchParams = ''
let queryClient: QueryClient

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(mockSearchParams)],
  }
})

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

const mockToastError = vi.fn()
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

vi.mock('@/hooks/use-billing-activation', () => ({
  useBillingActivation: () => mockUseBillingActivation(),
}))

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
)

describe('CheckoutPage', () => {
  const getSessionMock = vi.mocked(supabase.auth.getSession)

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    global.fetch = vi.fn()
    mockSearchParams = ''
    mockUseBillingActivation.mockReturnValue({
      data: {
        plan_id: null,
        billing_period: null,
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: true,
        has_active_access: false,
        has_paused_subscription: false,
        subscription_status: null,
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-access-token',
          user: { id: 'mock-user-id' },
        },
      },
      error: null,
    })
    configureAuth({
      getSession: async () => ({
        access_token: 'mock-access-token',
        user: { id: 'mock-user-id' },
      }),
      signOut: async () => {},
    })
  })

  it('renders Reconcile unit-count checkout copy', () => {
    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText('Choose your unit count and start your free trial')
    ).toBeInTheDocument()
    expect(
      screen.getByText(/pick your rentable unit count now/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/add billing before the trial ends to keep access/i)
    ).toBeInTheDocument()
    expect(screen.getByText('30-day money-back guarantee')).toBeInTheDocument()
    expect(
      screen.getByText(/refund from billing within 30 days/i)
    ).toBeInTheDocument()
    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText(/rentable units/i).length).toBeGreaterThan(
      0
    )
    expect(screen.queryByLabelText(/buildings/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/minimum subscription: \$4,990\/yr for up to 25/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /start 30-day trial/i })
    ).toBeInTheDocument()
  })

  it('normalizes legacy portfolio tier and ignores legacy sizing params', () => {
    // The 80OFF launch promo has a real endsAt (2026-07-04T07:00:00Z) and
    // isLaunchOfferLive() compares it against wall-clock time, so the discounted
    // price this test asserts stops rendering once that date passes. Pin the clock
    // inside the offer window; shouldAdvanceTime keeps RTL waitFor/userEvent working.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'))
    mockSearchParams = '?tier=portfolio&units=120&buildings=12'

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('spinbutton', { name: /rentable units/i })
    ).toHaveValue(120)
    expect(screen.queryByLabelText(/buildings/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/\$4,399\/yr/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\$21,995\/yr/).length).toBeGreaterThan(0)
  })

  it('keeps large published-band unit counts self-serve', async () => {
    const user = userEvent.setup()
    mockSearchParams = '?tier=reconcile&units=100001'
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_required: false,
        has_active_access: true,
        subscription_status: 'trialing',
      }),
    })
    global.fetch = mockFetch

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('spinbutton', { name: /rentable units/i })
    ).toHaveValue(100001)

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const checkoutCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/billing/trial/start')
    )
    const checkoutBody = JSON.parse(String(checkoutCall?.[1]?.body))
    expect(checkoutBody).toMatchObject({
      plan_id: 'reconcile',
      unit_count: 100001,
    })
  })

  it('accepts legacy plan query params and normalizes them to tier', async () => {
    mockSearchParams = '?plan=portfolio&units=120&buildings=12'

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/checkout?units=120&buildings=12&tier=reconcile',
        { replace: true }
      )
    })
    expect(
      screen.getByRole('spinbutton', { name: /rentable units/i })
    ).toBeInTheDocument()
  })

  it('normalizes legacy checkout tier requests to Reconcile', () => {
    mockSearchParams = '?tier=legacy&buildings=60'

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: /start 30-day trial/i })
    ).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('starts a no-card trial with selected unit_count and building_count', async () => {
    // The 80OFF launch promo has a real endsAt (2026-07-04T07:00:00Z) and
    // isLaunchOfferLive() compares it against wall-clock time, so the discounted
    // price this test asserts stops rendering once that date passes. Pin the clock
    // inside the offer window; shouldAdvanceTime keeps RTL waitFor/userEvent working.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-15T00:00:00Z'))
    const user = userEvent.setup()
    const refetch = vi.fn().mockResolvedValue({})
    mockUseBillingActivation.mockReturnValue({
      data: {
        plan_id: null,
        billing_period: null,
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: true,
        has_active_access: false,
        has_paused_subscription: false,
        subscription_status: null,
      },
      isLoading: false,
      refetch,
    })
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_required: false,
        has_active_access: true,
        subscription_status: 'trialing',
      }),
    })
    global.fetch = mockFetch
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    fireEvent.change(
      screen.getByRole('spinbutton', { name: /rentable units/i }),
      {
        target: { value: '151' },
      }
    )
    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some(([url]) =>
          String(url).includes('/api/v1/billing/trial/start')
        )
      ).toBe(true)
    })

    const checkoutCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/billing/trial/start')
    )

    expect(checkoutCall).toBeDefined()
    const fetchInit = checkoutCall?.[1] as RequestInit | undefined
    expect(fetchInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          plan_id: 'reconcile',
          billing_period: 'annual',
          unit_count: 151,
          building_count: 1,
          launch_offer_code: '80OFF',
        }),
      })
    )
    expect(new Headers(fetchInit?.headers).get('Content-Type')).toBe(
      'application/json'
    )

    expect(refetch).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: subscriptionKeys.all,
    })
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('keeps offer_token out of no-card trial start and omits 80OFF when both are present', async () => {
    const user = userEvent.setup()
    mockSearchParams = '?tier=reconcile&offer=80OFF&offer_token=tok_123'
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_required: false,
        has_active_access: true,
        subscription_status: 'trialing',
      }),
    })
    global.fetch = mockFetch

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText(/\$4,990\/yr/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/80OFF: 80% off the first year/i)).toBeNull()

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const checkoutCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/billing/trial/start')
    )
    const checkoutBody = JSON.parse(String(checkoutCall?.[1]?.body))
    expect(checkoutBody).toEqual(
      expect.objectContaining({
        plan_id: 'reconcile',
      })
    )
    expect(checkoutBody.offer_token).toBeUndefined()
    expect(checkoutBody.launch_offer_code).toBeUndefined()
  })

  it('keeps offer_token out of no-card trial start and omits default 80OFF when offer is absent', async () => {
    const user = userEvent.setup()
    mockSearchParams = '?tier=reconcile&offer_token=tok_123'
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_required: false,
        has_active_access: true,
        subscription_status: 'trialing',
      }),
    })
    global.fetch = mockFetch

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(screen.queryByText(/80OFF: 80% off the first year/i)).toBeNull()

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const checkoutCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/billing/trial/start')
    )
    const checkoutBody = JSON.parse(String(checkoutCall?.[1]?.body))
    expect(checkoutBody.offer_token).toBeUndefined()
    expect(checkoutBody.launch_offer_code).toBeUndefined()
  })

  it('preserves conflicting offer behavior without applying 80OFF', async () => {
    const user = userEvent.setup()
    mockSearchParams = '?tier=reconcile&offer=PARTNER&offer_token=tok_123'
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_required: false,
        has_active_access: true,
        subscription_status: 'trialing',
      }),
    })
    global.fetch = mockFetch

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText(/\$4,990\/yr/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/80OFF: 80% off the first year/i)).toBeNull()

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const checkoutCall = mockFetch.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/billing/trial/start')
    )
    const checkoutBody = JSON.parse(String(checkoutCall?.[1]?.body))
    expect(checkoutBody.offer_token).toBeUndefined()
    expect(checkoutBody.launch_offer_code).toBeUndefined()
  })

  it('navigates after trial start when activation refetch fails', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn().mockRejectedValue(new Error('refetch failed'))
    mockUseBillingActivation.mockReturnValue({
      data: {
        plan_id: null,
        billing_period: null,
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: true,
        has_active_access: false,
        has_paused_subscription: false,
        subscription_status: null,
      },
      isLoading: false,
      refetch,
    })
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        checkout_required: false,
        has_active_access: true,
        subscription_status: 'trialing',
      }),
    })

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
    expect(mockToastError).not.toHaveBeenCalledWith(
      'Trial start failed',
      expect.anything()
    )
  })

  it('requires authentication when there is no session', async () => {
    const user = userEvent.setup()
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Authentication required', {
        description: 'Please log in to continue with checkout.',
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('routes paused subscriptions to billing when checkout returns 409', async () => {
    const user = userEvent.setup()
    mockUseBillingActivation.mockReturnValue({
      data: {
        plan_id: null,
        billing_period: null,
        unit_count: null,
        building_count: null,
        selected_at: null,
        checkout_required: true,
        has_active_access: false,
        has_paused_subscription: false,
        subscription_status: null,
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        detail:
          'Your trial is paused because billing was not added before it ended. Add a payment method in billing settings to resume access.',
      }),
    })

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Billing required to resume access',
        expect.objectContaining({
          description: expect.stringContaining('resume access'),
        })
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/settings/billing')
  })

  it('shows a selection mismatch error without redirecting to billing', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        detail: 'Saved checkout selection does not match this request',
      }),
    })

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    await user.click(
      screen.getByRole('button', { name: /start 30-day trial/i })
    )

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Checkout selection changed',
        {
          description: 'Saved checkout selection does not match this request',
        }
      )
    })
    expect(mockNavigate).not.toHaveBeenCalledWith('/settings/billing')
  })

  it('redirects already-active users away from checkout', async () => {
    mockUseBillingActivation.mockReturnValue({
      data: {
        plan_id: 'reconcile',
        billing_period: 'annual',
        unit_count: 25,
        building_count: 1,
        selected_at: '2026-04-22T00:00:00Z',
        checkout_required: false,
        has_active_access: true,
        has_paused_subscription: false,
        subscription_status: 'trialing',
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<CheckoutPage />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })
})
