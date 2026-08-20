/**
 * Tests for "CAM Reconciliation Pre-Send Checklist" resource page
 *
 * Written BEFORE the component (TDD red phase).
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CamPresendChecklistPage } from './CamPresendChecklist'

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
      <CamPresendChecklistPage />
    </BrowserRouter>
  )

describe('CamPresendChecklistPage', () => {
  describe('SEO', () => {
    it('renders SEO component with correct title', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain(
        'CAM Reconciliation Pre-Send Checklist'
      )
    })

    it('renders SEO component with description over 100 chars', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.length).toBeGreaterThan(100)
    })
  })

  describe('byline', () => {
    it('renders author byline with updated date', () => {
      renderPage()
      expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
    })
  })

  describe('page content', () => {
    it('renders the h1 heading', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toContain('CAM Reconciliation Pre-Send Checklist')
    })

    it('renders all 12 checklist items by heading text', () => {
      renderPage()
      expect(screen.getByText(/GL Exclusion Scrub/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Variable vs\. Fixed Expense Classification/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Gross-Up Calculation Audit/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Pro-Rata Denominator Reconciliation/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Mid-Year Occupancy Adjustment/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/Pro-Rata Share Math/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Tenant-Specific Lease Exclusions/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Cap Structure Verification/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Controllable vs\. Uncontrollable Segregation/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Management Fee and Administrative Markup Audit/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Vendor Invoice Completeness/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Statement Delivery Deadline Verification/i)
      ).toBeInTheDocument()
    })

    it('has at least 4 section headings', () => {
      renderPage()
      const h2s = screen.getAllByRole('heading', { level: 2 })
      expect(h2s.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('cross-links', () => {
    it('links to tenant-auditor-guide', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /What Tenant Auditors Look For/i,
      })
      expect(link).toHaveAttribute('href', '/resources/tenant-auditor-guide')
    })

    it('links to cam-leakage-estimator tool', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /CAM Billing Risk Estimator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/cam-leakage-estimator')
    })
  })

  describe('CTA', () => {
    it('Start Free Trial button links to /auth/register', () => {
      renderPage()
      const cta = screen.getByRole('link', { name: /Start Free Trial/i })
      expect(cta).toHaveAttribute('href', '/auth/register')
    })
  })

  describe('layout', () => {
    it('renders navigation', () => {
      renderPage()
      expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
    })

    it('renders footer', () => {
      renderPage()
      expect(screen.getByTestId('footer')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has exactly one h1', () => {
      renderPage()
      const h1s = screen.getAllByRole('heading', { level: 1 })
      expect(h1s).toHaveLength(1)
    })

    it('has h3 checklist item headings', () => {
      renderPage()
      const h3s = screen.getAllByRole('heading', { level: 3 })
      expect(h3s.length).toBeGreaterThanOrEqual(12)
    })
  })
})
