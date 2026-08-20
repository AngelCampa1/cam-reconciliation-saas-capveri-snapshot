/**
 * ExportOptionsPanel component.
 *
 * Main panel for selecting export format and configuring format-specific options.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormatCard } from './FormatCard'
import { FormatOptions } from './FormatOptions'
import {
  EXPORT_FORMATS,
  type ERPExportOptions,
  type ExcelExportOptions,
  type ExportFormat,
  type PDFExportOptions,
} from '../types'
import { ERPFormat } from '@/types/enums'

interface ExportOptionsPanelProps {
  snapshotId: string
  onExport: (
    format: ExportFormat,
    options: PDFExportOptions | ExcelExportOptions | ERPExportOptions
  ) => void
  isExporting?: boolean
}

export function ExportOptionsPanel({
  onExport,
  isExporting = false,
}: ExportOptionsPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(
    null
  )
  const [pdfOptions, setPdfOptions] = useState<PDFExportOptions>({
    includeCoverPage: true,
    includeCalculationDetails: false,
  })
  const [excelOptions, setExcelOptions] = useState<ExcelExportOptions>({
    separateSheetsPerTenant: true,
    includeFormulas: true,
  })
  const [erpOptions, setErpOptions] = useState<ERPExportOptions>({
    targetSystem: ERPFormat.CSV,
  })

  const handleExport = () => {
    if (!selectedFormat) return

    let options: PDFExportOptions | ExcelExportOptions | ERPExportOptions

    if (selectedFormat === 'pdf') {
      options = pdfOptions
    } else if (selectedFormat === 'excel') {
      options = excelOptions
    } else {
      // For ERP formats, set targetSystem to match selected format
      options = { targetSystem: selectedFormat as ERPFormat }
    }

    onExport(selectedFormat, options)
  }

  return (
    <div className="space-y-6" data-testid="export-options-panel">
      <div>
        <h2 className="mb-4 text-lg font-semibold">Select Export Format</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EXPORT_FORMATS.map((format) => (
            <FormatCard
              key={format.id}
              format={format}
              selected={selectedFormat === format.id}
              onClick={() => {
                setSelectedFormat(format.id)
                // Update ERP options when selecting an ERP format
                if (
                  format.id === 'yardi' ||
                  format.id === 'mri' ||
                  format.id === 'csv'
                ) {
                  setErpOptions({ targetSystem: format.id as ERPFormat })
                }
              }}
            />
          ))}
        </div>
      </div>

      {selectedFormat && (
        <div className="border-t pt-6">
          <FormatOptions
            format={selectedFormat}
            pdfOptions={pdfOptions}
            excelOptions={excelOptions}
            erpOptions={erpOptions}
            onPDFOptionsChange={setPdfOptions}
            onExcelOptionsChange={setExcelOptions}
            onERPOptionsChange={setErpOptions}
          />
        </div>
      )}

      <div className="border-t pt-6">
        <Button
          onClick={handleExport}
          disabled={!selectedFormat || isExporting}
          className="w-full"
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting…
            </>
          ) : (
            'Export'
          )}
        </Button>
      </div>
    </div>
  )
}
