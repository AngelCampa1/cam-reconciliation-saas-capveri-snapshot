/**
 * Tests for PDFOptions component.
 *
 * Validates PDF-specific export options controls.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PDFOptions } from './PDFOptions'
import type { PDFExportOptions } from '../types'

const mockOptions: PDFExportOptions = {
  includeCoverPage: false,
  includeCalculationDetails: false,
  includeCalculations: true,
  includeCharts: false,
  pageOrientation: 'portrait',
}

describe('PDFOptions', () => {
  it('renders PDF options heading', () => {
    render(<PDFOptions options={mockOptions} onChange={vi.fn()} />)

    expect(screen.getByText('PDF Options')).toBeInTheDocument()
  })

  it('renders include cover page toggle', () => {
    render(<PDFOptions options={mockOptions} onChange={vi.fn()} />)

    expect(screen.getByLabelText(/include cover page/i)).toBeInTheDocument()
  })

  it('renders include calculation details toggle', () => {
    render(<PDFOptions options={mockOptions} onChange={vi.fn()} />)

    expect(
      screen.getByLabelText(/include calculation details/i)
    ).toBeInTheDocument()
  })

  it('displays correct initial state for cover page toggle', () => {
    const optionsWithCoverPage: PDFExportOptions = {
      ...mockOptions,
      includeCoverPage: true,
    }

    render(<PDFOptions options={optionsWithCoverPage} onChange={vi.fn()} />)

    const toggle = screen.getByRole('switch', { name: /include cover page/i })
    expect(toggle).toBeChecked()
  })

  it('displays correct initial state for calculation details toggle', () => {
    const optionsWithCalcDetails: PDFExportOptions = {
      ...mockOptions,
      includeCalculationDetails: true,
    }

    render(<PDFOptions options={optionsWithCalcDetails} onChange={vi.fn()} />)

    const toggle = screen.getByRole('switch', {
      name: /include calculation details/i,
    })
    expect(toggle).toBeChecked()
  })

  it('calls onChange when cover page toggle is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<PDFOptions options={mockOptions} onChange={onChange} />)

    const toggle = screen.getByRole('switch', { name: /include cover page/i })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...mockOptions,
      includeCoverPage: true,
    })
  })

  it('calls onChange when calculation details toggle is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<PDFOptions options={mockOptions} onChange={onChange} />)

    const toggle = screen.getByRole('switch', {
      name: /include calculation details/i,
    })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...mockOptions,
      includeCalculationDetails: true,
    })
  })

  it('toggles cover page from true to false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const optionsWithCoverPage: PDFExportOptions = {
      ...mockOptions,
      includeCoverPage: true,
    }

    render(<PDFOptions options={optionsWithCoverPage} onChange={onChange} />)

    const toggle = screen.getByRole('switch', { name: /include cover page/i })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...optionsWithCoverPage,
      includeCoverPage: false,
    })
  })

  it('toggles calculation details from true to false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const optionsWithCalcDetails: PDFExportOptions = {
      ...mockOptions,
      includeCalculationDetails: true,
    }

    render(<PDFOptions options={optionsWithCalcDetails} onChange={onChange} />)

    const toggle = screen.getByRole('switch', {
      name: /include calculation details/i,
    })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...optionsWithCalcDetails,
      includeCalculationDetails: false,
    })
  })

  it('preserves other options when toggling cover page', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const customOptions: PDFExportOptions = {
      includeCoverPage: false,
      includeCalculationDetails: true,
      includeCalculations: false,
      includeCharts: true,
      pageOrientation: 'landscape',
    }

    render(<PDFOptions options={customOptions} onChange={onChange} />)

    const toggle = screen.getByRole('switch', { name: /include cover page/i })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      includeCoverPage: true,
      includeCalculationDetails: true,
      includeCalculations: false,
      includeCharts: true,
      pageOrientation: 'landscape',
    })
  })
})
