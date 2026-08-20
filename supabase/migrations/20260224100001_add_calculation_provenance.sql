-- Add calculation provenance fields to reconciliation_snapshots
ALTER TABLE public.reconciliation_snapshots
  ADD COLUMN engine_version VARCHAR(40),
  ADD COLUMN trace_checksum VARCHAR(64);

-- Comment for documentation
COMMENT ON COLUMN public.reconciliation_snapshots.engine_version IS
  'Git SHA of the calculation engine at the time this snapshot was finalized. Used for E&O warranty provenance.';
COMMENT ON COLUMN public.reconciliation_snapshots.trace_checksum IS
  'SHA-256 of the serialized calculation_trace JSON (sorted keys). Proves the trace has not been modified since finalization.';
