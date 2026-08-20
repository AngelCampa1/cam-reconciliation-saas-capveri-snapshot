/**
 * Tests for "GL Coding Guide: CAM Recoverable Expenses" resource page
 *
 * Written BEFORE the component (TDD red phase).
 * These tests will fail until GlCodingGuide.tsx is implemented.
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { GlCodingGuidePage } from './GlCodingGuide'

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
  }: {
    title: string
    description: string
    canonical?: string
  }) => (
    <div
      data-testid="seo"
      data-title={title}
      data-description={description}
      data-canonical={canonical}
    />
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
      <GlCodingGuidePage />
    </BrowserRouter>
  )

describe('GlCodingGuide', () => {
  describe('SEO', () => {
    it('renders with correct title containing primary keyword', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain('GL Coding')
      expect(seo.dataset.title).toContain('CAM')
    })

    it('renders meta description >= 130 chars', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.length).toBeGreaterThanOrEqual(130)
    })

    it('sets canonical to /resources/gl-coding-guide', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.canonical).toBe('/resources/gl-coding-guide')
    })
  })

  describe('Navigation', () => {
    it('renders LandingNav', () => {
      renderPage()
      expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
    })

    it('renders Footer', () => {
      renderPage()
      expect(screen.getByTestId('footer')).toBeInTheDocument()
    })
  })

  describe('Byline', () => {
    it('renders author byline with updated date', () => {
      renderPage()
      expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
    })
  })

  describe('Content', () => {
    it('renders H1 with primary keyword phrase', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toMatch(/GL Coding/i)
      expect(h1.textContent).toMatch(/CAM/i)
    })

    it('renders all three table sections', () => {
      renderPage()
      expect(
        screen.getAllByText(/Clearly Recoverable/i).length
      ).toBeGreaterThan(0)
      expect(screen.getAllByText(/Non-Recoverable/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Gray.Area/i).length).toBeGreaterThan(0)
    })

    it('renders How Miscoding Snowballs section', () => {
      renderPage()
      expect(screen.getByText(/Miscoding Snowballs/i)).toBeInTheDocument()
    })
  })

  describe('CTAs', () => {
    it('renders link to /resources/cam-presend-checklist', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /CAM Pre-Send Checklist/i,
      })
      expect(link).toHaveAttribute('href', '/resources/cam-presend-checklist')
    })

    it('renders link to /tools/cam-leakage-estimator', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /CAM Billing Risk Estimator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/cam-leakage-estimator')
    })

    it('renders Start Free Trial link to /auth/register', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /Start Free Trial/i })
      expect(link).toHaveAttribute('href', '/auth/register')
    })
  })
})
