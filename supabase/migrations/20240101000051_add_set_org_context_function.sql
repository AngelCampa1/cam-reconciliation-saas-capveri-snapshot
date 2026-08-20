-- Migration: Add helper function to set organization context
-- Description: Wraps PostgreSQL set_config() for use with Supabase RPC

-- Create function to set organization context for service role operations
CREATE OR REPLACE FUNCTION public.set_organization_context(org_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Set organization_id in session for RLS policies
    PERFORM set_config('request.jwt.claims.organization_id', org_id, true);
END;
$$;

COMMENT ON FUNCTION public.set_organization_context(TEXT) IS
'Sets organization context in session for service role RLS validation';

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.set_organization_context(TEXT) TO service_role;
