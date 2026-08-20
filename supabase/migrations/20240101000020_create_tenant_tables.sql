-- Migration: Create Tenant Portal Tables
-- Description: Tables for tenant portal authentication and lease access
-- Dependencies: 20240101000002_create_users.sql, 20240101000005_create_leases.sql

-- Step 1: Update users table to add 'tenant' role option
ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'tenant'));

-- Step 2: Create tenant_users table
CREATE TABLE public.tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for tenant_users
CREATE INDEX idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX idx_tenant_users_organization_id ON public.tenant_users(organization_id);
CREATE INDEX idx_tenant_users_contact_email ON public.tenant_users(contact_email);

-- Step 3: Create tenant_lease_links table (join table for many-to-many relationship)
CREATE TABLE public.tenant_lease_links (
    tenant_user_id UUID NOT NULL REFERENCES public.tenant_users(id) ON DELETE CASCADE,
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_user_id, lease_id)
);

-- Create indexes for tenant_lease_links
CREATE INDEX idx_tenant_lease_links_tenant_user_id ON public.tenant_lease_links(tenant_user_id);
CREATE INDEX idx_tenant_lease_links_lease_id ON public.tenant_lease_links(lease_id);

-- Step 4: Create tenant_invitations table
CREATE TABLE public.tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for tenant_invitations
CREATE INDEX idx_tenant_invitations_token ON public.tenant_invitations(token);
CREATE INDEX idx_tenant_invitations_email ON public.tenant_invitations(email);
CREATE INDEX idx_tenant_invitations_lease_id ON public.tenant_invitations(lease_id);
CREATE INDEX idx_tenant_invitations_organization_id ON public.tenant_invitations(organization_id);
CREATE INDEX idx_tenant_invitations_expires_at ON public.tenant_invitations(expires_at) WHERE NOT is_revoked AND used_at IS NULL;

-- Step 5: Enable Row Level Security
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_lease_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

-- Step 6: RLS Policies for tenant_users

-- Tenant users can view their own profile
-- Organization admins can view all tenant users in their organization
CREATE POLICY "Tenant users can view their own profile"
    ON public.tenant_users
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR organization_id = public.get_user_organization_id()
    );

-- Organization admins can create tenant users
CREATE POLICY "Admins can create tenant users"
    ON public.tenant_users
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Organization admins can update tenant users
CREATE POLICY "Admins can update tenant users"
    ON public.tenant_users
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Organization admins can delete tenant users
CREATE POLICY "Admins can delete tenant users"
    ON public.tenant_users
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Step 7: RLS Policies for tenant_lease_links

-- Tenant users can view their own lease links
-- Organization admins can view all lease links
CREATE POLICY "Users can view relevant lease links"
    ON public.tenant_lease_links
    FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM public.tenant_users WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = tenant_lease_links.lease_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

-- Organization admins can create lease links
CREATE POLICY "Admins can create lease links"
    ON public.tenant_lease_links
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = lease_id
            AND p.organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Organization admins can delete lease links
CREATE POLICY "Admins can delete lease links"
    ON public.tenant_lease_links
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = lease_id
            AND p.organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Step 8: RLS Policies for tenant_invitations

-- Organization admins can view invitations in their organization
CREATE POLICY "Admins can view invitations"
    ON public.tenant_invitations
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Organization admins can create invitations
CREATE POLICY "Admins can create invitations"
    ON public.tenant_invitations
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Organization admins can update invitations (e.g., revoke)
CREATE POLICY "Admins can update invitations"
    ON public.tenant_invitations
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Organization admins can delete invitations
CREATE POLICY "Admins can delete invitations"
    ON public.tenant_invitations
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Step 9: Update leases RLS policy to allow tenant access
-- Drop and recreate the leases SELECT policy to include tenant users
DROP POLICY IF EXISTS "Leases are viewable via property access" ON public.leases;

CREATE POLICY "Leases are viewable by organization members and linked tenants"
    ON public.leases
    FOR SELECT
    USING (
        -- Organization members can see all leases
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        OR
        -- Tenants can only see their linked leases
        id IN (
            SELECT tll.lease_id
            FROM public.tenant_lease_links tll
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE tu.user_id = auth.uid()
        )
    );

-- Step 10: Update reconciliation_snapshots RLS policy to allow tenant access
-- Drop and recreate the policy to include tenants
DROP POLICY IF EXISTS "Snapshots are viewable via property access" ON public.reconciliation_snapshots;

CREATE POLICY "Snapshots are viewable by organization members and linked tenants"
    ON public.reconciliation_snapshots
    FOR SELECT
    USING (
        -- Organization members can see all snapshots
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        OR
        -- Tenants can see snapshots for properties their leases are in
        property_id IN (
            SELECT l.property_id
            FROM public.leases l
            JOIN public.tenant_lease_links tll ON tll.lease_id = l.id
            JOIN public.tenant_users tu ON tu.id = tll.tenant_user_id
            WHERE tu.user_id = auth.uid()
        )
    );

-- Step 11: Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_users TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.tenant_lease_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invitations TO authenticated;

-- Step 12: Add documentation comments
COMMENT ON TABLE public.tenant_users IS 'Tenant portal users with restricted access to specific leases';
COMMENT ON COLUMN public.tenant_users.id IS 'Unique tenant user identifier';
COMMENT ON COLUMN public.tenant_users.user_id IS 'References users.id - links to auth user';
COMMENT ON COLUMN public.tenant_users.organization_id IS 'Organization this tenant belongs to';
COMMENT ON COLUMN public.tenant_users.contact_name IS 'Tenant contact person full name';
COMMENT ON COLUMN public.tenant_users.contact_email IS 'Tenant contact email address (must be unique)';
COMMENT ON COLUMN public.tenant_users.created_at IS 'When tenant user was created';

COMMENT ON TABLE public.tenant_lease_links IS 'Join table linking tenant users to their accessible leases (many-to-many)';
COMMENT ON COLUMN public.tenant_lease_links.tenant_user_id IS 'Tenant user ID';
COMMENT ON COLUMN public.tenant_lease_links.lease_id IS 'Lease ID the tenant can access';
COMMENT ON COLUMN public.tenant_lease_links.created_at IS 'When this link was created';

COMMENT ON TABLE public.tenant_invitations IS 'Invitation tokens for tenant signup with expiration and revocation';
COMMENT ON COLUMN public.tenant_invitations.id IS 'Unique invitation identifier';
COMMENT ON COLUMN public.tenant_invitations.email IS 'Email address to send invitation to';
COMMENT ON COLUMN public.tenant_invitations.token IS 'Secure URL-safe token for invitation link (32-byte)';
COMMENT ON COLUMN public.tenant_invitations.lease_id IS 'Lease the tenant will have access to after signup';
COMMENT ON COLUMN public.tenant_invitations.invited_by IS 'User ID who created the invitation';
COMMENT ON COLUMN public.tenant_invitations.organization_id IS 'Organization ID for multi-tenancy isolation';
COMMENT ON COLUMN public.tenant_invitations.expires_at IS 'When this invitation expires (typically 7 days)';
COMMENT ON COLUMN public.tenant_invitations.used_at IS 'When invitation was used (NULL if unused)';
COMMENT ON COLUMN public.tenant_invitations.is_revoked IS 'Whether invitation has been manually revoked';
COMMENT ON COLUMN public.tenant_invitations.created_at IS 'When invitation was created';
