# Story 12.2: Create Cell Renderers

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 4
- **Dependencies**: Story 12.1
- **Status**: `pending`

## User Story
Create specialized cell renderer components for different data types (currency, percentage, text, status) with proper formatting and styling.

## Acceptance Criteria
- [ ] CurrencyCell renders Decimal values with $ symbol and 2 decimal places
- [ ] PercentageCell renders values with % symbol and appropriate precision
- [ ] TextCell handles overflow with ellipsis and tooltip
- [ ] StatusCell displays colored badges for reconciliation states
- [ ] DifferenceCell shows positive (green) vs negative (red) variances
- [ ] All cells support read-only mode
- [ ] Cells handle null/undefined values gracefully
- [ ] Consistent styling with design system tokens

## Technical Specifications

Custom cell renderers for TanStack Table column definitions.

```typescript
// src/features/reconciliation/components/cells/CurrencyCell.tsx
export function CurrencyCell({ value }: { value: Decimal | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));

  return <span className="font-mono text-right">{formatted}</span>;
}
```

## Test Cases
- CurrencyCell formats positive and negative amounts correctly
- PercentageCell handles 0-1 range and 0-100 range
- TextCell truncates long strings and shows tooltip
- StatusCell renders correct badge colors
- DifferenceCell applies correct color based on sign

## Definition of Done
- [ ] All cell renderer components created
- [ ] Consistent formatting across cell types
- [ ] Null handling works correctly
- [ ] Styling matches design system
- [ ] Unit tests passing with 95%+ coverage
