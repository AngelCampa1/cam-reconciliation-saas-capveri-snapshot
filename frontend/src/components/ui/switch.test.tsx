/**
 * Tests for Switch component.
 *
 * Validates switch state and interactions.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from './switch'

describe('Switch', () => {
  it('renders as a switch role', () => {
    render(<Switch aria-label="Test switch" />)

    const switchElement = screen.getByRole('switch')
    expect(switchElement).toBeInTheDocument()
  })

  it('is unchecked by default', () => {
    render(<Switch aria-label="Test switch" />)

    const switchElement = screen.getByRole('switch')
    expect(switchElement).not.toBeChecked()
    expect(switchElement).toHaveAttribute('data-state', 'unchecked')
  })

  it('can be checked via defaultChecked prop', () => {
    render(<Switch defaultChecked aria-label="Test switch" />)

    const switchElement = screen.getByRole('switch')
    expect(switchElement).toBeChecked()
    expect(switchElement).toHaveAttribute('data-state', 'checked')
  })

  it('toggles when clicked', async () => {
    const user = userEvent.setup()
    render(<Switch aria-label="Test switch" />)

    const switchElement = screen.getByRole('switch')
    expect(switchElement).not.toBeChecked()

    await user.click(switchElement)
    expect(switchElement).toBeChecked()

    await user.click(switchElement)
    expect(switchElement).not.toBeChecked()
  })

  it('calls onCheckedChange when toggled', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()

    render(
      <Switch onCheckedChange={onCheckedChange} aria-label="Test switch" />
    )

    const switchElement = screen.getByRole('switch')
    await user.click(switchElement)

    expect(onCheckedChange).toHaveBeenCalledWith(true)

    await user.click(switchElement)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('respects disabled state', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()

    render(
      <Switch
        disabled
        onCheckedChange={onCheckedChange}
        aria-label="Test switch"
      />
    )

    const switchElement = screen.getByRole('switch')
    expect(switchElement).toBeDisabled()

    await user.click(switchElement)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('supports controlled state via checked prop', () => {
    const { rerender } = render(
      <Switch checked={false} aria-label="Controlled" />
    )

    const switchElement = screen.getByRole('switch')
    expect(switchElement).not.toBeChecked()

    rerender(<Switch checked={true} aria-label="Controlled" />)
    expect(switchElement).toBeChecked()
  })

  it('accepts custom className', () => {
    render(<Switch className="custom-switch" aria-label="Custom" />)

    const switchElement = screen.getByRole('switch')
    expect(switchElement).toHaveClass('custom-switch')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Switch ref={ref} aria-label="Ref test" />)

    expect(ref).toHaveBeenCalled()
  })
})
