/**
 * OnboardingResultsPaywall Tests
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock CheckoutDialog to avoid billing complexity
vi.mock('@/components/billing/CheckoutDialog', () => ({
  CheckoutDialog: () => null,
}))

// Mock useAuth (referenced by CheckoutDialog chain)
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { OnboardingResultsPaywall } from './OnboardingResultsPaywall'
import { trackEvent } from '@/lib/analytics'

const mockTrackEvent = vi.mocked(trackEvent)

function renderPaywall(props: {
  hasLeakage?: boolean
  hasOverbilling?: boolean
  absoluteVariance?: number
}) {
  return render(
    <MemoryRouter>
      <OnboardingResultsPaywall
        hasLeakage={props.hasLeakage ?? false}
        hasOverbilling={props.hasOverbilling ?? false}
        absoluteVariance={props.absoluteVariance ?? 0}
      />
    </MemoryRouter>
  )
}

describe('OnboardingResultsPaywall', () => {
  beforeEach(() => {
    mockTrackEvent.mockClear()
  })

  it('shows dollar amount in heading when absoluteVariance > 0 and hasLeakage', () => {
    renderPaywall({ hasLeakage: true, absoluteVariance: 12500 })
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      '$12,500'
    )
    expect(screen.getByText(/in under-bills/i)).toBeInTheDocument()
  })

  it('shows fallback heading when absoluteVariance is 0', () => {
    renderPaywall({
      hasLeakage: false,
      hasOverbilling: false,
      absoluteVariance: 0,
    })
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading).toHaveTextContent('Unlock Your Full Statement Check Report')
    expect(
      screen.getByText(/download your full statement check report/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/complete reconciliation report/i)
    ).not.toBeInTheDocument()
    // Should not contain NaN
    expect(heading.textContent).not.toContain('NaN')
    expect(heading).not.toHaveTextContent('Reconciliation Report')
  })

  it('shows dollar amount in heading when absoluteVariance > 0 and hasOverbilling', () => {
    renderPaywall({ hasOverbilling: true, absoluteVariance: 7800 })
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      '$7,800'
    )
    expect(screen.getByText(/in over-bills/i)).toBeInTheDocument()
  })

  it('fires upgrade_modal_shown on mount with the variance and surface', () => {
    renderPaywall({ hasLeakage: true, absoluteVariance: 12500 })

    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_modal_shown', {
      recovery_amount: 12500,
      surface: 'onboarding_results',
    })
  })

  it('fires upgrade_modal_cta_clicked when the trial CTA is clicked', () => {
    renderPaywall({ hasLeakage: true, absoluteVariance: 12500 })

    fireEvent.click(screen.getByRole('link', { name: /start free trial/i }))

    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_modal_cta_clicked', {
      recovery_amount: 12500,
      surface: 'onboarding_results',
    })
  })
})
