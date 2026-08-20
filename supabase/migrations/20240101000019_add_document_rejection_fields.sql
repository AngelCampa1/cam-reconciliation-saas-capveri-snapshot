-- Migration: Add document rejection tracking fields
-- Story: 16.8 - Create Reject Workflow
-- Purpose: Add fields to track extraction rejections with reasons and notes

-- Extend status enum to include 'rejected'
ALTER TABLE public.documents
    DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'verified', 'rejected'));

-- Add rejection tracking columns
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS rejection_notes TEXT;

-- Add index for rejected_by for audit queries
CREATE INDEX IF NOT EXISTS idx_documents_rejected_by ON public.documents(rejected_by);

-- Add comment for documentation
COMMENT ON COLUMN public.documents.rejected_by IS 'User who rejected the extraction during HITL verification';
COMMENT ON COLUMN public.documents.rejected_at IS 'Timestamp when the extraction was rejected';
COMMENT ON COLUMN public.documents.rejection_reason IS 'Predefined reason code for rejection (poor_ocr_quality, wrong_document_type, etc.)';
COMMENT ON COLUMN public.documents.rejection_notes IS 'Additional notes provided by user explaining rejection';
