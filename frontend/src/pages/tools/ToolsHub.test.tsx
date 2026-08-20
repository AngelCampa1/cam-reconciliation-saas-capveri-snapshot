/**
 * Tests for ToolsHub page
 *
 * Covers brand name correctness (Bug #5) and core page content.
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToolsHub } from './ToolsHub'

vi.mock('@/components/content/ToolPageLayout', () => ({
  ToolPageLayout: ({
    children,
    title,
  }: {
    children: React.ReactNode
    title: string
  }) => (
    <div data-testid="tool-page-layout" data-title={title}>
      {children}
    </div>
  ),
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <ToolsHub />
    </BrowserRouter>
  )

describe('ToolsHub', () => {
  describe('brand name (Bug #5)', () => {
    it('page title contains "CapVeri"', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      expect(layout.dataset.title).toContain('CapVeri')
    })
  })

  describe('page content', () => {
    it('renders h1 for free tools', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toContain('Free Tools for Property Controllers')
    })

    it('renders BOMA 2024 calculator card', () => {
      renderPage()
      expect(
        screen.getByText(/BOMA 2024 Rentable Area Calculator/i)
      ).toBeInTheDocument()
    })

    it('renders CAM Gross-Up calculator card', () => {
      renderPage()
      expect(
        screen.getByText(/CAM Gross-Up Scenario Calculator/i)
      ).toBeInTheDocument()
    })

    it('renders the HCAD normalizer with tax-adjustment framing', () => {
      renderPage()
      expect(
        screen.getByText(/HCAD Tax Base Year Normalizer/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/Calculate Tax Adjustment/i)).toBeInTheDocument()
      expect(
        screen.getByText(/tax adjustment and lease-cap effect/i)
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/recover from tenants/i)
      ).not.toBeInTheDocument()
    })

    it('renders the CAM Audit Risk Score quiz card linking to its page', () => {
      renderPage()
      expect(screen.getByText(/CAM Audit Risk Score/i)).toBeInTheDocument()
      const link = screen
        .getAllByRole('link')
        .find((l) => l.getAttribute('href') === '/tools/audit-risk-quiz')
      expect(link).toBeDefined()
    })

    it('renders the CAM Billing Risk Estimator card linking to its page', () => {
      renderPage()
      expect(
        screen.getByText(/CAM Billing Risk Estimator/i)
      ).toBeInTheDocument()
      const link = screen
        .getAllByRole('link')
        .find((l) => l.getAttribute('href') === '/tools/cam-leakage-estimator')
      expect(link).toBeDefined()
    })

    it('renders links to individual tool pages', () => {
      renderPage()
      const links = screen.getAllByRole('link')
      const toolLinks = links.filter((l) =>
        l.getAttribute('href')?.startsWith('/tools/')
      )
      expect(toolLinks.length).toBeGreaterThanOrEqual(2)
    })
  })
})
