/**
 * Tests for CAM Reconciliation Errors resource article page
 *
 * TDD: Written before the component — all tests should fail until implemented.
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CamReconciliationErrorsPage } from '../CamReconciliationErrors'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => <nav data-testid="landing-nav">Nav</nav>,
}))

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}))

vi.mock('@/components/SEO', () => ({
  SEO: ({
    title,
    description,
    canonical,
    ogType,
    structuredData,
  }: {
    title: string
    description: string
    canonical?: string
    ogType?: string
    structuredData?: unknown
  }) => (
    <div
      data-testid="seo"
      data-title={title}
      data-description={description}
      data-canonical={canonical}
      data-og-type={ogType}
      data-structured-data={JSON.stringify(structuredData)}
    />
  ),
  structuredDataSchemas: {
    faqPage: (faqs: Array<{ question: string; answer: string }>) => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(
    <BrowserRouter>
      <CamReconciliationErrorsPage />
    </BrowserRouter>
  )

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CamReconciliationErrorsPage', () => {
  describe('SEO', () => {
    it('title targets property managers', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title?.toLowerCase()).toMatch(
        /property manager|landlord/i
      )
    })

    it('description contains primary keyword "CAM reconciliation errors"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.toLowerCase()).toContain(
        'cam reconciliation error'
      )
    })

    it('canonical set to /resources/cam-reconciliation-errors', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.canonical).toBe('/resources/cam-reconciliation-errors')
    })

    it('ogType is "article"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.ogType).toBe('article')
    })
  })

  describe('structured data', () => {
    it('Article schema is present with correct type', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? '[]') as Array<{
        '@type': string
      }>
      const article = schemas.find((s) => s['@type'] === 'Article')
      expect(article).toBeDefined()
    })

    it('Article schema has author, datePublished, and dateModified', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? '[]') as Array<
        Record<string, unknown>
      >
      const article = schemas.find((s) => s['@type'] === 'Article') as Record<
        string,
        unknown
      >
      expect(article).toBeDefined()
      expect(article.author).toBeDefined()
      expect(article.datePublished).toBe('2026-02-23')
      expect(article.dateModified).toBe('2026-02-23')
    })

    it('FAQPage schema is present', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? '[]') as Array<{
        '@type': string
      }>
      const faqPage = schemas.find((s) => s['@type'] === 'FAQPage')
      expect(faqPage).toBeDefined()
    })
  })

  describe('byline', () => {
    it('renders author name "CapVeri" in byline', () => {
      renderPage()
      // Look for the exact "CapVeri" text node in the byline <strong> element
      const bylineStrong = document.querySelector(
        'article header strong, div.flex strong'
      )
      expect(bylineStrong?.textContent).toBe('CapVeri')
    })

    it('renders <time> element with dateTime="2026-02-23"', () => {
      renderPage()
      const timeEl = document.querySelector('time[dateTime="2026-02-23"]')
      expect(timeEl).not.toBeNull()
    })

    it('byline shows "Updated February 23, 2026"', () => {
      renderPage()
      expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
    })
  })

  describe('headings', () => {
    it('has a single H1', () => {
      renderPage()
      const h1s = screen.getAllByRole('heading', { level: 1 })
      expect(h1s).toHaveLength(1)
    })

    it('H1 contains the article title text', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toMatch(/CAM Reconciliation Errors/i)
    })

    it('renders at least 6 H2 error sections', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      expect(h2s.length).toBeGreaterThanOrEqual(6)
    })

    it('no heading level skips (H1 → H2 → H3 only)', () => {
      renderPage()
      const h4s = document.querySelectorAll('h4')
      const h5s = document.querySelectorAll('h5')
      expect(h4s.length).toBe(0)
      expect(h5s.length).toBe(0)
    })
  })

  describe('error sections', () => {
    it('Error 1: gross-up section present', () => {
      renderPage()
      expect(
        screen.getByText(/gross.?up/i, { selector: 'h2' })
      ).toBeInTheDocument()
    })

    it('Error 2: cap rate section present', () => {
      renderPage()
      expect(
        screen.getByText(/cap rate/i, { selector: 'h2' })
      ).toBeInTheDocument()
    })

    it('Error 3: zero prior year section present', () => {
      renderPage()
      expect(
        screen.getByText(/prior year|zero.*cap|first.year/i, { selector: 'h2' })
      ).toBeInTheDocument()
    })

    it('Error 4: cumulative cap bank section present', () => {
      renderPage()
      expect(
        screen.getByText(/cumulative cap|cap bank/i, { selector: 'h2' })
      ).toBeInTheDocument()
    })

    it('Error 5: occupancy / lease dates section present', () => {
      renderPage()
      expect(
        screen.getByText(/occupancy|lease date/i, { selector: 'h2' })
      ).toBeInTheDocument()
    })

    it('Error 6: admin fee section present', () => {
      renderPage()
      expect(
        screen.getByText(/admin fee/i, { selector: 'h2' })
      ).toBeInTheDocument()
    })
  })

  describe('FAQ section', () => {
    it('renders FAQ heading', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /frequently asked questions/i })
      ).toBeInTheDocument()
    })

    it('renders FAQ question about most common error', () => {
      renderPage()
      expect(
        screen.getByText(/most common cam reconciliation error/i)
      ).toBeInTheDocument()
    })

    it('renders FAQ question about gross-up error detection', () => {
      renderPage()
      expect(screen.getByText(/gross.?up error/i)).toBeInTheDocument()
    })

    it('renders FAQ question about tenant dispute rights', () => {
      renderPage()
      // FAQ question h3: "Can a tenant dispute a CAM reconciliation error?"
      const matches = screen.getAllByText(/tenant.*dispute|dispute.*cam/i)
      expect(matches.length).toBeGreaterThan(0)
    })

    it('renders FAQ question about cumulative cap bank', () => {
      renderPage()
      // FAQ question h3: "What is a cumulative CAM cap and how does the cap bank work?"
      const matches = screen.getAllByText(
        /cumulative.*cap.*bank|cap.*bank.*work/i
      )
      expect(matches.length).toBeGreaterThan(0)
    })

    it('renders FAQ question about CapVeri detection', () => {
      renderPage()
      expect(screen.getByText(/capveri detect/i)).toBeInTheDocument()
    })
  })

  describe('navigation and CTA', () => {
    it('has back-link to /resources', () => {
      renderPage()
      const backLink = screen.getByRole('link', {
        name: /back.*resources|resources/i,
      })
      expect(backLink).toHaveAttribute('href', '/resources')
    })

    it('has CTA link to /auth/register', () => {
      renderPage()
      const ctaLinks = screen
        .getAllByRole('link')
        .filter((l) => l.getAttribute('href') === '/auth/register')
      expect(ctaLinks.length).toBeGreaterThan(0)
    })

    it('CTA link text mentions "audit" or "free"', () => {
      renderPage()
      const ctaLink = screen
        .getAllByRole('link')
        .find((l) => l.getAttribute('href') === '/auth/register')
      expect(ctaLink?.textContent?.toLowerCase()).toMatch(/audit|free/i)
    })
  })

  describe('layout', () => {
    it('renders LandingNav', () => {
      renderPage()
      expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
    })

    it('renders Footer', () => {
      renderPage()
      expect(screen.getByTestId('footer')).toBeInTheDocument()
    })

    it('has an <article> landmark', () => {
      renderPage()
      expect(screen.getByRole('article')).toBeInTheDocument()
    })
  })

  describe('quick answer box', () => {
    it('renders a quick answer / summary box', () => {
      renderPage()
      // Quick answer box should contain a summary or TL;DR
      const quickAnswer = document.querySelector(
        '[data-testid="quick-answer"], .quick-answer, [aria-label*="quick"], [aria-label*="summary"]'
      )
      expect(quickAnswer).not.toBeNull()
    })
  })
})
