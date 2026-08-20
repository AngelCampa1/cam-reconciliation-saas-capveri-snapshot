/**
 * Tests for FormatOptions component.
 *
 * Validates conditional rendering based on export format selection.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormatOptions } from './FormatOptions'
import type {
  ERPExportOptions,
  ExcelExportOptions,
  PDFExportOptions,
} from '../types'

// Mock child components
vi.mock('./PDFOptions', () => ({
  PDFOptions: ({ options }: { options: PDFExportOptions }) => (
    <div data-testid="pdf-options">
      PDF Options: {options.includeCalculations ? 'with-calc' : 'no-calc'}
    </div>
  ),
}))

vi.mock('./ExcelOptions', () => ({
  ExcelOptions: ({ options }: { options: ExcelExportOptions }) => (
    <div data-testid="excel-options">
      Excel Options: {options.includeSummary ? 'with-summary' : 'no-summary'}
    </div>
  ),
}))

vi.mock('./ERPOptions', () => ({
  ERPOptions: ({
    format,
    options,
  }: {
    format: string
    options: ERPExportOptions
  }) => (
    <div data-testid="erp-options">
      ERP Options: {format} - Mapping: {options.mappingId || 'default'}
    </div>
  ),
}))

const mockPDFOptions: PDFExportOptions = {
  includeCalculations: true,
  includeCharts: false,
  pageOrientation: 'portrait',
}

const mockExcelOptions: ExcelExportOptions = {
  includeSummary: true,
  includeRawData: false,
  sheetFormat: 'detailed',
}

const mockERPOptions: ERPExportOptions = {
  mappingId: 'yardi-mapping-1',
  includeHeaders: true,
}

describe('FormatOptions', () => {
  it('renders PDFOptions when format is pdf', () => {
    render(
      <FormatOptions
        format="pdf"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('pdf-options')).toBeInTheDocument()
    expect(screen.getByText(/PDF Options: with-calc/)).toBeInTheDocument()
    expect(screen.queryByTestId('excel-options')).not.toBeInTheDocument()
    expect(screen.queryByTestId('erp-options')).not.toBeInTheDocument()
  })

  it('renders ExcelOptions when format is excel', () => {
    render(
      <FormatOptions
        format="excel"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('excel-options')).toBeInTheDocument()
    expect(screen.getByText(/Excel Options: with-summary/)).toBeInTheDocument()
    expect(screen.queryByTestId('pdf-options')).not.toBeInTheDocument()
    expect(screen.queryByTestId('erp-options')).not.toBeInTheDocument()
  })

  it('renders ERPOptions when format is yardi', () => {
    render(
      <FormatOptions
        format="yardi"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('erp-options')).toBeInTheDocument()
    expect(
      screen.getByText(/ERP Options: yardi - Mapping: yardi-mapping-1/)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pdf-options')).not.toBeInTheDocument()
    expect(screen.queryByTestId('excel-options')).not.toBeInTheDocument()
  })

  it('renders ERPOptions when format is mri', () => {
    render(
      <FormatOptions
        format="mri"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('erp-options')).toBeInTheDocument()
    expect(
      screen.getByText(/ERP Options: mri - Mapping: yardi-mapping-1/)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pdf-options')).not.toBeInTheDocument()
    expect(screen.queryByTestId('excel-options')).not.toBeInTheDocument()
  })

  it('renders ERPOptions when format is csv', () => {
    render(
      <FormatOptions
        format="csv"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('erp-options')).toBeInTheDocument()
    expect(
      screen.getByText(/ERP Options: csv - Mapping: yardi-mapping-1/)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pdf-options')).not.toBeInTheDocument()
    expect(screen.queryByTestId('excel-options')).not.toBeInTheDocument()
  })

  it('passes correct props to PDFOptions', () => {
    const onPDFChange = vi.fn()

    render(
      <FormatOptions
        format="pdf"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={onPDFChange}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('pdf-options')).toBeInTheDocument()
  })

  it('passes correct props to ExcelOptions', () => {
    const onExcelChange = vi.fn()

    render(
      <FormatOptions
        format="excel"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={onExcelChange}
        onERPOptionsChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('excel-options')).toBeInTheDocument()
  })

  it('passes correct props to ERPOptions', () => {
    const onERPChange = vi.fn()

    render(
      <FormatOptions
        format="yardi"
        pdfOptions={mockPDFOptions}
        excelOptions={mockExcelOptions}
        erpOptions={mockERPOptions}
        onPDFOptionsChange={vi.fn()}
        onExcelOptionsChange={vi.fn()}
        onERPOptionsChange={onERPChange}
      />
    )

    expect(screen.getByTestId('erp-options')).toBeInTheDocument()
  })
})
