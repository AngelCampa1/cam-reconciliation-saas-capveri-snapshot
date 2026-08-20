-- Migration: create capex_flags table
-- Stores rules-based CapEx classification flags for individual GL entries.
-- Flags are advisory — they do not block reconciliation.

CREATE TYPE public.capex_disposition AS ENUM ('pending', 'confirmed_capex', 'dismissed');

CREATE TABLE public.capex_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    gl_entry_id UUID NOT NULL REFERENCES gl_entries(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL CHECK (period_year >= 1990 AND period_year <= 2100),
    flag_reason TEXT NOT NULL,
    rule_name VARCHAR(100) NOT NULL,
    confidence_score NUMERIC(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    matched_pattern VARCHAR(255),
    disposition capex_disposition NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id UUID REFERENCES auth.users(id),
    review_note TEXT,
    classifier_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique: one flag per entry per rule (idempotent re-runs)
CREATE UNIQUE INDEX idx_capex_flags_entry_rule ON capex_flags (gl_entry_id, rule_name);

-- Fast lookup by property and year (used by get_flags, get_summary)
CREATE INDEX idx_capex_flags_property_year ON capex_flags (property_id, period_year);

-- Filtered lookup for unreviewed flags (used by reconciliation gate check)
CREATE INDEX idx_capex_flags_disposition ON capex_flags (property_id, period_year, disposition);

-- Org-scoped queries (defense-in-depth filter on organization_id)
CREATE INDEX idx_capex_flags_org ON capex_flags (organization_id);

ALTER TABLE public.capex_flags ENABLE ROW LEVEL SECURITY;

-- Org members can read/write their own org's capex flags
CREATE POLICY "org_members_capex_flags" ON public.capex_flags
    FOR ALL USING (
        organization_id = public.get_user_organization_id()
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capex_flags TO authenticated;
