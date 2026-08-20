/**
 * Tests for CapVeri vs Yardi comparison page
 *
 * Covers the 5-section research-backed content:
 *  1. What Yardi does well
 *  2. Where Yardi creates problems
 *  3. Feature comparison table (6 rows)
 *  4. Anti-integration case
 *  5. FAQ (5 questions)
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { YardiComparisonPage } from './YardiComparison'

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
      <YardiComparisonPage />
    </BrowserRouter>
  )

describe('YardiComparisonPage', () => {
  it('renders without crashing', () => {
    renderPage()
    expect(document.body).toBeTruthy()
  })

  it('renders h1 containing "CapVeri vs Yardi"', () => {
    renderPage()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('CapVeri vs Yardi')
  })

  it('renders author byline with Angel Campa', () => {
    renderPage()
    expect(screen.getByText(/Angel Campa/i)).toBeInTheDocument()
  })

  it('renders author byline with updated date', () => {
    renderPage()
    expect(screen.getByText(/Updated May 1, 2026/i)).toBeInTheDocument()
  })

  it('renders 5+ h2 section headings', () => {
    renderPage()
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s.length).toBeGreaterThanOrEqual(5)
  })

  it('mentions flat-rate CAM limitation of Yardi Breeze', () => {
    renderPage()
    expect(screen.getAllByText(/flat.?rate/i).length).toBeGreaterThanOrEqual(1)
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

  it('keeps the honest full ERP replacement caveat', () => {
    renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Yardi may win.*replace your whole ERP/i)
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

  it('mentions consultant requirement for Yardi', () => {
    renderPage()
    expect(screen.getAllByText(/consultant/i).length).toBeGreaterThanOrEqual(1)
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

  describe('Section 1: What Yardi does well', () => {
    it('has a heading about what Yardi does well', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const found = h2s.some((h) =>
        /what yardi does well/i.test(h.textContent ?? '')
      )
      expect(found).toBe(true)
    })

    it('mentions Recovery and Reconciliation modules', () => {
      renderPage()
      expect(
        screen.getByText(/Recovery and Reconciliation/i)
      ).toBeInTheDocument()
    })
  })

  describe('Section 2: Where Yardi creates problems', () => {
    it('has a heading about Yardi problems', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const found = h2s.some((h) =>
        /where yardi|create problems|workflow/i.test(h.textContent ?? '')
      )
      expect(found).toBe(true)
    })

    it('mentions configuration drift', () => {
      renderPage()
      expect(
        screen.getAllByText(/configuration drift/i).length
      ).toBeGreaterThanOrEqual(1)
    })

    it('mentions data portability', () => {
      renderPage()
      expect(
        screen.getAllByText(/data portability/i).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Section 3: Feature comparison table', () => {
    it('has a comparison heading', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const found = h2s.some((h) =>
        /feature comparison|at a glance|comparison/i.test(h.textContent ?? '')
      )
      expect(found).toBe(true)
    })

    it('renders a table with at least 7 rows (header + 6 data rows)', () => {
      renderPage()
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThanOrEqual(7)
    })

    it('table includes gross-up row', () => {
      renderPage()
      expect(screen.getAllByText(/gross.?up/i).length).toBeGreaterThanOrEqual(1)
    })

    it('table includes data portability row', () => {
      renderPage()
      expect(
        screen.getAllByText(/data portability/i).length
      ).toBeGreaterThanOrEqual(1)
    })

    it('table includes audit trail row', () => {
      renderPage()
      expect(screen.getAllByText(/audit trail/i).length).toBeGreaterThanOrEqual(
        1
      )
    })

    it('cross-links to /pricing', () => {
      renderPage()
      const links = screen.getAllByRole('link')
      const pricingLink = links.find(
        (l) => l.getAttribute('href') === '/pricing'
      )
      expect(pricingLink).toBeTruthy()
    })
  })

  describe('Section 4: Anti-integration case', () => {
    it('has a heading about anti-integration or CSV', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const found = h2s.some((h) =>
        /anti.?integration|csv|why a csv/i.test(h.textContent ?? '')
      )
      expect(found).toBe(true)
    })

    it('mentions minutes turnaround', () => {
      renderPage()
      expect(screen.getAllByText(/minutes/i).length).toBeGreaterThanOrEqual(1)
    })

    it('cross-links to /resources/what-is-cam-reconciliation', () => {
      renderPage()
      const links = screen.getAllByRole('link')
      const camLink = links.find((l) =>
        l
          .getAttribute('href')
          ?.includes('/resources/what-is-cam-reconciliation')
      )
      expect(camLink).toBeTruthy()
    })
  })

  describe('Section 5: FAQ', () => {
    it('renders FAQ section heading', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const found = h2s.some((h) =>
        /frequently asked|faq/i.test(h.textContent ?? '')
      )
      expect(found).toBe(true)
    })

    it('renders 5+ FAQ question items', () => {
      renderPage()
      const h3s = screen.getAllByRole('heading', { level: 3 })
      const faqHeadings = h3s.filter((h) => h.textContent?.includes('?'))
      expect(faqHeadings.length).toBeGreaterThanOrEqual(5)
    })

    it('FAQ includes question about configuration drift', () => {
      renderPage()
      const h3s = screen.getAllByRole('heading', { level: 3 })
      const found = h3s.some((h) =>
        /configuration drift/i.test(h.textContent ?? '')
      )
      expect(found).toBe(true)
    })

    it('FAQ includes question about Yardi Breeze pro-rata', () => {
      renderPage()
      const text = document.body.textContent ?? ''
      expect(/Yardi Breeze support pro.?rata/i.test(text)).toBe(true)
    })

    it('FAQ includes question about exporting from Yardi', () => {
      renderPage()
      const text = document.body.textContent ?? ''
      expect(/export.*from Yardi|exporting.*Yardi/i.test(text)).toBe(true)
    })
  })

  describe('CTA section', () => {
    it('CTA text includes "Start Free Trial"', () => {
      renderPage()
      expect(screen.getByText(/Start Free Trial/i)).toBeInTheDocument()
    })
  })

  describe('SEO metadata', () => {
    it('SEO title starts with "Yardi CAM Reconciliation"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toMatch(/^Yardi CAM Reconciliation/i)
    })

    it('SEO description contains "Yardi" and "CAM reconciliation"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.toLowerCase()).toContain('yardi')
      expect(seo.dataset.description?.toLowerCase()).toContain(
        'cam reconciliation'
      )
    })

    it('SEO title contains year 2026 not 2025', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain('2026')
      expect(seo.dataset.title).not.toContain('2025')
    })
  })

  describe('faqSchema has 5 mainEntity items', () => {
    it('renders exactly 5 FAQ question h3 headings (schema parity enforced in breadcrumb test)', () => {
      renderPage()
      const h3s = screen.getAllByRole('heading', { level: 3 })
      // Section 2 has 4 h3s (config drift, black-box, data portability, cost+setup)
      // Section 5 has 5 FAQ h3s, filtered by trailing "?"
      const faqItems = h3s.filter((h) => h.textContent?.endsWith('?'))
      expect(faqItems).toHaveLength(5)
    })
  })

  describe('SEO year (Bug #6)', () => {
    it('SEO title does not contain "(2025)"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).not.toContain('(2025)')
    })
  })
})
