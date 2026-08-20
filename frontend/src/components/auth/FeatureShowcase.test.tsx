import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeatureShowcase } from './FeatureShowcase'

describe('FeatureShowcase', () => {
  it('renders pain-led headline', () => {
    render(<FeatureShowcase />)
    expect(
      screen.getByText(/CAM reconciliation errors cost landlords/i)
    ).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<FeatureShowcase />)
    expect(
      screen.getByText(/same answer in spreadsheets every year/i)
    ).toBeInTheDocument()
  })

  it('renders all four problem bullets', () => {
    render(<FeatureShowcase />)
    expect(screen.getByText(/lease-term mismatches/i)).toBeInTheDocument()
    expect(screen.getByText(/Gross-ups, caps, base years/i)).toBeInTheDocument()
    expect(screen.getByText(/Yardi, MRI, RealPage/i)).toBeInTheDocument()
    expect(screen.getByText(/tenant-ready CAM packet/i)).toBeInTheDocument()
  })

  it('renders the three value chips', () => {
    render(<FeatureShowcase />)
    expect(screen.getByText('Guided setup')).toBeInTheDocument()
    expect(screen.getByText('Built-in reports')).toBeInTheDocument()
    expect(screen.getByText('Flat annual price')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<FeatureShowcase className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
