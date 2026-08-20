-- Migration: cross_doc_analyses table + auditor config columns
-- Phase: Cross-Document Reasoning Engine

-- -------------------------------------------------------------------------
-- 0. Ensure set_updated_at() trigger helper exists
--    (idempotent: used by many tables; safe to re-create if already present)
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- 1. New table: public.cross_doc_analyses
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cross_doc_analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    period_year     INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_review', 'reviewed')),
    findings        JSONB NOT NULL DEFAULT '{}',
    finding_decisions JSONB NOT NULL DEFAULT '{}',
    token_usage     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_cross_doc_analyses_property_period
    ON public.cross_doc_analyses (property_id, period_year);

CREATE INDEX IF NOT EXISTS idx_cross_doc_analyses_org
    ON public.cross_doc_analyses (organization_id);

-- Auto-update updated_at on row modification
CREATE OR REPLACE TRIGGER set_cross_doc_analyses_updated_at
    BEFORE UPDATE ON public.cross_doc_analyses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------------------
-- 2. RLS — org-scoped read/write (same pattern as other tables)
-- -------------------------------------------------------------------------

ALTER TABLE public.cross_doc_analyses ENABLE ROW LEVEL SECURITY;

-- Members of the owning organization can read
CREATE POLICY "cross_doc_analyses_select_own_org"
    ON public.cross_doc_analyses
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- Members of the owning organization can insert
CREATE POLICY "cross_doc_analyses_insert_own_org"
    ON public.cross_doc_analyses
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- Members of the owning organization can update
CREATE POLICY "cross_doc_analyses_update_own_org"
    ON public.cross_doc_analyses
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- -------------------------------------------------------------------------
-- 3. Add auditor_config to public.organizations (org-level defaults)
-- -------------------------------------------------------------------------

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS auditor_config JSONB;

COMMENT ON COLUMN public.organizations.auditor_config IS
    'Org-level auditor context: market, typical fee ranges, known vendor patterns, custom rules.';

-- -------------------------------------------------------------------------
-- 4. Add auditor_overrides to public.properties (property-level overrides)
-- -------------------------------------------------------------------------

ALTER TABLE public.properties
    ADD COLUMN IF NOT EXISTS auditor_overrides JSONB;

COMMENT ON COLUMN public.properties.auditor_overrides IS
    'Property-level auditor overrides: known exceptions, special instructions, suppressed finding categories.';
