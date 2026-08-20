-- Migration: Create Comparison Runs + Findings tables (Module B / story B1.6)
-- Description: Persist point-in-time bidirectional comparison runs (CapVeri-correct
--   vs. what another system charged) plus their per-tenant findings. This is the
--   audit trail for CRE FinOps correctness: a GET/POST comparison recomputes against
--   the latest data, but a stored run records what the comparison concluded at a
--   moment in time (defensible "the right amount was charged on date X").
-- Dependencies:
--   20240101000010_create_reconciliation_snapshots.sql (property/org RLS pattern,
--   public.get_user_organization_id(), public.update_updated_at_column()).

-- ---------------------------------------------------------------------------
-- comparison_runs: one row per executed comparison (header + aggregate totals).
-- ---------------------------------------------------------------------------
CREATE TABLE public.comparison_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,

    -- Inclusive absolute MATCH threshold used to classify each finding.
    tolerance NUMERIC(14, 2) NOT NULL,

    -- Where the charged side came from: the default actual_billed_amounts table,
    -- or an explicit caller-supplied set (manual entry / parsed legacy recon).
    source TEXT NOT NULL CHECK (source IN ('actual_billed', 'explicit')),

    -- Aggregate totals (mirrors ComparisonResult). Signed convention:
    -- variance = actual_charged - capveri_correct.
    total_capveri_correct NUMERIC(14, 2) NOT NULL,
    total_actual_charged NUMERIC(14, 2) NOT NULL,
    total_net_variance NUMERIC(14, 2) NOT NULL,
    total_overcharge NUMERIC(14, 2) NOT NULL,
    total_undercharge NUMERIC(14, 2) NOT NULL,

    overcharge_count INTEGER NOT NULL DEFAULT 0,
    undercharge_count INTEGER NOT NULL DEFAULT 0,
    match_count INTEGER NOT NULL DEFAULT 0,

    -- Audit records are immutable: created_at only, no updated_at/trigger, and
    -- no UPDATE grant below. A re-run is a NEW row, never an in-place edit.
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comparison_runs_valid_period CHECK (period_end_date > period_start_date),
    CONSTRAINT comparison_runs_nonneg_tolerance CHECK (tolerance >= 0)
);

CREATE INDEX idx_comparison_runs_org_property_created
    ON public.comparison_runs(organization_id, property_id, created_at DESC);
CREATE INDEX idx_comparison_runs_property_id
    ON public.comparison_runs(property_id);
CREATE INDEX idx_comparison_runs_period
    ON public.comparison_runs(period_start_date, period_end_date);

-- ---------------------------------------------------------------------------
-- comparison_findings: one row per tenant variance within a run.
--   lease_id is TEXT (not a leases FK) because the engine also emits synthetic
--   keys for non-lease findings: "name::<tenant_name>" (unmatched / combined
--   duplicate-name), "id::<row_id>" (blank-name billed row), and
--   "explicit::<index>" (blank-name explicit charge). Persisting them verbatim
--   keeps the no-drop invariant intact.
--   pool_breakdowns is a nullable JSONB list of signed PoolVariance records
--   (B1.5a); NULL today (no per-pool data exists until B1.5b) — stored so the
--   per-pool dimension needs no follow-up migration once B1.5b feeds real data.
-- ---------------------------------------------------------------------------
CREATE TABLE public.comparison_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comparison_run_id UUID NOT NULL
        REFERENCES public.comparison_runs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    lease_id TEXT NOT NULL,
    tenant_name TEXT,

    capveri_correct NUMERIC(14, 2) NOT NULL,
    actual_charged NUMERIC(14, 2) NOT NULL,
    variance NUMERIC(14, 2) NOT NULL,
    abs_variance NUMERIC(14, 2) NOT NULL,
    direction TEXT NOT NULL
        CHECK (direction IN ('overcharge', 'undercharge', 'match')),
    variance_pct NUMERIC(14, 2),

    pool_breakdowns JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comparison_findings_run_id
    ON public.comparison_findings(comparison_run_id);
CREATE INDEX idx_comparison_findings_org_id
    ON public.comparison_findings(organization_id);

-- ---------------------------------------------------------------------------
-- RLS: org-scoped reads via the property-organization pattern used by
-- reconciliation_snapshots. The backend itself writes with the service role
-- (which bypasses RLS) and filters organization_id explicitly in every query;
-- these policies are the defense-in-depth layer for the authenticated path.
-- ---------------------------------------------------------------------------
ALTER TABLE public.comparison_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comparison runs are viewable via property access"
    ON public.comparison_runs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Comparison runs are insertable via property access"
    ON public.comparison_runs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Comparison runs are deletable via property access"
    ON public.comparison_runs
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

ALTER TABLE public.comparison_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comparison findings are viewable via run org access"
    ON public.comparison_findings
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Comparison findings are insertable via run org access"
    ON public.comparison_findings
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Comparison findings are deletable via run org access"
    ON public.comparison_findings
    FOR DELETE
    USING (organization_id = public.get_user_organization_id());

-- Grant permissions to Supabase roles (RLS still enforces row-level access).
-- No UPDATE on either table: comparison runs/findings are immutable audit records
-- (a correction is a new run). INSERT/DELETE only, plus SELECT for reads.
GRANT SELECT, INSERT, DELETE ON public.comparison_runs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.comparison_findings TO authenticated;

-- ---------------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.comparison_runs IS
    'Point-in-time bidirectional comparison runs (Module B / B1.6): CapVeri-correct vs. another system''s charges. Audit trail of what a comparison concluded at a moment in time.';
COMMENT ON COLUMN public.comparison_runs.source IS
    'Charged-side source: actual_billed (default actual_billed_amounts table) or explicit (caller-supplied set).';
COMMENT ON COLUMN public.comparison_runs.total_net_variance IS
    'Signed net: total_actual_charged - total_capveri_correct. Positive = net overcharge.';
COMMENT ON TABLE public.comparison_findings IS
    'Per-tenant signed variance within a comparison run. lease_id is TEXT to also hold synthetic non-lease keys (name::/id::/explicit::).';
COMMENT ON COLUMN public.comparison_findings.lease_id IS
    'Lease id, or a synthetic key: name::<tenant_name>, id::<row_id>, or explicit::<index> for non-lease findings.';
COMMENT ON COLUMN public.comparison_findings.direction IS
    'Signed classification: overcharge (variance > tolerance), undercharge (variance < -tolerance), or match.';
COMMENT ON COLUMN public.comparison_findings.pool_breakdowns IS
    'Optional JSONB list of signed per-pool PoolVariance records (B1.5a). NULL until B1.5b feeds real per-pool data.';
