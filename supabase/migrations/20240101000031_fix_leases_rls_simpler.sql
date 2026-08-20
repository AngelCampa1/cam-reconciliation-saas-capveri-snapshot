-- Migration: Fix Leases RLS with Simpler Approach
-- Description: Use truly RLS-bypassing functions for lease access checks
-- Dependencies: 20240101000030_fix_leases_rls_circular_dependency.sql

-- Drop the previous attempt's policies and function
DROP POLICY IF EXISTS "Leases are viewable via property access" ON public.leases;
DROP POLICY IF EXISTS "Leases are insertable via property access" ON public.leases;
DROP POLICY IF EXISTS "Leases are updatable via property access" ON public.leases;
DROP POLICY IF EXISTS "Leases are deletable by admins" ON public.leases;
DROP FUNCTION IF EXISTS public.check_lease_organization_access(UUID);

-- Create a truly simple function that bypasses all RLS by setting session authorization
-- This function directly queries the database without triggering any RLS policies
CREATE OR REPLACE FUNCTION public.lease_belongs_to_user_org(p_property_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN;
BEGIN
    -- Use a direct query that bypasses RLS
    -- SECURITY DEFINER makes this run with elevated privileges
    SELECT EXISTS (
        SELECT 1
        FROM public.properties p
        INNER JOIN public.users u ON p.organization_id = u.organization_id
        WHERE p.id = p_property_id
        AND u.id = auth.uid()
    ) INTO v_result;

    RETURN COALESCE(v_result, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Alternatively, use the LEAKPROOF attribute to help optimizer understand it's safe
-- and add explicit grants
GRANT EXECUTE ON FUNCTION public.lease_belongs_to_user_org(UUID) TO authenticated;

-- RLS Policy: Leases are viewable if property belongs to user's organization
CREATE POLICY "Leases viewable by org"
    ON public.leases
    FOR SELECT
    USING (public.lease_belongs_to_user_org(property_id));

-- RLS Policy: Leases are insertable if property belongs to user's organization
CREATE POLICY "Leases insertable by org"
    ON public.leases
    FOR INSERT
    WITH CHECK (public.lease_belongs_to_user_org(property_id));

-- RLS Policy: Leases are updatable if property belongs to user's organization
CREATE POLICY "Leases updatable by org"
    ON public.leases
    FOR UPDATE
    USING (public.lease_belongs_to_user_org(property_id))
    WITH CHECK (public.lease_belongs_to_user_org(property_id));

-- RLS Policy: Leases are deletable by admins in same organization
CREATE POLICY "Leases deletable by org admins"
    ON public.leases
    FOR DELETE
    USING (
        public.lease_belongs_to_user_org(property_id)
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Add documentation
COMMENT ON FUNCTION public.lease_belongs_to_user_org(UUID) IS
    'Checks if property belongs to current user organization. SECURITY DEFINER bypasses RLS to prevent circular dependencies.';
