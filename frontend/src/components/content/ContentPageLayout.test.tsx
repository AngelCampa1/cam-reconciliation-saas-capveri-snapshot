import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { ContentPageLayout } from './ContentPageLayout'

vi.mock('@/components/SEO', () => ({
  SEO: ({
    title,
    description,
    canonical,
    structuredData,
  }: {
    title: string
    description: string
    canonical?: string
    structuredData?: unknown
  }) => (
    <div
      data-testid="seo"
      data-title={title}
      data-description={description}
      data-canonical={canonical}
      data-structured={JSON.stringify(structuredData)}
    />
  ),
}))

vi.mock('@/components/landing/LandingNav', () => ({
  LandingNav: () => <nav data-testid="landing-nav">Nav</nav>,
}))

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}))

const renderLayout = (props = {}) =>
  render(
    <BrowserRouter>
      <ContentPageLayout
        title="Test Page Title | CapVeri"
        description="Test meta description for the page."
        canonical="/resources/test-page"
        pageName="Test Page"
        {...props}
      >
        <p>Child content</p>
      </ContentPageLayout>
    </BrowserRouter>
  )

describe('ContentPageLayout', () => {
  it('renders children', () => {
    renderLayout()
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders SEO component with correct props', () => {
    renderLayout()
    const seo = screen.getByTestId('seo')
    expect(seo).toHaveAttribute('data-title', 'Test Page Title | CapVeri')
    expect(seo).toHaveAttribute(
      'data-description',
      'Test meta description for the page.'
    )
    expect(seo).toHaveAttribute('data-canonical', '/resources/test-page')
  })

  it('renders SEO with structuredData when provided', () => {
    const schema = { '@type': 'FAQPage', mainEntity: [] }
    renderLayout({ structuredData: schema })
    const seo = screen.getByTestId('seo')
    expect(JSON.parse(seo.getAttribute('data-structured') ?? '{}')).toEqual(
      schema
    )
  })

  it('renders LandingNav', () => {
    renderLayout()
    expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
  })

  it('renders Footer', () => {
    renderLayout()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('renders breadcrumb with Home, Resources, and pageName', () => {
    renderLayout()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Resources')).toBeInTheDocument()
    expect(screen.getByText('Test Page')).toBeInTheDocument()
  })

  it('breadcrumb Home links to /', () => {
    renderLayout()
    const homeLink = screen.getByRole('link', { name: 'Home' })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('breadcrumb Resources links to /resources', () => {
    renderLayout()
    const resourcesLink = screen.getByRole('link', { name: 'Resources' })
    expect(resourcesLink).toHaveAttribute('href', '/resources')
  })

  it('renders back navigation link to /resources', () => {
    renderLayout()
    const backLink = screen.getByRole('link', { name: /back to resources/i })
    expect(backLink).toHaveAttribute('href', '/resources')
  })
})
