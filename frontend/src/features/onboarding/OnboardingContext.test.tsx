/**
 * Tests for OnboardingContext.
 *
 * Validates onboarding state management, navigation, and persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ReactNode } from 'react'
import {
  OnboardingProvider,
  useOnboarding,
  type OnboardingState,
} from './OnboardingContext'

const TEST_USER_ID = 'test-user-123'
const STORAGE_KEY = `capveri_onboarding_${TEST_USER_ID}`
const LEGACY_STORAGE_KEY = 'capveri_onboarding'

// Create wrapper with userId prop
function createWrapper(userId: string | null = TEST_USER_ID) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <OnboardingProvider userId={userId}>{children}</OnboardingProvider>
  }
}

describe('OnboardingContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('OnboardingProvider', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      expect(result.current.state).toEqual({
        currentStep: 1,
        totalSteps: 6,
        maxReachedStep: 1,
        completed: false,
        skipped: false,
        data: {},
      })
    })

    it('restores state from localStorage', () => {
      const storedState: OnboardingState = {
        currentStep: 3,
        maxReachedStep: 3,
        totalSteps: 5,
        completed: false,
        skipped: false,
        data: { propertyId: 'test-property' },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState))

      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      expect(result.current.state.currentStep).toBe(3)
      expect(result.current.state.data.propertyId).toBe('test-property')
    })

    it('handles invalid localStorage data gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid json')

      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      // Should fall back to default state
      expect(result.current.state.currentStep).toBe(1)
    })

    it('persists state to localStorage on change', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.nextStep()
      })

      const stored = localStorage.getItem(STORAGE_KEY)
      expect(stored).toBeTruthy()

      const parsed = JSON.parse(stored!)
      expect(parsed.currentStep).toBe(2)
    })

    it('clears legacy storage when user is logged in', () => {
      // Set legacy storage
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({ currentStep: 5 })
      )

      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(TEST_USER_ID),
      })

      // Legacy storage should be cleared
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()

      // Should start fresh for this user
      expect(result.current.state.currentStep).toBe(1)
    })

    it('uses separate storage per user', () => {
      const user1StorageKey = 'capveri_onboarding_user1'
      const user2StorageKey = 'capveri_onboarding_user2'

      // Set state for user1
      localStorage.setItem(
        user1StorageKey,
        JSON.stringify({ currentStep: 3, data: {} })
      )

      // Set state for user2
      localStorage.setItem(
        user2StorageKey,
        JSON.stringify({ currentStep: 5, data: {} })
      )

      // Render for user1
      const { result: result1 } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper('user1'),
      })
      expect(result1.current.state.currentStep).toBe(3)

      // Render for user2
      const { result: result2 } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper('user2'),
      })
      expect(result2.current.state.currentStep).toBe(5)
    })
  })

  describe('navigation methods', () => {
    it('advances to next step with nextStep', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.nextStep()
      })

      expect(result.current.state.currentStep).toBe(2)
    })

    it('does not advance beyond last step', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      // Advance to step 6 (last step)
      act(() => {
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
      })

      expect(result.current.state.currentStep).toBe(6)

      // Try to go beyond
      act(() => {
        result.current.nextStep()
      })

      expect(result.current.state.currentStep).toBe(6) // Should stay at 6
    })

    it('goes back with prevStep', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      // Go to step 3
      act(() => {
        result.current.nextStep()
        result.current.nextStep()
      })

      act(() => {
        result.current.prevStep()
      })

      expect(result.current.state.currentStep).toBe(2)
    })

    it('does not go below first step', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      // Already at step 1
      act(() => {
        result.current.prevStep()
      })

      expect(result.current.state.currentStep).toBe(1) // Should stay at 1
    })

    it('jumps to specific step with goToStep', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.goToStep(4)
      })

      expect(result.current.state.currentStep).toBe(4)
    })

    it('clamps goToStep to valid range', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      // Try invalid steps
      act(() => {
        result.current.goToStep(0)
      })
      expect(result.current.state.currentStep).toBe(1)

      act(() => {
        result.current.goToStep(10)
      })
      expect(result.current.state.currentStep).toBe(1)

      act(() => {
        result.current.goToStep(-5)
      })
      expect(result.current.state.currentStep).toBe(1)
    })
  })

  describe('state management', () => {
    it('marks onboarding as skipped', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.skipOnboarding()
      })

      expect(result.current.state.skipped).toBe(true)
    })

    it('marks onboarding as completed', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.completeOnboarding()
      })

      expect(result.current.state.completed).toBe(true)
    })

    it('updates step data with setStepData', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.setStepData('propertyId', 'prop-123')
      })

      expect(result.current.state.data.propertyId).toBe('prop-123')

      act(() => {
        result.current.setStepData('propertyName', 'Test Property')
      })

      expect(result.current.state.data.propertyName).toBe('Test Property')
      expect(result.current.state.data.propertyId).toBe('prop-123') // Previous data preserved
    })
  })

  describe('computed properties', () => {
    it('calculates canGoNext correctly', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      expect(result.current.canGoNext).toBe(true) // Step 1

      act(() => {
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
      })

      expect(result.current.canGoNext).toBe(false) // Last step
    })

    it('calculates canGoPrev correctly', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      expect(result.current.canGoPrev).toBe(false) // First step

      act(() => {
        result.current.nextStep()
      })

      expect(result.current.canGoPrev).toBe(true) // Step 2
    })

    it('calculates isFirstStep correctly', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isFirstStep).toBe(true)

      act(() => {
        result.current.nextStep()
      })

      expect(result.current.isFirstStep).toBe(false)
    })

    it('calculates isLastStep correctly', () => {
      const { result } = renderHook(() => useOnboarding(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLastStep).toBe(false)

      act(() => {
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
        result.current.nextStep()
      })

      expect(result.current.isLastStep).toBe(true)
    })
  })

  describe('useOnboarding hook', () => {
    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      expect(() => {
        renderHook(() => useOnboarding())
      }).toThrow('useOnboarding must be used within an OnboardingProvider')

      consoleError.mockRestore()
    })
  })
})
