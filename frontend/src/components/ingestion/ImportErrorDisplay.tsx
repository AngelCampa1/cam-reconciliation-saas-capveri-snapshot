import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/number'
import { pluralizeWithCount } from '@/lib/pluralize'
import {
  AlertCircle,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

export type ErrorType =
  | 'validation'
  | 'missing_required'
  | 'invalid_format'
  | 'duplicate'
  | 'parsing'

export interface ImportError {
  row: number
  column?: string
  errorType: ErrorType
  message: string
  actualValue?: string
  expectedFormat?: string
}

export interface ImportErrorSummary {
  totalRows: number
  successfulRows: number
  failedRows: number
  errors: ImportError[]
  fileName: string
}

interface ImportErrorDisplayProps {
  summary: ImportErrorSummary
  onDownloadReport?: () => void
  onRetry?: () => void
  maxVisibleErrors?: number
}

const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  validation: 'Validation Error',
  missing_required: 'Missing Required Field',
  invalid_format: 'Invalid Format',
  duplicate: 'Duplicate Entry',
  parsing: 'Parsing Error',
}

const ERROR_TYPE_COLORS: Record<ErrorType, string> = {
  validation: 'text-warning-foreground bg-warning/10',
  missing_required: 'text-destructive-strong bg-destructive/10',
  invalid_format: 'text-warning-foreground bg-warning/10',
  duplicate: 'text-primary bg-primary/10',
  parsing: 'text-secondary bg-secondary/10',
}

export function ImportErrorDisplay({
  summary,
  onDownloadReport,
  onRetry,
  maxVisibleErrors = 50,
}: ImportErrorDisplayProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<ErrorType>>(new Set())
  const [showAllErrors, setShowAllErrors] = useState(false)

  const errorsByType = useMemo(() => {
    const grouped = new Map<ErrorType, ImportError[]>()
    summary.errors.forEach((error) => {
      const existing = grouped.get(error.errorType) || []
      grouped.set(error.errorType, [...existing, error])
    })
    return grouped
  }, [summary.errors])

  const visibleErrors = useMemo(() => {
    return showAllErrors
      ? summary.errors
      : summary.errors.slice(0, maxVisibleErrors)
  }, [summary.errors, showAllErrors, maxVisibleErrors])

  const toggleErrorType = (type: ErrorType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const successRate =
    summary.totalRows > 0
      ? ((summary.successfulRows / summary.totalRows) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <AlertCircle
          className="h-6 w-6 text-destructive flex-shrink-0 mt-1"
          aria-hidden="true"
        />
        <div className="flex-1">
          <h3 className="font-semibold text-lg">Import Errors</h3>
          <p className="text-sm text-muted-foreground">{summary.fileName}</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 bg-card shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              Total Rows
            </span>
          </div>
          <p className="text-lg md:text-xl lg:text-2xl font-bold">
            {formatNumber(summary.totalRows)}
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-card shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="text-sm font-medium text-success-strong">
              Successful
            </span>
          </div>
          <p className="text-lg md:text-xl lg:text-2xl font-bold text-success">
            {formatNumber(summary.successfulRows)}
            <span className="text-sm font-normal ml-2">({successRate}%)</span>
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-card shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            <span className="text-sm font-medium text-destructive-strong">
              Failed
            </span>
          </div>
          <p className="text-lg md:text-xl lg:text-2xl font-bold text-destructive">
            {formatNumber(summary.failedRows)}
            <span className="text-sm font-normal ml-2 text-destructive-strong">
              ({pluralizeWithCount(summary.errors.length, 'error')})
            </span>
          </p>
        </div>
      </div>

      {/* Error Summary Alert */}
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          {summary.failedRows} row{summary.failedRows !== 1 ? 's' : ''} failed
          to import due to {summary.errors.length} error
          {summary.errors.length !== 1 ? 's' : ''}. Review the errors below and
          correct your source file.
        </AlertDescription>
      </Alert>

      {/* Errors Grouped by Type */}
      <div className="space-y-2">
        <h4 className="font-medium text-sm">Errors by Type</h4>
        {Array.from(errorsByType.entries()).map(([type, errors]) => (
          <div key={type} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleErrorType(type)}
              aria-expanded={expandedTypes.has(type)}
              className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors duration-fast"
            >
              <div className="flex items-center gap-2">
                {expandedTypes.has(type) ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
                <span
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium',
                    ERROR_TYPE_COLORS[type]
                  )}
                >
                  {ERROR_TYPE_LABELS[type]}
                </span>
                <span className="text-sm text-muted-foreground">
                  {errors.length} occurrence{errors.length !== 1 ? 's' : ''}
                </span>
              </div>
            </button>

            {expandedTypes.has(type) && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Import error details</caption>
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium">Row</th>
                      <th className="text-left p-2 text-xs font-medium">
                        Column
                      </th>
                      <th className="text-left p-2 text-xs font-medium">
                        Message
                      </th>
                      <th className="text-left p-2 text-xs font-medium">
                        Actual Value
                      </th>
                      <th className="text-left p-2 text-xs font-medium">
                        Expected Format
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((error, index) => (
                      <tr
                        key={`${error.row}-${index}`}
                        className={cn(
                          'border-t',
                          index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                        )}
                      >
                        <td className="p-2 text-sm font-mono">{error.row}</td>
                        <td className="p-2 text-sm font-mono">
                          {error.column || '-'}
                        </td>
                        <td className="p-2 text-sm">{error.message}</td>
                        <td className="p-2 text-sm font-mono">
                          {error.actualValue ? (
                            <code className="px-1 py-0.5 rounded bg-muted text-xs">
                              {error.actualValue}
                            </code>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-2 text-sm text-muted-foreground">
                          {error.expectedFormat || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* All Errors Table (when expanded) */}
      {summary.errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">
            All Errors ({summary.errors.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <caption className="sr-only">Import error row details</caption>
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 text-xs font-medium">Row</th>
                    <th className="text-left p-2 text-xs font-medium">
                      Column
                    </th>
                    <th className="text-left p-2 text-xs font-medium">Type</th>
                    <th className="text-left p-2 text-xs font-medium">
                      Message
                    </th>
                    <th className="text-left p-2 text-xs font-medium">
                      Actual Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleErrors.map((error, index) => (
                    <tr
                      key={`${error.row}-${index}`}
                      className={cn(
                        'border-t',
                        index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                      )}
                    >
                      <td className="p-2 text-sm font-mono">{error.row}</td>
                      <td className="p-2 text-sm font-mono">
                        {error.column || '-'}
                      </td>
                      <td className="p-2">
                        <span
                          className={cn(
                            'px-2 py-1 rounded text-xs font-medium',
                            ERROR_TYPE_COLORS[error.errorType]
                          )}
                        >
                          {ERROR_TYPE_LABELS[error.errorType]}
                        </span>
                      </td>
                      <td className="p-2 text-sm">{error.message}</td>
                      <td className="p-2 text-sm font-mono">
                        {error.actualValue ? (
                          <code className="px-1 py-0.5 rounded bg-muted text-xs">
                            {error.actualValue}
                          </code>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {summary.errors.length > maxVisibleErrors && !showAllErrors && (
              <div className="border-t p-3 bg-muted/30 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllErrors(true)}
                >
                  Show {summary.errors.length - maxVisibleErrors} more errors
                </Button>
              </div>
            )}

            {showAllErrors && summary.errors.length > maxVisibleErrors && (
              <div className="border-t p-3 bg-muted/30 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllErrors(false)}
                >
                  Show fewer errors
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {onDownloadReport && (
          <Button variant="outline" onClick={onDownloadReport}>
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            Download Error Report
          </Button>
        )}
        {onRetry && (
          <Button onClick={onRetry}>
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Upload Corrected File
          </Button>
        )}
      </div>
    </div>
  )
}
