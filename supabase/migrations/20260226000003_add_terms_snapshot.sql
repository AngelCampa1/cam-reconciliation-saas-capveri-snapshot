-- Migration: Add Lease Terms Snapshot to Reconciliation Snapshots
-- Description: Freeze the lease terms used at calculation time so
--   reconciliation results remain reproducible even after terms change.
-- Dependencies: 20240101000010_create_reconciliation_snapshots.sql,
--   20260226000001_create_lease_term_versions.sql

ALTER TABLE public.reconciliation_snapshots
    ADD COLUMN lease_terms_snapshot JSONB,
    ADD COLUMN term_version_id UUID REFERENCES public.lease_term_versions(id);

COMMENT ON COLUMN public.reconciliation_snapshots.lease_terms_snapshot IS 'Frozen copy of LeaseTerms used at calculation time for audit';
COMMENT ON COLUMN public.reconciliation_snapshots.term_version_id IS 'Which term version was effective when this reconciliation ran';
