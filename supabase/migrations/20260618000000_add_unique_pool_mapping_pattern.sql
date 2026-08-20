-- Enforce one mapping per GL account pattern within each expense pool.
--
-- Older environments may already contain duplicates from the missing
-- constraint. Do not delete financial configuration in a migration; fail the
-- migration so an operator can resolve ambiguous mappings before the invariant
-- is considered deployed.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.pool_mappings
        GROUP BY expense_pool_id, gl_account_pattern
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add unique_pool_mapping_pattern_per_pool because duplicate pool_mappings already exist.';
    ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'unique_pool_mapping_pattern_per_pool'
          AND conrelid = 'public.pool_mappings'::regclass
    ) THEN
        ALTER TABLE public.pool_mappings
            ADD CONSTRAINT unique_pool_mapping_pattern_per_pool
            UNIQUE (expense_pool_id, gl_account_pattern);
    END IF;
END $$;
