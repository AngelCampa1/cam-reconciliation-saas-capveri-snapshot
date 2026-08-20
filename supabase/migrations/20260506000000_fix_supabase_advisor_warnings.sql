-- Remediate actionable Supabase Security Advisor warnings.
-- Anonymous sign-ins and leaked-password protection are production Auth settings,
-- not schema defects; those remain dashboard configuration actions.

-- Broad SELECT policies on public buckets allow object listing. The buckets can
-- remain public for direct object URLs without exposing bucket-wide list access.
DROP POLICY IF EXISTS "Public read for documents (E2E testing)"
    ON storage.objects;
DROP POLICY IF EXISTS "Public read for feedback screenshots"
    ON storage.objects;

-- Worker-only pipeline writes must be scoped to service_role instead of an
-- always-true policy evaluated by every role.
DROP POLICY IF EXISTS "service role can insert pipeline events"
    ON public.audit_pipeline_events;

CREATE POLICY "service role can insert pipeline events"
    ON public.audit_pipeline_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- set_updated_at was introduced after the prior search_path hardening pass.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- SECURITY DEFINER RPC must not trust the caller-supplied org id alone.
CREATE OR REPLACE FUNCTION public.merge_finding_decision(
    p_analysis_id UUID,
    p_org_id UUID,
    p_finding_id TEXT,
    p_decision JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_decisions JSONB;
BEGIN
    UPDATE public.cross_doc_analyses
    SET finding_decisions = finding_decisions || jsonb_build_object(p_finding_id, p_decision)
    WHERE id = p_analysis_id
      AND organization_id = p_org_id
      AND EXISTS (
          SELECT 1
          FROM public.users
          WHERE id = auth.uid()
            AND organization_id = p_org_id
      )
    RETURNING finding_decisions INTO v_decisions;

    RETURN COALESCE(v_decisions, '{}'::JSONB);
END;
$$;

-- Batch lookup must apply the same lease/org access check as RLS policies.
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
      AND public.user_can_access_lease_term_version(lease_id)
    ORDER BY lease_id, effective_date DESC;
$$;

-- Backend-only session helper remains callable only by service_role.
CREATE OR REPLACE FUNCTION public.set_organization_context(org_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_config('request.jwt.claims.organization_id', org_id, true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_organization_context(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_organization_context(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_organization_context(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_context(TEXT) TO service_role;

-- Remove public/anonymous execute from trigger-only or backend-only functions.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_trigger_func() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_func() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_func() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_gl_entries_func() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_gl_entries_func() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_gl_entries_func() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.set_snapshot_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_snapshot_organization_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_snapshot_organization_id() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.check_pool_hierarchy_depth() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_pool_hierarchy_depth() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_pool_hierarchy_depth() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.actual_billed_property_org_matches() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.actual_billed_property_org_matches() FROM anon;
REVOKE EXECUTE ON FUNCTION public.actual_billed_property_org_matches() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.run_retention_purge() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_retention_purge() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_retention_purge() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_retention_purge() TO service_role;

-- Callable app RPCs are available to authenticated users only after their
-- internal org/access checks above.
REVOKE EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_effective_term_versions(UUID[], DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_effective_term_versions(UUID[], DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_effective_term_versions(UUID[], DATE) TO authenticated;

-- Migration: Fix Supabase Advisor warnings for hosted CAMAudit project
-- Addresses:
-- - function_search_path_mutable
-- - security_definer_view / SECURITY DEFINER execute exposure
-- - extension_in_public for citext
-- - rls_policy_always_true for feedback INSERT policies
--
-- Anonymous Auth remains enabled intentionally for PLG onboarding. This migration
-- hardens database permissions without disabling anonymous sign-ins.

-- Keep extensions out of public when the target extension exists there.
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'citext'
          AND n.nspname = 'public'
    ) THEN
        ALTER EXTENSION citext SET SCHEMA extensions;
    END IF;
END
$$;

-- Advisor-warning set from project ngtgycwljoxnibzgjwom:
-- functions with mutable search_path.
DO $$
DECLARE
    function_signature text;
    function_identity regprocedure;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'public.enforce_demand_letter_generation_limit()',
        'public.get_analytics_summary()',
        'public.get_property_type_breakdown(uuid)',
        'public.get_rule_frequency(uuid)',
        'public.increment_referral_click_count(uuid)',
        'public.increment_referral_commission(uuid, integer)',
        'public.increment_referral_conversion_count(uuid)',
        'public.sync_partner_property_to_property()',
        'public.update_lease_terms_updated_at()',
        'public.update_partner_lease_triages_updated_at()',
        'public.update_partner_properties_updated_at()',
        'public.update_partner_roles_updated_at()',
        'public.update_partner_trial_email_sends_updated_at()',
        'public.update_partners_updated_at()',
        'public.update_subscriptions_updated_at()',
        'public.update_updated_at()'
    ]
    LOOP
        IF to_regprocedure(function_signature) IS NOT NULL THEN
            function_identity := function_signature::regprocedure;
            EXECUTE format(
                'ALTER FUNCTION %s SET search_path = public, pg_temp',
                function_identity
            );
        END IF;
    END LOOP;
END
$$;

-- Advisor-warning set from project ngtgycwljoxnibzgjwom:
-- SECURITY DEFINER functions executable by PUBLIC, anon, or authenticated.
--
-- These hosted-project RPCs are not called by the checked-in backend,
-- frontend, or marketing clients as authenticated users. Keep them
-- service-role-only to remove broad browser-callable SECURITY DEFINER access.
-- App-callable RPCs used by tracked code, such as merge_finding_decision and
-- get_effective_term_versions, are handled above with explicit authenticated
-- grants and internal org/access checks.
DO $$
DECLARE
    function_signature text;
    function_identity regprocedure;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'public.claim_demand_letter_generation_slot(uuid)',
        'public.claim_webhook_event_delivery(text, timestamp with time zone)',
        'public.current_user_has_partner_permission(uuid, public.partner_permission)',
        'public.current_user_is_partner_member(uuid)',
        'public.get_analytics_summary()',
        'public.get_property_type_breakdown(uuid)',
        'public.get_rule_frequency(uuid)',
        'public.handle_new_user()',
        'public.increment_pilot_credits(uuid, integer)',
        'public.increment_webhook_event_attempts(text)',
        'public.initialize_partner_owner_rbac()',
        'public.migrate_anonymous_session(uuid, uuid)',
        'public.partner_credit_balance(uuid)',
        'public.partner_triage_credit_balance(uuid)',
        'public.refund_partner_triage_credit_atomic(uuid, uuid)',
        'public.release_demand_letter_generation_slot(uuid)',
        'public.reserve_credit_atomic(uuid, uuid, text)',
        'public.reserve_partner_triage_credit_atomic(uuid, uuid, text)'
    ]
    LOOP
        -- to_regprocedure() raises (does not return NULL) when a TYPE named in the
        -- signature does not exist locally — e.g. public.partner_permission, which is
        -- a hosted-only enum no checked-in migration creates. Catch that so a fresh
        -- `supabase db reset` stays reproducible: a signature whose function or type
        -- is absent locally is simply skipped, which matches this block's intent.
        BEGIN
            IF to_regprocedure(function_signature) IS NOT NULL THEN
                function_identity := function_signature::regprocedure;
                EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_identity);
                EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_identity);
                EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_identity);
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_identity);
            END IF;
        EXCEPTION
            WHEN undefined_object OR undefined_function THEN
                CONTINUE;
        END;
    END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Convert always-true public/app-role inserts into service-role-only inserts.
-- The API layer should write these rows with the service role; direct browser DB
-- inserts are not used by the tracked frontend/backend code.
DO $$
BEGIN
    IF to_regclass('public.exit_survey') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Anyone can insert exit survey" ON public.exit_survey;
        DROP POLICY IF EXISTS "Service role can insert exit survey" ON public.exit_survey;

        CREATE POLICY "Service role can insert exit survey"
            ON public.exit_survey
            FOR INSERT TO service_role
            WITH CHECK (true);
    END IF;

    IF to_regclass('public.general_feedback') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Anyone can insert general feedback" ON public.general_feedback;
        DROP POLICY IF EXISTS "Service role can insert general feedback" ON public.general_feedback;

        CREATE POLICY "Service role can insert general feedback"
            ON public.general_feedback
            FOR INSERT TO service_role
            WITH CHECK (true);
    END IF;
END
$$;
