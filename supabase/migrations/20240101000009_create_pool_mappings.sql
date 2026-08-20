-- Migration: Create Pool Mappings Table
-- Description: Maps GL account patterns to expense pools for automatic categorization
-- Dependencies: 20240101000008_create_expense_pools.sql

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

-- Create indexes for common queries
CREATE INDEX idx_pool_mappings_expense_pool_id ON public.pool_mappings(expense_pool_id);
CREATE INDEX idx_pool_mappings_pattern ON public.pool_mappings(gl_account_pattern);
CREATE INDEX idx_pool_mappings_priority ON public.pool_mappings(priority DESC);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_pool_mappings_updated_at
    BEFORE UPDATE ON public.pool_mappings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.pool_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Pool mappings are viewable via expense_pool -> property -> organization chain
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

-- RLS Policy: Pool mappings are insertable via pool access
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

-- RLS Policy: Pool mappings are updatable via pool access
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
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

-- RLS Policy: Pool mappings are deletable via pool access
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

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_mappings TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.pool_mappings IS 'Maps GL account patterns to expense pools for automatic categorization';
COMMENT ON COLUMN public.pool_mappings.id IS 'Unique identifier for the pool mapping';
COMMENT ON COLUMN public.pool_mappings.expense_pool_id IS 'Expense pool this mapping routes to';
COMMENT ON COLUMN public.pool_mappings.gl_account_pattern IS 'Pattern with wildcards: * for any chars, ? for single char (e.g., 6*, 61??, 6100-*)';
COMMENT ON COLUMN public.pool_mappings.allocation_percentage IS 'Percentage of expense to allocate (0-1, e.g., 1.0 for 100%)';
COMMENT ON COLUMN public.pool_mappings.priority IS 'Higher priority mappings are matched first (for conflict resolution)';
COMMENT ON COLUMN public.pool_mappings.created_at IS 'When the pool mapping was created';
COMMENT ON COLUMN public.pool_mappings.updated_at IS 'When the pool mapping was last updated';
