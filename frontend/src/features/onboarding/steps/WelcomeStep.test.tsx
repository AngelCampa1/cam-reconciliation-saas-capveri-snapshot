/**
 * Tests for WelcomeStep component.
 *
 * Validates welcome screen rendering and user personalization.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomeStep } from './WelcomeStep'

// Mock hooks
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

const mockUseAuth = vi.mocked(await import('@/hooks/useAuth')).useAuth
const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding

describe('WelcomeStep', () => {
  const mockNextStep = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseOnboarding.mockReturnValue({
      nextStep: mockNextStep,
      prevStep: vi.fn(),
      currentStep: 0,
      totalSteps: 5,
      goToStep: vi.fn(),
      isFirstStep: true,
      isLastStep: false,
      progress: 0,
    })
  })

  it('renders with user email and extracts username', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'john.doe@example.com' },
      isLoading: false,
      isAuthenticated: true,
    } as any)

    render(<WelcomeStep />)

    expect(screen.getByText(/welcome, john.doe!/i)).toBeInTheDocument()
  })

  it('renders with fallback username when no email', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    } as any)

    render(<WelcomeStep />)

    expect(screen.getByText(/welcome, there!/i)).toBeInTheDocument()
  })

  it('renders with fallback when user exists but no email', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '123' },
      isLoading: false,
      isAuthenticated: true,
    } as any)

    render(<WelcomeStep />)

    expect(screen.getByText(/welcome, there!/i)).toBeInTheDocument()
  })

  it('renders all feature highlights', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      isLoading: false,
      isAuthenticated: true,
    } as any)

    render(<WelcomeStep />)

    expect(screen.getByText('Exact math, every time')).toBeInTheDocument()
    expect(screen.getByText('Your data is secure')).toBeInTheDocument()
    expect(screen.getByText('Works from your exports')).toBeInTheDocument()
  })

  it('calls nextStep when button is clicked', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      isLoading: false,
      isAuthenticated: true,
    } as any)

    render(<WelcomeStep />)

    const button = screen.getByRole('button', { name: /get started/i })
    await user.click(button)

    expect(mockNextStep).toHaveBeenCalledTimes(1)
  })

  it('renders welcome message and description', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      isLoading: false,
      isAuthenticated: true,
    } as any)

    render(<WelcomeStep />)

    expect(
      screen.getByText(/let's get capveri set up for you/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/it takes a few minutes/i)).toBeInTheDocument()
  })
})
