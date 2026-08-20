-- Migration: Fix Users RLS Circular Dependency
-- Description: Add policy allowing users to read their own profile without circular dependency
-- Dependencies: 20240101000002_create_users.sql

-- The existing "Users can view users in their organization" policy has a circular dependency:
-- It calls get_user_organization_id() which queries the users table, triggering RLS again
--
-- This new policy allows users to read their own record directly (id = auth.uid())
-- without calling the helper function, breaking the circular dependency.
--
-- Policy evaluation order: PostgreSQL evaluates policies with OR semantics
-- If ANY policy grants access, the row is visible.
-- So this policy will grant access to own record, and the organization policy
-- will grant access to other users in the same organization.

CREATE POLICY "Users can view their own profile"
    ON public.users
    FOR SELECT
    USING (id = auth.uid());
