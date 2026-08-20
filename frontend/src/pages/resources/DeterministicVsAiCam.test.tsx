/**
 * Tests for Deterministic vs. AI CAM Reconciliation resource page
 */

import { render, screen, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DeterministicVsAiCamPage } from './DeterministicVsAiCam'

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
      <DeterministicVsAiCamPage />
    </BrowserRouter>
  )

describe('DeterministicVsAiCamPage', () => {
  describe('SEO', () => {
    it('renders SEO with correct title containing "Deterministic" and "AI"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain('Deterministic')
      expect(seo.dataset.title).toContain('AI')
      // Title must NOT include a brand suffix — SEO component appends "| CapVeri" automatically
      expect(seo.dataset.title).not.toContain('CapVeri')
    })

    it('renders SEO with meta description containing primary keyword', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.toLowerCase()).toContain(
        'ai cam reconciliation'
      )
    })
  })

  describe('byline', () => {
    it('renders author byline with updated date', () => {
      renderPage()
      expect(screen.getByText(/Updated February 24, 2026/i)).toBeInTheDocument()
    })
  })

  describe('page content', () => {
    it('renders single H1 containing "Deterministic"', () => {
      renderPage()
      const h1s = screen.getAllByRole('heading', { level: 1 })
      expect(h1s).toHaveLength(1)
      expect(h1s[0].textContent).toContain('Deterministic')
    })

    it('renders comparison table with all 5 dimension rows', () => {
      renderPage()
      const table = screen.getByRole('table')
      expect(within(table).getByText(/Accuracy/i)).toBeInTheDocument()
      expect(within(table).getByText(/Reproducibility/i)).toBeInTheDocument()
      expect(within(table).getByText(/Audit trail/i)).toBeInTheDocument()
      expect(
        within(table).getByText(/Court defensibility/i)
      ).toBeInTheDocument()
      expect(within(table).getByText(/Edge case handling/i)).toBeInTheDocument()
    })

    it('has "The Court Test" section heading', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /The Court Test/i })
      ).toBeInTheDocument()
    })

    it('has "When AI Is Appropriate" section', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /When AI Is Appropriate/i })
      ).toBeInTheDocument()
    })

    it('has FAQ section with ≥5 questions', () => {
      renderPage()
      // FAQ section questions are rendered as h3 headings within FAQ section
      const faqSection = screen
        .getByText(/Frequently Asked Questions/i)
        .closest('section')
      expect(faqSection).not.toBeNull()
      const questions = faqSection!.querySelectorAll('h3')
      expect(questions.length).toBeGreaterThanOrEqual(5)
    })

    it('has "Back to Resources" navigation link', () => {
      renderPage()
      const backLink = screen.getByRole('link', { name: /back to resources/i })
      expect(backLink).toHaveAttribute('href', '/resources')
    })
  })

  describe('cross-links', () => {
    it('has link to /resources/what-is-cam-reconciliation', () => {
      renderPage()
      const links = screen.getAllByRole('link', {
        name: /cam reconciliation/i,
      })
      const targetLink = links.find(
        (l) =>
          l.getAttribute('href') === '/resources/what-is-cam-reconciliation'
      )
      expect(targetLink).toBeDefined()
    })

    it('has link to /pricing', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /pricing/i })
      expect(link).toHaveAttribute('href', '/pricing')
    })
  })

  describe('CTA', () => {
    it('has CTA link to /auth/register with text matching /start free trial/i', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /start free trial/i })
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
    it('has <article> landmark', () => {
      renderPage()
      expect(screen.getByRole('article')).toBeInTheDocument()
    })

    it('has proper heading hierarchy (h1 → h2s → h3s)', () => {
      renderPage()
      const h1s = screen.getAllByRole('heading', { level: 1 })
      const h2s = screen.getAllByRole('heading', { level: 2 })
      const h3s = screen.getAllByRole('heading', { level: 3 })
      expect(h1s).toHaveLength(1)
      expect(h2s.length).toBeGreaterThan(0)
      expect(h3s.length).toBeGreaterThan(0)
    })
  })

  describe('structured data / schema', () => {
    it('passes structuredData array to SEO', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      expect(Array.isArray(schemas)).toBe(true)
    })

    it('Article schema @type is Article', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.['@type']).toBe('Article')
    })

    it('Article schema headline contains "Deterministic"', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.headline).toContain('Deterministic')
    })

    it('Article schema has Organization author named "CapVeri"', () => {
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

    it('Article schema url contains deterministic-vs-ai-cam', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const article = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'Article')
        : schemas
      expect(article?.url).toContain('deterministic-vs-ai-cam')
    })

    it('FAQPage schema @type is FAQPage', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const faqPage = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'FAQPage')
        : schemas
      expect(faqPage?.['@type']).toBe('FAQPage')
    })

    it('FAQPage schema has ≥5 mainEntity questions', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const faqPage = Array.isArray(schemas)
        ? schemas.find((s: { '@type': string }) => s['@type'] === 'FAQPage')
        : schemas
      expect(Array.isArray(faqPage?.mainEntity)).toBe(true)
      expect(faqPage?.mainEntity.length).toBeGreaterThanOrEqual(5)
    })

    it('BreadcrumbList schema is present', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      const schemas = JSON.parse(seo.dataset.structuredData ?? 'null')
      const breadcrumb = Array.isArray(schemas)
        ? schemas.find(
            (s: { '@type': string }) => s['@type'] === 'BreadcrumbList'
          )
        : schemas
      expect(breadcrumb?.['@type']).toBe('BreadcrumbList')
    })
  })
})
