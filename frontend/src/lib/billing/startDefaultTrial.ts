/**
 * Shared resilient helper for auto-starting the default full-feature trial.
 *
 * Used by every signup entry point (email registration, SSO callback, SSO
 * onboarding completion) so trial provisioning behaves identically everywhere.
 *
 * Behaviour:
 * - Awaits the request so callers can sequence navigation after it resolves.
 * - Returns `true` only when the trial was started (HTTP ok).
 * - On a non-ok response, surfaces the backend `detail` (e.g. the 409 "paused"
 *   message) via a toast, falling back to a friendly default message.
 * - On a thrown error, shows the fallback toast --- EXCEPT for auth errors
 *   (401), where `authenticatedFetch` has already triggered a redirect to the
 *   login page, so an additional toast would be noise.
 * - Never re-throws: a failed trial start must not block the user from reaching
 *   the dashboard. They can start the trial later from Billing settings.
 */
import { authenticatedFetch } from '@/api/authFetch'
import { isApiError } from '@/api/errors'
import { toast } from '@/components/ui/sonner'
import { logger } from '@/lib/logger'
import { captureHttpFailure, captureUnexpectedError } from '@/lib/sentry'

export const TRIAL_FALLBACK_MESSAGE =
  "Your account is ready, but we couldn't start your free trial automatically. You can start it anytime from Billing settings."

export async function startDefaultTrial(): Promise<boolean> {
  try {
    const res = await authenticatedFetch(
      '/api/v1/billing/trial/start-default',
      {
        method: 'POST',
      }
    )

    if (res.ok) {
      return true
    }

    let detail: string | undefined
    try {
      const body = (await res.clone().json()) as { detail?: unknown }
      if (res.status < 500 && typeof body?.detail === 'string') {
        detail = body.detail
      }
    } catch {
      // Non-JSON body --- fall back to the default message.
    }
    toast.error(detail ?? TRIAL_FALLBACK_MESSAGE)
    logger.warn('Default trial auto-start failed', { status: res.status })
    if (res.status >= 500) {
      captureHttpFailure({
        operation: 'start-default-trial',
        surface: 'billing',
        path: '/api/v1/billing/trial/start-default',
        statusCode: res.status,
      })
    }
    return false
  } catch (err) {
    // Auth errors already redirect to login via authenticatedFetch; suppress
    // the toast in that case to avoid a confusing flash before the redirect.
    if (!(isApiError(err) && err.isAuthError)) {
      toast.error(TRIAL_FALLBACK_MESSAGE)
    }
    logger.warn('Default trial auto-start threw', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    captureUnexpectedError(err, {
      operation: 'start-default-trial',
      surface: 'billing',
      path: '/api/v1/billing/trial/start-default',
    })
    return false
  }
}
