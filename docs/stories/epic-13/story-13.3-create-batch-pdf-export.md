# Story 13.3: Create Batch PDF Export

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 3
- **Dependencies**: Story 13.2
- **Status**: `pending`

## User Story
Enable exporting PDFs for multiple tenants at once, either as individual files in a ZIP or as a combined multi-tenant PDF.

## Acceptance Criteria
- [ ] Tenant selection interface (checkboxes, select all)
- [ ] Option: individual PDFs in ZIP vs combined PDF
- [ ] Progress indicator showing completion percentage
- [ ] Estimated time remaining for large batches
- [ ] Cancel button to abort batch operation
- [ ] Automatic download when complete
- [ ] Error handling for partial failures

## Technical Specifications

Batch PDF export with progress tracking and ZIP generation.

```typescript
// src/features/export/components/BatchPDFExport.tsx
export function BatchPDFExport({ snapshotId, tenants }: BatchPDFExportProps) {
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [exportMode, setExportMode] = useState<'zip' | 'combined'>('zip');
  const batchMutation = useBatchPDFExport();

  const handleExport = () => {
    batchMutation.mutate({
      snapshotId,
      tenantIds: selectedTenants,
      mode: exportMode,
    });
  };

  return (
    <div className="space-y-4">
      <TenantSelector
        tenants={tenants}
        selected={selectedTenants}
        onChange={setSelectedTenants}
      />
      <RadioGroup value={exportMode} onValueChange={setExportMode}>
        <RadioGroupItem value="zip">Individual PDFs (ZIP)</RadioGroupItem>
        <RadioGroupItem value="combined">Combined PDF</RadioGroupItem>
      </RadioGroup>
      {batchMutation.isPending && (
        <Progress value={batchMutation.progress} />
      )}
    </div>
  );
}
```

## Test Cases
- Tenant selection works correctly
- Select all/deselect all functions
- Progress updates during batch
- ZIP download contains correct files
- Combined PDF has all tenants

## Definition of Done
- [ ] Tenant selection UI works
- [ ] Both export modes work
- [ ] Progress tracking accurate
- [ ] Downloads complete successfully
- [ ] Unit tests passing with 95%+ coverage
