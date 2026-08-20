/**
 * Completion-branch tests for OnboardFlowWizard (F-003).
 *
 * Verifies that when onboarding is `completed`:
 * - SSO mode provisions the default trial before navigating to /dashboard.
 * - Non-SSO (PLG) mode navigates without starting a trial (pricing flow owns it).
 * - The completion handler runs exactly once even if the effect re-fires.
 *
 * The context is mocked here so we can force `completed: true`; the main
 * OnboardFlowWizard.test.tsx exercises the real provider for the step flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockStartDefaultTrial = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/billing/startDefaultTrial', () => ({
  startDefaultTrial: () => mockStartDefaultTrial(),
}))

vi.mock('./hooks/useAnonSession', () => ({
  useAnonSession: () => ({
    userId: 'sso-user-id',
    organizationId: 'org-id',
    isReady: true,
    error: null,
    shouldRedirectToDashboard: false,
  }),
}))

// Force a completed onboarding state via a mocked context.
vi.mock('./OnboardFlowContext', () => ({
  OnboardFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useOnboarding: () => ({
    state: { currentStep: 5, completed: true, data: {} },
    prevStep: vi.fn(),
    completeOnboarding: vi.fn(),
  }),
}))

// Light step mocks (step 5 = ResultsStep renders).
vi.mock('../onboarding/steps/AddPropertyStep', () => ({
  AddPropertyStep: () => <div>Property</div>,
}))
vi.mock('../onboarding/steps/AddLeasesStep', () => ({
  AddLeasesStep: () => <div>Leases</div>,
}))
vi.mock('../onboarding/steps', () => ({ UploadFileStep: () => <div>GL</div> }))
vi.mock('../onboarding/steps/ActualBilledUploadStep', () => ({
  ActualBilledUploadStep: () => <div>Billing</div>,
}))
vi.mock('./steps/ResultsStep', () => ({
  ResultsStep: () => <div data-testid="results-step">Results</div>,
}))
vi.mock('./steps/EmailCaptureStep', () => ({
  EmailCaptureStep: () => <div>Email</div>,
}))
vi.mock('./steps/SetPasswordStep', () => ({
  SetPasswordStep: () => <div>Password</div>,
}))
vi.mock('../onboarding/OnboardingProgress', () => ({
  OnboardingProgress: () => <div>Progress</div>,
}))

import { OnboardFlowWizard } from './OnboardFlowWizard'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('OnboardFlowWizard completion (F-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('SSO mode starts the default trial then navigates to /dashboard', async () => {
    render(<OnboardFlowWizard ssoMode />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
    expect(mockStartDefaultTrial).toHaveBeenCalledTimes(1)
  })

  it('PLG (non-SSO) mode navigates to billing selection without starting a trial', async () => {
    render(<OnboardFlowWizard />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/settings/billing?intent=select-plan'
      )
    })
    expect(mockStartDefaultTrial).not.toHaveBeenCalled()
  })
})
