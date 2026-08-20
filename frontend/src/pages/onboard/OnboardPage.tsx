/**
 * OnboardPage --- public route for the PLG onboarding wizard.
 *
 * Anonymous and unauthenticated visitors see the OnboardFlowWizard.
 *
 * Authenticated (non-anonymous) users are normally sent to checkout --- the
 * wizard is the signed-out acquisition path. The one exception is the sample:
 * dashboard "see a sample" actions deep-link here with `?demo=1` so a logged-in
 * user can view the pre-run sample result instead of being bounced to checkout.
 * In that case we keep them on the wizard in demo mode.
 */
import { Navigate, useSearchParams } from 'react-router-dom'
import { OnboardFlowWizard } from '@/features/plg/OnboardFlowWizard'
import { useAuth } from '@/hooks/useAuth'

export function OnboardPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const ssoMode = searchParams.get('source') === 'sso'
  // `?demo=1` lets an authenticated user reach the sample result from the
  // dashboard. Without it, a logged-in user hitting /onboard is an acquisition
  // mis-route and belongs at checkout.
  const demoMode = searchParams.get('demo') === '1'

  if (user && !user.is_anonymous && !ssoMode && !demoMode) {
    return <Navigate to="/checkout" replace />
  }

  return <OnboardFlowWizard ssoMode={ssoMode} />
}
