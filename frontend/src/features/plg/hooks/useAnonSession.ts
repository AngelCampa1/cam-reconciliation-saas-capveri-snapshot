/**
 * useAnonSession
 *
 * Bootstraps an anonymous Supabase session for the PLG onboarding flow.
 * - If a real (non-anonymous) session exists -�� signal redirect to dashboard.
 * - If an anonymous session exists -�� call /api/v1/onboard/init (idempotent).
 * - If no session -�� signInAnonymously() then call /api/v1/onboard/init.
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'
import { groupOrganizationForAnalytics } from '@/lib/analytics'

interface AnonSessionState {
  userId: string | null
  organizationId: string | null
  isReady: boolean
  error: string | null
  shouldRedirectToDashboard: boolean
}

export function useAnonSession(
  ssoMode = false,
  samplePreview = false
): AnonSessionState {
  const [state, setState] = useState<AnonSessionState>({
    userId: null,
    organizationId: null,
    isReady: false,
    error: null,
    shouldRedirectToDashboard: false,
  })

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        // 1. Check for existing session
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData?.session

        if (session) {
          const user = session.user

          // Non-anonymous real account
          if (!user.is_anonymous) {
            if (ssoMode) {
              // SSO onboarding: skip anon bootstrap, use real JWT for init
              const orgId = await callOnboardInit(session.access_token)
              if (!cancelled) {
                setState({
                  userId: user.id,
                  organizationId: orgId,
                  isReady: true,
                  error: null,
                  shouldRedirectToDashboard: false,
                })
              }
            } else if (samplePreview) {
              // Logged-in user viewing the read-only sample from the dashboard.
              // No onboarding init needed; just render the sample front door.
              // Storage stays scoped to their real user id.
              if (!cancelled) {
                setState({
                  userId: user.id,
                  organizationId: null,
                  isReady: true,
                  error: null,
                  shouldRedirectToDashboard: false,
                })
              }
            } else if (!cancelled) {
              setState((prev) => ({
                ...prev,
                shouldRedirectToDashboard: true,
              }))
            }
            return
          }

          // Existing anon session -�� call init
          const orgId = await callOnboardInit(session.access_token)
          if (!cancelled) {
            setState({
              userId: user.id,
              organizationId: orgId,
              isReady: true,
              error: null,
              shouldRedirectToDashboard: false,
            })
          }
          return
        }

        // 2. No session --- create anonymous session
        const { data: anonData, error: anonError } =
          await supabase.auth.signInAnonymously()
        if (anonError || !anonData?.session) {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error: anonError?.message ?? 'Failed to create anonymous session',
            }))
          }
          return
        }

        const orgId = await callOnboardInit(anonData.session.access_token)
        if (!cancelled) {
          setState({
            userId: anonData.session.user.id,
            organizationId: orgId,
            isReady: true,
            error: null,
            shouldRedirectToDashboard: false,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err.message : 'Unknown error',
          }))
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [ssoMode, samplePreview])

  return state
}

async function callOnboardInit(accessToken: string): Promise<string> {
  const response = await fetch(resolveApiUrl('/api/v1/onboard/init'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`/onboard/init failed: ${response.status}`)
  }
  const data = (await response.json()) as { organization_id: string }
  groupOrganizationForAnalytics(data.organization_id, {
    signup_flow: 'plg_onboarding',
    is_anonymous_onboard: true,
    created_from: 'onboard_init',
  })
  return data.organization_id
}
