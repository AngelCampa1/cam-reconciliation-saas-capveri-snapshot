/**
 * StatusUpdateForm Component
 *
 * Form for landlord/admin to update dispute status.
 * Enforces state machine transitions:
 * OPEN → UNDER_REVIEW → RESOLVED/REJECTED → CLOSED
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { DisputeStatus, UpdateStatusRequest } from '@/api/hooks'

interface StatusUpdateFormProps {
  currentStatus: DisputeStatus
  onSubmit: (data: UpdateStatusRequest) => void
  isLoading: boolean
}

// State machine: valid transitions from each state
const VALID_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ['under_review'],
  under_review: ['resolved', 'rejected'],
  resolved: ['closed'],
  rejected: ['closed'],
  closed: [],
}

// States that require resolution summary
const REQUIRES_RESOLUTION: DisputeStatus[] = ['resolved', 'rejected']

// Human-readable labels for statuses
const STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  resolved: 'Resolved',
  rejected: 'Rejected',
  closed: 'Closed',
}

export function StatusUpdateForm({
  currentStatus,
  onSubmit,
  isLoading,
}: StatusUpdateFormProps) {
  const validNextStates = VALID_TRANSITIONS[currentStatus]
  const [selectedStatus, setSelectedStatus] = useState<DisputeStatus | ''>('')
  const [resolutionSummary, setResolutionSummary] = useState('')
  const [error, setError] = useState<string | null>(null)

  // When the dispute's status advances (e.g. after a successful update the
  // parent refetches), clear the form instead of leaving a now-invalid
  // selection blank with leftover summary text. Resetting during render off a
  // tracked previous value is the React-recommended pattern (avoids an effect).
  const [prevStatus, setPrevStatus] = useState(currentStatus)
  if (currentStatus !== prevStatus) {
    setPrevStatus(currentStatus)
    setSelectedStatus('')
    setResolutionSummary('')
    setError(null)
  }

  // Don't render if no valid transitions
  if (validNextStates.length === 0) {
    return null
  }

  const needsResolution =
    selectedStatus && REQUIRES_RESOLUTION.includes(selectedStatus)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedStatus) {
      setError('Please select a status')
      return
    }

    if (needsResolution && !resolutionSummary.trim()) {
      setError('Resolution summary is required for this status')
      return
    }

    onSubmit({
      status: selectedStatus,
      resolution_summary: needsResolution ? resolutionSummary : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="status">New Status</Label>
        <Select
          value={selectedStatus}
          onValueChange={(value) => setSelectedStatus(value as DisputeStatus)}
        >
          <SelectTrigger id="status">
            <SelectValue placeholder="Select new status" />
          </SelectTrigger>
          <SelectContent>
            {validNextStates.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsResolution && (
        <div className="space-y-2">
          <Label htmlFor="resolution-summary">Resolution Summary</Label>
          <Textarea
            id="resolution-summary"
            placeholder="Describe how this dispute was resolved..."
            value={resolutionSummary}
            onChange={(e) => setResolutionSummary(e.target.value)}
            rows={3}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive-strong" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isLoading || !selectedStatus}
        className="min-h-[44px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          'Update Status'
        )}
      </Button>
    </form>
  )
}
