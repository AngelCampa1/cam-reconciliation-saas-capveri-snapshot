import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { HarrisCountyGrossUpPage, faqData } from './HarrisCountyGrossUp'

vi.mock('@/components/content/ContentPageLayout', () => ({
  ContentPageLayout: ({
    children,
    title,
    description,
    pageName,
  }: {
    children: React.ReactNode
    title: string
    description: string
    pageName: string
  }) => (
    <div
      data-testid="content-page-layout"
      data-title={title}
      data-description={description}
      data-page-name={pageName}
    >
      {children}
    </div>
  ),
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <HarrisCountyGrossUpPage />
    </BrowserRouter>
  )

describe('HarrisCountyGrossUpPage — SEO', () => {
  it('passes correct title to ContentPageLayout', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    expect(layout).toHaveAttribute(
      'data-title',
      'Harris County CAM Gross-Up Calculation'
    )
  })

  it('passes meta description with primary keyword', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    const desc = layout.getAttribute('data-description') ?? ''
    expect(desc).toMatch(/Harris County commercial lease gross up calculation/i)
    expect(desc.length).toBeGreaterThanOrEqual(130)
    expect(desc.length).toBeLessThanOrEqual(155)
  })

  it('passes correct pageName for breadcrumb', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    expect(layout).toHaveAttribute(
      'data-page-name',
      'Harris County CAM Gross-Up'
    )
  })
})

describe('HarrisCountyGrossUpPage — Content', () => {
  it('renders H1 heading', () => {
    renderPage()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/Harris County/i)
  })

  it('renders TL;DR section', () => {
    renderPage()
    expect(screen.getAllByText(/TL;DR/i)[0]).toBeInTheDocument()
  })

  it('renders all 4 major H2 sections', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 2 })
    const texts = headings.map((h) => h.textContent ?? '')
    expect(texts.some((t) => /Plain Numbers/i.test(t))).toBe(true)
    expect(texts.some((t) => /HCAD/i.test(t))).toBe(true)
    expect(texts.some((t) => /Fixed vs. Variable/i.test(t))).toBe(true)
    expect(texts.some((t) => /Step-by-Step/i.test(t))).toBe(true)
  })

  it('renders FAQ section', () => {
    renderPage()
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument()
  })

  it('renders math worked example with actual numbers', () => {
    renderPage()
    expect(screen.getAllByText(/\$174,315/)[0]).toBeInTheDocument()
  })

  it('renders cross-link to what-is-cam-reconciliation', () => {
    renderPage()
    const link = screen.getByRole('link', {
      name: /What Is CAM Reconciliation/i,
    })
    expect(link).toHaveAttribute(
      'href',
      '/resources/what-is-cam-reconciliation'
    )
  })

  it('renders cross-link to cam-gross-up-calculator tool', () => {
    renderPage()
    const link = screen.getByRole('link', { name: /CAM Gross-Up Calculator/i })
    expect(link).toHaveAttribute('href', '/tools/cam-gross-up-calculator')
  })

  it('renders CTA linking to /auth/register', () => {
    renderPage()
    const cta = screen.getByRole('link', { name: /Start Free Trial/i })
    expect(cta).toHaveAttribute('href', '/auth/register')
  })

  it('renders Houston-specific content (Energy Corridor, Galleria, HCAD)', () => {
    renderPage()
    expect(screen.getAllByText(/Energy Corridor/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/Galleria/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/HCAD/i)[0]).toBeInTheDocument()
  })
})

describe('HarrisCountyGrossUpPage — faqData', () => {
  it('exports at least 5 FAQ items', () => {
    expect(faqData.length).toBeGreaterThanOrEqual(5)
  })

  it('every FAQ has a question and answer', () => {
    faqData.forEach((faq) => {
      expect(faq.question).toBeDefined()
      expect(faq.answer).toBeDefined()
      expect(typeof faq.question).toBe('string')
      expect(typeof faq.answer).toBe('string')
      expect(faq.question.trim().length).toBeGreaterThan(0)
      expect(faq.answer.trim().length).toBeGreaterThan(0)
    })
  })

  it('every FAQ question ends with a question mark', () => {
    faqData.forEach((faq) => {
      expect(faq.question.trim()).toMatch(/\?$/)
    })
  })
})

describe('HarrisCountyGrossUpPage — Accessibility', () => {
  it('has only one H1', () => {
    renderPage()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
  })

  it('renders article element for semantic HTML', () => {
    renderPage()
    expect(screen.getByRole('article')).toBeInTheDocument()
  })
})
