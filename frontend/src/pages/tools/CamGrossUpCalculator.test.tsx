/**
 * Tests for CAM Gross-Up Scenario Calculator tool page
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CamGrossUpCalculator } from './CamGrossUpCalculator'

// Mock ToolPageLayout capturing structuredData
vi.mock('@/components/content/ToolPageLayout', () => ({
  ToolPageLayout: ({
    children,
    title,
    structuredData,
  }: {
    children: React.ReactNode
    title: string
    structuredData?: unknown
  }) => (
    <div
      data-testid="tool-page-layout"
      data-title={title}
      data-structured-data={JSON.stringify(structuredData ?? null)}
    >
      {children}
    </div>
  ),
}))

// Mock analytics
const mockTrackEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}))

// Mock LeadCaptureForm
vi.mock('@/components/lead-capture/LeadCaptureForm', () => ({
  LeadCaptureForm: ({ ctaLabel }: { ctaLabel: string }) => (
    <button data-testid="lead-capture-form">{ctaLabel}</button>
  ),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const renderPage = () =>
  render(
    <BrowserRouter>
      <CamGrossUpCalculator />
    </BrowserRouter>
  )

describe('CamGrossUpCalculator', () => {
  describe('structured data / schema', () => {
    it('passes an array of 2 schemas as structuredData', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(Array.isArray(schemas)).toBe(true)
      expect(schemas).toHaveLength(2)
    })

    it('first schema @type is SoftwareApplication', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      const appSchema = schemas[0]
      expect(appSchema['@type']).toBe('SoftwareApplication')
    })

    it('SoftwareApplication schema has correct name', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[0].name).toBe('CAM Gross-Up Scenario Calculator')
    })

    it('SoftwareApplication schema is free (price 0)', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[0].offers?.price).toBe('0')
    })

    it('second schema @type is HowTo', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[1]['@type']).toBe('HowTo')
    })

    it('HowTo schema has 4 steps', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[1].step).toHaveLength(4)
    })

    it('HowTo steps are in correct sequence', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      const steps = schemas[1].step
      expect(steps[0].position).toBe(1)
      expect(steps[1].position).toBe(2)
      expect(steps[2].position).toBe(3)
      expect(steps[3].position).toBe(4)
    })
  })

  describe('page content', () => {
    it('H1 contains "CAM Gross-Up"', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toContain('CAM Gross-Up')
    })

    it('renders all 4 benefit items', () => {
      renderPage()
      expect(screen.getByText(/85%.*90%.*95%.*100%/i)).toBeInTheDocument()
    })

    it('renders lead capture form with Download CTA', () => {
      renderPage()
      expect(screen.getByTestId('lead-capture-form')).toBeInTheDocument()
      expect(screen.getByText(/Download Free Calculator/i)).toBeInTheDocument()
    })

    it('renders "What\'s inside" section heading', () => {
      renderPage()
      expect(screen.getByText(/What.s inside/i)).toBeInTheDocument()
    })

    it('has login cross-link', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /log in/i })
      expect(link).toHaveAttribute('href', '/auth/login')
    })
  })

  describe('brand name (Bug #5)', () => {
    it('page title contains "CapVeri"', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      expect(layout.dataset.title).toContain('CapVeri')
    })
  })

  describe('analytics', () => {
    it('fires tool_page_view on mount', () => {
      renderPage()
      expect(mockTrackEvent).toHaveBeenCalledWith('tool_page_view', {
        slug: 'cam-gross-up-calculator',
      })
    })

    it('fires lead_form_view on mount', () => {
      renderPage()
      expect(mockTrackEvent).toHaveBeenCalledWith('lead_form_view', {
        slug: 'cam-gross-up-calculator',
      })
    })
  })
})
