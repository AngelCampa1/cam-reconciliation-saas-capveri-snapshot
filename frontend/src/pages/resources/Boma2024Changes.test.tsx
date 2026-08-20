/**
 * Tests for BOMA 2024 vs 2017 CAM Billing Changes resource page
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Boma2024ChangesPage } from './Boma2024Changes'

// Mock components
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
    structuredData,
  }: {
    title: string
    description: string
    structuredData?: unknown
  }) => (
    <div
      data-testid="seo"
      data-title={title}
      data-description={description}
      data-structured-data={JSON.stringify(structuredData ?? null)}
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
      <Boma2024ChangesPage />
    </BrowserRouter>
  )

describe('Boma2024ChangesPage', () => {
  describe('SEO', () => {
    it('renders SEO with correct title', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toBe(
        'BOMA 2024 vs 2017: CAM Billing Changes | CapVeri'
      )
    })

    it('renders SEO with meta description containing primary keyword', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.toLowerCase()).toContain(
        'boma 2024 vs 2017 changes cam billing'
      )
    })
  })

  describe('byline', () => {
    it('renders author byline with updated date', () => {
      renderPage()
      expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
    })
  })

  describe('page content', () => {
    it('H1 contains "BOMA 2024"', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toContain('BOMA 2024')
    })

    it('single H1 on page', () => {
      renderPage()
      const h1s = screen.getAllByRole('heading', { level: 1 })
      expect(h1s).toHaveLength(1)
    })

    it('comparison table renders with 5 data rows', () => {
      renderPage()
      // Use unique first-column values to identify each row
      expect(
        screen.getByText(/Ground-level outdoor amenities/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Balconies & rooftop terraces/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/Base building circulation/i)).toBeInTheDocument()
      expect(screen.getByText(/Tenant storage areas/i)).toBeInTheDocument()
      expect(screen.getByText(/equipment shafts/i)).toBeInTheDocument()
    })

    it('section "What This Means for Your Pro-Rata Calculations" is present', () => {
      renderPage()
      expect(
        screen.getByText(/What This Means for Your Pro-Rata Calculations/i)
      ).toBeInTheDocument()
    })

    it('section "What You Need to Do Now" is present', () => {
      renderPage()
      expect(screen.getByText(/What You Need to Do Now/i)).toBeInTheDocument()
    })
  })

  describe('action items', () => {
    it('renders 4–5 list items inside "What You Need to Do Now"', () => {
      renderPage()
      // Find the ordered list within the action items section
      const actionSection = screen
        .getByText(/What You Need to Do Now/i)
        .closest('section')
      expect(actionSection).not.toBeNull()
      const listItems = actionSection!.querySelectorAll('ol li')
      expect(listItems.length).toBeGreaterThanOrEqual(4)
      expect(listItems.length).toBeLessThanOrEqual(5)
    })
  })

  describe('cross-links', () => {
    it('has link to /resources/gl-coding-guide', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /gl.?coding guide/i })
      expect(link).toHaveAttribute('href', '/resources/gl-coding-guide')
    })

    it('has link to /tools/cam-leakage-estimator', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /cam billing risk estimator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/cam-leakage-estimator')
    })

    it('has link to /tools/boma-2024-calculator', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /try the free calculator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/boma-2024-calculator')
    })
  })

  describe('CTA', () => {
    it('has anchor linking to /auth/register with reconciliation CTA', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /run your first reconciliation free/i,
      })
      expect(link).toHaveAttribute('href', '/auth/register')
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
  })

  describe('accessibility', () => {
    it('has an <article> landmark', () => {
      renderPage()
      expect(screen.getByRole('article')).toBeInTheDocument()
    })
  })

  describe('structured data / schema', () => {
    it('passes structuredData to SEO component', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.structuredData).not.toBe('null')
    })

    it('schema @type is Article', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.['@type']).toBe('Article')
    })

    it('Article schema headline contains "BOMA 2024"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.headline).toContain('BOMA 2024')
    })

    it('Article schema has Organization author', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.author?.['@type']).toBe('Organization')
      expect(article?.author?.name).toBe('CapVeri')
    })

    it('Article schema has datePublished', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.datePublished).toBeDefined()
      expect(typeof article?.datePublished).toBe('string')
    })

    it('Article schema url contains boma-2024-changes', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.url).toContain('boma-2024-changes')
    })
  })
})
