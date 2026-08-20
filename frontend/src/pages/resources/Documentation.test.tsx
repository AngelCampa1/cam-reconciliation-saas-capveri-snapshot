/**
 * Documentation Page Tests
 *
 * Tests for the documentation page - primarily static content rendering.
 * Following test minimalism: focus on critical sections and navigation.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { DocumentationPage } from './Documentation'

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('DocumentationPage', () => {
  it('renders page header with title', () => {
    renderWithRouter(<DocumentationPage />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Documentation'
    )
    expect(
      screen.getByText(/Everything you need to know about CapVeri/)
    ).toBeInTheDocument()
  })

  it('renders Quick Navigation section with all links', () => {
    renderWithRouter(<DocumentationPage />)

    expect(screen.getByText('Quick Navigation')).toBeInTheDocument()
    // Navigation items appear in both quick nav and main content sections
    expect(screen.getAllByText('Product Overview').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Key Features').length).toBeGreaterThan(0)
    expect(screen.getAllByText('How It Works').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Security & Compliance').length).toBeGreaterThan(
      0
    )
    expect(screen.getAllByText('Supported Systems').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Technical Specifications').length
    ).toBeGreaterThan(0)
  })

  it('renders all main content sections', () => {
    renderWithRouter(<DocumentationPage />)

    // Section headings (appear as h2)
    const headings = screen.getAllByRole('heading', { level: 2 })
    const headingTexts = headings.map((h) => h.textContent)

    expect(headingTexts).toContain('Product Overview')
    expect(headingTexts).toContain('Key Features')
    expect(headingTexts).toContain('How It Works')
    expect(headingTexts).toContain('Security & Compliance')
    expect(headingTexts).toContain('Supported Systems')
    expect(headingTexts).toContain('Technical Specifications')
  })

  it('renders Help CTA section with links', () => {
    renderWithRouter(<DocumentationPage />)

    expect(screen.getByText('Need help getting started?')).toBeInTheDocument()

    // There may be multiple help center links; get all and check one has correct href
    const helpCenterLinks = screen.getAllByRole('link', {
      name: /help center/i,
    })
    expect(
      helpCenterLinks.some((link) => link.getAttribute('href') === '/help')
    ).toBe(true)

    const contactLinks = screen.getAllByRole('link', { name: /contact/i })
    expect(
      contactLinks.some((link) => link.getAttribute('href') === '/contact')
    ).toBe(true)
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = renderWithRouter(<DocumentationPage />)

    // Logo in nav links to home
    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('displays last updated date', () => {
    renderWithRouter(<DocumentationPage />)
    expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
  })
})
