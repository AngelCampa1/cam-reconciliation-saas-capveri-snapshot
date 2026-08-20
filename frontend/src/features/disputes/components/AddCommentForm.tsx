/**
 * AddCommentForm Component
 *
 * Form for adding comments to a dispute.
 * Landlords can mark comments as internal (not visible to tenants).
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import type { AddCommentRequest } from '@/api/hooks'

interface AddCommentFormProps {
  onSubmit: (data: AddCommentRequest) => Promise<unknown>
  isLoading: boolean
  showInternalToggle?: boolean
}

export function AddCommentForm({
  onSubmit,
  isLoading,
  showInternalToggle = false,
}: AddCommentFormProps) {
  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!content.trim()) {
      return
    }

    try {
      await onSubmit({
        content: content.trim(),
        is_internal: isInternal,
      })
      // Only clear once the mutation resolves, so a failed submit does not
      // silently discard the typed comment.
      setContent('')
      setIsInternal(false)
    } catch {
      // Keep the typed content so the user can retry; the parent surfaces
      // the error via the mutation's onError handler.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <Label htmlFor="dispute-comment" className="sr-only">
        Comment
      </Label>
      <Textarea
        id="dispute-comment"
        placeholder="Add a comment..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
      />

      <div className="flex items-center justify-between">
        {showInternalToggle && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-internal"
              aria-label="Mark as internal (not visible to tenant)"
              checked={isInternal}
              onCheckedChange={(checked) => setIsInternal(checked === true)}
            />
            <Label
              htmlFor="is-internal"
              // flex + min-h-10 gives the label (a click target that toggles the
              // 16px checkbox) a 40px-tall hit area, meeting the touch floor
              // without enlarging the visible checkbox.
              className="flex min-h-10 items-center text-sm text-muted-foreground cursor-pointer"
            >
              Mark as internal (not visible to tenant)
            </Label>
          </div>
        )}

        <Button
          type="submit"
          disabled={isLoading || !content.trim()}
          className={
            showInternalToggle ? 'min-h-[44px]' : 'ml-auto min-h-[44px]'
          }
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            'Add Comment'
          )}
        </Button>
      </div>
    </form>
  )
}
