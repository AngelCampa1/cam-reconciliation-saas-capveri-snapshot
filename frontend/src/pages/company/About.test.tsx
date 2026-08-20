/**
 * Tests for AboutPage component.
 *
 * Validates About page rendering and content.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AboutPage } from './About'

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

describe('AboutPage', () => {
  it('renders the page with heading', () => {
    render(<AboutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /about capveri/i, level: 1 })
    ).toBeInTheDocument()
  })

  it('renders tagline', () => {
    render(<AboutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/accurate CAM reconciliation for commercial landlords/i)
    ).toBeInTheDocument()
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    // Logo in nav links to home
    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('renders mission section', () => {
    render(<AboutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /our mission/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/commercial landlords miss 3/i)).toBeInTheDocument()
  })

  it('cites BOMA or industry source for the 3-5% statistic', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    const bomaLink = container.querySelector('a[href*="boma.org"]')
    expect(bomaLink).toBeInTheDocument()
    expect(bomaLink?.textContent).toMatch(/boma/i)
  })

  it('renders BOMA attribution link with safe external attributes', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    const bomaLink = container.querySelector('a[href*="boma.org"]')
    expect(bomaLink?.getAttribute('target')).toBe('_blank')
    expect(bomaLink?.getAttribute('rel')).toContain('noopener')
    expect(bomaLink?.getAttribute('rel')).toContain('noreferrer')
  })

  it('renders JSON-LD script tag for AboutPage schema', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]')
    )
    const schemaTexts = scripts.map((s) => s.textContent ?? '')
    expect(schemaTexts.some((t) => t.includes('AboutPage'))).toBe(true)
  })

  it('renders JSON-LD script tag for BreadcrumbList schema', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]')
    )
    const schemaTexts = scripts.map((s) => s.textContent ?? '')
    expect(schemaTexts.some((t) => t.includes('BreadcrumbList'))).toBe(true)
  })

  it('renders company values', () => {
    render(<AboutPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/deterministic accuracy/i)).toBeInTheDocument()
    expect(screen.getByText(/no integration needed/i)).toBeInTheDocument()
    expect(screen.getByText(/data security first/i)).toBeInTheDocument()
  })

  it('data security card mentions encryption', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.textContent).toMatch(/encrypt/i)
  })

  it('renders footer component', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.querySelector('footer')).toBeInTheDocument()
  })

  it('renders start free trial CTA with register link', () => {
    render(<AboutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/See your first CAM reconciliation in minutes/i)
    ).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: /start free trial/i })
    expect(
      ctas.some((cta) => cta.getAttribute('href') === '/auth/register')
    ).toBe(true)
  })

  it('renders Security & Compliance section heading', () => {
    render(<AboutPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /security.*compliance/i })
    ).toBeInTheDocument()
  })

  it('links to at least one compliance document', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    const complianceLink = container.querySelector(
      'a[href*="/compliance"], a[href*="security-overview"], a[href*="privacy"], a[href*="ai-transparency"]'
    )
    expect(complianceLink).toBeInTheDocument()
  })

  it('mentions HTTPS/TLS encryption in compliance section', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.textContent).toMatch(/tls|https|encrypt/i)
  })

  it('mentions append-only audit log in compliance section', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.textContent).toMatch(/audit log/i)
  })

  it('mentions IRS retention in compliance section', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.textContent).toMatch(/irs|10.year|10 year/i)
  })

  it('mentions AI with human review in compliance section', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.textContent).toMatch(/human review|human.in.the.loop/i)
  })

  it('does not claim Zero Data Retention', () => {
    const { container } = render(<AboutPage />, { wrapper: RouterWrapper })

    expect(container.textContent).not.toMatch(/zero data retention/i)
  })
})
