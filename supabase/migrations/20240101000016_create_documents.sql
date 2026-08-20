-- Migration: Create Documents Table
-- Description: Stores uploaded documents for OCR processing with S3 references
-- Dependencies: 20240101000003_create_properties.sql

-- Create documents table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    s3_key VARCHAR(1024) NOT NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
    document_type VARCHAR(20) NOT NULL DEFAULT 'lease'
        CHECK (document_type IN ('lease', 'amendment', 'rent_roll', 'gl_export', 'other')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    textract_job_id VARCHAR(255),
    extraction_result JSONB,
    error_message VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    -- Prevent duplicate S3 keys
    CONSTRAINT unique_s3_key UNIQUE (s3_bucket, s3_key)
);

-- Create indexes for common queries
CREATE INDEX idx_documents_organization_id ON public.documents(organization_id);
CREATE INDEX idx_documents_property_id ON public.documents(property_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_document_type ON public.documents(document_type);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);
CREATE INDEX idx_documents_textract_job_id ON public.documents(textract_job_id)
    WHERE textract_job_id IS NOT NULL;

-- Apply updated_at trigger
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Documents are viewable by organization members
CREATE POLICY "Documents are viewable by organization members"
    ON public.documents
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- RLS Policy: Documents are insertable by organization members
CREATE POLICY "Documents are insertable by organization members"
    ON public.documents
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: Documents are updatable by organization members
CREATE POLICY "Documents are updatable by organization members"
    ON public.documents
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: Documents are deletable by admins only
CREATE POLICY "Documents are deletable by admins"
    ON public.documents
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.documents IS 'Stores uploaded documents for OCR processing with S3 references';
COMMENT ON COLUMN public.documents.id IS 'Unique identifier for the document';
COMMENT ON COLUMN public.documents.organization_id IS 'Organization that owns this document';
COMMENT ON COLUMN public.documents.property_id IS 'Property this document is associated with';
COMMENT ON COLUMN public.documents.filename IS 'Original filename of the uploaded file';
COMMENT ON COLUMN public.documents.s3_key IS 'S3 object key for the stored document';
COMMENT ON COLUMN public.documents.s3_bucket IS 'S3 bucket name where document is stored';
COMMENT ON COLUMN public.documents.content_type IS 'MIME type of the document';
COMMENT ON COLUMN public.documents.file_size_bytes IS 'File size in bytes';
COMMENT ON COLUMN public.documents.document_type IS 'Document type: lease, amendment, rent_roll, gl_export, other';
COMMENT ON COLUMN public.documents.status IS 'Processing status: pending, processing, completed, failed';
COMMENT ON COLUMN public.documents.textract_job_id IS 'AWS Textract job ID for async processing';
COMMENT ON COLUMN public.documents.extraction_result IS 'JSONB containing extracted data from OCR';
COMMENT ON COLUMN public.documents.error_message IS 'Error details if processing failed';
COMMENT ON COLUMN public.documents.created_at IS 'When the document was uploaded';
COMMENT ON COLUMN public.documents.updated_at IS 'When the document record was last updated';
COMMENT ON COLUMN public.documents.processed_at IS 'When OCR processing completed';
