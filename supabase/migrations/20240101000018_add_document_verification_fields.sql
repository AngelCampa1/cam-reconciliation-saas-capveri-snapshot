-- Migration: Add Document Verification Fields
-- Description: Extends documents table with verification tracking for HITL workflow
-- Dependencies: 20240101000016_create_documents.sql

-- Add 'verified' to the status enum
ALTER TABLE public.documents
    DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'verified'));

-- Add verification tracking columns
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES public.leases(id) ON DELETE SET NULL;

-- Create index for verified documents
CREATE INDEX IF NOT EXISTS idx_documents_verified_by
    ON public.documents(verified_by)
    WHERE verified_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_lease_id
    ON public.documents(lease_id)
    WHERE lease_id IS NOT NULL;

-- Add documentation comments
COMMENT ON COLUMN public.documents.verified_by IS 'User who approved the extraction (HITL workflow)';
COMMENT ON COLUMN public.documents.verified_at IS 'When the extraction was verified and approved';
COMMENT ON COLUMN public.documents.edit_history IS 'JSONB array of edit actions made during verification';
COMMENT ON COLUMN public.documents.lease_id IS 'Lease record created/updated from this extraction';
