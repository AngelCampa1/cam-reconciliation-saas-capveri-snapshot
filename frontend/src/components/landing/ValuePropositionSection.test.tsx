/**
 * Tests for ValuePropositionSection component
 *
 * Following test minimalism: Test value prop content, not styling.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ValuePropositionSection } from './ValuePropositionSection'

describe('ValuePropositionSection', () => {
  it('renders section header', () => {
    render(<ValuePropositionSection />)

    expect(
      screen.getByText(/Why Property Managers Choose CapVeri/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Stop the spreadsheet madness/i)
    ).toBeInTheDocument()
  })

  it('renders all 3 value proposition cards', () => {
    render(<ValuePropositionSection />)

    expect(screen.getByText(/Fix Yardi, Don't Replace It/i)).toBeInTheDocument()
    expect(screen.getByText(/Deterministic Accuracy/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Reconcile Down to the Dollar/i)
    ).toBeInTheDocument()
  })

  it('renders value prop subtitles', () => {
    render(<ValuePropositionSection />)

    expect(screen.getByText(/Zero Integration Cost/i)).toBeInTheDocument()
    expect(screen.getByText(/BOMA 2024 Aligned/i)).toBeInTheDocument()
    expect(screen.getByText(/\$5.9K-\$35.3K modeled/i)).toBeInTheDocument()
  })

  it('BOMA subtitle is aligned not certified or compliant', () => {
    render(<ValuePropositionSection />)

    expect(screen.queryByText(/BOMA 2024 Certified/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/BOMA 2024 Compliant/i)).not.toBeInTheDocument()
    expect(screen.getByText(/BOMA 2024 Aligned/i)).toBeInTheDocument()
  })

  it('does not render old $15-50K range as subtitle', () => {
    render(<ValuePropositionSection />)

    expect(
      screen.queryByText(/Average \$15-50K\/Building/i)
    ).not.toBeInTheDocument()
  })

  it('renders value prop descriptions', () => {
    render(<ValuePropositionSection />)

    expect(
      screen.getByText(/Works from standard CSV exports/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Rule-based calculation logic/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/One missed error can repeat every year/i)
    ).toBeInTheDocument()
  })

  it('renders metric values above each card title', () => {
    render(<ValuePropositionSection />)

    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByText('Trace')).toBeInTheDocument()
    expect(screen.getByText('$5.9K-$35.3K')).toBeInTheDocument()
  })

  it('renders metric sub-labels', () => {
    render(<ValuePropositionSection />)

    expect(screen.getByText(/API integration cost/i)).toBeInTheDocument()
    expect(screen.getByText(/reviewable math trail/i)).toBeInTheDocument()
    expect(screen.getByText(/modeled bill-risk range/i)).toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(
      <ValuePropositionSection className="custom-class" />
    )

    const section = container.querySelector('section')
    expect(section).toHaveClass('custom-class')
  })
})
