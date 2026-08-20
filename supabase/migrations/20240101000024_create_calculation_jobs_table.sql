-- Migration: Create calculation_jobs table
-- Description: Tracks async reconciliation calculation jobs with status and results
-- Author: Claude
-- Date: 2024-01-01

-- Create calculation_jobs table
CREATE TABLE IF NOT EXISTS public.calculation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    force_recalculate BOOLEAN NOT NULL DEFAULT false,

    -- Progress tracking
    total_leases INTEGER,
    processed_leases INTEGER NOT NULL DEFAULT 0,

    -- Results (JSONB array of UUID strings)
    snapshot_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Error tracking
    error_message TEXT,
    error_details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_period CHECK (period_end > period_start),
    CONSTRAINT valid_progress CHECK (processed_leases >= 0 AND (total_leases IS NULL OR processed_leases <= total_leases))
);

-- Create indexes for performance
CREATE INDEX idx_calculation_jobs_organization ON public.calculation_jobs(organization_id);
CREATE INDEX idx_calculation_jobs_property ON public.calculation_jobs(property_id);
CREATE INDEX idx_calculation_jobs_status ON public.calculation_jobs(status);
CREATE INDEX idx_calculation_jobs_created ON public.calculation_jobs(created_at DESC);

-- Compound index for finding recent jobs for a property
CREATE INDEX idx_calculation_jobs_property_created ON public.calculation_jobs(property_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.calculation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see jobs for their organization
CREATE POLICY "calculation_jobs_select_policy"
    ON public.calculation_jobs
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
    );

-- RLS Policy: Users can insert jobs for their organization
CREATE POLICY "calculation_jobs_insert_policy"
    ON public.calculation_jobs
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
    );

-- RLS Policy: Users can update jobs for their organization
CREATE POLICY "calculation_jobs_update_policy"
    ON public.calculation_jobs
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
    );

-- RLS Policy: Users can delete jobs for their organization (draft/failed only)
CREATE POLICY "calculation_jobs_delete_policy"
    ON public.calculation_jobs
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
        AND status IN ('pending', 'failed')
    );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calculation_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_calculation_jobs_updated_at
    BEFORE UPDATE ON public.calculation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_calculation_jobs_updated_at();

-- Comment on table
COMMENT ON TABLE public.calculation_jobs IS 'Tracks async reconciliation calculation jobs with progress and results';
COMMENT ON COLUMN public.calculation_jobs.snapshot_ids IS 'JSONB array of UUID strings representing created snapshots';
COMMENT ON COLUMN public.calculation_jobs.force_recalculate IS 'If true, existing draft snapshots were deleted before recalculation';
COMMENT ON COLUMN public.calculation_jobs.error_details IS 'JSONB object with detailed error information including stack traces';
