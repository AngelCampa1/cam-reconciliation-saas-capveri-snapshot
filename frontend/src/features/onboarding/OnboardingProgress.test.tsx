/**
 * Tests for OnboardingProgress component.
 *
 * Validates progress indicator rendering and step states.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingProgress } from './OnboardingProgress'

// Mock hooks
vi.mock('./OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

const mockUseOnboarding = vi.mocked(
  await import('./OnboardingContext')
).useOnboarding

describe('OnboardingProgress', () => {
  it('renders at first step', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 1,
        totalSteps: 6,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: true,
      isLastStep: false,
      progress: 0,
    } as any)

    render(<OnboardingProgress />)

    // Visible label is calm: "Step N · Label" (no wall-ahead "of N" count).
    expect(screen.getByText(/^step 1$/i)).toBeInTheDocument()
    expect(screen.getByText('Building')).toBeInTheDocument()
    // The full count lives in the accessible group name.
    expect(
      screen.getByRole('group', {
        name: /onboarding progress: step 1 of 7/i,
      })
    ).toBeInTheDocument()
  })

  it('renders at middle step with completed, current, and future states', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 3,
        totalSteps: 6,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: false,
      progress: 40,
    } as any)

    const { container } = render(<OnboardingProgress />)

    expect(screen.getByText(/^step 3$/i)).toBeInTheDocument()
    expect(screen.getByText('Costs')).toBeInTheDocument()

    // Should have checkmarks for completed steps (1 and 2)
    // Check icons rendered via lucide-react
    const checkIcons = container.querySelectorAll('svg')
    expect(checkIcons.length).toBeGreaterThan(0)
  })

  it('renders at last step', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 7,
        totalSteps: 7,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: true,
      progress: 100,
    } as any)

    render(<OnboardingProgress />)

    expect(screen.getByText(/^step 7$/i)).toBeInTheDocument()
    expect(screen.getByText('Password')).toBeInTheDocument()
  })

  it('displays correct step label for Building step', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 1,
        totalSteps: 7,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: false,
      progress: 20,
    } as any)

    render(<OnboardingProgress />)

    expect(screen.getByText('Building')).toBeInTheDocument()
  })

  it('displays correct step label for Charges step', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 4,
        totalSteps: 7,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: false,
      progress: 60,
    } as any)

    render(<OnboardingProgress />)

    expect(screen.getByText('Charges')).toBeInTheDocument()
    expect(screen.getByText(/^step 4$/i)).toBeInTheDocument()
  })

  it('renders step numbers for non-completed steps', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 1,
        totalSteps: 6,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: true,
      isLastStep: false,
      progress: 0,
    } as any)

    const { container } = render(<OnboardingProgress />)

    // At step 1, steps 2-6 should show numbers
    const stepCircles = container.querySelectorAll('div[class*="rounded-full"]')
    expect(stepCircles.length).toBeGreaterThan(0)
  })

  it('uses custom labels prop when provided', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 2,
        totalSteps: 3,
        maxReachedStep: 2,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: false,
    } as any)

    render(<OnboardingProgress labels={['A', 'B', 'C']} />)

    // Should show the custom label for step 2, not the hardcoded "Property"
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.queryByText('Property')).not.toBeInTheDocument()
  })

  it('uses default labels when labels prop is not provided', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 2,
        totalSteps: 6,
        maxReachedStep: 2,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: false,
    } as any)

    render(<OnboardingProgress />)

    // Default labels: step 2 is "Tenants".
    expect(screen.getByText('Tenants')).toBeInTheDocument()
  })

  it('shows step indicator for all steps', () => {
    mockUseOnboarding.mockReturnValue({
      state: {
        currentStep: 3,
        totalSteps: 6,
        data: {},
      },
      nextStep: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      isFirstStep: false,
      isLastStep: false,
      progress: 40,
    } as any)

    const { container } = render(<OnboardingProgress />)

    // Should render 7 step indicators (circles scale h-8/w-8 on mobile up to
    // sm:h-10/sm:w-10 on larger viewports, so match the mobile-base size).
    const stepIndicators = container.querySelectorAll(
      'div[class*="flex h-8 w-8"]'
    )
    expect(stepIndicators.length).toBe(7)
  })
})
