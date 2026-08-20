/**
 * Tests for Badge component.
 *
 * Validates badge variants and rendering.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './badge'

describe('Badge', () => {
  it('renders with default variant', () => {
    render(<Badge>Default Badge</Badge>)

    const badge = screen.getByText('Default Badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-primary')
  })

  it('renders with secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>)

    const badge = screen.getByText('Secondary')
    expect(badge).toHaveClass('bg-secondary')
  })

  it('renders with destructive variant', () => {
    render(<Badge variant="destructive">Destructive</Badge>)

    const badge = screen.getByText('Destructive')
    expect(badge).toHaveClass('bg-destructive-strong')
  })

  it('renders with outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>)

    const badge = screen.getByText('Outline')
    expect(badge).toHaveClass('text-foreground')
  })

  it('renders with success variant', () => {
    render(<Badge variant="success">Success</Badge>)

    const badge = screen.getByText('Success')
    expect(badge).toHaveClass('bg-success-strong')
  })

  it('renders with warning variant', () => {
    render(<Badge variant="warning">Warning</Badge>)

    const badge = screen.getByText('Warning')
    expect(badge).toHaveClass('bg-warning')
  })

  it('renders with info variant', () => {
    render(<Badge variant="info">Info</Badge>)

    const badge = screen.getByText('Info')
    expect(badge).toHaveClass('bg-primary')
  })

  it('accepts custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>)

    const badge = screen.getByText('Custom')
    expect(badge).toHaveClass('custom-class')
  })

  it('forwards HTML attributes', () => {
    render(<Badge data-testid="test-badge">Test</Badge>)

    expect(screen.getByTestId('test-badge')).toBeInTheDocument()
  })
})
