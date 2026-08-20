-- Restrict direct browser execution of SECURITY DEFINER helpers.
-- RLS helper functions remain callable by authenticated users because table
-- policies invoke them during normal app queries; trigger/backend-only
-- functions are limited to service_role or trigger execution.

DO $$
DECLARE
    function_signature text;
    function_identity regprocedure;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'public.check_audit_request_rate_limit()',
        'public.check_feedback_rate_limit()',
        'public.handle_new_user_signup()',
        'public.update_promotion_status_on_redemption()'
    ]
    LOOP
        IF to_regprocedure(function_signature) IS NOT NULL THEN
            function_identity := function_signature::regprocedure;
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_identity);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_identity);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_identity);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_identity);
        END IF;
    END LOOP;
END
$$;

DO $$
DECLARE
    function_signature text;
    function_identity regprocedure;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'public.upsert_feature_use(uuid, text)'
    ]
    LOOP
        IF to_regprocedure(function_signature) IS NOT NULL THEN
            function_identity := function_signature::regprocedure;
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_identity);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_identity);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_identity);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_identity);
        END IF;
    END LOOP;
END
$$;

DO $$
DECLARE
    function_signature text;
    function_identity regprocedure;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'public.get_user_organization_id()',
        'public.lease_belongs_to_user_org(uuid)',
        'public.user_can_access_lease(uuid)',
        'public.user_can_access_lease_term_version(uuid)',
        'public.user_can_access_unit(uuid)',
        'public.get_effective_term_versions(uuid[], date)'
    ]
    LOOP
        IF to_regprocedure(function_signature) IS NOT NULL THEN
            function_identity := function_signature::regprocedure;
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_identity);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_identity);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_identity);
        END IF;
    END LOOP;
END
$$;
