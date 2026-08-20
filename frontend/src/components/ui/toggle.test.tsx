/**
 * Tests for Toggle component.
 *
 * Validates toggle variants, sizes, and state.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle, toggleVariants } from './toggle'

describe('Toggle', () => {
  it('uses the button radius token', () => {
    expect(toggleVariants()).toContain('rounded-button')
  })

  it('renders with default variant and size', () => {
    render(<Toggle>Toggle</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveClass('bg-transparent')
    expect(toggle).toHaveClass('h-10')
  })

  it('renders with outline variant', () => {
    render(<Toggle variant="outline">Outline</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveClass('border')
  })

  it('renders with small size', () => {
    render(<Toggle size="sm">Small</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveClass('h-9')
  })

  it('renders with large size', () => {
    render(<Toggle size="lg">Large</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveClass('h-11')
  })

  it('toggles state when clicked', async () => {
    const user = userEvent.setup()
    render(<Toggle>Toggle Me</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('data-state', 'off')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('data-state', 'on')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('data-state', 'off')
  })

  it('accepts custom className', () => {
    render(<Toggle className="custom-toggle">Custom</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveClass('custom-toggle')
  })

  it('respects disabled state', async () => {
    const user = userEvent.setup()
    render(<Toggle disabled>Disabled</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('data-state', 'off')

    await user.click(toggle)
    // Should remain off when disabled
    expect(toggle).toHaveAttribute('data-state', 'off')
  })

  it('supports controlled state via pressed prop', () => {
    const { rerender } = render(<Toggle pressed={false}>Controlled</Toggle>)

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('data-state', 'off')

    rerender(<Toggle pressed={true}>Controlled</Toggle>)
    expect(toggle).toHaveAttribute('data-state', 'on')
  })

  it('combines variant and size props', () => {
    render(
      <Toggle variant="outline" size="lg">
        Combined
      </Toggle>
    )

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveClass('border')
    expect(toggle).toHaveClass('h-11')
  })
})
