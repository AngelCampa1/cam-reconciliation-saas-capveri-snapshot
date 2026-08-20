/**
 * Tests for PrivacyPolicyPage component.
 *
 * Validates privacy policy page rendering.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { PrivacyPolicyPage } from './PrivacyPolicy'

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
}))

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('PrivacyPolicyPage', () => {
  it('renders the page with heading', () => {
    render(<PrivacyPolicyPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /privacy policy/i, level: 1 })
    ).toBeInTheDocument()
  })

  it('shows last updated date', () => {
    render(<PrivacyPolicyPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/last updated:/i)).toBeInTheDocument()
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = render(<PrivacyPolicyPage />, {
      wrapper: RouterWrapper,
    })

    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('renders main privacy sections', () => {
    render(<PrivacyPolicyPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /information we collect/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /how we use your information/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /data security/i })
    ).toBeInTheDocument()
  })

  it('renders footer component', () => {
    const { container } = render(<PrivacyPolicyPage />, {
      wrapper: RouterWrapper,
    })

    expect(container.querySelector('footer')).toBeInTheDocument()
  })

  it('does not mention Zero Data Retention', () => {
    const { container } = render(<PrivacyPolicyPage />, {
      wrapper: RouterWrapper,
    })

    expect(container.textContent).not.toMatch(/zero data retention/i)
  })

  it('lists OpenRouter and Cloudflare as third-party processors', () => {
    render(<PrivacyPolicyPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText(/openrouter/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/cloudflare/i).length).toBeGreaterThan(0)
  })

  it('renders California Resident Rights section', () => {
    render(<PrivacyPolicyPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /california resident rights/i })
    ).toBeInTheDocument()
  })

  it('enumerates all six CCPA rights', () => {
    const { container } = render(<PrivacyPolicyPage />, {
      wrapper: RouterWrapper,
    })

    expect(container.textContent).toMatch(/right to know/i)
    expect(container.textContent).toMatch(/right to delete/i)
    expect(container.textContent).toMatch(/right to correct/i)
    expect(container.textContent).toMatch(/right to opt.out/i)
    expect(container.textContent).toMatch(/non.discrimination/i)
    expect(container.textContent).toMatch(/authorized agent/i)
  })

  it('shows privacy contact email', () => {
    const { container } = render(<PrivacyPolicyPage />, {
      wrapper: RouterWrapper,
    })

    expect(container.textContent).toMatch(/angel\.campa@capveri\.com/i)
  })
})
