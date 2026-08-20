-- Create app-owned signup nurture email schedule.
-- Events are processed by the backend cron endpoint so paid active
-- organizations can be skipped before any marketing nurture email is sent.
CREATE TABLE public.signup_email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    email_type TEXT NOT NULL CHECK (
        email_type IN (
            'day_1_add_property',
            'day_3_upload_gl',
            'day_7_run_reconciliation',
            'day_14_add_billing',
            'day_24_keep_access'
        )
    ),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'sent', 'skipped', 'failed')
    ),
    scheduled_at TIMESTAMPTZ NOT NULL,
    provider_message_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT signup_email_events_user_type_key UNIQUE (user_id, email_type)
);

CREATE INDEX idx_signup_email_events_org_id
    ON public.signup_email_events (organization_id);

CREATE INDEX idx_signup_email_events_due
    ON public.signup_email_events (status, scheduled_at);

ALTER TABLE public.signup_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages signup email events"
    ON public.signup_email_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users cannot access signup email events"
    ON public.signup_email_events
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

ALTER TABLE public.subscription_email_events
    DROP CONSTRAINT IF EXISTS subscription_email_events_email_type_check;

ALTER TABLE public.subscription_email_events
    ADD CONSTRAINT subscription_email_events_email_type_check
    CHECK (email_type IN ('trial_started', 'trial_ending_soon', 'trial_paused'));

COMMENT ON TABLE public.signup_email_events IS
    'App-owned post-signup nurture schedule. Due sends skip organizations with active paid subscriptions.';
