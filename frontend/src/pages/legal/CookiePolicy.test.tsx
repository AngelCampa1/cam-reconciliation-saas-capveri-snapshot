/**
 * Tests for CookiePolicyPage component.
 *
 * Validates cookie policy page rendering.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CookiePolicyPage } from './CookiePolicy'

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

describe('CookiePolicyPage', () => {
  it('renders the page with heading', () => {
    render(<CookiePolicyPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /cookie policy/i, level: 1 })
    ).toBeInTheDocument()
  })

  it('shows last updated date', () => {
    render(<CookiePolicyPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/last updated:/i)).toBeInTheDocument()
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = render(<CookiePolicyPage />, {
      wrapper: RouterWrapper,
    })

    // Logo in nav links to home
    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('renders all main sections', () => {
    render(<CookiePolicyPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /what are cookies\?/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /how we use cookies/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /essential cookies/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /analytics cookies/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /marketing cookies/i })
    ).toBeInTheDocument()
  })

  it('renders footer component', () => {
    const { container } = render(<CookiePolicyPage />, {
      wrapper: RouterWrapper,
    })

    // Footer should be present (check via container query since it's a component)
    expect(container.querySelector('footer')).toBeInTheDocument()
  })
})
