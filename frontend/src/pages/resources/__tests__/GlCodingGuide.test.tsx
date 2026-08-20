/**
 * SEO tests for GlCodingGuidePage
 */

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { buildSiteUrl } from '@/lib/domains'

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => null,
}))
vi.mock('@/components/layout/Footer', () => ({
  Footer: () => null,
}))

import { GlCodingGuidePage } from '../GlCodingGuide'

describe('GlCodingGuidePage SEO', () => {
  it('uses www in Article schema url', () => {
    render(
      <MemoryRouter>
        <GlCodingGuidePage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemaText = Array.from(scripts)
      .map((s) => s.textContent)
      .join('')
    expect(schemaText).toContain('https://www.capveri.com/')
    expect(schemaText).not.toContain('"https://capveri.com/')
  })

  it('includes BreadcrumbList schema', () => {
    render(
      <MemoryRouter>
        <GlCodingGuidePage />
      </MemoryRouter>
    )
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!))
    const breadcrumb = schemas.find((s) => s['@type'] === 'BreadcrumbList')
    expect(breadcrumb).toBeDefined()
    expect(breadcrumb.itemListElement[0].item).toBe(buildSiteUrl('/'))
    expect(breadcrumb.itemListElement[1].item).toContain('/resources')
  })
})
