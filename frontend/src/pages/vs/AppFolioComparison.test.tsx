/**
 * Tests for CapVeri vs AppFolio comparison page
 *
 * Written BEFORE the component (TDD red phase).
 * These tests will fail until AppFolioComparison.tsx is implemented.
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppFolioComparisonPage } from './AppFolioComparison'

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => <nav data-testid="landing-nav">Nav</nav>,
}))

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}))

vi.mock('@/components/SEO', () => ({
  SEO: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="seo" data-title={title} data-description={description} />
  ),
  structuredDataSchemas: {
    breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url.startsWith('http')
          ? item.url
          : `https://www.capveri.com${item.url}`,
      })),
    }),
  },
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <AppFolioComparisonPage />
    </BrowserRouter>
  )

describe('AppFolioComparisonPage', () => {
  it('renders without crashing', () => {
    renderPage()
    expect(document.body).toBeTruthy()
  })

  it('renders h1 containing "CapVeri vs AppFolio"', () => {
    renderPage()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('CapVeri vs AppFolio')
  })

  it('renders author byline with updated date', () => {
    renderPage()
    expect(screen.getByText(/Updated May 1, 2026/i)).toBeInTheDocument()
  })

  it('byline has a readable "By CapVeri" and no replacement character', () => {
    renderPage()
    // Spacing fix: must read "By CapVeri", not the run-together "ByCapVeri".
    expect(document.body.textContent).toContain('By CapVeri')
    // Garbled separator fix: no U+FFFD replacement character anywhere.
    expect(document.body.textContent).not.toContain('�')
  })

  it('renders 4+ h2 section headings', () => {
    renderPage()
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s.length).toBeGreaterThanOrEqual(4)
  })

  it('mentions AppFolio residential-first nature', () => {
    renderPage()
    expect(
      screen.getAllByText(/residential.?first/i).length
    ).toBeGreaterThanOrEqual(1)
  })

  it('mentions BOMA gross-up as CapVeri differentiator', () => {
    renderPage()
    expect(screen.getAllByText(/BOMA/i).length).toBeGreaterThanOrEqual(1)
  })

  it('mentions anti-integration / CSV export angle', () => {
    renderPage()
    expect(screen.getAllByText(/CSV/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders above-fold winner verdict with required CAM verification positioning', () => {
    renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/CapVeri is the recommended choice/i)
    expect(text).toMatch(/check CAM reconciliations before you bill tenants/i)
    expect(text).toMatch(/gross-up and cap math the same way every time/i)
    expect(text).toMatch(/set it up from a CSV file/i)
    expect(text).toMatch(/audit trail/i)
    expect(text).toMatch(/ready for disputes/i)
  })

  it('keeps the honest residential-first/simple mixed portfolio caveat', () => {
    renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/AppFolio may fit.*residential-first/i)
    expect(text).toMatch(/simple mixed portfolios/i)
  })

  it('uses current CapVeri pricing and removes stale pricing', () => {
    renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Reconcile starts at $998/year with 80OFF')
    expect(text).toContain('List price starts at $4,990/year')
    expect(text).toContain('26-150 units: $179 per extra unit/year')
    expect(text).toContain('80OFF')
    expect(text).toMatch(/30-day free trial/i)
    expect(text).toMatch(/no credit card/i)
    expect(text).not.toMatch(/from \$149\/audit/i)
    expect(text).not.toMatch(/First audit free/i)
    expect(text).not.toMatch(/20% of verified recovery/i)
  })

  it('mentions AppFolio pricing', () => {
    renderPage()
    expect(screen.getAllByText(/\$1\.50/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders LandingNav and Footer', () => {
    renderPage()
    expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('CTA links to /auth/register', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    const registerLink = links.find(
      (l) => l.getAttribute('href') === '/auth/register'
    )
    expect(registerLink).toBeTruthy()
  })

  describe('SEO year (Bug #6)', () => {
    it('SEO title contains "(2026)" not "(2025)"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain('(2026)')
      expect(seo.dataset.title).not.toContain('(2025)')
    })
  })
})
