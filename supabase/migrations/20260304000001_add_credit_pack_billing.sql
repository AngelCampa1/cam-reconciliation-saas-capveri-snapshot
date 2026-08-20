-- Migration: Add credit pack billing model
-- Adds audit_credits, credit_consumption_log tables and billing_model to subscriptions

-- ============================================================
-- public.audit_credits: tracks credit pack purchases per organization
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_credits (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    credits_purchased           INTEGER NOT NULL CHECK (credits_purchased > 0),
    credits_used                INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
    credits_remaining           INTEGER GENERATED ALWAYS AS (credits_purchased - credits_used) STORED,
    unit_price_cents            INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    stripe_payment_intent_id    TEXT,
    stripe_checkout_session_id  TEXT,
    purchased_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT credits_used_lte_purchased CHECK (credits_used <= credits_purchased)
);

CREATE INDEX idx_audit_credits_org_id ON public.audit_credits (organization_id);
-- Idempotency: prevent duplicate credit packs from the same Stripe checkout session
CREATE UNIQUE INDEX uq_audit_credits_checkout_session ON public.audit_credits (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

-- RLS
ALTER TABLE public.audit_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their credit packs"
    ON public.audit_credits FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage credit packs"
    ON public.audit_credits FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- public.credit_consumption_log: immutable audit trail per credit use
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_consumption_log (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    credit_pack_id              UUID NOT NULL REFERENCES public.audit_credits(id) ON DELETE RESTRICT,
    reconciliation_snapshot_id  UUID REFERENCES public.reconciliation_snapshots(id) ON DELETE SET NULL,
    consumed_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_log_org_id ON public.credit_consumption_log (organization_id);
CREATE INDEX idx_credit_log_pack_id ON public.credit_consumption_log (credit_pack_id);
CREATE INDEX idx_credit_log_snapshot_id ON public.credit_consumption_log (reconciliation_snapshot_id)
    WHERE reconciliation_snapshot_id IS NOT NULL;

-- RLS
ALTER TABLE public.credit_consumption_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their credit usage"
    ON public.credit_consumption_log FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage credit log"
    ON public.credit_consumption_log FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- public.subscriptions: add billing_model for legacy coexistence
-- ============================================================
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'subscription'
    CHECK (billing_model IN ('subscription', 'credit_pack'));

COMMENT ON COLUMN public.subscriptions.billing_model IS
    'subscription = legacy per-building/month; credit_pack = new prepaid audit credits';
