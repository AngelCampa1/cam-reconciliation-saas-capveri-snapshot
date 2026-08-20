-- Migration: Restore Tenant Access to Leases and Properties
-- Description: Fix tenant-portal dashboard returning zero leases and null
--              property names by restoring the tenant SELECT path on the
--              leases and properties tables.
-- Issue: F-294
--
-- Background:
-- Migration 20240101000039_drop_duplicate_leases_select_policy.sql dropped the
-- dual-path "Leases are viewable by organization members and linked tenants"
-- policy, leaving only an organization-membership SELECT policy on leases.
-- The properties SELECT policy has only ever covered organization members, and
-- 20260522000001 hardened get_user_organization_id() to return NULL for tenant
-- users. As a result a tenant authenticated with role='tenant' could read
-- tenant_lease_links and reconciliation_snapshots (restored in 000052) but NOT
-- the leases themselves or the properties those leases belong to. The tenant
-- dashboard therefore showed no lease cards and fell back to a placeholder
-- property name on statements.
--
-- Recursion note: the tenant_lease_links SELECT policy itself references the
-- leases and properties tables. Adding a leases/properties policy that subqueries
-- tenant_lease_links directly therefore triggers "infinite recursion detected in
-- policy" (42P17). To break the cycle we resolve the tenant's lease and property
-- ids through SECURITY DEFINER helper functions that disable row_security for the
-- lookup, mirroring the existing lease_belongs_to_user_org()/get_user_organization_id()
-- helpers. The helpers read tenant_lease_links/tenant_users without re-entering RLS.

-- =============================================================================
-- Part 1: SECURITY DEFINER helpers that resolve the current tenant's access set
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tenant_linked_lease_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Bypass RLS for this lookup to avoid recursion through the
    -- tenant_lease_links SELECT policy (which references leases/properties).
    PERFORM set_config('row_security', 'off', true);
    RETURN QUERY
        SELECT tll.lease_id
        FROM public.tenant_lease_links tll
        JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = (SELECT auth.uid());
END;
$$;

COMMENT ON FUNCTION public.tenant_linked_lease_ids() IS
    'Lease ids the current tenant user is linked to (RLS-safe, SECURITY DEFINER).';

CREATE OR REPLACE FUNCTION public.tenant_linked_property_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_config('row_security', 'off', true);
    RETURN QUERY
        SELECT DISTINCT l.property_id
        FROM public.leases l
        JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
        JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = (SELECT auth.uid());
END;
$$;

COMMENT ON FUNCTION public.tenant_linked_property_ids() IS
    'Property ids the current tenant user has a lease on (RLS-safe, SECURITY DEFINER).';

-- =============================================================================
-- Part 2: Restore Tenant Access to leases
-- =============================================================================

DROP POLICY IF EXISTS "Leases viewable by org" ON public.leases;
DROP POLICY IF EXISTS "Leases are viewable by organization members and linked tenants" ON public.leases;
DROP POLICY IF EXISTS "Leases viewable by organization members and linked tenants" ON public.leases;

CREATE POLICY "Leases viewable by organization members and linked tenants"
ON public.leases
FOR SELECT
USING (
    -- Path 1: Organization members (SECURITY DEFINER helper bypasses RLS)
    public.lease_belongs_to_user_org(property_id)
    OR
    -- Path 2: Tenant users linked to this lease
    id IN (SELECT public.tenant_linked_lease_ids())
);

COMMENT ON POLICY "Leases viewable by organization members and linked tenants"
ON public.leases IS
    'Dual-path RLS: Landlords access via organization, tenants via lease links (F-294)';

-- =============================================================================
-- Part 3: Restore Tenant Access to properties
-- =============================================================================

DROP POLICY IF EXISTS "Properties are viewable by organization members" ON public.properties;
DROP POLICY IF EXISTS "Properties viewable by organization members and linked tenants" ON public.properties;

CREATE POLICY "Properties viewable by organization members and linked tenants"
ON public.properties
FOR SELECT
USING (
    -- Path 1: Organization members (returns NULL for tenants -> no match)
    organization_id = public.get_user_organization_id()
    OR
    -- Path 2: Tenant users with a lease on this property
    id IN (SELECT public.tenant_linked_property_ids())
);

COMMENT ON POLICY "Properties viewable by organization members and linked tenants"
ON public.properties IS
    'Dual-path RLS: Organization members via organization_id, tenants via lease links (F-294)';
