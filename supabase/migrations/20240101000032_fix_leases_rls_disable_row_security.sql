-- Migration: Fix Leases RLS with Row Security Disabled
-- Description: Completely disable RLS within SECURITY DEFINER function to prevent recursion
-- Dependencies: 20240101000031_fix_leases_rls_simpler.sql

-- Drop existing policies first (they depend on the function)
DROP POLICY IF EXISTS "Leases viewable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases insertable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases updatable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases deletable by org admins" ON public.leases;

-- Now drop the previous function
DROP FUNCTION IF EXISTS public.lease_belongs_to_user_org(UUID);

-- Create function that COMPLETELY bypasses RLS by disabling row_security
CREATE OR REPLACE FUNCTION public.lease_belongs_to_user_org(p_property_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN;
BEGIN
    -- CRITICAL: Disable RLS for ALL queries in this function
    -- This prevents infinite recursion when querying properties/users tables
    SET LOCAL row_security = OFF;

    -- Direct query that bypasses RLS
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.lease_belongs_to_user_org(UUID) TO authenticated;

-- Create all lease policies using this function
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
    'Checks if property belongs to current user organization. Uses SECURITY DEFINER and disables row_security to completely bypass RLS and prevent circular dependencies.';
