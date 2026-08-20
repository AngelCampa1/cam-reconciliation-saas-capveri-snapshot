/**
 * Tests for PDFPreviewControls component
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PDFPreviewControls } from './PDFPreviewControls'
import { ZOOM_PRESETS } from '../utils/pdfHelpers'

describe('PDFPreviewControls', () => {
  const defaultProps = {
    scale: 1.0,
    onScaleChange: vi.fn(),
    onDownload: vi.fn(),
    onPrint: vi.fn(),
  }

  it('renders all control buttons', () => {
    render(<PDFPreviewControls {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /download/i })
    ).toBeInTheDocument()
  })

  it('calls onScaleChange with -1 when fit-width is selected', async () => {
    const user = userEvent.setup()
    const onScaleChange = vi.fn()

    render(
      <PDFPreviewControls {...defaultProps} onScaleChange={onScaleChange} />
    )

    // Open the select dropdown
    const select = screen.getByRole('combobox')
    await user.click(select)

    // Select "Fit Width"
    const fitWidthOption = screen.getByRole('option', { name: 'Fit Width' })
    await user.click(fitWidthOption)

    expect(onScaleChange).toHaveBeenCalledWith(-1)
  })

  it('calls onScaleChange with -2 when fit-page is selected', async () => {
    const user = userEvent.setup()
    const onScaleChange = vi.fn()

    render(
      <PDFPreviewControls {...defaultProps} onScaleChange={onScaleChange} />
    )

    // Open the select dropdown
    const select = screen.getByRole('combobox')
    await user.click(select)

    // Select "Fit Page"
    const fitPageOption = screen.getByRole('option', { name: 'Fit Page' })
    await user.click(fitPageOption)

    expect(onScaleChange).toHaveBeenCalledWith(-2)
  })

  it('calls onScaleChange with parsed numeric value when numeric zoom is selected', async () => {
    const user = userEvent.setup()
    const onScaleChange = vi.fn()

    render(
      <PDFPreviewControls {...defaultProps} onScaleChange={onScaleChange} />
    )

    // Open the select dropdown
    const select = screen.getByRole('combobox')
    await user.click(select)

    // Select "150%"
    const zoom150Option = screen.getByRole('option', { name: '150%' })
    await user.click(zoom150Option)

    expect(onScaleChange).toHaveBeenCalledWith(1.5)
  })

  it('displays "fit-width" value when scale is -1', () => {
    render(<PDFPreviewControls {...defaultProps} scale={-1} />)

    // The select trigger should display "Fit Width" text
    expect(screen.getByText('Fit Width')).toBeInTheDocument()
  })

  it('displays "fit-page" value when scale is -2', () => {
    render(<PDFPreviewControls {...defaultProps} scale={-2} />)

    // The select trigger should display "Fit Page" text
    expect(screen.getByText('Fit Page')).toBeInTheDocument()
  })

  it('displays numeric string value when scale is a normal number', () => {
    render(<PDFPreviewControls {...defaultProps} scale={1.25} />)

    // The select trigger should display "125%" text
    expect(screen.getByText('125%')).toBeInTheDocument()
  })

  it('zoom in button increases scale by 0.25 up to max of 3.0', async () => {
    const user = userEvent.setup()
    const onScaleChange = vi.fn()

    const { rerender } = render(
      <PDFPreviewControls
        {...defaultProps}
        scale={2.8}
        onScaleChange={onScaleChange}
      />
    )

    const zoomInButton = screen.getByRole('button', { name: 'Zoom in' })

    // Click zoom in (should go to 3.05, but capped at 3.0)
    await user.click(zoomInButton)
    expect(onScaleChange).toHaveBeenCalledWith(3.0)

    // Render at max scale
    rerender(
      <PDFPreviewControls
        {...defaultProps}
        scale={3.0}
        onScaleChange={onScaleChange}
      />
    )

    // Button should be disabled at max
    expect(zoomInButton).toBeDisabled()
  })

  it('zoom out button decreases scale by 0.25 down to min of 0.25', async () => {
    const user = userEvent.setup()
    const onScaleChange = vi.fn()

    const { rerender } = render(
      <PDFPreviewControls
        {...defaultProps}
        scale={0.5}
        onScaleChange={onScaleChange}
      />
    )

    const zoomOutButton = screen.getByRole('button', { name: 'Zoom out' })

    // Click zoom out (should go to 0.25)
    await user.click(zoomOutButton)
    expect(onScaleChange).toHaveBeenCalledWith(0.25)

    // Render at min scale
    rerender(
      <PDFPreviewControls
        {...defaultProps}
        scale={0.25}
        onScaleChange={onScaleChange}
      />
    )

    // Button should be disabled at min
    expect(zoomOutButton).toBeDisabled()
  })

  it('disables all controls when disabled prop is true', () => {
    render(<PDFPreviewControls {...defaultProps} disabled={true} />)

    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled()
  })

  it('calls onPrint when print button is clicked', async () => {
    const user = userEvent.setup()
    const onPrint = vi.fn()

    render(<PDFPreviewControls {...defaultProps} onPrint={onPrint} />)

    await user.click(screen.getByRole('button', { name: /print/i }))

    expect(onPrint).toHaveBeenCalledTimes(1)
  })

  it('calls onDownload when download button is clicked', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn()

    render(<PDFPreviewControls {...defaultProps} onDownload={onDownload} />)

    await user.click(screen.getByRole('button', { name: /download/i }))

    expect(onDownload).toHaveBeenCalledTimes(1)
  })
})
