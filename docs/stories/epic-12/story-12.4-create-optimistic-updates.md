# Story 12.4: Create Optimistic Updates

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 3
- **Dependencies**: Story 12.3, Epic 4.5 (API Client)
- **Status**: `pending`

## User Story
Implement optimistic updates using TanStack Query so cell edits appear instantly while syncing to the server in the background.

## Acceptance Criteria
- [ ] Cell updates appear immediately without waiting for API response
- [ ] Failed saves automatically rollback to previous value
- [ ] Toast notification shows on save failure with retry option
- [ ] Pending saves show subtle visual indicator (spinner or pulse)
- [ ] Multiple rapid edits are batched/debounced
- [ ] Conflict detection if another user modified the same cell
- [ ] Undo functionality for recent changes (Ctrl+Z)

## Technical Specifications

Optimistic update pattern with TanStack Query mutation.

```typescript
// src/features/reconciliation/hooks/useCellMutation.ts
export function useCellMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCell,
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['reconciliation'] });
      const previous = queryClient.getQueryData(['reconciliation']);
      queryClient.setQueryData(['reconciliation'], (old) =>
        updateCellInData(old, newData)
      );
      return { previous };
    },
    onError: (err, newData, context) => {
      queryClient.setQueryData(['reconciliation'], context?.previous);
      toast.error('Save failed. Data reverted.');
    },
  });
}
```

## Test Cases
- Optimistic update reflects immediately in UI
- Failed mutation rolls back to previous state
- Toast appears on error with retry button
- Concurrent edits are handled correctly
- Debouncing prevents excessive API calls

## Definition of Done
- [ ] Optimistic updates work correctly
- [ ] Rollback on failure implemented
- [ ] Error toast with retry option
- [ ] Debouncing configured
- [ ] Unit tests passing with 95%+ coverage
