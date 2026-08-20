-- Migration: Create Subscriptions Table
-- Description: Organization subscription and billing status for Stripe integration
-- Dependencies: 20240101000001_create_organizations.sql, 20240101000002_create_users.sql

-- Create subscription status enum
CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'paused'
);

-- Create subscription plan enum
CREATE TYPE public.subscription_plan AS ENUM (
    'free',
    'starter',
    'professional',
    'enterprise'
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    plan public.subscription_plan NOT NULL DEFAULT 'free',
    status public.subscription_status NOT NULL DEFAULT 'trialing',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Stripe ID lookups
CREATE UNIQUE INDEX idx_subscriptions_stripe_subscription_id
    ON public.subscriptions(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe_customer_id
    ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status
    ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_period_end
    ON public.subscriptions(current_period_end);

-- Updated_at trigger
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their organization subscription
CREATE POLICY "Subscriptions are viewable by organization members"
    ON public.subscriptions
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- Only service role can INSERT (webhook creates subscription)
-- Or organization owner can create initial subscription
CREATE POLICY "Subscriptions are insertable by service role or owner"
    ON public.subscriptions
    FOR INSERT
    WITH CHECK (
        -- Allow if organization_id matches and user is owner (initial setup)
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'owner'
        )
    );

-- Only service role can UPDATE (webhook updates subscription)
-- Regular users can view but not modify
CREATE POLICY "Subscriptions are updatable by organization members"
    ON public.subscriptions
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- No DELETE policy - subscriptions are never deleted, only canceled
-- (Soft delete via status = 'canceled')

-- Grant permissions
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT INSERT, UPDATE ON public.subscriptions TO service_role;

-- Documentation comments
COMMENT ON TABLE public.subscriptions IS 'Organization subscription and billing status';
COMMENT ON COLUMN public.subscriptions.id IS 'Primary key UUID';
COMMENT ON COLUMN public.subscriptions.organization_id IS 'FK to organizations, one subscription per org';
COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx)';
COMMENT ON COLUMN public.subscriptions.stripe_customer_id IS 'Stripe customer ID (cus_xxx)';
COMMENT ON COLUMN public.subscriptions.plan IS 'Subscription plan tier: free, starter, professional, enterprise';
COMMENT ON COLUMN public.subscriptions.status IS 'Subscription status: trialing, active, past_due, canceled, paused';
COMMENT ON COLUMN public.subscriptions.current_period_start IS 'Start of current billing period';
COMMENT ON COLUMN public.subscriptions.current_period_end IS 'End of current billing period';
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS 'Whether subscription will cancel at period end';
COMMENT ON COLUMN public.subscriptions.created_at IS 'When the subscription was created';
COMMENT ON COLUMN public.subscriptions.updated_at IS 'When the subscription was last updated';
COMMENT ON TYPE public.subscription_status IS 'Subscription lifecycle states';
COMMENT ON TYPE public.subscription_plan IS 'Available subscription plan tiers';
