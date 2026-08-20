/**
 * Authentication Context
 *
 * Provides centralized authentication state and functions throughout the app.
 * Features:
 * - Session persistence across page refresh
 * - Automatic token refresh (5 min before expiry)
 * - Centralized user and session state
 * - Login, register, resetPassword, logout functions
 * - Loading and error states
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
  useMemo,
} from 'react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { orgNameFromEmail } from '../lib/orgNameFromEmail'
import {
  identifyUserForAnalytics,
  resetAnalyticsIdentity,
  setUserProperties,
  trackEvent,
} from '../lib/analytics'
import { resolveApiUrl } from '../api/url'
import {
  TERMS_HASH,
  TERMS_VERSION,
  currentTermsAcceptance,
} from '../lib/legalTerms'
import { ApiError } from '../api/errors'
import { captureUnexpectedError } from '../lib/sentry'
import type { Session, User, AuthError } from '@supabase/supabase-js'
import type { AuthSession } from '../api/client'
import { UserRole, type UserRole as UserRoleType } from '../types/enums'

interface AuthContextType {
  user: User | null
  session: Session | null
  userRole: UserRoleType | null
  isPlatformAdmin: boolean
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
  /**
   * True when the current session belongs to an anonymous user (the PLG
   * /onboard flow). Anonymous users have a token but no real org membership,
   * so the protected landlord app must keep them in onboarding rather than
   * admit them to pages whose API calls would 403 to a blank screen.
   */
  isAnonymous: boolean
  isAdmin: boolean
  isOwner: boolean
  login: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<UserRoleType | null>
  loginWithGoogle: () => Promise<void>
  handleOAuthCallback: (params: {
    accessToken: string
    refreshToken: string
  }) => Promise<Session>
  register: (
    email: string,
    password: string,
    organizationName?: string
  ) => Promise<boolean>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
  getSession: () => Promise<AuthSession | null>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Map Supabase auth errors to user-friendly messages.
 */
function mapAuthError(error: AuthError | null): string | null {
  if (!error) return null

  // Network errors
  if (error.status === 0 || error.name === 'NetworkError') {
    return 'Network error. Please check your connection and try again.'
  }

  // Duplicate email (registration)
  if (
    error.message?.toLowerCase().includes('user already registered') ||
    error.message?.toLowerCase().includes('already registered') ||
    error.message?.toLowerCase().includes('email already in use')
  ) {
    return 'This email is already registered. Please sign in instead.'
  }

  // Invalid credentials
  if (
    error.message?.includes('Invalid login credentials') ||
    error.message?.includes('Email not confirmed') ||
    error.status === 400
  ) {
    return 'Invalid email or password'
  }

  // Rate limiting
  if (error.status === 429) {
    return 'Too many login attempts. Please try again later.'
  }

  // Server errors
  if (error.status && error.status >= 500) {
    return 'Server error. Please try again later.'
  }

  // Generic error
  return 'An error occurred during login. Please try again.'
}

function triggerWelcomeEmail(accessToken: string): void {
  fetch(resolveApiUrl('/api/v1/auth/welcome'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(currentTermsAcceptance),
  })
    .then((response) => {
      if (response.ok) return

      const error = new ApiError(
        `Welcome email trigger failed with status ${response.status}`,
        response.status
      )
      if (response.status >= 500) {
        captureUnexpectedError(error, {
          operation: 'auth.welcome.fire_and_forget',
          surface: 'auth',
          path: '/api/v1/auth/welcome',
        })
      }
      logger.warn('Failed to trigger welcome email', { error })
    })
    .catch((err) => {
      captureUnexpectedError(err, {
        operation: 'auth.welcome.fire_and_forget',
        surface: 'auth',
        path: '/api/v1/auth/welcome',
      })
      logger.warn('Failed to trigger welcome email', { error: err })
    })
}

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Authentication Provider Component
 *
 * Wraps the application and provides authentication context.
 * Handles session initialization, token refresh, and auth state management.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [userRole, setUserRole] = useState<UserRoleType | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const logoutRef = useRef<(() => Promise<void>) | null>(null)
  const profileRequestIdRef = useRef(0)
  const profileRequestUserIdRef = useRef<string | null>(null)

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  const clearAuthState = useCallback(() => {
    setUser(null)
    setSession(null)
    setUserRole(null)
    setIsPlatformAdmin(false)
  }, [])

  const applySignedOutState = useCallback(() => {
    clearAuthState()
    setUserProperties(null)
    resetAnalyticsIdentity()
    clearRefreshTimer()
  }, [clearAuthState, clearRefreshTimer])

  const beginProfileRequest = useCallback((userId: string | null) => {
    profileRequestIdRef.current += 1
    profileRequestUserIdRef.current = userId
    return profileRequestIdRef.current
  }, [])

  const isCurrentProfileRequest = useCallback(
    (requestId: number, userId: string | null) =>
      profileRequestIdRef.current === requestId &&
      profileRequestUserIdRef.current === userId,
    []
  )

  /**
   * Fetch user profile including role and platform admin status from database
   */
  const fetchUserProfile = useCallback(
    async (
      userId: string
    ): Promise<{
      role: UserRoleType | null
      isPlatformAdmin: boolean
      organizationId: string | null
    }> => {
      try {
        // Bound the profile fetch so a hung Supabase request can't leave the
        // app stuck on isLoading=true forever (infinite spinner on the
        // role-gated routes). On timeout we reject into the catch path below,
        // which signs the user out and surfaces a retry message.
        const PROFILE_FETCH_TIMEOUT_MS = 15_000
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        const { data, error } = await Promise.race([
          supabase
            .from('users')
            .select('role, is_platform_admin, organization_id')
            .eq('id', userId)
            .single(),
          new Promise<never>((_resolve, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('Profile fetch timed out')),
              PROFILE_FETCH_TIMEOUT_MS
            )
          }),
        ]).finally(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId)
        })

        if (error) {
          logger.error('Failed to fetch user profile', {
            error: error.message,
          })
          throw new Error(error.message)
        }

        return {
          role: (data?.role as UserRoleType) || null,
          isPlatformAdmin: data?.is_platform_admin || false,
          organizationId: data?.organization_id || null,
        }
      } catch (err) {
        logger.error('Error fetching user profile', {
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        throw err
      }
    },
    []
  )

  /**
   * Set up token refresh timer
   * Refreshes token 5 minutes before expiry
   */
  const setupTokenRefresh = useCallback(
    (session: Session) => {
      // Clear existing timer
      clearRefreshTimer()

      if (!session.expires_at) return

      const expiresAt = session.expires_at * 1000 // Convert to milliseconds
      const now = Date.now()
      const fiveMinutes = 5 * 60 * 1000 // 5 minutes in milliseconds
      const refreshAt = expiresAt - fiveMinutes

      // Only set timer if refresh time is in the future
      if (refreshAt > now) {
        const timeout = refreshAt - now
        refreshTimerRef.current = setTimeout(async () => {
          try {
            const { data, error } = await supabase.auth.refreshSession()
            if (error) {
              logger.error('Token refresh failed', {
                error: error.message,
              })
              // Log out on refresh failure
              await logoutRef.current?.()
            } else if (data.session) {
              setSession(data.session)
              setUser(data.session.user)
              // Set up next refresh
              setupTokenRefresh(data.session)
            }
          } catch (err) {
            logger.error('Token refresh error', {
              error: err instanceof Error ? err.message : 'Unknown error',
            })
            await logoutRef.current?.()
          }
        }, timeout)
      }
    },
    [clearRefreshTimer]
  )

  /**
   * Initialize session from Supabase on mount
   *
   * PROPER PATTERN: Use onAuthStateChange listener only
   * - The listener fires IMMEDIATELY on mount with current session
   * - No need to manually call getSession() which can hang in React StrictMode
   * - Supabase SDK handles session persistence and token refresh automatically
   */
  useEffect(() => {
    // Listen for auth state changes
    // This fires IMMEDIATELY on mount with the current session (if any)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const profileRequestId = beginProfileRequest(session?.user.id ?? null)
      setSession(session)
      setUser(session?.user ?? null)

      if (session) {
        setupTokenRefresh(session)

        if (session.user.is_anonymous) {
          // Anonymous users (PLG /onboard flow) have no row in the users table yet.
          // Skip the profile fetch --- it would return 406. Default to OWNER role.
          if (isCurrentProfileRequest(profileRequestId, session.user.id)) {
            setUserRole(UserRole.OWNER)
            setIsPlatformAdmin(false)
            setUserProperties(session.user.id)
            identifyUserForAnalytics({
              userId: session.user.id,
              organizationId: null,
              role: UserRole.OWNER,
              isPlatformAdmin: false,
            })
          }
        } else {
          // Fetch user role and platform admin status (non-blocking)
          setUserRole(null)
          setIsPlatformAdmin(false)
          fetchUserProfile(session.user.id)
            .then(({ role, isPlatformAdmin: isAdmin, organizationId }) => {
              if (!isCurrentProfileRequest(profileRequestId, session.user.id)) {
                return
              }
              setUserRole(role)
              setIsPlatformAdmin(isAdmin)
              setUserProperties(session.user.id, organizationId)
              identifyUserForAnalytics({
                userId: session.user.id,
                ...(session.user.email ? { email: session.user.email } : {}),
                organizationId,
                role,
                isPlatformAdmin: isAdmin,
              })
              setIsLoading(false)
            })
            .catch((err) => {
              if (!isCurrentProfileRequest(profileRequestId, session.user.id)) {
                return
              }
              logger.error('Failed to fetch user profile', {
                error: err instanceof Error ? err.message : 'Unknown error',
              })
              beginProfileRequest(null)
              applySignedOutState()
              setError('Unable to verify your account. Please sign in again.')
              setIsLoading(false)
            })
          return
        }
      } else {
        applySignedOutState()
      }

      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
      clearRefreshTimer()
    }
  }, [
    applySignedOutState,
    beginProfileRequest,
    clearRefreshTimer,
    fetchUserProfile,
    isCurrentProfileRequest,
    setupTokenRefresh,
  ])

  /**
   * Log in with email and password
   * Uses backend auth proxy with rate limiting (5 attempts per 15 minutes)
   */
  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      setIsLoading(true)
      setError(null)

      try {
        // Use Supabase auth directly (has built-in rate limiting)
        const { data, error: authError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })

        if (authError) {
          setError(mapAuthError(authError))
          beginProfileRequest(null)
          applySignedOutState()
          return null
        }

        if (!data.session || !data.user) {
          beginProfileRequest(null)
          applySignedOutState()
          setError('Failed to establish session. Please try again.')
          return null
        }

        const profileRequestId = beginProfileRequest(data.user.id)
        setSession(data.session)
        setUser(data.user)
        setUserRole(null)
        setIsPlatformAdmin(false)

        // Fetch user role and platform admin status
        let role: UserRoleType | null
        let isAdmin: boolean
        try {
          const profile = await fetchUserProfile(data.user.id)
          role = profile.role
          isAdmin = profile.isPlatformAdmin
        } catch {
          beginProfileRequest(null)
          applySignedOutState()
          setError('Unable to verify your account. Please sign in again.')
          return null
        }
        if (isCurrentProfileRequest(profileRequestId, data.user.id)) {
          setUserRole(role)
          setIsPlatformAdmin(isAdmin)
        }

        // Store remember me preference
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true')
        } else {
          localStorage.removeItem('rememberMe')
        }

        setupTokenRefresh(data.session)
        trackEvent('login_completed', { method: 'email' })
        return role
      } catch (err) {
        beginProfileRequest(null)
        applySignedOutState()
        setError('An unexpected error occurred. Please try again.')
        logger.error('Login error', {
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [
      applySignedOutState,
      beginProfileRequest,
      fetchUserProfile,
      isCurrentProfileRequest,
      setupTokenRefresh,
    ]
  )

  /**
   * Register a new user
   */
  const register = useCallback(
    async (
      email: string,
      password: string,
      organizationName?: string
    ): Promise<boolean> => {
      setIsLoading(true)
      setError(null)

      const resolvedOrgName =
        organizationName?.trim() || orgNameFromEmail(email)

      try {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              organization_name: resolvedOrgName,
              accepted_terms: true,
              terms_version: TERMS_VERSION,
              terms_hash: TERMS_HASH,
            },
          },
        })

        if (authError) {
          setError(mapAuthError(authError))
          return false
        }

        // If email confirmation is required, don't set session yet
        if (data.session && data.user) {
          const profileRequestId = beginProfileRequest(data.user.id)
          setSession(data.session)
          setUser(data.user)
          setUserRole(null)
          setIsPlatformAdmin(false)
          setupTokenRefresh(data.session)

          // Fire signup conversion
          trackEvent('sign_up', { method: 'email' })
          trackEvent('signup_completed', { method: 'email' })

          // Send welcome email --- fire-and-forget, never block signup
          triggerWelcomeEmail(data.session.access_token)

          // Fetch user role and platform admin status
          let role: UserRoleType | null
          let isAdmin: boolean
          try {
            const profile = await fetchUserProfile(data.user.id)
            role = profile.role
            isAdmin = profile.isPlatformAdmin
          } catch {
            beginProfileRequest(null)
            applySignedOutState()
            setError('Unable to verify your account. Please sign in again.')
            return false
          }
          if (isCurrentProfileRequest(profileRequestId, data.user.id)) {
            setUserRole(role)
            setIsPlatformAdmin(isAdmin)
          }
          return true
        }

        return false
      } catch (err) {
        setError('An unexpected error occurred. Please try again.')
        logger.error('Registration error', {
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [
      applySignedOutState,
      beginProfileRequest,
      fetchUserProfile,
      isCurrentProfileRequest,
      setupTokenRefresh,
    ]
  )

  /**
   * Send password reset email
   */
  const resetPassword = useCallback(async (email: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      )

      // Don't reveal if email exists - always show success for security
      if (authError) {
        logger.error('Password reset error', {
          error: authError.message,
        })
      }
    } catch (err) {
      logger.error('Password reset error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Log out the current user
   */
  const logout = useCallback(async () => {
    setIsLoading(true)
    try {
      beginProfileRequest(null)
      trackEvent('user_logout')
      await supabase.auth.signOut()
      applySignedOutState()
      localStorage.removeItem('rememberMe')
    } catch (err) {
      logger.error('Logout error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [applySignedOutState, beginProfileRequest])

  useEffect(() => {
    logoutRef.current = logout
  }, [logout])

  /**
   * Computed property: Check if user is admin (OWNER or ADMIN role)
   */
  const isAdmin = useMemo(() => {
    return userRole === UserRole.OWNER || userRole === UserRole.ADMIN
  }, [userRole])

  /**
   * Computed property: Check if user is owner
   */
  const isOwner = useMemo(() => {
    return userRole === UserRole.OWNER
  }, [userRole])

  /**
   * Get the current session for API client
   */
  const getSession = useCallback(async (): Promise<AuthSession | null> => {
    if (!session) return null

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      ...(session.expires_at !== undefined && {
        expires_at: session.expires_at,
      }),
      user: session.user,
    }
  }, [session])

  /**
   * Manually refresh the session
   */
  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        logger.error('Session refresh failed', {
          error: error.message,
        })
        await logout()
      } else if (data.session) {
        setSession(data.session)
        setUser(data.session.user)
        setupTokenRefresh(data.session)
      }
    } catch (err) {
      logger.error('Session refresh error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      await logout()
    }
  }, [logout, setupTokenRefresh])

  /**
   * Handle OAuth callback
   * Sets session from OAuth tokens returned by provider
   */
  const handleOAuthCallback = useCallback(
    async ({
      accessToken,
      refreshToken,
    }: {
      accessToken: string
      refreshToken: string
    }): Promise<Session> => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) throw error
        if (!session) throw new Error('No session returned')

        setSession(session)
        setUser(session.user)
        setupTokenRefresh(session)

        trackEvent('login_completed', { method: 'google' })

        return session
      } catch (error) {
        logger.error('OAuth callback error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        throw error
      }
    },
    [setupTokenRefresh]
  )

  /**
   * Initiate Google OAuth login
   */
  const loginWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) throw error
  }, [])

  const value: AuthContextType = {
    user,
    session,
    userRole,
    isPlatformAdmin,
    isLoading,
    error,
    isAuthenticated: !!user,
    isAnonymous: !!user?.is_anonymous,
    isAdmin,
    isOwner,
    login,
    loginWithGoogle,
    handleOAuthCallback,
    register,
    resetPassword,
    logout,
    getSession,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access authentication context
 *
 * @throws Error if used outside of AuthProvider
 *
 * @example
 * ```tsx
 * const { user, login, logout, isLoading } = useAuth()
 * ```
 */

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
