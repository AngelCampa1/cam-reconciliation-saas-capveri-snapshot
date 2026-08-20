/**
 * Tests for HeroSection component
 *
 * Following test minimalism: Test behavior and user interactions, not styling.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { HeroSection } from './HeroSection'

// Wrapper for components that use React Router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('HeroSection', () => {
  it('renders headline and value proposition', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.getByText(/Reconcile CAM correctly/i)).toBeInTheDocument()
    expect(screen.getByText(/before statements go out/i)).toBeInTheDocument()
  })

  it('does not render old $20-30K range in headline', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.queryByText(/\$20-30K Per Building/i)).not.toBeInTheDocument()
  })

  it('renders subheadline with key benefits', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/CapVeri runs your full CAM reconciliation/i)
    ).toBeInTheDocument()
  })

  it('renders trust micro-copy with 30-day free trial', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.getByText(/30-day free trial/i)).toBeInTheDocument()
  })

  it('renders primary CTA button with correct link', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    const ctaButton = screen.getByRole('link', {
      name: /Start Free Trial/i,
    })
    expect(ctaButton).toBeInTheDocument()
    expect(ctaButton).toHaveAttribute('href', '/auth/register')
  })

  it('renders secondary "See how it works" CTA', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    const link = screen.getByRole('link', { name: /see how it works/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '#how-it-works')
  })

  it('does not render secondary "Get Started" button', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(
      screen.queryByRole('link', { name: /Get Started/i })
    ).not.toBeInTheDocument()
  })

  it('does not render clarifying subtext', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.queryByText(/Not sure\?/i)).not.toBeInTheDocument()
  })

  it('renders trust indicators', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.getByText(/30-day free trial/i)).toBeInTheDocument()
    expect(screen.getByText(/Many runs finish in minutes/i)).toBeInTheDocument()
    expect(
      screen.getByText(/No Yardi integration required/i)
    ).toBeInTheDocument()
  })

  it('renders BOMA 2024 alignment badge', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.getByText(/BOMA 2024 Aligned/i)).toBeInTheDocument()
  })

  it('does not render old compatibility information', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(
      screen.queryByText(/Works with exports from Yardi Voyager/i)
    ).not.toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(<HeroSection className="custom-class" />, {
      wrapper: RouterWrapper,
    })

    const section = container.querySelector('section')
    expect(section).toHaveClass('custom-class')
  })

  it('badge text is aligned not certified or compliant', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.queryByText(/BOMA 2024 Certified/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/BOMA 2024 Compliant/i)).not.toBeInTheDocument()
    expect(screen.getByText(/BOMA 2024 Aligned/i)).toBeInTheDocument()
  })

  it('trust copy avoids fixed 60-second promises', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.queryByText(/60 seconds/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Many runs finish in minutes/i)).toBeInTheDocument()
  })

  it('renders animated scroll indicator', () => {
    const { container } = render(<HeroSection />, { wrapper: RouterWrapper })

    const scrollIndicator = container.querySelector('.animate-bounce')
    expect(scrollIndicator).toBeInTheDocument()
  })

  it('renders ArrowRight icon in primary CTA button', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    const ctaButton = screen.getByRole('link', { name: /Start Free Trial/i })
    expect(ctaButton).toBeInTheDocument()
    // Button contains svg (ArrowRight icon)
    const svg = ctaButton.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders mock dashboard preview card', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    const dashboardPreview = screen.getByRole('img', {
      name: /dashboard preview/i,
    })
    expect(dashboardPreview).toBeInTheDocument()
  })

  it('renders green, yellow, blue metric cards in dashboard preview', () => {
    render(<HeroSection />, { wrapper: RouterWrapper })

    expect(screen.getByText(/Bill risk/i)).toBeInTheDocument()
    expect(screen.getByText(/Errors caught/i)).toBeInTheDocument()
    expect(screen.getByText(/Rule-based math/i)).toBeInTheDocument()
  })
})
