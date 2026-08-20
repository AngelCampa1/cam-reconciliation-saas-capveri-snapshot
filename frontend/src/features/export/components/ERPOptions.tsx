/**
 * ERPOptions component.
 *
 * Format-specific options for ERP exports (Yardi, MRI).
 */

import { Label } from '@/components/ui/label'
import type { ERPExportOptions, ExportFormat } from '../types'

interface ERPOptionsProps {
  format: ExportFormat
  options: ERPExportOptions
  onChange: (options: ERPExportOptions) => void
}

export function ERPOptions({ format }: ERPOptionsProps) {
  // ERP exports don't currently have additional options beyond format selection
  // The format is already determined by which card was selected
  const formatDisplayName =
    format === 'yardi'
      ? 'Yardi Voyager'
      : format === 'mri'
        ? 'MRI Commercial'
        : 'Generic CSV'

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">ERP Export Options</h3>
      <div className="rounded-md bg-muted p-3 shadow-sm">
        <Label className="text-sm font-normal text-muted-foreground">
          Export will be formatted for {formatDisplayName} import
        </Label>
      </div>
    </div>
  )
}
