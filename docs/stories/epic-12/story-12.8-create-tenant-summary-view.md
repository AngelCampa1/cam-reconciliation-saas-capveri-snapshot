# Story 12.8: Create Tenant Summary View

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 2
- **Dependencies**: Story 12.7
- **Status**: `pending`

## User Story
Display a summary panel showing per-tenant totals, pro-rata shares, and billable amounts for quick reconciliation review.

## Acceptance Criteria
- [ ] Summary panel shows list of all tenants
- [ ] Each tenant row displays: name, pro-rata share, total billable
- [ ] Clicking tenant filters grid to show only their entries
- [ ] Grand total row at bottom
- [ ] Variance column shows difference from prior year
- [ ] Summary updates in real-time as grid data changes
- [ ] Collapsible panel to maximize grid space

## Technical Specifications

Tenant summary sidebar component with filtering integration.

```typescript
// src/features/reconciliation/components/TenantSummary.tsx
interface TenantSummaryProps {
  tenants: TenantSummaryData[];
  onTenantSelect: (tenantId: string | null) => void;
  selectedTenantId: string | null;
}

export function TenantSummary({ tenants, onTenantSelect, selectedTenantId }: TenantSummaryProps) {
  const grandTotal = tenants.reduce((sum, t) => sum + t.totalBillable, 0);

  return (
    <div className="border-l p-4 w-80">
      <h3 className="font-semibold mb-4">Tenant Summary</h3>
      {tenants.map((tenant) => (
        <TenantRow
          key={tenant.id}
          tenant={tenant}
          isSelected={tenant.id === selectedTenantId}
          onClick={() => onTenantSelect(tenant.id)}
        />
      ))}
      <div className="border-t mt-4 pt-4 font-bold">
        Grand Total: {formatCurrency(grandTotal)}
      </div>
    </div>
  );
}
```

## Test Cases
- Summary displays all tenants with correct totals
- Clicking tenant filters grid appropriately
- Clear filter shows all entries again
- Grand total is sum of all tenant totals
- Real-time updates when grid data changes

## Definition of Done
- [ ] Summary panel displays tenant data
- [ ] Tenant selection filters grid
- [ ] Grand total calculates correctly
- [ ] Real-time updates work
- [ ] Unit tests passing with 95%+ coverage
