# Story 12.7: Create Expense Pool Grouping

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 3
- **Dependencies**: Story 12.1, Epic 6 (Calculation Engine)
- **Status**: `pending`

## User Story
Group GL entries by expense pool with collapsible sections and pool-level subtotals for organized reconciliation view.

## Acceptance Criteria
- [ ] Rows grouped by expense pool (CAM, Taxes, Insurance, etc.)
- [ ] Collapsible group headers with expand/collapse toggle
- [ ] Group header shows pool name and subtotal
- [ ] Expand/collapse all button in toolbar
- [ ] Collapsed state persisted in localStorage
- [ ] Group totals update when child rows change
- [ ] Visual hierarchy with indentation and styling

## Technical Specifications

Row grouping with TanStack Table grouping API and collapsible sections.

```typescript
// src/features/reconciliation/components/GroupedGrid.tsx
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getGroupedRowModel: getGroupedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  groupedColumnMode: 'reorder',
});

// Group header row render
function GroupHeader({ row }: { row: Row<ReconciliationRow> }) {
  return (
    <div className="flex items-center gap-2 font-semibold bg-muted/50">
      <Button variant="ghost" size="sm" onClick={row.getToggleExpandedHandler()}>
        {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
      </Button>
      <span>{row.groupingValue as string}</span>
      <span className="ml-auto">{formatCurrency(row.getLeafRows().reduce(...))}</span>
    </div>
  );
}
```

## Test Cases
- Rows correctly grouped by expense pool
- Clicking header expands/collapses group
- Subtotals calculate correctly
- Expand all / collapse all works
- Collapsed state persists across reloads

## Definition of Done
- [ ] Grouping by expense pool works
- [ ] Collapse/expand functionality complete
- [ ] Subtotals display correctly
- [ ] State persistence works
- [ ] Unit tests passing with 95%+ coverage
