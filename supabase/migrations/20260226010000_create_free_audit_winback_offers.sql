-- Track free-audit winback email cadence (day 1: 50% month, day 7: free month)

CREATE TABLE public.free_audit_winback_offers (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    first_audit_started_at TIMESTAMPTZ NOT NULL,
    offer_50_sent_at TIMESTAMPTZ,
    offer_free_sent_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_free_audit_winback_offer_50
    ON public.free_audit_winback_offers (offer_50_sent_at);

CREATE INDEX idx_free_audit_winback_offer_free
    ON public.free_audit_winback_offers (offer_free_sent_at);

CREATE INDEX idx_free_audit_winback_converted
    ON public.free_audit_winback_offers (converted_at);

CREATE TRIGGER update_free_audit_winback_offers_updated_at
    BEFORE UPDATE ON public.free_audit_winback_offers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.free_audit_winback_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "free_audit_winback_service_all"
    ON public.free_audit_winback_offers
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.free_audit_winback_offers TO service_role;

COMMENT ON TABLE public.free_audit_winback_offers IS 'State table for free-audit winback outreach cadence.';
