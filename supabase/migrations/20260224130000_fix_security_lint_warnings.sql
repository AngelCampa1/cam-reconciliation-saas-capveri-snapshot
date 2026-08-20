-- Migration: Fix Supabase Security Lint Warnings
-- Addresses: extension_in_public, rls_policy_always_true (×5)
-- Related lint: https://supabase.com/docs/guides/database/database-linter

-- ============================================================
-- 1. Move pgaudit from public schema to extensions schema
--    Fixes: extension_in_public (pgaudit)
-- ============================================================
DROP EXTENSION IF EXISTS pgaudit;
CREATE EXTENSION IF NOT EXISTS pgaudit SCHEMA extensions;

-- ============================================================
-- 2. Fix audit_requests INSERT policy
--    Old: WITH CHECK (true) — any role, no validation
--    New: require non-empty email and name (DB-level guard)
--    Fixes: rls_policy_always_true (audit_requests)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can create audit requests" ON public.audit_requests;

CREATE POLICY "Anyone can create audit requests"
    ON public.audit_requests
    FOR INSERT
    WITH CHECK (
        char_length(trim(email)) > 0 AND
        char_length(trim(name)) > 0
    );

-- ============================================================
-- 3. Fix content_leads INSERT policy (anon role)
--    Old: WITH CHECK (true) — no email validation
--    New: require non-empty email
--    Fixes: rls_policy_always_true (content_leads anon_insert)
-- ============================================================
DROP POLICY IF EXISTS "anon_insert" ON public.content_leads;

CREATE POLICY "anon_insert"
    ON public.content_leads
    FOR INSERT TO anon
    WITH CHECK (
        char_length(trim(email)) > 0
    );

-- ============================================================
-- 4. Drop redundant service-role-only policies
--    Service role bypasses RLS entirely in Supabase/PostgreSQL —
--    these policies never executed and caused false lint alarms.
--    Fixes: rls_policy_always_true (organizations, tenant_email_logs,
--           tenant_notifications)
-- ============================================================
DROP POLICY IF EXISTS "Service role can create organizations"
    ON public.organizations;

DROP POLICY IF EXISTS "Service can manage email logs"
    ON public.tenant_email_logs;

DROP POLICY IF EXISTS "Service can insert notifications"
    ON public.tenant_notifications;
