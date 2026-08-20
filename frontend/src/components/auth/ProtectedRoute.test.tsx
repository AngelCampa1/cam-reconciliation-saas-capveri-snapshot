/**
 * Tests for ProtectedRoute component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { UserRole } from '@/types/enums'
import type { User, Session } from '@supabase/supabase-js'

// Mock useAuth hook from AuthContext
const mockUseAuth = vi.fn()
const mockUseBillingActivation = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/hooks/use-billing-activation', () => ({
  useBillingActivation: () => mockUseBillingActivation(),
}))

// Mock spinner component
vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ size }: { size?: string }) => (
    <div data-testid="spinner" data-size={size}>
      Loading...
    </div>
  ),
}))

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBillingActivation.mockReturnValue({
      data: {
        checkout_required: false,
        has_paused_subscription: false,
      },
      isLoading: false,
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner while authentication is being checked', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        session: null,
        userRole: null,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByTestId('spinner')).toBeInTheDocument()
      expect(screen.getByTestId('spinner')).toHaveAttribute('data-size', 'lg')
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })

  describe('Unauthenticated Access', () => {
    it('redirects to login when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        session: null,
        userRole: null,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/auth/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Login Page')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('preserves return URL in query string when redirecting', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        session: null,
        userRole: null,
      })

      // Component to capture location
      function LocationCapture() {
        const location = useLocation()
        return (
          <div>
            <div>Login Page</div>
            <div data-testid="search">{location.search}</div>
          </div>
        )
      }

      render(
        <MemoryRouter initialEntries={['/dashboard?tab=overview']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/auth/login" element={<LocationCapture />} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Login Page')).toBeInTheDocument()
      expect(screen.getByTestId('search').textContent).toContain(
        'returnUrl=%2Fdashboard%3Ftab%3Doverview'
      )
    })

    it('uses custom redirect path when provided', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        session: null,
        userRole: null,
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute redirectTo="/auth/signin">
                  <div>Admin Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/auth/signin" element={<div>Custom Login</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Custom Login')).toBeInTheDocument()
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
    })
  })

  describe('Anonymous (PLG onboarding) Access', () => {
    it('redirects anonymous users back to /onboard instead of admitting them', () => {
      const mockUser = {
        id: 'anon-123',
        email: null,
        is_anonymous: true,
      } as unknown as User

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isAnonymous: true,
        isLoading: false,
        user: mockUser,
        session: { user: mockUser } as Session,
        userRole: UserRole.OWNER,
      })

      render(
        <MemoryRouter initialEntries={['/tax-protest']}>
          <Routes>
            <Route
              path="/tax-protest"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/onboard" element={<div>Onboarding Flow</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Onboarding Flow')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })

  describe('Authenticated Access', () => {
    it('renders protected content when authenticated', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: UserRole.MEMBER,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
    })

    it('renders protected content when checkout_required is true (trial no longer gates access)', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      } as User

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: { user: mockUser } as Session,
        userRole: UserRole.MEMBER,
      })
      mockUseBillingActivation.mockReturnValue({
        data: {
          checkout_required: true,
          has_paused_subscription: false,
        },
        isLoading: false,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/checkout" element={<div>Checkout Page</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  describe('Role-Based Access Control', () => {
    it('allows access when user has one of the required roles', () => {
      const mockUser = {
        id: 'user-123',
        email: 'admin@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: UserRole.ADMIN,
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute
                  requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}
                >
                  <div>Admin Panel</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    })

    it('redirects to /403 when user lacks required role', () => {
      const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: UserRole.VIEWER,
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute
                  requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}
                >
                  <div>Admin Panel</div>
                </ProtectedRoute>
              }
            />
            <Route path="/403" element={<div>Permission Denied</div>} />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Permission Denied')).toBeInTheDocument()
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
    })

    it('allows access when no role requirement specified', () => {
      const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: UserRole.MEMBER,
      })

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
    })

    it('allows OWNER when ADMIN or OWNER required', () => {
      const mockUser = {
        id: 'user-123',
        email: 'owner@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: UserRole.OWNER,
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute
                  requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}
                >
                  <div>Admin Panel</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    })

    it('shows a loading spinner when userRole is null but roles are required (async role fetch in progress)', () => {
      const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: null,
      })

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRoles={[UserRole.OWNER]}>
                  <div>Admin Panel</div>
                </ProtectedRoute>
              }
            />
            <Route path="/403" element={<div>Permission Denied</div>} />
          </Routes>
        </MemoryRouter>
      )

      // When userRole is null (not yet loaded), show a spinner rather than
      // immediately redirecting — avoids race condition on initial page load.
      expect(screen.getByTestId('spinner')).toBeInTheDocument()
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
      expect(screen.queryByText('Permission Denied')).not.toBeInTheDocument()
    })
  })

  describe('Nested Routes', () => {
    it('works correctly with nested route structure', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      } as User

      const mockSession = {
        user: mockUser,
        access_token: 'token-123',
      } as Session

      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: mockUser,
        session: mockSession,
        userRole: UserRole.MEMBER,
      })

      render(
        <MemoryRouter initialEntries={['/app/settings/profile']}>
          <Routes>
            <Route
              path="/app/*"
              element={
                <ProtectedRoute>
                  <Routes>
                    <Route
                      path="settings/profile"
                      element={<div>Profile Settings</div>}
                    />
                  </Routes>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      )

      expect(screen.getByText('Profile Settings')).toBeInTheDocument()
    })
  })
})
