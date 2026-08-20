import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Table,
  CheckCircle2,
  AlertCircle,
  Info,
  Save,
  Eye,
  X,
} from 'lucide-react'

export interface ColumnMapping {
  sourceColumn: string
  targetField: string | null // null means "skip this column"
  confidence?: number // 0-100 for auto-detection confidence
}

export interface SampleData {
  columnName: string
  sampleValues: string[] // First 5 rows of data
}

interface ColumnMappingWizardProps {
  sampleData: SampleData[]
  requiredFields: string[]
  optionalFields: string[]
  initialMappings?: ColumnMapping[]
  onConfirm: (mappings: ColumnMapping[]) => void
  onCancel?: () => void
  onSaveTemplate?: (templateName: string, mappings: ColumnMapping[]) => void
}

const FIELD_LABELS: Record<string, string> = {
  account: 'Account Code',
  amount: 'Amount',
  date: 'Date',
  description: 'Description',
  reference: 'Reference',
  entity: 'Entity/Property',
  debit: 'Debit Amount',
  credit: 'Credit Amount',
}

export function ColumnMappingWizard({
  sampleData,
  requiredFields,
  optionalFields,
  initialMappings,
  onConfirm,
  onCancel,
  onSaveTemplate,
}: ColumnMappingWizardProps) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(() => {
    if (initialMappings) return initialMappings

    // Auto-detect initial mappings
    const availableFields = [...requiredFields, ...optionalFields]
    return sampleData.map((data) => {
      const targetField = autoDetectField(data.columnName, availableFields)
      return {
        sourceColumn: data.columnName,
        targetField,
        confidence: targetField
          ? calculateConfidence(data.columnName, targetField)
          : 0,
      }
    })
  })

  const [showPreview, setShowPreview] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const validation = useMemo(() => {
    const mappedFields = new Set(
      mappings.map((m) => m.targetField).filter((f) => f !== null)
    )
    const missingRequired = requiredFields.filter((f) => !mappedFields.has(f))
    const duplicates = findDuplicateMappings(mappings)

    return {
      isValid: missingRequired.length === 0 && duplicates.length === 0,
      missingRequired,
      duplicates,
    }
  }, [mappings, requiredFields])

  const handleMappingChange = (sourceColumn: string, targetField: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn
          ? { ...m, targetField: targetField === 'skip' ? null : targetField }
          : m
      )
    )
  }

  const handleConfirm = () => {
    if (validation.isValid) {
      onConfirm(mappings)
    }
  }

  const handleSaveTemplate = () => {
    if (templateName.trim() && onSaveTemplate) {
      onSaveTemplate(templateName.trim(), mappings)
      setShowSaveTemplate(false)
      setTemplateName('')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Table
          className="h-6 w-6 text-primary flex-shrink-0 mt-1"
          aria-hidden="true"
        />
        <div className="flex-1">
          <h3 className="font-semibold text-lg">Map Columns</h3>
          <p className="text-sm text-muted-foreground">
            Match your file columns to required fields. Required fields are
            marked with an asterisk (*).
          </p>
        </div>
      </div>

      {/* Validation Errors */}
      {validation.missingRequired.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Missing required fields:{' '}
            {validation.missingRequired
              .map((f) => FIELD_LABELS[f] || f)
              .join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {validation.duplicates.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Duplicate mappings detected for:{' '}
            {validation.duplicates.map((f) => FIELD_LABELS[f] || f).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Mapping Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Column mapping configuration</caption>
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 text-sm font-medium">
                  Source Column
                </th>
                <th className="text-left p-3 text-sm font-medium">
                  Sample Values
                </th>
                <th className="text-left p-3 text-sm font-medium">Maps To</th>
                <th className="text-left p-3 text-sm font-medium w-16">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => {
                const sample = sampleData.find(
                  (s) => s.columnName === mapping.sourceColumn
                )
                const isRequired =
                  mapping.targetField &&
                  requiredFields.includes(mapping.targetField)
                const hasAutoDetection = mapping.confidence !== undefined

                return (
                  <tr
                    key={mapping.sourceColumn}
                    className={cn(
                      'border-t',
                      index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                    )}
                  >
                    <td className="p-3">
                      <p className="font-medium text-sm">
                        {mapping.sourceColumn}
                      </p>
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {sample?.sampleValues.slice(0, 3).map((val, i) => (
                          <p
                            key={i}
                            className="truncate max-w-xs"
                            title={typeof val === 'string' ? val : undefined}
                          >
                            {val || <span className="italic">(empty)</span>}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <Select
                        value={mapping.targetField || 'skip'}
                        onValueChange={(value) =>
                          handleMappingChange(mapping.sourceColumn, value)
                        }
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={`Map column ${mapping.sourceColumn}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">
                            <span className="text-muted-foreground">
                              Skip this column
                            </span>
                          </SelectItem>
                          {requiredFields.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                Required Fields
                              </div>
                              {requiredFields.map((field) => (
                                <SelectItem key={field} value={field}>
                                  {FIELD_LABELS[field] || field} *
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {optionalFields.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                Optional Fields
                              </div>
                              {optionalFields.map((field) => (
                                <SelectItem key={field} value={field}>
                                  {FIELD_LABELS[field] || field}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-center">
                      {mapping.targetField === null ? (
                        <>
                          <X
                            className="h-4 w-4 text-muted-foreground mx-auto"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Unmapped</span>
                        </>
                      ) : isRequired ? (
                        <>
                          <CheckCircle2
                            className="h-4 w-4 text-success mx-auto"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Mapped required field</span>
                        </>
                      ) : hasAutoDetection && mapping.confidence! >= 80 ? (
                        <>
                          <CheckCircle2
                            className="h-4 w-4 text-primary mx-auto"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Mapped optional field</span>
                        </>
                      ) : (
                        <>
                          <Info
                            className="h-4 w-4 text-muted-foreground mx-auto"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Mapped optional field</span>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Toggle */}
      {showPreview && (
        <div className="border rounded-lg p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Mapping Preview</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(false)}
            >
              Hide Preview
            </Button>
          </div>
          <div className="space-y-2">
            {mappings
              .filter((m) => m.targetField !== null)
              .map((m) => (
                <div
                  key={m.sourceColumn}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {m.sourceColumn}
                  </span>
                  <span>→</span>
                  <span className="font-medium">
                    {FIELD_LABELS[m.targetField!] || m.targetField}
                  </span>
                  {m.confidence && m.confidence >= 80 && (
                    <span className="text-xs text-primary">
                      ({m.confidence}% confident)
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Save Template Form */}
      {showSaveTemplate && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Save Mapping Template</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSaveTemplate(false)
                setTemplateName('')
              }}
            >
              Cancel
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              placeholder="e.g., Yardi GL Standard Format"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSaveTemplate}
            disabled={!templateName.trim()}
            size="sm"
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Template
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {!showPreview && (
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-2" aria-hidden="true" />
            Preview Mapping
          </Button>
        )}
        {onSaveTemplate && !showSaveTemplate && (
          <Button
            variant="outline"
            onClick={() => setShowSaveTemplate(true)}
            disabled={!validation.isValid}
          >
            <Save className="h-4 w-4 mr-2" />
            Save as Template
          </Button>
        )}
        <div className="flex-1" />
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={handleConfirm} disabled={!validation.isValid}>
          Continue with Mapping
        </Button>
      </div>
    </div>
  )
}

// Helper: Auto-detect field based on column name
function autoDetectField(
  columnName: string,
  availableFields: string[]
): string | null {
  const normalized = columnName.toLowerCase().replace(/[^a-z0-9]/g, '')

  const patterns: Record<string, string[]> = {
    account: ['account', 'acct', 'glaccount', 'glcode', 'accountcode'],
    amount: ['amount', 'amt', 'total', 'value'],
    date: ['date', 'dt', 'transdate', 'postdate', 'period'],
    description: ['description', 'desc', 'memo', 'note', 'details'],
    reference: ['reference', 'ref', 'refno', 'referencenumber'],
    entity: ['entity', 'property', 'prop', 'building', 'site'],
    debit: ['debit', 'dr', 'debitamount'],
    credit: ['credit', 'cr', 'creditamount'],
  }

  for (const field of availableFields) {
    const fieldPatterns = patterns[field]
    if (fieldPatterns?.some((pattern) => normalized.includes(pattern))) {
      return field
    }
  }

  return null
}

// Helper: Calculate confidence score for auto-detection
function calculateConfidence(columnName: string, targetField: string): number {
  const normalized = columnName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = targetField.toLowerCase()

  // Exact match
  if (normalized === target) return 100

  // Contains full word
  if (normalized.includes(target)) return 90

  // Partial match
  if (normalized.includes(target.slice(0, 4))) return 70

  return 50
}

// Helper: Find duplicate target field mappings
function findDuplicateMappings(mappings: ColumnMapping[]): string[] {
  const fieldCounts = new Map<string, number>()

  mappings.forEach((m) => {
    if (m.targetField !== null) {
      fieldCounts.set(m.targetField, (fieldCounts.get(m.targetField) || 0) + 1)
    }
  })

  return Array.from(fieldCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([field]) => field)
}
