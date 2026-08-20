# Story 3.10: Create Pool Mappings Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.9
- **Status**: `completed`

## User Story
**As a** property accountant
**I want** GL accounts mapped to pools using patterns
**So that** expenses are automatically categorized

## Acceptance Criteria
- [x] **AC1**: `pool_mappings` table created
- [x] **AC2**: Foreign key to expense_pools
- [x] **AC3**: Allocation percentage validated (0-1)
- [x] **AC4**: Priority for conflict resolution
- [x] **AC5**: RLS via pool's property's organization

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000009_create_pool_mappings.sql
```

**Migration SQL**:
```sql
-- Create pool_mappings table
CREATE TABLE public.pool_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_pool_id UUID NOT NULL REFERENCES public.expense_pools(id) ON DELETE CASCADE,
    gl_account_pattern VARCHAR(50) NOT NULL,
    allocation_percentage NUMERIC(5, 4) NOT NULL DEFAULT 1.0000
        CHECK (allocation_percentage >= 0 AND allocation_percentage <= 1),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pool_mappings_expense_pool_id ON public.pool_mappings(expense_pool_id);
CREATE INDEX idx_pool_mappings_pattern ON public.pool_mappings(gl_account_pattern);
CREATE INDEX idx_pool_mappings_priority ON public.pool_mappings(priority DESC);

-- Updated_at trigger
CREATE TRIGGER update_pool_mappings_updated_at
    BEFORE UPDATE ON public.pool_mappings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.pool_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (via expense_pool -> property -> organization)
CREATE POLICY "Pool mappings are viewable via pool access"
    ON public.pool_mappings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Pool mappings are insertable via pool access"
    ON public.pool_mappings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Pool mappings are updatable via pool access"
    ON public.pool_mappings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Pool mappings are deletable via pool access"
    ON public.pool_mappings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_mappings TO authenticated;

COMMENT ON TABLE public.pool_mappings IS 'Maps GL account patterns to expense pools';
COMMENT ON COLUMN public.pool_mappings.gl_account_pattern IS 'Pattern with wildcards: * for any chars, ? for single char';
```

## Definition of Done
- [x] Pattern field documented
- [x] Allocation validated
- [x] Priority works

## Implementation Notes
- Created `supabase/migrations/20240101000009_create_pool_mappings.sql`
- allocation_percentage NUMERIC(5,4) with CHECK 0-1, default 1.0000 (100%)
- priority INTEGER with CHECK >= 0, default 0 (higher = matched first via DESC index)
- RLS via expense_pool -> property -> organization chain (2-level join)
- Pattern wildcards documented: `*` for any chars, `?` for single char
- Added 27 new tests to `backend/tests/test_migrations.py` (279 total migration tests)
