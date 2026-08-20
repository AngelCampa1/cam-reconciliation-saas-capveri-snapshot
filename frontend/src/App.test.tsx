import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from './hooks/useTheme'

// Mock useAuth hook - define before the mocks
const mockLogout = vi.fn()
const mockNavigate = vi.fn()
const mockUseAuth = vi.fn()
const mockUseBillingActivation = vi.fn()
const mockUseSubscription = vi.fn()
const mockListExtractions = vi.fn()

// Mock Supabase client (must be before App import)
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn((callback) => {
        // Invoke callback immediately like the real implementation
        callback('INITIAL_SESSION', null)
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        }
      }),
    },
  },
}))

// Mock both auth modules since some components import directly from contexts
vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useAuth: () => mockUseAuth(),
}))

vi.mock('./hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useAuth: () => mockUseAuth(),
}))

vi.mock('./hooks/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: true,
    isOwner: true,
    userRole: 'owner',
  }),
}))

vi.mock('./hooks/use-billing-activation', () => ({
  useBillingActivation: () => mockUseBillingActivation(),
}))

vi.mock('./hooks/use-subscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

vi.mock('./hooks/use-feature-usage', () => ({
  useFeatureUsage: () => ({
    data: { used_features: [], current_tier: null },
    isLoading: false,
  }),
}))

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual('@/api/client')
  return {
    ...actual,
    apiClient: {},
    listExtractionsApiV1ExtractionsGet: (...args: unknown[]) =>
      mockListExtractions(...args),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import App from './App'
import { getTrialBannerVariant } from './lib/trial-banner'

describe('App', () => {
  let anchorClickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogout.mockResolvedValue(undefined)
    anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    mockUseBillingActivation.mockReturnValue({
      data: {
        checkout_required: false,
        has_paused_subscription: false,
        subscription_status: 'active',
        trial_days_remaining: null,
      },
      isLoading: false,
    })
    mockUseSubscription.mockReturnValue({
      data: null,
      isLoading: false,
    })
    mockListExtractions.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        has_next: false,
      },
      error: undefined,
    })
  })

  afterEach(() => {
    anchorClickSpy.mockRestore()
    window.history.pushState({}, '', '/')
  })

  const renderApp = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  it('renders CapVeri heading', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      logout: mockLogout,
      loading: false,
      isLoading: false,
    })

    renderApp()
    const headings = screen.getAllByText(/CapVeri/i)
    expect(headings.length).toBeGreaterThan(0)
  })

  describe('Unauthenticated State', () => {
    it('does not render Header when user is not logged in', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // Header should not be present (user dropdown, logout button, etc.)
      expect(
        screen.queryByRole('button', { name: /logout/i })
      ).not.toBeInTheDocument()
    })

    it('does not render BottomNav when user is not logged in', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      const { container } = renderApp()

      // BottomNav uses nav element with specific classes
      const bottomNav = container.querySelector('nav.fixed.bottom-0')
      expect(bottomNav).not.toBeInTheDocument()
    })

    it('renders tenant forgot password route from tenant login link', async () => {
      window.history.pushState({}, '', '/tenant/forgot-password')
      mockUseAuth.mockReturnValue({
        user: null,
        logout: mockLogout,
        resetPassword: vi.fn(),
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByRole('heading', { name: /reset your password/i })
      ).toBeInTheDocument()
      expect(screen.queryByText('404')).not.toBeInTheDocument()
    })

    it('renders public sample report route', async () => {
      window.history.pushState({}, '', '/sample-report')
      mockUseAuth.mockReturnValue({
        user: null,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByRole('heading', {
          name: /sample cam reconciliation report/i,
        })
      ).toBeInTheDocument()
      expect(screen.queryByText('404')).not.toBeInTheDocument()
    })

    it('renders public tools routes', async () => {
      window.history.pushState({}, '', '/tools/cam-gross-up-calculator')
      mockUseAuth.mockReturnValue({
        user: null,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByRole('heading', {
          name: /cam gross-up scenario calculator/i,
        })
      ).toBeInTheDocument()
      expect(screen.queryByText('404')).not.toBeInTheDocument()
    })
  })

  describe('Authenticated State', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2024-01-01',
    }

    it('renders Header with user name when logged in', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // Wait for redirect from / to /dashboard
      await screen.findByText('test')

      // Header should display user name (the part before @ in email)
      // The Header component displays userName prop which is email.split('@')[0]
      expect(screen.getByText('test')).toBeInTheDocument()
    })

    it('shows an early trial notice (early variant) for trials with many days left', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })
      mockUseBillingActivation.mockReturnValue({
        data: {
          checkout_required: false,
          has_paused_subscription: false,
          subscription_status: 'trialing',
          trial_days_remaining: 25,
        },
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByText(/you're on a free trial/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/25 days left/i)).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /add billing/i })
      ).toHaveAttribute('href', '/settings/billing?intent=select-plan')
    })

    it('shows a prominent trial warning (urgent variant) when ≤3 days remain', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })
      mockUseBillingActivation.mockReturnValue({
        data: {
          checkout_required: false,
          has_paused_subscription: false,
          subscription_status: 'trialing',
          trial_days_remaining: 2,
        },
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByText(/your free trial ends in 2 days/i)
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /add billing/i })
      ).toHaveAttribute('href', '/settings/billing?intent=select-plan')
    })

    it('shows a non-dismissible expired banner (paused variant) when trial ends', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })
      mockUseBillingActivation.mockReturnValue({
        data: {
          checkout_required: true,
          has_paused_subscription: true,
          subscription_status: 'paused',
          trial_days_remaining: null,
        },
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByText(/your trial has ended/i)
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /pick a plan/i })
      ).toHaveAttribute('href', '/settings/billing?intent=select-plan')
    })

    it('does not show a trial banner for active paid subscriptions', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })
      mockUseBillingActivation.mockReturnValue({
        data: {
          checkout_required: false,
          has_paused_subscription: false,
          subscription_status: 'active',
          trial_days_remaining: null,
        },
        isLoading: false,
      })

      renderApp()

      await screen.findByText('test')
      expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument()
    })

    it('renders BottomNav when user is logged in', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      const { container } = renderApp()

      // Wait for redirect from / to /dashboard
      await screen.findByText('test')

      // BottomNav uses nav element with specific classes
      const bottomNav = container.querySelector('nav.fixed.bottom-0')
      expect(bottomNav).toBeInTheDocument()
    })

    it('calls logout and navigates when logout clicked', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // Wait for redirect from / to /dashboard
      await screen.findByText('test')

      // Open user menu dropdown
      const userMenuButton = screen.getByRole('button', { name: /user menu/i })
      await user.click(userMenuButton)

      // Click logout button in dropdown
      const logoutButton = screen.getByTestId('logout-button')
      await user.click(logoutButton)

      expect(mockLogout).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/auth/login')
    })

    it('navigates to profile when settings clicked', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // Wait for redirect from / to /dashboard
      await screen.findByText('test')

      // Open user menu dropdown
      const userMenuButton = screen.getByRole('button', { name: /user menu/i })
      await user.click(userMenuButton)

      // Click settings button in dropdown
      const settingsButton = screen.getByTestId('settings-button')
      await user.click(settingsButton)

      expect(mockNavigate).toHaveBeenCalledWith('/settings/profile')
    })

    it('navigates to dashboard when logo is clicked', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // Wait for redirect from / to /dashboard
      await screen.findByText('test')

      // Click the logo (which has data-testid="logo-button")
      const logo = screen.getByTestId('logo-button')
      await user.click(logo)

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('opens contextual help from the header help button', async () => {
      const user = userEvent.setup()
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await screen.findByText('test')
      await user.click(screen.getByTestId('header-help-button'))

      expect(screen.getByText('Help guide')).toBeInTheDocument()
      expect(
        screen.getByText('Start with your first property')
      ).toBeInTheDocument()
    })

    it('renders protected /help route', async () => {
      window.history.pushState({}, '', '/help')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByRole('heading', { name: 'Help' })
      ).toBeInTheDocument()
      expect(
        screen.getByText('New to CapVeri? Start here.')
      ).toBeInTheDocument()
    })

    it('renders the document extractions page', async () => {
      window.history.pushState({}, '', '/extractions')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(
        await screen.findByRole('heading', { name: /document extractions/i })
      ).toBeInTheDocument()
      expect(mockListExtractions).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            page: 1,
            page_size: 20,
          }),
        })
      )
    })

    it('renders /pricing route without 404', async () => {
      window.history.pushState({}, '', '/pricing')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // PricingPage renders the current Reconcile pricing schedule.
      const pricingEls = await screen.findAllByText(/\$998/i)
      expect(pricingEls.length).toBeGreaterThan(0)
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('redirects /checkout to /settings/billing', async () => {
      window.history.pushState({}, '', '/checkout')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      // /checkout now redirects to /settings/billing; confirm the billing page renders
      expect(
        await screen.findByText(/billing & subscription/i)
      ).toBeInTheDocument()
    })

    it('preserves legacy onboarding checkout params through /onboard/unlock', async () => {
      window.history.pushState(
        {},
        '',
        '/onboard/unlock?tier=portfolio&units=120&buildings=12&billing=annual'
      )
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/checkout?tier=portfolio&units=120&buildings=12&billing=annual',
          { replace: true }
        )
      })
    })

    it('renders the dedicated rent roll upload route', async () => {
      window.history.pushState({}, '', '/rent-roll/upload')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(await screen.findByTestId('page-header-title')).toHaveTextContent(
        'Upload Rent Roll'
      )
      expect(
        screen.getByText(/have a file that lists who rents from you/i)
      ).toBeInTheDocument()
    })

    it('denies landlord users access to tenant portal routes', async () => {
      window.history.pushState({}, '', '/tenant/dashboard')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'owner',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(await screen.findByText('Permission Denied')).toBeInTheDocument()
      expect(
        screen.getByText(/You don't have permission to access this page/i)
      ).toBeInTheDocument()
    })

    it('redirects tenant index route to tenant dashboard', async () => {
      window.history.pushState({}, '', '/tenant')
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'tenant' },
        userRole: 'tenant',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/tenant/dashboard')
      )
      expect(screen.getByTestId('sidebar-desktop')).toBeInTheDocument()
    })

    it('redirects tenant users from root to the tenant dashboard, not /dashboard', async () => {
      window.history.pushState({}, '', '/')
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'tenant' },
        userRole: 'tenant',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/tenant/dashboard')
      )
      // Must not have bounced through the landlord-only dashboard to /403.
      expect(screen.queryByText('Permission Denied')).not.toBeInTheDocument()
    })

    it('waits at root for the role to load instead of bouncing to /403', async () => {
      // Cold page load: user is set synchronously but userRole is fetched
      // async. The root route must not redirect to /dashboard before the role
      // resolves, or a tenant gets bounced to /403.
      window.history.pushState({}, '', '/')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: null,
        isAuthenticated: true,
        isLoading: true,
        logout: mockLogout,
        loading: true,
      })

      renderApp()

      // Give the router a tick; it must stay at "/" (no premature redirect).
      await waitFor(() => expect(window.location.pathname).toBe('/'))
      expect(screen.queryByText('Permission Denied')).not.toBeInTheDocument()
    })

    it('redirects /settings to /settings/profile (F-186)', async () => {
      window.history.pushState({}, '', '/settings')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/settings/profile')
      )
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('redirects bare /admin to /admin/feedback (F-255)', async () => {
      window.history.pushState({}, '', '/admin')
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'owner' },
        userRole: 'owner',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/admin/feedback')
      )
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('redirects bare /documents to /ingestion (F-266)', async () => {
      window.history.pushState({}, '', '/documents')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() => expect(window.location.pathname).toBe('/ingestion'))
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('redirects bare /analysis to /analysis/year-over-year (F-266)', async () => {
      window.history.pushState({}, '', '/analysis')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'OWNER',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/analysis/year-over-year')
      )
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('redirects legacy /profile to /settings/profile (F-200)', async () => {
      window.history.pushState({}, '', '/profile')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'owner',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/settings/profile')
      )
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('redirects legacy /organization/settings to /settings/organization (F-200)', async () => {
      window.history.pushState({}, '', '/organization/settings')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'owner',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(window.location.pathname).toBe('/settings/organization')
      )
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
    })

    it('does not show the landlord shell on tenant auth routes', async () => {
      window.history.pushState({}, '', '/tenant/login')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: 'owner',
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      expect(await screen.findByText('Tenant Portal')).toBeInTheDocument()
      expect(screen.queryByTestId('sidebar-desktop')).not.toBeInTheDocument()
    })

    it('never mounts the landlord shell on a tenant route while userRole is still resolving', async () => {
      // Regression: on a fresh tenant reload userRole is briefly null. The
      // landlord shell (Header + TrialBillingBanner) must not flash in — its
      // billing call would 403 for a tenant. The /tenant prefix is treated as
      // shellless by path, so the landlord chrome never mounts here.
      window.history.pushState({}, '', '/tenant/dashboard')
      mockUseAuth.mockReturnValue({
        user: mockUser,
        userRole: null,
        isAuthenticated: true,
        logout: mockLogout,
        loading: false,
        isLoading: false,
      })

      renderApp()

      await waitFor(() =>
        expect(screen.queryByTestId('logo-button')).not.toBeInTheDocument()
      )
      expect(screen.queryByTestId('user-menu-button')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Pure unit tests for getTrialBannerVariant
// These cover the banner-state logic without rendering the full app.
// ---------------------------------------------------------------------------
describe('getTrialBannerVariant', () => {
  it('returns null when subscription_status is active', () => {
    expect(getTrialBannerVariant('active', null, false)).toBeNull()
  })

  it('returns null when subscription_status is null', () => {
    expect(getTrialBannerVariant(null, null, false)).toBeNull()
  })

  it('returns null when trialing but trial_days_remaining is null', () => {
    expect(getTrialBannerVariant('trialing', null, false)).toBeNull()
  })

  it('returns "early" when trialing with >3 days remaining', () => {
    expect(getTrialBannerVariant('trialing', 25, false)).toBe('early')
    expect(getTrialBannerVariant('trialing', 4, false)).toBe('early')
  })

  it('returns "urgent" when trialing with exactly 3 days remaining', () => {
    expect(getTrialBannerVariant('trialing', 3, false)).toBe('urgent')
  })

  it('returns "urgent" when trialing with <3 days remaining', () => {
    expect(getTrialBannerVariant('trialing', 2, false)).toBe('urgent')
    expect(getTrialBannerVariant('trialing', 1, false)).toBe('urgent')
    expect(getTrialBannerVariant('trialing', 0, false)).toBe('urgent')
  })

  it('returns "paused" when has_paused_subscription is true', () => {
    expect(getTrialBannerVariant('trialing', 5, true)).toBe('paused')
    expect(getTrialBannerVariant('active', null, true)).toBe('paused')
  })

  it('returns "paused" when subscription_status is "paused"', () => {
    expect(getTrialBannerVariant('paused', null, false)).toBe('paused')
  })

  it('returns "paused" when subscription_status is "canceled"', () => {
    expect(getTrialBannerVariant('canceled', null, false)).toBe('paused')
  })
})
