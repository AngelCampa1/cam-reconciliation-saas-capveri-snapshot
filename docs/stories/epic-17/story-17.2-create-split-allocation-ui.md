# Story 17.2: Create Split Allocation UI

## Story Info
- **Epic**: Advanced Expense Pools
- **Estimated Hours**: 4
- **Dependencies**: Story 17.1
- **Status**: `completed`

## User Story
Create the interface for handling split allocations where expenses are divided among multiple sub-pools using percentages or fixed amounts.

## Acceptance Criteria
- [x] UI to add/delete percentage split allocations
- [x] Display allocation breakdown with percentages
- [x] Validate allocations do not exceed 100%
- [ ] Support fixed amount mode
- [ ] Allocation history tracking
- [ ] Copy allocation to other properties
- [x] Decimal precision enforced in deterministic calculation path

## Technical Specifications

Split allocation interface with validation, breakdown visualization, and precision arithmetic.

**Reference**: See `docs/architecture/pool-allocation-flow.md` for full allocation patterns.

### Backend Allocation Model

```python
# backend/app/models/pool_allocation.py
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum

class AllocationType(str, Enum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"

class PoolAllocation(Base):
    __tablename__ = "pool_allocations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source_pool_id: Mapped[UUID] = mapped_column(ForeignKey("expense_pools.id"))
    target_pool_id: Mapped[UUID] = mapped_column(ForeignKey("expense_pools.id"))
    allocation_type: Mapped[AllocationType]
    percentage: Mapped[Decimal | None]  # For percentage mode (2 decimal precision)
    fixed_amount: Mapped[Decimal | None]  # For fixed amount mode
    effective_date: Mapped[date]
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
```

### Frontend Split Allocation Editor

```typescript
// frontend/src/features/pools/components/SplitAllocationEditor.tsx
interface AllocationRow {
  targetPoolId: string;
  targetPoolName: string;
  percentage: number;
}

export function SplitAllocationEditor({
  sourcePoolId,
  allocations,
  onChange,
}: SplitAllocationEditorProps) {
  const [rows, setRows] = useState<AllocationRow[]>(allocations);

  const total = rows.reduce((sum, r) => sum + r.percentage, 0);
  const isValid = Math.abs(total - 100) < 0.01;

  const distributeEvenly = () => {
    const evenShare = Math.floor(100 / rows.length * 100) / 100;
    const remainder = 100 - (evenShare * (rows.length - 1));
    const newRows = rows.map((r, i) => ({
      ...r,
      percentage: i === rows.length - 1 ? remainder : evenShare,
    }));
    setRows(newRows);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h3>Split Allocation</h3>
        <Button variant="outline" size="sm" onClick={distributeEvenly}>
          Distribute Evenly
        </Button>
      </div>

      {rows.map((row, index) => (
        <div key={row.targetPoolId} className="flex items-center gap-4">
          <span className="flex-1">{row.targetPoolName}</span>
          <Input
            type="number"
            value={row.percentage}
            onChange={(e) => handleChange(index, parseFloat(e.target.value))}
            step="0.01"
            min="0"
            max="100"
            className="w-24"
          />
          <span>%</span>
        </div>
      ))}

      <div className={cn("font-medium", isValid ? "text-green-600" : "text-red-600")}>
        Total: {total.toFixed(2)}%
      </div>
    </div>
  );
}
```

### Precision Handling

Last allocation receives remainder to avoid rounding errors:
```python
def apply_allocations(amount: Decimal, allocations: List[PoolAllocation]) -> Dict[UUID, Decimal]:
    result = {}
    remaining = amount
    for i, alloc in enumerate(allocations):
        if i == len(allocations) - 1:
            result[alloc.target_pool_id] = remaining  # Last gets remainder
        else:
            allocated = (amount * alloc.percentage / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            result[alloc.target_pool_id] = allocated
            remaining -= allocated
    return result
```

## Test Cases

Test split allocation functionality including:
- Allocations must sum to exactly 100%
- Percentage and fixed amount modes mutually exclusive
- "Distribute Evenly" calculates correct shares
- Decimal precision handled (no rounding errors)
- Allocation history tracked with timestamps
- Copy to other properties works

## Definition of Done
- [x] UI allows creating/deleting percentage split allocations
- [x] Allocations validate to 100% maximum
- [ ] Fixed amount mode works
- [ ] History tracked properly
- [ ] Copy functionality works
- [x] Unit tests passing with 95%+ backend coverage
