# Pool Hierarchy and Allocation Flow Architecture

## Overview

This document defines the architecture for advanced expense pool management, including hierarchical pools, split allocations, templates, and cross-property copy functionality.

## Pool Hierarchy Model

### Database Schema

```sql
-- Migration: Add hierarchy support to expense_pools
ALTER TABLE expense_pools
ADD COLUMN parent_pool_id UUID REFERENCES expense_pools(id) ON DELETE CASCADE;

-- Index for efficient tree queries
CREATE INDEX idx_expense_pools_parent ON expense_pools(parent_pool_id);

-- Constraint: Prevent more than 2 levels (parent -> child only)
CREATE OR REPLACE FUNCTION check_pool_hierarchy_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_pool_id IS NOT NULL THEN
    -- Check if parent already has a parent (would make this 3rd level)
    IF EXISTS (
      SELECT 1 FROM expense_pools
      WHERE id = NEW.parent_pool_id
      AND parent_pool_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Pool hierarchy limited to 2 levels';
    END IF;

    -- Prevent circular reference
    IF NEW.id = NEW.parent_pool_id THEN
      RAISE EXCEPTION 'Pool cannot be its own parent';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_pool_hierarchy_depth
BEFORE INSERT OR UPDATE ON expense_pools
FOR EACH ROW EXECUTE FUNCTION check_pool_hierarchy_depth();
```

### Hierarchy Structure

```
expense_pools
├── Common Area (parent, parent_pool_id = NULL)
│   ├── Lobbies (child, parent_pool_id = Common Area.id)
│   ├── Elevators (child)
│   └── Corridors (child)
├── Utilities (parent)
│   ├── Electric (child)
│   ├── Water (child)
│   └── Gas (child)
└── Taxes & Insurance (parent, no children)
```

### Roll-Up Calculation

Roll-up happens **during calculation**, not during display. Child pool amounts automatically aggregate to parent.

```python
# backend/app/services/pools/hierarchy.py
from decimal import Decimal
from typing import Dict, List
from uuid import UUID

class PoolHierarchyService:
    """Manages pool hierarchy and roll-up calculations."""

    async def get_pools_with_children(
        self,
        property_id: UUID,
        db: AsyncSession,
    ) -> List[PoolWithChildren]:
        """Get all pools for a property with nested children."""
        query = """
        WITH RECURSIVE pool_tree AS (
            -- Base case: root pools (no parent)
            SELECT
                id, name, gross_up_enabled, parent_pool_id,
                0 as depth,
                ARRAY[id] as path
            FROM expense_pools
            WHERE property_id = :property_id AND parent_pool_id IS NULL

            UNION ALL

            -- Recursive case: children
            SELECT
                p.id, p.name, p.gross_up_enabled, p.parent_pool_id,
                pt.depth + 1,
                pt.path || p.id
            FROM expense_pools p
            JOIN pool_tree pt ON p.parent_pool_id = pt.id
            WHERE pt.depth < 1  -- Enforce 2-level max
        )
        SELECT * FROM pool_tree ORDER BY path;
        """
        result = await db.execute(text(query), {"property_id": property_id})
        return self._build_tree(result.fetchall())

    def calculate_rollup(
        self,
        pools: List[ExpensePool],
        pool_expenses: Dict[UUID, Decimal],
    ) -> Dict[UUID, Decimal]:
        """
        Calculate roll-up amounts for parent pools.

        Child pool amounts automatically sum into parent totals.
        Parent total = direct expenses + sum(child expenses)
        """
        # Build parent -> children map
        children_map: Dict[UUID, List[UUID]] = {}
        for pool in pools:
            if pool.parent_pool_id:
                if pool.parent_pool_id not in children_map:
                    children_map[pool.parent_pool_id] = []
                children_map[pool.parent_pool_id].append(pool.id)

        # Calculate totals (children first, then parents)
        totals = dict(pool_expenses)  # Start with direct expenses

        for pool in pools:
            if pool.id in children_map:
                # Sum children into parent
                child_total = sum(
                    totals.get(child_id, Decimal("0"))
                    for child_id in children_map[pool.id]
                )
                totals[pool.id] = totals.get(pool.id, Decimal("0")) + child_total

        return totals
```

## Split Allocations

When a GL entry needs to be divided across multiple pools.

### Allocation Model

```python
# backend/app/models/pool_allocation.py
from decimal import Decimal
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
    percentage: Mapped[Decimal | None]  # For percentage mode
    fixed_amount: Mapped[Decimal | None]  # For fixed amount mode
    effective_date: Mapped[date]
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime]

    __table_args__ = (
        # Ensure percentages sum to 100% per source pool
        CheckConstraint(
            "allocation_type = 'fixed_amount' OR percentage > 0",
            name="valid_percentage"
        ),
    )
```

### Allocation Validation

```python
# backend/app/services/pools/allocation.py
class AllocationService:
    """Manages split allocations between pools."""

    async def validate_allocations(
        self,
        source_pool_id: UUID,
        allocations: List[AllocationInput],
    ) -> ValidationResult:
        """Validate that allocations sum to exactly 100%."""
        if not allocations:
            return ValidationResult(valid=False, error="At least one allocation required")

        # Check all are same type
        types = set(a.allocation_type for a in allocations)
        if len(types) > 1:
            return ValidationResult(
                valid=False,
                error="Cannot mix percentage and fixed amount allocations"
            )

        if AllocationType.PERCENTAGE in types:
            total = sum(a.percentage for a in allocations)
            # Use Decimal comparison with tolerance for rounding
            if abs(total - Decimal("100")) > Decimal("0.001"):
                return ValidationResult(
                    valid=False,
                    error=f"Percentages must sum to 100% (current: {total}%)"
                )

        return ValidationResult(valid=True)

    def apply_allocations(
        self,
        amount: Decimal,
        allocations: List[PoolAllocation],
    ) -> Dict[UUID, Decimal]:
        """Apply split allocations to an amount."""
        result = {}

        if allocations[0].allocation_type == AllocationType.PERCENTAGE:
            remaining = amount
            for i, alloc in enumerate(allocations):
                if i == len(allocations) - 1:
                    # Last allocation gets remainder to avoid rounding errors
                    result[alloc.target_pool_id] = remaining
                else:
                    allocated = (amount * alloc.percentage / Decimal("100")).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                    result[alloc.target_pool_id] = allocated
                    remaining -= allocated
        else:
            for alloc in allocations:
                result[alloc.target_pool_id] = alloc.fixed_amount

        return result
```

### Frontend Split Allocation UI

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

  const handlePercentageChange = (index: number, value: number) => {
    const newRows = [...rows];
    newRows[index].percentage = value;
    setRows(newRows);
    onChange(newRows);
  };

  const distributeEvenly = () => {
    const evenShare = Math.floor(100 / rows.length * 100) / 100;
    const remainder = 100 - (evenShare * (rows.length - 1));

    const newRows = rows.map((r, i) => ({
      ...r,
      percentage: i === rows.length - 1 ? remainder : evenShare,
    }));
    setRows(newRows);
    onChange(newRows);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Split Allocation</h3>
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
            onChange={(e) => handlePercentageChange(index, parseFloat(e.target.value))}
            className="w-24"
            step="0.01"
            min="0"
            max="100"
          />
          <span>%</span>
        </div>
      ))}

      <div className={cn(
        "flex justify-between font-medium",
        isValid ? "text-green-600" : "text-red-600"
      )}>
        <span>Total:</span>
        <span>{total.toFixed(2)}%</span>
      </div>

      {!isValid && (
        <p className="text-sm text-red-600">
          Allocations must sum to exactly 100%
        </p>
      )}
    </div>
  );
}
```

## Pool Templates

### Template Schema

```python
# backend/app/models/pool_template.py
class PoolTemplate(Base):
    __tablename__ = "pool_templates"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str]  # e.g., "Retail Center", "Office Building"
    description: Mapped[str | None]
    property_type: Mapped[str | None]  # Optional filter
    structure: Mapped[dict] = mapped_column(JSONB)  # Pool hierarchy as JSON
    is_system: Mapped[bool] = mapped_column(default=False)  # System vs custom
    organization_id: Mapped[UUID | None]  # NULL for system templates
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime]

# Example structure:
# {
#   "pools": [
#     {
#       "name": "Common Area",
#       "gross_up_enabled": true,
#       "children": [
#         {"name": "Lobbies", "gross_up_enabled": true},
#         {"name": "Elevators", "gross_up_enabled": true}
#       ]
#     },
#     {
#       "name": "Taxes",
#       "gross_up_enabled": false,
#       "children": []
#     }
#   ]
# }
```

## Pool Copy Functionality

### Copy Service

```python
# backend/app/services/pools/copy.py
class PoolCopyService:
    """Copy pool structures between properties."""

    async def copy_pools(
        self,
        source_property_id: UUID,
        target_property_id: UUID,
        merge_mode: bool = False,
        db: AsyncSession,
    ) -> CopyResult:
        """
        Copy all pools from source to target property.

        Args:
            merge_mode: If True, add to existing pools. If False, replace all.
        """
        # Validate properties exist and user has access
        source = await self._validate_property(source_property_id, db)
        target = await self._validate_property(target_property_id, db)

        # Get source pool structure
        source_pools = await self._get_pools_with_allocations(source_property_id, db)

        if not merge_mode:
            # Delete existing pools (cascade deletes allocations)
            await db.execute(
                delete(ExpensePool).where(ExpensePool.property_id == target_property_id)
            )

        # Create mapping from old IDs to new IDs
        id_mapping: Dict[UUID, UUID] = {}

        # Copy parent pools first
        for pool in source_pools:
            if pool.parent_pool_id is None:
                new_pool = ExpensePool(
                    property_id=target_property_id,
                    name=pool.name,
                    gross_up_enabled=pool.gross_up_enabled,
                    parent_pool_id=None,
                )
                db.add(new_pool)
                await db.flush()
                id_mapping[pool.id] = new_pool.id

        # Copy child pools with updated parent references
        for pool in source_pools:
            if pool.parent_pool_id is not None:
                new_pool = ExpensePool(
                    property_id=target_property_id,
                    name=pool.name,
                    gross_up_enabled=pool.gross_up_enabled,
                    parent_pool_id=id_mapping[pool.parent_pool_id],
                )
                db.add(new_pool)
                await db.flush()
                id_mapping[pool.id] = new_pool.id

        # Copy allocations with updated pool references
        for alloc in await self._get_allocations(source_property_id, db):
            new_alloc = PoolAllocation(
                source_pool_id=id_mapping[alloc.source_pool_id],
                target_pool_id=id_mapping[alloc.target_pool_id],
                allocation_type=alloc.allocation_type,
                percentage=alloc.percentage,
                fixed_amount=alloc.fixed_amount,
                effective_date=date.today(),
            )
            db.add(new_alloc)

        await db.commit()

        return CopyResult(
            pools_copied=len(id_mapping),
            allocations_copied=len(allocations),
        )
```

## Frontend Tree Component

```typescript
// frontend/src/features/pools/components/PoolTree.tsx
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';

interface PoolTreeProps {
  pools: PoolWithChildren[];
  onSelect: (poolId: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (poolId: string) => void;
  selectedPoolId?: string;
}

export function PoolTree({
  pools,
  onSelect,
  onAddChild,
  onDelete,
  selectedPoolId,
}: PoolTreeProps) {
  return (
    <div className="space-y-1">
      {pools.map((pool) => (
        <PoolTreeNode
          key={pool.id}
          pool={pool}
          depth={0}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDelete}
          isSelected={pool.id === selectedPoolId}
        />
      ))}
    </div>
  );
}

function PoolTreeNode({
  pool,
  depth,
  onSelect,
  onAddChild,
  onDelete,
  isSelected,
}: PoolTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = pool.children && pool.children.length > 0;
  const canAddChild = depth === 0; // Only root pools can have children

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted",
          isSelected && "bg-primary/10 border-l-2 border-primary",
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => onSelect(pool.id)}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <div className="w-4" />
        )}

        <span className="flex-1 font-medium">{pool.name}</span>

        {pool.gross_up_enabled && (
          <Badge variant="outline" className="text-xs">Gross-up</Badge>
        )}

        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          {canAddChild && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onAddChild(pool.id); }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete(pool.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {pool.children.map((child) => (
            <PoolTreeNode
              key={child.id}
              pool={child}
              depth={depth + 1}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDelete={onDelete}
              isSelected={child.id === selectedPoolId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

## File Structure

```
backend/app/
├── models/
│   ├── expense_pool.py      # Pool model with parent_pool_id
│   ├── pool_allocation.py   # Split allocation model
│   └── pool_template.py     # Template model
├── services/pools/
│   ├── hierarchy.py         # Hierarchy and roll-up service
│   ├── allocation.py        # Split allocation service
│   ├── templates.py         # Template management
│   └── copy.py              # Cross-property copy service

frontend/src/features/pools/
├── components/
│   ├── PoolTree.tsx              # Hierarchical tree view
│   ├── SplitAllocationEditor.tsx # Allocation percentage editor
│   ├── TemplateSelector.tsx      # Template picker
│   └── PoolCopyDialog.tsx        # Copy confirmation dialog
├── hooks/
│   └── usePools.ts               # Pool data fetching
└── types/
    └── index.ts                  # TypeScript interfaces
```
