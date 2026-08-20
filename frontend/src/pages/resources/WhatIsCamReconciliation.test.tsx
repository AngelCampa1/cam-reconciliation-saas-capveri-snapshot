/**
 * Tests for GEO-optimized "What is CAM Reconciliation" resource page
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { WhatIsCamReconciliationPage } from './WhatIsCamReconciliation'
import { faqData } from './cam-reconciliation-data'

// Mock components
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
      <WhatIsCamReconciliationPage />
    </BrowserRouter>
  )

describe('WhatIsCamReconciliationPage', () => {
  describe('SEO', () => {
    it('renders SEO component with optimized title', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain('CAM')
      expect(seo.dataset.title).toContain('Reconciliation')
    })

    it('renders SEO component with description', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.length).toBeGreaterThan(50)
    })
  })

  describe('faqData', () => {
    it('has FAQ entries for schema markup', () => {
      expect(Array.isArray(faqData)).toBe(true)
      expect(faqData.length).toBeGreaterThan(3)
    })

    it('each FAQ has question and answer', () => {
      faqData.forEach((faq) => {
        expect(faq.question).toBeDefined()
        expect(faq.answer).toBeDefined()
        expect(faq.question.endsWith('?')).toBe(true)
      })
    })
  })

  describe('byline', () => {
    it('renders author byline with updated date', () => {
      renderPage()
      expect(screen.getByText(/Updated February 23, 2026/i)).toBeInTheDocument()
    })
  })

  describe('page content', () => {
    it('renders the main heading', () => {
      renderPage()
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    it('has TL;DR section (answer-first)', () => {
      renderPage()
      expect(
        screen.getByText(/TL;DR|Key Takeaway|Quick Answer/i)
      ).toBeInTheDocument()
    })

    it('has navigation back to resources', () => {
      renderPage()
      expect(screen.getByText(/Back to Resources/i)).toBeInTheDocument()
    })

    it('has CTA to get started', () => {
      renderPage()
      expect(
        screen.getByRole('link', {
          name: /Get Started|Try CapVeri|Start Free/i,
        })
      ).toBeInTheDocument()
    })
  })

  describe('GEO optimization', () => {
    it('has H2 headings as questions for AI extraction', () => {
      renderPage()
      const headings = screen.getAllByRole('heading', { level: 2 })
      const questionHeadings = headings.filter((h) =>
        h.textContent?.includes('?')
      )
      expect(questionHeadings.length).toBeGreaterThan(0)
    })

    it('has FAQ section', () => {
      renderPage()
      expect(
        screen.getByText(/Frequently Asked Questions|FAQ/i)
      ).toBeInTheDocument()
    })

    it('renders FAQ content', () => {
      renderPage()
      // At least the first FAQ question should be rendered
      expect(screen.getByText(faqData[0].question)).toBeInTheDocument()
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
    it('has proper heading hierarchy', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      const h2s = screen.getAllByRole('heading', { level: 2 })

      expect(h1).toBeInTheDocument()
      expect(h2s.length).toBeGreaterThan(0)
    })
  })
})
