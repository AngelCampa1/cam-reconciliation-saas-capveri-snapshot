/**
 * OnboardPage Tests
 *
 * Verifies authenticated landlord users are routed to /checkout while anonymous
 * visitors still see the onboarding wizard.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/features/plg/OnboardFlowWizard', () => ({
  OnboardFlowWizard: ({ ssoMode }: { ssoMode?: boolean }) => (
    <div data-testid="wizard" data-sso-mode={String(ssoMode)} />
  ),
}))

import { OnboardPage } from '../OnboardPage'

function renderPage(url = '/onboard') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/onboard" element={<OnboardPage />} />
        <Route path="/checkout" element={<div data-testid="checkout" />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('OnboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects authenticated non-anonymous user to /checkout', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', is_anonymous: false },
    })

    renderPage('/onboard')

    expect(screen.getByTestId('checkout')).toBeInTheDocument()
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument()
  })

  it('renders SSO-mode wizard for authenticated non-anonymous user when source=sso is present', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', is_anonymous: false },
    })

    renderPage('/onboard?source=sso')

    expect(screen.queryByTestId('checkout')).not.toBeInTheDocument()
    expect(screen.getByTestId('wizard')).toHaveAttribute(
      'data-sso-mode',
      'true'
    )
  })

  it('renders wizard (no checkout bounce) for authenticated user when demo=1 is present', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', is_anonymous: false },
    })

    renderPage('/onboard?demo=1')

    expect(screen.queryByTestId('checkout')).not.toBeInTheDocument()
    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })

  it('renders wizard for anonymous user (unchanged behavior)', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'anon-1', is_anonymous: true },
    })

    renderPage('/onboard')

    expect(screen.getByTestId('wizard')).toBeInTheDocument()
    expect(screen.getByTestId('wizard')).toHaveAttribute(
      'data-sso-mode',
      'false'
    )
  })

  it('renders wizard when user is null (unauthenticated)', () => {
    mockUseAuth.mockReturnValue({ user: null })

    renderPage('/onboard')

    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })
})
