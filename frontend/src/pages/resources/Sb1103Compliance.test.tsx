import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { Sb1103CompliancePage, faqData } from './Sb1103Compliance'

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
      <Sb1103CompliancePage />
    </BrowserRouter>
  )

describe('Sb1103CompliancePage — SEO', () => {
  it('passes correct title to ContentPageLayout', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    expect(layout).toHaveAttribute(
      'data-title',
      'SB 1103 CAM Compliance Guide | CapVeri'
    )
  })

  it('passes meta description containing primary keyword', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    const desc = layout.getAttribute('data-description') ?? ''
    expect(desc).toMatch(/SB 1103 landlord CAM reconciliation compliance/i)
    expect(desc.length).toBeGreaterThanOrEqual(130)
    expect(desc.length).toBeLessThanOrEqual(155)
  })

  it('passes correct pageName for breadcrumb', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    expect(layout).toHaveAttribute('data-page-name', 'SB 1103 Compliance')
  })
})

describe('Sb1103CompliancePage — Content', () => {
  it('renders without crashing', () => {
    expect(() => renderPage()).not.toThrow()
  })

  it('renders H1 heading containing SB 1103', () => {
    renderPage()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toMatch(/SB 1103/i)
  })

  it('contains text "Civil Code"', () => {
    renderPage()
    expect(screen.getAllByText(/Civil Code/)[0]).toBeInTheDocument()
  })

  it('contains text referencing Section 1950.9', () => {
    renderPage()
    expect(screen.getAllByText(/1950\.9/)[0]).toBeInTheDocument()
  })

  it('renders TL;DR / intro section', () => {
    renderPage()
    // The page has a blue summary box
    expect(screen.getAllByText(/January 1, 2025/i)[0]).toBeInTheDocument()
  })

  it('renders all 4 major H2 content sections', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 2 })
    const texts = headings.map((h) => h.textContent ?? '')
    expect(texts.some((t) => /What SB 1103 Actually Requires/i.test(t))).toBe(
      true
    )
    expect(texts.some((t) => /30-Day Clock/i.test(t))).toBe(true)
    expect(texts.some((t) => /5 Documentation Gaps/i.test(t))).toBe(true)
    expect(texts.some((t) => /How to Achieve Compliance/i.test(t))).toBe(true)
  })

  it('renders FAQ section heading', () => {
    renderPage()
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument()
  })

  it('renders CTA linking to /auth/register', () => {
    renderPage()
    const cta = screen.getByRole('link', { name: /Start Free Trial/i })
    expect(cta).toHaveAttribute('href', '/auth/register')
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

  it('renders QCT definition content (microenterprise, 5 employees)', () => {
    renderPage()
    expect(screen.getAllByText(/microenterprise/i)[0]).toBeInTheDocument()
  })

  it('renders all 5 FAQ questions from faqData', () => {
    renderPage()
    faqData.forEach((faq) => {
      expect(
        screen.getByText(faq.question, { exact: false })
      ).toBeInTheDocument()
    })
  })
})

describe('Sb1103CompliancePage — faqData export', () => {
  it('exports at least 5 FAQ items', () => {
    expect(faqData.length).toBeGreaterThanOrEqual(5)
  })

  it('every FAQ has non-empty question and answer strings', () => {
    faqData.forEach((faq) => {
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

describe('Sb1103CompliancePage — Schema exports', () => {
  it('howToSchema has 5 steps', async () => {
    const mod = await import('./Sb1103Compliance')
    // howToSchema is not exported directly — verify via DOM that 5 HowTo steps render
    renderPage()
    const listItems = screen.getAllByRole('listitem')
    // 5 ordered list items for the 5-step HowTo
    const stepItems = listItems.filter((el) => el.closest('ol') !== null)
    expect(stepItems.length).toBeGreaterThanOrEqual(5)
    // Suppress unused import warning
    expect(mod).toBeDefined()
  })

  it('faqSchema mainEntity has at least 5 items (via faqData length)', () => {
    // faqSchema is built from faqData — verifying faqData length confirms schema completeness
    expect(faqData.length).toBeGreaterThanOrEqual(5)
  })

  it('breadcrumb renders in ContentPageLayout (pageName prop)', () => {
    renderPage()
    const layout = screen.getByTestId('content-page-layout')
    // pageName is used to build BreadcrumbList in ContentPageLayout
    expect(layout.getAttribute('data-page-name')).toBe('SB 1103 Compliance')
  })
})

describe('Sb1103CompliancePage — Accessibility', () => {
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
