/**
 * ExcelOptions component.
 *
 * Format-specific options for Excel export.
 */

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ExcelExportOptions } from '../types'

interface ExcelOptionsProps {
  options: ExcelExportOptions
  onChange: (options: ExcelExportOptions) => void
}

export function ExcelOptions({ options, onChange }: ExcelOptionsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Excel Options</h3>
      <div className="space-y-3 p-4 rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between transition-colors duration-fast hover:bg-muted/30 p-2 -m-2 rounded">
          <Label
            htmlFor="separate-sheets-per-tenant"
            className="flex-1 text-sm font-normal"
          >
            Separate Sheets Per Tenant
          </Label>
          <Switch
            id="separate-sheets-per-tenant"
            checked={options.separateSheetsPerTenant}
            onCheckedChange={(checked) =>
              onChange({ ...options, separateSheetsPerTenant: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between transition-colors duration-fast hover:bg-muted/30 p-2 -m-2 rounded">
          <Label
            htmlFor="include-formulas"
            className="flex-1 text-sm font-normal"
          >
            Include Formulas
          </Label>
          <Switch
            id="include-formulas"
            checked={options.includeFormulas}
            onCheckedChange={(checked) =>
              onChange({ ...options, includeFormulas: checked })
            }
          />
        </div>
      </div>
    </div>
  )
}
