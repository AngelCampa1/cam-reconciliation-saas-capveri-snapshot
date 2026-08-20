-- Migration: Create Organizations Table
-- Description: Base table for multi-tenant organization accounts
-- Dependencies: None (first migration)

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

-- Create updated_at trigger function (reusable for all tables)
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
-- Note: This is a permissive policy that will be refined after the users table exists.
-- The users table migration (3.3) will create the user_organization_id() function
-- and update this policy to properly restrict access.
CREATE POLICY "Organizations are viewable by members"
    ON public.organizations
    FOR SELECT
    USING (true);  -- Will be restricted after users table exists

-- Policy for inserting new organizations (service role only initially)
CREATE POLICY "Organizations can be created by authenticated users"
    ON public.organizations
    FOR INSERT
    WITH CHECK (true);  -- Will be restricted after users table exists

-- Policy for updating organizations (members only)
CREATE POLICY "Organizations can be updated by members"
    ON public.organizations
    FOR UPDATE
    USING (true)  -- Will be restricted after users table exists
    WITH CHECK (true);

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO anon;

-- Add comments for documentation
COMMENT ON TABLE public.organizations IS 'Multi-tenant organization accounts for CapVeri.com';
COMMENT ON COLUMN public.organizations.id IS 'Unique identifier for the organization';
COMMENT ON COLUMN public.organizations.name IS 'Display name of the organization';
COMMENT ON COLUMN public.organizations.subscription_status IS 'Current subscription status: trial, active, suspended, cancelled';
COMMENT ON COLUMN public.organizations.settings IS 'Organization-specific settings stored as JSONB';
COMMENT ON COLUMN public.organizations.created_at IS 'Timestamp when the organization was created';
COMMENT ON COLUMN public.organizations.updated_at IS 'Timestamp when the organization was last updated (auto-updated by trigger)';
