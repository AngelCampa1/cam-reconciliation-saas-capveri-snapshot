/**
 * Onboarding Progress Component
 *
 * Displays a step indicator for the onboarding wizard.
 */
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboarding } from './OnboardingContext'

const stepLabels = [
  'Building',
  'Tenants',
  'Costs',
  'Charges',
  'Results',
  'Email',
  'Password',
]

interface OnboardingProgressProps {
  labels?: string[]
}

export function OnboardingProgress({ labels }: OnboardingProgressProps = {}) {
  const { state, goToStep } = useOnboarding()
  const activeLabels = labels ?? stepLabels
  // Use the label count as the authoritative total so callers can pass a
  // sliced label array (e.g. 5 labels for SSO mode) without needing to also
  // pass a separate totalSteps override.
  const displayTotalSteps = activeLabels.length
  const { currentStep, maxReachedStep } = state

  return (
    <div
      className="mb-8"
      role="group"
      aria-label={`Onboarding progress: step ${currentStep} of ${displayTotalSteps}`}
    >
      {/* Step indicators */}
      <div className="flex items-center justify-center">
        {Array.from({ length: displayTotalSteps }, (_, i) => {
          const stepNumber = i + 1
          const isCompleted = stepNumber < currentStep
          const isCurrent = stepNumber === currentStep
          const canJumpToStep = isCompleted && stepNumber <= maxReachedStep

          return (
            <div key={stepNumber} className="flex items-center">
              {/* Step circle */}
              {canJumpToStep ? (
                <button
                  type="button"
                  aria-label={`Go to step ${stepNumber}`}
                  onClick={() => goToStep(stepNumber)}
                  className={cn(
                    // 32px visual circle on mobile, but a 40x40 invisible tap
                    // target (before: overlay) keeps it touch-accessible with no
                    // layout shift.
                    'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all duration-fast motion-reduce:transition-none before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""] sm:h-10 sm:w-10 sm:before:hidden',
                    isCompleted
                      ? 'bg-primary text-primary-foreground cursor-pointer'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              ) : (
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all duration-fast motion-reduce:transition-none sm:h-10 sm:w-10',
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    stepNumber
                  )}
                </div>
              )}

              {/* Connector line */}
              {stepNumber < displayTotalSteps && (
                <div
                  className={cn(
                    'h-0.5 w-4 shrink-0 transition-colors duration-200 motion-reduce:transition-none sm:w-12 md:w-16 lg:w-20',
                    stepNumber < currentStep ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step label. Calm single label that leads with the friendly step name.
          The "of N" wall-ahead count is intentionally not shown here; the
          accessible group label above carries it for screen readers. */}
      <div className="mt-4 text-center">
        <span className="text-sm font-medium text-muted-foreground">
          Step {currentStep}
        </span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-sm font-medium">
          {activeLabels[currentStep - 1]}
        </span>
      </div>
    </div>
  )
}
