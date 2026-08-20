import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useViewport } from '@/hooks/useViewport'
import { VideoCard } from '@/components/video'
import { getVideoForPlacement } from '@/generated/videos'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn, formatDateTime } from '@/lib/utils'
import { formatNumber } from '@/lib/number'
import { SOURCE_LABELS } from '@/lib/source-system'
import { EmptyState } from '@/components/EmptyState'
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Eye,
  Upload,
  Clock,
  FilterX,
} from 'lucide-react'

export type ImportStatus = 'processing' | 'success' | 'failed'

export interface ImportRecord {
  id: string
  fileName: string
  uploadedAt: Date
  source: 'yardi' | 'mri' | 'generic'
  rowCount: number
  status: ImportStatus
  errorMessage?: string
}

interface ImportHistoryListProps {
  imports: ImportRecord[]
  onViewDetails?: (importId: string) => void
  onDelete?: (importId: string) => void
  onReupload?: (importId: string) => void
  onNewImport?: () => void
}

const STATUS_CONFIG: Record<
  ImportStatus,
  {
    label: string
    icon: React.ReactNode
    className: string
  }
> = {
  processing: {
    label: 'Processing',
    icon: (
      <Loader2
        className="h-4 w-4 animate-spin text-primary"
        aria-hidden="true"
      />
    ),
    className: 'text-primary bg-primary/10',
  },
  success: {
    label: 'Success',
    icon: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />,
    className: 'text-success-strong bg-success/10',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />,
    className: 'text-destructive-strong bg-destructive/10',
  },
}

export function ImportHistoryList({
  imports,
  onViewDetails,
  onDelete,
  onReupload,
  onNewImport,
}: ImportHistoryListProps) {
  const { isMobile } = useViewport()
  const [statusFilter, setStatusFilter] = useState<ImportStatus | 'all'>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)

  const filteredImports =
    statusFilter === 'all'
      ? imports
      : imports.filter((imp) => imp.status === statusFilter)

  const handleDeleteClick = (importId: string) => {
    setItemToDelete(importId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (itemToDelete && onDelete) {
      onDelete(itemToDelete)
      setDeleteDialogOpen(false)
      setItemToDelete(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setItemToDelete(null)
  }

  const formatRowCount = (count: number) => {
    return formatNumber(count)
  }

  // Empty state
  const firstImportVideo = getVideoForPlacement('app-first-import')
  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 border rounded-lg bg-muted/30">
        <FileSpreadsheet
          className="h-12 w-12 text-muted-foreground mb-4"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold mb-2">No imports yet</h2>
        <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
          Upload your first file to begin importing GL data.
        </p>
        {firstImportVideo && (
          <div className="mb-6 w-full max-w-xs">
            <p className="mb-2 text-xs text-muted-foreground text-center">
              Watch how it works
            </p>
            <VideoCard video={firstImportVideo} />
          </div>
        )}
        {onNewImport && (
          <Button onClick={onNewImport}>
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Start New Upload
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold text-lg">Import History</h2>
        <div className="flex items-center gap-2 [&>div]:flex-1 sm:[&>div]:flex-none">
          <label
            htmlFor="status-filter"
            className="text-sm text-muted-foreground"
          >
            Filter:
          </label>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as ImportStatus | 'all')
            }
          >
            <SelectTrigger id="status-filter" className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Imports</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile: stacked cards so no horizontal scroll is needed */}
      {isMobile ? (
        filteredImports.length === 0 ? (
          <EmptyState
            icon={FilterX}
            title="No matches"
            description="No imports match the selected filter."
            size="sm"
            action={{
              label: 'Clear filters',
              onClick: () => setStatusFilter('all'),
              icon: FilterX,
              variant: 'outline',
            }}
          />
        ) : (
          <div className="space-y-3" data-testid="import-history-cards">
            {filteredImports.map((record) => {
              const statusInfo = STATUS_CONFIG[record.status]
              return (
                <div
                  key={record.id}
                  className="rounded-lg border p-4 shadow-sm"
                  data-testid="import-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileSpreadsheet
                        className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {onViewDetails ? (
                        <button
                          type="button"
                          onClick={() => onViewDetails(record.id)}
                          className="flex min-h-10 min-w-0 items-center rounded-full text-left text-sm font-medium text-primary ring-offset-background hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          title={`Open ${record.fileName}`}
                        >
                          <span className="truncate">{record.fileName}</span>
                        </button>
                      ) : (
                        <p
                          className="min-w-0 truncate text-sm font-medium"
                          title={record.fileName}
                        >
                          {record.fileName}
                        </p>
                      )}
                    </div>
                    <div
                      className={cn(
                        'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
                        statusInfo.className
                      )}
                    >
                      {statusInfo.icon}
                      <span>{statusInfo.label}</span>
                    </div>
                  </div>

                  {record.errorMessage && (
                    <p
                      className="mt-2 line-clamp-2 text-xs text-destructive-strong"
                      title={record.errorMessage}
                    >
                      {record.errorMessage}
                    </p>
                  )}

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">Date</dt>
                      <dd className="flex items-center gap-1 text-muted-foreground">
                        <Clock
                          className="h-3 w-3 flex-shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {formatDateTime(record.uploadedAt)}
                        </span>
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">Source</dt>
                      <dd>{SOURCE_LABELS[record.source]}</dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">Rows</dt>
                      <dd className="font-mono">
                        {formatRowCount(record.rowCount)}
                      </dd>
                    </div>
                  </dl>

                  {(onViewDetails ||
                    (record.status === 'failed' && onReupload) ||
                    onDelete) && (
                    <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
                      {onViewDetails && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewDetails(record.id)}
                          aria-label={`View details for ${record.fileName}`}
                        >
                          <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
                          View
                        </Button>
                      )}
                      {record.status === 'failed' && onReupload && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReupload(record.id)}
                        >
                          <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
                          Retry
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(record.id)}
                          aria-label={`Delete import ${record.fileName}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* Desktop: table */
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">Import history</caption>
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 text-sm font-medium">
                    File Name
                  </th>
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Source</th>
                  <th className="text-left p-3 text-sm font-medium">Rows</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-right p-3 text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredImports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8">
                      <EmptyState
                        icon={FilterX}
                        title="No matches"
                        description="No imports match the selected filter."
                        size="sm"
                        action={{
                          label: 'Clear filters',
                          onClick: () => setStatusFilter('all'),
                          icon: FilterX,
                          variant: 'outline',
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredImports.map((record, index) => {
                    const statusInfo = STATUS_CONFIG[record.status]
                    return (
                      <tr
                        key={record.id}
                        className={cn(
                          'border-t transition-colors duration-fast hover:bg-muted/50',
                          index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                        )}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet
                              className="h-4 w-4 text-muted-foreground flex-shrink-0"
                              aria-hidden="true"
                            />
                            <div className="min-w-0">
                              {onViewDetails ? (
                                <button
                                  type="button"
                                  onClick={() => onViewDetails(record.id)}
                                  className="flex min-h-10 w-full items-center rounded-full text-left text-sm font-medium text-primary ring-offset-background hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  title={`Open ${record.fileName}`}
                                >
                                  <span className="min-w-0 truncate">
                                    {record.fileName}
                                  </span>
                                </button>
                              ) : (
                                <p
                                  className="font-medium text-sm truncate"
                                  title={record.fileName}
                                >
                                  {record.fileName}
                                </p>
                              )}
                              {record.errorMessage && (
                                <p
                                  className="text-xs text-destructive-strong truncate"
                                  title={record.errorMessage}
                                >
                                  {record.errorMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            <span>{formatDateTime(record.uploadedAt)}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">
                            {SOURCE_LABELS[record.source]}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm font-mono">
                            {formatRowCount(record.rowCount)}
                          </span>
                        </td>
                        <td className="p-3">
                          <div
                            className={cn(
                              'inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium',
                              statusInfo.className
                            )}
                          >
                            {statusInfo.icon}
                            <span>{statusInfo.label}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            {onViewDetails && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onViewDetails(record.id)}
                                aria-label={`View details for ${record.fileName}`}
                              >
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                            {record.status === 'failed' && onReupload && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onReupload(record.id)}
                                aria-label={`Retry import for ${record.fileName}`}
                              >
                                <Upload
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </Button>
                            )}
                            {onDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(record.id)}
                                aria-label={`Delete import ${record.fileName}`}
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Import</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this import? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
