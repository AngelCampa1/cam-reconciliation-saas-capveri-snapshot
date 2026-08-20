-- Migration: Fix Leases RLS Circular Dependency
-- Description: Optimize leases RLS policies to avoid infinite recursion
-- Dependencies: 20240101000005_create_leases.sql, 20240101000025_fix_users_rls_circular_dependency.sql

-- The existing leases UPDATE policy has a potential circular dependency when checking
-- the properties table, which in turn calls get_user_organization_id().
--
-- The solution is to use SECURITY DEFINER functions that bypass RLS entirely,
-- preventing any recursive policy evaluation.

-- Drop existing policies
DROP POLICY IF EXISTS "Leases are viewable via property access" ON public.leases;
DROP POLICY IF EXISTS "Leases are insertable via property access" ON public.leases;
DROP POLICY IF EXISTS "Leases are updatable via property access" ON public.leases;
DROP POLICY IF EXISTS "Leases are deletable by admins" ON public.leases;

-- Create optimized helper function that directly checks organization access
-- SECURITY DEFINER bypasses RLS, preventing circular dependencies
CREATE OR REPLACE FUNCTION public.check_lease_organization_access(p_property_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_org_id UUID;
    v_user_org_id UUID;
BEGIN
    -- Get user's organization (bypasses RLS due to SECURITY DEFINER)
    SELECT organization_id INTO v_user_org_id
    FROM public.users
    WHERE id = auth.uid();

    -- Get property's organization (bypasses RLS due to SECURITY DEFINER)
    SELECT organization_id INTO v_org_id
    FROM public.properties
    WHERE id = p_property_id;

    -- Return true if they match
    RETURN v_user_org_id = v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policy: Leases are viewable via property organization access
CREATE POLICY "Leases are viewable via property access"
    ON public.leases
    FOR SELECT
    USING (public.check_lease_organization_access(property_id));

-- RLS Policy: Leases are insertable via property organization access
CREATE POLICY "Leases are insertable via property access"
    ON public.leases
    FOR INSERT
    WITH CHECK (public.check_lease_organization_access(property_id));

-- RLS Policy: Leases are updatable via property organization access
CREATE POLICY "Leases are updatable via property access"
    ON public.leases
    FOR UPDATE
    USING (public.check_lease_organization_access(property_id))
    WITH CHECK (public.check_lease_organization_access(property_id));

-- RLS Policy: Leases are deletable via property organization access (admin/owner only)
CREATE POLICY "Leases are deletable by admins"
    ON public.leases
    FOR DELETE
    USING (
        public.check_lease_organization_access(property_id)
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Add documentation
COMMENT ON FUNCTION public.check_lease_organization_access(UUID) IS
    'Checks if current user can access a lease via property organization. Uses SECURITY DEFINER to avoid RLS circular dependencies.';
