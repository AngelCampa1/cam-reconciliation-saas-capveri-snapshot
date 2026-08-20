import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type PaginationState,
} from '@tanstack/react-table'
import { FileSearch, Loader2, FileText, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import {
  apiClient,
  getJobStatusApiV1ExtractionsJobsJobIdGet,
  listExtractionsApiV1ExtractionsGet,
  processExtractionApiV1ExtractionsDocumentIdProcessPost,
} from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import { sendBrowserNotification } from '@/hooks/useNotificationPermission'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { NotificationPrompt } from './NotificationPrompt'
import { ExtractionStatusBadge } from './ExtractionStatusBadge'
import { PageHeader, PageContainer } from '@/components/layout'
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { SkeletonCard } from '@/components/ui/skeleton'
import { DocumentStatus, ExtractionJobStatus } from '@/types/enums'
import { useViewport } from '@/hooks/useViewport'
import { trackEvent } from '@/lib/analytics'
import { EmptyState, EmptyStateNoExtractions } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'

/**
 * Extraction list item matching backend schema.
 */
interface ExtractionListItem {
  id: string
  filename: string
  status: string
  created_at: string
  processed_at: string | null
  verified_at: string | null
  average_confidence: number | null
  low_confidence_count: number
}

/**
 * API response for extractions list.
 */
interface ExtractionListResponse {
  items: ExtractionListItem[]
  total: number
  page: number
  page_size: number
  has_next: boolean
}

const columnHelper = createColumnHelper<ExtractionListItem>()

const columns = [
  columnHelper.accessor('filename', {
    header: 'Filename',
    cell: (info) => (
      <div className="font-medium max-w-xs truncate" title={info.getValue()}>
        {info.getValue()}
      </div>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <ExtractionStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('created_at', {
    header: 'Uploaded',
    cell: (info) => (
      <div className="text-sm text-muted-foreground">
        {formatDateTime(info.getValue())}
      </div>
    ),
  }),
  columnHelper.accessor('average_confidence', {
    header: 'Confidence',
    cell: (info) => {
      const confidence = info.getValue()
      if (confidence === null)
        return <span className="text-muted-foreground">-</span>

      const percentage = Math.round(confidence * 100)
      const color =
        percentage >= 90
          ? 'text-success-strong'
          : percentage >= 70
            ? 'text-warning-strong'
            : 'text-destructive-strong'

      return (
        <div className={`font-medium ${color}`}>
          {percentage}%
          {info.row.original.low_confidence_count > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({info.row.original.low_confidence_count} low)
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.display({
    id: 'actions',
    header: 'Actions',
    cell: (info) => {
      const status = info.row.original.status
      const documentId = info.row.original.id
      const filename = info.row.original.filename

      // Show process button for documents the backend accepts for extraction.
      if (
        status === DocumentStatus.PENDING ||
        status === DocumentStatus.FAILED
      ) {
        return (
          <ProcessButton
            documentId={documentId}
            filename={filename}
            label={status === DocumentStatus.FAILED ? 'Retry' : 'Process'}
          />
        )
      }

      // Show review button for documents ready for review
      if (status === DocumentStatus.READY_FOR_REVIEW) {
        return <ReviewButton documentId={documentId} filename={filename} />
      }

      return null
    },
  }),
]

// Review button component to access navigate hook properly
function ReviewButton({
  documentId,
  filename,
}: {
  documentId: string
  filename: string
}) {
  const navigate = useNavigate()
  return (
    <Button
      size="sm"
      onClick={() => navigate(`/verify/${documentId}`)}
      data-testid="review-button"
      className="min-h-[44px]"
      aria-label={`Review ${filename}`}
    >
      Review
    </Button>
  )
}

// Process button component to trigger extraction
function ProcessButton({
  documentId,
  filename,
  label,
}: {
  documentId: string
  filename: string
  label: string
}) {
  const queryClient = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  const handledJobRef = useRef<string | null>(null)

  const { data: jobData } = useQuery({
    queryKey: ['extraction-job', jobId],
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (
        status === ExtractionJobStatus.COMPLETED ||
        status === ExtractionJobStatus.FAILED
      ) {
        return false
      }
      return 2000
    },
    queryFn: async () => {
      if (!jobId) return null
      const { data } = await getJobStatusApiV1ExtractionsJobsJobIdGet({
        client: apiClient,
        path: { job_id: jobId },
      })
      return data
    },
  })

  useEffect(() => {
    if (!jobId || !jobData) return
    if (handledJobRef.current === jobId) return

    if (jobData.status === ExtractionJobStatus.COMPLETED) {
      handledJobRef.current = jobId
      trackEvent('lease_extraction_process_completed', {
        document_id: documentId,
        job_id: jobId,
      })
      toast.success('Extraction complete. Ready for review.')
      sendBrowserNotification('Extraction Complete', {
        body: 'Your document is ready for review.',
        icon: '/favicon.ico',
      })
      queryClient.invalidateQueries({
        queryKey: ['extractions'],
        refetchType: 'all',
      })
    } else if (jobData.status === ExtractionJobStatus.FAILED) {
      handledJobRef.current = jobId
      trackEvent('lease_extraction_process_failed', {
        document_id: documentId,
        job_id: jobId,
        failure_stage: 'job_status',
      })
      toast.error('Extraction failed. Please try again.')
      sendBrowserNotification('Extraction Failed', {
        body: 'Document extraction encountered an error.',
        icon: '/favicon.ico',
      })
      queryClient.invalidateQueries({
        queryKey: ['extractions'],
        refetchType: 'all',
      })
    }
  }, [jobId, jobData, documentId, queryClient])

  const processMutation = useMutation({
    mutationFn: async () => {
      trackEvent('lease_extraction_process_started', {
        document_id: documentId,
        action_type: label.toLowerCase() === 'retry' ? 'retry' : 'process',
      })
      const { data, error } =
        await processExtractionApiV1ExtractionsDocumentIdProcessPost({
          client: apiClient,
          path: { document_id: documentId },
        })

      if (error) {
        throw new Error(
          typeof error.detail === 'string'
            ? error.detail
            : 'Failed to start extraction processing'
        )
      }

      return data
    },
    onSuccess: (data) => {
      const response = data as
        | { job_id?: string | null; jobId?: string | null }
        | undefined
      const queuedJobId = response?.job_id ?? response?.jobId ?? null
      if (queuedJobId) {
        setJobId(queuedJobId)
      } else {
        queryClient.invalidateQueries({ queryKey: ['extractions'] })
      }
    },
    onError: (error: Error) => {
      trackEvent('lease_extraction_process_failed', {
        document_id: documentId,
        failure_stage: 'start_request',
      })
      console.error(error)
      toast.error(
        "We couldn't start the extraction. Try again, or reload the page."
      )
    },
  })

  const isTerminal =
    jobData?.status === ExtractionJobStatus.COMPLETED ||
    jobData?.status === ExtractionJobStatus.FAILED
  const isProcessing = processMutation.isPending || (!!jobId && !isTerminal)

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        onClick={() => processMutation.mutate()}
        disabled={isProcessing}
        data-testid="process-button"
        className="min-h-[44px]"
        aria-label={isProcessing ? undefined : `${label} ${filename}`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          label
        )}
      </Button>
      {isProcessing && (
        <span className="text-xs text-muted-foreground" role="status">
          Reading your document. This can take up to 30 seconds.
        </span>
      )}
    </div>
  )
}

// Mobile card component for extractions
function ExtractionMobileCard({
  extraction,
}: {
  extraction: ExtractionListItem
}) {
  const navigate = useNavigate()

  const getConfidenceColor = (confidence: number | null) => {
    if (confidence === null) return 'text-muted-foreground'
    const percentage = Math.round(confidence * 100)
    if (percentage >= 90) return 'text-success-strong'
    if (percentage >= 70) return 'text-warning-strong'
    return 'text-destructive-strong'
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate" title={extraction.filename}>
              {extraction.filename}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDateTime(extraction.created_at)}</span>
          </div>
        </div>
        <ExtractionStatusBadge status={extraction.status} />
      </div>
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          {extraction.average_confidence !== null && (
            <div
              className={`font-medium ${getConfidenceColor(extraction.average_confidence)}`}
            >
              {Math.round(extraction.average_confidence * 100)}% confidence
              {extraction.low_confidence_count > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({extraction.low_confidence_count} low)
                </span>
              )}
            </div>
          )}
        </div>
        {(extraction.status === DocumentStatus.PENDING ||
          extraction.status === DocumentStatus.FAILED) && (
          <ProcessButton
            documentId={extraction.id}
            filename={extraction.filename}
            label={
              extraction.status === DocumentStatus.FAILED ? 'Retry' : 'Process'
            }
          />
        )}
        {extraction.status === DocumentStatus.READY_FOR_REVIEW && (
          <Button
            size="sm"
            onClick={() => navigate(`/verify/${extraction.id}`)}
            className="min-h-[44px]"
            aria-label={`Review ${extraction.filename}`}
          >
            Review
          </Button>
        )}
      </div>
    </Card>
  )
}

/**
 * Extractions list page - displays all documents for HITL verification.
 *
 * Features:
 * - Paginated table of extractions
 * - Filter by document status
 * - Navigate to verification page for review
 */
export function ExtractionsPage() {
  const navigate = useNavigate()
  const viewport = useViewport()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }

  // Fetch extractions from API
  const { data, isLoading, error, isPaused, refetch } =
    useQuery<ExtractionListResponse>({
      queryKey: [
        'extractions',
        pagination.pageIndex + 1,
        pagination.pageSize,
        statusFilter,
      ],
      queryFn: async () => {
        const queryParams = {
          page: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
          ...(statusFilter &&
            statusFilter !== 'all' && {
              status: statusFilter as DocumentStatus,
            }),
        }

        const { data, error } = await listExtractionsApiV1ExtractionsGet({
          client: apiClient,
          query: queryParams,
        })

        if (error) {
          throw new Error('Failed to fetch extractions')
        }

        return data as ExtractionListResponse
      },
    })
  // A paused fetch (unreachable backend) leaves error null + data undefined, so
  // without this the "No extractions yet" empty state below would lie.
  const isOffline = isPaused && !data

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    pageCount: data ? Math.ceil(data.total / data.page_size) : -1,
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  return (
    <PageContainer>
      <PageHeader
        title="Document Extractions"
        description="Review and confirm the lease data pulled from each PDF"
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium">
            Status:
          </label>
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger id="status-filter" className="w-full sm:w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value={DocumentStatus.PENDING}>Pending</SelectItem>
              <SelectItem value={DocumentStatus.PROCESSING}>
                Processing
              </SelectItem>
              <SelectItem value={DocumentStatus.READY_FOR_REVIEW}>
                Ready for Review
              </SelectItem>
              <SelectItem value={DocumentStatus.VERIFIED}>Verified</SelectItem>
              <SelectItem value={DocumentStatus.REJECTED}>Rejected</SelectItem>
              <SelectItem value={DocumentStatus.FAILED}>Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data && (
          <div className="text-sm text-muted-foreground sm:ml-auto">
            Showing {data.items.length} of {data.total} extractions
          </div>
        )}
      </div>

      <NotificationPrompt />

      {/* Loading / error / empty / content — single gated flow */}
      {isLoading ? (
        viewport.width < 768 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard
                key={i}
                showImage={false}
                showHeader
                bodyLines={3}
              />
            ))}
          </div>
        ) : (
          <DataTableSkeleton columnCount={5} rowCount={8} />
        )
      ) : error || isOffline ? (
        <ErrorState
          title="Couldn't load extractions"
          description="Please try again in a moment."
          offline={isOffline}
          action={{ onClick: () => refetch() }}
        />
      ) : table.getRowModel().rows.length === 0 ? (
        statusFilter !== 'all' ? (
          <EmptyState
            icon={FileSearch}
            title="No extractions with this status"
            description="Nothing here with that status right now. Switch back to All statuses to see every document."
            action={{
              label: 'Show all statuses',
              onClick: () => handleStatusFilterChange('all'),
              icon: FileSearch,
              variant: 'outline',
            }}
            data-testid="extractions-empty-filtered"
          />
        ) : (
          <EmptyStateNoExtractions
            onAction={() => navigate('/leases/upload')}
          />
        )
      ) : (
        <>
          {/* Mobile card view */}
          {viewport.width < 768 ? (
            <div className="space-y-3">
              {table.getRowModel().rows.map((row) => (
                <ExtractionMobileCard key={row.id} extraction={row.original} />
              ))}
            </div>
          ) : (
            /* Desktop table view */
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Card>
                  <Table aria-label="Document extractions">
                    <TableHeader>
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            </div>
          )}

          {/* Pagination (shared between mobile and desktop) */}
          {data && data.total > data.page_size && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <div className="text-sm text-muted-foreground">
                Page {pagination.pageIndex + 1} of{' '}
                {Math.ceil(data.total / data.page_size)}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="min-h-[44px]"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="min-h-[44px]"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
