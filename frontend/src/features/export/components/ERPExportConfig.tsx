/**
 * ERPExportConfig component.
 *
 * Configure ERP-specific export settings including field mappings and output format.
 */

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Download, Save } from 'lucide-react'
import { FieldMappingTable } from './FieldMappingTable'
import type { ERPSystem, DateFormat, FieldMapping, ERPConfig } from '../types'
import { ERP_FIELD_MAPPINGS } from '../types'

export interface ERPExportConfigProps {
  snapshotId: string
  onExport: (config: ERPConfig) => void
  onSaveTemplate?: (config: ERPConfig, name: string) => void
  isExporting?: boolean
}

export function ERPExportConfig({
  onExport,
  onSaveTemplate,
  isExporting = false,
}: ERPExportConfigProps) {
  const [system, setSystem] = useState<ERPSystem>('yardi')
  const [dateFormat, setDateFormat] = useState<DateFormat>('MMDDYYYY')
  const [mappingOverrides, setMappingOverrides] = useState<
    Partial<FieldMapping>[]
  >([])
  const [glAccountOverrides, setGLAccountOverrides] = useState<string>('')
  const [templateName, setTemplateName] = useState<string>('')

  const defaultMappings = ERP_FIELD_MAPPINGS[system]

  // Merge default mappings with overrides
  const finalMappings = useMemo(() => {
    return defaultMappings.map((defaultMapping) => {
      const override = mappingOverrides.find(
        (o) => o.sourceField === defaultMapping.sourceField
      )
      return override ? { ...defaultMapping, ...override } : defaultMapping
    })
  }, [defaultMappings, mappingOverrides])

  // Parse GL account overrides
  const parsedGLOverrides = useMemo(() => {
    if (!glAccountOverrides.trim()) return undefined
    const overrides: Record<string, string> = {}
    glAccountOverrides.split('\n').forEach((line) => {
      const [from, to] = line.split('=').map((s) => s.trim())
      if (from && to) {
        overrides[from] = to
      }
    })
    return Object.keys(overrides).length > 0 ? overrides : undefined
  }, [glAccountOverrides])

  // Validate configuration
  const validationErrors = useMemo(() => {
    const errors: string[] = []
    finalMappings.forEach((mapping) => {
      if (mapping.required && !mapping.targetField) {
        errors.push(`Missing required target field for ${mapping.sourceField}`)
      }
    })
    return errors
  }, [finalMappings])

  // Generate preview
  const preview = useMemo(() => {
    const sampleData = {
      date: '2024-12-31',
      accountCode: '6000',
      debitAmount: '1500.00',
      creditAmount: '0.00',
      amount: '1500.00',
      description: 'CAM Reconciliation - Q4 2024',
      reference: 'CAM-2024-Q4',
      source: 'CAM',
    }

    if (system === 'yardi') {
      return finalMappings
        .map((m) => {
          const value =
            sampleData[m.sourceField as keyof typeof sampleData] ||
            m.defaultValue ||
            ''
          return `${m.targetField}: ${value}`
        })
        .join('\n')
    }

    if (system === 'mri') {
      return finalMappings
        .map((m) => {
          let value =
            sampleData[m.sourceField as keyof typeof sampleData] ||
            m.defaultValue ||
            ''
          if (m.maxLength) {
            value = String(value).padStart(m.maxLength)
          }
          return `${m.targetField.padEnd(15)}: ${value}`
        })
        .join('\n')
    }

    // Custom CSV
    const headers = finalMappings.map((m) => m.targetField).join(',')
    const values = finalMappings
      .map(
        (m) =>
          sampleData[m.sourceField as keyof typeof sampleData] ||
          m.defaultValue ||
          ''
      )
      .join(',')
    return `${headers}\n${values}`
  }, [system, finalMappings])

  const handleExport = () => {
    const config: ERPConfig = {
      system,
      dateFormat,
      fieldMappings: finalMappings,
      ...(parsedGLOverrides && { glAccountOverrides: parsedGLOverrides }),
      ...(templateName.trim() && { templateName }),
    }
    onExport(config)
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return
    const config: ERPConfig = {
      system,
      dateFormat,
      fieldMappings: finalMappings,
      ...(parsedGLOverrides && { glAccountOverrides: parsedGLOverrides }),
    }
    onSaveTemplate?.(config, templateName)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        <div className="space-y-2">
          <Label htmlFor="erp-system">ERP System</Label>
          <Select
            value={system}
            onValueChange={(value) => setSystem(value as ERPSystem)}
          >
            <SelectTrigger id="erp-system">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yardi">Yardi Voyager</SelectItem>
              <SelectItem value="mri">MRI Commercial</SelectItem>
              <SelectItem value="custom">Custom CSV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date-format">Date Format</Label>
          <Select
            value={dateFormat}
            onValueChange={(value) => setDateFormat(value as DateFormat)}
          >
            <SelectTrigger id="date-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MMDDYYYY">MM/DD/YYYY (12/31/2024)</SelectItem>
              <SelectItem value="YYYYMMDD">YYYYMMDD (20241231)</SelectItem>
              <SelectItem value="DDMMYYYY">DD/MM/YYYY (31/12/2024)</SelectItem>
              <SelectItem value="MM/DD/YYYY">
                MM/DD/YYYY (12/31/2024)
              </SelectItem>
              <SelectItem value="YYYY-MM-DD">
                YYYY-MM-DD (2024-12-31)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Field Mappings</Label>
        <FieldMappingTable
          fields={defaultMappings}
          overrides={mappingOverrides}
          onChange={setMappingOverrides}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gl-overrides">GL Account Overrides (Optional)</Label>
        <p className="text-sm text-muted-foreground">
          Map source GL accounts to target accounts. One per line: 6000=60000
        </p>
        <textarea
          id="gl-overrides"
          value={glAccountOverrides}
          onChange={(e) => setGLAccountOverrides(e.target.value)}
          className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="6000=60000&#10;6100=61000"
        />
      </div>

      <Card className="p-4 bg-muted shadow-sm">
        <h4 className="font-semibold mb-2">Output Preview</h4>
        <pre className="text-xs overflow-x-auto bg-background p-3 rounded border shadow-sm">
          {preview}
        </pre>
      </Card>

      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-1">Configuration errors:</div>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {onSaveTemplate && (
        <div className="space-y-2">
          <Label htmlFor="template-name">Template Name (Optional)</Label>
          <div className="flex gap-2">
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Q4 2024 CAM Export"
            />
            <Button
              variant="outline"
              onClick={handleSaveTemplate}
              disabled={!templateName.trim() || validationErrors.length > 0}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save Template
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleExport}
          disabled={validationErrors.length > 0 || isExporting}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export to{' '}
          {system === 'yardi' ? 'Yardi' : system === 'mri' ? 'MRI' : 'CSV'}
        </Button>
      </div>
    </div>
  )
}
