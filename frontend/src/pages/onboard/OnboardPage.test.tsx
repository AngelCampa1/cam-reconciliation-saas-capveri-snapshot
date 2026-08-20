/**
 * Tests for OnboardPage (TDD — written before implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { type ReactNode } from 'react'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock OnboardFlowWizard
vi.mock('@/features/plg/OnboardFlowWizard', () => ({
  OnboardFlowWizard: () => <div data-testid="wizard">Wizard</div>,
}))

// Mock Navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to)
      return <div data-testid="redirect">{to}</div>
    },
  }
})

import { OnboardPage } from './OnboardPage'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

describe('OnboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to checkout when non-anonymous user visits /onboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'real-user', is_anonymous: false },
    })

    render(<OnboardPage />, { wrapper: Wrapper })

    expect(screen.getByTestId('redirect')).toBeInTheDocument()
    expect(mockNavigate).toHaveBeenCalledWith('/checkout')
  })

  it('renders OnboardFlowWizard when no session exists', () => {
    mockUseAuth.mockReturnValue({ user: null })

    render(<OnboardPage />, { wrapper: Wrapper })

    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })

  it('renders OnboardFlowWizard when user is anonymous', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'anon-user', is_anonymous: true },
    })

    render(<OnboardPage />, { wrapper: Wrapper })

    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })
})
