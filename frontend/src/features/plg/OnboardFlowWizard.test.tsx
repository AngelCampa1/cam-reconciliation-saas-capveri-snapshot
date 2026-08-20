/**
 * Tests for OnboardFlowWizard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { OnboardFlowWizard } from './OnboardFlowWizard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock useAnonSession
const mockUseAnonSession = vi.fn()
vi.mock('./hooks/useAnonSession', () => ({
  useAnonSession: () => mockUseAnonSession(),
}))

// Mock step components
vi.mock('../onboarding/steps/AddPropertyStep', async () => {
  const { useOnboarding } = await vi.importActual<
    typeof import('../onboarding/OnboardingContext')
  >('../onboarding/OnboardingContext')

  return {
    AddPropertyStep: () => {
      const { nextStep } = useOnboarding()

      return (
        <div data-testid="property-step">
          Property
          <button type="button" onClick={nextStep}>
            Next property
          </button>
        </div>
      )
    },
  }
})
vi.mock('../onboarding/steps/AddLeasesStep', () => ({
  AddLeasesStep: () => <div data-testid="leases-step">Leases</div>,
}))
vi.mock('../onboarding/steps', () => ({
  UploadFileStep: () => <div data-testid="gl-step">GL</div>,
}))
vi.mock('../onboarding/steps/ActualBilledUploadStep', () => ({
  ActualBilledUploadStep: () => <div data-testid="billing-step">Billing</div>,
}))
vi.mock('./steps/WelcomeSampleStep', () => ({
  WelcomeSampleStep: () => (
    <div data-testid="welcome-sample-step">Welcome sample</div>
  ),
}))
vi.mock('./steps/ResultsStep', () => ({
  ResultsStep: () => <div data-testid="results-step">Results</div>,
}))
vi.mock('./steps/EmailCaptureStep', () => ({
  EmailCaptureStep: () => <div data-testid="email-step">Email</div>,
}))
vi.mock('./steps/SetPasswordStep', () => ({
  SetPasswordStep: () => <div data-testid="password-step">Password</div>,
}))
vi.mock('../onboarding/OnboardingProgress', () => ({
  OnboardingProgress: () => <div data-testid="progress">Progress</div>,
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('@/lib/billing/startDefaultTrial', () => ({
  startDefaultTrial: vi.fn().mockResolvedValue(undefined),
}))

import { trackEvent } from '@/lib/analytics'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('OnboardFlowWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('redirects to dashboard when non-anonymous user visits /onboard', async () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'real-user-id',
      organizationId: null,
      isReady: false,
      error: null,
      shouldRedirectToDashboard: true,
    })

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })

  it('renders loading state while session is bootstrapping', () => {
    mockUseAnonSession.mockReturnValue({
      userId: null,
      organizationId: null,
      isReady: false,
      error: null,
      shouldRedirectToDashboard: false,
    })

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    expect(screen.getByText(/preparing your workspace/i)).toBeInTheDocument()
  })

  it('renders the sample-first Welcome screen for a new non-SSO user (after bootstrap)', () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    // Sample-first front door is shown before the numbered step machine.
    expect(screen.getByTestId('welcome-sample-step')).toBeInTheDocument()
    expect(screen.queryByTestId('property-step')).not.toBeInTheDocument()
  })

  it('renders the property step once the flow has started', () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })
    localStorage.setItem(
      'capveri_plg_anon-user-id',
      JSON.stringify({
        currentStep: 1,
        maxReachedStep: 1,
        data: { flowStarted: true },
      })
    )

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    expect(screen.getByTestId('property-step')).toBeInTheDocument()
  })

  it('tracks numbered onboarding step transitions for drop-off reporting', () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })
    localStorage.setItem(
      'capveri_plg_anon-user-id',
      JSON.stringify({
        currentStep: 1,
        maxReachedStep: 1,
        data: { flowStarted: true },
      })
    )

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    expect(trackEvent).toHaveBeenCalledWith('onboard_step_transitioned', {
      flow_id: 'plg_onboarding',
      flow_mode: 'plg',
      sample_preview: false,
      step: 1,
      step_label: 'Building',
      total_steps: 7,
      previous_step: null,
      previous_step_label: null,
      direction: 'entered',
      elapsed_ms: 0,
    })
  })

  it('tracks forward and back transitions with elapsed time', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })
    localStorage.setItem(
      'capveri_plg_anon-user-id',
      JSON.stringify({
        currentStep: 1,
        maxReachedStep: 1,
        data: { flowStarted: true },
      })
    )

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    dateNowSpy.mockReturnValue(2500)
    fireEvent.click(screen.getByRole('button', { name: /next property/i }))

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('onboard_step_transitioned', {
        flow_id: 'plg_onboarding',
        flow_mode: 'plg',
        sample_preview: false,
        step: 2,
        step_label: 'Tenants',
        total_steps: 7,
        previous_step: 1,
        previous_step_label: 'Building',
        direction: 'forward',
        elapsed_ms: 1500,
      })
    })

    dateNowSpy.mockReturnValue(4000)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('onboard_step_transitioned', {
        flow_id: 'plg_onboarding',
        flow_mode: 'plg',
        sample_preview: false,
        step: 1,
        step_label: 'Building',
        total_steps: 7,
        previous_step: 2,
        previous_step_label: 'Tenants',
        direction: 'back',
        elapsed_ms: 1500,
      })
    })

    dateNowSpy.mockRestore()
  })

  it('does not track impossible SSO steps outside the five-step flow', () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })
    localStorage.setItem(
      'capveri_plg_anon-user-id',
      JSON.stringify({
        currentStep: 6,
        maxReachedStep: 6,
        data: { flowStarted: true },
      })
    )

    render(<OnboardFlowWizard ssoMode />, { wrapper: RouterWrapper })

    expect(trackEvent).not.toHaveBeenCalledWith(
      'onboard_step_transitioned',
      expect.objectContaining({ step: 6 })
    )
  })

  it('does not show skip button', () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    expect(
      screen.queryByRole('button', { name: /skip/i })
    ).not.toBeInTheDocument()
  })

  it('announces step progress to screen readers once the flow has started', () => {
    mockUseAnonSession.mockReturnValue({
      userId: 'anon-user-id',
      organizationId: 'org-id',
      isReady: true,
      error: null,
      shouldRedirectToDashboard: false,
    })
    // The step-machine chrome shows once the user has started the real-data
    // flow from the Welcome screen.
    localStorage.setItem(
      'capveri_plg_anon-user-id',
      JSON.stringify({
        currentStep: 1,
        maxReachedStep: 1,
        data: { flowStarted: true },
      })
    )

    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    // Calm, jargon-free aria-live announcement (no "draft reconciliation" copy).
    expect(screen.getByText(/step 1: building/i)).toBeInTheDocument()
    expect(screen.queryByText(/first useful output/i)).not.toBeInTheDocument()
  })
})
