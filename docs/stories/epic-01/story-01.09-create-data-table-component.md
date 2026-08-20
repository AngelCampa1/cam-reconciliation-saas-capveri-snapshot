# Story 1.9: Create Data Table Component

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 4
- **Dependencies**: Story 1.3 (Shadcn/UI must be installed)
- **Status**: `pending`

## User Story
**As a** user
**I want** data tables that are sortable, paginated, and easy to navigate
**So that** I can quickly find and manage records

## Acceptance Criteria

- [ ] **AC1**: Table renders with proper header and body structure
- [ ] **AC2**: Columns are sortable (click header to toggle)
- [ ] **AC3**: Pagination controls show:
  - Current page / total pages
  - Rows per page selector
  - Previous/Next buttons
- [ ] **AC4**: Row selection with checkbox (single and multi-select)
- [ ] **AC5**: Empty state displayed when no data
- [ ] **AC6**: Loading state with skeleton rows
- [ ] **AC7**: Keyboard navigation (Tab through cells, Enter to select)
- [ ] **AC8**: Responsive: horizontal scroll on mobile

## Technical Specifications

**Files to Create**:
```
frontend/src/components/
└── ui/
    ├── table.tsx           (base table from shadcn)
    └── data-table/
        ├── DataTable.tsx
        ├── DataTablePagination.tsx
        ├── DataTableHeader.tsx
        └── DataTableSkeleton.tsx
```

**Dependencies to Add**:
```json
{
  "dependencies": {
    "@tanstack/react-table": "^8.11.0"
  }
}
```

**DataTable.tsx** (core pattern):
```typescript
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  emptyMessage?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No results found',
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return <DataTableSkeleton columns={columns.length} />
  }

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {/* Sortable header content */}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <DataTablePagination table={table} />
    </div>
  )
}
```

## Test Cases

- [ ] Table renders with test data
- [ ] Sorting works on all columns
- [ ] Pagination navigates correctly
- [ ] Row selection tracks selected items

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Table renders with test data
- [ ] Sorting works on all columns
- [ ] Pagination navigates correctly
- [ ] Row selection tracks selected items
