-- Migration: Add Pool Hierarchy Support
-- Description: Add parent-child relationships to expense pools with max 2-level depth constraint
-- Dependencies: 20240101000008_create_expense_pools.sql
-- Story: 17.1 - Create Pool Hierarchy System

-- Add parent_pool_id column to expense_pools table
ALTER TABLE public.expense_pools
ADD COLUMN parent_pool_id UUID REFERENCES public.expense_pools(id) ON DELETE CASCADE;

-- Add index for parent_pool_id lookups
CREATE INDEX idx_expense_pools_parent_pool_id ON public.expense_pools(parent_pool_id);

-- Create function to check pool hierarchy depth (max 2 levels)
CREATE OR REPLACE FUNCTION public.check_pool_hierarchy_depth()
RETURNS TRIGGER AS $$
BEGIN
  -- If this pool has a parent, check if parent has a parent (would create 3 levels)
  IF NEW.parent_pool_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.expense_pools
      WHERE id = NEW.parent_pool_id
      AND parent_pool_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Pool hierarchy limited to 2 levels. Parent pool cannot have a parent.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce hierarchy depth on INSERT
CREATE TRIGGER enforce_pool_hierarchy_depth_insert
    BEFORE INSERT ON public.expense_pools
    FOR EACH ROW
    EXECUTE FUNCTION public.check_pool_hierarchy_depth();

-- Create trigger to enforce hierarchy depth on UPDATE
CREATE TRIGGER enforce_pool_hierarchy_depth_update
    BEFORE UPDATE OF parent_pool_id ON public.expense_pools
    FOR EACH ROW
    WHEN (OLD.parent_pool_id IS DISTINCT FROM NEW.parent_pool_id)
    EXECUTE FUNCTION public.check_pool_hierarchy_depth();

-- Add constraint to prevent self-referencing (circular reference at same level)
ALTER TABLE public.expense_pools
ADD CONSTRAINT check_parent_not_self
CHECK (parent_pool_id IS NULL OR parent_pool_id != id);

-- Add comment for new column
COMMENT ON COLUMN public.expense_pools.parent_pool_id IS 'Parent pool for hierarchical grouping (max 2 levels: parent → child only)';

-- Add comment for new function
COMMENT ON FUNCTION public.check_pool_hierarchy_depth() IS 'Enforces maximum 2-level pool hierarchy by preventing grandchild pools';
