-- Prevent authenticated browser clients from self-minting privileged users.
-- User records must be created by trusted service-role flows such as
-- onboarding, team invitations, tenant invitations, or auth triggers.

REVOKE INSERT ON public.users FROM authenticated;
GRANT INSERT ON public.users TO service_role;

DROP POLICY IF EXISTS "Users insertable by admins or service" ON public.users;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can create profile" ON public.users;
DROP POLICY IF EXISTS "Admins can create users in their organization" ON public.users;

CREATE POLICY "Service role can create users"
    ON public.users
    FOR INSERT
    TO service_role
    WITH CHECK (true);
