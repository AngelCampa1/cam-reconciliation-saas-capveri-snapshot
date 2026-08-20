/**
 * Tests for AllClearState — the shared dashboard "all clear" state.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllClearState } from './AllClearState'

describe('AllClearState', () => {
  it('renders the reassurance message', () => {
    render(<AllClearState message="All caught up! No pending actions." />)

    expect(
      screen.getByText('All caught up! No pending actions.')
    ).toBeInTheDocument()
  })

  it('renders a decorative success check hidden from assistive tech', () => {
    const { container } = render(
      <AllClearState message="No pending reconciliations" />
    )

    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
