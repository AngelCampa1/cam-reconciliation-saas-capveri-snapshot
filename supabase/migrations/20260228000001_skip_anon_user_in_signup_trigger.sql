-- Migration: patch signup trigger to skip anonymous users
-- Anonymous users have no email; /api/v1/onboard/init handles their bootstrap.

CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
    new_org_id UUID;
    org_name TEXT;
BEGIN
    -- Anonymous users have no email; /api/v1/onboard/init handles their bootstrap
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    org_name := NEW.raw_user_meta_data->>'organization_name';
    IF org_name IS NULL OR org_name = '' THEN
        org_name := split_part(NEW.email, '@', 1) || '''s Organization';
    END IF;

    INSERT INTO public.organizations (name) VALUES (org_name) RETURNING id INTO new_org_id;
    INSERT INTO public.users (id, organization_id, email, role)
    VALUES (NEW.id, new_org_id, NEW.email, 'owner');

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to create organization/user for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$;
