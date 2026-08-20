/**
 * ExportHistory component.
 *
 * Displays export history with filtering and re-download capabilities.
 */

import { useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import {
  Download,
  Trash2,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { formatFileSize } from '@/lib/format-bytes'
import { formatDateTime } from '@/lib/utils'
import { DateRangePicker } from './DateRangePicker'
import type {
  ExportFilters,
  ExportRecord,
  ExportFormatFilter,
  ExportStatus,
} from '../types'

export interface ExportHistoryProps {
  propertyId: string
  onDownload: (exportId: string) => void
  onDelete?: (exportId: string) => void
  isLoading?: boolean
  exports?: ExportRecord[]
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

const STATUS_CONFIG: Record<
  ExportStatus,
  {
    label: string
    icon: React.ReactNode
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
  }
> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="h-3 w-3" />,
    variant: 'secondary',
  },
  processing: {
    label: 'Processing',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    variant: 'default',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle className="h-3 w-3" />,
    variant: 'outline',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle className="h-3 w-3" />,
    variant: 'destructive',
  },
  expired: {
    label: 'Expired',
    icon: <AlertCircle className="h-3 w-3" />,
    variant: 'secondary',
  },
}

export function ExportHistory({
  onDownload,
  onDelete,
  isLoading = false,
  exports = [],
  total = 0,
  page = 1,
  pageSize = 10,
  onPageChange,
}: ExportHistoryProps) {
  const [filters, setFilters] = useState<ExportFilters>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [exportToDelete, setExportToDelete] = useState<string | null>(null)
  const { isMobile } = useViewport()

  const handleDelete = () => {
    if (exportToDelete && onDelete) {
      onDelete(exportToDelete)
      setDeleteDialogOpen(false)
      setExportToDelete(null)
    }
  }

  const openDeleteDialog = (exportId: string) => {
    setExportToDelete(exportId)
    setDeleteDialogOpen(true)
  }

  const formatSize = (bytes: number | undefined): string =>
    bytes ? formatFileSize(bytes) : '-'

  const getDaysUntilExpiration = (
    expiresAt: string | undefined
  ): number | null => {
    if (!expiresAt) return null
    const now = new Date()
    const expiration = new Date(expiresAt)
    const diffMs = expiration.getTime() - now.getTime()
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <Select
          value={filters.format ?? 'all'}
          onValueChange={(value: ExportFormatFilter) =>
            setFilters((prev) => {
              const newFilters = { ...prev }
              if (value === 'all') {
                delete newFilters.format
              } else {
                newFilters.format = value
              }
              return newFilters
            })
          }
        >
          <SelectTrigger aria-label="Filter by format" className="w-40">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="excel">Excel</SelectItem>
            <SelectItem value="erp">ERP</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value: ExportStatus | 'all') =>
            setFilters((prev) => {
              const newFilters = { ...prev }
              if (value === 'all') {
                delete newFilters.status
              } else {
                newFilters.status = value
              }
              return newFilters
            })
          }
        >
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        <DateRangePicker
          {...(filters.dateRange && { value: filters.dateRange })}
          onChange={(dateRange) =>
            setFilters((prev) => {
              if (dateRange) {
                return { ...prev, dateRange }
              } else {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { dateRange: _, ...rest } = prev
                return rest
              }
            })
          }
        />
      </div>

      {isMobile ? (
        /* Mobile: stacked cards so action buttons never scroll off-screen */
        <div className="space-y-3" data-testid="mobile-cards-view">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : exports.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Download}
              title="No exports yet"
              description="Generate a PDF, Excel, or ERP export from a finalized reconciliation and it will show up here."
            />
          ) : (
            exports.map((exportRecord) => {
              const daysUntilExpiration = getDaysUntilExpiration(
                exportRecord.expiresAt
              )
              const isExpiringSoon =
                daysUntilExpiration !== null && daysUntilExpiration <= 7
              const statusConfig = STATUS_CONFIG[exportRecord.status]

              return (
                <div key={exportRecord.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="uppercase w-fit">
                        {exportRecord.format}
                      </Badge>
                      <span className="font-medium text-sm">
                        {exportRecord.fileName}
                      </span>
                    </div>
                    <Badge
                      variant={statusConfig.variant}
                      className="gap-1 shrink-0"
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">
                        Size:{' '}
                      </span>
                      {formatSize(exportRecord.fileSize)}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Expires:{' '}
                      </span>
                      {exportRecord.expiresAt ? (
                        <span
                          className={
                            isExpiringSoon ? 'text-warning-foreground' : ''
                          }
                        >
                          {isExpiringSoon && (
                            <AlertCircle className="h-3 w-3 text-warning-foreground inline mr-1" />
                          )}
                          {daysUntilExpiration !== null &&
                          daysUntilExpiration > 0
                            ? `${daysUntilExpiration}d`
                            : 'Expired'}
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Date:{' '}
                      </span>
                      {formatDateTime(exportRecord.createdAt)}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">By: </span>
                      {exportRecord.createdByName || '-'}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {exportRecord.status === 'completed' &&
                      exportRecord.fileUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDownload(exportRecord.id)}
                          className="w-full min-h-[44px] gap-1"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(exportRecord.id)}
                        className="w-full min-h-[44px] gap-1 text-destructive-strong hover:text-destructive-strong"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div
          className="border rounded-lg shadow-sm"
          data-testid="desktop-table-view"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <DataTableSkeleton
                  columnCount={8}
                  rowCount={5}
                  variant="rows"
                />
              ) : exports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12">
                    <EmptyState
                      size="sm"
                      icon={Download}
                      title="No exports yet"
                      description="Generate a PDF, Excel, or ERP export from a finalized reconciliation and it will show up here."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                exports.map((exportRecord) => {
                  const daysUntilExpiration = getDaysUntilExpiration(
                    exportRecord.expiresAt
                  )
                  const isExpiringSoon =
                    daysUntilExpiration !== null && daysUntilExpiration <= 7
                  const statusConfig = STATUS_CONFIG[exportRecord.status]

                  return (
                    <TableRow key={exportRecord.id}>
                      <TableCell className="font-medium">
                        {exportRecord.fileName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {exportRecord.format}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusConfig.variant} className="gap-1">
                          {statusConfig.icon}
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{exportRecord.createdByName}</TableCell>
                      <TableCell>
                        {formatDateTime(exportRecord.createdAt)}
                      </TableCell>
                      <TableCell>{formatSize(exportRecord.fileSize)}</TableCell>
                      <TableCell>
                        {exportRecord.expiresAt ? (
                          <div className="flex items-center gap-1">
                            {isExpiringSoon && (
                              <AlertCircle className="h-3 w-3 text-warning-foreground" />
                            )}
                            <span
                              className={
                                isExpiringSoon ? 'text-warning-foreground' : ''
                              }
                            >
                              {daysUntilExpiration !== null &&
                              daysUntilExpiration > 0
                                ? `${daysUntilExpiration}d`
                                : 'Expired'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {exportRecord.status === 'completed' &&
                            exportRecord.fileUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onDownload(exportRecord.id)}
                                className="gap-1"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </Button>
                            )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(exportRecord.id)}
                              className="gap-1 text-destructive-strong hover:text-destructive-strong"
                              aria-label="Delete export"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, total)} of {total} exports
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => onPageChange?.(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => onPageChange?.(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Export</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this export? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
