-- Track trial lifecycle email sends keyed by subscription and event type.
CREATE TABLE public.subscription_email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL,
    email_type TEXT NOT NULL CHECK (email_type IN ('trial_started', 'trial_ending_soon')),
    status TEXT NOT NULL CHECK (status IN ('processing', 'sent')),
    stripe_event_id TEXT,
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT subscription_email_events_subscription_type_key
        UNIQUE (stripe_subscription_id, email_type)
);

CREATE INDEX idx_subscription_email_events_org_id
    ON public.subscription_email_events (organization_id);

CREATE INDEX idx_subscription_email_events_status
    ON public.subscription_email_events (status);

ALTER TABLE public.subscription_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages subscription email events"
    ON public.subscription_email_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users cannot access subscription email events"
    ON public.subscription_email_events
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

COMMENT ON TABLE public.subscription_email_events IS
    'Webhook-driven trial lifecycle emails with retry-safe idempotency.';
