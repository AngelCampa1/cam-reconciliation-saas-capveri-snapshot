# Story 12.10: Create Calculate Button

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 2
- **Dependencies**: Story 12.1, Epic 7 (Reconciliation API)
- **Status**: `pending`

## User Story
Add a prominent calculate button that triggers the reconciliation calculation via API and refreshes the grid with results.

## Acceptance Criteria
- [ ] Calculate button visible in grid toolbar
- [ ] Button disabled while calculation is in progress
- [ ] Loading spinner shown during calculation
- [ ] Success toast with summary (e.g., "Calculated 15 tenants")
- [ ] Error toast if calculation fails
- [ ] Grid automatically refreshes with new data on success
- [ ] Confirmation dialog if overwriting existing draft

## Technical Specifications

Calculate button with API integration and loading state.

```typescript
// src/features/reconciliation/components/CalculateButton.tsx
export function CalculateButton({ propertyId, period }: CalculateButtonProps) {
  const calculateMutation = useCalculateReconciliation();
  const { refetch } = useReconciliationData(propertyId, period);

  const handleCalculate = async () => {
    try {
      await calculateMutation.mutateAsync({ propertyId, ...period });
      await refetch();
      toast.success('Calculation complete');
    } catch (error) {
      toast.error('Calculation failed');
    }
  };

  return (
    <Button
      onClick={handleCalculate}
      disabled={calculateMutation.isPending}
    >
      {calculateMutation.isPending ? <Loader2 className="animate-spin" /> : 'Calculate'}
    </Button>
  );
}
```

## Test Cases
- Button triggers calculation API call
- Loading state shown during calculation
- Success refreshes grid data
- Error displays toast message
- Confirmation shown for existing drafts

## Definition of Done
- [ ] Calculate button triggers API
- [ ] Loading state works correctly
- [ ] Success/error toasts display
- [ ] Grid refreshes on success
- [ ] Unit tests passing with 95%+ coverage
