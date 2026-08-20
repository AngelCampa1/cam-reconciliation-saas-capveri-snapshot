-- Migration: Handle New User Signup
-- Description: Automatically create organization and user records when someone signs up via Supabase Auth
-- This trigger fires when a new row is inserted into auth.users

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    new_org_id UUID;
    org_name TEXT;
BEGIN
    -- Extract organization_name from auth.users metadata
    org_name := NEW.raw_user_meta_data->>'organization_name';

    -- If no organization name provided, use email domain
    IF org_name IS NULL OR org_name = '' THEN
        org_name := split_part(NEW.email, '@', 1) || '''s Organization';
    END IF;

    -- Create new organization
    INSERT INTO public.organizations (name)
    VALUES (org_name)
    RETURNING id INTO new_org_id;

    -- Create user profile linked to organization
    INSERT INTO public.users (id, organization_id, email, role)
    VALUES (
        NEW.id,
        new_org_id,
        NEW.email,
        'owner'  -- First user in organization is owner
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't block auth user creation
        RAISE WARNING 'Failed to create organization/user for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$;

-- Create trigger on auth.users
-- Note: This requires the supabase_auth_admin role to create triggers on auth schema
-- In local development, this works. In production, you may need to use a webhook instead.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_signup();

-- Add comment
COMMENT ON FUNCTION public.handle_new_user_signup() IS
    'Automatically creates organization and user records when a new user signs up via Supabase Auth. Extracts organization_name from user metadata, defaults to email-based name if not provided.';
