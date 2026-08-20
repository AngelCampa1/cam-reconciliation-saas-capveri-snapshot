-- Cancel reason enum
CREATE TYPE cancel_reason AS ENUM (
    'too_expensive',
    'not_using_enough',
    'missing_feature',
    'switching_competitor',
    'business_closed',
    'other'
);

-- Save offer type enum
CREATE TYPE save_offer_type AS ENUM (
    'discount_20pct_3mo',
    'feature_roadmap',
    'none'
);

-- Cancel attempts tracking table
CREATE TABLE public.cancel_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cancel_reason cancel_reason NOT NULL,
    other_text TEXT,
    offer_shown save_offer_type NOT NULL DEFAULT 'none',
    offer_accepted BOOLEAN,
    stripe_coupon_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.cancel_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cancel_attempts_org_select"
    ON public.cancel_attempts FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.users
        WHERE id = auth.uid()
    ));

CREATE POLICY "cancel_attempts_service_all"
    ON public.cancel_attempts
    USING (auth.role() = 'service_role');
