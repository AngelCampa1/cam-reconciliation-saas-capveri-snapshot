/**
 * Breadcrumb schema test for YardiComparisonPage (real SEO component)
 */

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => null,
}))
vi.mock('@/components/layout/Footer', () => ({
  Footer: () => null,
}))

import { YardiComparisonPage } from './YardiComparison'

describe('YardiComparisonPage breadcrumb schema', () => {
  it('includes BreadcrumbList schema', () => {
    render(
      <MemoryRouter>
        <YardiComparisonPage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    const breadcrumb = schemas.find((s) => s['@type'] === 'BreadcrumbList')
    expect(breadcrumb).toBeDefined()
    expect(breadcrumb.itemListElement[0].item).toBe('https://www.capveri.com')
    expect(breadcrumb.itemListElement[1].item).toContain('/vs')
  })
})

describe('YardiComparisonPage FAQPage schema', () => {
  it('injects FAQPage JSON-LD with exactly 5 mainEntity questions', () => {
    render(
      <MemoryRouter>
        <YardiComparisonPage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    const faqPage = schemas.find((s) => s['@type'] === 'FAQPage')
    expect(faqPage).toBeDefined()
    expect(faqPage.mainEntity).toHaveLength(5)
    // Spot-check: configuration drift question must be present
    const hasDriftQuestion = faqPage.mainEntity.some((q: { name: string }) =>
      /configuration drift/i.test(q.name)
    )
    expect(hasDriftQuestion).toBe(true)
  })
})
