-- Migration: Add per-pool recovery breakdown to reconciliation_snapshots
-- Description: Adds an OPTIONAL pool_breakdowns JSONB array to
--              reconciliation_snapshots so a finalized snapshot records the
--              layer-faithful per-pool split of the tenant's recovery (Module A
--              "Produce", story B1.5b Slice 2c). Each element mirrors the
--              calculation engine's PoolRecovery: pool_name, recoverable_amount,
--              is_cap_eligible, is_admin_fee_eligible, share_before_cap,
--              cap_adjustment, share_after_cap, admin_fee, total_recovery.
--              NULL means the snapshot was produced without a per-pool breakdown
--              (no pool input, or a cap reduced the share but pool classification
--              was unavailable so the breakdown was deliberately withheld). The
--              aggregate columns remain the source of truth; this is additive and
--              the per-pool amounts reconcile EXACTLY to total_recovery.
-- Dependencies: 20240101000010_create_reconciliation_snapshots.sql

-- Nullable JSONB: absence is meaningful (aggregate-only snapshot), distinct from
-- an empty array. Default NULL keeps every existing row untouched and behavior
-- byte-for-byte identical until the engine populates it.
ALTER TABLE public.reconciliation_snapshots
    ADD COLUMN pool_breakdowns JSONB;

COMMENT ON COLUMN public.reconciliation_snapshots.pool_breakdowns IS
    'Optional layer-faithful per-pool recovery split (JSONB array of PoolRecovery). '
    'NULL = aggregate-only snapshot (no pool input, or breakdown withheld because a '
    'cap reduced the share without pool classification). Per-pool amounts reconcile '
    'exactly to total_recovery.';
