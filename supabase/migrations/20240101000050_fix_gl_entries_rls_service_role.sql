-- Migration: Fix GL Entries RLS for Service Role Inserts
-- Description: Allow service role to insert when organization context is set via session variable
-- Dependencies: 20240101000007_create_gl_entries.sql, 20240101000035_create_get_user_org_function.sql

-- Drop existing policy
DROP POLICY IF EXISTS "GL entries are insertable via property access" ON public.gl_entries;

-- Recreate policy with session variable support
CREATE POLICY "GL entries are insertable via property access"
    ON public.gl_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND (
                -- Normal authenticated user check
                organization_id = public.get_user_organization_id()
                OR
                -- Service role with organization context set via session variable
                organization_id::text = current_setting('request.jwt.claims.organization_id', true)
            )
        )
    );

-- Add comment for documentation
COMMENT ON POLICY "GL entries are insertable via property access" ON public.gl_entries IS
'Allows insert if property belongs to user organization (authenticated users) OR if property belongs to organization specified in session variable (service role operations)';
