/**
 * ReconciliationWorkflowStepper Component
 *
 * Displays the reconciliation workflow steps with progress indication.
 * Features:
 * - 4 steps: Upload GL → Calculate → Review → Finalize
 * - Horizontal layout on desktop, stacked on mobile
 * - Checkmarks for completed steps
 * - Current step highlighting
 * - Clickable navigation for accessible steps
 */
import { useNavigate } from 'react-router-dom'
import { Check, Upload, Calculator, FileSearch, FileCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkflowStep = 'upload' | 'calculate' | 'review' | 'finalize'

interface StepConfig {
  id: WorkflowStep
  label: string
  icon: React.ComponentType<{ className?: string }>
  getPath: (propertyId: string) => string
}

const WORKFLOW_STEPS: StepConfig[] = [
  {
    id: 'upload',
    label: 'Upload GL',
    icon: Upload,
    getPath: () => '/ingestion',
  },
  {
    id: 'calculate',
    label: 'Reconcile',
    icon: Calculator,
    getPath: (propertyId) => `/properties/${propertyId}/reconciliations`,
  },
  {
    id: 'review',
    label: 'Review',
    icon: FileSearch,
    getPath: (propertyId) => `/properties/${propertyId}/reconciliations`,
  },
  {
    id: 'finalize',
    label: 'Finalize',
    icon: FileCheck,
    getPath: (propertyId) => `/properties/${propertyId}/reconciliations`,
  },
]

export interface ReconciliationWorkflowStepperProps {
  /** Property ID for navigation */
  propertyId: string
  /** Current active step */
  currentStep: WorkflowStep
  /** List of completed step IDs */
  completedSteps?: WorkflowStep[]
  /** Additional CSS classes */
  className?: string
}

export function ReconciliationWorkflowStepper({
  propertyId,
  currentStep,
  completedSteps = [],
  className,
}: ReconciliationWorkflowStepperProps) {
  const navigate = useNavigate()

  const currentStepIndex = WORKFLOW_STEPS.findIndex((s) => s.id === currentStep)

  const isStepAccessible = (stepIndex: number) => {
    // Current step and previous steps are accessible
    if (stepIndex <= currentStepIndex) return true
    // The next step is accessible if current step is completed
    if (
      stepIndex === currentStepIndex + 1 &&
      completedSteps.includes(currentStep)
    ) {
      return true
    }
    // Steps that are completed are accessible
    const step = WORKFLOW_STEPS[stepIndex]
    if (!step) return false
    return completedSteps.includes(step.id)
  }

  const isStepCompleted = (stepId: WorkflowStep) => {
    return completedSteps.includes(stepId)
  }

  const handleStepClick = (step: StepConfig, stepIndex: number) => {
    if (!isStepAccessible(stepIndex)) return
    navigate(step.getPath(propertyId))
  }

  return (
    <nav
      aria-label="Reconciliation workflow"
      className={cn('w-full', className)}
      data-testid="workflow-stepper"
    >
      {/* items-start (not items-center) keeps every step's indicator circle and
          the connector line top-aligned even when a label wraps to two lines on
          narrow viewports. */}
      <ol className="relative isolate flex items-start justify-between gap-2 md:gap-4">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon
          const isCurrent = step.id === currentStep
          const isCompleted = isStepCompleted(step.id)
          const isAccessible = isStepAccessible(index)
          const stepNumber = index + 1

          return (
            <li key={step.id} className="relative flex-1">
              <button
                onClick={() => handleStepClick(step, index)}
                disabled={!isAccessible}
                className={cn(
                  'flex w-full min-h-[44px] flex-col items-center gap-1 rounded-full p-2 transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isCurrent && 'bg-primary/10',
                  isAccessible &&
                    !isCurrent &&
                    'hover:bg-muted/50 cursor-pointer',
                  !isAccessible && 'opacity-50 cursor-not-allowed'
                )}
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={!isAccessible}
                data-testid={`step-${step.id}`}
                data-completed={isCompleted}
              >
                {/* Step indicator circle */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-200',
                    isCompleted &&
                      'bg-success border-success text-success-foreground',
                    isCurrent &&
                      !isCompleted &&
                      'border-primary bg-primary text-primary-foreground',
                    !isCurrent &&
                      !isCompleted &&
                      'border-muted-foreground/30 bg-background'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span className="text-sm font-semibold">{stepNumber}</span>
                  )}
                </div>

                {/* Step label */}
                <span
                  className={cn(
                    'text-xs font-medium text-center',
                    isCurrent && 'text-primary',
                    // F-287: 12px label needs WCAG AA (4.5:1); the bright
                    // --success (~3.33:1 on white) fails, so completed labels
                    // use the dark on-light --success-strong. The decorative
                    // aria-hidden icon below stays brand green (non-text 3:1).
                    isCompleted && !isCurrent && 'text-success-strong',
                    !isCurrent && !isCompleted && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>

                {/* Desktop icon - hidden on mobile */}
                <Icon
                  className={cn(
                    'hidden md:block h-4 w-4',
                    isCurrent && 'text-primary',
                    isCompleted && !isCurrent && 'text-success',
                    !isCurrent && !isCompleted && 'text-muted-foreground'
                  )}
                  aria-hidden="true"
                />
              </button>

              {/* Connector line - not after last item */}
              {index < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={cn(
                    'pointer-events-none absolute left-1/2 right-[-50%] top-6 -z-10 hidden h-0.5 md:block',
                    isCompleted || index < currentStepIndex
                      ? 'bg-success'
                      : 'bg-muted-foreground/20'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
