# Story 3.9: Create Expense Pools Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.4
- **Status**: `completed`

## User Story
**As a** property accountant
**I want** expense pools configured per property
**So that** GL entries can be categorized for gross-up and allocation

## Acceptance Criteria
- [x] **AC1**: `expense_pools` table created with all fields
- [x] **AC2**: Property FK with cascade delete
- [x] **AC3**: Unique constraint on (property_id, name)
- [x] **AC4**: RLS via property's organization

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000008_create_expense_pools.sql
```

**Migration SQL**:
```sql
-- Create expense_pools table
CREATE TABLE public.expense_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    pool_type VARCHAR(20) NOT NULL
        CHECK (pool_type IN ('operating', 'tax', 'insurance', 'capital', 'other')),
    is_gross_up_applicable BOOLEAN NOT NULL DEFAULT true,
    gross_up_target NUMERIC(5, 4) CHECK (gross_up_target >= 0 AND gross_up_target <= 1),
    description VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Pool name unique per property
    CONSTRAINT unique_pool_name_per_property UNIQUE (property_id, name)
);

-- Indexes
CREATE INDEX idx_expense_pools_property_id ON public.expense_pools(property_id);
CREATE INDEX idx_expense_pools_pool_type ON public.expense_pools(pool_type);

-- Updated_at trigger
CREATE TRIGGER update_expense_pools_updated_at
    BEFORE UPDATE ON public.expense_pools
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.expense_pools ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Expense pools are viewable via property access"
    ON public.expense_pools
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Expense pools are insertable via property access"
    ON public.expense_pools
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Expense pools are updatable via property access"
    ON public.expense_pools
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Expense pools are deletable via property access"
    ON public.expense_pools
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_pools TO authenticated;

COMMENT ON TABLE public.expense_pools IS 'Expense categorization pools for CAM calculation';
```

## Definition of Done
- [x] Pool types validated
- [x] Unique name per property
- [x] RLS works

## Implementation Notes
- Created `supabase/migrations/20240101000008_create_expense_pools.sql`
- Pool types: operating, tax, insurance, capital, other (CHECK constraint)
- gross_up_target NUMERIC(5,4) with range CHECK 0-1
- RLS via property join pattern for organization isolation
- Full CRUD permissions (SELECT, INSERT, UPDATE, DELETE) for authenticated users
- Added 28 new tests to `backend/tests/test_migrations.py` (252 total migration tests)
