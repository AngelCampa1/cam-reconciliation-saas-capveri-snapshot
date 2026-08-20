/**
 * Tests for FeaturesGrid component
 *
 * Following test minimalism: Test content rendering, not styling.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeaturesGrid } from './FeaturesGrid'

describe('FeaturesGrid', () => {
  it('renders section header', () => {
    render(<FeaturesGrid />)

    expect(
      screen.getByText(/Everything You Need for CRE FinOps/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Purpose-built features for commercial real estate/i)
    ).toBeInTheDocument()
  })

  it('renders all 6 feature cards', () => {
    render(<FeaturesGrid />)

    expect(screen.getByText(/Gross-Up Calculator/i)).toBeInTheDocument()
    expect(screen.getByText(/Cap Type Support/i)).toBeInTheDocument()
    expect(screen.getByText(/Base Year Normalization/i)).toBeInTheDocument()
    expect(screen.getByText(/Expense Pool Management/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Historical Variance Analysis/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/ERP Export/i)).toBeInTheDocument()
  })

  it('renders feature descriptions', () => {
    render(<FeaturesGrid />)

    expect(
      screen.getByText(/BOMA 2024 aligned calculation workflows/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Non-cumulative, cumulative/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Automatically normalizes base year/i)
    ).toBeInTheDocument()
  })

  it('renders spotlight cards with metric badges', () => {
    render(<FeaturesGrid />)

    expect(screen.getByText('BOMA 2024')).toBeInTheDocument()
    expect(screen.getByText('3 cap types')).toBeInTheDocument()
  })

  it('renders all 9 features', () => {
    render(<FeaturesGrid />)

    expect(screen.getByText(/Gross-Up Calculator/i)).toBeInTheDocument()
    expect(screen.getByText(/Cap Type Support/i)).toBeInTheDocument()
    expect(screen.getByText(/Base Year Normalization/i)).toBeInTheDocument()
    expect(screen.getByText(/Expense Pool Management/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Historical Variance Analysis/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/ERP Export/i)).toBeInTheDocument()
    expect(screen.getByText(/Traceable Audit Records/i)).toBeInTheDocument()
    expect(
      screen.getByText(/California SB 1103 Compliance/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/NOI Impact Calculator/i)).toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(<FeaturesGrid className="custom-class" />)

    const section = container.querySelector('section')
    expect(section).toHaveClass('custom-class')
  })
})
