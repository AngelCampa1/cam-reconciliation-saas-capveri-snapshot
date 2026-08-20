/**
 * Tests for Alert component.
 *
 * Validates alert rendering, variants, and composition.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Alert, AlertTitle, AlertDescription } from './alert'

describe('Alert', () => {
  it('renders with default variant', () => {
    render(<Alert>Default alert</Alert>)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Default alert')
    expect(alert).toHaveClass('bg-background')
  })

  it('renders with destructive variant', () => {
    render(<Alert variant="destructive">Destructive alert</Alert>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-destructive/50')
    // F-287: text uses the dark on-light shade for WCAG AA on the /5 wash.
    expect(alert).toHaveClass('text-destructive-strong')
    expect(alert).toHaveTextContent('Destructive alert')
  })

  it('renders with success variant', () => {
    render(<Alert variant="success">Success alert</Alert>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-success/50')
    // F-287: text uses the dark on-light shade for WCAG AA on the /5 wash.
    expect(alert).toHaveClass('text-success-strong')
    expect(alert).toHaveTextContent('Success alert')
  })

  it('renders with warning variant', () => {
    render(<Alert variant="warning">Warning alert</Alert>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-warning/50')
    // Body text uses the dark amber foreground token (WCAG AA contrast on the
    // light bg-warning/5 wash); the bright text-warning failed at ~2:1.
    expect(alert).toHaveClass('text-warning-foreground')
    expect(alert).toHaveTextContent('Warning alert')
  })

  it('renders with info variant', () => {
    render(<Alert variant="info">Info alert</Alert>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('border-info/50')
    // F-287: text uses the dark on-light shade for WCAG AA on the /5 wash.
    expect(alert).toHaveClass('text-info-strong')
    expect(alert).toHaveTextContent('Info alert')
  })

  it('renders AlertTitle component', () => {
    render(
      <Alert>
        <AlertTitle>Alert Title</AlertTitle>
      </Alert>
    )

    expect(screen.getByText('Alert Title')).toBeInTheDocument()
    expect(screen.getByText('Alert Title').tagName).toBe('H5')
  })

  it('renders AlertDescription component', () => {
    render(
      <Alert>
        <AlertDescription>Alert description text</AlertDescription>
      </Alert>
    )

    expect(screen.getByText('Alert description text')).toBeInTheDocument()
  })

  it('renders complete alert with title and description', () => {
    render(
      <Alert variant="warning">
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>This is a warning message</AlertDescription>
      </Alert>
    )

    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('This is a warning message')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('border-warning/50')
  })

  it('accepts custom className on Alert', () => {
    render(<Alert className="custom-alert">Custom</Alert>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('custom-alert')
  })

  it('accepts custom className on AlertTitle', () => {
    render(
      <Alert>
        <AlertTitle className="custom-title">Title</AlertTitle>
      </Alert>
    )

    const title = screen.getByText('Title')
    expect(title).toHaveClass('custom-title')
  })

  it('accepts custom className on AlertDescription', () => {
    render(
      <Alert>
        <AlertDescription className="custom-desc">Description</AlertDescription>
      </Alert>
    )

    const description = screen.getByText('Description')
    expect(description).toHaveClass('custom-desc')
  })

  it('forwards ref to Alert', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Alert ref={ref}>Alert with ref</Alert>)

    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(ref.current).toHaveTextContent('Alert with ref')
  })
})
