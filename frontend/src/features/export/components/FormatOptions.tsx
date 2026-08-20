/**
 * FormatOptions component.
 *
 * Displays format-specific export options based on selected format.
 */

import { ERPOptions } from './ERPOptions'
import { ExcelOptions } from './ExcelOptions'
import { PDFOptions } from './PDFOptions'
import type {
  ERPExportOptions,
  ExcelExportOptions,
  ExportFormat,
  PDFExportOptions,
} from '../types'

interface FormatOptionsProps {
  format: ExportFormat
  pdfOptions: PDFExportOptions
  excelOptions: ExcelExportOptions
  erpOptions: ERPExportOptions
  onPDFOptionsChange: (options: PDFExportOptions) => void
  onExcelOptionsChange: (options: ExcelExportOptions) => void
  onERPOptionsChange: (options: ERPExportOptions) => void
}

export function FormatOptions({
  format,
  pdfOptions,
  excelOptions,
  erpOptions,
  onPDFOptionsChange,
  onExcelOptionsChange,
  onERPOptionsChange,
}: FormatOptionsProps) {
  if (format === 'pdf') {
    return <PDFOptions options={pdfOptions} onChange={onPDFOptionsChange} />
  }

  if (format === 'excel') {
    return (
      <ExcelOptions options={excelOptions} onChange={onExcelOptionsChange} />
    )
  }

  // All other formats are ERP exports (yardi, mri, csv)
  return (
    <ERPOptions
      format={format}
      options={erpOptions}
      onChange={onERPOptionsChange}
    />
  )
}
