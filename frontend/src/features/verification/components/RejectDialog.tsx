import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const REJECTION_REASONS = [
  {
    value: 'poor_ocr_quality',
    label: 'Poor OCR Quality',
    description: 'Text extraction was unclear or corrupted',
  },
  {
    value: 'wrong_document_type',
    label: 'Wrong Document Type',
    description: 'Not a lease document',
  },
  {
    value: 'missing_pages',
    label: 'Missing Pages',
    description: 'Document appears incomplete',
  },
  {
    value: 'incorrect_extraction',
    label: 'Incorrect Extraction',
    description: 'AI extracted wrong values',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Specify in notes',
  },
] as const

export interface RejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (
    reason: string,
    notes: string | null,
    requeue: boolean
  ) => Promise<void>
  isSubmitting: boolean
}

export function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: RejectDialogProps) {
  const [reason, setReason] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [requeue, setRequeue] = useState(false)

  const handleSubmit = async () => {
    if (!reason) return
    await onConfirm(reason, notes || null, requeue)
    // Reset form after submission
    setReason('')
    setNotes('')
    setRequeue(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      // Reset form when closing
      setReason('')
      setNotes('')
      setRequeue(false)
    }
    onOpenChange(open)
  }

  // Guard against losing a typed reason/notes to an accidental backdrop click
  // or Escape. An empty form stays freely dismissible.
  const isDirty = reason !== '' || notes !== '' || requeue
  const preventAccidentalDismiss = (e: Event) => {
    if (isDirty && !isSubmitting) {
      e.preventDefault()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        data-testid="reject-dialog"
        onInteractOutside={preventAccidentalDismiss}
        onEscapeKeyDown={preventAccidentalDismiss}
      >
        <DialogHeader>
          <DialogTitle>Reject Extraction</DialogTitle>
          <DialogDescription>
            Select a reason for rejection. This helps you track why documents
            were rejected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Rejection Reason
            </Label>
            <RadioGroup
              value={reason}
              onValueChange={setReason}
              data-testid="rejection-reasons"
            >
              {REJECTION_REASONS.map((r) => (
                <div
                  key={r.value}
                  className="flex items-start space-x-3 mb-3 p-2 rounded-md transition-colors duration-fast hover:bg-muted/30"
                  data-testid={`reason-option-${r.value}`}
                >
                  <RadioGroupItem value={r.value} id={r.value} />
                  <label
                    htmlFor={r.value}
                    className="text-sm cursor-pointer flex-1"
                  >
                    <span className="font-medium block">{r.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {r.description}
                    </span>
                  </label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="notes" className="text-sm font-medium">
              Additional Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide additional context..."
              className="mt-1"
              disabled={isSubmitting}
              data-testid="rejection-notes"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="requeue"
              checked={requeue}
              onCheckedChange={(checked) => setRequeue(checked as boolean)}
              disabled={isSubmitting}
              data-testid="requeue-checkbox"
            />
            <Label
              htmlFor="requeue"
              className="text-sm font-normal cursor-pointer"
            >
              Re-queue for extraction (will retry with same document)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
            data-testid="cancel-button"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
            data-testid="confirm-button"
          >
            {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
