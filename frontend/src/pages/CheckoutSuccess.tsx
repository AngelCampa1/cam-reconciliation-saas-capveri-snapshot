/**
 * Checkout Success Page - Confirms subscription activation after free trial start
 */
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { billingActivationKeys } from '@/hooks/use-billing-activation'
import { resolveApiUrl } from '@/api/url'
import { TRIAL_COPY } from '@/lib/domains'
import { ApiError } from '@/api/errors'
import { captureUnexpectedError } from '@/lib/sentry'

const TRACKED_CHECKOUT_SESSION_KEY = 'capveri_tracked_checkout_sessions'
const MISSING_SESSION_ERROR = 'missing-session'

function hasTrackedCheckoutSession(sessionId: string): boolean {
  try {
    const trackedSessionIds = JSON.parse(
      window.localStorage.getItem(TRACKED_CHECKOUT_SESSION_KEY) ?? '[]'
    ) as string[]
    return trackedSessionIds.includes(sessionId)
  } catch {
    return false
  }
}

function markCheckoutSessionTracked(sessionId: string): void {
  try {
    const trackedSessionIds = JSON.parse(
      window.localStorage.getItem(TRACKED_CHECKOUT_SESSION_KEY) ?? '[]'
    ) as string[]
    window.localStorage.setItem(
      TRACKED_CHECKOUT_SESSION_KEY,
      JSON.stringify([...new Set([...trackedSessionIds, sessionId])].slice(-25))
    )
  } catch {
    // If local storage is unavailable, still avoid blocking activation.
  }
}

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const sessionId = searchParams.get('session_id')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Verify session
    const verifySession = async () => {
      if (!sessionId) {
        setError(MISSING_SESSION_ERROR)
        setLoading(false)
        return
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          setError('Authentication required')
          setLoading(false)
          return
        }

        const res = await fetch(
          resolveApiUrl(
            `/api/v1/billing/checkout/success?session_id=${sessionId}`
          ),
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        )
        if (!res.ok) {
          const verificationError = new ApiError(
            'Session verification failed',
            res.status
          )
          if (res.status >= 500) {
            captureUnexpectedError(verificationError, {
              operation: 'checkout_success.verify_session',
              surface: 'checkout',
              path: '/api/v1/billing/checkout/success',
            })
          }
          throw verificationError
        }
        await res.json()

        queryClient.removeQueries({
          queryKey: billingActivationKeys.byUser(session.user.id),
        })

        if (!hasTrackedCheckoutSession(sessionId)) {
          trackEvent('purchase', {
            transaction_id: sessionId,
          })
          trackEvent('checkout_completed', {
            transaction_id: sessionId,
          })
          trackEvent('subscription_started', {
            transaction_id: sessionId,
          })
          markCheckoutSessionTracked(sessionId)
        }

        setLoading(false)
      } catch (err) {
        if (!(err instanceof ApiError)) {
          captureUnexpectedError(err, {
            operation: 'checkout_success.verify_session',
            surface: 'checkout',
            path: '/api/v1/billing/checkout/success',
          })
        }
        setError((err as Error).message)
        setLoading(false)
      }
    }

    void verifySession()
  }, [queryClient, sessionId])

  if (loading) {
    return (
      // App.tsx renders the single <main id="main-content"> landmark; this is a layout div only.
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="container max-w-lg text-center">
          <h1 className="sr-only">Checkout Success</h1>
          <Spinner size="lg" className="mx-auto" />
          <p className="mt-4 text-muted-foreground">Setting up your trial...</p>
        </div>
      </div>
    )
  }

  if (error) {
    const isMissingSession = error === MISSING_SESSION_ERROR

    return (
      <>
        <LandingNav />
        {/* App.tsx renders the single <main id="main-content"> landmark; this is a layout div only. */}
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="container max-w-lg">
            <Card>
              <CardHeader>
                <h1 className="sr-only">
                  {isMissingSession
                    ? 'Checkout Session Missing'
                    : 'Checkout Error'}
                </h1>
                <CardTitle
                  className={isMissingSession ? undefined : 'text-destructive'}
                >
                  {isMissingSession
                    ? 'Checkout session not found'
                    : 'Something went wrong'}
                </CardTitle>
                <CardDescription>
                  {isMissingSession
                    ? 'Choose a plan or return to billing to continue.'
                    : error}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row">
                {isMissingSession ? (
                  <Button asChild variant="outline">
                    <Link to="/pricing">View Pricing</Link>
                  </Button>
                ) : null}
                <Button asChild>
                  <Link to="/settings/billing">Go to Billing</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  return (
    // App.tsx renders the single <main id="main-content"> landmark; this is a layout div only.
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="container max-w-lg">
        <Card>
          <CardHeader className="text-center">
            <h1 className="sr-only">Checkout Success</h1>
            <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
            <CardTitle>You're all set.</CardTitle>
            <CardDescription>
              Your {TRIAL_COPY} has started. No credit card was required today.
              Add billing before the trial ends to keep access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" asChild>
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/settings/billing">View Billing Details</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
