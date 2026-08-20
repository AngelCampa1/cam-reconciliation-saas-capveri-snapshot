-- Fix two RLS defects found by prod E2E stress (Cycle 2).
--
-- (1) public.users UPDATE policy caused 42P17 infinite recursion.
--     20260522000001:42-49 added an inline `SELECT is_platform_admin FROM
--     public.users` correlated subquery inside the UPDATE WITH CHECK to keep
--     is_platform_admin immutable. Because the subquery reads public.users under
--     RLS, evaluating the users policy re-enters the users policy → infinite
--     recursion. Every self-service profile UPDATE via PostgREST (even a benign
--     full_name change) returned 500 42P17. Fail-closed (no write, no
--     escalation) but a broken write path.
--     Fix: move the is_platform_admin lookup into a SECURITY DEFINER helper that
--     runs with row_security off (mirrors get_user_organization_id), so the
--     inner read does not re-trigger users RLS.
--
-- (2) public.audit_requests SELECT + UPDATE policies had no organization scope
--     and gated on any users.role IN ('owner','admin') (20240101000060:1033 /
--     :1046). audit_requests is a PLATFORM-level inbound-lead inbox (leads are
--     created with organization_id NULL via the public "Anyone can create"
--     INSERT; the backend reads/updates it via the service role, RLS-bypassing,
--     with no org filter). So the only consumer of these RLS policies is a direct
--     PostgREST call with a customer JWT — and the unscoped owner/admin branch
--     let ANY customer org-owner/admin read+write EVERY org's lead PII (name,
--     email, phone, company, portfolio_sqft, estimated_recovery, notes).
--     The table is currently empty, so this is a latent leak, not live exposure.
--     Fix: restrict both policies to the assigned user or a platform admin,
--     matching the table's platform-level purpose. Regular customers get no
--     PostgREST access; the service-role backend is unaffected.

-- ── (1) platform-admin helper + non-recursive users UPDATE policy ────────────

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    PERFORM set_config('row_security', 'off', true);
    SELECT COALESCE(is_platform_admin, false) INTO v_is_admin
    FROM public.users
    WHERE id = (select auth.uid());
    RETURN COALESCE(v_is_admin, false);
END;
$$;

COMMENT ON FUNCTION public.current_user_is_platform_admin()
IS 'Returns whether the current authenticated user is a platform admin; runs with row_security off so it can be used inside users RLS policies without recursion.';

-- Role list mirrors the users_role_check CHECK constraint
-- (20240101000020) — 'tenant' is a valid role with real public.users rows, so
-- omitting it (as 20260522000001 did) fail-closes tenant self-service profile
-- updates via PostgREST. Include every allowed role for correctness.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
    ON public.users
    FOR UPDATE
    USING (
        id = (select auth.uid())
        AND role IN ('owner', 'admin', 'member', 'viewer', 'tenant')
    )
    WITH CHECK (
        id = (select auth.uid())
        AND organization_id = public.get_user_organization_id()
        AND role IN ('owner', 'admin', 'member', 'viewer', 'tenant')
        AND COALESCE(is_platform_admin, false)
            = public.current_user_is_platform_admin()
    );

-- ── (2) platform-scoped audit_requests SELECT + UPDATE policies ──────────────

DROP POLICY IF EXISTS "Users can view audit requests" ON public.audit_requests;
CREATE POLICY "Users can view audit requests"
    ON public.audit_requests
    FOR SELECT
    USING (
        assigned_to = (select auth.uid())
        OR public.current_user_is_platform_admin()
    );

DROP POLICY IF EXISTS "Users can update audit requests" ON public.audit_requests;
CREATE POLICY "Users can update audit requests"
    ON public.audit_requests
    FOR UPDATE
    USING (
        assigned_to = (select auth.uid())
        OR public.current_user_is_platform_admin()
    );
