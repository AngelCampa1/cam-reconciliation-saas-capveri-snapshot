import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ROICalculator, calculateROI } from './ROICalculator'

const renderWithRouter = (component: React.ReactElement) =>
  render(<BrowserRouter>{component}</BrowserRouter>)

describe('ROICalculator', () => {
  it('renders the unit-based calculator', () => {
    renderWithRouter(<ROICalculator />)

    expect(screen.getByText(/check your bill risk/i)).toBeInTheDocument()
    expect(screen.getByText(/active rentable units/i)).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50')
  })

  it('shows the current annual cost and modeled bill risk for the default unit count', () => {
    renderWithRouter(<ROICalculator />)

    expect(screen.getByText(/\$9,465/)).toBeInTheDocument()
    expect(screen.getByText(/\$883,455/)).toBeInTheDocument()
    expect(screen.getByText(/\$873,990/)).toBeInTheDocument()
    expect(screen.getByText(/Review Mode/i)).toBeInTheDocument()
    expect(screen.getByText(/Pre-send/i)).toBeInTheDocument()
  })

  it('renders the primary and secondary calls to action', () => {
    renderWithRouter(<ROICalculator />)

    expect(
      screen.getByRole('link', { name: /start free trial/i })
    ).toHaveAttribute('href', '/auth/register')
    expect(
      screen.getByRole('link', { name: /see a sample report/i })
    ).toHaveAttribute('href', '/sample-report')
  })
})

describe('calculateROI', () => {
  it('calculates the reconcile package for 25 units', () => {
    const roi = calculateROI(25)
    expect(roi.annualCost).toBe(4990)
    expect(roi.estimatedRecovery).toBe(441728)
    expect(roi.netGain).toBe(441728 - 4990)
  })

  it('calculates progressive Reconcile pricing for 120 units', () => {
    const roi = calculateROI(120)
    expect(roi.annualCost).toBe(21995)
    expect(roi.estimatedRecovery).toBe(2120293)
    expect(roi.netGain).toBe(2120293 - 21995)
  })

  it('calculates the open-ended Reconcile band for large unit counts', () => {
    expect(calculateROI(700)).toEqual({
      annualCost: 118315,
      estimatedRecovery: 12368376,
      netGain: 12250061,
    })
  })
})
