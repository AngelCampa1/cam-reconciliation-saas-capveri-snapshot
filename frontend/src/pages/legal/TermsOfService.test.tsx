/**
 * Tests for TermsOfServicePage component.
 *
 * Validates terms of service page rendering.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { TermsOfServicePage } from './TermsOfService'

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

describe('TermsOfServicePage', () => {
  it('renders the page with heading', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /terms of service/i, level: 1 })
    ).toBeInTheDocument()
  })

  it('shows last updated date', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/effective:/i)).toBeInTheDocument()
    expect(screen.getByText(/version 2026-06-03/i)).toBeInTheDocument()
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = render(<TermsOfServicePage />, {
      wrapper: RouterWrapper,
    })

    // Logo in nav links to home
    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('renders Acceptance of Terms section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /^1\. Acceptance$/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/by accessing or using capveri/i)
    ).toBeInTheDocument()
  })

  it('renders Description of Service section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /^2\. Service$/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/commercial real estate cam reconciliation/i)
    ).toBeInTheDocument()
  })

  it('renders User Responsibilities section with list items', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /customer duties/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/provide accurate account information/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/protect your login/i)).toBeInTheDocument()
    expect(screen.getByText(/use the service lawfully/i)).toBeInTheDocument()
    expect(
      screen.getByText(/verify every output before relying on it/i)
    ).toBeInTheDocument()
  })

  it('renders Data Ownership section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(screen.getByRole('heading', { name: /data/i })).toBeInTheDocument()
    expect(
      screen.getByText(/you keep ownership of data you upload/i)
    ).toBeInTheDocument()
  })

  it('renders Service Limitations section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /no professional advice/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/does not provide legal, accounting, tax/i)
    ).toBeInTheDocument()
  })

  it('renders Payment Terms section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /^8\. Payment$/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Subscriptions are billed annually/i)
    ).toBeInTheDocument()
  })

  it('renders No Outcome Guarantee section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /no outcome guarantee/i })
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/does not guarantee recoveries/i).length
    ).toBeGreaterThan(0)
  })

  it('renders Limitation of Liability section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /disclaimers and liability/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/provided "as is" and without warranties/i)
    ).toBeInTheDocument()
  })

  it('renders Changes to Terms section', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /changes and order/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/continued use after a change means acceptance/i)
    ).toBeInTheDocument()
  })

  it('renders Contact section with email link', () => {
    render(<TermsOfServicePage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /contact/i })
    ).toBeInTheDocument()

    const emailLink = screen.getByRole('link', {
      name: /angel\.campa@capveri\.com/i,
    })
    expect(emailLink).toBeInTheDocument()
    expect(emailLink).toHaveAttribute('href', 'mailto:angel.campa@capveri.com')
  })

  it('renders footer component', () => {
    const { container } = render(<TermsOfServicePage />, {
      wrapper: RouterWrapper,
    })

    expect(container.querySelector('footer')).toBeInTheDocument()
  })
})
