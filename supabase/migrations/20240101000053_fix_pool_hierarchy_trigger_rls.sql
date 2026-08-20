-- Migration: Fix Pool Hierarchy Trigger RLS Issue
-- Description: Add SECURITY DEFINER to check_pool_hierarchy_depth() to bypass RLS during trigger execution
-- Bug: Creating child pools fails with "query would be affected by row-level security policy"
-- Root Cause: The trigger function queries expense_pools table but is blocked by RLS
-- Fix: Use SECURITY DEFINER so the trigger runs with owner privileges (bypasses RLS)

-- Drop existing function and recreate with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.check_pool_hierarchy_depth()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Add comment explaining the SECURITY DEFINER usage
COMMENT ON FUNCTION public.check_pool_hierarchy_depth() IS
  'Enforces maximum 2-level pool hierarchy. Uses SECURITY DEFINER to bypass RLS during trigger execution.';
