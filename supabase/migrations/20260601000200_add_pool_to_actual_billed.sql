-- Migration: Add pool dimension to actual_billed_amounts
-- Description: Adds an OPTIONAL pool_id to actual_billed_amounts so charged
--              amounts can be tracked per expense pool (Module B per-pool
--              comparison, story B1.5b Slice 1). NULL means the row is a
--              tenant-level total that is NOT attributed to any single pool.
-- Dependencies: 20240101000061_create_actual_billed.sql, 20240101000008_create_expense_pools.sql

-- Add nullable pool dimension. ON DELETE SET NULL so deleting a pool does not
-- destroy historical billed amounts; the row simply reverts to a tenant total.
ALTER TABLE public.actual_billed_amounts
    ADD COLUMN pool_id UUID REFERENCES public.expense_pools(id) ON DELETE SET NULL;

-- Index for per-pool lookups within a property/period window. Intentionally
-- NOT a UNIQUE constraint: the read path sums duplicate rows by design, so
-- multiple rows for the same (property, period, pool) must remain legal.
CREATE INDEX idx_actual_billed_period_pool
    ON public.actual_billed_amounts(property_id, period_start_date, period_end_date, pool_id);

COMMENT ON COLUMN public.actual_billed_amounts.pool_id IS
    'Optional expense pool this billed amount applies to. NULL = tenant-level total not attributed to a single pool.';
