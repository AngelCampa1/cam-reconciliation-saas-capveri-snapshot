-- Create extraction_jobs table for tracking document extraction jobs
-- Story 15.6: Job Queue Infrastructure (database-backed, no Celery)
-- Story 15.7: Extraction Retry Logic

-- Create enum for job status
CREATE TYPE extraction_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retrying');

-- Create extraction_jobs table
CREATE TABLE public.extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status extraction_job_status NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 5,
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count <= 3),
    error_message TEXT,
    result_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    CONSTRAINT valid_retry_count CHECK (retry_count <= 3)
);

-- Indexes for performance
CREATE INDEX idx_extraction_jobs_status ON public.extraction_jobs(status);
CREATE INDEX idx_extraction_jobs_document_id ON public.extraction_jobs(document_id);
CREATE INDEX idx_extraction_jobs_organization_id ON public.extraction_jobs(organization_id);
CREATE INDEX idx_extraction_jobs_next_retry ON public.extraction_jobs(next_retry_at) WHERE status = 'retrying';

-- Row Level Security
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view org jobs" ON public.extraction_jobs FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users create org jobs" ON public.extraction_jobs FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users update org jobs" ON public.extraction_jobs FOR UPDATE
    USING (organization_id = public.get_user_organization_id());

-- Comment for documentation
COMMENT ON TABLE public.extraction_jobs IS 'Tracks document extraction jobs for async processing with retry logic';
COMMENT ON COLUMN public.extraction_jobs.priority IS 'Job priority (1=highest, 10=lowest), default 5';
COMMENT ON COLUMN public.extraction_jobs.retry_count IS 'Number of retry attempts (max 3)';
COMMENT ON COLUMN public.extraction_jobs.next_retry_at IS 'When to retry this job (exponential backoff: 60s, 120s, 240s)';
COMMENT ON COLUMN public.extraction_jobs.result_data IS 'JSONB containing extracted lease data on success';
