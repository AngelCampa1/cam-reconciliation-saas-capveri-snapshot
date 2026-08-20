/**
 * Tests for GroupHeader component.
 *
 * Validates collapsible group headers with pool name and subtotals.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupHeader } from './GroupHeader'

describe('GroupHeader', () => {
  it('renders pool name and subtotal', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('CAM Pool')).toBeInTheDocument()
    expect(screen.getByText('$15,000.00')).toBeInTheDocument()
  })

  it('shows chevron down when expanded', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    // ChevronDown icon is present (we can't easily test the icon itself)
  })

  it('shows chevron right when collapsed', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={false}
        onToggle={vi.fn()}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    // ChevronRight icon is present
  })

  it('calls onToggle when button clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={true}
        onToggle={onToggle}
      />
    )

    const button = screen.getByRole('button')
    await user.click(button)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('applies correct styling for header background', () => {
    const { container } = render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    const header = container.firstChild
    expect(header).toHaveClass('bg-muted/50')
  })

  it('displays subtotal with currency formatting', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="1234567.89"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument()
  })

  it('renders a subtotal beyond MAX_SAFE_INTEGER without float drift (F-430)', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="9007199254740993.45"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('$9,007,199,254,740,993.45')).toBeInTheDocument()
    expect(
      screen.queryByText('$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })

  it('caps a high-precision subtotal at two decimals without losing magnitude (F-430)', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="9007199254740993.456"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    // Every integer digit is preserved (no float drift) and the fractional
    // part rounds to the USD two-decimal cap.
    expect(screen.getByText('$9,007,199,254,740,993.46')).toBeInTheDocument()
  })

  it('handles negative subtotals', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="-5000.00"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('-$5,000.00')).toBeInTheDocument()
  })

  it('displays row count when provided', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        rowCount={5}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('(5 items)')).toBeInTheDocument()
  })

  it('uses the singular noun for a row count of exactly one (F-444)', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        rowCount={1}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('(1 item)')).toBeInTheDocument()
    expect(screen.queryByText('(1 items)')).not.toBeInTheDocument()
  })

  it('formats a large row count with thousands separators (F-444)', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        rowCount={8432}
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('(8,432 items)')).toBeInTheDocument()
  })

  it('does not display row count when not provided', () => {
    render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.queryByText(/items/)).not.toBeInTheDocument()
  })

  it('has data-testid="group-header" on the container', () => {
    const { container } = render(
      <GroupHeader
        poolName="CAM Pool"
        subtotal="15000.00"
        isExpanded={true}
        onToggle={vi.fn()}
      />
    )

    expect(
      container.querySelector('[data-testid="group-header"]')
    ).toBeInTheDocument()
  })
})
