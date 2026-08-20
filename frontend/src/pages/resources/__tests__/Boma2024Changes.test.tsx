/**
 * SEO tests for Boma2024ChangesPage
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => null,
}))
vi.mock('@/components/layout/Footer', () => ({
  Footer: () => null,
}))

import { Boma2024ChangesPage } from '../Boma2024Changes'

describe('Boma2024ChangesPage navigation', () => {
  it('back link navigates to /resources', () => {
    render(
      <MemoryRouter>
        <Boma2024ChangesPage />
      </MemoryRouter>
    )
    const backLink = screen.getByText(/back to resources/i).closest('a')
    expect(backLink).toHaveAttribute('href', '/resources')
  })
})

describe('Boma2024ChangesPage SEO', () => {
  it('uses www in Article schema url', () => {
    render(
      <MemoryRouter>
        <Boma2024ChangesPage />
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

  it('uses uppercase CAM in description', () => {
    render(
      <MemoryRouter>
        <Boma2024ChangesPage />
      </MemoryRouter>
    )
    const meta = document.querySelector('meta[name="description"]')
    expect(meta?.getAttribute('content')).not.toContain(' cam ')
    expect(meta?.getAttribute('content')).toContain(' CAM ')
  })

  it('includes BreadcrumbList schema', () => {
    render(
      <MemoryRouter>
        <Boma2024ChangesPage />
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
