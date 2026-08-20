import type { BadgeProps } from '@/components/ui/badge'

export type WorkflowStatus =
  | 'active'
  | 'approved'
  | 'archived'
  | 'closed'
  | 'completed'
  | 'draft'
  | 'failed'
  | 'in_progress'
  | 'open'
  | 'pending'
  | 'ready_for_review'
  | 'rejected'
  | 'resolved'
  | 'verified'

export function getWorkflowStatusVariant(
  status: string | null | undefined
): BadgeProps['variant'] {
  const normalized = status?.toLowerCase().replace(/[-\s]+/g, '_')

  switch (normalized) {
    case 'active':
    case 'approved':
    case 'completed':
    case 'resolved':
    case 'verified':
      return 'success'
    case 'draft':
      return 'draft'
    case 'in_progress':
    case 'ready_for_review':
      return 'in-progress'
    case 'pending':
    case 'open':
      return 'pending'
    case 'failed':
    case 'rejected':
      return 'destructive'
    case 'archived':
    case 'closed':
      return 'archived'
    default:
      return 'secondary'
  }
}

export function formatWorkflowStatus(status: string | null | undefined) {
  if (!status) return 'Unknown'
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
