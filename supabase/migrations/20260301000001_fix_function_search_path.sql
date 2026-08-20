-- Migration: Fix SECURITY DEFINER functions missing SET search_path
-- Addresses: function_search_path_mutable (Supabase Security Advisor)
-- Ref: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0011_function_search_path_mutable
--
-- Both functions in 20260226000001_create_lease_term_versions.sql were declared
-- SECURITY DEFINER without SET search_path, making them vulnerable to search_path
-- hijacking attacks. This migration re-declares them with SET search_path = public.

-- Fix user_can_access_lease_term_version: add immutable search_path
CREATE OR REPLACE FUNCTION public.user_can_access_lease_term_version(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.leases l
        JOIN public.properties p ON l.property_id = p.id
        WHERE l.id = p_lease_id
        AND p.organization_id = public.get_user_organization_id()
    )
$$;

-- Fix get_effective_term_versions: add immutable search_path
CREATE OR REPLACE FUNCTION public.get_effective_term_versions(
    p_lease_ids UUID[],
    p_as_of DATE
)
RETURNS SETOF public.lease_term_versions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT ON (lease_id) *
    FROM public.lease_term_versions
    WHERE lease_id = ANY(p_lease_ids)
      AND effective_date <= p_as_of
    ORDER BY lease_id, effective_date DESC;
$$;
