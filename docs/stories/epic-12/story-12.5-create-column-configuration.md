# Story 12.5: Create Column Configuration

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 2
- **Dependencies**: Story 12.1
- **Status**: `pending`

## User Story
Allow users to show/hide columns, reorder them, and persist preferences for personalized grid views.

## Acceptance Criteria
- [ ] Column visibility toggle menu accessible from grid header
- [ ] Drag-and-drop column reordering
- [ ] Column preferences saved to localStorage
- [ ] Reset to default column layout option
- [ ] Minimum of 3 columns must remain visible
- [ ] Column widths are resizable via drag handle
- [ ] Preferences persist across sessions

## Technical Specifications

Column configuration with persistence using TanStack Table column visibility API.

```typescript
// src/features/reconciliation/hooks/useColumnConfig.ts
const STORAGE_KEY = 'reconciliation-grid-columns';

export function useColumnConfig() {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  return { columnVisibility, setColumnVisibility };
}
```

## Test Cases
- Toggling column visibility hides/shows column
- Column order persists after page reload
- Reset restores default column configuration
- Minimum column validation prevents hiding all columns

## Definition of Done
- [ ] Column visibility toggle works
- [ ] Column reordering works
- [ ] Preferences persist in localStorage
- [ ] Reset to defaults works
- [ ] Unit tests passing with 95%+ coverage
