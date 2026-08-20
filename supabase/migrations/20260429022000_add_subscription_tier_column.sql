-- Store the canonical workflow package selected for per-unit subscriptions.
-- The legacy plan enum remains for Stripe compatibility and broad entitlement
-- fallback; tier records the current package id: reconcile, control, or defend.

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS tier TEXT;

ALTER TABLE public.subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_tier_check
    CHECK (
        tier IS NULL
        OR tier IN (
            'reconcile',
            'control',
            'defend',
            'enterprise',
            'growth',
            'growth_v2',
            'portfolio',
            'essentials',
            'professional',
            'starter',
            'pro',
            'business'
        )
    );

CREATE INDEX IF NOT EXISTS idx_subscriptions_tier
    ON public.subscriptions(tier);

COMMENT ON COLUMN public.subscriptions.tier IS
    'Canonical workflow package id for current per-unit subscriptions; legacy rows may be null.';
