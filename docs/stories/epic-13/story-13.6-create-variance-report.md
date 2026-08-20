# Story 13.6: Create Variance Report

## Story Info
- **Epic**: Reporting & Export UI
- **Estimated Hours**: 3
- **Dependencies**: Story 13.1, Story 7.5 (Variance Detection API)
- **Status**: `pending`

## User Story
Generate a variance report comparing current reconciliation to prior year, highlighting significant changes.

## Acceptance Criteria
- [ ] Side-by-side comparison of current vs prior year
- [ ] Variance column showing dollar and percentage difference
- [ ] Configurable threshold for highlighting (e.g., >10% change)
- [ ] Color coding: green for decrease, red for increase
- [ ] Drill-down to see line-item variances
- [ ] Export variance report to PDF/Excel
- [ ] Filter to show only significant variances

## Technical Specifications

Variance report with comparison table and threshold highlighting.

```typescript
// src/features/export/components/VarianceReport.tsx
interface VarianceReportProps {
  currentSnapshotId: string;
  priorSnapshotId: string;
  threshold: number;
}

export function VarianceReport({ currentSnapshotId, priorSnapshotId, threshold }: VarianceReportProps) {
  const { data: comparison } = useVarianceComparison(currentSnapshotId, priorSnapshotId);

  const significantVariances = comparison?.filter(
    (item) => Math.abs(item.variancePercent) >= threshold
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Label>Highlight threshold:</Label>
        <Slider value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
        <span>{threshold}%</span>
      </div>

      <VarianceTable
        data={comparison}
        highlightThreshold={threshold}
      />

      <div className="flex gap-2">
        <Button onClick={() => exportToPDF(comparison)}>Export PDF</Button>
        <Button variant="outline" onClick={() => exportToExcel(comparison)}>Export Excel</Button>
      </div>
    </div>
  );
}
```

## Test Cases
- Comparison loads data for both years
- Variance calculations are accurate
- Threshold slider filters correctly
- Color coding applies based on variance direction
- Export generates correct report

## Definition of Done
- [ ] Variance comparison displays
- [ ] Threshold highlighting works
- [ ] Color coding correct
- [ ] Export to PDF/Excel works
- [ ] Unit tests passing with 95%+ coverage
