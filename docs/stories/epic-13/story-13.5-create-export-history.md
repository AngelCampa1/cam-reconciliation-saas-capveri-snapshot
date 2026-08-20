# Story 13.5: Create Export History

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 3
- **Dependencies**: Story 13.1
- **Status**: `pending`

## User Story
Display a history of past exports with download links, allowing users to re-download previous exports.

## Acceptance Criteria
- [ ] List of past exports with date, format, and user
- [ ] Filter by export type (PDF, Excel, ERP)
- [ ] Filter by date range
- [ ] Re-download link for each export (if still available)
- [ ] Expiration indicator for exports approaching deletion
- [ ] Pagination for long history lists
- [ ] Delete option for authorized users

## Technical Specifications

Export history table with filtering and re-download capability.

```typescript
// src/features/export/components/ExportHistory.tsx
export function ExportHistory({ propertyId }: ExportHistoryProps) {
  const [filters, setFilters] = useState<ExportFilters>({});
  const { data: exports, isLoading } = useExportHistory(propertyId, filters);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Select
          placeholder="Format"
          value={filters.format}
          onValueChange={(v) => setFilters({ ...filters, format: v })}
        >
          <SelectItem value="pdf">PDF</SelectItem>
          <SelectItem value="excel">Excel</SelectItem>
          <SelectItem value="erp">ERP</SelectItem>
        </Select>
        <DateRangePicker
          value={filters.dateRange}
          onChange={(v) => setFilters({ ...filters, dateRange: v })}
        />
      </div>

      <DataTable
        columns={exportHistoryColumns}
        data={exports}
        isLoading={isLoading}
      />
    </div>
  );
}
```

## Test Cases
- History table loads with export records
- Filters narrow results correctly
- Re-download link works for valid exports
- Expired exports show appropriate indicator
- Pagination navigates correctly

## Definition of Done
- [ ] Export history table displays
- [ ] Filters work correctly
- [ ] Re-download functionality works
- [ ] Expiration handling complete
- [ ] Unit tests passing with 95%+ coverage
