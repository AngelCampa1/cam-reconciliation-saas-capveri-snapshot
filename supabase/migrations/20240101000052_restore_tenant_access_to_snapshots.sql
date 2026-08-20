-- Migration: Restore Tenant Access to Reconciliation Snapshots and Related Tables
-- Description: Fix 401 errors for tenant portal by restoring tenant-friendly RLS policies
-- Dependencies: 20240101000051_add_set_org_context_function.sql
-- Issue: Migration 20240101000037 replaced tenant-friendly policies with org-only policies
--
-- Background:
-- Migration 20240101000037 added organization_id column to reconciliation_snapshots
-- for performance optimization (avoiding circular RLS dependency).
-- However, it replaced the dual-path RLS policy with a simple organization check,
-- breaking tenant access since tenants belong to different organizations than landlords.
--
-- This migration restores tenant access while keeping the organization_id optimization.

-- =============================================================================
-- Part 1: Restore Tenant Access to reconciliation_snapshots
-- =============================================================================

-- Drop existing organization-only SELECT policy
DROP POLICY IF EXISTS "Snapshots viewable by org" ON public.reconciliation_snapshots;

-- Create dual-path policy: organization members OR linked tenants
CREATE POLICY "Snapshots viewable by organization members and linked tenants"
ON public.reconciliation_snapshots
FOR SELECT
USING (
    -- Path 1: Organization members (fast path using organization_id column)
    organization_id = public.get_user_organization_id()
    OR
    -- Path 2: Tenant users with lease access (indexed join path)
    property_id IN (
        SELECT l.property_id
        FROM public.leases l
        JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
        JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = auth.uid()
    )
);

COMMENT ON POLICY "Snapshots viewable by organization members and linked tenants"
ON public.reconciliation_snapshots IS
    'Dual-path RLS: Landlords access via organization_id (fast), tenants via lease links (secure)';

-- =============================================================================
-- Part 2: Add Tenant Access to gl_entries
-- =============================================================================

-- Drop existing organization-only SELECT policy
DROP POLICY IF EXISTS "GL entries are viewable via property access" ON public.gl_entries;

-- Create dual-path policy: organization members OR linked tenants
CREATE POLICY "GL entries viewable by organization members and linked tenants"
ON public.gl_entries
FOR SELECT
USING (
    -- Path 1: Organization members via property lookup
    EXISTS (
        SELECT 1 FROM public.properties
        WHERE id = property_id
        AND organization_id = public.get_user_organization_id()
    )
    OR
    -- Path 2: Tenant users with lease access
    property_id IN (
        SELECT l.property_id
        FROM public.leases l
        JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
        JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = auth.uid()
    )
);

COMMENT ON POLICY "GL entries viewable by organization members and linked tenants"
ON public.gl_entries IS
    'Dual-path RLS: Organization members via properties, tenants via lease links';

-- =============================================================================
-- Part 3: Add Tenant Access to expense_pools
-- =============================================================================

-- Drop existing organization-only SELECT policy
DROP POLICY IF EXISTS "Expense pools are viewable via property access" ON public.expense_pools;

-- Create dual-path policy: organization members OR linked tenants
CREATE POLICY "Expense pools viewable by organization members and linked tenants"
ON public.expense_pools
FOR SELECT
USING (
    -- Path 1: Organization members via property lookup
    EXISTS (
        SELECT 1 FROM public.properties
        WHERE id = property_id
        AND organization_id = public.get_user_organization_id()
    )
    OR
    -- Path 2: Tenant users with lease access
    property_id IN (
        SELECT l.property_id
        FROM public.leases l
        JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
        JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = auth.uid()
    )
);

COMMENT ON POLICY "Expense pools viewable by organization members and linked tenants"
ON public.expense_pools IS
    'Dual-path RLS: Organization members via properties, tenants via lease links';

-- =============================================================================
-- Part 4: Add Tenant Access to pool_mappings
-- =============================================================================

-- Drop existing organization-only SELECT policy
DROP POLICY IF EXISTS "Pool mappings are viewable via pool access" ON public.pool_mappings;

-- Create dual-path policy: organization members OR linked tenants
CREATE POLICY "Pool mappings viewable by organization members and linked tenants"
ON public.pool_mappings
FOR SELECT
USING (
    -- Path 1: Organization members via expense_pool -> property chain
    EXISTS (
        SELECT 1
        FROM public.expense_pools ep
        JOIN public.properties p ON ep.property_id = p.id
        WHERE ep.id = expense_pool_id
        AND p.organization_id = public.get_user_organization_id()
    )
    OR
    -- Path 2: Tenant users with lease access
    EXISTS (
        SELECT 1
        FROM public.expense_pools ep
        JOIN public.leases l ON l.property_id = ep.property_id
        JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
        JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE ep.id = expense_pool_id
        AND tu.user_id = auth.uid()
    )
);

COMMENT ON POLICY "Pool mappings viewable by organization members and linked tenants"
ON public.pool_mappings IS
    'Dual-path RLS: Organization members via pool->property chain, tenants via lease links';
