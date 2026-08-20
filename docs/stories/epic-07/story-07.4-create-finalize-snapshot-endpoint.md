# Story 7.4: Create Finalize Snapshot Endpoint

## Story Info
- **Epic**: Reconciliation API
- **Estimated Hours**: 3
- **Dependencies**: Story 7.1 (snapshots must exist to finalize)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to finalize a reconciliation snapshot so that it becomes immutable and can be used for billing.

## Acceptance Criteria
- POST `/api/v1/reconciliation/snapshots/{id}/finalize` locks the record
- Returns 409 Conflict if already finalized
- Sets is_finalized=true, finalized_at, finalized_by
- Finalized snapshots cannot be updated or deleted (enforced by RLS)
- Optional: Finalize all drafts for a property/period in batch

## Technical Specifications
Implement in `backend/app/api/v1/reconciliation.py`:
- Single snapshot finalization endpoint
- Batch finalization endpoint for property/period
- Validation that snapshot has complete calculation_trace
- Atomic finalization with audit trail
- FinalizeResponse and BatchFinalizeResponse models
- Database RLS prevents mutations on finalized records

Single finalize handles:
- Existence check
- Idempotence check (already finalized)
- Validation that calculation is complete
- Atomic update with timestamp and user tracking

Batch finalize handles:
- Find all draft snapshots for property/period
- Attempt finalization of each
- Collect successes and failures
- Return summary with partial success handling

## Test Cases
- Finalize single draft snapshot successfully
- Return 409 when already finalized
- Cannot finalize if calculation_trace missing
- finalized_at timestamp set correctly
- finalized_by captures current user
- Finalized snapshot prevents subsequent updates
- Finalized snapshot prevents deletion
- Batch finalize all drafts for property/period
- Batch finalize with mixed success/failure
- Batch finalize when no drafts found (404)
- Audit trail captures finalization event
- Idempotent: re-finalizing returns same 409 error

## Definition of Done
- [ ] Single finalize endpoint works correctly
- [ ] Returns 409 for already-finalized snapshots
- [ ] Batch finalize endpoint works correctly
- [ ] Partial batch failures handled gracefully
- [ ] RLS prevents updates to finalized records
- [ ] Audit trail captures finalization event
- [ ] Unit tests cover success and conflict paths
