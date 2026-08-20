/**
 * OAuth Callback Page
 *
 * Handles the OAuth callback after user authenticates with Google.
 * Processes the OAuth response, creates/links user accounts, and redirects appropriately.
 */
import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { trackEvent } from '@/lib/analytics'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthCard } from '@/components/auth/AuthCard'
import { useAuth } from '@/hooks/useAuth'
import { authenticatedFetch } from '@/api/authFetch'
import { startDefaultTrial } from '@/lib/billing/startDefaultTrial'
import { currentTermsAcceptance } from '@/lib/legalTerms'

interface ProcessInvitationResponse {
  success: boolean
  message?: string
}

export function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshSession } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(true)
  const hasProcessed = useRef(false) // Prevent double processing in strict mode

  useEffect(() => {
    // Guard against duplicate execution in React strict mode
    if (hasProcessed.current) return
    hasProcessed.current = true

    const handleCallback = async () => {
      try {
        setIsProcessing(true)

        // Check for OAuth error in URL first
        const errorDescription = searchParams.get('error_description')
        const errorCode = searchParams.get('error')

        if (errorCode || errorDescription) {
          throw new Error(
            errorDescription || getErrorMessage(errorCode || 'unknown_error')
          )
        }

        // Supabase handles the OAuth exchange automatically
        // We just need to check if the session was established
        const {
          data: { session },
          error: authError,
        } = await supabase.auth.getSession()

        if (authError) {
          throw authError
        }

        if (!session) {
          throw new Error(
            'No session established. Please try signing in again.'
          )
        }

        // Refresh the auth context with the new session
        await refreshSession()

        // Check for invitation token
        const inviteToken = searchParams.get('invite')
        if (inviteToken) {
          await processInvitation(session.user.id, inviteToken)
        }

        await authenticatedFetch('/api/v1/auth/legal-acceptance/current', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(currentTermsAcceptance),
        })

        // Detect first-time SSO users (account created within the last 120s).
        // 120 s is generous enough to survive slow OAuth exchanges and
        // intermittently slow DB writes, but short enough that a returning
        // user who happened to re-auth within two minutes is unlikely.
        const NEW_USER_WINDOW_MS = 120_000
        const createdAt = new Date(session.user.created_at).getTime()
        const isNewSSOUser =
          !inviteToken && Date.now() - createdAt < NEW_USER_WINDOW_MS

        if (isNewSSOUser) {
          const provider =
            (session.user.app_metadata?.provider as string | undefined) ?? 'sso'
          trackEvent('sign_up', { method: provider })

          // Auto-start full-feature trial. Awaited so failures surface a toast;
          // never blocks the user from reaching the dashboard.
          await startDefaultTrial()
          sessionStorage.removeItem('returnUrl')
          navigate('/onboard?demo=1&source=first-login', { replace: true })
          return
        }

        // Get return URL: prefer URL param (survives cross-origin redirects),
        // fall back to session storage, then default to the root route. Root
        // is role-gated and routes party-correct, so it is the safe default
        // for both landlords and tenants (a hardcoded /dashboard would 403 a
        // tenant). A specific deep-link returnUrl is still honored.
        const rawReturnUrl =
          searchParams.get('returnUrl') ||
          sessionStorage.getItem('returnUrl') ||
          '/'
        sessionStorage.removeItem('returnUrl')
        // Only allow relative paths to prevent open redirect
        const returnUrl = rawReturnUrl.startsWith('/') ? rawReturnUrl : '/'

        // Small delay to ensure session is fully established
        await new Promise((resolve) => setTimeout(resolve, 100))

        navigate(returnUrl, { replace: true })
      } catch (err) {
        logger.error('Auth callback error', {
          error: err instanceof Error ? err.message : 'Authentication failed',
        })
        setError(err instanceof Error ? err.message : 'Authentication failed')
        setIsProcessing(false)
      }
    }

    handleCallback()
  }, [navigate, searchParams, refreshSession])

  if (error) {
    return (
      <AuthLayout>
        <AuthCard>
          <div className="text-center">
            <div className="space-y-2" role="alert">
              <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-destructive">
                Authentication Error
              </h1>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>

            <div className="mt-8 flex flex-col gap-2">
              <Button
                onClick={() => navigate('/auth/login')}
                className="w-full"
              >
                Return to login
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="w-full"
              >
                Try again
              </Button>
            </div>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  const statusLabel = isProcessing ? 'Completing sign in' : 'Redirecting'

  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="sr-only">Authentication Callback</h1>
        <Spinner className="mx-auto h-12 w-12" label={statusLabel} />
        {/* Spinner's role="status" announces statusLabel; hide the visual echo
            from screen readers to avoid a duplicate announcement. */}
        <p className="mt-4 text-sm text-muted-foreground" aria-hidden="true">
          {isProcessing ? 'Completing sign in...' : 'Redirecting...'}
        </p>
      </div>
    </AuthLayout>
  )
}

/**
 * Process organization invitation during OAuth signup.
 * Non-blocking - logs warning if fails but doesn't prevent login.
 */
async function processInvitation(userId: string, token: string): Promise<void> {
  try {
    const response = await authenticatedFetch(
      '/api/v1/team/invitations/accept',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user_id: userId }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.warn('Failed to process invitation', { error: errorText })
      // Don't throw - user can still access the app, just without org link
      return
    }

    const data: ProcessInvitationResponse = await response.json()
    if (data.success) {
      logger.info('Invitation processed successfully', {
        message: data.message,
      })
    }
  } catch (err) {
    logger.warn('Error processing invitation', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    // Don't throw - user can still access the app
  }
}

/**
 * Map OAuth error codes to user-friendly messages.
 */
function getErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    access_denied: 'You cancelled the sign in. Please try again.',
    server_error: 'Something went wrong on our end. Please try again.',
    temporarily_unavailable:
      'The service is temporarily unavailable. Please try again later.',
    invalid_request: 'Invalid authentication request. Please try again.',
    unauthorized_client:
      'This application is not authorized. Please contact support.',
    unsupported_response_type: 'Authentication method not supported.',
    invalid_scope: 'Invalid permissions requested. Please contact support.',
    unknown_error: 'An unexpected error occurred. Please try again.',
  }

  return (
    errorMessages[errorCode] ||
    'Authentication failed. Please try signing in again.'
  )
}
