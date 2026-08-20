/**
 * Onboarding Wizard Component
 *
 * Main component that orchestrates the onboarding flow.
 * Flow: Welcome -> Add Property -> Add Leases -> Upload GL -> Upload Billing -> Reconciliation Result
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { useAuth } from '@/hooks/useAuth'
import { OnboardingProvider, useOnboarding } from './OnboardingContext'
import { OnboardingProgress } from './OnboardingProgress'
import {
  WelcomeStep,
  AddPropertyStep,
  AddLeasesStep,
  UploadFileStep,
} from './steps'
import { ActualBilledUploadStep } from './steps/ActualBilledUploadStep'
import { LeakageResultStep } from './steps/LeakageResultStep'

function OnboardingContent() {
  const navigate = useNavigate()
  const { state, skipOnboarding, prevStep } = useOnboarding()
  const { currentStep, completed, skipped } = state

  // Redirect if onboarding is completed or skipped
  useEffect(() => {
    if (completed || skipped) {
      navigate('/dashboard')
    }
  }, [completed, skipped, navigate])

  const handleSkipAll = () => {
    skipOnboarding()
  }

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <WelcomeStep />
      case 2:
        return <AddPropertyStep />
      case 3:
        return <AddLeasesStep />
      case 4:
        return <UploadFileStep />
      case 5:
        return <ActualBilledUploadStep />
      case 6:
        return <LeakageResultStep />
      default:
        return <WelcomeStep />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
      {/* Header */}
      <header className="border-b bg-background shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          {/* Logo */}
          <Logo size="sm" />

          {/* Skip button */}
          {currentStep < 6 && (
            <Button
              data-testid="skip-setup-button"
              variant="ghost"
              size="sm"
              onClick={handleSkipAll}
              className="text-muted-foreground"
            >
              Skip setup
              <X className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>

      {/* App.tsx renders the single <main id="main-content"> landmark; this is a layout div only. */}
      <div className="container mx-auto px-4 py-12">
        {/* Step 1 (WelcomeStep) renders its own visible <h1>. Later steps only
            have step-level <h2>s, so give the page a programmatic <h1> for
            screen-reader outline/landmark navigation. */}
        {currentStep > 1 && <h1 className="sr-only">CapVeri setup</h1>}

        {/* Progress indicator */}
        <OnboardingProgress />

        {/* Step content */}
        <div className="py-8">{renderStep()}</div>

        {/* Back button (not on first or last step) */}
        {currentStep > 1 && currentStep < 6 && (
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

export function OnboardingWizard() {
  const { user } = useAuth()

  return (
    <OnboardingProvider userId={user?.id ?? null}>
      <OnboardingContent />
    </OnboardingProvider>
  )
}
