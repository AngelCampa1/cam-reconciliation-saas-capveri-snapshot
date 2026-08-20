/**
 * Tests for Slider component.
 *
 * Validates slider value changes and interactions.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Slider } from './slider'

describe('Slider', () => {
  it('renders with default value', () => {
    render(<Slider defaultValue={[50]} aria-label="Volume" />)

    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuenow', '50')
  })

  it('renders with min and max values', () => {
    render(<Slider defaultValue={[25]} min={0} max={100} aria-label="Volume" />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders with custom step', () => {
    render(<Slider defaultValue={[50]} step={10} aria-label="Volume" />)

    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
  })

  it('calls onValueChange when value changes', async () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        defaultValue={[50]}
        onValueChange={onValueChange}
        aria-label="Volume"
      />
    )

    const slider = screen.getByRole('slider')

    // Simulate keyboard interaction
    slider.focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(onValueChange).toHaveBeenCalled()
  })

  it('supports controlled state', () => {
    const { rerender } = render(<Slider value={[30]} aria-label="Controlled" />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '30')

    rerender(<Slider value={[70]} aria-label="Controlled" />)
    expect(slider).toHaveAttribute('aria-valuenow', '70')
  })

  it('respects disabled state', async () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        defaultValue={[50]}
        disabled
        onValueChange={onValueChange}
        aria-label="Volume"
      />
    )

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('data-disabled', '')

    slider.focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('accepts custom className', () => {
    const { container } = render(
      <Slider
        defaultValue={[50]}
        className="custom-slider"
        aria-label="Volume"
      />
    )

    const sliderRoot = container.querySelector('.custom-slider')
    expect(sliderRoot).toBeInTheDocument()
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Slider ref={ref} defaultValue={[50]} aria-label="Volume" />)

    expect(ref).toHaveBeenCalled()
  })

  it('updates value with arrow keys', async () => {
    const onValueChange = vi.fn()
    render(
      <Slider
        defaultValue={[50]}
        step={1}
        onValueChange={onValueChange}
        aria-label="Volume"
      />
    )

    const slider = screen.getByRole('slider')
    slider.focus()

    await userEvent.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenCalledWith([51])

    await userEvent.keyboard('{ArrowLeft}')
    expect(onValueChange).toHaveBeenCalledWith([50])
  })
})
