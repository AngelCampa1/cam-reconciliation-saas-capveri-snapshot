-- Create reconciliation_campaigns table
-- One row per property per year — owns the workflow lifecycle (draft→finalized→in_review→approved→sent)
-- Snapshots (per-tenant) retain their own draft/finalized status for calculation integrity.

CREATE TABLE public.reconciliation_campaigns (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id                 UUID        NOT NULL,
    property_id                     UUID        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    period_year                     INTEGER     NOT NULL,
    status                          VARCHAR(20) NOT NULL DEFAULT 'draft',

    -- Audit trail columns
    finalized_at                    TIMESTAMPTZ,
    finalized_by_user_id            UUID,
    submitted_for_review_at         TIMESTAMPTZ,
    submitted_for_review_by_user_id UUID,
    approved_at                     TIMESTAMPTZ,
    approved_by_user_id             UUID,
    sent_at                         TIMESTAMPTZ,
    sent_by_user_id                 UUID,

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT reconciliation_campaigns_status_check
        CHECK (status IN ('draft', 'finalized', 'in_review', 'approved', 'sent')),
    CONSTRAINT reconciliation_campaigns_unique_property_year
        UNIQUE (property_id, period_year)
);

-- Indexes
CREATE INDEX idx_reconciliation_campaigns_org    ON public.reconciliation_campaigns (organization_id);
CREATE INDEX idx_reconciliation_campaigns_prop   ON public.reconciliation_campaigns (property_id);
CREATE INDEX idx_reconciliation_campaigns_year   ON public.reconciliation_campaigns (period_year);
CREATE INDEX idx_reconciliation_campaigns_status ON public.reconciliation_campaigns (status);

-- Auto-update updated_at
CREATE TRIGGER update_reconciliation_campaigns_updated_at
    BEFORE UPDATE ON public.reconciliation_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.reconciliation_campaigns ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can see their own campaigns
CREATE POLICY "Org members can view their campaigns"
    ON public.reconciliation_campaigns
    FOR SELECT
    USING (
        organization_id = (
            SELECT organization_id FROM public.users
            WHERE id = auth.uid()
        )
    );

-- INSERT: org members can create campaigns for their properties
CREATE POLICY "Org members can create campaigns"
    ON public.reconciliation_campaigns
    FOR INSERT
    WITH CHECK (
        organization_id = (
            SELECT organization_id FROM public.users
            WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = (
                SELECT organization_id FROM public.users
                WHERE id = auth.uid()
            )
        )
    );

-- UPDATE: org members can update status (transitions are enforced at API layer)
CREATE POLICY "Org members can update their campaigns"
    ON public.reconciliation_campaigns
    FOR UPDATE
    USING (
        organization_id = (
            SELECT organization_id FROM public.users
            WHERE id = auth.uid()
        )
    );

-- GRANT
GRANT SELECT, INSERT, UPDATE ON public.reconciliation_campaigns TO authenticated;

-- Comments
COMMENT ON TABLE  public.reconciliation_campaigns IS 'Property-year reconciliation workflow lifecycle. One row per property per year.';
COMMENT ON COLUMN public.reconciliation_campaigns.status IS 'Workflow state: draft → finalized → in_review → approved → sent. Rejection: in_review → finalized.';
COMMENT ON COLUMN public.reconciliation_campaigns.period_year IS 'Calendar year for this reconciliation (e.g. 2024).';
