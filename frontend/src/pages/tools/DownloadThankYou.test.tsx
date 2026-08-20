/**
 * Tests for DownloadThankYou page
 *
 * Covers brand name correctness (Bug #5) and core page content.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DownloadThankYou } from './DownloadThankYou'

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ slug: 'cam-gross-up-calculator' }),
  }
})

// The thank-you page is only meaningful after the lead form is submitted,
// which navigates here with { state: { leadCaptured: true } }. Render with
// that state so the confirmation content is shown.
const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/tools/cam-gross-up-calculator/thank-you',
          state: { leadCaptured: true },
        },
      ]}
    >
      <DownloadThankYou />
    </MemoryRouter>
  )

// Render without navigation state to exercise the direct-visit guard.
const renderDirectVisit = () =>
  render(
    <MemoryRouter initialEntries={['/tools/cam-gross-up-calculator/thank-you']}>
      <DownloadThankYou />
    </MemoryRouter>
  )

describe('DownloadThankYou', () => {
  describe('brand name (Bug #5)', () => {
    it('page title contains "CapVeri"', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      expect(layout.dataset.title).toContain('CapVeri')
    })

    it('body copy says "CapVeri automates"', () => {
      renderPage()
      expect(screen.getByText(/CapVeri automates/i)).toBeInTheDocument()
    })
  })

  describe('page content', () => {
    it('renders "Check your email" heading', () => {
      renderPage()
      expect(
        screen.getByRole('heading', { name: /check your email/i })
      ).toBeInTheDocument()
    })

    it('shows the asset name from slug', () => {
      renderPage()
      expect(
        screen.getByText(/CAM Gross-Up Scenario Calculator/i)
      ).toBeInTheDocument()
    })

    it('renders Start Free Trial CTA linking to /auth/register', () => {
      renderPage()
      const cta = screen.getByRole('link', { name: /start free trial/i })
      expect(cta).toHaveAttribute('href', '/auth/register')
    })
  })

  describe('direct-visit guard', () => {
    it('does not show confirmation content when arriving without lead-capture state', () => {
      renderDirectVisit()
      expect(
        screen.queryByRole('heading', { name: /check your email/i })
      ).not.toBeInTheDocument()
    })
  })
})
