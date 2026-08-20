/**
 * Tests for ComparisonSummary stat cards.
 *
 * Asserts the four cards render the right titles (with counts) and the right
 * money/count values, and that the net difference uses the signed format.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComparisonResult } from '@/api/comparison'
import { ComparisonSummary } from './ComparisonSummary'

const result: ComparisonResult = {
  property_id: 'prop-1',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  tolerance: '0.01',
  tenants: [],
  total_capveri_correct: '1000.00',
  total_actual_charged: '1100.00',
  total_net_variance: '100.00',
  total_overcharge: '250.00',
  total_undercharge: '150.00',
  overcharge_count: 3,
  undercharge_count: 2,
  match_count: 5,
}

describe('ComparisonSummary', () => {
  it('renders the four stat cards with titles and counts', () => {
    render(<ComparisonSummary result={result} />)

    expect(screen.getByTestId('comparison-summary')).toBeInTheDocument()
    expect(screen.getByText('Net difference')).toBeInTheDocument()
    expect(screen.getByText('Overcharged (3)')).toBeInTheDocument()
    expect(screen.getByText('Undercharged (2)')).toBeInTheDocument()
    expect(screen.getByText('Match (5)')).toBeInTheDocument()
  })

  it('renders money totals and the match count value', () => {
    render(<ComparisonSummary result={result} />)

    // Net difference uses the signed format (positive => leading +).
    expect(screen.getByText('+$100.00')).toBeInTheDocument()
    expect(screen.getByText('$250.00')).toBeInTheDocument()
    expect(screen.getByText('$150.00')).toBeInTheDocument()
    // The match card shows the raw count, not a money figure.
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders a negative net difference with the minus sign', () => {
    render(
      <ComparisonSummary result={{ ...result, total_net_variance: '-75.00' }} />
    )
    expect(screen.getByText('-$75.00')).toBeInTheDocument()
  })
})
