/**
 * Tests for ExtractionStatusBadge (F-233)
 *
 * Verifies Title Case labels, a distinct color class per status, a
 * non-color icon cue, and a safe fallback for unexpected status strings.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExtractionStatusBadge } from './ExtractionStatusBadge'
import { DocumentStatus } from '@/types/enums'

describe('ExtractionStatusBadge', () => {
  it('renders Title Case labels for each known status', () => {
    const cases: Array<[string, string]> = [
      [DocumentStatus.PENDING, 'Pending'],
      [DocumentStatus.PROCESSING, 'Processing'],
      [DocumentStatus.READY_FOR_REVIEW, 'Ready for Review'],
      [DocumentStatus.COMPLETED, 'Completed'],
      [DocumentStatus.VERIFIED, 'Verified'],
      [DocumentStatus.FAILED, 'Failed'],
      [DocumentStatus.REJECTED, 'Rejected'],
    ]

    for (const [status, label] of cases) {
      const { unmount } = render(<ExtractionStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('applies distinct color classes so statuses are visually different', () => {
    const { rerender } = render(
      <ExtractionStatusBadge status={DocumentStatus.READY_FOR_REVIEW} />
    )
    expect(
      screen.getByTestId(`status-badge-${DocumentStatus.READY_FOR_REVIEW}`)
        .className
    ).toContain('text-warning-foreground')

    rerender(<ExtractionStatusBadge status={DocumentStatus.VERIFIED} />)
    expect(
      screen.getByTestId(`status-badge-${DocumentStatus.VERIFIED}`).className
    ).toContain('text-success-strong')

    rerender(<ExtractionStatusBadge status={DocumentStatus.REJECTED} />)
    expect(
      screen.getByTestId(`status-badge-${DocumentStatus.REJECTED}`).className
    ).toContain('text-destructive-strong')
  })

  it('renders a non-color icon cue alongside the label', () => {
    const { container } = render(
      <ExtractionStatusBadge status={DocumentStatus.PENDING} />
    )
    const icon = container.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('spins the icon while processing', () => {
    const { container } = render(
      <ExtractionStatusBadge status={DocumentStatus.PROCESSING} />
    )
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      'animate-spin'
    )
  })

  it('falls back to a humanized label for unexpected statuses', () => {
    render(<ExtractionStatusBadge status="needs_attention" />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })
})
