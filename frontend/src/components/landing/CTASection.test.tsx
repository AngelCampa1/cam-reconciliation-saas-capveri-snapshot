/**
 * Tests for CTASection component
 *
 * Following test minimalism: Test behavior and navigation, not styling.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CTASection } from './CTASection'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('CTASection', () => {
  it('renders headline and description', () => {
    render(<CTASection />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/Reconcile CAM Before You Bill Tenants/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Run your CAM check before statements go out/i)
    ).toBeInTheDocument()
  })

  it('renders primary CTA button with correct link', () => {
    render(<CTASection />, { wrapper: RouterWrapper })

    const primaryCTA = screen.getByRole('link', {
      name: /Start Free Trial/i,
    })
    expect(primaryCTA).toBeInTheDocument()
    expect(primaryCTA).toHaveAttribute('href', '/auth/register')
  })

  it('does not render secondary "Get Started" button', () => {
    render(<CTASection />, { wrapper: RouterWrapper })

    expect(
      screen.queryByRole('link', { name: /Get Started/i })
    ).not.toBeInTheDocument()
  })

  it('does not render clarifying subtext', () => {
    render(<CTASection />, { wrapper: RouterWrapper })

    expect(
      screen.queryByText(/Start with our risk-free audit/i)
    ).not.toBeInTheDocument()
  })

  it('renders all trust indicators', () => {
    render(<CTASection />, { wrapper: RouterWrapper })

    expect(
      screen.getAllByText(/No card to start/i).length
    ).toBeGreaterThanOrEqual(1)

    expect(
      screen.getAllByText(/Many runs finish in minutes/i).length
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText(/30-day free trial/i).length
    ).toBeGreaterThanOrEqual(1)
  })

  it('does not render "No findings, no charge" claim', () => {
    render(<CTASection />, { wrapper: RouterWrapper })

    expect(
      screen.queryByText(/No findings, no charge/i)
    ).not.toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(<CTASection className="custom-class" />, {
      wrapper: RouterWrapper,
    })

    const section = container.querySelector('section')
    expect(section).toHaveClass('custom-class')
  })
})
