/**
 * Protected Route Component
 *
 * Wraps routes that require authentication. Redirects unauthenticated users
 * to login while preserving the return URL. Optionally enforces role-based
 * access control.
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner } from '@/components/ui/spinner'
import { useBillingActivation } from '@/hooks/use-billing-activation'
import { UserRole } from '@/types/enums'
import type { UserRole as UserRoleType } from '@/types/enums'

interface ProtectedRouteProps {
  /**
   * Content to render when authenticated
   */
  children: React.ReactNode
  /**
   * Optional array of roles that can access this route
   */
  requiredRoles?: UserRoleType[]
  /**
   * Require platform admin privileges (for platform-wide resources)
   */
  requirePlatformAdmin?: boolean
  /**
   * Optional redirect path (defaults to /login)
   */
  redirectTo?: string
}

/**
 * ProtectedRoute Component
 *
 * Guards routes from unauthenticated access. Shows loading spinner during
 * authentication check, redirects to login if not authenticated, and optionally
 * checks for required roles.
 *
 * @example
 * ```tsx
 * <Route path="/dashboard" element={
 *   <ProtectedRoute>
 *     <Dashboard />
 *   </ProtectedRoute>
 * } />
 *
 * <Route path="/admin" element={
 *   <ProtectedRoute requiredRoles={[UserRole.OWNER, UserRole.ADMIN]}>
 *     <AdminPanel />
 *   </ProtectedRoute>
 * } />
 * ```
 */
export function ProtectedRoute({
  children,
  requiredRoles,
  requirePlatformAdmin = false,
  redirectTo = '/auth/login',
}: ProtectedRouteProps) {
  const { isAuthenticated, isAnonymous, isLoading, userRole, isPlatformAdmin } =
    useAuth()
  const location = useLocation()
  const isTenantRoute =
    (requiredRoles?.length ?? 0) > 0 &&
    requiredRoles?.every((role) => role === UserRole.TENANT)
  const { data: billingActivation, isLoading: isBillingActivationLoading } =
    useBillingActivation(isAuthenticated && !isLoading && !isTenantRoute)

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Preserve current path as return URL
    const returnUrl = location.pathname + location.search
    return (
      <Navigate
        to={`${redirectTo}?returnUrl=${encodeURIComponent(returnUrl)}`}
        replace
      />
    )
  }

  // Anonymous users belong to the PLG /onboard flow only. They hold a token
  // but have no real org membership, so admitting them here would render a
  // protected page whose API calls 403 to a blank dead end. Send them back to
  // resume onboarding instead.
  if (isAnonymous) {
    return <Navigate to="/onboard" replace />
  }

  // Check platform admin requirement
  if (requirePlatformAdmin && !isPlatformAdmin) {
    return <Navigate to="/403" replace />
  }

  // Check role requirement if specified.
  // If authenticated but userRole not yet loaded (async fetch), wait rather than
  // immediately redirecting to 403, avoids a race condition on initial page load.
  if (requiredRoles && requiredRoles.length > 0) {
    if (!userRole) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      )
    }
    if (!requiredRoles.includes(userRole)) {
      return <Navigate to="/403" replace />
    }
  }

  const isBillingRecoveryRoute =
    location.pathname.startsWith('/settings/billing')
  if (!isTenantRoute && isBillingActivationLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (
    !isTenantRoute &&
    billingActivation?.has_paused_subscription &&
    !isBillingRecoveryRoute
  ) {
    return <Navigate to="/settings/billing" replace />
  }

  // Render protected content
  return <>{children}</>
}
