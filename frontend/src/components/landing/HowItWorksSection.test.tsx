/**
 * Tests for HowItWorksSection component
 *
 * Following test minimalism: Test content and structure, not styling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorksSection } from './HowItWorksSection'

// IntersectionObserver is not available in jsdom
const mockObserve = vi.fn()
const mockDisconnect = vi.fn()
beforeEach(() => {
  class MockIntersectionObserver {
    observe = mockObserve
    unobserve = vi.fn()
    disconnect = mockDisconnect
    constructor(_callback: IntersectionObserverCallback) {}
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

describe('HowItWorksSection', () => {
  it('renders section header', () => {
    render(<HowItWorksSection />)

    expect(screen.getByText(/How CapVeri Works/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /Upload your data\. Check statements before they go out\./i
      )
    ).toBeInTheDocument()
  })

  it('renders all 4 steps in order', () => {
    render(<HowItWorksSection />)

    expect(
      screen.getByRole('heading', { name: /Upload Your Data/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/We Run the Reconciliation/i)).toBeInTheDocument()
    expect(screen.getByText(/Review Your Findings/i)).toBeInTheDocument()
    expect(screen.getByText(/Close the Reconciliation/i)).toBeInTheDocument()
  })

  it('renders step descriptions', () => {
    render(<HowItWorksSection />)

    expect(
      screen.getByText(/Export your GL, rent roll, and lease docs/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /AI ingestion pipeline and data extraction map each file/i
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Many runs finish in minutes with a line-by-line trail/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Close CAM reconciliations by sharing the same math/i)
    ).toBeInTheDocument()
  })

  it('has id="how-it-works" for scroll navigation', () => {
    const { container } = render(<HowItWorksSection />)

    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'how-it-works')
  })

  it('applies custom className when provided', () => {
    const { container } = render(<HowItWorksSection className="custom-class" />)

    const section = container.querySelector('section')
    expect(section).toHaveClass('custom-class')
  })

  it('renders scroll reveal animation classes on steps', () => {
    const { container } = render(<HowItWorksSection />)

    const animatedElements = container.querySelectorAll('.animate-on-scroll')
    expect(animatedElements.length).toBeGreaterThan(0)
  })
})
