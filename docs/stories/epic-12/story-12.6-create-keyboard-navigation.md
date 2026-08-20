# Story 12.6: Create Keyboard Navigation

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 3
- **Dependencies**: Story 12.3
- **Status**: `pending`

## User Story
Implement full keyboard navigation for power users to navigate and edit the grid without using a mouse.

## Acceptance Criteria
- [ ] Arrow keys move focus between cells
- [ ] Enter key activates edit mode on focused cell
- [ ] Tab moves to next editable cell (skipping read-only)
- [ ] Shift+Tab moves to previous editable cell
- [ ] Home/End jump to first/last cell in row
- [ ] Ctrl+Home/End jump to first/last row
- [ ] Page Up/Down scroll by visible page height
- [ ] Focus indicator clearly visible on active cell
- [ ] Screen reader announces cell position and value

## Technical Specifications

Keyboard navigation handler with focus management.

```typescript
// src/features/reconciliation/hooks/useGridKeyboard.ts
export function useGridKeyboard(table: Table<ReconciliationRow>) {
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!focusedCell) return;

    switch (e.key) {
      case 'ArrowUp':
        setFocusedCell({ ...focusedCell, row: Math.max(0, focusedCell.row - 1) });
        break;
      case 'ArrowDown':
        setFocusedCell({ ...focusedCell, row: focusedCell.row + 1 });
        break;
      // ... other keys
    }
  }, [focusedCell]);

  return { focusedCell, setFocusedCell, handleKeyDown };
}
```

## Test Cases
- Arrow keys navigate between cells
- Enter activates edit mode
- Tab skips read-only cells
- Home/End work correctly within row
- Focus indicator is visible and accessible

## Definition of Done
- [ ] All keyboard shortcuts implemented
- [ ] Focus indicator clearly visible
- [ ] Screen reader compatible
- [ ] No keyboard traps
- [ ] Unit tests passing with 95%+ coverage
