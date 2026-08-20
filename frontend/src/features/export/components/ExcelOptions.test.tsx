/**
 * Tests for ExcelOptions component.
 *
 * Validates Excel-specific export options controls.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExcelOptions } from './ExcelOptions'
import type { ExcelExportOptions } from '../types'

const mockOptions: ExcelExportOptions = {
  separateSheetsPerTenant: false,
  includeFormulas: false,
  includeSummary: true,
  includeRawData: false,
  sheetFormat: 'detailed',
}

describe('ExcelOptions', () => {
  it('renders Excel options heading', () => {
    render(<ExcelOptions options={mockOptions} onChange={vi.fn()} />)

    expect(screen.getByText('Excel Options')).toBeInTheDocument()
  })

  it('renders separate sheets per tenant toggle', () => {
    render(<ExcelOptions options={mockOptions} onChange={vi.fn()} />)

    expect(
      screen.getByLabelText(/separate sheets per tenant/i)
    ).toBeInTheDocument()
  })

  it('renders include formulas toggle', () => {
    render(<ExcelOptions options={mockOptions} onChange={vi.fn()} />)

    expect(screen.getByLabelText(/include formulas/i)).toBeInTheDocument()
  })

  it('displays correct initial state for separate sheets toggle', () => {
    const optionsWithSeparateSheets: ExcelExportOptions = {
      ...mockOptions,
      separateSheetsPerTenant: true,
    }

    render(
      <ExcelOptions options={optionsWithSeparateSheets} onChange={vi.fn()} />
    )

    const toggle = screen.getByRole('switch', {
      name: /separate sheets per tenant/i,
    })
    expect(toggle).toBeChecked()
  })

  it('displays correct initial state for include formulas toggle', () => {
    const optionsWithFormulas: ExcelExportOptions = {
      ...mockOptions,
      includeFormulas: true,
    }

    render(<ExcelOptions options={optionsWithFormulas} onChange={vi.fn()} />)

    const toggle = screen.getByRole('switch', { name: /include formulas/i })
    expect(toggle).toBeChecked()
  })

  it('calls onChange when separate sheets toggle is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<ExcelOptions options={mockOptions} onChange={onChange} />)

    const toggle = screen.getByRole('switch', {
      name: /separate sheets per tenant/i,
    })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...mockOptions,
      separateSheetsPerTenant: true,
    })
  })

  it('calls onChange when include formulas toggle is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<ExcelOptions options={mockOptions} onChange={onChange} />)

    const toggle = screen.getByRole('switch', { name: /include formulas/i })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...mockOptions,
      includeFormulas: true,
    })
  })

  it('toggles separate sheets from true to false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const optionsWithSeparateSheets: ExcelExportOptions = {
      ...mockOptions,
      separateSheetsPerTenant: true,
    }

    render(
      <ExcelOptions options={optionsWithSeparateSheets} onChange={onChange} />
    )

    const toggle = screen.getByRole('switch', {
      name: /separate sheets per tenant/i,
    })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...optionsWithSeparateSheets,
      separateSheetsPerTenant: false,
    })
  })

  it('toggles include formulas from true to false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const optionsWithFormulas: ExcelExportOptions = {
      ...mockOptions,
      includeFormulas: true,
    }

    render(<ExcelOptions options={optionsWithFormulas} onChange={onChange} />)

    const toggle = screen.getByRole('switch', { name: /include formulas/i })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      ...optionsWithFormulas,
      includeFormulas: false,
    })
  })

  it('preserves other options when toggling separate sheets', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const customOptions: ExcelExportOptions = {
      separateSheetsPerTenant: false,
      includeFormulas: true,
      includeSummary: false,
      includeRawData: true,
      sheetFormat: 'summary',
    }

    render(<ExcelOptions options={customOptions} onChange={onChange} />)

    const toggle = screen.getByRole('switch', {
      name: /separate sheets per tenant/i,
    })
    await user.click(toggle)

    expect(onChange).toHaveBeenCalledWith({
      separateSheetsPerTenant: true,
      includeFormulas: true,
      includeSummary: false,
      includeRawData: true,
      sheetFormat: 'summary',
    })
  })
})
