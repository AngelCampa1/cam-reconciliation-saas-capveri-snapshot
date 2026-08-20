# Story 16.8: Create Reject Workflow

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 2
- **Dependencies**: Story 16.6
- **Status**: `pending`

## User Story
Implement rejection workflow that sends extraction back for re-processing or manual entry.

## Acceptance Criteria
- [ ] Reject button with reason selection
- [ ] Pre-defined rejection reasons
- [ ] Custom reason text option
- [ ] Marks extraction as rejected
- [ ] Option to trigger re-extraction
- [ ] Redirects appropriately

## Technical Specifications

Rejection workflow with reason selection, optional re-extraction triggering, and proper status management.

**Reference**: See `docs/architecture/hitl-state-management.md` for full state management patterns.

### Backend API Endpoint

```python
# backend/app/api/v1/extractions.py
from enum import Enum

class RejectionReason(str, Enum):
    POOR_OCR_QUALITY = "poor_ocr_quality"
    WRONG_DOCUMENT_TYPE = "wrong_document_type"
    MISSING_PAGES = "missing_pages"
    INCORRECT_EXTRACTION = "incorrect_extraction"
    OTHER = "other"

class RejectExtractionRequest(BaseModel):
    reason: RejectionReason
    reason_notes: str | None = None
    requeue: bool = False  # Whether to trigger re-extraction

class RejectExtractionResponse(BaseModel):
    success: bool
    requeued: bool = False

@router.post("/{document_id}/reject", response_model=RejectExtractionResponse)
async def reject_extraction(
    document_id: UUID,
    request: RejectExtractionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    celery_app: Celery = Depends(get_celery),
):
    """
    Reject extraction and optionally requeue for re-processing.

    1. Mark extraction job as 'rejected'
    2. Log rejection reason and notes
    3. If requeue=true, submit new extraction task
    4. Return success status
    """
    extraction = await db.get(ExtractionJob, document_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extraction not found")

    # Mark as rejected
    extraction.status = 'rejected'
    extraction.rejected_by = current_user.id
    extraction.rejected_at = datetime.utcnow()
    extraction.rejection_reason = request.reason.value
    extraction.rejection_notes = request.reason_notes

    requeued = False
    if request.requeue:
        # Create new extraction job
        new_job = ExtractionJob(
            document_id=extraction.document_id,
            lease_id=extraction.lease_id,
            status='pending',
            retry_count=extraction.retry_count + 1,
            parent_job_id=extraction.id,  # Link to rejected job
        )
        db.add(new_job)
        await db.flush()

        # Queue Celery task
        celery_app.send_task(
            'extraction.extract_lease',
            args=[str(new_job.id)],
            queue='extraction',
        )
        requeued = True

    await db.commit()
    return RejectExtractionResponse(success=True, requeued=requeued)
```

### Frontend Reject Dialog

```typescript
// frontend/src/features/verification/components/RejectDialog.tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const REJECTION_REASONS = [
  { value: 'poor_ocr_quality', label: 'Poor OCR Quality', description: 'Text extraction was unclear or corrupted' },
  { value: 'wrong_document_type', label: 'Wrong Document Type', description: 'Not a lease document' },
  { value: 'missing_pages', label: 'Missing Pages', description: 'Document appears incomplete' },
  { value: 'incorrect_extraction', label: 'Incorrect Extraction', description: 'AI extracted wrong values' },
  { value: 'other', label: 'Other', description: 'Specify in notes' },
] as const;

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, notes: string | null, requeue: boolean) => Promise<void>;
  isSubmitting: boolean;
}

export function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: RejectDialogProps) {
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [requeue, setRequeue] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    await onConfirm(reason, notes || null, requeue);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Extraction</DialogTitle>
          <DialogDescription>
            Select a reason for rejection. This feedback helps improve extraction quality.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={reason} onValueChange={setReason}>
            {REJECTION_REASONS.map((r) => (
              <div key={r.value} className="flex items-start space-x-3">
                <RadioGroupItem value={r.value} id={r.value} />
                <label htmlFor={r.value} className="text-sm">
                  <span className="font-medium">{r.label}</span>
                  <p className="text-muted-foreground">{r.description}</p>
                </label>
              </div>
            ))}
          </RadioGroup>

          <div>
            <label className="text-sm font-medium">Additional Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide additional context..."
              className="mt-1"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="requeue"
              checked={requeue}
              onCheckedChange={(checked) => setRequeue(checked as boolean)}
            />
            <label htmlFor="requeue" className="text-sm">
              Re-queue for extraction (will retry with same document)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
          >
            {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Test Cases

Test rejection workflow including:
- Rejection reason is required (button disabled without selection)
- All predefined reasons selectable
- Custom notes field accepts text
- Requeue checkbox triggers new extraction job
- API marks extraction as 'rejected'
- Rejection reason and notes logged
- New job linked to parent job when requeued
- Celery task queued for re-extraction
- Redirect to extraction list after rejection

## Definition of Done
- [ ] Reject button opens dialog
- [ ] Reason selection required
- [ ] Notes captured
- [ ] Re-extraction option works
- [ ] Extraction marked as rejected
- [ ] Unit tests passing with 95%+ coverage
