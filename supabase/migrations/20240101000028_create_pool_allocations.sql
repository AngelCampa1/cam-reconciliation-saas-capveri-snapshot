-- Migration: Create Pool Allocations Table
-- Description: Add support for splitting expense pools across multiple target pools
-- Dependencies: 20240101000008_create_expense_pools.sql
-- Story: 17.2 - Create Split Allocation UI

-- Create allocation_type enum
CREATE TYPE public.allocation_type AS ENUM ('percentage', 'fixed_amount');

-- Create pool_allocations table
CREATE TABLE public.pool_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_pool_id UUID NOT NULL REFERENCES public.expense_pools(id) ON DELETE CASCADE,
    target_pool_id UUID NOT NULL REFERENCES public.expense_pools(id) ON DELETE CASCADE,
    allocation_type public.allocation_type NOT NULL,
    allocation_value DECIMAL(19, 4) NOT NULL CHECK (allocation_value > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent self-reference
    CONSTRAINT check_no_self_allocation CHECK (source_pool_id != target_pool_id),

    -- Ensure unique allocation per source-target pair
    CONSTRAINT unique_source_target_allocation UNIQUE (source_pool_id, target_pool_id)
);

-- Add indexes for performance
CREATE INDEX idx_pool_allocations_source_pool_id ON public.pool_allocations(source_pool_id);
CREATE INDEX idx_pool_allocations_target_pool_id ON public.pool_allocations(target_pool_id);

-- Enable Row Level Security
ALTER TABLE public.pool_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access allocations for pools in their organization
-- Note: expense_pools doesn't have organization_id, so we join through properties
CREATE POLICY "tenant_isolation_pool_allocations" ON public.pool_allocations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.expense_pools
            INNER JOIN public.properties ON expense_pools.property_id = properties.id
            WHERE expense_pools.id = pool_allocations.source_pool_id
            AND properties.organization_id = (
                SELECT organization_id FROM public.users WHERE id = auth.uid()
            )
        )
    );

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_pool_allocations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER set_pool_allocations_updated_at
    BEFORE UPDATE ON public.pool_allocations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_pool_allocations_updated_at();

-- Add table and column comments
COMMENT ON TABLE public.pool_allocations IS 'Split allocations for dividing expenses from source pools to target pools';
COMMENT ON COLUMN public.pool_allocations.id IS 'Unique identifier for the allocation';
COMMENT ON COLUMN public.pool_allocations.source_pool_id IS 'Pool being split into multiple targets';
COMMENT ON COLUMN public.pool_allocations.target_pool_id IS 'Destination pool receiving allocation';
COMMENT ON COLUMN public.pool_allocations.allocation_type IS 'Whether allocation is percentage (0-100) or fixed dollar amount';
COMMENT ON COLUMN public.pool_allocations.allocation_value IS 'Percentage (0-100) if type is percentage, or dollar amount if fixed_amount';
COMMENT ON COLUMN public.pool_allocations.created_at IS 'Timestamp when allocation was created';
COMMENT ON COLUMN public.pool_allocations.updated_at IS 'Timestamp when allocation was last updated';
