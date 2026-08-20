/**
 * OnboardFlowWizard: PLG onboarding wizard.
 *
 * 7-step product-led growth flow (anonymous session) or 5-step SSO flow
 * (authenticated session, skips Email and Set Password steps).
 * No "Skip setup" escape hatch. Steps:
 *   1 Building  2 Tenants  3 Costs  4 Charges  5 Results  [6 Email  7 Password (PLG only)]
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { startDefaultTrial } from '@/lib/billing/startDefaultTrial'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { OnboardFlowProvider, useOnboarding } from './OnboardFlowContext'
import { OnboardingProgress } from '../onboarding/OnboardingProgress'
import { AddPropertyStep } from '../onboarding/steps/AddPropertyStep'
import { AddLeasesStep } from '../onboarding/steps/AddLeasesStep'
import { UploadFileStep } from '../onboarding/steps'
import { ActualBilledUploadStep } from '../onboarding/steps/ActualBilledUploadStep'
import { useAnonSession } from './hooks/useAnonSession'
import { WelcomeSampleStep } from './steps/WelcomeSampleStep'
import { ResultsStep } from './steps/ResultsStep'
import { EmailCaptureStep } from './steps/EmailCaptureStep'
import { SetPasswordStep } from './steps/SetPasswordStep'
import { trackEvent } from '@/lib/analytics'

const STEP_LABELS = [
  'Building',
  'Tenants',
  'Costs',
  'Charges',
  'Results',
  'Email',
  'Password',
]

// Hide Back on step 1 always. Steps 6 and 7 exist only in the full PLG flow;
// SSO mode ends at step 5, so Back is intentionally visible there (Results screen).
const HIDE_BACK_STEPS = new Set([1, 6, 7])

function OnboardFlowContent({
  ssoMode = false,
  samplePreview = false,
}: {
  ssoMode?: boolean
  samplePreview?: boolean
}) {
  const navigate = useNavigate()
  const { state, prevStep, completeOnboarding, setStepData } = useOnboarding()
  const { currentStep, completed } = state
  const flowStarted = Boolean(state.data.flowStarted)
  // Sample-first front door: a brand-new anonymous user (not SSO, not demo,
  // sitting on step 1, who has not chosen to use their own building yet) sees
  // the Welcome sample result instead of the form chrome. This keeps the 1-7
  // step machine and its backend coupling fully intact behind the scenes.
  // `samplePreview` (the dashboard "see a sample" entry, ?demo=1) forces the
  // same front door for a logged-in user regardless of which step they last
  // left off on; once they choose to start, `flowStarted` flips and they drop
  // into the real machine.
  const showWelcomeSample =
    !ssoMode && !flowStarted && (currentStep === 1 || samplePreview)
  // One-shot guard: completion + navigation (and the SSO trial-start) must run
  // exactly once even if the effect re-fires on re-render or in StrictMode.
  const completionHandledRef = useRef(false)
  const lastTrackedStepRef = useRef<number | null>(null)
  const stepEnteredAtRef = useRef<number>(0)
  // Sample-preview entries clear stale `flowStarted` exactly once on mount
  // so a returning user always lands on the sample, while a later in-session
  // click of "Check my own building" still advances them into the real flow.
  const samplePreviewInitRef = useRef(false)
  useEffect(() => {
    if (samplePreview && !samplePreviewInitRef.current) {
      samplePreviewInitRef.current = true
      if (flowStarted) setStepData('flowStarted', false)
    }
  }, [samplePreview, flowStarted, setStepData])

  const effectiveLabels = ssoMode ? STEP_LABELS.slice(0, 5) : STEP_LABELS

  useEffect(() => {
    if (showWelcomeSample || completed) {
      return
    }

    const now = Date.now()
    const labels = ssoMode ? STEP_LABELS.slice(0, 5) : STEP_LABELS
    if (currentStep < 1 || currentStep > labels.length) {
      return
    }

    const previousStep = lastTrackedStepRef.current
    if (previousStep === currentStep) {
      return
    }

    const currentLabel = labels[currentStep - 1] ?? 'Unknown'
    const previousLabel =
      previousStep === null ? null : (labels[previousStep - 1] ?? 'Unknown')

    trackEvent('onboard_step_transitioned', {
      flow_id: 'plg_onboarding',
      flow_mode: ssoMode ? 'sso' : 'plg',
      sample_preview: samplePreview,
      step: currentStep,
      step_label: currentLabel,
      total_steps: labels.length,
      previous_step: previousStep,
      previous_step_label: previousLabel,
      direction:
        previousStep === null
          ? 'entered'
          : currentStep > previousStep
            ? 'forward'
            : 'back',
      elapsed_ms: previousStep === null ? 0 : now - stepEnteredAtRef.current,
    })

    lastTrackedStepRef.current = currentStep
    stepEnteredAtRef.current = now
  }, [completed, currentStep, samplePreview, showWelcomeSample, ssoMode])

  // In SSO mode the flow ends at step 5. If ResultsStep calls nextStep() and
  // advances to 6, auto-complete to trigger the dashboard redirect.
  useEffect(() => {
    if (ssoMode && currentStep > 5 && !completed) {
      completeOnboarding()
    }
  }, [ssoMode, currentStep, completed, completeOnboarding])

  useEffect(() => {
    if (!completed || completionHandledRef.current) return
    completionHandledRef.current = true
    if (ssoMode) {
      // SSO users finish onboarding here (no plan-selection step), so this is
      // the entry point that must provision their full-feature trial. PLG users
      // pass through the pricing flow instead, so they are not trial-started here.
      void startDefaultTrial().finally(() => navigate('/dashboard'))
    } else {
      navigate('/settings/billing?intent=select-plan')
    }
  }, [completed, ssoMode, navigate])

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <AddPropertyStep />
      case 2:
        return <AddLeasesStep />
      case 3:
        return <UploadFileStep />
      case 4:
        return <ActualBilledUploadStep />
      case 5:
        return <ResultsStep />
      case 6:
        return <EmailCaptureStep />
      case 7:
        return <SetPasswordStep />
      default:
        return <AddPropertyStep />
    }
  }

  // Sample-first front door. Rendered instead of the step machine + progress
  // chrome so the very first thing a new user sees is the money we found.
  if (showWelcomeSample) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
        <header className="border-b bg-background shadow-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <Logo size="sm" />
          </div>
        </header>
        <div className="container mx-auto px-4 py-12">
          <WelcomeSampleStep />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
      {/* Header */}
      <header className="border-b bg-background shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Logo size="sm" />
          {/* No skip button. PLG flow has no escape hatch. */}
        </div>
      </header>

      {/* Screen-reader-only progress announcement. The visible step label lives
          in OnboardingProgress so the "of N" count is shown calmly in one place. */}
      <div role="status" aria-live="polite" className="sr-only">
        Step {currentStep}: {effectiveLabels[currentStep - 1]}
      </div>

      {/* App.tsx renders the single <main id="main-content"> landmark; this is a layout div only. */}
      <div className="container mx-auto px-4 py-8">
        <OnboardingProgress labels={effectiveLabels} />
        <div className="py-8">{renderStep()}</div>

        {!HIDE_BACK_STEPS.has(currentStep) && (
          <div className="mt-8 text-center">
            <Button variant="ghost" onClick={prevStep}>
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Outer shell: bootstraps anon session then renders flow.
 * In ssoMode, uses the authenticated user's session instead of an anon session.
 */
export function OnboardFlowWizard({ ssoMode = false }: { ssoMode?: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Dashboard "see a sample" entry: a logged-in user reaches the read-only
  // sample front door instead of being bounced to checkout.
  const samplePreview = searchParams.get('demo') === '1'
  const { userId, isReady, shouldRedirectToDashboard, error } = useAnonSession(
    ssoMode,
    samplePreview
  )

  useEffect(() => {
    if (shouldRedirectToDashboard) {
      navigate('/dashboard', { replace: true })
    }
  }, [shouldRedirectToDashboard, navigate])

  if (shouldRedirectToDashboard) return null

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo className="h-8 w-auto opacity-60" />
          <p className="text-muted-foreground text-sm">
            We could not start your session. Try again.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo className="h-8 w-auto" />
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Preparing your workspace…
          </p>
        </div>
      </div>
    )
  }

  return (
    <OnboardFlowProvider userId={userId}>
      <OnboardFlowContent ssoMode={ssoMode} samplePreview={samplePreview} />
    </OnboardFlowProvider>
  )
}
