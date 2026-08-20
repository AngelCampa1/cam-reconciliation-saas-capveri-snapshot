/**
 * Tests for ToolPageLayout shared wrapper component
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToolPageLayout } from './ToolPageLayout'

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => <nav data-testid="landing-nav">Nav</nav>,
}))

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}))

vi.mock('@/components/SEO', () => ({
  SEO: ({
    title,
    description,
    structuredData,
  }: {
    title: string
    description: string
    structuredData?: unknown
  }) => (
    <div
      data-testid="seo"
      data-title={title}
      data-description={description}
      data-structured-data={JSON.stringify(structuredData ?? null)}
    />
  ),
}))

const defaultProps = {
  title: 'Test Tool Title',
  description: 'Test tool description for SEO',
  canonical: '/tools/test-tool',
  toolName: 'Test Tool',
}

const renderLayout = (children = <div>Tool content</div>) =>
  render(
    <BrowserRouter>
      <ToolPageLayout {...defaultProps}>{children}</ToolPageLayout>
    </BrowserRouter>
  )

describe('ToolPageLayout', () => {
  it('renders children', () => {
    renderLayout(<div data-testid="child-content">Child content</div>)
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders breadcrumb with correct toolName', () => {
    renderLayout()
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Test Tool')).toBeInTheDocument()
  })

  it('renders LandingNav', () => {
    renderLayout()
    expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
  })

  it('renders Footer', () => {
    renderLayout()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('passes title and description to SEO', () => {
    renderLayout()
    const seo = screen.getByTestId('seo')
    expect(seo.dataset.title).toBe('Test Tool Title')
    expect(seo.dataset.description).toBe('Test tool description for SEO')
  })

  describe('structured data', () => {
    it('passes default SoftwareApplication schema when no structuredData prop', () => {
      renderLayout()
      const seo = screen.getByTestId('seo')
      const schema = JSON.parse(seo.dataset.structuredData ?? 'null')
      expect(schema?.['@type']).toBe('SoftwareApplication')
      expect(schema?.name).toBe('Test Tool')
      expect(schema?.offers?.price).toBe('0')
    })

    it('passes custom structuredData override when provided as object', () => {
      const custom = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Custom Tool',
      }
      render(
        <BrowserRouter>
          <ToolPageLayout {...defaultProps} structuredData={custom}>
            <div />
          </ToolPageLayout>
        </BrowserRouter>
      )
      const seo = screen.getByTestId('seo')
      const schema = JSON.parse(seo.dataset.structuredData ?? 'null')
      expect(schema?.['@type']).toBe('WebApplication')
      expect(schema?.name).toBe('Custom Tool')
    })

    it('passes array structuredData override when provided as array', () => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Tool',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to use Tool',
          step: [],
        },
      ]
      render(
        <BrowserRouter>
          <ToolPageLayout {...defaultProps} structuredData={schemas}>
            <div />
          </ToolPageLayout>
        </BrowserRouter>
      )
      const seo = screen.getByTestId('seo')
      const parsed = JSON.parse(seo.dataset.structuredData ?? 'null')
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0]['@type']).toBe('WebApplication')
      expect(parsed[1]['@type']).toBe('HowTo')
    })
  })
})
