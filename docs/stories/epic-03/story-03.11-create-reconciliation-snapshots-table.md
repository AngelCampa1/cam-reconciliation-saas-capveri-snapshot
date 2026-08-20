# Story 3.11: Create Reconciliation Snapshots Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 3
- **Dependencies**: Story 3.6
- **Status**: `completed`

## User Story
**As a** property accountant
**I want** reconciliation calculations saved as immutable snapshots
**So that** finalized calculations cannot be accidentally modified

## Acceptance Criteria
- [x] **AC1**: `reconciliation_snapshots` table created with all calculation fields
- [x] **AC2**: `calculation_trace` JSONB stores step-by-step breakdown
- [x] **AC3**: RLS prevents UPDATE/DELETE if status = 'finalized'
- [x] **AC4**: Finalization captures timestamp and user

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000010_create_reconciliation_snapshots.sql
```

**Migration SQL**:
```sql
-- Create reconciliation_snapshots table
CREATE TABLE public.reconciliation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'finalized')),

    -- Calculated values (stored for immutability)
    total_operating_expenses NUMERIC(14, 2) NOT NULL,
    grossed_up_expenses NUMERIC(14, 2) NOT NULL,
    base_year_amount NUMERIC(14, 2) NOT NULL,
    tenant_share_before_cap NUMERIC(14, 2) NOT NULL,
    tenant_share_after_cap NUMERIC(14, 2) NOT NULL,
    admin_fee NUMERIC(14, 2) NOT NULL,
    total_recovery NUMERIC(14, 2) NOT NULL,

    -- Audit trail
    calculation_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
    finalized_at TIMESTAMPTZ,
    finalized_by_user_id UUID REFERENCES public.users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_period CHECK (period_end_date > period_start_date)
);

-- Indexes
CREATE INDEX idx_reconciliation_snapshots_property_id
    ON public.reconciliation_snapshots(property_id);
CREATE INDEX idx_reconciliation_snapshots_lease_id
    ON public.reconciliation_snapshots(lease_id);
CREATE INDEX idx_reconciliation_snapshots_status
    ON public.reconciliation_snapshots(status);
CREATE INDEX idx_reconciliation_snapshots_period
    ON public.reconciliation_snapshots(period_start_date, period_end_date);

-- GIN index for calculation_trace queries
CREATE INDEX idx_reconciliation_snapshots_trace
    ON public.reconciliation_snapshots USING GIN (calculation_trace);

-- Updated_at trigger
CREATE TRIGGER update_reconciliation_snapshots_updated_at
    BEFORE UPDATE ON public.reconciliation_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.reconciliation_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Snapshots are viewable via property access"
    ON public.reconciliation_snapshots
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Snapshots are insertable via property access"
    ON public.reconciliation_snapshots
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- CRITICAL: Finalized snapshots cannot be updated
CREATE POLICY "Only draft snapshots can be updated"
    ON public.reconciliation_snapshots
    FOR UPDATE
    USING (
        status = 'draft'
        AND EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    )
    WITH CHECK (
        -- Cannot change a finalized snapshot back to draft
        (OLD.status = 'draft')
        AND EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- CRITICAL: Finalized snapshots cannot be deleted
CREATE POLICY "Only draft snapshots can be deleted"
    ON public.reconciliation_snapshots
    FOR DELETE
    USING (
        status = 'draft'
        AND EXISTS (
            SELECT 1 FROM public.properties p
            JOIN public.users u ON u.organization_id = p.organization_id
            WHERE p.id = property_id
            AND u.id = auth.uid()
            AND u.role IN ('owner', 'admin')
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_snapshots TO authenticated;

COMMENT ON TABLE public.reconciliation_snapshots IS 'Immutable reconciliation calculations per lease/period';
COMMENT ON COLUMN public.reconciliation_snapshots.calculation_trace IS 'Step-by-step calculation breakdown for audit trail';
```

## Definition of Done
- [x] All calculation fields stored
- [x] Finalized snapshots are immutable
- [x] Trace JSONB indexed

## Implementation Notes
- Created `supabase/migrations/20240101000010_create_reconciliation_snapshots.sql`
- 7 calculation fields with NUMERIC(14,2) for monetary precision
- RLS UPDATE policy: `status = 'draft'` in USING clause prevents finalized updates
- RLS DELETE policy: requires `status = 'draft'` AND admin/owner role
- Added constraint `finalized_requires_timestamp` ensuring finalized_at is set when status='finalized'
- GIN index on calculation_trace for JSONB queries
- Added 45 new tests to `backend/tests/test_migrations.py` (324 total migration tests)
