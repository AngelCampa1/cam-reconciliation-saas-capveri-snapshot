# Story 16.7: Create Approval Workflow

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 2
- **Dependencies**: Story 16.6
- **Status**: `completed`

## User Story
Implement the approval button that commits verified extractions to the database.

## Acceptance Criteria
- [x] Approve button commits all values
- [x] Confirmation dialog before approval
- [x] Shows summary of changes
- [x] Updates extraction job status
- [x] Logs verification action
- [x] Redirects to next document or list

## Technical Specifications

Approval workflow with confirmation dialog, change summary display, and proper logging.

**Reference**: See `docs/architecture/hitl-state-management.md` for full state management patterns.

### Backend API Endpoint

```python
# backend/app/api/v1/extractions.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/extractions", tags=["extractions"])

class ApproveExtractionRequest(BaseModel):
    profile: LeaseRecoveryProfile
    edit_history: list[EditAction]

class ApproveExtractionResponse(BaseModel):
    success: bool
    lease_id: UUID

@router.post("/{document_id}/approve", response_model=ApproveExtractionResponse)
async def approve_extraction(
    document_id: UUID,
    request: ApproveExtractionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Commit verified extraction to the database.

    1. Validate all required fields are present
    2. Update lease.recovery_profile with verified data
    3. Mark extraction job as 'verified'
    4. Log verification action with edit history
    5. Return the updated lease ID
    """
    # Fetch extraction job
    extraction = await db.get(ExtractionJob, document_id)
    if not extraction:
        raise HTTPException(status_code=404, detail="Extraction not found")

    if extraction.status == 'verified':
        raise HTTPException(status_code=400, detail="Already verified")

    # Update lease with verified profile
    lease = await db.get(Lease, extraction.lease_id)
    lease.recovery_profile = request.profile.model_dump()
    lease.updated_at = datetime.utcnow()

    # Mark extraction as verified
    extraction.status = 'verified'
    extraction.verified_by = current_user.id
    extraction.verified_at = datetime.utcnow()
    extraction.edit_history = [e.model_dump() for e in request.edit_history]

    await db.commit()

    return ApproveExtractionResponse(success=True, lease_id=lease.id)
```

### Frontend Approval Dialog

```typescript
// frontend/src/features/verification/components/ApprovalDialog.tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: LeaseRecoveryProfile;
  originalProfile: LeaseRecoveryProfile;
  editHistory: EditAction[];
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
}

export function ApprovalDialog({
  open,
  onOpenChange,
  profile,
  originalProfile,
  editHistory,
  onConfirm,
  isSubmitting,
}: ApprovalDialogProps) {
  const changedFields = Object.entries(profile).filter(
    ([key, value]) => value !== originalProfile[key as keyof LeaseRecoveryProfile]
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Approve Extraction</AlertDialogTitle>
          <AlertDialogDescription>
            This will commit the verified lease terms to the database.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {changedFields.length > 0 && (
          <div className="my-4">
            <h4 className="text-sm font-medium mb-2">Changes Made ({editHistory.length})</h4>
            <ul className="text-sm space-y-1 max-h-40 overflow-auto">
              {changedFields.map(([field, value]) => (
                <li key={field} className="flex justify-between">
                  <span className="text-muted-foreground">{field}:</span>
                  <span className="font-mono">
                    {String(originalProfile[field])} → {String(value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {changedFields.length === 0 && (
          <p className="text-sm text-muted-foreground my-4">
            No changes made. Original extraction will be committed.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Approving...' : 'Confirm Approval'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Usage in VerificationPage
const handleApprove = async () => {
  setIsSubmitting(true);
  try {
    const response = await fetch(`/api/v1/extractions/${documentId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: state.editedProfile,
        edit_history: state.editHistory,
      }),
    });

    if (!response.ok) throw new Error('Approval failed');

    toast.success('Extraction approved successfully');
    navigate('/extractions'); // Redirect to list
  } catch (error) {
    toast.error('Failed to approve extraction');
  } finally {
    setIsSubmitting(false);
  }
};
```

## Test Cases

Test approval workflow including:
- Confirmation dialog displays all changed fields
- Unchanged extraction shows "no changes" message
- API validates required fields before commit
- Lease record updated with verified profile
- Extraction job status changed to 'verified'
- Edit history logged for audit trail
- Redirect to extraction list after success
- Error handling shows toast on failure

## Definition of Done
- [x] Approval commits values to database
- [x] Confirmation dialog shows changes
- [x] Extraction job marked as verified
- [x] Lease updated with verified data
- [x] Proper redirect after approval
- [x] Unit tests passing with 95%+ coverage

## Implementation Notes

### Files Created/Modified

**Database**:
- `supabase/migrations/20240101000018_add_document_verification_fields.sql` - Added verification tracking fields (verified_by, verified_at, edit_history, lease_id)

**Backend**:
- `backend/app/models/enums.py` - Added VERIFIED status to DocumentStatus enum
- `backend/app/models/document.py` - Added verification fields to Document and DocumentUpdate models
- `backend/app/api/v1/schemas/extraction_schemas.py` - Created EditAction, ApproveExtractionRequest/Response, and SaveDraftRequest/Response schemas
- `backend/app/api/v1/extraction.py` - Implemented approve_extraction and save_draft endpoints
- `backend/tests/test_extraction_api.py` - Added 8 tests for approval workflow

**Frontend**:
- `frontend/src/features/verification/components/ApprovalDialog.tsx` - Created approval confirmation dialog with change summary
- `frontend/src/features/verification/components/ApprovalDialog.test.tsx` - Added 18 comprehensive tests

### Test Results
- **Backend**: 11/11 tests passing ✅
- **Frontend**: 18/18 tests passing ✅

### Key Implementation Details

1. **Approval Endpoint**: POST `/extraction/{document_id}/approve`
   - Validates document exists and hasn't been verified
   - Validates document has associated lease_id
   - Updates lease recovery_profile with verified data
   - Marks document as verified with user and timestamp
   - Stores edit_history for audit trail

2. **Draft Endpoint**: PUT `/extraction/{document_id}/draft`
   - Auto-save functionality to prevent data loss
   - Stores draft state in extraction_result field

3. **ApprovalDialog Component**:
   - Compares current vs original profile to detect changes
   - Displays change summary with before/after values
   - Formats values appropriately (null → "N/A", boolean → "Yes/No", arrays → comma-separated)
   - Shows "no changes" message when profiles match
   - Handles loading state during submission
