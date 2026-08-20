import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './input'

describe('Input', () => {
  it('renders and handles value changes', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Input placeholder="Enter text" onChange={handleChange} />)

    const input = screen.getByPlaceholderText('Enter text')
    await user.type(input, 'test')

    expect(handleChange).toHaveBeenCalled()
    expect(input).toHaveValue('test')
  })

  it('supports disabled state', () => {
    render(<Input disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('supports different input types', () => {
    const { rerender } = render(<Input type="email" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')

    rerender(<Input type="number" />)
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('displays error state with aria-invalid', () => {
    render(<Input error />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveClass('border-destructive')
  })

  it('associates with label via id', () => {
    render(
      <>
        <label htmlFor="test-input">Test Label</label>
        <Input id="test-input" />
      </>
    )
    expect(screen.getByLabelText('Test Label')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<Input className="custom-input" />)
    expect(screen.getByRole('textbox')).toHaveClass('custom-input')
  })
})
