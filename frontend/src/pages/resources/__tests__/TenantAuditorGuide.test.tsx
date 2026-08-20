/**
 * SEO tests for TenantAuditorGuidePage
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

import { screen } from '@testing-library/react'
import { TenantAuditorGuidePage } from '../TenantAuditorGuide'

describe('TenantAuditorGuidePage SEO', () => {
  it('uses www in Article schema url', () => {
    render(
      <MemoryRouter>
        <TenantAuditorGuidePage />
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

  it('back link navigates to /resources', () => {
    render(
      <MemoryRouter>
        <TenantAuditorGuidePage />
      </MemoryRouter>
    )
    const backLink = screen.getByText(/back to resources/i).closest('a')
    expect(backLink).toHaveAttribute('href', '/resources')
  })

  it('includes BreadcrumbList schema', () => {
    render(
      <MemoryRouter>
        <TenantAuditorGuidePage />
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
