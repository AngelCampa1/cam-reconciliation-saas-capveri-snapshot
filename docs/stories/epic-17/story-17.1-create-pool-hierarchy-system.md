# Story 17.1: Create Pool Hierarchy System

## Story Info
- **Epic**: Advanced Expense Pools
- **Estimated Hours**: 3
- **Dependencies**: None
- **Status**: `pending`

## User Story
Implement parent/child pool relationships for nested expense categories (e.g., "Common Area" parent with "Lobbies", "Elevators", "Corridors" children).

## Acceptance Criteria
- [ ] Database schema supports parent_pool_id foreign key (nullable for root pools)
- [ ] API returns pools with nested children structure
- [ ] Hierarchy limited to 2 levels (parent → child only)
- [ ] Child pool amounts roll up into parent totals
- [ ] Deleting parent pool cascades to children (with confirmation)
- [ ] Circular reference prevention at database level
- [ ] Frontend displays collapsible tree structure

## Technical Specifications

Pool hierarchy system with database constraints, recursive CTE queries, and tree visualization component.

```sql
-- Migration: Add hierarchy support to expense_pools
ALTER TABLE expense_pools
ADD COLUMN parent_pool_id UUID REFERENCES expense_pools(id) ON DELETE CASCADE;

-- Constraint: Prevent more than 2 levels
CREATE OR REPLACE FUNCTION check_pool_hierarchy_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_pool_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM expense_pools
      WHERE id = NEW.parent_pool_id
      AND parent_pool_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Pool hierarchy limited to 2 levels';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Test Cases

Test pool hierarchy functionality including:
- Hierarchy depth constraints (max 2 levels)
- Roll-up calculations
- Circular reference prevention
- Cascade deletion
- Tree structure API response

## Definition of Done
- [ ] Database schema supports parent-child relationships
- [ ] Hierarchy depth limited to 2 levels
- [ ] Roll-up calculations work correctly
- [ ] Circular references prevented
- [ ] Frontend tree visualization works
- [ ] Unit tests passing with 95%+ coverage
