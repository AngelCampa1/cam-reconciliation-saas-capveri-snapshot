import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiClient } from '@/api/client'
import { createDisputeApiV1TenantDisputesPost } from '@/api/generated/sdk.gen'
import type { DisputeCategory } from '@/api/generated/types.gen'
import { CATEGORY_LABELS } from '@/features/disputes/constants'
import { trackEvent } from '@/lib/analytics'

// Single source of truth: derive the picker options from the shared
// CATEGORY_LABELS so the label a tenant selects here matches every later view
// (dispute list, detail) that renders the category via categoryLabel().
const DISPUTE_CATEGORIES = Object.entries(CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label })
)

interface DisputeFormProps {
  statementId: string
  onSuccess: () => void
  onCancel: () => void
}

export function DisputeForm({
  statementId,
  onSuccess,
  onCancel,
}: DisputeFormProps) {
  const [category, setCategory] = useState<string>('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (data: {
      statement_id: string
      category: DisputeCategory
      description: string
    }) => {
      const response = await createDisputeApiV1TenantDisputesPost({
        client: apiClient,
        body: data,
      })
      if (response.error) {
        const error = new Error('Failed to submit dispute') as Error & {
          status: number
        }
        const apiError = response.error as { status?: number }
        error.status = apiError.status || 500
        throw error
      }
      return response.data
    },
    onSuccess: (dispute) => {
      if (dispute) {
        trackEvent('tenant_dispute_create_succeeded', {
          dispute_id: dispute.id,
          statement_id: dispute.statement_id,
          category: dispute.category,
          status: dispute.status,
        })
      }
      toast.success("Dispute submitted. We'll review it soon.")
      queryClient.invalidateQueries({ queryKey: ['tenant-disputes'] })
      onSuccess()
    },
    onError: (error: unknown) => {
      const err = error as { status?: number }
      if (err.status === 429) {
        toast.error(
          'Rate limit exceeded. Maximum 3 disputes per day. Please try again tomorrow.'
        )
      } else {
        toast.error('Failed to submit dispute')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!category || !description.trim()) return

    createMutation.mutate({
      statement_id: statementId,
      category: category as DisputeCategory,
      description: description.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="dispute-category"
          className="block text-sm font-medium mb-1"
        >
          Category{' '}
          <span className="text-destructive-strong" aria-hidden="true">
            *
          </span>
        </label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="dispute-category" aria-required="true">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {DISPUTE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          htmlFor="dispute-description"
          className="block text-sm font-medium mb-1"
        >
          Description{' '}
          <span className="text-destructive-strong" aria-hidden="true">
            *
          </span>
        </label>
        <Textarea
          id="dispute-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe the issue in detail..."
          rows={5}
          required
          aria-required="true"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            createMutation.isPending || !category || !description.trim()
          }
        >
          {createMutation.isPending ? (
            <>
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
              Submitting…
            </>
          ) : (
            'Submit Dispute'
          )}
        </Button>
      </div>
    </form>
  )
}
