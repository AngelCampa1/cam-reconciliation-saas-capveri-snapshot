import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Label } from './label'

describe('Label', () => {
  it('renders as label element with text', () => {
    render(<Label>Username</Label>)
    const label = screen.getByText('Username')
    expect(label).toBeInTheDocument()
    expect(label.tagName).toBe('LABEL')
  })

  it('associates with input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email-input">Email</Label>
        <input id="email-input" type="email" />
      </>
    )
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    render(<Label onClick={handleClick}>Clickable</Label>)
    screen.getByText('Clickable').click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('applies custom className', () => {
    render(<Label className="custom-label">Custom</Label>)
    expect(screen.getByText('Custom')).toHaveClass('custom-label')
  })
})
