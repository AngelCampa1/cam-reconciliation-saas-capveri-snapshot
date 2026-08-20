-- Migration: Create Team Member Invitations Table
-- Description: Invitations for team members to join existing organizations
-- Dependencies: 20240101000002_create_users.sql, 20240101000001_create_organizations.sql

-- Step 1: Create team_member_invitations table
CREATE TABLE public.team_member_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin', 'member', 'viewer')),  -- No 'owner' role allowed
    invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by_user_id UUID REFERENCES public.users(id),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Create indexes for team_member_invitations
CREATE INDEX idx_team_member_invitations_token ON public.team_member_invitations(token);
CREATE INDEX idx_team_member_invitations_email ON public.team_member_invitations(email);
CREATE INDEX idx_team_member_invitations_organization_id ON public.team_member_invitations(organization_id);
CREATE INDEX idx_team_member_invitations_expires_at ON public.team_member_invitations(expires_at)
    WHERE revoked_at IS NULL AND used_at IS NULL;

-- Step 3: Enable Row Level Security
ALTER TABLE public.team_member_invitations ENABLE ROW LEVEL SECURITY;

-- Step 4: RLS Policies for team_member_invitations

-- Organization admins can view invitations in their organization
CREATE POLICY "Admins can view team invitations"
    ON public.team_member_invitations
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
CREATE POLICY "Admins can create team invitations"
    ON public.team_member_invitations
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
CREATE POLICY "Admins can update team invitations"
    ON public.team_member_invitations
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
CREATE POLICY "Admins can delete team invitations"
    ON public.team_member_invitations
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Step 5: Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_member_invitations TO authenticated;

-- Step 6: Add documentation comments
COMMENT ON TABLE public.team_member_invitations IS 'Invitation tokens for team members to join existing organizations';
COMMENT ON COLUMN public.team_member_invitations.id IS 'Unique invitation identifier';
COMMENT ON COLUMN public.team_member_invitations.email IS 'Email address to send invitation to';
COMMENT ON COLUMN public.team_member_invitations.token IS 'Secure URL-safe token for invitation link (32-byte)';
COMMENT ON COLUMN public.team_member_invitations.role IS 'Role to assign to invited user (admin, member, viewer)';
COMMENT ON COLUMN public.team_member_invitations.invited_by IS 'User ID who created the invitation';
COMMENT ON COLUMN public.team_member_invitations.organization_id IS 'Organization ID the user is being invited to';
COMMENT ON COLUMN public.team_member_invitations.expires_at IS 'When this invitation expires (typically 7 days)';
COMMENT ON COLUMN public.team_member_invitations.used_at IS 'When invitation was used (NULL if unused)';
COMMENT ON COLUMN public.team_member_invitations.used_by_user_id IS 'User ID of the user who accepted the invitation';
COMMENT ON COLUMN public.team_member_invitations.revoked_at IS 'When invitation was revoked (NULL if not revoked)';
COMMENT ON COLUMN public.team_member_invitations.created_at IS 'When invitation was created';
