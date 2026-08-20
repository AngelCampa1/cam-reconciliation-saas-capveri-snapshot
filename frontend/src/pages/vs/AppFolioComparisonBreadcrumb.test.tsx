/**
 * Breadcrumb schema test for AppFolioComparisonPage (real SEO component)
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

import { AppFolioComparisonPage } from './AppFolioComparison'

describe('AppFolioComparisonPage breadcrumb schema', () => {
  it('includes BreadcrumbList schema', () => {
    render(
      <MemoryRouter>
        <AppFolioComparisonPage />
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
