import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button, buttonVariants } from './button'

describe('Button', () => {
  it('renders with children and handles clicks', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('supports disabled state', () => {
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('renders as child element with asChild', () => {
    render(
      <Button asChild>
        <a href="/link">Link Button</a>
      </Button>
    )
    const link = screen.getByRole('link', { name: 'Link Button' })
    expect(link).toHaveAttribute('href', '/link')
  })

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>)
    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('exports buttonVariants helper', () => {
    expect(buttonVariants).toBeDefined()
    expect(typeof buttonVariants({ variant: 'default' })).toBe('string')
  })

  it('uses pill radius across button sizes', () => {
    expect(buttonVariants({ size: 'default' })).toContain('rounded-button')
    expect(buttonVariants({ size: 'sm' })).not.toContain('rounded-md')
    expect(buttonVariants({ size: 'xl' })).not.toContain('rounded-lg')
  })
})
