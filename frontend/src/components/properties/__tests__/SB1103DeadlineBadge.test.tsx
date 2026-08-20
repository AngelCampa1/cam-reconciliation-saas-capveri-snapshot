/**
 * SB1103DeadlineBadge Component Tests
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SB1103DeadlineBadge } from '../SB1103DeadlineBadge'

describe('SB1103DeadlineBadge', () => {
  it('shows "Delivered" grey badge when status is delivered', () => {
    render(<SB1103DeadlineBadge status="delivered" daysRemaining={5} />)
    expect(screen.getByText('Delivered')).toBeInTheDocument()
  })

  it('shows overdue badge with negative days when overdue', () => {
    render(<SB1103DeadlineBadge status="overdue" daysRemaining={-3} />)
    expect(screen.getByText('Overdue (3d)')).toBeInTheDocument()
  })

  it('shows red badge when 7 or fewer days remaining', () => {
    const { container } = render(
      <SB1103DeadlineBadge status="pending" daysRemaining={7} />
    )
    expect(screen.getByText('7d remaining')).toBeInTheDocument()
  })

  it('shows red badge when exactly 0 days remaining', () => {
    render(<SB1103DeadlineBadge status="pending" daysRemaining={0} />)
    expect(screen.getByText('0d remaining')).toBeInTheDocument()
  })

  it('shows yellow badge when 8 to 14 days remaining', () => {
    render(<SB1103DeadlineBadge status="pending" daysRemaining={10} />)
    expect(screen.getByText('10d remaining')).toBeInTheDocument()
  })

  it('shows green badge when more than 14 days remaining', () => {
    render(<SB1103DeadlineBadge status="pending" daysRemaining={20} />)
    expect(screen.getByText('20d remaining')).toBeInTheDocument()
  })

  it('shows red badge for 1 day remaining', () => {
    render(<SB1103DeadlineBadge status="pending" daysRemaining={1} />)
    expect(screen.getByText('1d remaining')).toBeInTheDocument()
  })

  it('shows yellow badge for 14 days remaining (boundary)', () => {
    render(<SB1103DeadlineBadge status="pending" daysRemaining={14} />)
    expect(screen.getByText('14d remaining')).toBeInTheDocument()
  })
})
