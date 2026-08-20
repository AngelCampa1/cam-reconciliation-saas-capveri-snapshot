-- Migration: Create OCR Results Table
-- Description: Stores parsed OCR results with text blocks, tables, and full-text search
-- Dependencies: 20240101000016_create_documents.sql

-- Create ocr_results table
CREATE TABLE public.ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL CHECK (page_number >= 1),
    text_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    tables JSONB NOT NULL DEFAULT '[]'::jsonb,
    key_value_pairs JSONB NOT NULL DEFAULT '[]'::jsonb,
    full_text TEXT NOT NULL DEFAULT '',
    textract_job_id VARCHAR(255) NOT NULL,
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure unique page per document
    CONSTRAINT unique_document_page UNIQUE (document_id, page_number)
);

-- Create indexes for common queries
CREATE INDEX idx_ocr_results_organization_id ON public.ocr_results(organization_id);
CREATE INDEX idx_ocr_results_document_page ON public.ocr_results(document_id, page_number);
CREATE INDEX idx_ocr_results_textract_job_id ON public.ocr_results(textract_job_id);
CREATE INDEX idx_ocr_results_extracted_at ON public.ocr_results(extracted_at DESC);

-- Full-text search index on extracted content
CREATE INDEX idx_ocr_results_fulltext ON public.ocr_results
    USING GIN (to_tsvector('english', full_text));

-- Apply updated_at trigger
CREATE TRIGGER update_ocr_results_updated_at
    BEFORE UPDATE ON public.ocr_results
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: OCR results are viewable by organization members
CREATE POLICY "OCR results are viewable by organization members"
    ON public.ocr_results
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- RLS Policy: OCR results are insertable by organization members
CREATE POLICY "OCR results are insertable by organization members"
    ON public.ocr_results
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: OCR results are updatable by organization members
CREATE POLICY "OCR results are updatable by organization members"
    ON public.ocr_results
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: OCR results are deletable via cascade from documents only
-- (No direct delete policy - deletion happens via CASCADE from documents)

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE ON public.ocr_results TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.ocr_results IS 'Stores parsed OCR results from Textract with text blocks, tables, and full-text search';
COMMENT ON COLUMN public.ocr_results.id IS 'Unique identifier for the OCR result';
COMMENT ON COLUMN public.ocr_results.document_id IS 'Reference to the source document';
COMMENT ON COLUMN public.ocr_results.organization_id IS 'Organization that owns this OCR result';
COMMENT ON COLUMN public.ocr_results.page_number IS 'Page number within the document (1-indexed)';
COMMENT ON COLUMN public.ocr_results.text_blocks IS 'JSONB array of parsed text blocks with coordinates';
COMMENT ON COLUMN public.ocr_results.tables IS 'JSONB array of extracted tables as row data';
COMMENT ON COLUMN public.ocr_results.key_value_pairs IS 'JSONB array of key-value pairs from forms';
COMMENT ON COLUMN public.ocr_results.full_text IS 'Concatenated text content for full-text search';
COMMENT ON COLUMN public.ocr_results.textract_job_id IS 'AWS Textract job ID that produced these results';
COMMENT ON COLUMN public.ocr_results.extracted_at IS 'When OCR extraction was performed';
COMMENT ON COLUMN public.ocr_results.created_at IS 'When the record was created';
COMMENT ON COLUMN public.ocr_results.updated_at IS 'When the record was last updated';
