/**
 * Onboarding Context
 *
 * Manages onboarding state and provides methods for navigation.
 * State is scoped per user to prevent cross-user state leakage.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'

const STORAGE_KEY_PREFIX = 'capveri_onboarding_'
const LEGACY_STORAGE_KEY = 'capveri_onboarding' // Old unscoped key

function getStorageKey(userId: string | null): string {
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : LEGACY_STORAGE_KEY
}

export interface OnboardingData {
  propertyId?: string
  propertyName?: string
  hasLeases?: boolean
  importBatchId?: string
  reconciliationJobId?: string
  // Billing data for leakage calculation
  billingDataUploaded?: boolean
  totalBilled?: number
  // GL data year (detected from uploaded GL entries)
  glDataYear?: number
  // Leakage results
  leakageCalculated?: boolean
  capveriCalculated?: number
  actualBilled?: number
  leakage?: number
  leakagePct?: number
}

export interface OnboardingState {
  currentStep: number
  maxReachedStep: number
  totalSteps: number
  completed: boolean
  skipped: boolean
  data: OnboardingData
}

interface OnboardingContextValue {
  state: OnboardingState
  nextStep: () => void
  prevStep: () => void
  goToStep: (step: number) => void
  skipOnboarding: () => void
  completeOnboarding: () => void
  setStepData: <K extends keyof OnboardingData>(
    key: K,
    value: OnboardingData[K]
  ) => void
  canGoNext: boolean
  canGoPrev: boolean
  isFirstStep: boolean
  isLastStep: boolean
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(
  null
)

const TOTAL_STEPS = 6

interface OnboardingProviderProps {
  children: ReactNode
  userId: string | null
}

export function OnboardingProvider({
  children,
  userId,
}: OnboardingProviderProps) {
  const storageKey = getStorageKey(userId)

  const [state, setState] = useState<OnboardingState>(() => {
    // Clear legacy unscoped storage if we have a user-scoped key
    if (userId && localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }

    // Try to restore state from localStorage (user-scoped)
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        return {
          currentStep: parsed.currentStep || 1,
          maxReachedStep: parsed.maxReachedStep || parsed.currentStep || 1,
          totalSteps: TOTAL_STEPS,
          completed: parsed.completed || false,
          skipped: parsed.skipped || false,
          data: parsed.data || {},
        }
      } catch {
        // Invalid stored state
      }
    }
    return {
      currentStep: 1,
      maxReachedStep: 1,
      totalSteps: TOTAL_STEPS,
      completed: false,
      skipped: false,
      data: {},
    }
  })

  // Track userId to detect changes and reset state
  const [prevUserId, setPrevUserId] = useState<string | null>(userId)

  // Reset state when user changes (synchronously during render, not in effect)
  if (userId !== prevUserId) {
    setPrevUserId(userId)

    // Clear legacy storage on user change
    if (userId) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }

    // Load state for new user
    const newStorageKey = getStorageKey(userId)
    const stored = localStorage.getItem(newStorageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setState({
          currentStep: parsed.currentStep || 1,
          maxReachedStep: parsed.maxReachedStep || parsed.currentStep || 1,
          totalSteps: TOTAL_STEPS,
          completed: parsed.completed || false,
          skipped: parsed.skipped || false,
          data: parsed.data || {},
        })
      } catch {
        // Invalid stored state - reset to initial
        setState({
          currentStep: 1,
          maxReachedStep: 1,
          totalSteps: TOTAL_STEPS,
          completed: false,
          skipped: false,
          data: {},
        })
      }
    } else {
      // No stored state for this user - reset to initial
      setState({
        currentStep: 1,
        maxReachedStep: 1,
        totalSteps: TOTAL_STEPS,
        completed: false,
        skipped: false,
        data: {},
      })
    }
  }

  // Persist state to localStorage (user-scoped)
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, [state, storageKey])

  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, TOTAL_STEPS),
      maxReachedStep: Math.min(
        Math.max(prev.maxReachedStep, prev.currentStep + 1),
        TOTAL_STEPS
      ),
    }))
  }, [])

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 1),
    }))
  }, [])

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(
        1,
        Math.min(step, prev.maxReachedStep, TOTAL_STEPS)
      ),
    }))
  }, [])

  const skipOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      skipped: true,
    }))
  }, [])

  const completeOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      completed: true,
    }))
  }, [])

  const setStepData = useCallback(
    <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          [key]: value,
        },
      }))
    },
    []
  )

  const value: OnboardingContextValue = {
    state,
    nextStep,
    prevStep,
    goToStep,
    skipOnboarding,
    completeOnboarding,
    setStepData,
    canGoNext: state.currentStep < TOTAL_STEPS,
    canGoPrev: state.currentStep > 1,
    isFirstStep: state.currentStep === 1,
    isLastStep: state.currentStep === TOTAL_STEPS,
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider')
  }
  return context
}
