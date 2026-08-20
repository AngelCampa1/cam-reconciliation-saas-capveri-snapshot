import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { PageHeader, PageContainer } from '@/components/layout'
import { apiClient } from '@/api/client'
import {
  getDisputeApiV1TenantDisputesDisputeIdGet,
  addCommentApiV1TenantDisputesDisputeIdCommentsPost,
} from '@/api/generated/sdk.gen'
import type { DisputeDetailDTO } from '@/api/generated/types.gen'
import { categoryLabel } from '@/features/disputes/constants'
import { commentAuthorLabel } from '@/features/disputes/components/CommentThread'
import { DisputeStatusBadge } from '@/features/disputes/components/DisputeStatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { getCountBucket, trackEvent } from '@/lib/analytics'
import { ErrorState } from '@/components/ErrorState'

export function DisputeDetailPage() {
  const { disputeId } = useParams<{ disputeId: string }>()
  const [newComment, setNewComment] = useState('')
  const trackedDetailDisputeIdRef = useRef<string | null>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const {
    data: dispute,
    isLoading,
    isPaused,
    error,
    refetch,
  } = useQuery<DisputeDetailDTO>({
    queryKey: ['dispute', disputeId],
    queryFn: async () => {
      const response = await getDisputeApiV1TenantDisputesDisputeIdGet({
        client: apiClient,
        path: { dispute_id: disputeId! },
      })
      if (response.error) {
        throw new Error('Failed to fetch dispute')
      }
      return response.data!
    },
    enabled: !!disputeId,
  })

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await addCommentApiV1TenantDisputesDisputeIdCommentsPost(
        {
          client: apiClient,
          path: { dispute_id: disputeId! },
          body: { content },
        }
      )
      if (response.error) {
        throw new Error('Failed to add comment')
      }
      return response.data
    },
    onSuccess: (comment) => {
      queryClient.invalidateQueries({ queryKey: ['dispute', disputeId] })
      if (dispute && comment) {
        const nextCommentCount = (dispute.comments?.length ?? 0) + 1
        trackEvent('tenant_dispute_comment_submit_succeeded', {
          dispute_id: dispute.id,
          statement_id: dispute.statement_id,
          category: dispute.category,
          status: dispute.status,
          comment_count: nextCommentCount,
          comment_count_bucket: getCountBucket(nextCommentCount),
        })
      }
      setNewComment('')
    },
    onError: () => {
      toast.error('Failed to add comment. Please try again.')
    },
  })

  useEffect(() => {
    if (!dispute) return
    if (trackedDetailDisputeIdRef.current === dispute.id) return
    trackedDetailDisputeIdRef.current = dispute.id

    const commentCount = dispute.comments?.length ?? 0
    const attachmentCount = dispute.attachments?.length ?? 0
    trackEvent('tenant_dispute_detail_viewed', {
      dispute_id: dispute.id,
      statement_id: dispute.statement_id,
      category: dispute.category,
      status: dispute.status,
      comment_count: commentCount,
      comment_count_bucket: getCountBucket(commentCount),
      attachment_count: attachmentCount,
      attachment_count_bucket: getCountBucket(attachmentCount),
    })
  }, [dispute])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="md" variant="muted" />
      </div>
    )
  }

  // A paused fetch (networkMode 'online' + unreachable backend) leaves error
  // null and isLoading false; without this guard it would fall through to
  // "Dispute not found" below and wrongly imply the dispute doesn't exist.
  if (error || (isPaused && !dispute)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <ErrorState
          title="Couldn't load this dispute"
          offline={isPaused && !dispute}
          action={{ onClick: () => refetch() }}
        />
      </div>
    )
  }

  if (!dispute) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Dispute not found</p>
      </div>
    )
  }

  const canComment = ['open', 'under_review'].includes(dispute.status)
  const filedAgo = formatDistanceToNow(new Date(dispute.created_at), {
    addSuffix: true,
  })
  const comments = dispute.comments ?? []

  return (
    <PageContainer>
      <PageHeader
        title={categoryLabel(dispute.category)}
        description={`Filed ${filedAgo}`}
        showBackButton={true}
        backButtonTo="/tenant/disputes"
        actions={
          // self-start keeps the compact badge at its intrinsic width inside
          // PageHeader's mobile actions column (items-stretch), which would
          // otherwise stretch it to the full viewport width.
          <span className="self-start">
            <DisputeStatusBadge status={dispute.status} />
          </span>
        }
      />

      <div className="p-6 space-y-6">
        {/* What the tenant disputed */}
        <div className="border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-medium text-muted-foreground">
            What you disputed
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-foreground">
            {dispute.description}
          </p>
        </div>

        {/* Resolution Summary (if resolved) */}
        {dispute.resolution_summary && (
          <div className="bg-success/10 border border-success/20 rounded-lg p-4 shadow-sm">
            <h2 className="font-medium text-success-strong">Resolution</h2>
            <p className="mt-1 text-success-strong">
              {dispute.resolution_summary}
            </p>
          </div>
        )}

        {/* Comment Thread */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Comments</h2>
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No replies yet. The property team will respond here. You can add a
              comment below.
            </p>
          )}
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="border rounded-lg p-4 shadow-sm transition-colors duration-fast hover:bg-muted/30"
            >
              <div className="flex justify-between items-start">
                <span className="font-medium">
                  {commentAuthorLabel(comment, user?.id)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <p className="mt-2 text-foreground">{comment.content}</p>
            </div>
          ))}
        </div>

        {/* Add Comment Form */}
        {canComment && (
          <div className="space-y-2">
            <Label htmlFor="tenant-comment" className="text-sm font-medium">
              Add a comment
            </Label>
            <Textarea
              id="tenant-comment"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={3}
            />
            <Button
              onClick={() => addCommentMutation.mutate(newComment)}
              disabled={!newComment.trim() || addCommentMutation.isPending}
            >
              {addCommentMutation.isPending && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {addCommentMutation.isPending ? 'Adding...' : 'Add Comment'}
            </Button>
          </div>
        )}

        {/* Attachments */}
        {(dispute.attachments?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Attachments</h2>
            <div className="space-y-2">
              {(dispute.attachments ?? []).map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between border rounded-lg p-3 shadow-sm transition-colors duration-fast hover:bg-muted/30"
                >
                  <div>
                    <p className="font-medium">{attachment.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {(attachment.file_size_bytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={attachment.filename}
                      aria-label={`Download ${attachment.filename}`}
                    >
                      Download
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
