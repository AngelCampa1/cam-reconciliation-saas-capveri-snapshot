/**
 * Tests for "What Tenant Auditors Look For" resource page
 *
 * Written BEFORE the component (TDD red phase).
 * These tests will fail until TenantAuditorGuide.tsx is implemented.
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TenantAuditorGuidePage } from './TenantAuditorGuide'

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
      <TenantAuditorGuidePage />
    </BrowserRouter>
  )

describe('TenantAuditorGuidePage', () => {
  it('renders without crashing', () => {
    renderPage()
    expect(document.body).toBeTruthy()
  })

  it('renders correct page title', () => {
    renderPage()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('What Tenant Auditors Look For')
  })

  it('renders author byline with updated date', () => {
    renderPage()
    expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
  })

  it('renders all 4 section headings', () => {
    renderPage()
    const h2s = screen.getAllByRole('heading', { level: 2 })
    expect(h2s.length).toBeGreaterThanOrEqual(4)
  })

  it('renders 7 audit items', () => {
    renderPage()
    // Each of the 7 audit items has a recognizable heading/name
    expect(
      screen.getByText(/CapEx\/OpEx misclassification/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Gross-up applied to fixed costs/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Management fee base inflation/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Ownership expenses bleeding into CAM/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Pro-rata denominator/i)).toBeInTheDocument()
    expect(screen.getByText(/Base year baseline/i)).toBeInTheDocument()
    expect(screen.getByText(/Utility double-billing/i)).toBeInTheDocument()
  })

  it('cross-link to cam-presend-checklist present', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /CAM Pre-Send Checklist/i })
    expect(link).toHaveAttribute('href', '/resources/cam-presend-checklist')
  })

  it('cross-link to cam-leakage-estimator present', () => {
    renderPage()
    const link = screen.getByRole('link', {
      name: /CAM Billing Risk Estimator/i,
    })
    expect(link).toHaveAttribute('href', '/tools/cam-leakage-estimator')
  })

  it('CTA links to /auth/register', () => {
    renderPage()
    const ctaLink = screen.getByRole('link', { name: /Start Free Trial/i })
    expect(ctaLink).toHaveAttribute('href', '/auth/register')
  })
})
