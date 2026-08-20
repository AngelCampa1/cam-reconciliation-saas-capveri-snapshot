-- Migration: Drop Duplicate Leases SELECT Policy
-- Description: Remove the duplicate SELECT policy on leases table that causes infinite recursion
-- The "Leases are viewable by organization members and linked tenants" policy calls
-- get_user_organization_id() which causes circular RLS evaluation.
-- We keep the simpler "Leases viewable by org" policy instead.

-- Drop the problematic duplicate policy
DROP POLICY IF EXISTS "Leases are viewable by organization members and linked tenants" ON public.leases;

-- Verify the remaining policy is correct
-- Should have:
-- - "Leases viewable by org" for SELECT
-- - "Leases insertable by org" for INSERT
-- - "Leases updatable by org" for UPDATE
-- - "Leases deletable by org" for DELETE

-- Add comment explaining why this policy was removed
COMMENT ON TABLE public.leases IS
    'Leases table has RLS policies based on organization_id matching. The "Leases are viewable by organization members and linked tenants" policy was removed in migration 000039 because it caused infinite recursion by calling get_user_organization_id() which queries the users table that also has RLS.';
