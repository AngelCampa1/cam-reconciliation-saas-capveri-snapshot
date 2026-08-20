/**
 * Tests for ResourcesHub page — /resources
 * TDD: Written before the component exists — all 4 should fail until implemented
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

import { ResourcesHub } from '../ResourcesHub'

describe('ResourcesHub', () => {
  it('renders resources hub heading', () => {
    render(
      <MemoryRouter>
        <ResourcesHub />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('links to all resource articles', () => {
    render(
      <MemoryRouter>
        <ResourcesHub />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('link', { name: /what is cam reconciliation/i })
    ).toHaveAttribute('href', '/resources/what-is-cam-reconciliation')
    expect(screen.getByRole('link', { name: /boma 2024/i })).toHaveAttribute(
      'href',
      '/resources/boma-2024-changes'
    )
    expect(
      screen.getByRole('link', { name: /presend checklist/i })
    ).toHaveAttribute('href', '/resources/cam-presend-checklist')
    expect(
      screen.getByRole('link', { name: /tenant auditor/i })
    ).toHaveAttribute('href', '/resources/tenant-auditor-guide')
    expect(screen.getByRole('link', { name: /gl coding/i })).toHaveAttribute(
      'href',
      '/resources/gl-coding-guide'
    )
    expect(
      screen.getByRole('link', { name: /cam reconciliation errors/i })
    ).toHaveAttribute('href', '/resources/cam-reconciliation-errors')
  })

  it('sets page title with Resources keyword', () => {
    render(
      <MemoryRouter>
        <ResourcesHub />
      </MemoryRouter>
    )
    expect(document.title).toContain('Resources')
    expect(document.title).toContain('CapVeri')
  })

  it('sets canonical URL to /resources', () => {
    render(
      <MemoryRouter>
        <ResourcesHub />
      </MemoryRouter>
    )
    const canonical = document.querySelector('link[rel="canonical"]')
    expect(canonical).toHaveAttribute(
      'href',
      'https://www.capveri.com/resources'
    )
  })

  it('renders Harris County Gross-Up resource card', () => {
    render(
      <MemoryRouter>
        <ResourcesHub />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('link', { name: /harris county/i })
    ).toHaveAttribute('href', '/resources/harris-county-gross-up')
  })
})
