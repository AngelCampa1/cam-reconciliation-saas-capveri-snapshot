-- Track which premium features each organization has used.
-- Enables downgrade warnings on the billing page.
-- Migration: 20260507000000

CREATE TABLE public.feature_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    first_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usage_count INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT feature_usage_events_org_feature_unique UNIQUE (organization_id, feature_key)
);

CREATE INDEX idx_feature_usage_events_org ON public.feature_usage_events(organization_id);

ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;

-- Org members can read their own feature usage records
CREATE POLICY "Org members can view own feature usage"
    ON public.feature_usage_events FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- Writes are service-role-only: no INSERT/UPDATE/DELETE policies for authenticated users.
-- The backend upserts via the service-role key which bypasses RLS.

COMMENT ON TABLE public.feature_usage_events IS 'Per-org log of first/last use of gate-able features. Used to warn users before downgrading to a tier that would lock features they have used.';

-- Atomic upsert helper: inserts on first use, increments usage_count on subsequent calls.
-- Called by the backend service role to avoid a non-atomic SELECT+INSERT/UPDATE pattern.
CREATE OR REPLACE FUNCTION public.upsert_feature_use(
    p_organization_id UUID,
    p_feature_key TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.feature_usage_events (organization_id, feature_key, first_used_at, last_used_at, usage_count)
    VALUES (p_organization_id, p_feature_key, NOW(), NOW(), 1)
    ON CONFLICT (organization_id, feature_key)
    DO UPDATE SET
        last_used_at = NOW(),
        usage_count = feature_usage_events.usage_count + 1;
END;
$$;
