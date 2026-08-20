import { useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDateTime, formatTimestampDate } from '@/lib/utils'
import {
  Bug,
  Lightbulb,
  MessageCircle,
  Image,
  Loader2,
  Inbox,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getSession } from '@/api/client'
import { resolveApiUrl } from '@/api/url'
import type { Feedback, FeedbackStatus, FeedbackType } from '@/types/feedback'

const typeIcons = {
  bug: Bug,
  feature_request: Lightbulb,
  general: MessageCircle,
}

// Map each workflow status to an AA-compliant Badge variant (white-on-light
// fills like raw `bg-warning`/`bg-success` failed contrast --- 2.13:1 / 3.33:1).
// The Badge variants already carry the corrected fills/text (warning = amber +
// dark text 6.84:1, success = bg-success-strong 7.23:1, default = bg-primary
// 9.34:1, secondary = muted with dark text).
const statusVariants: Record<
  FeedbackStatus,
  NonNullable<BadgeProps['variant']>
> = {
  new: 'default',
  reviewed: 'warning',
  resolved: 'success',
  dismissed: 'secondary',
}

export function FeedbackPage() {
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>(
    'all'
  )
  const [page, setPage] = useState(1)
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(
    null
  )

  const queryClient = useQueryClient()
  const { isMobile } = useViewport()

  // Fetch feedback list
  const {
    data: feedback,
    isLoading,
    isError,
    isPaused,
    refetch,
  } = useQuery({
    queryKey: ['admin-feedback', typeFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), per_page: '20' })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const session = await getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(resolveApiUrl(`/api/v1/feedback?${params}`), {
        headers,
      })
      if (!res.ok) {
        throw new Error(`Failed to load feedback (${res.status})`)
      }
      const data = (await res.json()) as unknown
      // Defensive: the endpoint returns an array. If the backend ever responds
      // with an error object (e.g. { detail: ... }) on a non-2xx that slipped
      // through, never let it reach the table renderer as if it were rows.
      return Array.isArray(data) ? (data as Feedback[]) : []
    },
  })
  // A paused fetch (unreachable backend) leaves isError false + data undefined,
  // so without this the "No feedback yet" empty state below would lie.
  const isOffline = isPaused && !feedback

  // Fetch summary stats
  const { data: stats } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: async () => {
      const session = await getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(resolveApiUrl('/api/v1/feedback/stats/summary'), {
        headers,
      })
      if (!res.ok) {
        throw new Error(`Failed to load feedback stats (${res.status})`)
      }
      return res.json()
    },
  })

  // Update status mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: FeedbackStatus
    }) => {
      const session = await getSession()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(resolveApiUrl(`/api/v1/feedback/${id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        throw new Error(`Failed to update feedback (${res.status})`)
      }
      return res.json()
    },
    onError: () => {
      toast.error('Failed to update feedback. Please try again.')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] })
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] })
    },
  })

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Feedback"
        description="Review and manage user feedback submissions"
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="shadow-sm transition-all duration-fast hover:shadow-md">
          <CardHeader variant="muted" className="pb-2">
            <CardTitle as="h2" className="text-sm font-medium">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-lg md:text-xl lg:text-2xl font-bold">
              {stats?.total || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm transition-all duration-fast hover:shadow-md">
          <CardHeader variant="muted" className="pb-2">
            <CardTitle as="h2" className="text-sm font-medium text-primary">
              New
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-lg md:text-xl lg:text-2xl font-bold">
              {stats?.by_status?.new || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm transition-all duration-fast hover:shadow-md">
          <CardHeader variant="muted" className="pb-2">
            <CardTitle
              as="h2"
              className="text-sm font-medium text-destructive-strong"
            >
              Bugs
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-lg md:text-xl lg:text-2xl font-bold">
              {stats?.by_type?.bug || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm transition-all duration-fast hover:shadow-md">
          <CardHeader variant="muted" className="pb-2">
            <CardTitle
              as="h2"
              className="text-sm font-medium text-warning-foreground"
            >
              Features
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-lg md:text-xl lg:text-2xl font-bold">
              {stats?.by_type?.feature_request || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={typeFilter}
          onValueChange={(v: string) => {
            setTypeFilter(v as FeedbackType | 'all')
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature_request">Feature Request</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v: string) => {
            setStatusFilter(v as FeedbackStatus | 'all')
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feedback Table / Cards */}
      {isMobile ? (
        /* Mobile: stacked cards so View button never scrolls off-screen */
        <div className="space-y-3" data-testid="mobile-cards-view">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading feedback...</span>
            </div>
          ) : isError || isOffline ? (
            <ErrorState
              size="sm"
              title="Couldn't load feedback"
              description="Something went wrong on our end."
              offline={isOffline}
              action={{ onClick: () => refetch() }}
            />
          ) : feedback?.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No feedback yet"
              description="Feedback from users shows up here."
              size="sm"
            />
          ) : (
            feedback?.map((item) => {
              const TypeIcon = typeIcons[item.type] ?? MessageCircle
              return (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="h-4 w-4 shrink-0" />
                      <span className="font-medium capitalize">
                        {item.type.replace('_', ' ')}
                      </span>
                    </div>
                    <Badge
                      variant={statusVariants[item.status]}
                      className="capitalize"
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <p
                    className="mt-2 truncate text-sm text-muted-foreground"
                    title={item.message}
                  >
                    {item.message}
                    {item.screenshot_url && (
                      <Image
                        className="h-4 w-4 text-muted-foreground inline ml-2"
                        role="img"
                        aria-label="Has screenshot"
                      />
                    )}
                  </p>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">
                        Page:{' '}
                      </span>
                      {item.page_url || '-'}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        Date:{' '}
                      </span>
                      {formatTimestampDate(item.created_at)}
                    </div>
                  </div>
                  <span id={`mobile-row-desc-${item.id}`} className="sr-only">
                    {item.type.replace('_', ' ')} feedback from{' '}
                    {formatTimestampDate(item.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-4 w-full min-h-[44px]"
                    aria-describedby={`mobile-row-desc-${item.id}`}
                    onClick={() => setSelectedFeedback(item)}
                  >
                    View
                  </Button>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <Card className="shadow-sm" data-testid="desktop-table-view">
          <Table aria-label="Feedback submissions">
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading feedback...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError || isOffline ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12">
                    <ErrorState
                      size="sm"
                      title="Couldn't load feedback"
                      offline={isOffline}
                      action={{ onClick: () => refetch() }}
                    />
                  </TableCell>
                </TableRow>
              ) : feedback?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState
                      icon={Inbox}
                      title="No feedback yet"
                      description="Feedback from users shows up here."
                      size="sm"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                feedback?.map((item) => {
                  const TypeIcon = typeIcons[item.type] ?? MessageCircle
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TypeIcon className="h-4 w-4" />
                          <span className="capitalize">
                            {item.type.replace('_', ' ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="truncate" title={item.message}>
                          {item.message}
                        </p>
                        {item.screenshot_url && (
                          <Image
                            className="h-4 w-4 text-muted-foreground inline ml-2"
                            role="img"
                            aria-label="Has screenshot"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariants[item.status]}
                          className="capitalize"
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.page_url || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimestampDate(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View ${item.type.replace('_', ' ')} feedback from ${formatTimestampDate(item.created_at)}`}
                          onClick={() => setSelectedFeedback(item)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex justify-center gap-2">
        <Button
          variant="outline"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={() => setPage((p) => p + 1)}
          disabled={!feedback || feedback.length < 20}
        >
          Next
        </Button>
      </div>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedFeedback}
        onOpenChange={() => setSelectedFeedback(null)}
      >
        <DialogContent className="max-w-2xl">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = typeIcons[selectedFeedback.type]
                    return <Icon className="h-5 w-5" />
                  })()}
                  <span className="capitalize">
                    {selectedFeedback.type.replace('_', ' ')}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Feedback submitted on{' '}
                  {formatTimestampDate(selectedFeedback.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status Update */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">Status:</span>
                  <Select
                    value={selectedFeedback.status}
                    onValueChange={(status) => {
                      updateMutation.mutate({
                        id: selectedFeedback.id,
                        status: status as FeedbackStatus,
                      })
                      setSelectedFeedback({
                        ...selectedFeedback,
                        status: status as FeedbackStatus,
                      })
                    }}
                  >
                    <SelectTrigger
                      className="w-[140px]"
                      aria-label="Update feedback status"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Message */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Message</h4>
                  <p className="text-sm bg-muted p-4 rounded-md whitespace-pre-wrap">
                    {selectedFeedback.message}
                  </p>
                </div>

                {/* Screenshot */}
                {selectedFeedback.screenshot_url && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Screenshot</h4>
                    <img
                      src={selectedFeedback.screenshot_url}
                      alt="Feedback screenshot"
                      className="rounded-md border max-h-80 w-full object-contain bg-muted"
                    />
                  </div>
                )}

                {/* Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Page URL:</span>
                    <p className="text-muted-foreground">
                      {selectedFeedback.page_url || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Submitted:</span>
                    <p className="text-muted-foreground">
                      {formatDateTime(selectedFeedback.created_at)}
                    </p>
                  </div>
                </div>

                {selectedFeedback.metadata && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Context</h4>
                    <pre className="text-xs bg-muted p-2 rounded-md overflow-auto">
                      {JSON.stringify(selectedFeedback.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
