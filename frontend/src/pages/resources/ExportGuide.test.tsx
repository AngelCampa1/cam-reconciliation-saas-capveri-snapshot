/**
 * Tests for the /resources/export-guide SEO page.
 *
 * Written BEFORE implementation (TDD red phase).
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ExportGuidePage } from './ExportGuide'

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
    canonical,
  }: {
    title: string
    description: string
    canonical?: string
  }) => (
    <div
      data-testid="seo"
      data-title={title}
      data-description={description}
      data-canonical={canonical}
    />
  ),
  structuredDataSchemas: {
    breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url.startsWith('http')
          ? item.url
          : `https://www.capveri.com${item.url}`,
      })),
    }),
  },
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <ExportGuidePage />
    </BrowserRouter>
  )

describe('ExportGuidePage', () => {
  describe('SEO', () => {
    it('renders with correct title containing Yardi and MRI keywords', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.title).toContain('Yardi')
      expect(seo.dataset.title).toContain('MRI')
    })

    it('renders meta description >= 130 chars', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.description?.length).toBeGreaterThanOrEqual(130)
    })

    it('sets canonical to /resources/export-guide', () => {
      renderPage()
      const seo = screen.getByTestId('seo')
      expect(seo.dataset.canonical).toBe('/resources/export-guide')
    })
  })

  describe('Navigation', () => {
    it('renders LandingNav', () => {
      renderPage()
      expect(screen.getByTestId('landing-nav')).toBeInTheDocument()
    })

    it('renders Footer', () => {
      renderPage()
      expect(screen.getByTestId('footer')).toBeInTheDocument()
    })
  })

  describe('Section headings', () => {
    it('renders Rent Roll section heading', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /rent roll/i })
      ).toBeInTheDocument()
    })

    it('renders GL Export section heading', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /gl export/i })
      ).toBeInTheDocument()
    })

    it('renders CAM Billed section heading', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /cam billed/i })
      ).toBeInTheDocument()
    })
  })

  describe('System tabs', () => {
    it('renders all four system tabs in the Rent Roll section', () => {
      renderPage()
      // All tabs should be present — using getAllByRole since tabs repeat per section
      const yardiTabs = screen.getAllByRole('tab', { name: /yardi/i })
      expect(yardiTabs.length).toBeGreaterThanOrEqual(1)
      const mriTabs = screen.getAllByRole('tab', { name: /mri/i })
      expect(mriTabs.length).toBeGreaterThanOrEqual(1)
      const appfolioTabs = screen.getAllByRole('tab', { name: /appfolio/i })
      expect(appfolioTabs.length).toBeGreaterThanOrEqual(1)
      const realpageTabs = screen.getAllByRole('tab', { name: /realpage/i })
      expect(realpageTabs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('CTA', () => {
    it('renders a link to /auth/register', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /start free trial/i })
      expect(link).toHaveAttribute('href', '/auth/register')
    })

    it('frames billed exports as bill issues instead of leakage', () => {
      renderPage()
      expect(screen.getByText(/flags bill rows/i)).toBeInTheDocument()
      expect(screen.getByText(/review bill issues/i)).toBeInTheDocument()
      expect(screen.queryByText(/surface leakage/i)).not.toBeInTheDocument()
      expect(
        screen.queryByText(/where leakage is happening/i)
      ).not.toBeInTheDocument()
    })
  })
})
