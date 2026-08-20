-- Migration: Fix Users INSERT Policy for Trigger
-- Description: Allow service role and trigger functions to insert users without auth context
-- Dependencies: 20240101000038_handle_new_user_signup.sql
--
-- Problem: The handle_new_user_signup() trigger cannot insert into users table because
-- the existing "Admins can insert users" policy requires auth.uid() to exist and be an admin/owner.
-- Triggers run without auth context (auth.uid() is NULL), so the INSERT fails silently.
--
-- Solution: Add a policy that allows INSERTs when auth.uid() is NULL (service role or trigger context).
-- This matches the pattern used for organizations table.

-- Add policy allowing service role and triggers to insert users
CREATE POLICY "Service role can insert users for signup"
    ON public.users
    FOR INSERT
    WITH CHECK (
        -- Allow if no auth context (trigger or service role)
        auth.uid() IS NULL
        -- OR if it's the user creating their own record (id matches auth.uid())
        OR id = auth.uid()
    );

-- Add documentation
COMMENT ON POLICY "Service role can insert users for signup" ON public.users IS
    'Allows service role and trigger functions to insert users during signup flow. Required for handle_new_user_signup() trigger to work.';
