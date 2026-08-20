-- Migration: Fix mutable search_path security vulnerability
-- Description: Add SET search_path = public to all SECURITY DEFINER functions
-- This prevents schema-based SQL injection attacks
-- Reference: https://supabase.com/docs/guides/database/database-advisors

-- 1. Fix update_updated_at_column() - generic trigger used by many tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 2. Fix get_user_organization_id() - CRITICAL: used in RLS policies
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    PERFORM set_config('row_security', 'off', true);
    SELECT organization_id INTO v_org_id
    FROM public.users
    WHERE id = auth.uid();
    RETURN v_org_id;
END;
$$;

-- 3. Fix lease_belongs_to_user_org() - CRITICAL: used in lease RLS policies
CREATE OR REPLACE FUNCTION public.lease_belongs_to_user_org(p_property_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result BOOLEAN;
BEGIN
    PERFORM set_config('row_security', 'off', true);
    SELECT EXISTS (
        SELECT 1
        FROM public.properties p
        INNER JOIN public.users u ON p.organization_id = u.organization_id
        WHERE p.id = p_property_id
        AND u.id = auth.uid()
    ) INTO v_result;
    RETURN COALESCE(v_result, FALSE);
END;
$$;

-- 4. Fix set_snapshot_organization_id() - trigger for reconciliation_snapshots
CREATE OR REPLACE FUNCTION public.set_snapshot_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        SELECT organization_id INTO NEW.organization_id
        FROM public.properties
        WHERE id = NEW.property_id;
    END IF;
    RETURN NEW;
END;
$$;

-- 5. Fix update_calculation_jobs_updated_at() - trigger for calculation_jobs
CREATE OR REPLACE FUNCTION public.update_calculation_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 6. Fix update_pool_allocations_updated_at() - trigger for pool_allocations
CREATE OR REPLACE FUNCTION public.update_pool_allocations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
