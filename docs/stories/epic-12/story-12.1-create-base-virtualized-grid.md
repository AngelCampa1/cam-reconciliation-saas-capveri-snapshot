# Story 12.1: Create Base Virtualized Grid

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 4
- **Dependencies**: Epic 1 (Design System), Epic 4.5 (API Client), Epic 7 (Reconciliation API)
- **Status**: `pending`

## User Story
Build the high-performance virtualized grid shell using TanStack Table + TanStack Virtual that can handle 1000+ rows at 60fps for CAM reconciliation data.

## Acceptance Criteria
- [ ] TanStack Table v8 configured with virtualization via @tanstack/react-virtual
- [ ] Grid renders 1000+ rows without performance degradation
- [ ] Scroll performance maintains 60fps (measured via Chrome DevTools)
- [ ] Column headers remain sticky during vertical scroll
- [ ] Row height is consistent (35px default)
- [ ] Overscan of 5 rows above/below viewport for smooth scrolling
- [ ] Empty state displays when no data available
- [ ] Loading skeleton shows during data fetch
- [ ] Responsive container sizing

## Technical Specifications

Base virtualized grid component using TanStack Table with row virtualization.

```typescript
// src/features/reconciliation/components/ReconciliationGrid.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';

interface ReconciliationGridProps {
  data: ReconciliationRow[];
  columns: ColumnDef<ReconciliationRow>[];
  isLoading?: boolean;
}

export function ReconciliationGrid({ data, columns, isLoading }: ReconciliationGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  });

  // ... render logic
}
```

## Test Cases
- Grid renders with sample data (100 rows)
- Grid handles empty data array gracefully
- Loading state displays skeleton rows
- Scroll position preserved on re-render
- Performance test: 1000 rows render under 100ms

## Definition of Done
- [ ] ReconciliationGrid component created
- [ ] Virtualization working correctly
- [ ] Sticky headers implemented
- [ ] Loading and empty states work
- [ ] Performance benchmarks pass
- [ ] Unit tests passing with 95%+ coverage
