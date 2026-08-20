-- App-owned CRM lifecycle ledger for email and funnel coordination.
CREATE TABLE public.crm_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    content_lead_id UUID REFERENCES public.content_leads(id) ON DELETE SET NULL,
    lifecycle_stage TEXT NOT NULL CHECK (
        lifecycle_stage IN ('lead', 'trial_signup', 'trial_active', 'trial_paused', 'customer')
    ),
    next_step TEXT NOT NULL,
    email_subscription_status TEXT NOT NULL DEFAULT 'subscribed' CHECK (
        email_subscription_status IN ('subscribed', 'unsubscribed')
    ),
    last_event_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.crm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_source TEXT NOT NULL,
    lifecycle_stage TEXT NOT NULL,
    next_step TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_contacts_organization_id
    ON public.crm_contacts (organization_id);

CREATE INDEX idx_crm_contacts_stage_next_step
    ON public.crm_contacts (lifecycle_stage, next_step);

CREATE INDEX idx_crm_events_contact_occurred
    ON public.crm_events (contact_id, occurred_at DESC);

CREATE INDEX idx_crm_events_name_occurred
    ON public.crm_events (event_name, occurred_at DESC);

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages CRM contacts"
    ON public.crm_contacts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users cannot access CRM contacts"
    ON public.crm_contacts
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Service role manages CRM events"
    ON public.crm_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users cannot access CRM events"
    ON public.crm_events
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

COMMENT ON TABLE public.crm_contacts IS
    'App-owned CRM contact state for lifecycle email, Sequencer, and funnel coordination.';

COMMENT ON TABLE public.crm_events IS
    'Immutable CRM event ledger for lead, signup, billing, unsubscribe, and funnel progression events.';
