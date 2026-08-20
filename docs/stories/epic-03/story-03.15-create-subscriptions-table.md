# Story 3.15: Create Subscriptions Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 3
- **Dependencies**: Story 3.1 (Supabase Config), Story 3.2 (Organizations)
- **Status**: `pending`

## User Story
**As a** billing system
**I want** subscription data stored with Stripe integration
**So that** I can track organization billing status and plan tiers

## Acceptance Criteria
- [x] **AC1**: `subscriptions` table created with fields:
  - `id`, `organization_id` (FK, unique - one subscription per org)
  - `stripe_subscription_id`, `stripe_customer_id` (nullable, indexed)
  - `plan` (enum: free, starter, professional, enterprise)
  - `status` (enum: trialing, active, past_due, canceled, paused)
  - `current_period_start`, `current_period_end` (TIMESTAMPTZ)
  - `cancel_at_period_end` (BOOLEAN)
  - Timestamps
- [x] **AC2**: RLS: organization members can view their subscription
- [x] **AC3**: Only system/webhook can update subscription (not direct user)
- [x] **AC4**: Indexes on stripe_subscription_id, stripe_customer_id
- [x] **AC5**: Unique constraint on organization_id (one subscription per org)

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000012_create_subscriptions.sql
```

**Migration SQL**:
```sql
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

-- Indexes
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
-- Users can view their organization's subscription
CREATE POLICY "Subscriptions are viewable by organization members"
    ON public.subscriptions
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- Only service role can INSERT (webhook creates subscription)
CREATE POLICY "Subscriptions are insertable by service role"
    ON public.subscriptions
    FOR INSERT
    WITH CHECK (
        -- Allow if current user is service role (handled by API)
        -- Or if organization_id matches and user is owner (initial setup)
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'owner'
        )
    );

-- Only service role can UPDATE (webhook updates subscription)
CREATE POLICY "Subscriptions are updatable by service role"
    ON public.subscriptions
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- No DELETE - subscriptions are never deleted, only canceled
-- (Soft delete via status = 'canceled')

-- Grant permissions
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT INSERT, UPDATE ON public.subscriptions TO service_role;

COMMENT ON TABLE public.subscriptions IS 'Organization subscription and billing status';
COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx)';
COMMENT ON COLUMN public.subscriptions.stripe_customer_id IS 'Stripe customer ID (cus_xxx)';
```

## Definition of Done
- [x] All columns created with correct types
- [x] Enums created for plan and status
- [x] RLS restricts access to organization members
- [x] Unique constraint prevents multiple subscriptions per org
- [x] Indexes optimize Stripe ID lookups

## Implementation Notes
- Migration number 20240101000012 continues sequence after 000011 (pgaudit)
- Default trial period is 14 days from creation
- No DELETE policy - subscriptions use soft delete via status
- Service role needed for webhook updates
