# Story 3.3: Create Users Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.2
- **Status**: `completed`

## User Story
**As a** team member
**I want** my user account linked to an organization
**So that** I can access my organization's data with appropriate permissions

## Acceptance Criteria
- [x] **AC1**: `users` table created with columns:
  - `id` UUID primary key (references auth.users)
  - `organization_id` UUID NOT NULL (references organizations)
  - `email` VARCHAR(255) NOT NULL UNIQUE
  - `full_name` VARCHAR(255)
  - `role` VARCHAR(50) DEFAULT 'member'
  - `created_at`, `updated_at` TIMESTAMPTZ
- [x] **AC2**: Foreign key to auth.users with ON DELETE CASCADE
- [x] **AC3**: Foreign key to organizations
- [x] **AC4**: RLS: users see only users in their organization
- [x] **AC5**: Helper function `get_user_organization_id()` returns current user's org

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000002_create_users.sql
```

**Migration SQL**:
```sql
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

-- Indexes
CREATE INDEX idx_users_organization_id ON public.users(organization_id);
CREATE INDEX idx_users_email ON public.users(email);

-- Updated_at trigger
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
    SELECT organization_id
    FROM public.users
    WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policies
CREATE POLICY "Users can view users in their organization"
    ON public.users
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update their own profile"
    ON public.users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND organization_id = public.get_user_organization_id());

-- Admins/Owners can insert new users
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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;

-- Now update organizations RLS to use the helper function
DROP POLICY IF EXISTS "Organizations are viewable by members" ON public.organizations;
CREATE POLICY "Organizations are viewable by members"
    ON public.organizations
    FOR SELECT
    USING (id = public.get_user_organization_id());

COMMENT ON TABLE public.users IS 'User profiles linked to organizations';
COMMENT ON FUNCTION public.get_user_organization_id() IS 'Returns the organization_id for the current authenticated user';
```

## Definition of Done
- [x] User table links to auth.users and organizations
- [x] Helper function returns correct org_id
- [x] RLS restricts cross-org access

## Implementation Notes
- Created `supabase/migrations/20240101000002_create_users.sql`
- Includes `get_user_organization_id()` helper function used by all RLS policies
- RLS policies: SELECT (org members), UPDATE (self only), INSERT (admin/owner), DELETE (owner only)
- Updated organizations RLS to use the new helper function
- Added indexes on organization_id, email, and role
- Added 30 new tests to `backend/tests/test_migrations.py` (56 total migration tests)
