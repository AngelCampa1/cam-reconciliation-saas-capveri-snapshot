/**
 * Tests for OnboardFlowContext (TDD — written before implementation).
 *
 * PLG flow state management, distinct from the regular OnboardingContext.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { OnboardFlowProvider, useOnboarding } from './OnboardFlowContext'

const TEST_USER_ID = 'plg-user-abc123'
const PLG_STORAGE_KEY = `capveri_plg_${TEST_USER_ID}`

function createWrapper(userId: string | null = TEST_USER_ID) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <OnboardFlowProvider userId={userId}>{children}</OnboardFlowProvider>
  }
}

describe('OnboardFlowContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('starts at step 1', () => {
    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    expect(result.current.state.currentStep).toBe(1)
    expect(result.current.state.totalSteps).toBe(7)
    expect(result.current.state.completed).toBe(false)
  })

  it('nextStep advances step', () => {
    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.nextStep()
    })

    expect(result.current.state.currentStep).toBe(2)
  })

  it('persists state to localStorage on step advance', () => {
    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.nextStep()
    })

    const stored = localStorage.getItem(PLG_STORAGE_KEY)
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed.currentStep).toBe(2)
  })

  it('restores state from localStorage on mount', () => {
    localStorage.setItem(
      PLG_STORAGE_KEY,
      JSON.stringify({ currentStep: 4, data: { propertyId: 'prop-xyz' } })
    )

    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    expect(result.current.state.currentStep).toBe(4)
    expect(result.current.state.data.propertyId).toBe('prop-xyz')
  })

  it('uses separate storage key from regular onboarding', () => {
    // PLG key should not conflict with regular onboarding key
    const regularKey = `capveri_onboarding_${TEST_USER_ID}`
    localStorage.setItem(regularKey, JSON.stringify({ currentStep: 3 }))

    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    // PLG flow should start at 1, not inherit regular flow state
    expect(result.current.state.currentStep).toBe(1)
  })

  it('does not have skipOnboarding (no escape hatch)', () => {
    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    // PLG flow has no skip
    expect('skipOnboarding' in result.current).toBe(false)
  })

  it('stores PLG-specific data fields via setStepData', () => {
    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setStepData('email', 'plg@example.com')
      result.current.setStepData('firstName', 'Alex')
      result.current.setStepData('organizationName', 'Acme Corp')
    })

    expect(result.current.state.data.email).toBe('plg@example.com')
    expect(result.current.state.data.firstName).toBe('Alex')
    expect(result.current.state.data.organizationName).toBe('Acme Corp')
  })

  it('totalSteps is 7', () => {
    const { result } = renderHook(() => useOnboarding(), {
      wrapper: createWrapper(),
    })

    expect(result.current.state.totalSteps).toBe(7)
  })
})
