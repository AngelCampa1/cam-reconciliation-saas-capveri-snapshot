-- Migration: Create Expense Pools Table
-- Description: Expense categorization pools for CAM calculation with gross-up configuration
-- Dependencies: 20240101000003_create_properties.sql

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

-- Create indexes for common queries
CREATE INDEX idx_expense_pools_property_id ON public.expense_pools(property_id);
CREATE INDEX idx_expense_pools_pool_type ON public.expense_pools(pool_type);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_expense_pools_updated_at
    BEFORE UPDATE ON public.expense_pools
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.expense_pools ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Expense pools are viewable via property organization access
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

-- RLS Policy: Expense pools are insertable via property organization access
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

-- RLS Policy: Expense pools are updatable via property organization access
CREATE POLICY "Expense pools are updatable via property access"
    ON public.expense_pools
    FOR UPDATE
    USING (
        EXISTS (
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

-- RLS Policy: Expense pools are deletable via property organization access
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

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_pools TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.expense_pools IS 'Expense categorization pools for CAM calculation with gross-up configuration';
COMMENT ON COLUMN public.expense_pools.id IS 'Unique identifier for the expense pool';
COMMENT ON COLUMN public.expense_pools.property_id IS 'Property this expense pool belongs to';
COMMENT ON COLUMN public.expense_pools.name IS 'Unique name of the expense pool within the property';
COMMENT ON COLUMN public.expense_pools.pool_type IS 'Type of expenses: operating, tax, insurance, capital, or other';
COMMENT ON COLUMN public.expense_pools.is_gross_up_applicable IS 'Whether gross-up calculation applies to this pool';
COMMENT ON COLUMN public.expense_pools.gross_up_target IS 'Target occupancy for gross-up (0-1, e.g., 0.95 for 95%)';
COMMENT ON COLUMN public.expense_pools.description IS 'Optional description of the expense pool';
COMMENT ON COLUMN public.expense_pools.created_at IS 'When the expense pool was created';
COMMENT ON COLUMN public.expense_pools.updated_at IS 'When the expense pool was last updated';
