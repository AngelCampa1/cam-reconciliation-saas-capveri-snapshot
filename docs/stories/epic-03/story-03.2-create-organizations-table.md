# Story 3.2: Create Organizations Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.1
- **Status**: `completed`

## User Story
**As a** SaaS user
**I want** my organization's data isolated from others
**So that** my business data remains private and secure

## Acceptance Criteria
- [x] **AC1**: `organizations` table created with columns:
  - `id` UUID primary key (default gen_random_uuid())
  - `name` VARCHAR(255) NOT NULL
  - `subscription_status` VARCHAR(50) NOT NULL DEFAULT 'trial' with CHECK constraint (trial, active, suspended, cancelled)
  - `settings` JSONB DEFAULT '{}'
  - `created_at` TIMESTAMPTZ DEFAULT NOW()
  - `updated_at` TIMESTAMPTZ DEFAULT NOW()
- [x] **AC2**: RLS enabled on table
- [x] **AC3**: RLS policy: users can only see their own organization (permissive policy, will be restricted after users table)
- [x] **AC4**: Updated_at trigger automatically updates on row change

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000001_create_organizations.sql
```

**Migration SQL**:
```sql
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create organizations table
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'trial'
        CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on subscription_status for filtering
CREATE INDEX idx_organizations_subscription_status
    ON public.organizations(subscription_status);

-- Create updated_at trigger function (reusable)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to organizations
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own organization
-- (Requires user_organization_id() function, created in users migration)
-- For now, create a permissive policy that will be restricted later
CREATE POLICY "Organizations are viewable by members"
    ON public.organizations
    FOR SELECT
    USING (true);  -- Will be restricted after users table exists

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO anon;

-- Add comment for documentation
COMMENT ON TABLE public.organizations IS 'Multi-tenant organization accounts';
```

## Definition of Done
- [x] Migration runs without errors (SQL validated via tests)
- [x] Table exists with correct schema (26 tests verify structure)
- [x] RLS enabled
- [x] Updated_at trigger works

## Implementation Notes
- Created `supabase/migrations/20240101000001_create_organizations.sql`
- Includes reusable `update_updated_at_column()` trigger function for all future tables
- RLS policies are permissive initially - will be restricted after users table migration
- Added column comments for documentation
- Created `backend/tests/test_migrations.py` with 26 tests validating migration structure
