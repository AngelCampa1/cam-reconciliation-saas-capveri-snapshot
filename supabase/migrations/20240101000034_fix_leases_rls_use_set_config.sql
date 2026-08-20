-- Migration: Fix Leases RLS with set_config
-- Description: Use PERFORM set_config() instead of SET LOCAL for row_security
-- Dependencies: 20240101000032_fix_leases_rls_disable_row_security.sql

-- Drop existing policies
DROP POLICY IF EXISTS "Leases viewable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases insertable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases updatable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases deletable by org admins" ON public.leases;

-- Drop and recreate function with PERFORM set_config()
DROP FUNCTION IF EXISTS public.lease_belongs_to_user_org(UUID);

CREATE OR REPLACE FUNCTION public.lease_belongs_to_user_org(p_property_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN;
BEGIN
    -- Disable RLS for this transaction using set_config
    -- Third parameter 'true' means setting is local to transaction
    PERFORM set_config('row_security', 'off', true);

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
CREATE POLICY "Leases viewable by org"
    ON public.leases
    FOR SELECT
    USING (public.lease_belongs_to_user_org(property_id));

CREATE POLICY "Leases insertable by org"
    ON public.leases
    FOR INSERT
    WITH CHECK (public.lease_belongs_to_user_org(property_id));

CREATE POLICY "Leases updatable by org"
    ON public.leases
    FOR UPDATE
    USING (public.lease_belongs_to_user_org(property_id))
    WITH CHECK (public.lease_belongs_to_user_org(property_id));

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
    'Checks if property belongs to current user organization. Uses SECURITY DEFINER and set_config to disable row_security, preventing circular dependencies.';
