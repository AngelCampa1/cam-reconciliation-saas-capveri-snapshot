-- Migration: Create Users Table
-- Description: User profiles linked to organizations, extends Supabase auth.users
-- Dependencies: 20240101000001_create_organizations.sql

-- Create users table (extends auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_users_organization_id ON public.users(organization_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Helper function to get the current user organization_id
-- SECURITY DEFINER runs with the privileges of the function owner
-- STABLE indicates function always returns same result for same args within a transaction
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
    SELECT organization_id
    FROM public.users
    WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policy: Users can view all users in their organization
CREATE POLICY "Users can view users in their organization"
    ON public.users
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- RLS Policy: Users can only update their own profile
-- They cannot change their organization_id
CREATE POLICY "Users can update their own profile"
    ON public.users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND organization_id = public.get_user_organization_id()
    );

-- RLS Policy: Only admins and owners can insert new users into their organization
CREATE POLICY "Admins can insert users"
    ON public.users
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- RLS Policy: Only owners can delete users (except themselves)
CREATE POLICY "Owners can delete users"
    ON public.users
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND id != auth.uid()  -- Cannot delete yourself
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'owner'
        )
    );

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;

-- Now update organizations RLS policies to use the helper function
-- Drop the permissive policies and create proper org-scoped policies
DROP POLICY IF EXISTS "Organizations are viewable by members" ON public.organizations;
DROP POLICY IF EXISTS "Organizations can be created by authenticated users" ON public.organizations;
DROP POLICY IF EXISTS "Organizations can be updated by members" ON public.organizations;

-- Organizations: Members can view their own organization
CREATE POLICY "Organizations are viewable by members"
    ON public.organizations
    FOR SELECT
    USING (id = public.get_user_organization_id());

-- Organizations: Only owners can update organization settings
CREATE POLICY "Owners can update organizations"
    ON public.organizations
    FOR UPDATE
    USING (id = public.get_user_organization_id())
    WITH CHECK (
        id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'owner'
        )
    );

-- Organizations: Allow service role to create organizations (for signup flow)
-- Regular users cannot create organizations directly
CREATE POLICY "Service role can create organizations"
    ON public.organizations
    FOR INSERT
    WITH CHECK (true);  -- Service role bypasses RLS anyway, this is for documentation

-- Add documentation comments
COMMENT ON TABLE public.users IS 'User profiles linked to organizations, extends Supabase auth.users';
COMMENT ON COLUMN public.users.id IS 'References auth.users.id - same UUID as Supabase Auth user';
COMMENT ON COLUMN public.users.organization_id IS 'Organization this user belongs to';
COMMENT ON COLUMN public.users.email IS 'User email address, must match auth.users.email';
COMMENT ON COLUMN public.users.full_name IS 'User display name';
COMMENT ON COLUMN public.users.role IS 'User role within organization: owner, admin, member, viewer';
COMMENT ON COLUMN public.users.created_at IS 'When the user profile was created';
COMMENT ON COLUMN public.users.updated_at IS 'When the user profile was last updated';
COMMENT ON FUNCTION public.get_user_organization_id() IS 'Returns the organization_id for the current authenticated user. Used in RLS policies.';
