-- Migration: Create Reconciliation Snapshots Table
-- Description: Immutable reconciliation calculations per lease/period for CAM recovery
-- Dependencies: 20240101000005_create_leases.sql

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
    CONSTRAINT valid_period CHECK (period_end_date > period_start_date),
    CONSTRAINT finalized_requires_timestamp CHECK (
        (status = 'finalized' AND finalized_at IS NOT NULL) OR
        (status = 'draft')
    )
);

-- Create indexes for common queries
CREATE INDEX idx_reconciliation_snapshots_property_id
    ON public.reconciliation_snapshots(property_id);
CREATE INDEX idx_reconciliation_snapshots_lease_id
    ON public.reconciliation_snapshots(lease_id);
CREATE INDEX idx_reconciliation_snapshots_status
    ON public.reconciliation_snapshots(status);
CREATE INDEX idx_reconciliation_snapshots_period
    ON public.reconciliation_snapshots(period_start_date, period_end_date);

-- GIN index for calculation_trace JSONB queries
CREATE INDEX idx_reconciliation_snapshots_trace
    ON public.reconciliation_snapshots USING GIN (calculation_trace);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_reconciliation_snapshots_updated_at
    BEFORE UPDATE ON public.reconciliation_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.reconciliation_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Snapshots are viewable via property organization access
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

-- RLS Policy: Snapshots are insertable via property organization access
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

-- CRITICAL: Only draft snapshots can be updated (immutability for finalized)
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
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- CRITICAL: Only draft snapshots can be deleted (finalized are immutable)
CREATE POLICY "Only draft snapshots can be deleted"
    ON public.reconciliation_snapshots
    FOR DELETE
    USING (
        status = 'draft'
        AND EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_snapshots TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.reconciliation_snapshots IS 'Immutable reconciliation calculations per lease/period for CAM recovery';
COMMENT ON COLUMN public.reconciliation_snapshots.id IS 'Unique identifier for the reconciliation snapshot';
COMMENT ON COLUMN public.reconciliation_snapshots.property_id IS 'Property this reconciliation belongs to';
COMMENT ON COLUMN public.reconciliation_snapshots.lease_id IS 'Lease this reconciliation is calculated for';
COMMENT ON COLUMN public.reconciliation_snapshots.period_start_date IS 'Start of the reconciliation period';
COMMENT ON COLUMN public.reconciliation_snapshots.period_end_date IS 'End of the reconciliation period';
COMMENT ON COLUMN public.reconciliation_snapshots.status IS 'Snapshot status: draft (editable) or finalized (immutable)';
COMMENT ON COLUMN public.reconciliation_snapshots.total_operating_expenses IS 'Total operating expenses for the period';
COMMENT ON COLUMN public.reconciliation_snapshots.grossed_up_expenses IS 'Expenses after gross-up adjustment for occupancy';
COMMENT ON COLUMN public.reconciliation_snapshots.base_year_amount IS 'Base year expense amount for comparison';
COMMENT ON COLUMN public.reconciliation_snapshots.tenant_share_before_cap IS 'Tenant share before applying expense caps';
COMMENT ON COLUMN public.reconciliation_snapshots.tenant_share_after_cap IS 'Tenant share after applying expense caps';
COMMENT ON COLUMN public.reconciliation_snapshots.admin_fee IS 'Administrative fee amount';
COMMENT ON COLUMN public.reconciliation_snapshots.total_recovery IS 'Total amount recoverable from tenant';
COMMENT ON COLUMN public.reconciliation_snapshots.calculation_trace IS 'Step-by-step calculation breakdown for audit trail (JSONB array)';
COMMENT ON COLUMN public.reconciliation_snapshots.finalized_at IS 'Timestamp when snapshot was finalized (immutable after this)';
COMMENT ON COLUMN public.reconciliation_snapshots.finalized_by_user_id IS 'User who finalized the snapshot';
COMMENT ON COLUMN public.reconciliation_snapshots.created_at IS 'When the snapshot was created';
COMMENT ON COLUMN public.reconciliation_snapshots.updated_at IS 'When the snapshot was last updated';
