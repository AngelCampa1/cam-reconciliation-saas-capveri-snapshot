/**
 * SEO regression tests for WhatIsCamReconciliationPage
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock layout components that pull in auth/supabase dependencies
vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => null,
}))
vi.mock('@/components/layout/Footer', () => ({
  Footer: () => null,
}))

import { WhatIsCamReconciliationPage } from '../WhatIsCamReconciliation'

describe('WhatIsCamReconciliationPage schema', () => {
  it('includes Article schema alongside FAQPage', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    expect(schemas.some((s) => s['@type'] === 'Article')).toBe(true)
    expect(schemas.some((s) => s['@type'] === 'FAQPage')).toBe(true)
  })

  it('FAQPage does not have author or datePublished', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    const faq = schemas.find((s) => s['@type'] === 'FAQPage')
    expect(faq).toBeDefined()
    expect(faq.author).toBeUndefined()
    expect(faq.datePublished).toBeUndefined()
  })

  it('Article schema uses www url', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    const article = schemas.find((s) => s['@type'] === 'Article')
    expect(article).toBeDefined()
    expect(article.url).toBe(
      'https://www.capveri.com/resources/what-is-cam-reconciliation'
    )
  })

  it('includes BreadcrumbList schema', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    const breadcrumb = schemas.find((s) => s['@type'] === 'BreadcrumbList')
    expect(breadcrumb).toBeDefined()
    expect(breadcrumb.itemListElement[0].item).toBe('https://www.capveri.com')
    expect(breadcrumb.itemListElement[1].item).toContain('/resources')
  })
})

describe('WhatIsCamReconciliationPage navigation', () => {
  it('back link navigates to /resources', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    const backLink = screen.getByText(/back to resources/i).closest('a')
    expect(backLink).toHaveAttribute('href', '/resources')
  })
})

describe('WhatIsCamReconciliationPage SEO', () => {
  it('does not produce a double-brand title', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    // SEO component appends "| CapVeri" — the old title already had "| CapVeri"
    // which produced "... | CapVeri | CapVeri"
    expect(document.title).not.toMatch(/\| CapVeri \| CapVeri\.io/)
  })

  it('does not frame the page as being for commercial tenants', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    expect(document.title).not.toContain('for Commercial Tenants')
  })

  it('targets property managers or landlords in the title', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    expect(document.title).toMatch(/Property Managers|Landlords/i)
  })

  it('h1 targets property managers, not commercial tenants', () => {
    render(
      <MemoryRouter>
        <WhatIsCamReconciliationPage />
      </MemoryRouter>
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).not.toMatch(/Commercial Tenants/i)
    expect(h1.textContent).toMatch(/Property Managers|Landlords/i)
  })
})
