/**
 * CommentThread Component
 *
 * Displays a chronological list of dispute comments.
 * Internal comments are styled differently with an "Internal" badge.
 */
import { MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { cn, formatDateTime } from '@/lib/utils'
import type { DisputeCommentDTO } from '@/api/hooks'

interface CommentThreadProps {
  comments: DisputeCommentDTO[]
  /** Current viewer's user id; their own comments are labeled "You". */
  currentUserId?: string | undefined
}

/**
 * Resolve a friendly author label for a comment.
 * Shows "You" for the current viewer, the stored name otherwise,
 * and "Participant" as a last resort (never a raw "Unknown").
 */
export function commentAuthorLabel(
  comment: Pick<DisputeCommentDTO, 'author_id' | 'author_name'>,
  currentUserId?: string
): string {
  if (currentUserId && comment.author_id === currentUserId) return 'You'
  return comment.author_name?.trim() || 'Participant'
}

export function CommentThread({ comments, currentUserId }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No comments yet"
        description="Comments on this dispute show up here."
        size="sm"
      />
    )
  }

  // Sort by created_at ascending (chronological)
  const sortedComments = [...comments].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  return (
    <div className="space-y-3">
      {sortedComments.map((comment) => (
        <div
          key={comment.id}
          data-testid={`comment-${comment.id}`}
          className={cn(
            'p-3 rounded-lg',
            comment.is_internal
              ? 'bg-muted/30 border-l-2 border-muted-foreground'
              : 'bg-muted/10 border border-border'
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">
              {commentAuthorLabel(comment, currentUserId)}
            </span>
            {comment.is_internal && (
              <Badge variant="secondary" className="text-xs">
                Internal
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {formatDateTime(comment.created_at)}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
        </div>
      ))}
    </div>
  )
}
