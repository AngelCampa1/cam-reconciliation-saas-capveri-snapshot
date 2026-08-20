/**
 * Tests for OnboardingWizard component.
 *
 * Validates wizard orchestration, navigation, and step rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { OnboardingWizard } from './OnboardingWizard'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123' },
    session: null,
    isAuthenticated: true,
    isLoading: false,
  }),
}))

// Mock step components
vi.mock('./steps', () => ({
  WelcomeStep: () => <div data-testid="welcome-step">Welcome Step</div>,
  AddPropertyStep: () => (
    <div data-testid="property-step">Add Property Step</div>
  ),
  AddLeasesStep: () => <div data-testid="lease-step">Add Leases Step</div>,
  UploadFileStep: () => <div data-testid="upload-gl-step">Upload GL Step</div>,
}))

// Mock additional step components
vi.mock('./steps/ActualBilledUploadStep', () => ({
  ActualBilledUploadStep: () => (
    <div data-testid="upload-billing-step">Upload Billing Step</div>
  ),
}))

vi.mock('./steps/LeakageResultStep', () => ({
  LeakageResultStep: () => (
    <div data-testid="leakage-step">Leakage Result Step</div>
  ),
}))

// Mock OnboardingProgress
vi.mock('./OnboardingProgress', () => ({
  OnboardingProgress: () => (
    <div data-testid="progress-indicator">Progress</div>
  ),
}))

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders with provider wrapper', () => {
    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(screen.getByText('CapVeri')).toBeInTheDocument()
  })

  it('shows progress indicator', () => {
    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(screen.getByTestId('progress-indicator')).toBeInTheDocument()
  })

  it('renders welcome step by default', () => {
    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(screen.getByTestId('welcome-step')).toBeInTheDocument()
  })

  it('shows skip button on first step', () => {
    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('button', { name: /skip setup/i })
    ).toBeInTheDocument()
  })

  it('does not show skip button on last step', () => {
    // Set localStorage to step 6 (Results - last step)
    // Note: Using user-scoped key with test-user-123
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 6,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(
      screen.queryByRole('button', { name: /skip setup/i })
    ).not.toBeInTheDocument()
  })

  it('does not show back button on first step', () => {
    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(
      screen.queryByRole('button', { name: /back/i })
    ).not.toBeInTheDocument()
  })

  it('shows back button on middle steps', () => {
    // Set localStorage to step 3
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 3,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  })

  it('does not show back button on last step', () => {
    // Set localStorage to step 6 (Results - last step)
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 6,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    expect(
      screen.queryByRole('button', { name: /back/i })
    ).not.toBeInTheDocument()
  })

  it('renders property step when on step 2', () => {
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 2,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })
    expect(screen.getByTestId('property-step')).toBeInTheDocument()
  })

  it('renders lease step when on step 3', () => {
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 3,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })
    expect(screen.getByTestId('lease-step')).toBeInTheDocument()
  })

  it('renders upload GL step when on step 4', () => {
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 4,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })
    expect(screen.getByTestId('upload-gl-step')).toBeInTheDocument()
  })

  it('renders upload billing step when on step 5', () => {
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 5,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })
    expect(screen.getByTestId('upload-billing-step')).toBeInTheDocument()
  })

  it('redirects to dashboard when completed', async () => {
    // Set localStorage with completed state
    localStorage.setItem(
      'capveri_onboarding_test-user-123',
      JSON.stringify({
        currentStep: 6,
        totalSteps: 6,
        completed: true,
        skipped: false,
        data: {},
      })
    )

    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('redirects to dashboard when skipped', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard />, { wrapper: RouterWrapper })

    const skipButton = screen.getByRole('button', { name: /skip setup/i })
    await user.click(skipButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })
})
