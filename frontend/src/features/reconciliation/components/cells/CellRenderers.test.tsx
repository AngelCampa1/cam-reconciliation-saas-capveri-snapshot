/**
 * Tests for reconciliation grid cell renderers.
 *
 * Validates formatting, styling, and null handling for all cell types.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  CurrencyCell,
  PercentageCell,
  TextCell,
  StatusCell,
  DifferenceCell,
} from './CellRenderers'
import { ReconciliationStatus } from '@/types/enums'

describe('CurrencyCell', () => {
  it('formats positive amounts with $ symbol and 2 decimals', () => {
    render(<CurrencyCell value="1234.56" />)
    expect(screen.getByText('$1,234.56')).toBeInTheDocument()
  })

  it('formats negative amounts correctly', () => {
    render(<CurrencyCell value="-500.75" />)
    expect(screen.getByText('-$500.75')).toBeInTheDocument()
  })

  it('handles zero value', () => {
    render(<CurrencyCell value="0.00" />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('displays placeholder for null value', () => {
    render(<CurrencyCell value={null} />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('displays placeholder for undefined value', () => {
    render(<CurrencyCell value={undefined} />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('applies monospace font and right alignment', () => {
    const { container } = render(<CurrencyCell value="100.00" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('font-mono', 'text-right')
  })

  it('preserves every digit beyond Number.MAX_SAFE_INTEGER (no float round-trip)', () => {
    // parseFloat('9007199254740993.45') === 9007199254740992 — a float round-trip
    // would print the wrong dollars. The exact decimal parse keeps all digits.
    render(<CurrencyCell value="9007199254740993.45" />)
    expect(screen.getByText('$9,007,199,254,740,993.45')).toBeInTheDocument()
    expect(
      screen.queryByText('$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })
})

describe('PercentageCell', () => {
  it('formats 0-1 range with % symbol', () => {
    render(<PercentageCell value={0.75} />)
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })

  it('formats 0-100 range when is100Scale is true', () => {
    render(<PercentageCell value={75} is100Scale={true} />)
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })

  it('handles zero value', () => {
    render(<PercentageCell value={0} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
  })

  it('displays placeholder for null value', () => {
    render(<PercentageCell value={null} />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('uses specified decimal places', () => {
    render(<PercentageCell value={0.12345} decimalPlaces={2} />)
    expect(screen.getByText('12.35%')).toBeInTheDocument()
  })

  it('applies monospace font and right alignment', () => {
    const { container } = render(<PercentageCell value={0.5} />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('font-mono', 'text-right', 'tabular-nums')
  })
})

describe('TextCell', () => {
  it('renders short text without truncation', () => {
    render(<TextCell value="Short text" />)
    expect(screen.getByText('Short text')).toBeInTheDocument()
  })

  it('truncates long text with ellipsis', () => {
    const longText = 'A'.repeat(100)
    const { container } = render(<TextCell value={longText} maxLength={50} />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('truncate')
  })

  it('displays placeholder for null value', () => {
    render(<TextCell value={null} />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('displays placeholder for empty string', () => {
    render(<TextCell value="" />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('wraps truncated text in tooltip provider', () => {
    const longText = 'A'.repeat(100)
    const { container } = render(<TextCell value={longText} maxLength={50} />)

    // Should have the truncated text displayed
    expect(screen.getByText(longText.slice(0, 50) + '...')).toBeInTheDocument()

    // Should be wrapped in tooltip trigger (aria-describedby present)
    const trigger = container.querySelector('[data-state]')
    expect(trigger).toBeInTheDocument()
  })
})

describe('StatusCell', () => {
  it('renders draft status with correct badge', () => {
    render(<StatusCell status={ReconciliationStatus.DRAFT} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders finalized status with correct badge', () => {
    render(<StatusCell status={ReconciliationStatus.FINALIZED} />)
    expect(screen.getByText('Finalized')).toBeInTheDocument()
  })

  it('applies correct color class for draft status', () => {
    const { container } = render(
      <StatusCell status={ReconciliationStatus.DRAFT} />
    )
    const badge = container.querySelector('[data-status="draft"]')
    expect(badge).toBeInTheDocument()
  })

  it('applies correct color class for finalized status', () => {
    const { container } = render(
      <StatusCell status={ReconciliationStatus.FINALIZED} />
    )
    const badge = container.querySelector('[data-status="finalized"]')
    expect(badge).toBeInTheDocument()
  })
})

describe('DifferenceCell', () => {
  it('renders positive difference in green', () => {
    const { container } = render(<DifferenceCell value="100.00" />)
    // Uses semantic success color for positive differences
    const span = container.querySelector('.text-success-strong')
    expect(span).toBeInTheDocument()
    expect(span).toHaveTextContent('+$100.00')
  })

  it('renders negative difference in red', () => {
    const { container } = render(<DifferenceCell value="-50.00" />)
    // Uses theme-aware destructive color for negative differences
    const span = container.querySelector('.text-destructive-strong')
    expect(span).toBeInTheDocument()
    expect(span).toHaveTextContent('-$50.00')
  })

  it('renders zero as neutral', () => {
    const { container } = render(<DifferenceCell value="0.00" />)
    const span = container.querySelector('.text-muted-foreground')
    expect(span).toBeInTheDocument()
    expect(span).toHaveTextContent('$0.00')
  })

  it('displays placeholder for null value', () => {
    render(<DifferenceCell value={null} />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('includes + sign for positive values', () => {
    render(<DifferenceCell value="250.50" />)
    expect(screen.getByText('+$250.50')).toBeInTheDocument()
  })

  it('preserves every digit of a large positive variance (no float round-trip)', () => {
    render(<DifferenceCell value="9007199254740993.45" />)
    expect(screen.getByText('+$9,007,199,254,740,993.45')).toBeInTheDocument()
    expect(
      screen.queryByText('+$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })

  it('preserves every digit of a large negative variance (no float round-trip)', () => {
    // The magnitude is formatted from the exact decimal string; only the
    // sign/zero comparison parses to a number. A float round-trip on
    // 9007199254740993.45 would drop the final cents.
    render(<DifferenceCell value="-9007199254740993.45" />)
    expect(screen.getByText('-$9,007,199,254,740,993.45')).toBeInTheDocument()
    expect(
      screen.queryByText('-$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })

  it('applies monospace font and right alignment', () => {
    const { container } = render(<DifferenceCell value="100.00" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('font-mono', 'text-right', 'tabular-nums')
  })
})
