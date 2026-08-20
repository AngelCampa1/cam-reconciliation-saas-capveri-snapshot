/**
 * PDFOptions component.
 *
 * Format-specific options for PDF export.
 */

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PDFExportOptions } from '../types'

interface PDFOptionsProps {
  options: PDFExportOptions
  onChange: (options: PDFExportOptions) => void
}

export function PDFOptions({ options, onChange }: PDFOptionsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">PDF Options</h3>
      <div className="space-y-3 p-4 rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between transition-colors duration-fast hover:bg-muted/30 p-2 -m-2 rounded">
          <Label
            htmlFor="include-cover-page"
            className="flex-1 text-sm font-normal"
          >
            Include Cover Page
          </Label>
          <Switch
            id="include-cover-page"
            checked={options.includeCoverPage}
            onCheckedChange={(checked) =>
              onChange({ ...options, includeCoverPage: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between transition-colors duration-fast hover:bg-muted/30 p-2 -m-2 rounded">
          <Label
            htmlFor="include-calculation-details"
            className="flex-1 text-sm font-normal"
          >
            Include Calculation Details
          </Label>
          <Switch
            id="include-calculation-details"
            checked={options.includeCalculationDetails}
            onCheckedChange={(checked) =>
              onChange({ ...options, includeCalculationDetails: checked })
            }
          />
        </div>
      </div>
    </div>
  )
}
