-- Migration: create gl_analysis_results table
-- Stores AI-generated GL narrative analysis results with full audit trail.
-- Analysis is advisory only — no changes to calculations.

CREATE TABLE public.gl_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL CHECK (period_year >= 1990 AND period_year <= 2100),
    analysis_markdown TEXT NOT NULL,
    token_input INTEGER NOT NULL DEFAULT 0,
    token_output INTEGER NOT NULL DEFAULT 0,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ran_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    dismissed_at TIMESTAMPTZ,
    dismissed_by_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by property and year (used by get_latest_analysis)
CREATE INDEX idx_gl_analysis_property_year ON gl_analysis_results (property_id, period_year);

-- Index for org-scoped dismiss updates (defense-in-depth filter on organization_id)
CREATE INDEX idx_gl_analysis_org ON gl_analysis_results (organization_id);

ALTER TABLE public.gl_analysis_results ENABLE ROW LEVEL SECURITY;

-- Org members can read/write their own org's analysis results
CREATE POLICY "org_members_gl_analysis" ON public.gl_analysis_results
    FOR ALL USING (
        organization_id = public.get_user_organization_id()
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gl_analysis_results TO authenticated;
