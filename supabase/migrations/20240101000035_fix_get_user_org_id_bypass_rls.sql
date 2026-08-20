-- Migration: Fix get_user_organization_id to bypass RLS
-- Description: Add row_security bypass to prevent circular dependency
-- Dependencies: 20240101000034_fix_leases_rls_use_set_config.sql

-- Replace function with RLS bypass (don't drop - many policies depend on it)
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Disable RLS for this transaction to prevent circular dependencies
    -- when RLS policies on other tables call this function
    PERFORM set_config('row_security', 'off', true);

    -- Get user's organization_id
    SELECT organization_id INTO v_org_id
    FROM public.users
    WHERE id = auth.uid();

    RETURN v_org_id;
END;
$$;

-- Add documentation
COMMENT ON FUNCTION public.get_user_organization_id() IS
    'Returns the organization_id for the current authenticated user. Uses SECURITY DEFINER and disables row_security to prevent circular RLS dependencies.';
