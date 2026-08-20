-- Migration: Fix remaining mutable search_path security vulnerabilities
-- Description: Add SET search_path = public to all remaining SECURITY DEFINER functions

-- 1. Fix user_can_access_unit() - RLS helper
CREATE OR REPLACE FUNCTION public.user_can_access_unit(unit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.units u
        JOIN public.properties p ON u.property_id = p.id
        WHERE u.id = unit_id
        AND p.organization_id = public.get_user_organization_id()
    )
$$;

-- 2. Fix user_can_access_lease() - RLS helper
CREATE OR REPLACE FUNCTION public.user_can_access_lease(lease_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.leases l
        JOIN public.properties p ON l.property_id = p.id
        WHERE l.id = lease_id
        AND p.organization_id = public.get_user_organization_id()
    )
$$;

-- 3. Fix uppercase_promotion_code() - trigger function
CREATE OR REPLACE FUNCTION public.uppercase_promotion_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.code = UPPER(NEW.code);
    RETURN NEW;
END;
$$;

-- 4. Fix update_promotion_status_on_redemption() - trigger function
CREATE OR REPLACE FUNCTION public.update_promotion_status_on_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.promotions
    SET current_redemptions = current_redemptions + 1,
        status = CASE
            WHEN max_redemptions IS NOT NULL
                 AND current_redemptions + 1 >= max_redemptions
            THEN 'exhausted'::public.promotion_status
            ELSE status
        END
    WHERE id = NEW.promotion_id;
    RETURN NEW;
END;
$$;

-- 5. Fix check_feedback_rate_limit() - rate limiting trigger
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO recent_count
    FROM public.feedback
    WHERE user_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF recent_count >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 10 feedback submissions per hour';
    END IF;

    RETURN NEW;
END;
$$;

-- 6. Fix update_disputes_updated_at() - timestamp trigger
CREATE OR REPLACE FUNCTION public.update_disputes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 7. Fix audit_gl_entries_func() - audit trigger for GL entries
CREATE OR REPLACE FUNCTION public.audit_gl_entries_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT organization_id INTO v_org_id
        FROM public.properties
        WHERE id = OLD.property_id;
    ELSE
        SELECT organization_id INTO v_org_id
        FROM public.properties
        WHERE id = NEW.property_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, new_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW), auth.uid(), v_org_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.uid(), v_org_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), auth.uid(), v_org_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- 8. Fix audit_trigger_func() - generic audit trigger
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
    v_property_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'leases' THEN
        IF TG_OP = 'DELETE' THEN
            v_property_id := OLD.property_id;
        ELSE
            v_property_id := NEW.property_id;
        END IF;
        SELECT organization_id INTO v_org_id
        FROM public.properties
        WHERE id = v_property_id;
    ELSE
        IF TG_OP = 'DELETE' THEN
            v_org_id := OLD.organization_id;
        ELSE
            v_org_id := NEW.organization_id;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, new_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW), auth.uid(), v_org_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.uid(), v_org_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), auth.uid(), v_org_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- 9. Fix check_audit_request_rate_limit() - rate limiting for audit requests
CREATE OR REPLACE FUNCTION public.check_audit_request_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO recent_count
    FROM public.audit_requests
    WHERE email = NEW.email
      AND created_at > NOW() - INTERVAL '24 hours';

    IF recent_count >= 3 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 3 audit requests per email per day';
    END IF;

    RETURN NEW;
END;
$$;

-- 10. Fix set_organization_context() - session helper
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
