CREATE TABLE public.stripe_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'succeeded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT stripe_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id)
);

CREATE INDEX idx_stripe_webhook_events_created_at
    ON public.stripe_webhook_events (created_at DESC);

-- Only service role may access; no user-level access
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only"
    ON public.stripe_webhook_events
    USING (false);
