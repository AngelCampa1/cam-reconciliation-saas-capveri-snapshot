/**
 * OnboardFlowContext --- PLG onboarding state management.
 *
 * 7-step product-led growth flow. Storage key is user-scoped and distinct
 * from the regular `capveri_onboarding_` key to avoid collision.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import {
  type OnboardingData,
  OnboardingContext,
} from '../onboarding/OnboardingContext'

const STORAGE_KEY_PREFIX = 'capveri_plg_'
const TOTAL_STEPS = 7

function getStorageKey(userId: string | null): string {
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : 'capveri_plg_anon'
}

// Extend OnboardingData with PLG-specific fields
export interface PlgFlowData extends OnboardingData {
  email?: string
  firstName?: string
  organizationName?: string
  emailCaptured?: boolean
  accountUpgraded?: boolean
  anonUserId?: string
  organizationId?: string
  leakage?: number
  /**
   * False until the user chooses to use their own building from the
   * sample-first Welcome screen. While false (and not SSO/demo) the wizard
   * shows WelcomeSampleStep instead of the numbered step machine.
   */
  flowStarted?: boolean
}

export interface PlgFlowState {
  currentStep: number
  maxReachedStep: number
  totalSteps: number
  completed: boolean
  data: PlgFlowData
}

interface PlgFlowContextValue {
  userId: string | null
  state: PlgFlowState
  nextStep: () => void
  prevStep: () => void
  goToStep: (step: number) => void
  completeOnboarding: () => void
  setStepData: <K extends keyof PlgFlowData>(
    key: K,
    value: PlgFlowData[K]
  ) => void
  canGoNext: boolean
  canGoPrev: boolean
  isFirstStep: boolean
  isLastStep: boolean
}

const PlgFlowContext = createContext<PlgFlowContextValue | null>(null)

interface OnboardFlowProviderProps {
  children: ReactNode
  userId: string | null
  totalSteps?: number
}

export function OnboardFlowProvider({
  children,
  userId,
  totalSteps: totalStepsProp = TOTAL_STEPS,
}: OnboardFlowProviderProps) {
  const storageKey = getStorageKey(userId)

  const [state, setState] = useState<PlgFlowState>(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<PlgFlowState>
        return {
          currentStep: parsed.currentStep ?? 1,
          maxReachedStep: parsed.maxReachedStep ?? parsed.currentStep ?? 1,
          totalSteps: totalStepsProp,
          completed: parsed.completed ?? false,
          data: { ...(parsed.data ?? {}) },
        }
      } catch {
        // Invalid stored state --- reset
      }
    }
    return {
      currentStep: 1,
      maxReachedStep: 1,
      totalSteps: totalStepsProp,
      completed: false,
      data: {},
    }
  })

  // Persist state whenever it changes
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, [state, storageKey])

  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, totalStepsProp),
      maxReachedStep: Math.min(
        Math.max(prev.maxReachedStep, prev.currentStep + 1),
        totalStepsProp
      ),
    }))
  }, [totalStepsProp])

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 1),
    }))
  }, [])

  const goToStep = useCallback(
    (step: number) => {
      setState((prev) => ({
        ...prev,
        currentStep: Math.max(
          1,
          Math.min(step, prev.maxReachedStep, totalStepsProp)
        ),
      }))
    },
    [totalStepsProp]
  )

  const completeOnboarding = useCallback(() => {
    setState((prev) => ({ ...prev, completed: true }))
  }, [])

  const setStepData = useCallback(
    <K extends keyof PlgFlowData>(key: K, value: PlgFlowData[K]) => {
      setState((prev) => ({
        ...prev,
        data: { ...prev.data, [key]: value },
      }))
    },
    []
  )

  const value: PlgFlowContextValue = {
    userId,
    state,
    nextStep,
    prevStep,
    goToStep,
    completeOnboarding,
    setStepData,
    canGoNext: state.currentStep < totalStepsProp,
    canGoPrev: state.currentStep > 1,
    isFirstStep: state.currentStep === 1,
    isLastStep: state.currentStep === totalStepsProp,
  }

  // Also provide the old OnboardingContext so that step components imported from
  // features/onboarding/steps/ (which call useOnboarding from OnboardingContext)
  // receive PLG state instead of throwing "must be used within OnboardingProvider".
  const legacyContextValue = {
    state: {
      currentStep: state.currentStep,
      maxReachedStep: state.maxReachedStep,
      totalSteps: state.totalSteps,
      completed: state.completed,
      skipped: false,
      data: state.data,
    },
    nextStep,
    prevStep,
    goToStep,
    completeOnboarding,
    skipOnboarding: () => {},
    setStepData: setStepData as <K extends keyof OnboardingData>(
      key: K,
      value: OnboardingData[K]
    ) => void,
    canGoNext: state.currentStep < totalStepsProp,
    canGoPrev: state.currentStep > 1,
    isFirstStep: state.currentStep === 1,
    isLastStep: state.currentStep === totalStepsProp,
  }

  return (
    <PlgFlowContext.Provider value={value}>
      <OnboardingContext.Provider value={legacyContextValue}>
        {children}
      </OnboardingContext.Provider>
    </PlgFlowContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(PlgFlowContext)
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardFlowProvider')
  }
  return context
}
