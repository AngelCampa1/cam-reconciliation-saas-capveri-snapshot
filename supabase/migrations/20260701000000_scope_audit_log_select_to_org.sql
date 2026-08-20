-- Scope the audit_log SELECT policy to the caller's organization.
--
-- SECURITY FIX (critical, cross-tenant data leak). The prior policy
-- ("Audit log viewable by admins", 20240101000060_fix_rls_performance.sql:458)
-- gated SELECT only on users.role IN ('owner','admin') with NO organization
-- scope. Because every org has an owner, any authenticated owner/admin could
-- read the ENTIRE audit_log across all tenants via PostgREST
-- (GET /rest/v1/audit_log), and audit_log.new_data/old_data embed full foreign
-- lease records, recovery_profile JSON, tenant names, and GL amounts.
--
-- Fix: require the row's organization_id to equal the caller's org (in addition
-- to the existing owner/admin role check). audit_log.organization_id exists
-- (20240101000011) and is populated; rows with a NULL organization_id (system /
-- pre-org events) become invisible to org admins, which is the intended
-- fail-closed behavior — those rows are not tenant-scoped and the API backend
-- reads audit data via the service role (which bypasses RLS) regardless.

DROP POLICY IF EXISTS "Audit log viewable by admins" ON public.audit_log;

CREATE POLICY "Audit log viewable by admins"
    ON public.audit_log
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (select auth.uid())
            AND role IN ('owner', 'admin')
        )
    );
