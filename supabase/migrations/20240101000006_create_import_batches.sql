-- Migration: Create Import Batches Table
-- Description: Tracks data import jobs with deduplication and status tracking
-- Dependencies: 20240101000003_create_properties.sql

-- Create import_batches table
CREATE TABLE public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,  -- SHA256 hex string (64 characters)
    source_system VARCHAR(50) NOT NULL
        CHECK (source_system IN ('yardi', 'mri', 'generic')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
    error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate imports within an organization (same file hash)
    CONSTRAINT unique_file_per_org UNIQUE (organization_id, file_hash)
);

-- Create indexes for common queries
CREATE INDEX idx_import_batches_organization_id ON public.import_batches(organization_id);
CREATE INDEX idx_import_batches_property_id ON public.import_batches(property_id);
CREATE INDEX idx_import_batches_status ON public.import_batches(status);
CREATE INDEX idx_import_batches_source_system ON public.import_batches(source_system);
CREATE INDEX idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_import_batches_updated_at
    BEFORE UPDATE ON public.import_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Import batches are viewable by organization members
CREATE POLICY "Import batches are viewable by organization members"
    ON public.import_batches
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- RLS Policy: Import batches are insertable by organization members
CREATE POLICY "Import batches are insertable by organization members"
    ON public.import_batches
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: Import batches are updatable by organization members
CREATE POLICY "Import batches are updatable by organization members"
    ON public.import_batches
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: Import batches are deletable by admins only
CREATE POLICY "Import batches are deletable by admins"
    ON public.import_batches
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.import_batches IS 'Tracks data import jobs with deduplication and status tracking';
COMMENT ON COLUMN public.import_batches.id IS 'Unique identifier for the import batch';
COMMENT ON COLUMN public.import_batches.organization_id IS 'Organization that owns this import batch';
COMMENT ON COLUMN public.import_batches.property_id IS 'Property this import is associated with';
COMMENT ON COLUMN public.import_batches.file_name IS 'Original filename of the imported file';
COMMENT ON COLUMN public.import_batches.file_hash IS 'SHA256 hash of file contents for deduplication (64 hex characters)';
COMMENT ON COLUMN public.import_batches.source_system IS 'Source system type: yardi, mri, or generic';
COMMENT ON COLUMN public.import_batches.status IS 'Import status: pending, processing, completed, or failed';
COMMENT ON COLUMN public.import_batches.row_count IS 'Number of rows successfully processed';
COMMENT ON COLUMN public.import_batches.error_count IS 'Number of rows that failed to process';
COMMENT ON COLUMN public.import_batches.error_log IS 'JSONB array of error details for failed rows';
COMMENT ON COLUMN public.import_batches.created_at IS 'When the import batch was created';
COMMENT ON COLUMN public.import_batches.updated_at IS 'When the import batch was last updated';
