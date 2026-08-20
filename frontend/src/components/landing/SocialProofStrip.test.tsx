import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SocialProofStrip } from './SocialProofStrip'

describe('SocialProofStrip', () => {
  it('renders all 4 stat values', () => {
    render(<SocialProofStrip />)
    expect(screen.getByText('~40%')).toBeInTheDocument()
    expect(screen.getByText('Decimal')).toBeInTheDocument()
    expect(screen.getByText('BOMA 2024')).toBeInTheDocument()
    expect(screen.getByText('Minutes')).toBeInTheDocument()
  })

  it('renders all 4 stat labels', () => {
    render(<SocialProofStrip />)
    expect(
      screen.getByText(/of CAM reconciliations may contain errors/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/exact math, never rounded/i)).toBeInTheDocument()
    expect(screen.getByText(/aligned calculation engine/i)).toBeInTheDocument()
    expect(
      screen.getByText(/to your first reconciliation/i)
    ).toBeInTheDocument()
  })

  it('has accessible label on the section', () => {
    render(<SocialProofStrip />)
    expect(document.querySelector('[aria-label="Key statistics"]')).toBeTruthy()
  })

  it('BOMA stat label uses aligned not certified or compliant', () => {
    render(<SocialProofStrip />)
    expect(
      screen.queryByText(/certified calculation engine/i)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/compliant calculation engine/i)
    ).not.toBeInTheDocument()
    expect(screen.getByText(/aligned calculation engine/i)).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<SocialProofStrip className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
