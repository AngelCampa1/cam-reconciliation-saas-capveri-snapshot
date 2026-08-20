# Story 12.11: Create Finalize Workflow

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 2
- **Dependencies**: Story 12.10, Epic 7 (Reconciliation API)
- **Status**: `pending`

## User Story
Implement the finalization workflow that locks reconciliation snapshots and prevents further edits.

## Acceptance Criteria
- [ ] Finalize button enabled only when draft exists
- [ ] Confirmation modal warns that action is irreversible
- [ ] Modal shows summary of what will be finalized
- [ ] Finalization calls API endpoint to lock snapshot
- [ ] Grid becomes read-only after finalization
- [ ] Visual indicator shows finalized state (badge/banner)
- [ ] Finalized snapshots cannot be recalculated

## Technical Specifications

Finalize workflow with confirmation modal and state management.

```typescript
// src/features/reconciliation/components/FinalizeModal.tsx
export function FinalizeModal({ isOpen, onClose, snapshot, onConfirm }: FinalizeModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalize Reconciliation?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The reconciliation for {snapshot.period}
            will be locked and no further changes will be allowed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <p>Summary:</p>
          <ul className="list-disc ml-4">
            <li>{snapshot.tenantCount} tenants</li>
            <li>Total billable: {formatCurrency(snapshot.totalBillable)}</li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Finalize</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

## Test Cases
- Finalize button disabled without draft
- Confirmation modal displays summary
- Cancel dismisses modal without action
- Confirm calls finalize API
- Grid becomes read-only after finalization

## Definition of Done
- [ ] Finalize button logic works
- [ ] Confirmation modal displays correctly
- [ ] API call succeeds
- [ ] Grid becomes read-only
- [ ] Unit tests passing with 95%+ coverage
