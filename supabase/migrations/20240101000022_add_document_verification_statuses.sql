-- Migration: Add Document Verification Statuses
-- Description: Add READY_FOR_REVIEW, VERIFIED, REJECTED statuses to documents table
-- Dependencies: 20240101000016_create_documents.sql

-- Drop the old status constraint
ALTER TABLE public.documents
    DROP CONSTRAINT IF EXISTS documents_status_check;

-- Add new status constraint with verification workflow statuses
ALTER TABLE public.documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'ready_for_review', 'verified', 'rejected'));

-- Add documentation
COMMENT ON COLUMN public.documents.status IS 'Document processing status: pending (uploaded), processing (OCR in progress), completed (OCR done), failed (OCR failed), ready_for_review (awaiting human verification), verified (approved by human), rejected (rejected by human)';
