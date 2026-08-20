/**
 * Tests for ERPOptions component.
 *
 * Validates ERP-specific export options display.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ERPOptions } from './ERPOptions'
import type { ERPExportOptions } from '../types'

const mockOptions: ERPExportOptions = {
  mappingId: 'default-mapping',
  includeHeaders: true,
}

describe('ERPOptions', () => {
  it('renders ERP export options heading', () => {
    render(
      <ERPOptions format="yardi" options={mockOptions} onChange={vi.fn()} />
    )

    expect(screen.getByText('ERP Export Options')).toBeInTheDocument()
  })

  it('displays Yardi Voyager format name when format is yardi', () => {
    render(
      <ERPOptions format="yardi" options={mockOptions} onChange={vi.fn()} />
    )

    expect(
      screen.getByText(/export will be formatted for yardi voyager import/i)
    ).toBeInTheDocument()
  })

  it('displays MRI Commercial format name when format is mri', () => {
    render(<ERPOptions format="mri" options={mockOptions} onChange={vi.fn()} />)

    expect(
      screen.getByText(/export will be formatted for mri commercial import/i)
    ).toBeInTheDocument()
  })

  it('displays Generic CSV format name when format is csv', () => {
    render(<ERPOptions format="csv" options={mockOptions} onChange={vi.fn()} />)

    expect(
      screen.getByText(/export will be formatted for generic csv import/i)
    ).toBeInTheDocument()
  })

  it('displays Generic CSV format name for unknown formats', () => {
    render(
      <ERPOptions
        format={'unknown' as any}
        options={mockOptions}
        onChange={vi.fn()}
      />
    )

    expect(
      screen.getByText(/export will be formatted for generic csv import/i)
    ).toBeInTheDocument()
  })
})
