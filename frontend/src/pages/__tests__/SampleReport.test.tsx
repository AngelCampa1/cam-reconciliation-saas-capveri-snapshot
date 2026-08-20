/**
 * SEO tests for SampleReportPage
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

import { SampleReportPage } from '../SampleReport'

describe('SampleReportPage structured data', () => {
  it('renders WebPage structured data', () => {
    render(
      <MemoryRouter>
        <SampleReportPage />
      </MemoryRouter>
    )
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const schema = JSON.parse(script!.textContent!)
    expect(schema['@type']).toBe('WebPage')
    expect(schema.url).toBe('https://www.capveri.com/sample-report')
  })

  it('WebPage schema has name and description', () => {
    render(
      <MemoryRouter>
        <SampleReportPage />
      </MemoryRouter>
    )
    const script = document.querySelector('script[type="application/ld+json"]')
    const schema = JSON.parse(script!.textContent!)
    expect(schema.name).toBeDefined()
    expect(schema.description).toBeDefined()
    expect(schema.description).toContain('check tenant billing')
    expect(schema.description).not.toContain('recover lost revenue')
    expect(schema.datePublished).toBe('2026-02-23')
  })

  it('frames the sample report as neutral statement checking', () => {
    const { container } = render(
      <MemoryRouter>
        <SampleReportPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Billing exposure checked')).toBeInTheDocument()
    expect(
      screen.getByText('Items flagged across 12 buildings')
    ).toBeInTheDocument()
    expect(screen.getByText('Statement packets prepared')).toBeInTheDocument()
    expect(screen.getByText('Review before sending')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/recover lost revenue/i)
    expect(container.textContent).not.toMatch(/return on investment/i)
    expect(container.textContent).not.toMatch(/recoverable revenue/i)
  })
})
